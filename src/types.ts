export type CognitiveLevel = 'Basic' | 'Intermediate' | 'Advanced';
export type UserRole = 'Student' | 'Professional';
export type EducationLevel = 'Primary' | 'Secondary' | 'University' | 'Professional';
export type Field = 'Medicine' | 'Engineering' | 'Business' | 'General' | 'Other';
export type AccessibilityMode = 'None' | 'Speech' | 'Visual' | 'Vocal-Deaf' | 'Sign-Only' | 'Motor-Euphonia';
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

export interface StudentMemory {
  enabled: boolean; // Privacy-first default: false
  preferredLanguage: string;
  explanationStyle: string;
  learningGoals: string[];
  knownPreferences: string[];
  explicitConfirmedInfo: string[];
  updatedAt: string; // ISO 8601 string
}

export interface UserProfile {
  uid: string;
  email: string;
  accountPath?: AccountPath;
  universityEmail?: string;
  disabilityType?: string;
  /** Organization/charity code this user belongs to (e.g. "RESALA"). */
  organization?: string;
  /** Org staff: can view THEIR organization's users inside the disability hub. */
  isOrgManager?: boolean;
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
  /**
   * Phase 2: Cognify Memory (Transparent Student Memory).
   * Stored under users/{userId}/memory/config in Firestore.
   */
  memory?: StudentMemory;
  /**
   * Eye-tracking / auto-scan tuning, synced so it follows the student.
   *
   * This used to live only in localStorage, which meant a student who had their
   * sensitivity, dwell time and scan speed tuned on one tablet got the raw
   * defaults on any other device — and lost the tuning entirely if the browser
   * data was cleared. For someone who needs the settings calibrated to their own
   * motor range, re-tuning from scratch is not a minor inconvenience.
   */
  headTrackingConfig?: HeadTrackingConfig;
  /**
   * Vocal sound triggers, tuned to this student's own voice.
   *
   * The pitch a student can actually produce is personal — a breathy 140Hz hum
   * never matches a target fixed at 220Hz, and for a student who cannot blink
   * reliably these triggers are their click. Synced for the same reason as the
   * head config: the calibration has to follow them between devices.
   */
  vocalTriggers?: VocalSoundTriggerConfig[];
  // Granted via the Admin Dashboard. Permanent "owner" admins are defined by
  // email in the code; this flag is for admins promoted at runtime.
  isAdmin?: boolean;
  // Super admin granted at runtime from the Admin Dashboard. Founder super
  // admins are still defined by email in roles.ts and can never be revoked —
  // that's the lockout protection. Only a super admin may write this field
  // (enforced in firestore.rules, not just the UI).
  isSuperAdmin?: boolean;
  /**
   * Labeled snapshot descriptions saved from the Visual Companion (blind
   * users: "remember this as..."). Kept short and text-only — no images are
   * stored, just what the person asked us to remember about it.
   */
  visionMemories?: VisionMemory[];
}

export interface VisionMemory {
  id: string;
  label: string;        // what the user called it, e.g. "أحمد" or "دوا الضغط"
  description: string;  // the AI's description at the moment it was saved
  createdAt: string;    // ISO date string
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

// ─── Calendar ────────────────────────────────────────────────────────────────
export type CalendarEventType = 'event' | 'class' | 'exam' | 'task' | 'reminder' | 'personal';
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;            // ISO date (YYYY-MM-DD)
  time?: string;           // optional HH:MM
  type: CalendarEventType;
  note?: string;
  createdAt: string;
}

// ─── Academic Planner ────────────────────────────────────────────────────────
export type PlannerTaskType = 'assignment' | 'quiz' | 'midterm' | 'final' | 'project' | 'other';
export interface PlannerTask {
  id: string;
  title: string;
  type: PlannerTaskType;
  course: string;          // optional course/subject name ('' if none)
  dueDate: string;         // ISO date string (YYYY-MM-DD)
  completed: boolean;
  createdAt: string;
}

// ─── Motor & Euphonia (Quadriplegia Assistive System) ─────────────────────────
export type VocalTriggerAction =
  | 'select'
  | 'next'
  | 'previous'
  | 'back'
  | 'ask-ai'
  | 'speak-aloud'
  | 'emergency'
  | 'clear';

export interface VocalSoundTriggerConfig {
  id: string;
  name: string;
  nameAr: string;
  targetFrequencyHz: number; // Center frequency (e.g. 250Hz for low hum, 1200Hz for high tone)
  minEnergyThreshold: number; // Volume threshold 0-1
  action: VocalTriggerAction;
  enabled: boolean;
}

export interface HeadTrackingConfig {
  sensitivity: number; // 0.5 to 3.0
  dwellTimeMs: number; // 800ms to 3000ms
  smoothing: number; // 0.1 to 0.9
  trackingMode?: 'iris' | 'nose' | 'hybrid'; // Eye Iris Gaze vs Head Nose vs Hybrid
  facialTriggersEnabled: boolean; // Smile / mouth open triggers click
  smileThreshold: number; // 0.3 to 0.9
  mouthOpenThreshold: number; // 0.3 to 0.9
  // Single-switch auto scanning: the app walks the selectable targets itself
  // and the student makes ONE action to choose. The fallback for users who
  // cannot drive the gaze pointer at all.
  autoScanEnabled: boolean;
  autoScanIntervalMs: number; // 600ms to 5000ms
  /** row-column asks for a row first, then an item in it: two choices instead
   *  of walking all ~40 keys. linear walks every target in order. */
  autoScanMode?: 'linear' | 'row-column';
}

export interface AACCardItem {
  id: string;
  category: 'quick' | 'study' | 'needs' | 'ai' | 'navigation' | 'contacts';
  labelEn: string;
  labelAr: string;
  icon: string;
  phraseEn: string;
  phraseAr: string;
  actionPayload?: string;
  isAiAction?: boolean;
}

