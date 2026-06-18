import { useState } from 'react';
import { Milestone } from '../../types';
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';

interface MilestoneListProps {
  milestones: Milestone[];
  onChange: (milestones: Milestone[]) => void;
  /** When true, milestones are read-only checkboxes (used in GoalCard). */
  readOnly?: boolean;
  language?: string;
}

export default function MilestoneList({
  milestones,
  onChange,
  readOnly = false,
  language,
}: MilestoneListProps) {
  const [newTitle, setNewTitle] = useState('');
  const isArabic = language === 'Arabic' || language === 'Egyptian Ammiya';

  const toggleMilestone = (id: string) => {
    onChange(
      milestones.map((m) =>
        m.id === id ? { ...m, completed: !m.completed } : m
      )
    );
  };

  const addMilestone = () => {
    const title = newTitle.trim();
    if (!title) return;
    const milestone: Milestone = {
      id: Date.now().toString(),
      title,
      completed: false,
    };
    onChange([...milestones, milestone]);
    setNewTitle('');
  };

  const removeMilestone = (id: string) => {
    onChange(milestones.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-2">
      {milestones.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-3 group"
        >
          <button
            type="button"
            onClick={() => toggleMilestone(m.id)}
            className="flex-shrink-0 transition-transform active:scale-90"
          >
            {m.completed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <Circle className="w-5 h-5 text-slate-300" />
            )}
          </button>

          <span
            className={`flex-1 text-sm font-medium transition-colors ${
              m.completed ? 'line-through text-slate-400' : 'text-slate-700'
            }`}
          >
            {m.title}
          </span>

          {!readOnly && (
            <button
              type="button"
              onClick={() => removeMilestone(m.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-50 rounded-lg text-rose-400 hover:text-rose-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {!readOnly && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMilestone())}
            placeholder={isArabic ? 'أضف خطوة جديدة...' : 'Add a milestone...'}
            className="flex-1 text-sm bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 outline-none focus:border-primary text-slate-800 placeholder:text-slate-300 font-medium"
          />
          <button
            type="button"
            onClick={addMilestone}
            className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}