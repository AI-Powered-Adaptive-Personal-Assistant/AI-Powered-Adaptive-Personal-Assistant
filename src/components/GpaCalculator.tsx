import { localize } from '../lib/translations';
import { useEffect, useMemo, useState } from 'react';
import { UserProfile, Course } from '../types';
import { Menu, Plus, Trash2, Calculator, Sparkles, GraduationCap } from 'lucide-react';
import {
  GRADE_OPTIONS, GRADE_POINTS, calculateGPA, calculateCGPA, semestersOf,
  totalCredits, projectCGPA, subscribeToCourses, saveCourse, deleteCourse,
} from '../lib/gpa';

interface GpaCalculatorProps {
  profile: UserProfile;
  onMenuClick?: () => void;
}

const gradeColor = (grade: string) => {
  const p = GRADE_POINTS[grade] ?? 0;
  if (p >= 3.7) return 'text-primary bg-primary-soft border-border';
  if (p >= 3.0) return 'text-primary bg-surface-3 border-border';
  if (p >= 2.0) return 'text-accent bg-accent-soft border-accent/20';
  return 'text-danger bg-danger-soft border-danger/20';
};

export default function GpaCalculator({ profile, onMenuClick }: GpaCalculatorProps) {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const [courses, setCourses] = useState<Course[]>([]);

  // Add-course form
  const [name, setName] = useState('');
  const [credits, setCredits] = useState('3');
  const [grade, setGrade] = useState('A');
  const [semester, setSemester] = useState(`Semester 1`);

  // What-if
  const [whatIfCourse, setWhatIfCourse] = useState<string>('');
  const [whatIfGrade, setWhatIfGrade] = useState('A');
  const [whatIfCredits, setWhatIfCredits] = useState('3');

  useEffect(() => {
    if (!profile.uid) return;
    const unsub = subscribeToCourses(profile.uid, setCourses);
    return () => unsub();
  }, [profile.uid]);

  const cgpa = useMemo(() => calculateCGPA(courses), [courses]);
  const semesters = useMemo(() => semestersOf(courses), [courses]);
  const creditsTotal = useMemo(() => totalCredits(courses), [courses]);

  const projected = useMemo(() => {
    if (!courses.length && !whatIfCourse) return null;
    if (whatIfCourse) {
      return projectCGPA(courses, { courseId: whatIfCourse, grade: whatIfGrade, credits: 0 });
    }
    const safeCredits = Math.max(0, Number(whatIfCredits) || 0) || 3;
    return projectCGPA(courses, { courseId: null, grade: whatIfGrade, credits: safeCredits });
  }, [courses, whatIfCourse, whatIfGrade, whatIfCredits]);

  const addCourse = async () => {
    if (!name.trim() || !profile.uid) return;
    const course: Course = {
      id: `c-${Date.now()}`,
      name: name.trim(),
      credits: Math.max(0, Number(credits) || 0),
      grade,
      semester: semester.trim() || 'Semester 1',
      createdAt: new Date().toISOString(),
    };
    await saveCourse(profile.uid, course);
    setName('');
  };

  const t = (en: string, ar: string) => localize(profile.language, en, ar);

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="flex-1 h-screen overflow-y-auto bg-bg-main flex flex-col custom-scrollbar p-6 md:p-10 gap-6">
      <header className="flex items-start gap-4">
        <button onClick={onMenuClick} className="p-2 mt-1 text-text-muted bg-bg-card shadow-sm border border-border hover:bg-bg-main rounded-lg active:scale-95 shrink-0">
          <Menu className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-text-main tracking-tighter uppercase flex items-center gap-3">
            <Calculator className="w-7 h-7 text-primary" /> {t('GPA Calculator', 'حاسبة الـ GPA')}
          </h1>
          <p className="text-xs md:text-sm text-text-muted font-medium italic mt-1">{t('Track your grades, CGPA, and run what-if scenarios.', 'تابع درجاتك والـ CGPA وجرّب سيناريوهات "لو".')}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl w-full">
        {/* CGPA summary */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 flex flex-col justify-center items-center shadow-2xl">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-faint">{t('Cumulative GPA', 'المعدل التراكمي')}</span>
          <span className="text-6xl font-black mt-2 text-primary">{cgpa.toFixed(2)}</span>
          <span className="text-xs text-faint mt-1">{creditsTotal} {t('credit hours', 'ساعة معتمدة')} · {courses.length} {t('courses', 'مادة')}</span>
        </div>

        {/* What-if */}
        <div className="lg:col-span-2 bg-bg-card rounded-3xl p-6 border border-border shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-widest text-text-main flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-primary" /> {t('What-if Analysis', 'تحليل "ماذا لو"')}
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase text-faint">{t('Course', 'المادة')}</span>
              <select value={whatIfCourse} onChange={(e) => setWhatIfCourse(e.target.value)}
                className="bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40">
                <option value="">{t('New hypothetical course', 'مادة افتراضية جديدة')}</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase text-faint">{t('Grade', 'الدرجة')}</span>
              <select dir="ltr" value={whatIfGrade} onChange={(e) => setWhatIfGrade(e.target.value)}
                className="bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40">
                {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase text-faint">{t('Projected CGPA', 'المعدل المتوقّع')}</span>
              <div className="px-4 py-2 rounded-xl bg-primary-soft text-primary font-black text-lg min-w-[80px] text-center">
                {projected !== null ? projected.toFixed(2) : '—'}
              </div>
            </div>
            {projected !== null && (
              <span className={`text-xs font-bold ${projected >= cgpa ? 'text-primary' : 'text-danger'}`}>
                {projected >= cgpa ? '▲' : '▼'} {Math.abs(projected - cgpa).toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Add course */}
      <div className="bg-bg-card rounded-3xl p-6 border border-border shadow-sm max-w-6xl w-full">
        <h2 className="text-sm font-black uppercase tracking-widest text-text-main mb-4">{t('Add a course', 'إضافة مادة')}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Course name', 'اسم المادة')}
            onKeyDown={(e) => e.key === 'Enter' && addCourse()}
            className="flex-1 min-w-[180px] bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40" />
          <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder={t('Semester', 'الترم')}
            className="w-32 bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40" />
          <input type="number" min={0} max={12} value={credits} onChange={(e) => setCredits(e.target.value)}
            className="w-20 bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40" title={t('Credits', 'الساعات')} />
          <select dir="ltr" value={grade} onChange={(e) => setGrade(e.target.value)}
            className="w-20 bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40">
            {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <button onClick={addCourse} disabled={!name.trim()}
            className="px-5 py-2 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-press disabled:opacity-40 flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t('Add', 'إضافة')}
          </button>
        </div>
      </div>

      {/* Courses by semester */}
      <div className="max-w-6xl w-full space-y-6 pb-10">
        {courses.length === 0 && (
          <div className="text-center text-faint py-16 flex flex-col items-center gap-3">
            <GraduationCap className="w-12 h-12 text-faint" />
            <p className="font-medium">{t('No courses yet — add your first course above.', 'لسه مفيش مواد — ضيف أول مادة من فوق.')}</p>
          </div>
        )}
        {semesters.map((sem) => {
          const semCourses = courses.filter((c) => (c.semester || 'Unspecified') === sem);
          return (
            <div key={sem} className="bg-bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 bg-bg-main border-b border-border">
                <h3 className="font-black text-text-main text-sm uppercase tracking-wider">{sem}</h3>
                <span className="text-xs font-bold text-text-muted">GPA: <span className="text-primary font-black">{calculateGPA(semCourses).toFixed(2)}</span></span>
              </div>
              <div className="divide-y divide-slate-100">
                {semCourses.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-6 py-3">
                    <span className="flex-1 font-bold text-text-main text-sm">{c.name}</span>
                    <span className="text-xs text-faint">{c.credits} {t('cr', 'س')}</span>
                    <span dir="ltr" className={`text-xs font-black px-2.5 py-1 rounded-lg border ${gradeColor(c.grade)}`}>{c.grade}</span>
                    <button onClick={() => profile.uid && deleteCourse(profile.uid, c.id)}
                      className="p-1.5 text-faint hover:text-red-500 transition-colors" title={t('Delete', 'حذف')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
