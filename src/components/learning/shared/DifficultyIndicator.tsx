import React from 'react';
import { Star } from 'lucide-react';
import { DifficultyLevel } from '../../../types/learning';

interface DifficultyIndicatorProps {
  level: DifficultyLevel;
  maxLevel?: number;
  isArabic?: boolean;
  className?: string;
}

export const DifficultyIndicator: React.FC<DifficultyIndicatorProps> = ({
  level,
  maxLevel = 5,
  isArabic = false,
  className = '',
}) => {
  const getLevelLabel = (lvl: DifficultyLevel) => {
    if (isArabic) {
      switch (lvl) {
        case 1: return 'مبتدئ جداً';
        case 2: return 'سهل';
        case 3: return 'متوسط';
        case 4: return 'متقدم';
        case 5: return 'تحدي';
        default: return '';
      }
    }
    switch (lvl) {
      case 1: return 'Beginner';
      case 2: return 'Easy';
      case 3: return 'Medium';
      case 4: return 'Advanced';
      case 5: return 'Challenge';
      default: return '';
    }
  };

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-xs ${className}`}>
      <span className="text-slate-400 font-medium mr-1">
        {isArabic ? 'المستوى' : 'Level'} {level}:
      </span>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: maxLevel }).map((_, i) => (
          <Star
            key={i}
            className={`w-3.5 h-3.5 transition-colors ${
              i < level
                ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]'
                : 'text-slate-700'
            }`}
          />
        ))}
      </div>
      <span className="text-amber-400 font-bold ml-1 text-[11px]">
        {getLevelLabel(level)}
      </span>
    </div>
  );
};

export default DifficultyIndicator;
