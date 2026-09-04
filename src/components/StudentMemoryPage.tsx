import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, StudentMemory } from '../types';
import { localize } from '../lib/translations';
import { toast } from './Toast';
import {
  updateStudentMemory,
  addMemoryItem,
  deleteMemoryItem,
  toggleMemoryEnabled,
} from '../lib/memory';
import {
  Brain,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  BookOpen,
  Target,
  UserCheck,
  Globe,
  Sliders,
  AlertTriangle,
  Menu,
  ArrowLeft,
} from 'lucide-react';

interface StudentMemoryPageProps {
  profile: UserProfile;
  memory: StudentMemory | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onMenuClick?: () => void;
  onNavigateBack?: () => void;
}

export default function StudentMemoryPage({
  profile,
  memory,
  loading,
  error,
  onRetry,
  onMenuClick,
  onNavigateBack,
}: StudentMemoryPageProps) {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Input states for adding items to the 3 list categories
  const [newGoal, setNewGoal] = useState('');
  const [newPreference, setNewPreference] = useState('');
  const [newConfirmedInfo, setNewConfirmedInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preferred Language & Explanation Style dropdown / select options
  const languageOptions = [
    'English',
    'Arabic',
    'Egyptian Arabic',
    'French',
    'Spanish',
    'German',
  ];

  const styleOptions = [
    'Practical examples first',
    'Deep academic explanation',
    'Short and direct sentences',
    'Step-by-step visual breakdown',
    'Socratic question-guided learning',
  ];

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted">
        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-4" />
        <p className="text-sm font-medium">
          {localize(profile.language, 'Loading your memory profile from Firestore...', 'جاري تحميل ملف الذاكرة من فايراستور...')}
        </p>
      </div>
    );
  }

  if (error || !memory) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-lg mx-auto text-center">
        <div className="w-14 h-14 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mb-4">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-text-main mb-2">
          {localize(profile.language, 'Unable to Load Cognify Memory', 'تعذر تحميل ذاكرة كوجنيفي')}
        </h3>
        <p className="text-sm text-text-muted mb-6">
          {error || localize(profile.language, 'Firestore connection is offline or unavailable. Cognify Memory requires an active cloud connection and will not fall back to unverified local memory.', 'الاتصال بفايراستور غير متاح حالياً. تتطلب الذاكرة اتصالاً سحابياً نشطاً.')}
        </p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-press transition-colors shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          {localize(profile.language, 'Retry Connection', 'إعادة المحاولة')}
        </button>
      </div>
    );
  }

  const handleToggle = async () => {
    if (!profile?.uid || !memory) return;
    try {
      setIsSubmitting(true);
      await toggleMemoryEnabled(profile.uid, !memory.enabled);
      toast.success(
        !memory.enabled
          ? localize(profile.language, 'Cognify Memory enabled.', 'تم تفعيل ذاكرة كوجنيفي.')
          : localize(profile.language, 'Cognify Memory disabled.', 'تم تعطيل ذاكرة كوجنيفي.'),
        localize(profile.language, 'Memory Updated', 'تم تحديث الذاكرة')
      );
    } catch (err) {
      console.error('Failed to toggle memory:', err);
      toast.error(
        localize(profile.language, 'Failed to update memory setting.', 'فشل تحديث إعداد الذاكرة.'),
        localize(profile.language, 'Error', 'خطأ')
      );
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  };

  const handleLanguageChange = async (newLang: string) => {
    if (!profile?.uid) return;
    try {
      await updateStudentMemory(profile.uid, { preferredLanguage: newLang });
      toast.success(
        localize(profile.language, 'Language preference saved.', 'تم حفظ لغة الشرح المفضلة.'),
        localize(profile.language, 'Saved', 'تم الحفظ')
      );
    } catch (err) {
      console.error('Failed to update language preference:', err);
      toast.error(
        localize(profile.language, 'Failed to save language preference.', 'فشل حفظ لغة الشرح المفضلة.'),
        localize(profile.language, 'Error', 'خطأ')
      );
    }
  };

  const handleStyleChange = async (newStyle: string) => {
    if (!profile?.uid) return;
    try {
      await updateStudentMemory(profile.uid, { explanationStyle: newStyle });
      toast.success(
        localize(profile.language, 'Style preference saved.', 'تم حفظ أسلوب الشرح المفضل.'),
        localize(profile.language, 'Saved', 'تم الحفظ')
      );
    } catch (err) {
      console.error('Failed to update explanation style:', err);
      toast.error(
        localize(profile.language, 'Failed to save style preference.', 'فشل حفظ أسلوب الشرح.'),
        localize(profile.language, 'Error', 'خطأ')
      );
    }
  };

  const handleAddItem = async (
    category: 'learningGoals' | 'knownPreferences' | 'explicitConfirmedInfo',
    value: string,
    resetFn: () => void
  ) => {
    if (!profile?.uid || !value.trim() || !memory) return;
    try {
      setIsSubmitting(true);
      await addMemoryItem(profile.uid, memory, category, value);
      resetFn();
      toast.success(
        localize(profile.language, 'Item added to memory.', 'تمت إضافة العنصر إلى الذاكرة.'),
        localize(profile.language, 'Added', 'تمت الإضافة')
      );
    } catch (err) {
      console.error(`Failed to add item to ${category}:`, err);
      toast.error(
        localize(profile.language, 'Failed to add item. Check connection.', 'فشل حفظ العنصر. تحقق من الاتصال.'),
        localize(profile.language, 'Error', 'خطأ')
      );
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async (
    category: 'learningGoals' | 'knownPreferences' | 'explicitConfirmedInfo',
    index: number
  ) => {
    if (!profile?.uid || !memory) return;
    try {
      await deleteMemoryItem(profile.uid, memory, category, index);
      toast.success(
        localize(profile.language, 'Item forgotten.', 'تم نسيان العنصر.'),
        localize(profile.language, 'Deleted', 'تم الحذف')
      );
    } catch (err) {
      console.error(`Failed to delete item from ${category}:`, err);
      toast.error(
        localize(profile.language, 'Failed to delete item.', 'فشل حذف العنصر.'),
        localize(profile.language, 'Error', 'خطأ')
      );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3.5">
          {onNavigateBack && (
            <button
              onClick={onNavigateBack}
              className="p-2.5 text-text-muted hover:text-text-main bg-bg-card shadow-sm border border-border hover:bg-surface-2 rounded-xl active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
              title={localize(profile.language, 'Back to Assistant', 'العودة للمساعد')}
            >
              <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
              <span className="text-xs font-bold hidden sm:inline">{localize(profile.language, 'Back', 'رجوع')}</span>
            </button>
          )}
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="p-2.5 text-text-muted bg-bg-card shadow-sm border border-border hover:bg-bg-main rounded-xl active:scale-95 shrink-0"
              aria-label={localize(profile.language, 'Toggle menu', 'القائمة')}
              title={localize(profile.language, 'Open Menu', 'فتح القائمة')}
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 text-primary flex items-center justify-center shrink-0 border border-primary/20">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-main flex items-center gap-2">
              {localize(profile.language, 'Cognify Memory', 'ذاكرة كوجنيفي')}
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-soft text-primary">
                Phase 2
              </span>
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              {localize(
                profile.language,
                'Transparent, privacy-first memory profile stored securely in Firestore.',
                'ذاكرة شفافة وخصوصية أولاً مخزنة بأمان في فايراستور.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Master Privacy Switch Card */}
      <div className="p-5 rounded-2xl bg-bg-card border border-border shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                memory.enabled
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-surface-3 text-text-muted'
              }`}
            >
              {memory.enabled ? <ShieldCheck className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-text-main text-base">
                  {localize(profile.language, 'Memory Personalization Status', 'حالة تخصيص الذاكرة')}
                </h3>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    memory.enabled
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-surface-3 text-text-muted'
                  }`}
                >
                  {memory.enabled
                    ? localize(profile.language, 'Active (Opted In)', 'مفعّل (بموافقتك)')
                    : localize(profile.language, 'Disabled (Privacy Default)', 'معطّل (الافتراضي للخصوصية)')}
                </span>
              </div>
              <p className="text-xs text-text-muted mt-1 leading-relaxed max-w-2xl">
                {localize(
                  profile.language,
                  'When enabled, Cognify passes your stored preferences and goals to the AI during study sessions. When disabled, AI operates without any memory context. Default is privacy-first (Disabled).',
                  'عند التفعيل، يرسل كوجنيفي تفضيلاتك وأهدافك المخزنة للمساعد الذكي أثناء الجلسة. عند التعطيل، يعمل المساعد بدون ذاكرة.'
                )}
              </p>
            </div>
          </div>

          <button
            onClick={handleToggle}
            disabled={isSubmitting}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              memory.enabled ? 'bg-primary' : 'bg-surface-3'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                memory.enabled ? (isAr ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Language & Explanation Style Preferences */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Preferred Language */}
        <div className="p-5 rounded-2xl bg-bg-card border border-border shadow-sm space-y-3">
          <div className="flex items-center gap-2.5 text-text-main font-semibold text-sm">
            <Globe className="w-4 h-4 text-primary" />
            {localize(profile.language, 'Preferred Explanation Language', 'لغة الشرح المفضلة')}
          </div>
          <select
            value={memory.preferredLanguage || 'English'}
            onChange={(e) => handleLanguageChange(e.target.value)}
            disabled={!memory.enabled}
            className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-text-main text-sm font-medium focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {languageOptions.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        {/* Explanation Style */}
        <div className="p-5 rounded-2xl bg-bg-card border border-border shadow-sm space-y-3">
          <div className="flex items-center gap-2.5 text-text-main font-semibold text-sm">
            <Sliders className="w-4 h-4 text-primary" />
            {localize(profile.language, 'Explanation Style Preference', 'أسلوب الشرح المفضل')}
          </div>
          <select
            value={memory.explanationStyle || 'Practical examples first'}
            onChange={(e) => handleStyleChange(e.target.value)}
            disabled={!memory.enabled}
            className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-text-main text-sm font-medium focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {styleOptions.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Memory Category 1: Current Learning Goals */}
      <div className="p-5 rounded-2xl bg-bg-card border border-border shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Target className="w-5 h-5 text-violet-500" />
            <h3 className="font-semibold text-text-main text-base">
              {localize(profile.language, 'Current Learning Goals', 'أهداف التعلم الحالية')}
            </h3>
          </div>
          <span className="text-xs text-text-muted font-medium">
            {memory.learningGoals?.length || 0} {localize(profile.language, 'goals', 'أهداف')}
          </span>
        </div>

        {/* List of goals */}
        <div className="space-y-2">
          {(!memory.learningGoals || memory.learningGoals.length === 0) ? (
            <p className="text-xs text-text-muted italic py-2">
              {localize(profile.language, 'No learning goals specified yet.', 'لم يتم تحديد أهداف تعلم بعد.')}
            </p>
          ) : (
            memory.learningGoals.map((goal, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border/50 text-sm text-text-main"
              >
                <span className="font-medium">{goal}</span>
                <button
                  onClick={() => handleDeleteItem('learningGoals', idx)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                  title={localize(profile.language, 'Forget this goal', 'احذف هذا الهدف')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add goal form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddItem('learningGoals', newGoal, () => setNewGoal(''));
          }}
          className="flex items-center gap-2 pt-2 border-t border-border/40"
        >
          <input
            type="text"
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            placeholder={localize(
              profile.language,
              'Add a learning goal (e.g. Master Calculus Integration)...',
              'أضف هدف تعلم (مثال: إتقان التفاضل والتكامل)...'
            )}
            className="flex-1 px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs text-text-main focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!newGoal.trim() || isSubmitting}
            className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-press transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {localize(profile.language, 'Add Goal', 'إضافة')}
          </button>
        </form>
      </div>

      {/* Memory Category 2: Known Preferences */}
      <div className="p-5 rounded-2xl bg-bg-card border border-border shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-text-main text-base">
              {localize(profile.language, 'Known Preferences', 'التفضيلات المعروفة')}
            </h3>
          </div>
          <span className="text-xs text-text-muted font-medium">
            {memory.knownPreferences?.length || 0} {localize(profile.language, 'items', 'عناصر')}
          </span>
        </div>

        {/* List of preferences */}
        <div className="space-y-2">
          {(!memory.knownPreferences || memory.knownPreferences.length === 0) ? (
            <p className="text-xs text-text-muted italic py-2">
              {localize(profile.language, 'No study preferences added yet.', 'لم يتم إضافة تفضيلات دراسية بعد.')}
            </p>
          ) : (
            memory.knownPreferences.map((pref, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border/50 text-sm text-text-main"
              >
                <span className="font-medium">{pref}</span>
                <button
                  onClick={() => handleDeleteItem('knownPreferences', idx)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                  title={localize(profile.language, 'Forget this preference', 'احذف هذا التفضيل')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add preference form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddItem('knownPreferences', newPreference, () => setNewPreference(''));
          }}
          className="flex items-center gap-2 pt-2 border-t border-border/40"
        >
          <input
            type="text"
            value={newPreference}
            onChange={(e) => setNewPreference(e.target.value)}
            placeholder={localize(
              profile.language,
              'Add a preference (e.g. Prefers bulleted summary at the end)...',
              'أضف تفضيل (مثال: يفضل ملخص نقاط في النهاية)...'
            )}
            className="flex-1 px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs text-text-main focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!newPreference.trim() || isSubmitting}
            className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-press transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {localize(profile.language, 'Add Preference', 'إضافة')}
          </button>
        </form>
      </div>

      {/* Memory Category 3: Explicitly Confirmed Information */}
      <div className="p-5 rounded-2xl bg-bg-card border border-border shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold text-text-main text-base flex items-center gap-2">
              {localize(profile.language, 'Explicitly Confirmed Information', 'المعلومات المؤكدة صراحة')}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                {localize(profile.language, 'Confirmed by You', 'مؤكدة من قبلك')}
              </span>
            </h3>
          </div>
          <span className="text-xs text-text-muted font-medium">
            {memory.explicitConfirmedInfo?.length || 0} {localize(profile.language, 'facts', 'حقائق')}
          </span>
        </div>

        {/* List of confirmed info */}
        <div className="space-y-2">
          {(!memory.explicitConfirmedInfo || memory.explicitConfirmedInfo.length === 0) ? (
            <p className="text-xs text-text-muted italic py-2">
              {localize(profile.language, 'No confirmed student facts added yet.', 'لم يتم إضافة معلومات مؤكدة بعد.')}
            </p>
          ) : (
            memory.explicitConfirmedInfo.map((info, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border/50 text-sm text-text-main"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="font-medium">{info}</span>
                </div>
                <button
                  onClick={() => handleDeleteItem('explicitConfirmedInfo', idx)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                  title={localize(profile.language, 'Forget this item', 'احذف هذه المعلومة')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add confirmed info form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddItem('explicitConfirmedInfo', newConfirmedInfo, () => setNewConfirmedInfo(''));
          }}
          className="flex items-center gap-2 pt-2 border-t border-border/40"
        >
          <input
            type="text"
            value={newConfirmedInfo}
            onChange={(e) => setNewConfirmedInfo(e.target.value)}
            placeholder={localize(
              profile.language,
              'Add confirmed fact (e.g. Preparing for Senior Physics Final)...',
              'أضف حقيقة مؤكدة (مثال: يستعد للامتحان النهائي في الفيزياء)...'
            )}
            className="flex-1 px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs text-text-main focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!newConfirmedInfo.trim() || isSubmitting}
            className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-press transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {localize(profile.language, 'Add Fact', 'إضافة')}
          </button>
        </form>
      </div>

      {/* Footer Timestamp Notice */}
      <div className="text-center text-[11px] text-text-muted pt-2 pb-4">
        {localize(profile.language, 'Last updated in Firestore:', 'آخر تحديث في فايراستور:')}{' '}
        <span className="font-mono">{memory.updatedAt ? new Date(memory.updatedAt).toLocaleString() : 'N/A'}</span>
      </div>
    </div>
  );
}
