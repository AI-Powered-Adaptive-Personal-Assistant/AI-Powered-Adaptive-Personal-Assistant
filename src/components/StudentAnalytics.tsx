import { useEffect, useMemo, useState } from 'react';
import { UserProfile, Course, AttendanceSubject, Goal, PlannerTask } from '../types';
import { Menu, LayoutDashboard, GraduationCap, CalendarCheck, Target, AlertTriangle, Clock } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { subscribeToCourses, calculateCGPA, calculateGPA, semestersOf } from '../lib/gpa';
import { subscribeToAttendance, attendancePct, isDeprived } from '../lib/attendance';
import { subscribeToGoals } from '../lib/goals';
import { subscribeToTasks } from '../lib/planner';
import AcademicCommandCenter from './AcademicCommandCenter';
import { MetricsInput } from '../lib/studentMetrics';

interface StudentAnalyticsProps {
  profile: UserProfile;
  onMenuClick?: () => void;
}

export default function StudentAnalytics({ profile, onMenuClick }: StudentAnalyticsProps) {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const [courses, setCourses] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<PlannerTask[]>([]);

  useEffect(() => {
    if (!profile.uid) return;
    const u1 = subscribeToCourses(profile.uid, setCourses);
    const u2 = subscribeToAttendance(profile.uid, setSubjects);
    const u3 = subscribeToGoals(profile.uid, setGoals);
    const u4 = subscribeToTasks(profile.uid, setTasks);
    return () => { u1(); u2(); u3(); u4(); };
  }, [profile.uid]);

  // Build the deterministic-metrics input from live academic data + the user's
  // question history. Powers the Executive Command Center (S1) + Explainable AI.
  const metricsInput = useMemo<MetricsInput>(() => ({
    courses, subjects, goals, tasks,
    questionHistory: profile.questionHistory || [],
  }), [courses, subjects, goals, tasks, profile.questionHistory]);

  const cgpa = useMemo(() => calculateCGPA(courses), [courses]);
  const gpaTrend = useMemo(
    () => semestersOf(courses).map((s) => ({
      name: s,
      gpa: calculateGPA(courses.filter((c) => (c.semester || 'Unspecified') === s)),
    })).reverse(),
    [courses],
  );

  const avgAttendance = useMemo(() => {
    if (!subjects.length) return 0;
    return Math.round(subjects.reduce((sum, s) => sum + attendancePct(s), 0) / subjects.length);
  }, [subjects]);
  const atRisk = useMemo(() => subjects.filter(isDeprived), [subjects]);

  const activeGoals = useMemo(() => goals.filter((g) => g.status !== 'completed'), [goals]);
  const completedGoals = useMemo(() => goals.filter((g) => g.status === 'completed'), [goals]);
  const upcoming = useMemo(
    () => activeGoals
      .filter((g) => g.deadline)
      .sort((a, b) => +new Date(a.deadline) - +new Date(b.deadline))
      .slice(0, 5),
    [activeGoals],
  );

  const daysUntil = (iso: string) => Math.ceil((+new Date(iso) - Date.now()) / 86400000);

  const Stat = ({ icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) => (
    <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tone}`}>{icon}</div>
      <div>
        <div className="text-2xl font-black text-slate-900">{value}</div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
      </div>
    </div>
  );

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="flex-1 h-screen overflow-y-auto bg-slate-50 flex flex-col custom-scrollbar p-6 md:p-10 gap-6">
      <header className="flex items-start gap-4">
        <button onClick={onMenuClick} className="lg:hidden p-2 mt-1 text-slate-500 bg-white shadow-sm border border-slate-200 hover:bg-slate-50 rounded-lg active:scale-95 shrink-0">
          <Menu className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <LayoutDashboard className="w-7 h-7 text-primary" /> {t('Student Analytics', 'تحليلات الطالب')}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 font-medium italic mt-1">{t('Your academic life at a glance.', 'حياتك الأكاديمية في نظرة واحدة.')}</p>
        </div>
      </header>

      <div className="max-w-6xl w-full space-y-6 pb-10">
        {/* S1 · Executive Command Center — the headline "what to do next" card */}
        <AcademicCommandCenter input={metricsInput} isAr={isAr} />

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<GraduationCap className="w-6 h-6 text-primary" />} tone="bg-primary/10" label={t('Cumulative GPA', 'المعدل التراكمي')} value={cgpa.toFixed(2)} />
          <Stat icon={<CalendarCheck className="w-6 h-6 text-emerald-600" />} tone="bg-emerald-50" label={t('Avg Attendance', 'متوسط الحضور')} value={`${avgAttendance}%`} />
          <Stat icon={<Target className="w-6 h-6 text-indigo-600" />} tone="bg-indigo-50" label={t('Active Goals', 'أهداف نشطة')} value={String(activeGoals.length)} />
          <Stat icon={<Target className="w-6 h-6 text-slate-500" />} tone="bg-slate-100" label={t('Completed Goals', 'أهداف مكتملة')} value={String(completedGoals.length)} />
        </div>

        {/* At-risk attendance alert */}
        {atRisk.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-red-700">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="text-sm font-bold">
              {t('At risk of deprivation in:', 'معرّض للحرمان في:')} {atRisk.map((s) => s.name).join('، ')}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GPA trend */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">{t('GPA by Semester', 'المعدل لكل ترم')}</h2>
            {gpaTrend.length ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gpaTrend} margin={{ top: 6, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 4]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="gpa" radius={[6, 6, 0, 0]}>
                      {gpaTrend.map((d, i) => (
                        <Cell key={i} fill={d.gpa >= 3.5 ? '#10b981' : d.gpa >= 2.5 ? '#3b82f6' : '#f59e0b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-slate-400 text-sm py-12 text-center">{t('Add courses in the GPA Calculator to see your trend.', 'ضيف مواد في حاسبة الـ GPA عشان تشوف التطوّر.')}</p>
            )}
          </div>

          {/* Attendance bars */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">{t('Attendance', 'الحضور')}</h2>
            {subjects.length ? (
              <div className="space-y-3">
                {subjects.map((s) => {
                  const pct = attendancePct(s);
                  const deprived = isDeprived(s);
                  return (
                    <div key={s.id}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-slate-700">{s.name}</span>
                        <span className={deprived ? 'text-red-600' : 'text-slate-500'}>{pct}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${deprived ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-400 text-sm py-12 text-center">{t('Track subjects in the Attendance page.', 'سجّل موادك في صفحة الحضور.')}</p>
            )}
          </div>
        </div>

        {/* Goals + deadlines */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">{t('Goals Progress', 'تقدّم الأهداف')}</h2>
            {activeGoals.length ? (
              <div className="space-y-3">
                {activeGoals.slice(0, 6).map((g) => (
                  <div key={g.id}>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-slate-700 truncate">{g.title}</span>
                      <span className="text-primary">{g.progress}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${g.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-sm py-12 text-center">{t('No active goals.', 'مفيش أهداف نشطة.')}</p>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> {t('Upcoming Deadlines', 'مواعيد قريبة')}
            </h2>
            {upcoming.length ? (
              <div className="space-y-2">
                {upcoming.map((g) => {
                  const d = daysUntil(g.deadline);
                  return (
                    <div key={g.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                      <span className="text-sm font-bold text-slate-700 truncate">{g.title}</span>
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg ${d < 0 ? 'bg-red-100 text-red-600' : d <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                        {d < 0 ? t('overdue', 'متأخر') : `${d} ${t('days', 'يوم')}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-400 text-sm py-12 text-center">{t('No upcoming deadlines.', 'مفيش مواعيد قريبة.')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
