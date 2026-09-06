/**
 * Pedagogical Intervention Engine (Points 7, 26, 28)
 * Transforms diagnostic observations into actionable instructional adaptations
 * with transparent, explainable feedback for the student.
 */

import { PrerequisiteDiagnosis } from './conceptGraph';

export type InterventionStrategy = 'analogies' | 'scaffolded' | 'worked_example' | 'socratic' | 'advanced_rigor';

export interface InterventionDirective {
  id: string;
  conceptId: string;
  strategy: InterventionStrategy;
  titleEn: string;
  titleAr: string;
  explanationEn: string;
  explanationAr: string;
  promptDirective: string;
  recommendedAction: 'show_analogy' | 'show_worked_example' | 'review_prerequisite' | 'guided_question' | 'advance_difficulty';
  prerequisiteGap?: PrerequisiteDiagnosis;
}

export interface StudentObservation {
  conceptId: string;
  consecutiveIncorrect: number;
  consecutiveCorrect: number;
  accuracyRate: number;
  avgResponseTimeMs: number;
  studentPreferredStyle?: string;
  prerequisiteDiagnosis?: PrerequisiteDiagnosis;
  repeatedMistakeType?: string;
}

/**
 * Decides the optimal pedagogical intervention based on student performance,
 * cognitive load, and prerequisite diagnosis.
 */
export function decideIntervention(obs: StudentObservation): InterventionDirective {
  const id = `int_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Case 1: Prerequisite root gap identified
  if (obs.prerequisiteDiagnosis?.hasPrerequisiteGap && obs.prerequisiteDiagnosis.rootGapConcept) {
    const gap = obs.prerequisiteDiagnosis.rootGapConcept;
    return {
      id,
      conceptId: obs.conceptId,
      strategy: 'scaffolded',
      titleEn: `Prerequisite Gap: ${gap.nameEn}`,
      titleAr: `فجوة في المتطلب الأساسي: ${gap.nameAr}`,
      explanationEn: `We noticed repeated difficulty. Reviewing the foundation in "${gap.nameEn}" will help make this concept click.`,
      explanationAr: `لاحظنا صعوبة متكررة. مراجعة المتطلب الأساسي "${gap.nameAr}" ستساعدك على فهم المفهوم بسهولة أكبر.`,
      promptDirective: `Focus first on clarifying the prerequisite concept "${gap.nameEn}". Connect it step-by-step before answering the higher-level question.`,
      recommendedAction: 'review_prerequisite',
      prerequisiteGap: obs.prerequisiteDiagnosis,
    };
  }

  // Case 2: High struggle (2+ consecutive errors or < 50% accuracy)
  if (obs.consecutiveIncorrect >= 2 || (obs.accuracyRate < 0.5 && obs.consecutiveIncorrect >= 1)) {
    // Balance preference vs performance (Point 28): even if student preferred 'technical',
    // struggle mandates worked examples and visual analogies.
    return {
      id,
      conceptId: obs.conceptId,
      strategy: 'worked_example',
      titleEn: 'Step-by-Step Worked Example',
      titleAr: 'مثال توضيحي محلول خطوة بخطوة',
      explanationEn: "I switched to a step-by-step worked example with an everyday analogy to relieve cognitive load.",
      explanationAr: "قمنا بالانتقال إلى مثال محلول خطوة بخطوة مع تشبيه عملي لتسهيل استيعاب الفكرة وتخفيف العبء الذهني.",
      promptDirective: `The student is currently struggling with this concept. Provide a concrete, step-by-step WORKED EXAMPLE with a clear physical analogy. Do not jump to abstract code or theorems.`,
      recommendedAction: 'show_worked_example',
    };
  }

  // Case 3: High mastery (3+ consecutive correct or > 85% accuracy)
  if (obs.consecutiveCorrect >= 3 || obs.accuracyRate > 0.85) {
    return {
      id,
      conceptId: obs.conceptId,
      strategy: 'socratic',
      titleEn: 'Socratic Challenge & Industry Scale',
      titleAr: 'تحدي سقراطي وربط بالتطبيقات العالمية',
      explanationEn: "You've demonstrated solid mastery! Let's examine real-world architectural scale and edge cases.",
      explanationAr: "أظهرت تمكناً رائعاً من هذا المفهوم! سننتقل الآن إلى حالات الاستخدام المتقدمة والتطبيقات في الشركات العالمية.",
      promptDirective: `The student has mastered the basics. Elevate the discussion: challenge them with edge cases, Big-O architectural trade-offs, and how top engineering teams deploy this.`,
      recommendedAction: 'advance_difficulty',
    };
  }

  // Case 4: Default balanced guidance
  return {
    id,
    conceptId: obs.conceptId,
    strategy: 'scaffolded',
    titleEn: 'Guided Practice',
    titleAr: 'تطبيق موجه',
    explanationEn: 'Continuing with structured interactive dialogue.',
    explanationAr: 'المتابعة بنقاش تعليمي تفاعلي متدرج.',
    promptDirective: 'Provide a balanced, structured explanation with one follow-up comprehension question.',
    recommendedAction: 'guided_question',
  };
}