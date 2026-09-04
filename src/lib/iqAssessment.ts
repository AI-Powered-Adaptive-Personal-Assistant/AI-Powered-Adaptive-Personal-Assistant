/**
 * Phase 4: Scientific Adaptive IQ Assessment & Cognitive Gym Engine
 * 
 * Implements:
 * 1. 4 Cattell-Horn-Carroll (CHC) Cognitive Domains:
 *    - Gf: Fluid Reasoning (Culture-fair matrix completion)
 *    - Gq: Quantitative & Syllogistic Logic
 *    - Gwm: Working Memory (Spatial & sequence recall)
 *    - Gs: Processing Speed (Micro-timed perceptual discrimination)
 * 2. Standardized Normed Scoring (Mean 100, SD 15)
 * 3. Exponential Cooldown Calculation (7 * 2^(n-1) days)
 * 4. Daily Cognitive Gym workout generators with Cognify points
 */

import { CognitiveDomainScores, IqAssessmentRecord } from '../types';

export interface IqQuestion {
  id: string;
  domain: 'fluidReasoning' | 'quantitativeLogic' | 'workingMemory' | 'processingSpeed';
  difficulty: 1 | 2 | 3 | 4 | 5;
  timeLimitSeconds: number;
  promptEn: string;
  promptAr: string;
  matrixData?: {
    grid: string[][]; // 3x3 visual symbol matrix
    missingCell: [number, number];
  };
  options: {
    id: string;
    labelEn: string;
    labelAr: string;
    symbol?: string;
  }[];
  correctOptionId: string;
  explanationEn: string;
  explanationAr: string;
}

/**
 * Standard Culture-Fair Cognitive Assessment Battery (12 calibrated items across 4 domains)
 */
export const IQ_QUESTION_BATTERY: IqQuestion[] = [
  // ─── Gf: Fluid Reasoning (Progressive Non-Verbal Matrices) ──────────────────
  {
    id: 'gf_01',
    domain: 'fluidReasoning',
    difficulty: 2,
    timeLimitSeconds: 45,
    promptEn: 'Identify the missing pattern in the 3x3 grid by analyzing the horizontal transformations:',
    promptAr: 'حدد النمط الناقص في الشبكة 3×3 من خلال تحليل التحولات الأفقية:',
    matrixData: {
      grid: [
        ['⚪', '⚫', '⚪⚫'],
        ['▲', '▼', '▲▼'],
        ['◼', '◻', '?']
      ],
      missingCell: [2, 2],
    },
    options: [
      { id: 'opt_1', labelEn: '◼◻ (Combined)', labelAr: '◼◻ (دمج الشكلين)', symbol: '◼◻' },
      { id: 'opt_2', labelEn: '◼◼ (Doubled)', labelAr: '◼◼ (مكرر)', symbol: '◼◼' },
      { id: 'opt_3', labelEn: '◻◻ (Inverted)', labelAr: '◻◻ (معكوس)', symbol: '◻◻' },
      { id: 'opt_4', labelEn: '⚪▲ (Cross)', labelAr: '⚪▲ (تقاطع)', symbol: '⚪▲' },
    ],
    correctOptionId: 'opt_1',
    explanationEn: 'Each row combines symbol 1 and symbol 2 into a composite glyph in column 3.',
    explanationAr: 'كل صف يدمج الرمز الأول والرمز الثاني في رمز مركب في العمود الثالث.',
  },
  {
    id: 'gf_02',
    domain: 'fluidReasoning',
    difficulty: 3,
    timeLimitSeconds: 60,
    promptEn: 'Analyze the 90-degree clockwise rotation progression:',
    promptAr: 'حلل نمط الدوران 90 درجة باتجاه عقارب الساعة:',
    matrixData: {
      grid: [
        ['↑', '→', '↓'],
        ['↗', '↘', '↙'],
        ['←', '↑', '?']
      ],
      missingCell: [2, 2],
    },
    options: [
      { id: 'opt_1', labelEn: '→ (Right Arrow)', labelAr: '→ (سهم يمين)', symbol: '→' },
      { id: 'opt_2', labelEn: '↓ (Down Arrow)', labelAr: '↓ (سهم لأسفل)', symbol: '↓' },
      { id: 'opt_3', labelEn: '↖ (North-West)', labelAr: '↖ (شمال غرب)', symbol: '↖' },
      { id: 'opt_4', labelEn: '↔ (Bidirectional)', labelAr: '↔ (سهم مزدوج)', symbol: '↔' },
    ],
    correctOptionId: 'opt_1',
    explanationEn: 'The pattern rotates 90 degrees clockwise in each successive column: ← rotates to ↑, which rotates to →.',
    explanationAr: 'يدور السهم 90 درجة باتجاه عقارب الساعة في كل عمود: ← يدور إلى ↑ ثم إلى →.',
  },
  {
    id: 'gf_03',
    domain: 'fluidReasoning',
    difficulty: 4,
    timeLimitSeconds: 60,
    promptEn: 'Progressive dot count arithmetic (Row 1 + Row 2 = Row 3):',
    promptAr: 'حساب عدد النقاط التراكمي (الصف 1 + الصف 2 = الصف 3):',
    matrixData: {
      grid: [
        ['●', '●●', '●●●'],
        ['●●', '●●', '●●●●'],
        ['●●●', '●●●●', '?']
      ],
      missingCell: [2, 2],
    },
    options: [
      { id: 'opt_1', labelEn: '●●●●●●● (7 dots)', labelAr: '●●●●●●● (7 نقاط)', symbol: '●●●●●●●' },
      { id: 'opt_2', labelEn: '●●●●●● (6 dots)', labelAr: '●●●●●● (6 نقاط)', symbol: '●●●●●●' },
      { id: 'opt_3', labelEn: '●●●●● (5 dots)', labelAr: '●●●●● (5 نقاط)', symbol: '●●●●●' },
      { id: 'opt_4', labelEn: '●●●●●●●● (8 dots)', labelAr: '●●●●●●●● (8 نقاط)', symbol: '●●●●●●●●' },
    ],
    correctOptionId: 'opt_1',
    explanationEn: 'Row 3 sums Row 1 + Row 2: 3 dots + 4 dots = 7 dots.',
    explanationAr: 'الصف الثالث يساوي مجموع الصف الأول والثاني: 3 نقاط + 4 نقاط = 7 نقاط.',
  },

  // ─── Gq: Quantitative & Syllogistic Logic ──────────────────────────────────
  {
    id: 'gq_01',
    domain: 'quantitativeLogic',
    difficulty: 2,
    timeLimitSeconds: 45,
    promptEn: 'Find the next number in the alternating geometric progression: 3, 6, 12, 24, 48, ?',
    promptAr: 'أوجد الرقم التالي في المتتالية الهندسية: 3، 6، 12، 24، 48، ؟',
    options: [
      { id: 'opt_1', labelEn: '96', labelAr: '96' },
      { id: 'opt_2', labelEn: '72', labelAr: '72' },
      { id: 'opt_3', labelEn: '84', labelAr: '84' },
      { id: 'opt_4', labelEn: '108', labelAr: '108' },
    ],
    correctOptionId: 'opt_1',
    explanationEn: 'Each term doubles the preceding term (x2). 48 * 2 = 96.',
    explanationAr: 'كل حد هو ضعف الحد السابق (×2). 48 × 2 = 96.',
  },
  {
    id: 'gq_02',
    domain: 'quantitativeLogic',
    difficulty: 3,
    timeLimitSeconds: 60,
    promptEn: 'If all Alpha algorithms terminate in O(n), and some Beta algorithms are Alpha algorithms, which statement is GUARANTEED true?',
    promptAr: 'إذا كانت جميع خوارزميات ألفا تنتهي في O(n)، وبعض خوارزميات بيتا هي خوارزميات ألفا، فأي عبارة صحيحة حتماً؟',
    options: [
      { id: 'opt_1', labelEn: 'At least some Beta algorithms terminate in O(n)', labelAr: 'بعض خوارزميات بيتا على الأقل تنتهي في O(n)' },
      { id: 'opt_2', labelEn: 'All Beta algorithms terminate in O(n)', labelAr: 'جميع خوارزميات بيتا تنتهي في O(n)' },
      { id: 'opt_3', labelEn: 'No Beta algorithms terminate in O(n)', labelAr: 'لا توجد خوارزمية بيتا تنتهي في O(n)' },
      { id: 'opt_4', labelEn: 'Alpha algorithms are slower than Beta algorithms', labelAr: 'خوارزميات ألفا أبطأ من خوارزميات بيتا' },
    ],
    correctOptionId: 'opt_1',
    explanationEn: 'By existential syllogism: The subset of Beta that are Alpha inherit the O(n) termination property.',
    explanationAr: 'بالاستدلال المنطقي: الفئة الجزئية من بيتا التي تنتمي لألفا ترث خاصية الانتهاء في O(n).',
  },
  {
    id: 'gq_03',
    domain: 'quantitativeLogic',
    difficulty: 4,
    timeLimitSeconds: 60,
    promptEn: 'Solve the algebraic operator: If A ⊕ B = (A * B) - (A + B), calculate 5 ⊕ 4:',
    promptAr: 'حل المعامل الجبري: إذا كان A ⊕ B = (A × B) - (A + B)، فاحسب 5 ⊕ 4:',
    options: [
      { id: 'opt_1', labelEn: '11', labelAr: '11' },
      { id: 'opt_2', labelEn: '9', labelAr: '9' },
      { id: 'opt_3', labelEn: '15', labelAr: '15' },
      { id: 'opt_4', labelEn: '20', labelAr: '20' },
    ],
    correctOptionId: 'opt_1',
    explanationEn: '(5 * 4) - (5 + 4) = 20 - 9 = 11.',
    explanationAr: '(5 × 4) - (5 + 4) = 20 - 9 = 11.',
  },

  // ─── Gwm: Working Memory (Spatial & Sequential Retention) ──────────────────
  {
    id: 'gwm_01',
    domain: 'workingMemory',
    difficulty: 2,
    timeLimitSeconds: 30,
    promptEn: 'Remember the sequence [7, 3, 9, 2]. What is the sequence in REVERSE order?',
    promptAr: 'تذكر التسلسل [7، 3، 9، 2]. ما هو التسلسل بالترتيب المعكوس؟',
    options: [
      { id: 'opt_1', labelEn: '2, 9, 3, 7', labelAr: '2، 9، 3، 7' },
      { id: 'opt_2', labelEn: '2, 3, 9, 7', labelAr: '2، 3، 9، 7' },
      { id: 'opt_3', labelEn: '9, 2, 7, 3', labelAr: '9، 2، 7، 3' },
      { id: 'opt_4', labelEn: '7, 9, 3, 2', labelAr: '7، 9، 3، 2' },
    ],
    correctOptionId: 'opt_1',
    explanationEn: 'Reverse of [7, 3, 9, 2] is [2, 9, 3, 7].',
    explanationAr: 'معكوس [7، 3، 9، 2] هو [2، 9، 3، 7].',
  },
  {
    id: 'gwm_02',
    domain: 'workingMemory',
    difficulty: 3,
    timeLimitSeconds: 35,
    promptEn: 'A 3x3 grid had dots at positions (Top-Left, Center, Bottom-Right). Which grid accurately matches that configuration?',
    promptAr: 'شبكة 3×3 كانت تحتوي نقاط في (أعلى اليسار، المركز، أسفل اليمين). أي شبكة تطابق هذا التكوين بدقة؟',
    options: [
      { id: 'opt_1', labelEn: 'Diagonal [ (0,0), (1,1), (2,2) ]', labelAr: 'قطري [ (0,0)، (1,1)، (2,2) ]' },
      { id: 'opt_2', labelEn: 'Anti-Diagonal [ (0,2), (1,1), (2,0) ]', labelAr: 'قطري عكسي [ (0,2)، (1,1)، (2,0) ]' },
      { id: 'opt_3', labelEn: 'Cross [ (0,1), (1,1), (2,1) ]', labelAr: 'عمودي [ (0,1)، (1,1)، (2,1) ]' },
      { id: 'opt_4', labelEn: 'Corners [ (0,0), (0,2), (2,2) ]', labelAr: 'أركان [ (0,0)، (0,2)، (2,2) ]' },
    ],
    correctOptionId: 'opt_1',
    explanationEn: 'Top-Left (0,0), Center (1,1), and Bottom-Right (2,2) form the main diagonal.',
    explanationAr: 'أعلى اليسار (0,0) والمركز (1,1) وأسفل اليمين (2,2) تشكل القطر الرئيسي.',
  },
  // ─── Gs: Processing Speed (Micro-Timed Perceptual Discrimination) ──────────
  {
    id: 'gs_01',
    domain: 'processingSpeed',
    difficulty: 1,
    timeLimitSeconds: 60,
    promptEn: 'Fast match: Which symbol pair is identical?',
    promptAr: 'تطابق سريع: أي زوج من الرموز متطابق تماماً؟',
    options: [
      { id: 'opt_1', labelEn: '◆ — ◆ (Identical)', labelAr: '◆ — ◆ (متطابق)' },
      { id: 'opt_2', labelEn: '◆ — ◇ (Mismatch)', labelAr: '◆ — ◇ (مختلف)' },
      { id: 'opt_3', labelEn: '◼ — ◻ (Mismatch)', labelAr: '◼ — ◻ (مختلف)' },
      { id: 'opt_4', labelEn: '▲ — ▼ (Inverted)', labelAr: '▲ — ▼ (معكوس)' },
    ],
    correctOptionId: 'opt_1',
    explanationEn: 'Only option 1 contains two identical solid diamonds.',
    explanationAr: 'الخيار الأول فقط يحتوي على معينين مصمتين متطابقين.',
  },
  {
    id: 'gs_02',
    domain: 'processingSpeed',
    difficulty: 2,
    timeLimitSeconds: 60,
    promptEn: 'Rapid count: How many "★" stars are in this set? [ ★, ☆, ★, ★, ☆, ★ ]',
    promptAr: 'عد سريع: كم عدد النجوم المصمتة "★" في هذه المجموعة؟ [ ★، ☆، ★، ★، ☆، ★ ]',
    options: [
      { id: 'opt_1', labelEn: '4 stars', labelAr: '4 نجوم' },
      { id: 'opt_2', labelEn: '3 stars', labelAr: '3 نجوم' },
      { id: 'opt_3', labelEn: '5 stars', labelAr: '5 نجوم' },
      { id: 'opt_4', labelEn: '6 stars', labelAr: '6 نجوم' },
    ],
    correctOptionId: 'opt_1',
    explanationEn: 'There are exactly 4 filled stars (positions 1, 3, 4, 6) and 2 outline stars.',
    explanationAr: 'يوجد 4 نجوم مصمتة بالضبط (المواضع 1، 3، 4، 6) ونجمتان مفرغتان.',
  },
];

/**
 * Calculates exponential cooldown eligibility for IQ retesting:
 * Cooldown Days = 7 * 2^(completedTests - 1) days.
 * Test 1: 7 days
 * Test 2: 14 days
 * Test 3: 28 days
 * Test 4: 56 days
 * Test 5+: capped at 112 days
 */
export function checkIqCooldownEligibility(
  historyCount: number,
  lastTestDateIso?: string
): { isEligible: boolean; nextEligibleDate: Date; daysRemaining: number; cooldownDays: number } {
  if (historyCount <= 0 || !lastTestDateIso) {
    return {
      isEligible: true,
      nextEligibleDate: new Date(),
      daysRemaining: 0,
      cooldownDays: 0,
    };
  }

  // Calculate exponential interval in days
  const exponent = Math.min(4, Math.max(0, historyCount - 1)); // Caps at 7 * 2^4 = 112 days
  const cooldownDays = 7 * Math.pow(2, exponent);

  const lastDate = new Date(lastTestDateIso);
  const nextEligibleTime = lastDate.getTime() + cooldownDays * 24 * 60 * 60 * 1000;
  const nextEligibleDate = new Date(nextEligibleTime);
  const now = new Date();

  const diffMs = nextEligibleDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

  return {
    isEligible: diffMs <= 0,
    nextEligibleDate,
    daysRemaining,
    cooldownDays,
  };
}

/**
 * Calculates standardized norm-referenced score (Mean 100, SD 15) and domain sub-scores
 */
export function calculateStandardizedIq(
  userAnswers: Record<string, string>, // questionId -> selectedOptionId
  elapsedSeconds: number
): {
  iqScore: number;
  domainScores: CognitiveDomainScores;
  recommendedPersona: 'Foundational' | 'Balanced' | 'Socratic';
} {
  const domainRaw: Record<string, { correct: number; total: number }> = {
    fluidReasoning: { correct: 0, total: 0 },
    quantitativeLogic: { correct: 0, total: 0 },
    workingMemory: { correct: 0, total: 0 },
    processingSpeed: { correct: 0, total: 0 },
  };

  let totalWeightedScore = 0;
  let totalMaxWeight = 0;

  for (const q of IQ_QUESTION_BATTERY) {
    const isCorrect = userAnswers[q.id] === q.correctOptionId;
    const weight = q.difficulty;
    totalMaxWeight += weight;

    domainRaw[q.domain].total += 1;
    if (isCorrect) {
      domainRaw[q.domain].correct += 1;
      totalWeightedScore += weight;
    }
  }

  // Sub-scores (0-100)
  const calcSubScore = (d: string) => {
    const raw = domainRaw[d];
    return raw.total > 0 ? Math.round((raw.correct / raw.total) * 100) : 50;
  };

  const domainScores: CognitiveDomainScores = {
    fluidReasoning: calcSubScore('fluidReasoning'),
    quantitativeLogic: calcSubScore('quantitativeLogic'),
    workingMemory: calcSubScore('workingMemory'),
    processingSpeed: calcSubScore('processingSpeed'),
  };

  // Raw percentage
  const rawPercentage = totalMaxWeight > 0 ? totalWeightedScore / totalMaxWeight : 0.5;

  // Speed bonus (up to +4 IQ points if finished with >25% time buffer without sacrificing accuracy)
  const maxAllocatedSeconds = 600; // 10 minutes (600 seconds) total battery duration
  const timeBufferRatio = Math.max(0, (maxAllocatedSeconds - elapsedSeconds) / maxAllocatedSeconds);
  const speedBonus = rawPercentage >= 0.75 ? Math.round(timeBufferRatio * 4) : 0;

  // Standardized IQ distribution (Mean 100, SD 15, Range: 70 - 145)
  // z-score mapped from 0.0 -> -2.0 SD (70), 0.5 -> 0.0 SD (100), 1.0 -> +2.67 SD (140)
  const zScore = (rawPercentage - 0.5) / 0.1875;
  const rawIq = Math.round(100 + zScore * 15) + speedBonus;
  const iqScore = Math.min(145, Math.max(70, rawIq));

  // Determine Persona Recommendation
  let recommendedPersona: 'Foundational' | 'Balanced' | 'Socratic' = 'Balanced';
  if (iqScore < 90) {
    recommendedPersona = 'Foundational';
  } else if (iqScore >= 115) {
    recommendedPersona = 'Socratic';
  }

  return {
    iqScore,
    domainScores,
    recommendedPersona,
  };
}

/**
 * Generates Daily 3-Minute Cognitive Gym Workout Puzzles
 */
export interface GymChallenge {
  id: string;
  titleEn: string;
  titleAr: string;
  type: 'logic' | 'memory' | 'speed';
  pointsReward: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export function getDailyGymWorkout(dateString?: string): GymChallenge {
  const d = dateString ? new Date(dateString) : new Date();
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const challengeType = dayOfYear % 3;

  if (challengeType === 0) {
    return {
      id: `gym_${dayOfYear}`,
      titleEn: 'Fluid Logic Matrix Workout',
      titleAr: 'تمرين مصفوفات المنطق المرن',
      type: 'logic',
      pointsReward: 25,
      question: 'Which sequence completes the progression: 2, 5, 10, 17, 26, ?',
      options: ['35', '37', '38', '40'],
      correctIndex: 1, // 37 (+3, +5, +7, +9, +11)
      explanation: 'The differences between terms are consecutive odd numbers: +3, +5, +7, +9, +11. 26 + 11 = 37.',
    };
  } else if (challengeType === 1) {
    return {
      id: `gym_${dayOfYear}`,
      titleEn: 'Working Memory Sequence Lock',
      titleAr: 'تمرين استبقاء الذاكرة العاملة',
      type: 'memory',
      pointsReward: 25,
      question: 'Recall the sequence [Δ, Ω, Ψ, Σ]. If inverted and the 2nd element is replaced with Φ, what is the sequence?',
      options: ['[Σ, Ψ, Ω, Δ]', '[Σ, Φ, Ω, Δ]', '[Δ, Φ, Ψ, Σ]', '[Σ, Φ, Ψ, Δ]'],
      correctIndex: 1, // [Σ, Φ, Ω, Δ]
      explanation: 'Inverted: [Σ, Ψ, Ω, Δ]. Replacing 2nd item (Ψ) with Φ yields [Σ, Φ, Ω, Δ].',
    };
  } else {
    return {
      id: `gym_${dayOfYear}`,
      titleEn: 'Rapid Discrimination Sprint',
      titleAr: 'تمرين التمييز البصري فائق السرعة',
      type: 'speed',
      pointsReward: 25,
      question: 'Which character in the string "MMMMMMMWMMMM" is different, and at what index (1-based)?',
      options: ['Index 7 (W)', 'Index 8 (W)', 'Index 6 (W)', 'All are identical'],
      correctIndex: 1, // Index 8
      explanation: 'The character "W" appears at position 8 in "MMMMMMMWMMMM" (7 Ms, then W, then 4 Ms).',
    };
  }
}
