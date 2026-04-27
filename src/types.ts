export type CognitiveLevel = 'Basic' | 'Intermediate' | 'Advanced';
export type UserRole = 'Student' | 'Professional';
export type Field = 'Medicine' | 'Engineering' | 'Business' | 'General' | 'Other';
export type AccessibilityMode = 'None' | 'Speech' | 'Visual' | 'Vocal-Deaf' | 'Sign-Only';
export type LanguagePreference = 'English' | 'Arabic' | 'French' | 'Spanish' | 'German' | 'Italian' | 'Portuguese' | 'Russian' | 'Chinese' | 'Japanese';

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
}

export interface ChatThread {
  id: string;
  title: string;
  updatedAt: string;
  lastMessageSnippet?: string; // For sidebar display without loading full history
}

export interface UserProfile {
  uid: string;
  email: string;
  name?: string;
  religion?: string;
  bio?: string;
  level: CognitiveLevel;
  role: UserRole;
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
}
