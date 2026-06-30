/**
 * Calendar helpers — day-based events for everyone (students, professionals…).
 *
 * Stored per user: users/{uid}/calendarEvents/{eventId}
 * (same subcollection pattern as planner/attendance/goals).
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
import { CalendarEvent } from '../types';

const col = (uid: string) => collection(db, `users/${uid}/calendarEvents`);
const evtDoc = (uid: string, id: string) => doc(db, `users/${uid}/calendarEvents/${id}`);

export function subscribeToEvents(
  uid: string,
  onUpdate: (events: CalendarEvent[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `users/${uid}/calendarEvents`;
  try {
    const q = query(col(uid), orderBy('date', 'asc'));
    return onSnapshot(
      q,
      (snap) => onUpdate(snap.docs.map((d) => d.data() as CalendarEvent)),
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

export async function saveEvent(uid: string, event: CalendarEvent): Promise<void> {
  const path = `users/${uid}/calendarEvents/${event.id}`;
  try {
    await setDoc(evtDoc(uid, event.id), cleanDataForFirestore(event), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteEvent(uid: string, id: string): Promise<void> {
  const path = `users/${uid}/calendarEvents/${id}`;
  try {
    await deleteDoc(evtDoc(uid, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ─── Date helpers (local-time, no external deps) ─────────────────────────────

/** Local YYYY-MM-DD for a Date (avoids UTC off-by-one from toISOString). */
export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 6-week (42-cell) grid of dates covering the given month, starting on Sunday.
 * Cells outside the month are included so the grid is always rectangular.
 */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay()); // back up to Sunday
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}
