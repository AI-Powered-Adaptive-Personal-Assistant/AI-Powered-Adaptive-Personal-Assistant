import { localize } from '../lib/translations';
import { useEffect, useMemo, useState } from 'react';
import { UserProfile, PlannerTask, PlannerTaskType } from '../types';
import { Menu, Plus, Trash2, CalendarDays, CheckCircle2, Circle } from 'lucide-react';
import { daysUntilDue, isOverdue, subscribeToTasks, saveTask, deleteTask } from '../lib/planner';

interface AcademicPlannerProps {
  profile: UserProfile;
  onMenuClick?: () => void;
}

const TYPE_META: Record<PlannerTaskType, { en: string; ar: string; color: string }> = {
  assignment: { en: 'Assignment', ar: 'تكليف', color: 'bg-surface-3 text-primary border-border' },
  quiz: { en: 'Quiz', ar: 'كويز', color: 'bg-accent-soft text-accent border-accent/20' },
  midterm: { en: 'Midterm', ar: 'ميدتيرم', color: 'bg-accent-soft text-accent border-border' },
  final: { en: 'Final', ar: 'فاينال', color: 'bg-danger-soft text-danger border-danger/20' },
  project: { en: 'Project', ar: 'مشروع', color: 'bg-primary-soft text-primary border-border' },
  other: { en: 'Other', ar: 'أخرى', color: 'bg-surface-3 text-text-muted border-border' },
};

export default function AcademicPlanner({ profile, onMenuClick }: AcademicPlannerProps) {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const t = (en: string, ar: string) => localize(profile.language, en, ar);
  const [tasks, setTasks] = useState<PlannerTask[]>([]);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<PlannerTaskType>('assignment');
  const [course, setCourse] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (!profile.uid) return;
    const unsub = subscribeToTasks(profile.uid, setTasks);
    return () => unsub();
  }, [profile.uid]);

  const addTask = async () => {
    if (!title.trim() || !dueDate || !profile.uid) return;
    const task: PlannerTask = {
      id: `p-${Date.now()}`,
      title: title.trim(),
      type,
      course: course.trim(),
      dueDate,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    await saveTask(profile.uid, task);
    setTitle(''); setCourse('');
  };

  const toggle = (task: PlannerTask) => {
    if (!profile.uid) return;
    const next = { ...task, completed: !task.completed };
    setTasks((prev) => prev.map((x) => (x.id === task.id ? next : x)));
    saveTask(profile.uid, next);
  };

  const { upcoming, overdue, done } = useMemo(() => {
    const upcoming: PlannerTask[] = [], overdue: PlannerTask[] = [], done: PlannerTask[] = [];
    for (const task of tasks) {
      if (task.completed) done.push(task);
      else if (isOverdue(task)) overdue.push(task);
      else upcoming.push(task);
    }
    return { upcoming, overdue, done };
  }, [tasks]);

  const countdown = (task: PlannerTask) => {
    const d = daysUntilDue(task);
    if (d < 0) return { label: t('overdue', 'متأخر'), color: 'bg-danger-soft text-danger' };
    if (d === 0) return { label: t('today', 'النهاردة'), color: 'bg-danger-soft text-danger' };
    if (d === 1) return { label: t('tomorrow', 'بكرة'), color: 'bg-accent-soft text-accent' };
    if (d <= 3) return { label: `${d} ${t('days', 'أيام')}`, color: 'bg-accent-soft text-accent' };
    return { label: `${d} ${t('days', 'يوم')}`, color: 'bg-surface-3 text-text-muted' };
  };

  const TaskRow = ({ task }: { task: PlannerTask }) => {
    const meta = TYPE_META[task.type];
    const cd = countdown(task);
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-card border border-border rounded-2xl">
        <button onClick={() => toggle(task)} className="text-faint hover:text-emerald-500 shrink-0">
          {task.completed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm truncate ${task.completed ? 'line-through text-faint' : 'text-text-main'}`}>{task.title}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${meta.color}`}>{t(meta.en, meta.ar)}</span>
            {task.course && <span className="text-[10px] text-faint">{task.course}</span>}
            <span className="text-[10px] text-faint">{new Date(task.dueDate).toLocaleDateString()}</span>
          </div>
        </div>
        {!task.completed && <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg shrink-0 ${cd.color}`}>{cd.label}</span>}
        <button onClick={() => profile.uid && deleteTask(profile.uid, task.id)} className="p-1 text-faint hover:text-red-500 shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const Section = ({ title, items }: { title: string; items: PlannerTask[] }) =>
    items.length ? (
      <div className="space-y-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-faint ml-1">{title} ({items.length})</h3>
        {items.map((task) => <TaskRow key={task.id} task={task} />)}
      </div>
    ) : null;

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="flex-1 h-screen overflow-y-auto bg-bg-main flex flex-col custom-scrollbar p-6 md:p-10 gap-6">
      <header className="flex items-start gap-4">
        <button onClick={onMenuClick} className="lg:hidden p-2 mt-1 text-text-muted bg-bg-card shadow-sm border border-border hover:bg-bg-main rounded-lg active:scale-95 shrink-0">
          <Menu className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-text-main tracking-tighter uppercase flex items-center gap-3">
            <CalendarDays className="w-7 h-7 text-primary" /> {t('Academic Planner', 'المخطّط الأكاديمي')}
          </h1>
          <p className="text-xs md:text-sm text-text-muted font-medium italic mt-1">{t('Plan assignments, quizzes and exams — never miss a deadline.', 'نظّم التكاليف والكويزات والامتحانات — مايفوتكش أي موعد.')}</p>
        </div>
      </header>

      {/* Add task */}
      <div className="bg-bg-card rounded-3xl p-6 border border-border shadow-sm max-w-4xl w-full">
        <h2 className="text-sm font-black uppercase tracking-widest text-text-main mb-4">{t('Add a task', 'إضافة مهمة')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Title (e.g. ML Assignment 2)', 'العنوان (مثلاً تكليف ML 2)')}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            className="bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40" />
          <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder={t('Course (optional)', 'المادة (اختياري)')}
            className="bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40" />
          <select value={type} onChange={(e) => setType(e.target.value as PlannerTaskType)}
            className="bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40">
            {(Object.keys(TYPE_META) as PlannerTaskType[]).map((k) => <option key={k} value={k}>{t(TYPE_META[k].en, TYPE_META[k].ar)}</option>)}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            className="bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40" />
        </div>
        <button onClick={addTask} disabled={!title.trim() || !dueDate}
          className="mt-3 px-5 py-2 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-press disabled:opacity-40 flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('Add task', 'إضافة')}
        </button>
      </div>

      {/* Lists */}
      <div className="max-w-4xl w-full space-y-6 pb-10">
        {tasks.length === 0 && (
          <div className="text-center text-faint py-16 flex flex-col items-center gap-3">
            <CalendarDays className="w-12 h-12 text-faint" />
            <p className="font-medium">{t('No tasks yet — add your first deadline above.', 'لسه مفيش مهام — ضيف أول موعد من فوق.')}</p>
          </div>
        )}
        <Section title={t('Overdue', 'متأخرة')} items={overdue} />
        <Section title={t('Upcoming', 'قادمة')} items={upcoming} />
        <Section title={t('Completed', 'مكتملة')} items={done} />
      </div>
    </div>
  );
}
