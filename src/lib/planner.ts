/**
 * Academic Planner helpers.
 *
 * Tracks assignments, quizzes, midterms, finals, etc. with due dates and
 * countdowns. Stored per user: users/{uid}/planner/{taskId}
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanDataForFirestore } from './firebase';
import { PlannerTask } from '../types';

/** Whole days until the due date (negative = overdue, 0 = today). */
export function daysUntilDue(task: PlannerTask): number {
  const due = new Date(task.dueDate);
  due.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - start.getTime()) / 86400000);
}

export function isOverdue(task: PlannerTask): boolean {
  return !task.completed && daysUntilDue(task) < 0;
}

// ─── Firestore CRUD ──────────────────────────────────────────────────────────

const col = (uid: string) => collection(db, `users/${uid}/planner`);
const taskDoc = (uid: string, id: string) => doc(db, `users/${uid}/planner/${id}`);

export function subscribeToTasks(
  uid: string,
  onUpdate: (tasks: PlannerTask[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `users/${uid}/planner`;
  try {
    const q = query(col(uid), orderBy('dueDate', 'asc'));
    return onSnapshot(
      q,
      (snap) => onUpdate(snap.docs.map((d) => d.data() as PlannerTask)),
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
        onError?.(err);
      },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return () => {};
  }
}

export async function saveTask(uid: string, task: PlannerTask): Promise<void> {
  const path = `users/${uid}/planner/${task.id}`;
  try {
    await setDoc(taskDoc(uid, task.id), cleanDataForFirestore(task), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteTask(uid: string, id: string): Promise<void> {
  const path = `users/${uid}/planner/${id}`;
  try {
    await deleteDoc(taskDoc(uid, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
