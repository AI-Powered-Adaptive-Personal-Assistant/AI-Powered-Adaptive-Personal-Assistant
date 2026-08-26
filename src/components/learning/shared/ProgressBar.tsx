import React from 'react';
import { Star, Flame, Trophy } from 'lucide-react';
import { DifficultyLevel } from '../../../types/learning';
import DifficultyIndicator from './DifficultyIndicator';

interface ProgressBarProps {
  currentQuestion: number;
  totalQuestions: number;
  starsEarned: number;
  streakCount: number;
  difficulty: DifficultyLevel;
  isArabic?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentQuestion,
  totalQuestions,
  starsEarned,
  streakCount,
  difficulty,
  isArabic = false,
}) => {
  const progressPercent = Math.min(100, Math.round((currentQuestion / totalQuestions) * 100));

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800/80 rounded-2xl p-3.5 sm:p-4 mb-5 shadow-lg backdrop-blur-sm">
      {/* Top row with stats & difficulty */}
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Question counter pill */}
          <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold text-xs rounded-full">
            {isArabic
              ? `السؤال ${currentQuestion} من ${totalQuestions}`
              : `Question ${currentQuestion} of ${totalQuestions}`}
          </span>

          <DifficultyIndicator level={difficulty} isArabic={isArabic} />
        </div>

        <div className="flex items-center gap-2.5">
          {/* Streak Flame */}
          {streakCount > 1 && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-orange-500/20 border border-orange-500/40 text-orange-400 font-extrabold text-xs rounded-full animate-bounce">
              <Flame className="w-3.5 h-3.5 fill-orange-400" />
              <span>{streakCount} {isArabic ? 'متتالي' : 'Streak'}</span>
            </div>
          )}

          {/* Stars Counter */}
          <div className="flex items-center gap-1 px-3 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 font-black text-xs rounded-full">
            <Star className="w-3.5 h-3.5 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
            <span>{starsEarned}</span>
          </div>
        </div>
      </div>

      {/* Progress Track */}
      <div className="relative w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 p-0.5">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out shadow-[0_0_12px_rgba(168,85,247,0.5)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
