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
