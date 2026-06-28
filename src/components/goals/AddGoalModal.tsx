import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, Target } from 'lucide-react';
import { Goal, GoalPriority, Milestone } from '../../types';
import { deriveGoalMeta } from '../../lib/goals';
import MilestoneList from './MilestoneList';

interface AddGoalModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (goal: Goal) => Promise<void>;
  language?: string;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'medium' as GoalPriority,
  deadline: '',
  milestones: [] as Milestone[],
};

export default function AddGoalModal({ open, onClose, onSave, language }: AddGoalModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isArabic = language === 'Arabic' || language === 'Egyptian Ammiya';

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError(isArabic ? 'اسم الهدف مطلوب' : 'Goal title is required');
      return;
    }
    if (!form.deadline) {
      setError(isArabic ? 'الموعد النهائي مطلوب' : 'Deadline is required');
      return;
    }

    setSaving(true);
    setError('');

    const { progress, status } = deriveGoalMeta(form.milestones, form.deadline);

    const goal: Goal = {
      id: Date.now().toString(),
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      deadline: form.deadline,
      createdAt: new Date().toISOString(),
      milestones: form.milestones,
      progress,
      status,
    };

    try {
      await onSave(goal);
      handleClose();
    } catch {
      setError(isArabic ? 'حدث خطأ، حاول مرة أخرى' : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const priorityOptions: { value: GoalPriority; label: string; color: string }[] = [
    { value: 'low',    label: isArabic ? 'منخفض' : 'Low',    color: 'border-border bg-surface-2 text-success' },
    { value: 'medium', label: isArabic ? 'متوسط' : 'Medium', color: 'border-amber-200 bg-amber-50 text-amber-700' },
    { value: 'high',   label: isArabic ? 'عالي' : 'High',   color: 'border-danger/20 bg-danger-soft text-danger' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative bg-white rounded-[32px] w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-8 pb-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary-soft rounded-2xl">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  {isArabic ? 'هدف جديد' : 'New Goal'}
                </h2>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {isArabic ? 'اسم الهدف' : 'Goal Title'} *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={isArabic ? 'مثال: تعلم تعلم الآلة' : 'e.g. Learn Machine Learning'}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-primary placeholder:font-normal placeholder:text-slate-300"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {isArabic ? 'الوصف' : 'Description'}
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={isArabic ? 'وصف مختصر للهدف...' : 'Brief description of your goal...'}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-primary resize-none placeholder:text-slate-300"
                />
              </div>

              {/* Priority + Deadline */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {isArabic ? 'الأولوية' : 'Priority'}
                  </label>
                  <div className="flex flex-col gap-1.5">
                    {priorityOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm({ ...form, priority: opt.value })}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                          form.priority === opt.value
                            ? opt.color
                            : 'border-slate-100 bg-white text-slate-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {isArabic ? 'الموعد النهائي' : 'Deadline'} *
                  </label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Milestones */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {isArabic ? 'الخطوات (Milestones)' : 'Milestones'}
                </label>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                  <MilestoneList
                    milestones={form.milestones}
                    onChange={(ms) => setForm({ ...form, milestones: ms })}
                    language={language}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-danger font-bold px-1">{error}</p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all"
                >
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest text-white bg-slate-900 hover:bg-black transition-all shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {isArabic ? 'جاري الحفظ...' : 'Saving...'}</>
                  ) : (
                    isArabic ? 'حفظ الهدف' : 'Save Goal'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}