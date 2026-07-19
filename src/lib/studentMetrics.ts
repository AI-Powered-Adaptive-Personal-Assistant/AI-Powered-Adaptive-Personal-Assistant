/**
 * studentMetrics.ts — deterministic Academic Intelligence engine.
 *
 * These are PURE functions (no Firestore, no LLM) so scores are stable across
 * reloads and unit-testable, per the spec: "KPI scores come from formulas, NOT
 * the LLM. The LLM only explains, recommends, and converses."
 *
 * Every metric returns an Explainable-AI result: { value, state, confidence,
 * topFactors, improvementActions }. When there isn't enough data to be honest,
 * it returns state 'calibrating' or 'no-data' instead of a fabricated number
 * (the spec's cold-start rule).
 *
 * Grounded in the app's ACTUAL data model (src/types.ts): Course, GoalAttendance
 * Subject, Goal, PlannerTask, and profile.questionHistory. Metrics that would
 * require data we don't collect (study sessions, focus scores, retention logs)
 * are explicitly returned as 'no-data' rather than guessed.
 */
import { Course, AttendanceSubject, Goal, PlannerTask } from '../types';
import { calculateCGPA, calculateGPA, semestersOf, totalCredits, GRADE_POINTS } from './gpa';
import { attendancePct } from './attendance';

export type MetricState = 'ok' | 'calibrating' | 'no-data';
export interface Factor { label: string; effect: '+' | '-' | '•'; }
export interface MetricResult {
  /** Native scale of the metric (0–100 unless noted). */
  value: number;
  state: MetricState;
  /** 0–1. Lower when data is sparse. */
  confidence: number;
  topFactors: Factor[];
  improvementActions: string[];
  note?: string;
}

export interface MetricsInput {
  courses: Course[];
  subjects: AttendanceSubject[];
  goals: Goal[];
  tasks: PlannerTask[];
  questionHistory: { score: number; date: string }[];
  /** Injectable clock for deterministic tests. Defaults to Date.now(). */
  now?: number;
}

// ── math helpers ────────────────────────────────────────────────────────────
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const clamp01 = (n: number) => clamp(n, 0, 1);
const round = (n: number) => Math.round(n);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdDev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const logistic = (z: number) => 1 / (1 + Math.exp(-z));
const DAY = 86_400_000;
const daysBetween = (aIso: string, b: number) => (b - +new Date(aIso)) / DAY;

/** Bucket questionHistory into per-day activity counts over the last `days`. */
function dailyActivity(history: { date: string }[], now: number, days = 30): number[] {
  const buckets = new Array(days).fill(0);
  for (const h of history) {
    const d = Math.floor((now - +new Date(h.date)) / DAY);
    if (d >= 0 && d < days) buckets[days - 1 - d] += 1;
  }
  return buckets;
}

/** Active days in the last `days` — the core cold-start signal. */
function activeDays(history: { date: string }[], now: number, days = 14): number {
  return dailyActivity(history, now, days).filter((c) => c > 0).length;
}

// ── S13/health building blocks ──────────────────────────────────────────────

/** Consistency = 1 − (stdDev/mean) of daily activity, clamped to 0–100. */
export function consistencyScore(input: MetricsInput): MetricResult {
  const now = input.now ?? Date.now();
  const acts = dailyActivity(input.questionHistory, now, 30);
  const active = acts.filter((c) => c > 0).length;
  if (active < 3) {
    return {
      value: 0, state: 'calibrating', confidence: 0.2,
      topFactors: [{ label: 'Not enough activity yet', effect: '•' }],
      improvementActions: ['Study a little every day for a week to calibrate your consistency.'],
      note: 'Calibrating — needs ~7 days of activity.',
    };
  }
  const m = mean(acts);
  const cv = m > 0 ? stdDev(acts) / m : 1;
  const value = round(clamp01(1 - cv) * 100);
  return {
    value, state: 'ok', confidence: clamp01(active / 14),
    topFactors: [
      { label: `${active} active days in the last 30`, effect: value >= 60 ? '+' : '-' },
      { label: value >= 60 ? 'Even study rhythm' : 'Uneven study rhythm (bursts then gaps)', effect: value >= 60 ? '+' : '-' },
    ],
    improvementActions: value >= 60
      ? ['Keep your daily rhythm — it is your biggest momentum driver.']
      : ['Aim for shorter, daily sessions instead of occasional long ones.'],
  };
}

/** Engagement proxy from recency + frequency of activity (0–100). */
function engagementValue(input: MetricsInput): number {
  const now = input.now ?? Date.now();
  const freq = activeDays(input.questionHistory, now, 14) / 14; // 0–1
  const last = input.questionHistory.length
    ? Math.min(...input.questionHistory.map((h) => Math.max(0, daysBetween(h.date, now))))
    : 99;
  const recency = clamp01(1 - last / 7); // full credit if active in last day, 0 by a week
  return round(clamp01(0.6 * freq + 0.4 * recency) * 100);
}

// ── S1/S13 Academic Health Score ────────────────────────────────────────────

/**
 * Academic Health Score (0–100) =
 * 0.30·grade + 0.20·attendance + 0.20·completion + 0.15·consistency + 0.15·engagement
 */
export function academicHealthScore(input: MetricsInput): MetricResult {
  const { courses, subjects, tasks } = input;
  const hasAny = courses.length || subjects.length || tasks.length || input.questionHistory.length;
  if (!hasAny) {
    return {
      value: 0, state: 'no-data', confidence: 0,
      topFactors: [{ label: 'No academic data yet', effect: '•' }],
      improvementActions: ['Add your courses, attendance, and a goal to unlock your health score.'],
      note: 'Add data to begin.',
    };
  }
  const gradeNorm = courses.length ? clamp01(calculateCGPA(courses) / 4) * 100 : 0;
  const attendanceNorm = subjects.length ? mean(subjects.map(attendancePct)) : 0;
  const completionNorm = tasks.length ? (tasks.filter((t) => t.completed).length / tasks.length) * 100 : 0;
  const consistency = consistencyScore(input).value;
  const engagement = engagementValue(input);

  // Only score dimensions the student actually has data for, then renormalize
  // the weights across the present ones. Otherwise an absent dimension (e.g. the
  // retired Attendance section, which leaves `subjects` empty) would count as a
  // hard 0 and silently cap the score / give permanent "fix attendance" advice.
  const allParts: { label: string; norm: number; w: number; present: boolean }[] = [
    { label: 'Grades', norm: gradeNorm, w: 0.3, present: courses.length > 0 },
    { label: 'Attendance', norm: attendanceNorm, w: 0.2, present: subjects.length > 0 },
    { label: 'Task completion', norm: completionNorm, w: 0.2, present: tasks.length > 0 },
    { label: 'Consistency', norm: consistency, w: 0.15, present: input.questionHistory.length > 0 },
    { label: 'Engagement', norm: engagement, w: 0.15, present: input.questionHistory.length > 0 },
  ];
  const parts = allParts.filter((p) => p.present);
  const totalW = parts.reduce((s, p) => s + p.w, 0) || 1;
  const value = round(parts.reduce((s, p) => s + p.w * p.norm, 0) / totalW);

  // Explainability: rank parts by weighted contribution to flag best/worst.
  const ranked = [...parts].sort((a, b) => b.norm - a.norm);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const dataCoverage = [courses.length, subjects.length, tasks.length].filter(Boolean).length / 3;

  return {
    value,
    state: dataCoverage < 0.34 ? 'calibrating' : 'ok',
    confidence: clamp01(0.4 + 0.6 * dataCoverage),
    topFactors: [
      { label: `${best.label} strong (${round(best.norm)})`, effect: '+' },
      { label: `${worst.label} needs work (${round(worst.norm)})`, effect: '-' },
    ],
    improvementActions: [
      worst.label === 'Attendance' ? 'Protect your attendance — it is dragging your score down.'
        : worst.label === 'Grades' ? 'Target your weakest course for the next study block.'
        : worst.label === 'Task completion' ? 'Clear 2–3 pending tasks to lift completion.'
        : worst.label === 'Consistency' ? 'Study a little every day to smooth your rhythm.'
        : 'Check in daily to keep engagement up.',
    ],
    note: dataCoverage < 0.34 ? 'Calibrating — add more academic data for a confident score.' : undefined,
  };
}

// ── S3 Learning Momentum ─────────────────────────────────────────────────────

/** Momentum (0–100): rolling 14-day score avg vs the prior 14 days. 50 = flat. */
export function learningMomentum(input: MetricsInput): MetricResult {
  const now = input.now ?? Date.now();
  const recent = input.questionHistory.filter((h) => daysBetween(h.date, now) <= 14);
  const prior = input.questionHistory.filter((h) => {
    const d = daysBetween(h.date, now);
    return d > 14 && d <= 28;
  });
  if (recent.length < 2 || prior.length < 1) {
    return {
      value: 50, state: 'calibrating', confidence: 0.25,
      topFactors: [{ label: 'Need ~2 weeks of activity to measure trend', effect: '•' }],
      improvementActions: ['Keep practicing — momentum unlocks after two weeks of data.'],
      note: 'Calibrating.',
    };
  }
  const delta = mean(recent.map((h) => h.score)) - mean(prior.map((h) => h.score));
  // Map a ±20-point swing to the full 0–100 range around a neutral 50.
  const value = round(clamp(50 + (delta / 20) * 50, 0, 100));
  const trend = value > 55 ? 'Improving' : value < 45 ? 'Declining' : 'Stable';
  return {
    value, state: 'ok', confidence: clamp01((recent.length + prior.length) / 12),
    topFactors: [
      { label: `${trend} vs the previous 2 weeks (${delta >= 0 ? '+' : ''}${round(delta)} pts)`, effect: delta >= 0 ? '+' : '-' },
    ],
    improvementActions: value >= 55
      ? ['You are trending up — keep the current routine.']
      : ['Add one focused session this week to reverse the dip.'],
    note: trend,
  };
}

// ── S10 Predicted GPA (formula + trend, wide CI when sparse) ──────────────────

export function predictedGPA(input: MetricsInput): MetricResult {
  const { courses } = input;
  if (!courses.length) {
    return {
      value: 0, state: 'no-data', confidence: 0,
      topFactors: [{ label: 'No courses added', effect: '•' }],
      improvementActions: ['Add your courses and grades to project your GPA.'],
    };
  }
  const baseline = calculateCGPA(courses); // weighted current grades, 0–4
  const sems = semestersOf(courses);
  // Trend = slope across semester GPAs (most recent minus earliest, normalized).
  let trendAdj = 0;
  if (sems.length >= 2) {
    const perSem = sems.map((s) => calculateGPA(courses.filter((c) => (c.semester || 'Unspecified') === s)));
    // semestersOf returns newest-first (courses arrive orderBy createdAt desc), so
    // perSem[0] is the MOST RECENT semester and the last is the earliest. Trend =
    // most-recent minus earliest, matching the comment above — do NOT flip these,
    // or an improving student is scored as declining.
    trendAdj = clamp((perSem[0] - perSem[perSem.length - 1]) / (perSem.length - 1), -0.3, 0.3);
  }
  const value = clamp(baseline + trendAdj, 0, 4);
  // Confidence widens (lower) with few courses / one semester.
  const confidence = clamp01(0.4 + 0.1 * Math.min(courses.length, 4) + (sems.length >= 2 ? 0.2 : 0));
  const ci = round((1 - confidence) * 0.4 * 100) / 100; // ± on GPA scale
  return {
    value: Math.round(value * 100) / 100,
    state: courses.length < 3 ? 'calibrating' : 'ok',
    confidence,
    topFactors: [
      { label: `Current weighted grades → ${baseline.toFixed(2)}`, effect: '+' },
      { label: trendAdj >= 0 ? `Upward semester trend (+${trendAdj.toFixed(2)})` : `Downward trend (${trendAdj.toFixed(2)})`, effect: trendAdj >= 0 ? '+' : '-' },
    ],
    improvementActions: [
      'Focus credits-heavy courses first — they move GPA the most.',
    ],
    note: `Projected ${value.toFixed(2)} ± ${ci.toFixed(2)}${courses.length < 3 ? ' (calibrating)' : ''}`,
  };
}

// ── S9 Goal Success Probability ───────────────────────────────────────────────

export function goalSuccessProbability(goal: Goal, now = Date.now()): MetricResult {
  const daysRemaining = Math.max(0, daysBetween(goal.deadline, now) * -1); // deadline in future → positive
  const daysElapsed = Math.max(1, daysBetween(goal.createdAt, now));
  if (goal.status === 'completed') {
    return { value: 100, state: 'ok', confidence: 1, topFactors: [{ label: 'Goal completed', effect: '+' }], improvementActions: [] };
  }
  const requiredRate = daysRemaining > 0 ? (100 - goal.progress) / daysRemaining : Infinity; // %/day needed
  const actualRate = goal.progress / daysElapsed; // %/day observed
  const prob = daysRemaining <= 0
    ? (goal.progress >= 100 ? 1 : 0)
    : logistic(2.5 * (actualRate - requiredRate));
  const value = round(prob * 100);
  return {
    value,
    state: daysElapsed < 3 ? 'calibrating' : 'ok',
    confidence: clamp01(daysElapsed / 14),
    topFactors: [
      { label: `${goal.progress}% done, ${round(daysRemaining)}d left`, effect: value >= 50 ? '+' : '-' },
      { label: `Pace ${actualRate.toFixed(1)}%/day vs ${isFinite(requiredRate) ? requiredRate.toFixed(1) : '∞'}%/day needed`, effect: actualRate >= requiredRate ? '+' : '-' },
    ],
    improvementActions: value >= 50
      ? ['On track — keep your current pace.']
      : [`Complete one milestone in the next ${Math.max(1, round(daysRemaining / Math.max(1, (goal.milestones || []).length)))} days to get back on track.`],
  };
}

// ── S1 Success Probability (logistic over health, momentum, goal gap) ─────────

export function successProbability(input: MetricsInput): MetricResult {
  const health = academicHealthScore(input);
  const momentum = learningMomentum(input);
  if (health.state === 'no-data') {
    return { value: 0, state: 'no-data', confidence: 0, topFactors: health.topFactors, improvementActions: health.improvementActions };
  }
  const activeGoals = input.goals.filter((g) => g.status !== 'completed');
  const goalGap = activeGoals.length ? mean(activeGoals.map((g) => (100 - g.progress) / 100)) : 0.3;
  const z = 0.04 * (health.value - 60) + 0.03 * (momentum.value - 50) - 1.2 * goalGap;
  const value = round(logistic(z) * 100);
  return {
    value,
    state: health.state === 'calibrating' || momentum.state === 'calibrating' ? 'calibrating' : 'ok',
    confidence: clamp01((health.confidence + momentum.confidence) / 2),
    topFactors: [
      { label: `Health ${health.value}/100`, effect: health.value >= 60 ? '+' : '-' },
      { label: `Momentum ${momentum.value}/100`, effect: momentum.value >= 50 ? '+' : '-' },
      { label: `Goal gap ${round(goalGap * 100)}%`, effect: goalGap <= 0.3 ? '+' : '-' },
    ],
    improvementActions: value >= 60
      ? ['You are positioned well — protect your routine.']
      : ['Close your biggest goal gap and target your weakest subject this week.'],
  };
}

// ── S23 Focus Priority = Impact × WeaknessGap × DeadlineUrgency × GPAInfluence ─

export interface FocusItem { label: string; score: number; reason: string; }

export function focusPriorities(input: MetricsInput): FocusItem[] {
  const { courses, tasks } = input;
  const now = input.now ?? Date.now();
  const credits = totalCredits(courses) || 1;
  const items: FocusItem[] = [];

  for (const c of courses) {
    const gp = GRADE_POINTS[c.grade] ?? 2;
    const weaknessGap = clamp01((4 - gp) / 4);            // worse grade → bigger gap
    const gpaInfluence = clamp01(c.credits / credits);    // heavier course → more leverage
    // Deadline urgency from the nearest pending task in this course.
    const courseTasks = tasks.filter((t) => !t.completed && t.course === c.name);
    const nearest = courseTasks.length ? Math.min(...courseTasks.map((t) => Math.max(0, daysBetween(t.dueDate, now) * -1))) : 30;
    const deadlineUrgency = clamp01(1 - nearest / 30);
    const impact = 0.5 + weaknessGap;                     // weak + urgent = high impact
    const score = round(impact * weaknessGap * (0.5 + deadlineUrgency) * (0.5 + gpaInfluence) * 100);
    items.push({
      label: c.name,
      score,
      reason: weaknessGap > 0.4 ? `Weak grade (${c.grade}) in a ${c.credits}-credit course` : `Maintain ${c.grade} in a ${c.credits}-credit course`,
    });
  }
  return items.sort((a, b) => b.score - a.score).slice(0, 5);
}

// ── S17 Forgetting Curve (Ebbinghaus): R = e^(−t/S) ───────────────────────────

/** Projected recall (0–1) `daysSince` learning, given memory stability S (days). */
export function recallProbability(daysSince: number, stabilityDays = 5): number {
  return clamp01(Math.exp(-Math.max(0, daysSince) / Math.max(0.5, stabilityDays)));
}

/** Topics whose projected recall has dropped below `threshold` → review now. */
export function topicsNeedingReview(
  topics: { topic: string; learnedAt: string; stabilityDays?: number }[],
  now = Date.now(),
  threshold = 0.7,
): { topic: string; recall: number }[] {
  return topics
    .map((t) => ({ topic: t.topic, recall: recallProbability(daysBetween(t.learnedAt, now), t.stabilityDays) }))
    .filter((t) => t.recall < threshold)
    .sort((a, b) => a.recall - b.recall);
}

// ── Metrics requiring data we don't yet collect (honest 'no-data') ────────────
// Productivity (S2), Burnout (S12), Efficiency (S22) need StudySession / focus /
// deep-work logs. Until those are tracked, return 'no-data' so the UI shows a
// "start tracking study sessions" prompt instead of a fabricated number.
const NEEDS_SESSIONS = (label: string): MetricResult => ({
  value: 0, state: 'no-data', confidence: 0,
  topFactors: [{ label: `${label} needs study-session tracking`, effect: '•' }],
  improvementActions: ['Log study sessions (start/end + focus) to unlock this metric.'],
  note: 'Not tracked yet.',
});
export const productivityScore = () => NEEDS_SESSIONS('Productivity');
export const burnoutRisk = () => NEEDS_SESSIONS('Burnout risk');
export const learningEfficiencyIndex = () => NEEDS_SESSIONS('Learning efficiency');

// ── S1 overall status label ───────────────────────────────────────────────────
export type AcademicStatus = 'High Performance' | 'On Track' | 'Needs Attention' | 'At Risk';
export function academicStatus(health: number, success: number): AcademicStatus {
  if (health >= 80 && success >= 70) return 'High Performance';
  if (health >= 65) return 'On Track';
  if (health >= 45) return 'Needs Attention';
  return 'At Risk';
}
