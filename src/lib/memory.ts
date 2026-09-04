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

/**
 * Fetches the student's memory config once from Firestore.
 * If the document does not exist, returns DEFAULT_STUDENT_MEMORY.
 */
export async function getStudentMemory(uid: string): Promise<StudentMemory> {
  const path = `users/${uid}/memory/config`;
  try {
    const snap = await getDoc(memoryDocRef(uid));
    if (snap.exists()) {
      return { ...DEFAULT_STUDENT_MEMORY, ...(snap.data() as Partial<StudentMemory>) };
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
  uid: string,
  onUpdate: (memory: StudentMemory) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${uid}/memory/config`;
  try {
    return onSnapshot(
      memoryDocRef(uid),
      (snap) => {
        if (snap.exists()) {
          onUpdate({ ...DEFAULT_STUDENT_MEMORY, ...(snap.data() as Partial<StudentMemory>) });
        } else {
          onUpdate(DEFAULT_STUDENT_MEMORY);
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
  uid: string,
  updates: Partial<StudentMemory>
): Promise<void> {
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
  uid: string,
  enabled: boolean
): Promise<void> {
  return updateStudentMemory(uid, { enabled });
}

/**
 * Adds an item to a list-based memory category (learningGoals, knownPreferences, explicitConfirmedInfo).
 */
export async function addMemoryItem(
  uid: string,
  currentMemory: StudentMemory,
  category: 'learningGoals' | 'knownPreferences' | 'explicitConfirmedInfo',
  value: string
): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) return;
  const currentList = currentMemory[category] || [];
  if (currentList.includes(trimmed)) return; // Avoid duplicate items
  
  const updatedList = [...currentList, trimmed];
  return updateStudentMemory(uid, { [category]: updatedList });
}

/**
 * Removes an item from a list-based memory category by index.
 */
export async function deleteMemoryItem(
  uid: string,
  currentMemory: StudentMemory,
  category: 'learningGoals' | 'knownPreferences' | 'explicitConfirmedInfo',
  index: number
): Promise<void> {
  const currentList = currentMemory[category] || [];
  if (index < 0 || index >= currentList.length) return;

  const updatedList = currentList.filter((_, i) => i !== index);
  return updateStudentMemory(uid, { [category]: updatedList });
}
