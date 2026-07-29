import { localize } from '../lib/translations';
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { UserProfile, Goal } from '../types';
import { subscribeToGoals, saveGoal, updateGoal, deleteGoal } from '../lib/goals';
import GoalStats from './goals/GoalStats';
import GoalCard from './goals/GoalCard';
import AddGoalModal from './goals/AddGoalModal';
import EditGoalModal from './goals/EditGoalModal';
import { Plus, Target, Loader2, Menu } from 'lucide-react';

interface GoalTrackerProps {
  profile: UserProfile;
  onMenuClick?: () => void;
}

export default function GoalTracker({ profile, onMenuClick }: GoalTrackerProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';

  // Real-time subscription to goals
  useEffect(() => {
    if (!profile.uid) return;
    setLoading(true);

    const unsubscribe = subscribeToGoals(
      profile.uid,
      (updatedGoals) => {
        setGoals(updatedGoals);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsubscribe();
  }, [profile.uid]);

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleAddGoal = async (goal: Goal) => {
    await saveGoal(profile.uid, goal);
    // Firestore subscription will update local state automatically
  };

  const handleUpdateGoal = async (goalId: string, updates: Partial<Goal>) => {
    await updateGoal(profile.uid, goalId, updates);
  };

  const handleDeleteGoal = async (goalId: string) => {
    const confirmed = window.confirm(
      localize(profile.language, 'Are you sure you want to delete this goal?', 'هل أنت متأكد من حذف هذا الهدف؟')
    );
    if (!confirmed) return;
    await deleteGoal(profile.uid, goalId);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-bg-main flex flex-col custom-scrollbar">
      {/* Header */}
      <header className="p-6 md:p-10 pb-0 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={onMenuClick}
              className="p-2 mt-1 text-text-muted bg-bg-card shadow-sm border border-border hover:bg-bg-main rounded-lg active:scale-95"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl md:text-4xl font-black text-text-main tracking-tighter uppercase">
                {localize(profile.language, 'Goal Tracker', 'متتبع الأهداف')}
              </h1>
              <p className="text-xs md:text-sm text-text-muted font-medium mt-1">
                {localize(profile.language, 'Track your academic and personal goals with clear milestones', 'تابع أهدافك الدراسية والشخصية وحقق تقدمًا ملموسًا')}
              </p>
            </div>
          </div>

          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-primary/20 hover:shadow-none active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {localize(profile.language, 'New Goal', 'هدف جديد')}
          </button>
        </div>
      </header>

      <div className="flex-1 p-6 md:p-10 space-y-8 pb-20">
        {/* Statistics */}
        <GoalStats goals={goals} language={profile.language} />

        {/* Goals list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-faint font-bold text-xs uppercase tracking-widest">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span>{localize(profile.language, 'Loading goals...', 'جاري تحميل الأهداف...')}</span>
          </div>
        ) : goals.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 gap-6 border-2 border-dashed border-border rounded-[40px]">
            <div className="p-5 bg-surface-3 rounded-[28px]">
              <Target className="w-10 h-10 text-faint" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-black text-text-main uppercase tracking-tight">
                {localize(profile.language, 'No goals yet', 'لا توجد أهداف بعد')}
              </h3>
              <p className="text-sm text-faint font-medium max-w-xs">
                {localize(profile.language, 'Start by adding your first goal and breaking it into clear milestones', 'ابدأ بإضافة هدفك الأول وتقسيمه إلى خطوات واضحة')}
              </p>
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              {localize(profile.language, 'Add Your First Goal', 'أضف هدفك الأول')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AnimatePresence>
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  uid={profile.uid}
                  onEdit={setEditingGoal}
                  onDelete={handleDeleteGoal}
                  language={profile.language}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddGoalModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAddGoal}
        language={profile.language}
      />

      <EditGoalModal
        goal={editingGoal}
        onClose={() => setEditingGoal(null)}
        onSave={handleUpdateGoal}
        language={profile.language}
      />
    </div>
  );
}