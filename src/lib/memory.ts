/**
 * Firebase CRUD helpers for Cognify Memory (Phase 2).
 * Stored at: users/{uid}/memory/config
 *
 * Single Source of Truth: Firestore only (no localStorage cache/fallback).
 * Privacy-First Default: enabled is false by default.
 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanDataForFirestore } from './firebase';
import { StudentMemory } from '../types';

export const DEFAULT_STUDENT_MEMORY: StudentMemory = {
  enabled: false, // Privacy-first default: false
  preferredLanguage: 'English',
  explanationStyle: 'Practical examples first',
  learningGoals: [],
  knownPreferences: [],
  explicitConfirmedInfo: [],
  updatedAt: new Date().toISOString(),
};

const memoryDocRef = (uid: string) => doc(db, `users/${uid}/memory/config`);

function sanitizeMemory(data?: Partial<StudentMemory> | null): StudentMemory {
  return {
    enabled: data?.enabled === true,
    preferredLanguage: data?.preferredLanguage || 'English',
    explanationStyle: data?.explanationStyle || 'Practical examples first',
    learningGoals: Array.isArray(data?.learningGoals) ? data.learningGoals : [],
    knownPreferences: Array.isArray(data?.knownPreferences) ? data.knownPreferences : [],
    explicitConfirmedInfo: Array.isArray(data?.explicitConfirmedInfo) ? data.explicitConfirmedInfo : [],
    updatedAt: data?.updatedAt || new Date().toISOString(),
  };
}

/**
 * Fetches the student's memory config once from Firestore.
 * If the document does not exist, returns DEFAULT_STUDENT_MEMORY.
 */
export async function getStudentMemory(uid?: string | null): Promise<StudentMemory> {
  if (!uid) return DEFAULT_STUDENT_MEMORY;
  const path = `users/${uid}/memory/config`;
  try {
    const snap = await getDoc(memoryDocRef(uid));
    if (snap.exists()) {
      return sanitizeMemory(snap.data() as Partial<StudentMemory>);
    }
    return DEFAULT_STUDENT_MEMORY;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    throw err;
  }
}

/**
 * Subscribes to real-time updates for a user's memory configuration.
 * Returns an unsubscribe function.
 */
export function subscribeToStudentMemory(
  uid?: string | null,
  onUpdate?: (memory: StudentMemory) => void,
  onError?: (err: Error) => void
): () => void {
  if (!uid) return () => {};
  const path = `users/${uid}/memory/config`;
  try {
    return onSnapshot(
      memoryDocRef(uid),
      (snap) => {
        if (snap.exists()) {
          onUpdate?.(sanitizeMemory(snap.data() as Partial<StudentMemory>));
        } else {
          onUpdate?.(DEFAULT_STUDENT_MEMORY);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, path);
        onError?.(err as Error);
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    onError?.(err as Error);
    return () => {};
  }
}

/**
 * Updates partial memory fields in Firestore. Always updates updatedAt to ISO 8601 string.
 */
export async function updateStudentMemory(
  uid?: string | null,
  updates?: Partial<StudentMemory>
): Promise<void> {
  if (!uid || !updates) return;
  const path = `users/${uid}/memory/config`;
  try {
    const updatedPayload: Partial<StudentMemory> = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(memoryDocRef(uid), cleanDataForFirestore(updatedPayload), {
      merge: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    throw err;
  }
}

/**
 * Toggles whether Cognify Memory is enabled for AI context injection.
 */
export async function toggleMemoryEnabled(
  uid?: string | null,
  enabled?: boolean
): Promise<void> {
  if (!uid) return;
  return updateStudentMemory(uid, { enabled: !!enabled });
}

/**
 * Adds an item to a list-based memory category (learningGoals, knownPreferences, explicitConfirmedInfo).
 */
export async function addMemoryItem(
  uid?: string | null,
  currentMemory?: StudentMemory | null,
  category?: 'learningGoals' | 'knownPreferences' | 'explicitConfirmedInfo',
  value?: string
): Promise<void> {
  if (!uid || !category || typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  const currentList = Array.isArray(currentMemory?.[category]) ? currentMemory![category] : [];
  if (currentList.includes(trimmed)) return; // Avoid duplicate items
  
  const updatedList = [...currentList, trimmed];
  return updateStudentMemory(uid, { [category]: updatedList });
}

/**
 * Removes an item from a list-based memory category by index.
 */
export async function deleteMemoryItem(
  uid?: string | null,
  currentMemory?: StudentMemory | null,
  category?: 'learningGoals' | 'knownPreferences' | 'explicitConfirmedInfo',
  index?: number
): Promise<void> {
  if (!uid || !category || typeof index !== 'number') return;
  const currentList = Array.isArray(currentMemory?.[category]) ? currentMemory![category] : [];
  if (index < 0 || index >= currentList.length) return;

  const updatedList = currentList.filter((_, i) => i !== index);
  return updateStudentMemory(uid, { [category]: updatedList });
}
