import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, CognitiveDomainScores } from '../types';
import { localize } from '../lib/translations';
import { toast } from './Toast';
import { getDailyGymWorkout, checkIqCooldownEligibility, GymChallenge } from '../lib/iqAssessment';
import { updateDoc, doc, increment } from 'firebase/firestore';
import { db, cleanDataForFirestore, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Brain,
  Flame,
  Award,
  Zap,
  CheckCircle,
  Clock,
  Sparkles,
  Lock,
  ArrowRight,
  Menu,
  RotateCcw,
  Target,
} from 'lucide-react';

interface CognitiveGymProps {
  profile: UserProfile;
  onMenuClick?: () => void;
  onOpenIqModal: () => void;
}

export default function CognitiveGym({
  profile,
  onMenuClick,
  onOpenIqModal,
}: CognitiveGymProps) {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const historyCount = profile.iqAssessmentHistory?.length || 0;
  const cooldownInfo = checkIqCooldownEligibility(historyCount, profile.lastIqTestDate);

  const todayIso = new Date().toISOString().split('T')[0];
  const isAlreadyCompletedToday = profile.lastGymDate === todayIso;

  const challenge: GymChallenge = getDailyGymWorkout(todayIso);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(isAlreadyCompletedToday);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const handleSubmitAnswer = async () => {
    if (selectedIdx === null || isAnswerSubmitted || !profile.uid) return;

    const correct = selectedIdx === challenge.correctIndex;
    setIsCorrect(correct);
    setIsAnswerSubmitted(true);

    try {
      setIsSubmitting(true);
      const newStreak = (profile.dailyGymStreak || 0) + 1;
      const pointsToAdd = correct ? challenge.pointsReward : 10;

      const updates: any = {
        lastGymDate: todayIso,
        dailyGymStreak: newStreak,
        gymPoints: increment(pointsToAdd),
        points: increment(pointsToAdd),
      };

      await updateDoc(doc(db, 'users', profile.uid), cleanDataForFirestore(updates));

      if (correct) {
        toast.success(
          localize(profile.language, `Spot on! +${pointsToAdd} Cognify points earned.`, `إجابة صحيحة! حصلت على +${pointsToAdd} نقطة كوجنيفي.`),
          localize(profile.language, 'Workout Complete', 'اكتمل التمرين')
        );
      } else {
        toast.info(
          localize(profile.language, `Good try! +10 participation points awarded.`, `محاولة جيدة! حصلت على +10 نقاط للمشاركة.`),
          localize(profile.language, 'Workout Recorded', 'تم تسجيل التمرين')
        );
      }
    } catch (err) {
      console.error('Failed to update gym record:', err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  };

  const domains = profile.cognitiveDomains || {
    fluidReasoning: 65,
    quantitativeLogic: 70,
    workingMemory: 60,
    processingSpeed: 75,
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3.5">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="p-2 text-text-muted bg-bg-card shadow-sm border border-border hover:bg-bg-main rounded-xl active:scale-95 shrink-0 md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-main flex items-center gap-2">
              {localize(profile.language, 'Cognitive Gym', 'الجيم المعرفي اليومي')}
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
                Phase 4
              </span>
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              {localize(
                profile.language,
                'Daily 3-minute mental workouts to maintain sharpness between assessment cycles.',
                'تمارين ذهنية يومية سريعة للحفاظ على التركيز بين فترات تبريد التقييم.'
              )}
            </p>
          </div>
        </div>

        {/* Action button to open full IQ test modal */}
        <button
          onClick={onOpenIqModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-press transition-colors shadow-md shrink-0"
        >
          <Brain className="w-4 h-4" />
          {localize(profile.language, 'Scientific IQ Test', 'اختبار الذكاء المعياري')}
        </button>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Streak */}
        <div className="p-5 rounded-2xl bg-bg-card border border-border shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-text-muted font-semibold">
              {localize(profile.language, 'Daily Streak', 'سلسلة الأيام')}
            </span>
            <div className="text-2xl font-black text-text-main font-mono">
              {profile.dailyGymStreak || 0} {localize(profile.language, 'Days', 'أيام')}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500">
            <Flame className="w-6 h-6" />
          </div>
        </div>

        {/* Gym Points */}
        <div className="p-5 rounded-2xl bg-bg-card border border-border shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-text-muted font-semibold">
              {localize(profile.language, 'Gym Points', 'نقاط الجيم')}
            </span>
            <div className="text-2xl font-black text-primary font-mono">
              {profile.gymPoints || 0} PTS
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        {/* IQ Calibration Status */}
        <div className="p-5 rounded-2xl bg-bg-card border border-border shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-text-muted font-semibold">
              {localize(profile.language, 'Standardized Score', 'الدرجة المعيارية')}
            </span>
            <div className="text-2xl font-black text-indigo-500 font-mono">
              {profile.iqScore ? profile.iqScore : '—'}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
            <Brain className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Today's Daily 3-Minute Challenge Card */}
      <div className="p-6 rounded-3xl bg-bg-card border border-border shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-primary tracking-wider uppercase">
                {localize(profile.language, 'Daily Workout', 'تمرين اليوم')} • +{challenge.pointsReward} PTS
              </span>
              <h3 className="text-base font-bold text-text-main">
                {localize(profile.language, challenge.titleEn, challenge.titleAr)}
              </h3>
            </div>
          </div>

          {isAlreadyCompletedToday && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
              {localize(profile.language, 'Completed Today', 'مكتمل اليوم')}
            </span>
          )}
        </div>

        {/* Challenge Prompt */}
        <div className="p-4 rounded-2xl bg-surface-2 border border-border/80 text-sm font-semibold text-text-main">
          {challenge.question}
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {challenge.options.map((opt, idx) => {
            const isSelected = selectedIdx === idx;
            const isCorrectOption = idx === challenge.correctIndex;
            let btnClasses = 'border-border bg-surface-2 text-text-main hover:bg-surface-3';

            if (isAnswerSubmitted) {
              if (isCorrectOption) {
                btnClasses = 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold';
              } else if (isSelected) {
                btnClasses = 'border-danger bg-danger/15 text-danger font-bold';
              }
            } else if (isSelected) {
              btnClasses = 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20 shadow-sm';
            }

            return (
              <button
                key={idx}
                disabled={isAnswerSubmitted || isSubmitting}
                onClick={() => setSelectedIdx(idx)}
                className={`p-3.5 rounded-xl border text-start text-xs font-medium transition-all ${btnClasses}`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {/* Explanation upon completion */}
        {isAnswerSubmitted && (
          <div className="p-4 rounded-2xl bg-surface-2/60 border border-border/40 text-xs text-text-muted space-y-1">
            <span className="font-bold text-text-main">
              {localize(profile.language, 'Explanation:', 'التوضيح:')}
            </span>
            <p>{challenge.explanation}</p>
          </div>
        )}

        {/* Submit button */}
        {!isAnswerSubmitted && (
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSubmitAnswer}
              disabled={selectedIdx === null || isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-press disabled:opacity-40 shadow-md"
            >
              {localize(profile.language, 'Submit Workout', 'إرسال الإجابة')}
            </button>
          </div>
        )}
      </div>

      {/* 4 Cognitive Sub-Domains Radar / Progress */}
      <div className="p-6 rounded-3xl bg-bg-card border border-border shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text-main flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            {localize(profile.language, 'Cognitive Domain Metrics', 'مقاييس القدرات المعرفية')}
          </h3>
          <span className="text-xs text-text-muted">
            {profile.lastIqTestDate
              ? `${localize(profile.language, 'Last tested:', 'آخر تقييم:')} ${new Date(profile.lastIqTestDate).toLocaleDateString()}`
              : localize(profile.language, 'No formal test taken yet', 'لم يتم إجراء تقييم بعد')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-surface-2 border border-border/50 space-y-2">
            <div className="flex justify-between text-xs font-bold text-text-main">
              <span>{localize(profile.language, 'Fluid Reasoning (Gf)', 'الاستدلال المرن')}</span>
              <span className="font-mono text-primary">{domains.fluidReasoning}%</span>
            </div>
            <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${domains.fluidReasoning}%` }} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-surface-2 border border-border/50 space-y-2">
            <div className="flex justify-between text-xs font-bold text-text-main">
              <span>{localize(profile.language, 'Quantitative Logic (Gq)', 'المنطق الكمي')}</span>
              <span className="font-mono text-indigo-500">{domains.quantitativeLogic}%</span>
            </div>
            <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${domains.quantitativeLogic}%` }} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-surface-2 border border-border/50 space-y-2">
            <div className="flex justify-between text-xs font-bold text-text-main">
              <span>{localize(profile.language, 'Working Memory (Gwm)', 'الذاكرة العاملة')}</span>
              <span className="font-mono text-violet-500">{domains.workingMemory}%</span>
            </div>
            <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${domains.workingMemory}%` }} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-surface-2 border border-border/50 space-y-2">
            <div className="flex justify-between text-xs font-bold text-text-main">
              <span>{localize(profile.language, 'Processing Speed (Gs)', 'سرعة المعالجة')}</span>
              <span className="font-mono text-amber-500">{domains.processingSpeed}%</span>
            </div>
            <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${domains.processingSpeed}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
