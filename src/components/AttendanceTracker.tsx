import { useEffect, useState } from 'react';
import { UserProfile, AttendanceSubject } from '../types';
import { Menu, Plus, Trash2, CheckCircle2, XCircle, CalendarCheck, AlertTriangle } from 'lucide-react';
import {
  attendancePct, absencesRemaining, isDeprived,
  subscribeToAttendance, saveSubject, deleteSubject,
} from '../lib/attendance';

interface AttendanceTrackerProps {
  profile: UserProfile;
  onMenuClick?: () => void;
}

export default function AttendanceTracker({ profile, onMenuClick }: AttendanceTrackerProps) {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);

  const [name, setName] = useState('');
  const [total, setTotal] = useState('30');
  const [threshold, setThreshold] = useState('75');

  useEffect(() => {
    if (!profile.uid) return;
    const unsub = subscribeToAttendance(profile.uid, setSubjects);
    return () => unsub();
  }, [profile.uid]);

  const addSubject = async () => {
    if (!name.trim() || !profile.uid) return;
    const subject: AttendanceSubject = {
      id: `a-${Date.now()}`,
      name: name.trim(),
      attended: 0,
      absent: 0,
      totalPlanned: Math.max(0, Number(total) || 0),
      threshold: Math.min(100, Math.max(0, Number(threshold) || 75)),
      createdAt: new Date().toISOString(),
    };
    await saveSubject(profile.uid, subject);
    setName('');
  };

  const mark = (s: AttendanceSubject, kind: 'attended' | 'absent', delta: number) => {
    if (!profile.uid) return;
    const next = { ...s, [kind]: Math.max(0, s[kind] + delta) };
    setSubjects((prev) => prev.map((x) => (x.id === s.id ? next : x))); // optimistic
    saveSubject(profile.uid, next);
  };

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="flex-1 h-screen overflow-y-auto bg-bg-main flex flex-col custom-scrollbar p-6 md:p-10 gap-6">
      <header className="flex items-start gap-4">
        <button onClick={onMenuClick} className="lg:hidden p-2 mt-1 text-text-muted bg-bg-card shadow-sm border border-border hover:bg-bg-main rounded-lg active:scale-95 shrink-0">
          <Menu className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-text-main tracking-tighter uppercase flex items-center gap-3">
            <CalendarCheck className="w-7 h-7 text-primary" /> {t('Attendance Tracker', 'متابعة الحضور')}
          </h1>
          <p className="text-xs md:text-sm text-text-muted font-medium italic mt-1">{t('Track attendance and how many absences you have left before deprivation.', 'تابع حضورك وكام غياب فاضلك قبل الحرمان.')}</p>
        </div>
      </header>

      {/* Add subject */}
      <div className="bg-bg-card rounded-3xl p-6 border border-border shadow-sm max-w-5xl w-full">
        <h2 className="text-sm font-black uppercase tracking-widest text-text-main mb-4">{t('Add a subject', 'إضافة مادة')}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Subject name', 'اسم المادة')}
            onKeyDown={(e) => e.key === 'Enter' && addSubject()}
            className="flex-1 min-w-[180px] bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40" />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase text-faint">{t('Total sessions', 'إجمالي المحاضرات')}</span>
            <input type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)}
              className="w-28 bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase text-faint">{t('Required %', 'النسبة المطلوبة')}</span>
            <input type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)}
              className="w-24 bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40" />
          </label>
          <button onClick={addSubject} disabled={!name.trim()}
            className="px-5 py-2 bg-primary text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t('Add', 'إضافة')}
          </button>
        </div>
      </div>

      {/* Subjects */}
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-5 pb-10">
        {subjects.length === 0 && (
          <div className="md:col-span-2 text-center text-faint py-16 flex flex-col items-center gap-3">
            <CalendarCheck className="w-12 h-12 text-faint" />
            <p className="font-medium">{t('No subjects yet — add one above.', 'لسه مفيش مواد — ضيف واحدة من فوق.')}</p>
          </div>
        )}
        {subjects.map((s) => {
          const pct = attendancePct(s);
          const remaining = absencesRemaining(s);
          const deprived = isDeprived(s);
          const held = s.attended + s.absent;
          return (
            <div key={s.id} className={`bg-bg-card rounded-3xl p-6 border shadow-sm ${deprived ? 'border-red-200' : 'border-border'}`}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-black text-text-main">{s.name}</h3>
                  <span className="text-[11px] text-faint">{held}/{s.totalPlanned || '?'} {t('sessions held', 'محاضرة')} · {t('req', 'مطلوب')} {s.threshold}%</span>
                </div>
                <button onClick={() => profile.uid && deleteSubject(profile.uid, s.id)} className="p-1.5 text-faint hover:text-red-500" title={t('Delete', 'حذف')}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Percentage bar */}
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-3xl font-black ${deprived ? 'text-red-600' : pct >= s.threshold + 10 ? 'text-emerald-600' : 'text-amber-600'}`}>{pct}%</span>
                <div className="flex-1 h-2.5 bg-surface-3 rounded-full overflow-hidden">
                  <div className={`h-full ${deprived ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>

              {/* Status */}
              {deprived ? (
                <p className="text-xs font-bold text-red-600 flex items-center gap-1.5 mb-4">
                  <AlertTriangle className="w-4 h-4" /> {t('Below required attendance!', 'تحت نسبة الحضور المطلوبة!')}
                </p>
              ) : remaining !== null ? (
                <p className={`text-xs font-bold mb-4 ${remaining <= 2 ? 'text-amber-600' : 'text-text-muted'}`}>
                  {remaining} {t('absences left before deprivation', 'غياب فاضل قبل الحرمان')}
                </p>
              ) : <div className="mb-4" />}

              {/* Counters */}
              <div className="flex items-center gap-3">
                <button onClick={() => mark(s, 'attended', 1)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-sm hover:bg-emerald-100 active:scale-95">
                  <CheckCircle2 className="w-4 h-4" /> {t('Present', 'حاضر')} ({s.attended})
                </button>
                <button onClick={() => mark(s, 'absent', 1)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold text-sm hover:bg-red-100 active:scale-95">
                  <XCircle className="w-4 h-4" /> {t('Absent', 'غائب')} ({s.absent})
                </button>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => mark(s, 'attended', -1)} disabled={s.attended === 0}
                  className="flex-1 text-[11px] text-faint hover:text-text-main disabled:opacity-30">− {t('present', 'حاضر')}</button>
                <button onClick={() => mark(s, 'absent', -1)} disabled={s.absent === 0}
                  className="flex-1 text-[11px] text-faint hover:text-text-main disabled:opacity-30">− {t('absent', 'غياب')}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
