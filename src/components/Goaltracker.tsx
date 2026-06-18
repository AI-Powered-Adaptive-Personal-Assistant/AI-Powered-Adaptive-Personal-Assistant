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
      isArabic
        ? 'هل أنت متأكد من حذف هذا الهدف؟'
        : 'Are you sure you want to delete this goal?'
    );
    if (!confirmed) return;
    await deleteGoal(profile.uid, goalId);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-slate-50 flex flex-col custom-scrollbar">
      {/* Header */}
      <header className="p-6 md:p-10 pb-0 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 mt-1 text-slate-500 bg-white shadow-sm border border-slate-200 hover:bg-slate-50 rounded-lg active:scale-95"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase">
                {isArabic ? 'متتبع الأهداف' : 'Goal Tracker'}
              </h1>
              <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">
                {isArabic
                  ? 'تابع أهدافك الدراسية والشخصية وحقق تقدمًا ملموسًا'
                  : 'Track your academic and personal goals with clear milestones'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-primary/20 hover:shadow-none active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {isArabic ? 'هدف جديد' : 'New Goal'}
          </button>
        </div>
      </header>

      <div className="flex-1 p-6 md:p-10 space-y-8 pb-20">
        {/* Statistics */}
        <GoalStats goals={goals} language={profile.language} />

        {/* Goals list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400 font-bold text-xs uppercase tracking-widest">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span>{isArabic ? 'جاري تحميل الأهداف...' : 'Loading goals...'}</span>
          </div>
        ) : goals.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 gap-6 border-2 border-dashed border-slate-200 rounded-[40px]">
            <div className="p-5 bg-slate-100 rounded-[28px]">
              <Target className="w-10 h-10 text-slate-400" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                {isArabic ? 'لا توجد أهداف بعد' : 'No goals yet'}
              </h3>
              <p className="text-sm text-slate-400 font-medium max-w-xs">
                {isArabic
                  ? 'ابدأ بإضافة هدفك الأول وتقسيمه إلى خطوات واضحة'
                  : 'Start by adding your first goal and breaking it into clear milestones'}
              </p>
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              {isArabic ? 'أضف هدفك الأول' : 'Add Your First Goal'}
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