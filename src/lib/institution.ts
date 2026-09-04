/**
 * Institution & B2B Cohort Hub Aggregation Engine
 *
 * Provides cohort-level analytics for Universities, Schools, and Organizations.
 * Enforces k-anonymity (k >= 5 threshold) to safeguard student privacy:
 * when a cohort has fewer than 5 students, individual identifiers and breakdowns
 * are suppressed, and only aggregated ranges/summaries are reported.
 */

import { UserProfile, CognitiveLevel, AccessibilityMode } from '../types';
import { calculateCGPA } from './gpa';

/**
 * Anonymized student record within a cohort summary.
 * Only available when cohort size meets the k-anonymity threshold (k >= 5).
 */
export interface InstitutionCohortStudentSummary {
  uid: string;
  name: string;
  emailMasked: string;
  cognitiveLevel: CognitiveLevel;
  accessibilityMode: AccessibilityMode;
  points: number;
  gpa: number | null;
  lastActiveIso?: string;
  isActive: boolean;
}

/**
 * Aggregated analytics and metrics for an institutional cohort.
 */
export interface InstitutionCohortStats {
  orgCode: string;
  totalStudents: number;
  activeStudents: number;
  activeRate: number; // percentage (0 - 100)
  averagePoints: number;
  cognitiveLevelDistribution: Record<CognitiveLevel, number>;
  accessibilityModeBreakdown: {
    Vision: number;
    Motor: number;
    Deaf: number;
    Vocal: number;
    None: number;
    Other: number;
  };
  accessibilityAdoptionRate: number; // percentage of non-None accessibility modes (0 - 100)
  averageGpa: number | null;
  kAnonymitySuppressed: boolean;
  kThreshold: number; // 5
  students: InstitutionCohortStudentSummary[]; // suppressed (empty) when k < 5
  aggregatedPointRange?: { min: number; max: number };
  aggregatedGpaRange?: { min: number; max: number } | null;
}

/** The minimum number of subjects required to expose individual breakdowns under k-anonymity */
export const K_ANONYMITY_THRESHOLD = 5;

/**
 * Safely masks an email address to protect privacy (e.g. j***e@university.edu)
 */
export function maskEmail(email?: string): string {
  if (!email || !email.includes('@')) return 'anonymous@institution.edu';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Extracts the latest activity ISO timestamp for a user.
 */
export function getUserLastActiveIso(u: UserProfile): string | undefined {
  const ts = [
    u.lastActiveDate,
    u.lastQuizDate,
    u.lastGymDate,
    ...(u.chatThreads || []).map((t) => t.updatedAt),
  ].filter(Boolean) as string[];

  if (ts.length === 0) return undefined;
  return ts.reduce((latest, curr) => (new Date(curr).getTime() > new Date(latest).getTime() ? curr : latest));
}

/**
 * Determines whether a student is considered active (signal within last 7 days).
 */
export function isStudentActive(u: UserProfile, activeDaysWindow = 7): boolean {
  const iso = getUserLastActiveIso(u);
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (isNaN(time)) return false;
  const daysDiff = (Date.now() - time) / (1000 * 60 * 60 * 24);
  return daysDiff <= activeDaysWindow;
}

/**
 * Extracts student GPA if academic records or direct GPA fields exist.
 */
export function extractStudentGpa(u: UserProfile): number | null {
  const rawGpa = (u as any).gpa ?? (u as any).cgpa;
  if (typeof rawGpa === 'number' && !isNaN(rawGpa) && rawGpa >= 0) {
    return Math.round(rawGpa * 100) / 100;
  }
  if (Array.isArray((u as any).courses) && (u as any).courses.length > 0) {
    const computed = calculateCGPA((u as any).courses);
    return computed > 0 ? computed : null;
  }
  return null;
}

/**
 * Aggregates cohort metrics across enrolled users with k-anonymity privacy protection.
 *
 * @param users All user profiles to evaluate.
 * @param orgCode Optional organization or university identifier to filter by.
 * @returns Aggregated InstitutionCohortStats.
 */
export function computeCohortAnalytics(users: UserProfile[], orgCode?: string): InstitutionCohortStats {
  const normalizedOrg = (orgCode || '').trim().toLowerCase();

  // Filter students belonging to this organization or university cohort if specified
  const cohortUsers = normalizedOrg
    ? users.filter((u) => {
        const uOrg = (u.organization || '').trim().toLowerCase();
        const uUni = (u.university || '').trim().toLowerCase();
        return uOrg === normalizedOrg || uUni === normalizedOrg;
      })
    : [...users];

  const totalStudents = cohortUsers.length;
  const kAnonymitySuppressed = totalStudents < K_ANONYMITY_THRESHOLD;

  let activeCount = 0;
  let totalPoints = 0;
  const gpaValues: number[] = [];
  const pointValues: number[] = [];

  const cognitiveLevelDistribution: Record<CognitiveLevel, number> = {
    Basic: 0,
    Intermediate: 0,
    Advanced: 0,
  };

  const accessibilityModeBreakdown = {
    Vision: 0,
    Motor: 0,
    Deaf: 0,
    Vocal: 0,
    None: 0,
    Other: 0,
  };

  const studentSummaries: InstitutionCohortStudentSummary[] = [];

  for (const u of cohortUsers) {
    // Cognitive level count
    const level: CognitiveLevel = u.level === 'Advanced' || u.level === 'Intermediate' ? u.level : 'Basic';
    cognitiveLevelDistribution[level]++;

    // Accessibility mode mapping
    const mode = u.accessibilityMode;
    if (!mode || mode === 'None') {
      accessibilityModeBreakdown.None++;
    } else if (mode === 'Visual') {
      accessibilityModeBreakdown.Vision++;
    } else if (mode === 'Motor-Euphonia') {
      accessibilityModeBreakdown.Motor++;
    } else if (mode === 'Sign-Only' || mode === 'Vocal-Deaf') {
      accessibilityModeBreakdown.Deaf++;
    } else if (mode === 'Speech') {
      accessibilityModeBreakdown.Vocal++;
    } else {
      accessibilityModeBreakdown.Other++;
    }

    // Mastery points
    const points = typeof u.points === 'number' ? u.points : 0;
    totalPoints += points;
    pointValues.push(points);

    // Active status
    const active = isStudentActive(u);
    if (active) activeCount++;

    // GPA
    const gpa = extractStudentGpa(u);
    if (gpa !== null) gpaValues.push(gpa);

    // If k-anonymity is satisfied, build student summary
    if (!kAnonymitySuppressed) {
      studentSummaries.push({
        uid: u.uid,
        name: u.name || (u.email ? u.email.split('@')[0] : 'Student'),
        emailMasked: maskEmail(u.email),
        cognitiveLevel: level,
        accessibilityMode: mode || 'None',
        points,
        gpa,
        lastActiveIso: getUserLastActiveIso(u),
        isActive: active,
      });
    }
  }

  // Active rate
  const activeRate = totalStudents > 0 ? Math.round((activeCount / totalStudents) * 1000) / 10 : 0;

  // Average points
  const averagePoints = totalStudents > 0 ? Math.round((totalPoints / totalStudents) * 10) / 10 : 0;

  // Accessibility adoption rate
  const nonNoneModes = totalStudents - accessibilityModeBreakdown.None;
  const accessibilityAdoptionRate = totalStudents > 0
    ? Math.round((nonNoneModes / totalStudents) * 1000) / 10
    : 0;

  // Average GPA
  const averageGpa = gpaValues.length > 0
    ? Math.round((gpaValues.reduce((sum, g) => sum + g, 0) / gpaValues.length) * 100) / 100
    : null;

  // Aggregated ranges for privacy protection
  const aggregatedPointRange = pointValues.length > 0
    ? { min: Math.min(...pointValues), max: Math.max(...pointValues) }
    : { min: 0, max: 0 };

  const aggregatedGpaRange = gpaValues.length > 0
    ? { min: Math.min(...gpaValues), max: Math.max(...gpaValues) }
    : null;

  return {
    orgCode: orgCode || 'ALL_INSTITUTIONS',
    totalStudents,
    activeStudents: activeCount,
    activeRate,
    averagePoints,
    cognitiveLevelDistribution,
    accessibilityModeBreakdown,
    accessibilityAdoptionRate,
    averageGpa,
    kAnonymitySuppressed,
    kThreshold: K_ANONYMITY_THRESHOLD,
    students: studentSummaries,
    aggregatedPointRange,
    aggregatedGpaRange,
  };
}

/**
 * Escapes a field for safe CSV output (handles commas, quotes, and newlines).
 */
function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Generates a clean, regulatory-compliant CSV export for university administrators.
 * Respects k-anonymity by omitting individual student rows when k < 5.
 */
export function exportCohortCsv(stats: InstitutionCohortStats): string {
  const lines: string[] = [];

  // Report Header
  lines.push('Cognify Institution & B2B Cohort Report');
  lines.push(`Generated At,${escapeCsv(new Date().toISOString())}`);
  lines.push(`Institution / Org Code,${escapeCsv(stats.orgCode)}`);
  lines.push(`k-Anonymity Threshold,${stats.kThreshold}`);
  lines.push(`k-Anonymity Status,${escapeCsv(
    stats.kAnonymitySuppressed
      ? 'ACTIVE (Cohort size < 5: Individual breakdown suppressed for student privacy)'
      : 'SATISFIED (Cohort size >= 5: Individual roster included)'
  )}`);
  lines.push('');

  // Key Metrics
  lines.push('--- COHORT KEY PERFORMANCE INDICATORS ---');
  lines.push(`Metric,Value`);
  lines.push(`Total Enrolled Students,${stats.totalStudents}`);
  lines.push(`Active Learners (7-day window),${stats.activeStudents}`);
  lines.push(`Active Rate (%),${stats.activeRate}%`);
  lines.push(`Accessibility Adoption (%),${stats.accessibilityAdoptionRate}%`);
  lines.push(`Average Mastery Points,${stats.averagePoints}`);
  if (stats.aggregatedPointRange) {
    lines.push(`Mastery Points Range,${escapeCsv(`${stats.aggregatedPointRange.min} - ${stats.aggregatedPointRange.max}`)}`);
  }
  lines.push(`Average Cumulative GPA,${stats.averageGpa !== null ? stats.averageGpa : 'N/A'}`);
  if (stats.aggregatedGpaRange) {
    lines.push(`GPA Range,${escapeCsv(`${stats.aggregatedGpaRange.min} - ${stats.aggregatedGpaRange.max}`)}`);
  }
  lines.push('');

  // Cognitive Level Breakdown
  lines.push('--- COGNITIVE LEVEL DISTRIBUTION ---');
  lines.push(`Level,Student Count,Percentage`);
  const total = Math.max(stats.totalStudents, 1);
  const basicPct = Math.round((stats.cognitiveLevelDistribution.Basic / total) * 1000) / 10;
  const interPct = Math.round((stats.cognitiveLevelDistribution.Intermediate / total) * 1000) / 10;
  const advPct = Math.round((stats.cognitiveLevelDistribution.Advanced / total) * 1000) / 10;
  lines.push(`Basic,${stats.cognitiveLevelDistribution.Basic},${basicPct}%`);
  lines.push(`Intermediate,${stats.cognitiveLevelDistribution.Intermediate},${interPct}%`);
  lines.push(`Advanced,${stats.cognitiveLevelDistribution.Advanced},${advPct}%`);
  lines.push('');

  // Accessibility Modes
  lines.push('--- ACCESSIBILITY MODES UTILIZED ---');
  lines.push(`Mode,Student Count,Percentage`);
  const modes = stats.accessibilityModeBreakdown;
  lines.push(`Vision (Visual Accommodations),${modes.Vision},${Math.round((modes.Vision / total) * 1000) / 10}%`);
  lines.push(`Motor (Motor & Euphonia Assistive),${modes.Motor},${Math.round((modes.Motor / total) * 1000) / 10}%`);
  lines.push(`Deaf (Sign Avatar / Vocal-Deaf),${modes.Deaf},${Math.round((modes.Deaf / total) * 1000) / 10}%`);
  lines.push(`Vocal (Speech & Transcription),${modes.Vocal},${Math.round((modes.Vocal / total) * 1000) / 10}%`);
  lines.push(`None (Standard Interface),${modes.None},${Math.round((modes.None / total) * 1000) / 10}%`);
  if (modes.Other > 0) {
    lines.push(`Other,${modes.Other},${Math.round((modes.Other / total) * 1000) / 10}%`);
  }
  lines.push('');

  // Student Breakdown Table (Only if k >= 5)
  lines.push('--- INDIVIDUAL STUDENT ROSTER ---');
  if (stats.kAnonymitySuppressed) {
    lines.push('Notice,Individual student breakdown is suppressed to prevent re-identification under k-anonymity (cohort size < 5).');
  } else {
    lines.push(`UID,Name,Masked Email,Cognitive Level,Accessibility Mode,Mastery Points,GPA,Status,Last Active`);
    for (const s of stats.students) {
      lines.push([
        escapeCsv(s.uid),
        escapeCsv(s.name),
        escapeCsv(s.emailMasked),
        escapeCsv(s.cognitiveLevel),
        escapeCsv(s.accessibilityMode),
        s.points,
        s.gpa !== null ? s.gpa : 'N/A',
        escapeCsv(s.isActive ? 'Active' : 'Idle'),
        escapeCsv(s.lastActiveIso ? s.lastActiveIso.split('T')[0] : 'Never'),
      ].join(','));
    }
  }

  return lines.join('\r\n');
}
