import { Goal } from '../../types';
import { isGoalOverdue } from '../../lib/goals';
import { Target, CheckCircle2, Loader2 as InProgress, Circle, AlertTriangle } from 'lucide-react';

interface GoalStatsProps {
  goals: Goal[];
  language?: string;
}

export default function GoalStats({ goals, language }: GoalStatsProps) {
  const isArabic = language === 'Arabic' || language === 'Egyptian Ammiya';

  const total     = goals.length;
  const completed = goals.filter((g) => g.status === 'completed').length;
  const inProg    = goals.filter((g) => g.status === 'in-progress').length;
  const notStart  = goals.filter((g) => g.status === 'not-started').length;
  const overdue   = goals.filter(isGoalOverdue).length;

  const cards = [
    {
      label: isArabic ? 'إجمالي الأهداف' : 'Total Goals',
      value: total,
      icon: Target,
      color: 'text-slate-700',
      bg: 'bg-slate-50',
      border: 'border-slate-100',
      iconBg: 'bg-slate-100',
    },
    {
      label: isArabic ? 'مكتملة' : 'Completed',
      value: completed,
      icon: CheckCircle2,
      color: 'text-success',
      bg: 'bg-surface-2',
      border: 'border-border',
      iconBg: 'bg-surface-3',
    },
    {
      label: isArabic ? 'قيد التنفيذ' : 'In Progress',
      value: inProg,
      icon: InProgress,
      color: 'text-primary',
      bg: 'bg-surface-3/60',
      border: 'border-border',
      iconBg: 'bg-surface-3',
    },
    {
      label: isArabic ? 'لم تبدأ' : 'Not Started',
      value: notStart,
      icon: Circle,
      color: 'text-slate-500',
      bg: 'bg-slate-50',
      border: 'border-slate-100',
      iconBg: 'bg-slate-100',
    },
    {
      label: isArabic ? 'متأخرة' : 'Overdue',
      value: overdue,
      icon: AlertTriangle,
      color: 'text-danger',
      bg: 'bg-danger-soft',
      border: 'border-danger/20',
      iconBg: 'bg-danger-soft',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`${card.bg} ${card.border} border rounded-[28px] p-5 flex flex-col gap-3 shadow-sm`}
        >
          <div className={`${card.iconBg} w-9 h-9 rounded-2xl flex items-center justify-center`}>
            <card.icon className={`w-4 h-4 ${card.color}`} />
          </div>
          <div>
            <div className={`text-3xl font-black ${card.color}`}>{card.value}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              {card.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}