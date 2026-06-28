import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Goal } from '../../types';
import { isGoalOverdue, deriveGoalMeta, updateGoal } from '../../lib/goals';
import MilestoneList from './MilestoneList';
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  Trash2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Circle,
} from 'lucide-react';

interface GoalCardProps {
  goal: Goal;
  uid: string;
  onEdit: (goal: Goal) => void;
  onDelete: (goalId: string) => void;
  language?: string;
}

const PRIORITY_STYLES = {
  low:    { label: 'Low',    color: 'text-success bg-surface-2 border-border' },
  medium: { label: 'Medium', color: 'text-amber-600 bg-amber-50 border-amber-100' },
  high:   { label: 'High',   color: 'text-danger bg-danger-soft border-danger/20' },
};

const STATUS_ICON = {
  'not-started': <Circle className="w-4 h-4 text-slate-300" />,
  'in-progress': <Clock className="w-4 h-4 text-primary" />,
  'completed':   <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
};

export default function GoalCard({ goal, uid, onEdit, onDelete, language }: GoalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [localGoal, setLocalGoal] = useState<Goal>(goal);
  const overdue = isGoalOverdue(localGoal);
  const isArabic = language === 'Arabic' || language === 'Egyptian Ammiya';

  // Keep local state in sync when parent passes a new goal object (e.g. after Firestore update)
  if (goal.id === localGoal.id && JSON.stringify(goal) !== JSON.stringify(localGoal)) {
    setLocalGoal(goal);
  }

  const handleMilestoneChange = async (milestones: typeof goal.milestones) => {
    const { progress, status } = deriveGoalMeta(milestones, localGoal.deadline);
    const updated: Goal = { ...localGoal, milestones, progress, status };
    setLocalGoal(updated); // optimistic local update
    await updateGoal(uid, localGoal.id, { milestones, progress, status });
  };

  const pri = PRIORITY_STYLES[localGoal.priority];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`bg-white border rounded-[28px] shadow-sm overflow-hidden transition-shadow hover:shadow-md ${
        overdue ? 'border-danger/20' : 'border-slate-100'
      }`}
    >
      {/* Card header */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          {/* Left: status icon + title */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="mt-0.5 flex-shrink-0">{STATUS_ICON[localGoal.status]}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="text-sm font-black text-slate-900 truncate">{localGoal.title}</h3>
                {overdue && (
                  <span className="flex items-center gap-1 text-[10px] font-black text-danger bg-danger-soft border border-danger/20 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3 h-3" />
                    {isArabic ? 'متأخر' : 'Overdue'}
                  </span>
                )}
              </div>
              {localGoal.description && (
                <p className="text-xs text-slate-400 font-medium line-clamp-1">{localGoal.description}</p>
              )}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(localGoal)}
              className="p-2 rounded-xl hover:bg-amber-50 hover:text-amber-600 text-slate-300 transition-colors"
              title={isArabic ? 'تعديل' : 'Edit'}
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(localGoal.id)}
              className="p-2 rounded-xl hover:bg-danger-soft hover:text-danger text-slate-300 transition-colors"
              title={isArabic ? 'حذف' : 'Delete'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setExpanded((p) => !p)}
              className="p-2 rounded-xl hover:bg-slate-50 text-slate-400 transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
            <span>{isArabic ? 'التقدم' : 'Progress'}</span>
            <span>{localGoal.progress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                localGoal.status === 'completed'
                  ? 'bg-emerald-500'
                  : overdue
                  ? 'bg-rose-400'
                  : 'bg-primary'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${localGoal.progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className={`text-[10px] font-black border px-2.5 py-1 rounded-full uppercase tracking-widest ${pri.color}`}>
            {isArabic
              ? localGoal.priority === 'low' ? 'منخفض' : localGoal.priority === 'medium' ? 'متوسط' : 'عالي'
              : pri.label}
          </span>

          {localGoal.milestones.length > 0 && (
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-full">
              {localGoal.milestones.filter((m) => m.completed).length} / {localGoal.milestones.length}{' '}
              {isArabic ? 'خطوات' : 'milestones'}
            </span>
          )}

          <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 ms-auto">
            <Calendar className="w-3 h-3" />
            {new Date(localGoal.deadline).toLocaleDateString(
              isArabic ? 'ar-EG' : 'en-GB',
              { day: 'numeric', month: 'short', year: 'numeric' }
            )}
          </span>
        </div>
      </div>

      {/* Expandable milestones */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="milestones"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 pt-0 border-t border-slate-50">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 mt-4 mb-3">
                {isArabic ? 'الخطوات' : 'Milestones'}
              </p>
              {localGoal.milestones.length === 0 ? (
                <p className="text-xs text-slate-300 italic font-medium">
                  {isArabic ? 'لا توجد خطوات بعد' : 'No milestones added yet'}
                </p>
              ) : (
                <MilestoneList
                  milestones={localGoal.milestones}
                  onChange={handleMilestoneChange}
                  language={language}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}