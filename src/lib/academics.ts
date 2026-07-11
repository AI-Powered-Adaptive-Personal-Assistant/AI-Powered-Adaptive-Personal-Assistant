import { EducationLevel } from '../types';

// Academic section ids (match the view ids used in App/Sidebar).
export type AcademicSection = 'goals' | 'gpa' | 'analytics' | 'planner';

/**
 * Which academic sections each education level sees:
 *  - University → full set (GPA/CGPA, learning analytics, planner, goals).
 *  - School (Primary/Secondary) & Professional → lighter set: goals, planner.
 */
export function visibleAcademicSections(level?: EducationLevel): AcademicSection[] {
  switch (level) {
    case 'University':
      return ['goals', 'gpa', 'analytics', 'planner'];
    case 'Professional':
    case 'Primary':
    case 'Secondary':
    default:
      return ['goals', 'planner'];
  }
}

/** True if this education level may access the given academic section. */
export function canAccessSection(level: EducationLevel | undefined, section: AcademicSection): boolean {
  return visibleAcademicSections(level).includes(section);
}
