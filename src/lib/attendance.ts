/**
 * Attendance Tracker helpers.
 *
 * Tracks attended/absent sessions per subject, the attendance percentage, and
 * how many more absences are allowed before the student drops below the
 * required threshold (الحرمان).
 *
 * Stored per user: users/{uid}/attendance/{subjectId}
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
import { AttendanceSubject } from '../types';

/** Current attendance percentage (attended / held sessions). */
export function attendancePct(s: AttendanceSubject): number {
  const held = s.attended + s.absent;
  if (!held) return 100;
  return Math.round((s.attended / held) * 1000) / 10; // 1 decimal
}

/**
 * Absences still allowed before dropping below the threshold.
 * Uses totalPlanned when known, otherwise the sessions held so far.
 * Returns null when it can't be computed.
 */
export function absencesRemaining(s: AttendanceSubject): number | null {
  const total = s.totalPlanned && s.totalPlanned > 0 ? s.totalPlanned : s.attended + s.absent;
  if (!total) return null;
  // Max absences allowed overall = total * (1 - threshold/100)
  const maxAbsences = Math.floor(total * (1 - s.threshold / 100));
  return Math.max(0, maxAbsences - s.absent);
}

/** True if the subject is already below its required threshold. */
export function isDeprived(s: AttendanceSubject): boolean {
  const held = s.attended + s.absent;
  if (!held) return false;
  return attendancePct(s) < s.threshold;
}

// ─── Firestore CRUD ──────────────────────────────────────────────────────────

const col = (uid: string) => collection(db, `users/${uid}/attendance`);
const subjDoc = (uid: string, id: string) => doc(db, `users/${uid}/attendance/${id}`);

export function subscribeToAttendance(
  uid: string,
  onUpdate: (subjects: AttendanceSubject[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `users/${uid}/attendance`;
  try {
    const q = query(col(uid), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => onUpdate(snap.docs.map((d) => d.data() as AttendanceSubject)),
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

export async function saveSubject(uid: string, subject: AttendanceSubject): Promise<void> {
  const path = `users/${uid}/attendance/${subject.id}`;
  try {
    await setDoc(subjDoc(uid, subject.id), cleanDataForFirestore(subject), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteSubject(uid: string, id: string): Promise<void> {
  const path = `users/${uid}/attendance/${id}`;
  try {
    await deleteDoc(subjDoc(uid, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
