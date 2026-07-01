/**
 * GPA Calculator helpers.
 *
 * - Grade → quality points on a 4.0 scale.
 * - Weighted GPA (one semester) and CGPA (all courses).
 * - What-if projection (add a hypothetical course or change a grade).
 *
 * Courses are stored per user: users/{uid}/courses/{courseId}
 * (same subcollection pattern as goals/threads).
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
import { Course } from '../types';

/** Letter grade → quality points (matches the university's official 4.0 scale). */
export const GRADE_POINTS: Record<string, number> = {
  'A+': 4.0, 'A': 3.7, 'A-': 3.4,
  'B+': 3.2, 'B': 3.0, 'B-': 2.8,
  'C+': 2.6, 'C': 2.4, 'C-': 2.2,
  'D+': 2.0, 'D': 1.5, 'D-': 1.0,
  'F': 0.0,
};

export const GRADE_OPTIONS = Object.keys(GRADE_POINTS);

/** Weighted GPA for a list of courses (credits × points / credits). */
export function calculateGPA(courses: Course[]): number {
  let totalCredits = 0;
  let totalPoints = 0;
  for (const c of courses) {
    const pts = GRADE_POINTS[c.grade];
    if (pts === undefined || !c.credits) continue;
    totalCredits += c.credits;
    totalPoints += pts * c.credits;
  }
  if (!totalCredits) return 0;
  return Math.round((totalPoints / totalCredits) * 100) / 100;
}

/** CGPA across every course (all semesters). */
export function calculateCGPA(courses: Course[]): number {
  return calculateGPA(courses);
}

/** Distinct semesters, most-recently-added first. */
export function semestersOf(courses: Course[]): string[] {
  const seen: string[] = [];
  for (const c of courses) {
    const s = c.semester || 'Unspecified';
    if (!seen.includes(s)) seen.push(s);
  }
  return seen;
}

/** Total credit hours counted toward the GPA. */
export function totalCredits(courses: Course[]): number {
  return courses.reduce((sum, c) => sum + (GRADE_POINTS[c.grade] !== undefined ? c.credits || 0 : 0), 0);
}

/**
 * What-if: projected CGPA if `courseId`'s grade became `newGrade`
 * (or, when courseId is null, if a hypothetical course were added).
 */
export function projectCGPA(
  courses: Course[],
  change: { courseId: string | null; grade: string; credits: number },
): number {
  if (change.courseId) {
    const next = courses.map((c) =>
      c.id === change.courseId ? { ...c, grade: change.grade } : c,
    );
    return calculateCGPA(next);
  }
  const hypothetical: Course = {
    id: '__whatif__',
    name: 'Hypothetical',
    credits: change.credits,
    grade: change.grade,
    semester: 'What-if',
    createdAt: new Date().toISOString(),
  };
  return calculateCGPA([...courses, hypothetical]);
}

// ─── Firestore CRUD ──────────────────────────────────────────────────────────

const coursesCol = (uid: string) => collection(db, `users/${uid}/courses`);
const courseDoc = (uid: string, id: string) => doc(db, `users/${uid}/courses/${id}`);

export function subscribeToCourses(
  uid: string,
  onUpdate: (courses: Course[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `users/${uid}/courses`;
  try {
    const q = query(coursesCol(uid), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => onUpdate(snap.docs.map((d) => d.data() as Course)),
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

export async function saveCourse(uid: string, course: Course): Promise<void> {
  const path = `users/${uid}/courses/${course.id}`;
  try {
    await setDoc(courseDoc(uid, course.id), cleanDataForFirestore(course));
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteCourse(uid: string, id: string): Promise<void> {
  const path = `users/${uid}/courses/${id}`;
  try {
    await deleteDoc(courseDoc(uid, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
