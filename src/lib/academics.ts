import { EducationLevel } from '../types';

// Academic section ids (match the view ids used in App/Sidebar).
// Note: 'attendance' is the Calendar section and is intentionally open to ALL
// education levels.
export type AcademicSection = 'goals' | 'gpa' | 'attendance' | 'analytics' | 'planner';

/**
 * Which academic sections each education level sees:
 *  - University → full set (GPA/CGPA, calendar, learning analytics, planner, goals).
 *  - School (Primary/Secondary) → lighter set: goals, calendar, planner
 *    (no university GPA/CGPA or GPA-driven analytics).
 *  - Professional / graduate → career-oriented: goals, calendar, planner.
 *
 * The Calendar ('attendance') is always included — it's useful for everyone.
 */
export function visibleAcademicSections(level?: EducationLevel): AcademicSection[] {
  switch (level) {
    case 'University':
      return ['goals', 'gpa', 'attendance', 'analytics', 'planner'];
    case 'Professional':
    case 'Primary':
    case 'Secondary':
    default:
      return ['goals', 'attendance', 'planner'];
  }
}

/** True if this education level may access the given academic section. */
export function canAccessSection(level: EducationLevel | undefined, section: AcademicSection): boolean {
  return visibleAcademicSections(level).includes(section);
}
