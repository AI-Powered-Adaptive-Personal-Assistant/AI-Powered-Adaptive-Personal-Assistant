/**
 * Spaced Repetition & Longitudinal Retention Engine (Points 29 & 30)
 * Uses the SuperMemo-2 / Ebbinghaus forgetting curve intervals
 * to reinforce concept retention over time (1d -> 3d -> 7d -> 21d -> 60d).
 */

export interface RetentionSchedule {
  conceptId: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number; // Defaults to 2.5, clamped to min 1.3
  lastReviewDate: number; // Unix ms
  nextReviewDate: number; // Unix ms
  status: 'new' | 'learning' | 'retained' | 'regressed';
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function createInitialRetentionSchedule(conceptId: string): RetentionSchedule {
  const now = Date.now();
  return {
    conceptId,
    repetitions: 0,
    intervalDays: 1,
    easeFactor: 2.5,
    lastReviewDate: now,
    nextReviewDate: now + ONE_DAY_MS,
    status: 'new',
  };
}

/**
 * Calculates the next review date and interval based on SM-2 algorithm.
 * @param current Current retention schedule
 * @param quality Score from 0 (complete blackout) to 5 (perfect recall)
 */
export function calculateNextReview(
  current: RetentionSchedule,
  quality: number // 0 to 5
): RetentionSchedule {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { repetitions, intervalDays, easeFactor } = current;

  // Adjust Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  let status: RetentionSchedule['status'] = current.status;

  if (q < 3) {
    // Failure / Regression: Reset repetitions
    repetitions = 0;
    intervalDays = 1;
    status = 'regressed';
  } else {
    // Successful recall
    if (repetitions === 0) {
      intervalDays = 1;
      status = 'learning';
    } else if (repetitions === 1) {
      intervalDays = 3;
      status = 'learning';
    } else if (repetitions === 2) {
      intervalDays = 7;
      status = 'learning';
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
      status = 'retained';
    }
    repetitions += 1;
  }

  const now = Date.now();
  return {
    conceptId: current.conceptId,
    repetitions,
    intervalDays,
    easeFactor: Math.round(easeFactor * 100) / 100,
    lastReviewDate: now,
    nextReviewDate: now + intervalDays * ONE_DAY_MS,
    status,
  };
}

/**
 * Checks if a concept schedule has reached its review threshold.
 */
export function isDueForReview(schedule: RetentionSchedule, now: number = Date.now()): boolean {
  return now >= schedule.nextReviewDate;
}

/**
 * Filters a map of schedules to return concept IDs that are due for review.
 */
export function getDueConcepts(
  schedules: Record<string, RetentionSchedule>,
  now: number = Date.now()
): RetentionSchedule[] {
  return Object.values(schedules).filter((s) => isDueForReview(s, now));
}