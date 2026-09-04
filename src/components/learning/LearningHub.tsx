import React, { useState, useEffect } from 'react';
import { UserProfile } from '../../types';
import { SubjectType, LearningProfile, createDefaultLearningProfile } from '../../types/learning';
import { subscribeLearningProfile, finishLearningSession } from '../../lib/learningProfile';
import SubjectCard from './SubjectCard';
import MathModule from './modules/MathModule';
import ReadingModule from './modules/ReadingModule';
import WritingModule from './modules/WritingModule';
import MemoryModule from './modules/MemoryModule';
import ComprehensionModule from './modules/ComprehensionModule';
import ScienceModule from './modules/ScienceModule';
import EnglishModule from './modules/EnglishModule';
import ParentDashboard from './ParentDashboard';
import {
  GraduationCap, Star, Flame, Trophy, ShieldCheck, ArrowLeft, Menu, Sparkles, HeartHandshake,
} from 'lucide-react';

interface LearningHubProps {
  profile: UserProfile | null;
  onMenuClick?: () => void;
  onNavigateBack?: () => void;
}

const ALL_SUBJECTS: SubjectType[] = [
  'math',
  'reading',
  'writing',
  'memory',
  'comprehension',
  'science',
  'english',
];

export const LearningHub: React.FC<LearningHubProps> = ({ profile, onMenuClick, onNavigateBack }) => {
  const isArabic = profile?.language === 'Arabic' || profile?.language === 'Egyptian Ammiya';
  const userId = profile?.uid || profile?.email || 'guest_child';
  const childName = profile?.name || (isArabic ? 'البطل' : 'Champion');

  const [learningProfile, setLearningProfile] = useState<LearningProfile>(createDefaultLearningProfile());
  const [activeSubject, setActiveSubject] = useState<SubjectType | null>(null);
  const [isParentDashboardOpen, setIsParentDashboardOpen] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());

  // Subscribe to realtime learning profile from Firestore / LocalStorage
  useEffect(() => {
    const unsub = subscribeLearningProfile(userId, (updated) => {
      setLearningProfile(updated);
    });
    return () => unsub();
  }, [userId]);

  const handleSelectSubject = (subj: SubjectType) => {
    setActiveSubject(subj);
    setSessionStartTime(Date.now());
  };

  const handleBackToHub = async () => {
    if (activeSubject) {
      const durationMin = (Date.now() - sessionStartTime) / 60000;
      await finishLearningSession(userId, activeSubject, durationMin, learningProfile);
    }
    setActiveSubject(null);
  };

  const handleUpdateProfile = (updated: LearningProfile) => {
    setLearningProfile(updated);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-white overflow-y-auto relative p-3 sm:p-5 lg:p-8 select-none font-sans">
      {/* Top Banner & Header */}
      <header className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800 flex-wrap">
        <div className="flex items-center gap-3">
          {onNavigateBack && (
            <button
              onClick={onNavigateBack}
              className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5 font-bold text-xs transition-all shadow-md active:scale-95 shrink-0"
              title={isArabic ? 'العودة للمساعد' : 'Back to Assistant'}
            >
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
              <span className="hidden sm:inline">{isArabic ? 'العودة للمساعد' : 'Back to Assistant'}</span>
            </button>
          )}

          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white shrink-0 active:scale-95"
              aria-label={isArabic ? 'القائمة' : 'Menu'}
              title={isArabic ? 'فتح القائمة' : 'Open Menu'}
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {activeSubject ? (
            <button
              onClick={handleBackToHub}
              className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-2 font-bold text-xs transition-all shadow-md active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{isArabic ? 'العودة للمواد' : 'Back to Subjects'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                  <span>{isArabic ? 'مركز التعلّم الذكي' : 'Adaptive Learning Hub'}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-extrabold border border-indigo-500/30">
                    AI Tutor
                  </span>
                </h1>
                <p className="text-xs text-slate-400 font-medium">
                  {isArabic ? `مرحباً بك يا ${childName}! رحلتك التعليمية الممتعة` : `Welcome back, ${childName}! Your personalized adventure`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Pills: Stars, Streak, Parent Portal */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Total Stars Pill */}
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-black text-xs sm:text-sm shadow-md">
            <Star className="w-4 h-4 fill-amber-400" />
            <span>{learningProfile.totalStarsEarned} {isArabic ? 'نجمة' : 'Stars'}</span>
          </div>

          {/* Daily Streak Pill */}
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-orange-500/15 border border-orange-500/30 text-orange-400 font-black text-xs sm:text-sm shadow-md">
            <Flame className="w-4 h-4 fill-orange-400" />
            <span>{learningProfile.streakDays} {isArabic ? 'أيام متتالية' : 'Day Streak'}</span>
          </div>

          {/* Parent Portal Button */}
          <button
            onClick={() => setIsParentDashboardOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-black text-xs sm:text-sm transition-all shadow-md active:scale-95"
          >
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span>{isArabic ? 'لوحة الأهل والمعلم' : 'Parent Portal'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      {!activeSubject ? (
        /* Subject Selection Grid */
        <div className="flex-1 flex flex-col">
          {/* Welcome Banner */}
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-slate-900/90 border-2 border-indigo-500/30 shadow-2xl mb-8 flex items-center justify-between gap-6 flex-wrap">
            <div className="max-w-xl">
              <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-black text-xs border border-indigo-500/30 mb-3 inline-block">
                ✨ {isArabic ? 'معلم الذكاء الاصطناعي الخاص بك' : 'Your Personal AI Tutor'}
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mb-2 leading-tight">
                {isArabic
                  ? 'اختر مادتك المفضلة وانطلق في مغامرة التعلّم!'
                  : 'Choose a Subject & Begin Your Learning Adventure!'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
                {isArabic
                  ? 'يقوم المعلم الذكي بتحليل أدائك وتعديل مستوى الصعوبة والشرح البصري والصوتي ليناسب قدراتك تماماً.'
                  : 'The AI tutor continuously adapts difficulty, visual explanations, and audio aids tailored to your exact learning style.'}
              </p>
            </div>

            <div className="flex items-center gap-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800 shadow-inner">
              <HeartHandshake className="w-8 h-8 text-pink-400" />
              <div>
                <p className="text-xs font-bold text-slate-400">{isArabic ? 'النمط التعليمي' : 'Learning Style'}</p>
                <p className="text-sm font-black text-purple-300 capitalize">{learningProfile.preferredLearningStyle}</p>
              </div>
            </div>
          </div>

          {/* 7 Subjects Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-8">
            {ALL_SUBJECTS.map((subj) => (
              <SubjectCard
                key={subj}
                subject={subj}
                profile={learningProfile.subjects[subj]}
                onSelect={handleSelectSubject}
                isArabic={isArabic}
              />
            ))}
          </div>
        </div>
      ) : (
        /* Active Subject Module Execution */
        <div className="flex-1 flex flex-col">
          {activeSubject === 'math' && (
            <MathModule
              userId={userId}
              learningProfile={learningProfile}
              onUpdateProfile={handleUpdateProfile}
              onBack={handleBackToHub}
              isArabic={isArabic}
            />
          )}

          {activeSubject === 'reading' && (
            <ReadingModule
              userId={userId}
              learningProfile={learningProfile}
              onUpdateProfile={handleUpdateProfile}
              onBack={handleBackToHub}
              isArabic={isArabic}
            />
          )}

          {activeSubject === 'writing' && (
            <WritingModule
              userId={userId}
              learningProfile={learningProfile}
              onUpdateProfile={handleUpdateProfile}
              onBack={handleBackToHub}
              isArabic={isArabic}
            />
          )}

          {activeSubject === 'memory' && (
            <MemoryModule
              userId={userId}
              learningProfile={learningProfile}
              onUpdateProfile={handleUpdateProfile}
              onBack={handleBackToHub}
              isArabic={isArabic}
            />
          )}

          {activeSubject === 'comprehension' && (
            <ComprehensionModule
              userId={userId}
              learningProfile={learningProfile}
              onUpdateProfile={handleUpdateProfile}
              onBack={handleBackToHub}
              isArabic={isArabic}
            />
          )}

          {activeSubject === 'science' && (
            <ScienceModule
              userId={userId}
              learningProfile={learningProfile}
              onUpdateProfile={handleUpdateProfile}
              onBack={handleBackToHub}
              isArabic={isArabic}
            />
          )}

          {activeSubject === 'english' && (
            <EnglishModule
              userId={userId}
              learningProfile={learningProfile}
              onUpdateProfile={handleUpdateProfile}
              onBack={handleBackToHub}
              isArabic={isArabic}
            />
          )}
        </div>
      )}

      {/* Parent / Teacher Dashboard Modal */}
      {isParentDashboardOpen && (
        <ParentDashboard
          userId={userId}
          learningProfile={learningProfile}
          childName={childName}
          onClose={() => setIsParentDashboardOpen(false)}
          isArabic={isArabic}
        />
      )}
    </div>
  );
};

export default LearningHub;
