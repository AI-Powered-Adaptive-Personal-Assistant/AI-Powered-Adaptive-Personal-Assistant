/**
 * Phase 5: Empirical Evaluation Engine
 * 
 * Implements:
 * 1. Diagnostic Pre-Quiz and Post-Quiz comparison.
 * 2. Hake's Normalized Learning Gain metric:
 *    g = (PostScore - PreScore) / (100 - PreScore)
 *    - Guards division by zero.
 *    - If PreScore >= 100, returns 1.0 if PostScore >= 100 else 0.0.
 *    - If PostScore < PreScore, returns negative gain correctly clamped to -1.0.
 * 3. Categorization of gain: High (g >= 0.7), Medium (0.3 <= g < 0.7), Low (g < 0.3).
 * 4. Firestore persistence helper functions with arrayUnion and error handling.
 */

import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db, cleanDataForFirestore, handleFirestoreError, OperationType } from './firebase';
import { EvaluationRecord } from '../types';

export type GainCategory = 'high' | 'medium' | 'low';

export interface GainCategoryInfo {
  category: GainCategory;
  labelEn: string;
  labelAr: string;
  descriptionEn: string;
  descriptionAr: string;
  colorClass: string;
}

export interface QuizComparisonResult {
  preScore: number;
  postScore: number;
  scoreDifference: number;
  normalizedGain: number;
  category: GainCategory;
  categoryInfo: GainCategoryInfo;
  isImprovement: boolean;
  percentageGain: number;
}

export interface EvaluationSummary {
  averageGain: number;
  totalCompleted: number;
  bestGain: number;
}

/**
 * Calculates Hake's normalized learning gain metric:
 * g = (PostScore - PreScore) / (100 - PreScore)
 * 
 * Handles edge cases:
 * - If PreScore >= 100, return g = 1.0 if PostScore >= 100 else 0.0.
 * - If PostScore < PreScore, return negative gain correctly (clamped to -1.0).
 * - Guard division by zero.
 */
export function calculateNormalizedGain(preScore: number, postScore: number): number {
  // Edge case 1: PreScore >= 100
  if (preScore >= 100) {
    return postScore >= 100 ? 1.0 : 0.0;
  }

  const denominator = 100 - preScore;

  // Edge case 2: Guard division by zero
  if (denominator === 0 || Math.abs(denominator) < 1e-9) {
    return postScore >= 100 ? 1.0 : 0.0;
  }

  const rawGain = (postScore - preScore) / denominator;

  // Edge case 3: If PostScore < PreScore, return negative gain correctly (clamped to -1.0)
  if (postScore < preScore) {
    const clampedNegative = Math.max(-1.0, rawGain);
    return Math.round(clampedNegative * 10000) / 10000;
  }

  // Positive gain (clamped to max of 1.0)
  const clampedPositive = Math.min(1.0, rawGain);
  return Math.round(clampedPositive * 10000) / 10000;
}

/**
 * Alias for calculateNormalizedGain
 */
export const calculateHakesGain = calculateNormalizedGain;

/**
 * Categorizes normalized gain into High, Medium, or Low:
 * - High: g >= 0.7
 * - Medium: 0.3 <= g < 0.7
 * - Low: g < 0.3
 */
export function categorizeGain(gain: number): GainCategory {
  if (gain >= 0.7) {
    return 'high';
  }
  if (gain >= 0.3) {
    return 'medium';
  }
  return 'low';
}

/**
 * Returns localized descriptive metadata for a gain category.
 */
export function getGainCategoryInfo(gain: number): GainCategoryInfo {
  const category = categorizeGain(gain);
  switch (category) {
    case 'high':
      return {
        category: 'high',
        labelEn: 'High Gain',
        labelAr: 'تحصيل عالي',
        descriptionEn: 'Substantial concept mastery and conceptual shift (g ≥ 0.7).',
        descriptionAr: 'استيعاب استثنائي للمفاهيم وتقدم تعليمي بارز (g ≥ 0.7).',
        colorClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
      };
    case 'medium':
      return {
        category: 'medium',
        labelEn: 'Medium Gain',
        labelAr: 'تحصيل متوسط',
        descriptionEn: 'Moderate conceptual improvement with strong growth potential (0.3 ≤ g < 0.7).',
        descriptionAr: 'تحسن مفاهيمي متوسط مع قابلية للتطور والتوسع (0.3 ≤ g < 0.7).',
        colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
      };
    case 'low':
      return {
        category: 'low',
        labelEn: 'Low Gain',
        labelAr: 'تحصيل منخفض',
        descriptionEn: 'Minimal conceptual improvement; scaffolding and revision recommended (g < 0.3).',
        descriptionAr: 'تحسن طفيف؛ يُوصى بمراجعة المفاهيم الأساسية وتقديم دعم تدريجي (g < 0.3).',
        colorClass: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
      };
  }
}

/**
 * Diagnostic Pre-Quiz and Post-Quiz comparison helper.
 */
export function compareQuizzes(preScore: number, postScore: number): QuizComparisonResult {
  const normalizedGain = calculateNormalizedGain(preScore, postScore);
  const categoryInfo = getGainCategoryInfo(normalizedGain);
  const scoreDifference = postScore - preScore;
  const percentageGain = preScore > 0
    ? Math.round(((postScore - preScore) / preScore) * 100)
    : postScore > 0
    ? 100
    : 0;

  return {
    preScore,
    postScore,
    scoreDifference,
    normalizedGain,
    category: categoryInfo.category,
    categoryInfo,
    isImprovement: postScore > preScore,
    percentageGain,
  };
}

/**
 * Saves an evaluation record to Firestore under the user's profile using arrayUnion.
 * Cleans data to prevent undefined values and wraps operations with handleFirestoreError.
 */
export async function saveEvaluationRecord(
  uid: string,
  record: Omit<EvaluationRecord, 'id' | 'date'>
): Promise<EvaluationRecord> {
  const path = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  const gain = typeof record.normalizedGain === 'number' && !isNaN(record.normalizedGain)
    ? record.normalizedGain
    : calculateNormalizedGain(record.preQuizScore, record.postQuizScore);

  const fullRecord: EvaluationRecord = {
    ...record,
    id: `eval_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    date: new Date().toISOString(),
    normalizedGain: gain,
  };

  try {
    const cleanedRecord = cleanDataForFirestore(fullRecord);
    await setDoc(
      userRef,
      cleanDataForFirestore({
        evaluationRecords: arrayUnion(cleanedRecord),
      }),
      { merge: true }
    );
    return fullRecord;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return fullRecord;
  }
}

/**
 * Aggregates evaluation statistics from an array of evaluation records.
 */
export function getEvaluationSummary(records?: EvaluationRecord[]): EvaluationSummary {
  if (!records || records.length === 0) {
    return {
      averageGain: 0,
      totalCompleted: 0,
      bestGain: 0,
    };
  }

  const validGains = records.map((r) =>
    typeof r.normalizedGain === 'number' && !isNaN(r.normalizedGain)
      ? r.normalizedGain
      : calculateNormalizedGain(r.preQuizScore, r.postQuizScore)
  );

  const totalCompleted = validGains.length;
  const sumGain = validGains.reduce((acc, val) => acc + val, 0);
  const averageGain = Math.round((sumGain / totalCompleted) * 100) / 100;
  const bestGain = Math.round(Math.max(...validGains) * 100) / 100;

  return {
    averageGain,
    totalCompleted,
    bestGain,
  };
}
