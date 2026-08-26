import React from 'react';
import { SubjectType, SubjectProfile, SUBJECT_META } from '../../types/learning';
import { Star, ArrowRight, Trophy, Zap, Award } from 'lucide-react';

interface SubjectCardProps {
  subject: SubjectType;
  profile: SubjectProfile;
  onSelect: (subject: SubjectType) => void;
  isArabic?: boolean;
}

export const SubjectCard: React.FC<SubjectCardProps> = ({
  subject,
  profile,
  onSelect,
  isArabic = false,
}) => {
  const meta = SUBJECT_META[subject];
  const accuracyPercent = Math.round(profile.accuracyRate * 100);

  return (
    <div
      onClick={() => onSelect(subject)}
      className={`group relative p-5 sm:p-6 rounded-3xl bg-slate-900/90 hover:bg-slate-850 border-2 ${meta.borderColor} hover:border-indigo-400 transition-all duration-300 transform hover:-translate-y-1.5 shadow-xl hover:shadow-2xl cursor-pointer flex flex-col justify-between overflow-hidden`}
    >
      {/* Background ambient glow */}
      <div className={`absolute top-0 right-0 w-32 h-32 ${meta.bgColor} rounded-full blur-3xl -z-10 group-hover:scale-150 transition-all duration-500`} />

      <div>
        {/* Top bar with Icon & Level */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className={`w-14 h-14 rounded-2xl ${meta.bgColor} flex items-center justify-center text-3xl shadow-inner border border-white/10 group-hover:scale-110 transition-transform`}>
            {meta.icon}
          </div>

          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1 text-xs font-black text-amber-400">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span>Level {profile.currentDifficulty}/5</span>
            </div>
            <span className="text-[11px] text-slate-400 font-semibold">
              {profile.sessionsCompleted} {isArabic ? 'جلسات مكتملة' : 'Sessions'}
            </span>
          </div>
        </div>

        {/* Subject Title */}
        <h3 className="text-xl font-black text-white group-hover:text-indigo-300 transition-colors mb-1">
          {isArabic ? meta.labelAr : meta.label}
        </h3>

        <p className="text-xs text-slate-400 font-medium mb-4">
          {profile.strongTopics.length > 0
            ? `${isArabic ? 'نقاط القوة:' : 'Mastered:'} ${profile.strongTopics.slice(0, 2).join(', ')}`
            : isArabic
            ? 'ابدأ التعلّم التفاعلي والممتع!'
            : 'Start interactive personalized learning!'}
        </p>
      </div>

      {/* Progress & Start CTA */}
      <div>
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1.5">
          <span>{isArabic ? 'الدقة والإتقان' : 'Mastery'}</span>
          <span className={`${accuracyPercent >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {profile.totalAnswers > 0 ? `${accuracyPercent}%` : isArabic ? 'جديد' : 'New'}
          </span>
        </div>

        {/* Accuracy Progress Track */}
        <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 mb-4">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(8, accuracyPercent)}%` }}
          />
        </div>

        <button
          className={`w-full py-2.5 rounded-xl ${meta.bgColor} group-hover:bg-indigo-600 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 border border-white/10 transition-all shadow-md`}
        >
          <span>{isArabic ? 'ابدأ التحدي الآن' : 'Start Adventure'}</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};

export default SubjectCard;
