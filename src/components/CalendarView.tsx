import { useEffect, useMemo, useState } from 'react';
import { UserProfile, CalendarEvent, CalendarEventType } from '../types';
import { localize } from '../lib/translations';
import { subscribeToEvents, saveEvent, deleteEvent, ymd, monthGrid } from '../lib/calendar';
import { Menu, ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays, Clock } from 'lucide-react';

interface Props {
  profile: UserProfile;
  onMenuClick?: () => void;
}

const TYPE_META: Record<CalendarEventType, { en: string; ar: string; dot: string; chip: string }> = {
  event:    { en: 'Event',    ar: 'حدث',     dot: 'bg-primary',     chip: 'bg-primary-soft text-primary' },
  class:    { en: 'Class',    ar: 'محاضرة',  dot: 'bg-sky-500',     chip: 'bg-sky-500/15 text-sky-500' },
  exam:     { en: 'Exam',     ar: 'امتحان',  dot: 'bg-rose-500',    chip: 'bg-rose-500/15 text-rose-500' },
  task:     { en: 'Task',     ar: 'مهمة',    dot: 'bg-amber-500',   chip: 'bg-amber-500/15 text-amber-500' },
  reminder: { en: 'Reminder', ar: 'تذكير',   dot: 'bg-violet-500',  chip: 'bg-violet-500/15 text-violet-500' },
  personal: { en: 'Personal', ar: 'شخصي',    dot: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-500' },
};
const TYPES = Object.keys(TYPE_META) as CalendarEventType[];

export default function CalendarView({ profile, onMenuClick }: Props) {
  const t = (en: string, ar: string) => localize(profile.language, en, ar);
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';

  const today = new Date();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<string>(ymd(today));

  // Add-event form state
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<CalendarEventType>('event');

  useEffect(() => {
    if (!profile.uid) return;
    return subscribeToEvents(profile.uid, setEvents);
  }, [profile.uid]);

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = m.get(e.date) || [];
      list.push(e);
      m.set(e.date, list);
    }
    // sort each day's events by time
    for (const list of m.values()) list.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    return m;
  }, [events]);

  const selectedEvents = byDate.get(selected) || [];
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' });
  const weekdays = isAr
    ? ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const move = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };
  const goToday = () => {
    const n = new Date();
    setCursor({ year: n.getFullYear(), month: n.getMonth() });
    setSelected(ymd(n));
  };

  const addEvent = async () => {
    if (!profile.uid || !title.trim()) return;
    const ev: CalendarEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      date: selected,
      time: time || undefined,
      type,
      createdAt: new Date().toISOString(),
    };
    setTitle(''); setTime('');
    await saveEvent(profile.uid, ev);
  };

  const prettyDate = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex-1 flex flex-col bg-bg-main overflow-y-auto custom-scrollbar">
      <header className="flex items-center gap-3 p-6 md:p-8 shrink-0">
        <button onClick={onMenuClick} className="lg:hidden p-2 text-text-muted bg-bg-card shadow-sm border border-border hover:bg-bg-main rounded-lg active:scale-95">
          <Menu className="w-6 h-6" />
        </button>
        <div className="p-2.5 bg-primary-soft rounded-xl"><CalendarDays className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="text-xl md:text-2xl font-black text-text-main tracking-tight leading-none">{t('Calendar', 'التقويم')}</h1>
          <p className="text-xs text-text-muted font-medium mt-1">{t('Add anything happening on a day — classes, exams, reminders.', 'ضيف أي حاجة هتحصل في يوم — محاضرات، امتحانات، تذكيرات.')}</p>
        </div>
      </header>

      <div className="px-4 md:px-8 pb-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* Month grid */}
        <div className="bg-bg-card rounded-3xl p-4 md:p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-text-main capitalize">{monthLabel}</h2>
            <div className="flex items-center gap-1">
              <button onClick={goToday} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded-lg bg-bg-main text-text-muted hover:text-text-main border border-border">{t('Today', 'النهاردة')}</button>
              <button onClick={() => move(-1)} className="p-2 rounded-lg hover:bg-bg-main text-text-muted"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => move(1)} className="p-2 rounded-lg hover:bg-bg-main text-text-muted"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekdays.map((w) => <div key={w} className="text-center text-[10px] font-black uppercase tracking-wider text-faint py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d) => {
              const key = ymd(d);
              const inMonth = d.getMonth() === cursor.month;
              const isToday = key === ymd(today);
              const isSelected = key === selected;
              const dayEvents = byDate.get(key) || [];
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`relative aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-colors
                    ${isSelected ? 'bg-primary text-white font-black' : isToday ? 'bg-primary-soft text-primary font-bold' : 'hover:bg-bg-main text-text-main'}
                    ${inMonth ? '' : 'opacity-35'}`}
                >
                  <span>{d.getDate()}</span>
                  {dayEvents.length > 0 && (
                    <span className="absolute bottom-1 flex gap-0.5">
                      {dayEvents.slice(0, 3).map((e, i) => (
                        <span key={i} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : TYPE_META[e.type].dot}`} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day panel */}
        <div className="bg-bg-card rounded-3xl p-5 border border-border shadow-sm flex flex-col">
          <h3 className="text-sm font-black text-text-main mb-1 capitalize">{prettyDate(selected)}</h3>
          <p className="text-[11px] text-text-muted font-medium mb-4">{selectedEvents.length} {t('event(s)', 'حدث')}</p>

          {/* Add form */}
          <div className="space-y-2 mb-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addEvent()}
              placeholder={t('Add an event…', 'ضيف حدث…')}
              className="w-full bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40"
            />
            <div className="flex gap-2">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-28 bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CalendarEventType)}
                className="flex-1 bg-bg-main border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40"
              >
                {TYPES.map((ty) => <option key={ty} value={ty}>{isAr ? TYPE_META[ty].ar : TYPE_META[ty].en}</option>)}
              </select>
            </div>
            <button
              onClick={addEvent}
              disabled={!title.trim()}
              className="w-full px-4 py-2 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-press disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> {t('Add', 'إضافة')}
            </button>
          </div>

          {/* Events list */}
          <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
            {selectedEvents.length === 0 ? (
              <p className="text-faint text-sm text-center py-8">{t('Nothing scheduled. Add your first event above.', 'مفيش حاجة. ضيف أول حدث من فوق.')}</p>
            ) : selectedEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-2xl bg-bg-main border border-border">
                <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_META[e.type].dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text-main text-sm truncate">{e.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${TYPE_META[e.type].chip}`}>{isAr ? TYPE_META[e.type].ar : TYPE_META[e.type].en}</span>
                    {e.time && <span className="flex items-center gap-1 text-[11px] text-text-muted font-medium"><Clock className="w-3 h-3" />{e.time}</span>}
                  </div>
                </div>
                <button
                  onClick={() => profile.uid && deleteEvent(profile.uid, e.id)}
                  className="p-1.5 text-faint hover:text-rose-500 transition-colors shrink-0"
                  title={t('Delete', 'حذف')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
