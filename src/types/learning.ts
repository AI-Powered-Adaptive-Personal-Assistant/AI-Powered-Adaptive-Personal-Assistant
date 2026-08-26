// ==========================================
// Learning Platform Types & Interfaces
// AI-Powered Adaptive Educational System
// ==========================================

import { Timestamp } from 'firebase/firestore';

// ── Subject Types ──────────────────────────
export type SubjectType = 'math' | 'reading' | 'writing' | 'memory' | 'comprehension' | 'science' | 'english';

export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export type TeachingMethod = 'text' | 'visual' | 'audio' | 'interactive' | 'repetition';

export type LearningStyle = 'visual' | 'auditory' | 'kinesthetic' | 'repetition';

export type OverallLevel = 'beginner' | 'developing' | 'proficient';

// ── Mistake Classification ─────────────────
export type MathMistakeType = 'concept' | 'calculation' | 'understanding' | 'careless';
export type ReadingMistakeType = 'letter_confusion' | 'phoneme' | 'word_recognition' | 'fluency';
export type WritingMistakeType = 'spelling' | 'grammar' | 'structure' | 'punctuation';
export type MemoryMistakeType = 'sequence' | 'recall' | 'speed' | 'capacity';
export type ComprehensionMistakeType = 'reading_difficulty' | 'understanding' | 'inference' | 'vocabulary';
export type ScienceMistakeType = 'concept' | 'process' | 'terminology' | 'application';
export type EnglishMistakeType = 'vocabulary' | 'pronunciation' | 'grammar' | 'sentence_formation';

export type MistakeType =
  | MathMistakeType
  | ReadingMistakeType
  | WritingMistakeType
  | MemoryMistakeType
  | ComprehensionMistakeType
  | ScienceMistakeType
  | EnglishMistakeType;

// ── Subject Profile (per-subject adaptive state) ──
export interface SubjectProfile {
  currentDifficulty: DifficultyLevel;
  correctAnswers: number;
  totalAnswers: number;
  accuracyRate: number;
  avgResponseTimeMs: number;
  commonMistakeTypes: string[];
  weakTopics: string[];
  strongTopics: string[];
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  preferredMethod: TeachingMethod;
  sessionsCompleted: number;
  lastExerciseAt: number; // Unix timestamp ms
}

// ── Learning Profile (per-child) ───────────
export interface LearningProfile {
  subjects: Record<SubjectType, SubjectProfile>;
  preferredLearningStyle: LearningStyle;
  overallLevel: OverallLevel;
  totalSessionsCompleted: number;
  totalTimeSpentMinutes: number;
  lastActiveAt: number;
  streakDays: number;
  lastStreakDate: string; // YYYY-MM-DD
  totalStarsEarned: number;
}

// ── Exercise Types ─────────────────────────
export interface ExerciseConfig {
  subject: SubjectType;
  difficulty: DifficultyLevel;
  teachingMethod: TeachingMethod;
  focusTopics?: string[];
  avoidTopics?: string[];
  language: 'en' | 'ar';
}

export interface Exercise {
  id: string;
  subject: SubjectType;
  difficulty: DifficultyLevel;
  question: string;
  questionArabic?: string;
  type: 'multiple_choice' | 'text_input' | 'drag_drop' | 'sequence' | 'matching' | 'true_false';
  options?: string[];
  optionsArabic?: string[];
  correctAnswer: string;
  hint?: string;
  hintArabic?: string;
  visualAid?: VisualAidData;
  explanation?: string;
  explanationArabic?: string;
  topic: string;
  timeoutMs?: number;
}

export interface VisualAidData {
  type: 'counting_objects' | 'number_line' | 'image_word' | 'step_diagram' | 'story_visual';
  emoji?: string;
  count?: number;
  secondCount?: number;
  steps?: string[];
  imageDescription?: string;
  numberLineRange?: [number, number];
  highlightPoint?: number;
}

// ── Exercise Result ────────────────────────
export interface ExerciseResult {
  exerciseId: string;
  subject: SubjectType;
  difficulty: DifficultyLevel;
  isCorrect: boolean;
  childAnswer: string;
  correctAnswer: string;
  responseTimeMs: number;
  mistakeType?: MistakeType;
  attemptNumber: number;
  teachingMethodUsed: TeachingMethod;
  topic: string;
  timestamp: number;
}

// ── AI Analysis Response ───────────────────
export interface AIAnalysis {
  isCorrect: boolean;
  mistakeType?: MistakeType;
  explanation: string;
  explanationArabic?: string;
  suggestedDifficulty: DifficultyLevel;
  suggestedMethod: TeachingMethod;
  encouragement: string;
  encouragementArabic?: string;
  visualAidNeeded: boolean;
  visualAid?: VisualAidData;
  topicStrength: 'weak' | 'developing' | 'strong';
}

// ── Memory Game Types ──────────────────────
export interface MemoryCard {
  id: string;
  content: string;
  type: 'emoji' | 'word' | 'number' | 'image';
  isFlipped: boolean;
  isMatched: boolean;
}

export interface MemoryGameConfig {
  gridSize: number; // 4, 6, 8, 12
  cardType: 'emoji' | 'word' | 'number' | 'mixed';
  timeLimit?: number;
}

export interface SequenceGameConfig {
  sequenceLength: number; // 3, 4, 5, 6, 7
  itemType: 'color' | 'number' | 'shape' | 'word';
  showDurationMs: number;
}

// ── Reading & Comprehension Types ──────────
export interface ReadingPassage {
  text: string;
  textArabic?: string;
  difficulty: DifficultyLevel;
  wordCount: number;
  questions: ComprehensionQuestion[];
}

export interface ComprehensionQuestion {
  question: string;
  questionArabic?: string;
  options: string[];
  optionsArabic?: string[];
  correctAnswer: string;
  type: 'factual' | 'inferential' | 'vocabulary';
}

// ── Science Types ──────────────────────────
export interface ScienceConcept {
  title: string;
  titleArabic?: string;
  steps: ScienceStep[];
  topic: string;
  difficulty: DifficultyLevel;
}

export interface ScienceStep {
  text: string;
  textArabic?: string;
  emoji: string;
  visualDescription?: string;
}

// ── English Vocabulary Types ───────────────
export interface VocabularyWord {
  word: string;
  meaning: string;
  meaningArabic?: string;
  exampleSentence: string;
  exampleSentenceArabic?: string;
  emoji: string;
  pronunciation?: string;
  difficulty: DifficultyLevel;
}

// ── Parent Dashboard Types ─────────────────
export interface ParentDashboardData {
  childName: string;
  overallAccuracy: number;
  totalSessions: number;
  totalTimeMinutes: number;
  streakDays: number;
  totalStars: number;
  subjectPerformance: SubjectPerformance[];
  strengths: string[];
  weaknesses: string[];
  commonMistakes: CommonMistake[];
  recommendations: string[];
  learningStyle: LearningStyle;
  progressOverTime: ProgressDataPoint[];
}

export interface SubjectPerformance {
  subject: SubjectType;
  accuracy: number;
  difficulty: DifficultyLevel;
  sessionsCompleted: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface CommonMistake {
  subject: SubjectType;
  type: string;
  frequency: number;
  example?: string;
}

export interface ProgressDataPoint {
  date: string;
  accuracy: number;
  subject?: SubjectType;
}

// ── Subject Metadata (for UI) ──────────────
export const SUBJECT_META: Record<SubjectType, {
  icon: string;
  label: string;
  labelAr: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  math: {
    icon: '🔢',
    label: 'Mathematics',
    labelAr: 'الرياضيات',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/40',
  },
  reading: {
    icon: '📖',
    label: 'Reading',
    labelAr: 'القراءة',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/40',
  },
  writing: {
    icon: '✏️',
    label: 'Writing',
    labelAr: 'الكتابة',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    borderColor: 'border-orange-500/40',
  },
  memory: {
    icon: '🧠',
    label: 'Memory',
    labelAr: 'الذاكرة',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/40',
  },
  comprehension: {
    icon: '💡',
    label: 'Comprehension',
    labelAr: 'الفهم القرائي',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-500/40',
  },
  science: {
    icon: '🔬',
    label: 'Science',
    labelAr: 'العلوم',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/20',
    borderColor: 'border-teal-500/40',
  },
  english: {
    icon: '🌍',
    label: 'English',
    labelAr: 'اللغة الإنجليزية',
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/20',
    borderColor: 'border-rose-500/40',
  },
};

// ── Default Subject Profile Factory ────────
export function createDefaultSubjectProfile(): SubjectProfile {
  return {
    currentDifficulty: 1,
    correctAnswers: 0,
    totalAnswers: 0,
    accuracyRate: 0,
    avgResponseTimeMs: 0,
    commonMistakeTypes: [],
    weakTopics: [],
    strongTopics: [],
    consecutiveCorrect: 0,
    consecutiveIncorrect: 0,
    preferredMethod: 'visual',
    sessionsCompleted: 0,
    lastExerciseAt: 0,
  };
}

// ── Default Learning Profile Factory ───────
export function createDefaultLearningProfile(): LearningProfile {
  const subjects = {} as Record<SubjectType, SubjectProfile>;
  const allSubjects: SubjectType[] = ['math', 'reading', 'writing', 'memory', 'comprehension', 'science', 'english'];
  for (const s of allSubjects) {
    subjects[s] = createDefaultSubjectProfile();
  }
  return {
    subjects,
    preferredLearningStyle: 'visual',
    overallLevel: 'beginner',
    totalSessionsCompleted: 0,
    totalTimeSpentMinutes: 0,
    lastActiveAt: Date.now(),
    streakDays: 0,
    lastStreakDate: '',
    totalStarsEarned: 0,
  };
}
