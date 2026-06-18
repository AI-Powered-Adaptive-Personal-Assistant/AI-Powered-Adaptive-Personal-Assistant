/**
 * Firebase CRUD helpers for the Goal Tracker feature.
 * Goals are stored as a subcollection under each user:
 *   users/{uid}/goals/{goalId}
 *
 * This mirrors the existing "threads" subcollection pattern.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanDataForFirestore } from './firebase';
import { Goal, Milestone, GoalStatus } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Re-calculates progress (0–100) and status from milestones. */
export function deriveGoalMeta(
  milestones: Milestone[],
  deadline: string
): Pick<Goal, 'progress' | 'status'> {
  if (!milestones.length) {
    return { progress: 0, status: 'not-started' };
  }

  const completed = milestones.filter((m) => m.completed).length;
  const progress = Math.round((completed / milestones.length) * 100);

  let status: GoalStatus;
  if (progress === 0) status = 'not-started';
  else if (progress === 100) status = 'completed';
  else status = 'in-progress';

  return { progress, status };
}

/** Returns true if a goal is overdue (deadline passed and not completed). */
export function isGoalOverdue(goal: Goal): boolean {
  if (goal.status === 'completed') return false;
  const deadlineDate = new Date(goal.deadline);
  deadlineDate.setHours(23, 59, 59, 999); // end of deadline day
  return deadlineDate < new Date();
}

// ─── Firestore path helper ───────────────────────────────────────────────────

const goalsCol = (uid: string) => collection(db, `users/${uid}/goals`);
const goalDoc = (uid: string, goalId: string) =>
  doc(db, `users/${uid}/goals/${goalId}`);

// ─── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Fetches all goals for a user (one-time read).
 */
export async function getGoals(uid: string): Promise<Goal[]> {
  const path = `users/${uid}/goals`;
  try {
    const q = query(goalsCol(uid), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Goal);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Subscribes to real-time updates for a user's goals.
 * Returns the unsubscribe function.
 */
export function subscribeToGoals(
  uid: string,
  onUpdate: (goals: Goal[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${uid}/goals`;
  try {
    const q = query(goalsCol(uid), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        const goals = snap.docs.map((d) => d.data() as Goal);
        onUpdate(goals);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
        onError?.(err);
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return () => {};
  }
}

/**
 * Creates a new goal document.
 */
export async function saveGoal(uid: string, goal: Goal): Promise<void> {
  const path = `users/${uid}/goals/${goal.id}`;
  try {
    await setDoc(goalDoc(uid, goal.id), cleanDataForFirestore(goal));
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Overwrites an existing goal document (partial fields supported via merge).
 */
export async function updateGoal(
  uid: string,
  goalId: string,
  updates: Partial<Goal>
): Promise<void> {
  const path = `users/${uid}/goals/${goalId}`;
  try {
    await setDoc(goalDoc(uid, goalId), cleanDataForFirestore(updates), {
      merge: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Deletes a goal document.
 */
export async function deleteGoal(uid: string, goalId: string): Promise<void> {
  const path = `users/${uid}/goals/${goalId}`;
  try {
    await deleteDoc(goalDoc(uid, goalId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}