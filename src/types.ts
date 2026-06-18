export type CognitiveLevel = 'Basic' | 'Intermediate' | 'Advanced';
export type UserRole = 'Student' | 'Professional';
export type EducationLevel = 'Primary' | 'Secondary' | 'University' | 'Professional';
export type Field = 'Medicine' | 'Engineering' | 'Business' | 'General' | 'Other';
export type AccessibilityMode = 'None' | 'Speech' | 'Visual' | 'Vocal-Deaf' | 'Sign-Only';
export type LanguagePreference = 'English' | 'Arabic' | 'Egyptian Ammiya' | 'French' | 'Spanish' | 'German' | 'Italian' | 'Portuguese' | 'Russian' | 'Chinese' | 'Japanese';
export type AccountPath = 'Graduation Project' | 'Special Needs' | 'Normal';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string for better persistence
  reaction?: 'up' | 'down';
  attachments?: {
    name: string;
    type: string;
    data: string; // Base64
  }[];
  comparisons?: {
    modelName: string;
    content: string;
  }[];
}

export interface ChatThread {
  id: string;
  title: string;
  updatedAt: string;
  lastMessageSnippet?: string; // For sidebar display without loading full history
}

export interface Task {
  id: string;
  threadId: string;
  content: string;
  completed: boolean;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  accountPath?: AccountPath;
  universityEmail?: string;
  disabilityType?: string;
  name?: string;
  religion?: string;
  bio?: string;
  level: CognitiveLevel;
  role: UserRole;
  educationLevel: EducationLevel;
  sustainabilityGoal?: string;
  field: Field;
  language?: LanguagePreference;
  accessibilityMode: AccessibilityMode;
  questionScore: number;
  university?: string;
  faculty?: string;
  department?: string;
  work?: string;
  jobTitle?: string;
  iqScore?: number;
  lastQuizDate?: string;
  points: number;
  quizDuration?: number; // in seconds
  onboardingComplete: boolean;
  photoURL?: string;
  questionHistory: { score: number; date: string }[];
  chatHistory: Message[]; // Legacy/Global history (to be deprecated or kept small)
  chatThreads?: ChatThread[];
  activeThreadId?: string;
  tasks?: Task[];
  lastActiveDate?: string;
}

// ─── PATCH: Add these types to src/types.ts ───────────────────────────────────
// Place AFTER the existing UserProfile interface

export type GoalPriority = 'low' | 'medium' | 'high';
export type GoalStatus = 'not-started' | 'in-progress' | 'completed';

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  priority: GoalPriority;
  status: GoalStatus;
  progress: number;        // 0–100, auto-calculated from milestones
  deadline: string;        // ISO date string (YYYY-MM-DD)
  createdAt: string;       // ISO date string
  milestones: Milestone[];
}

// ─── GPA Calculator ──────────────────────────────────────────────────────────
export interface Course {
  id: string;
  name: string;
  credits: number;         // credit hours
  grade: string;           // letter grade key (A, A-, B+, ... F)
  semester: string;        // e.g. "Fall 2026" — groups courses for GPA vs CGPA
  createdAt: string;       // ISO date string
}

// ─── Attendance Tracker ──────────────────────────────────────────────────────
export interface AttendanceSubject {
  id: string;
  name: string;
  attended: number;        // sessions attended
  absent: number;          // sessions missed
  totalPlanned: number;    // total scheduled sessions for the course (0 = unknown)
  threshold: number;       // required attendance % (e.g. 75)
  createdAt: string;
}

