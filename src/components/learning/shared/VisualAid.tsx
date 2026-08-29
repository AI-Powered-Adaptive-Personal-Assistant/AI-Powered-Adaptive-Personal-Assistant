import React from 'react';
import { VisualAidData } from '../../../types/learning';
import { Eye, ArrowRight, CheckCircle2 } from 'lucide-react';

interface VisualAidProps {
  data: VisualAidData;
  isArabic?: boolean;
  className?: string;
}

export const VisualAid: React.FC<VisualAidProps> = ({
  data,
  isArabic = false,
  className = '',
}) => {
  const { type, emoji = '🍎', count = 3, secondCount = 0, steps = [], numberLineRange = [0, 10], highlightPoint } = data;

  return (
    <div className={`p-4 rounded-2xl bg-slate-900/90 border-2 border-indigo-500/30 shadow-xl backdrop-blur-md ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 text-xs font-black text-indigo-400">
        <Eye className="w-4 h-4" />
        <span>{isArabic ? 'المساعد البصري التوضيحي:' : 'Visual Learning Aid:'}</span>
      </div>

      {/* 1. Counting Objects (e.g. 5 apples + 3 apples = 8 apples) */}
      {type === 'counting_objects' && (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex items-center justify-center gap-3 flex-wrap text-2xl sm:text-3xl">
            {/* First group */}
            <div className="flex items-center gap-1.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800 shadow-inner">
              {Array.from({ length: Math.min(count, 15) }).map((_, i) => (
                <span key={`c1-${i}`} className="animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                  {emoji}
                </span>
              ))}
              <span className="ml-2 font-black text-sm text-indigo-300">({count})</span>
            </div>

            {/* Operator if secondCount exists */}
            {secondCount > 0 && (
              <>
                <span className="text-2xl font-black text-amber-400">+</span>
                {/* Second group */}
                <div className="flex items-center gap-1.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800 shadow-inner">
                  {Array.from({ length: Math.min(secondCount, 15) }).map((_, i) => (
                    <span key={`c2-${i}`} className="animate-pulse" style={{ animationDelay: `${(count + i) * 100}ms` }}>
                      {emoji}
                    </span>
                  ))}
                  <span className="ml-2 font-black text-sm text-indigo-300">({secondCount})</span>
                </div>

                <span className="text-2xl font-black text-emerald-400">=</span>

                {/* Total */}
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-extrabold text-lg">
                  {count + secondCount} {emoji}
                </div>
              </>
            )}
          </div>
          <p className="text-xs text-slate-400 text-center font-medium">
            {isArabic
              ? `عِدّ العناصر (${emoji}) واحداً تلو الآخر لتجد الإجابة!`
              : `Count the items (${emoji}) one by one to find the total!`}
          </p>
        </div>
      )}

      {/* 2. Number Line */}
      {type === 'number_line' && (
        <div className="py-3 px-2 flex flex-col items-center">
          <div className="w-full max-w-md flex items-center justify-between relative border-b-2 border-indigo-500/60 pb-3 pt-6">
            {Array.from({ length: numberLineRange[1] - numberLineRange[0] + 1 }).map((_, i) => {
              const num = numberLineRange[0] + i;
              const isTarget = num === highlightPoint;
              return (
                <div key={num} className="flex flex-col items-center relative">
                  {isTarget && (
                    <div className="absolute -top-6 text-amber-400 animate-bounce font-black text-xs">
                      👇
                    </div>
                  )}
                  <div
                    className={`w-2 h-2 rounded-full mb-1 transition-all ${
                      isTarget
                        ? 'bg-amber-400 scale-150 ring-4 ring-amber-400/30'
                        : 'bg-slate-600'
                    }`}
                  />
                  <span
                    className={`text-xs font-black transition-colors ${
                      isTarget ? 'text-amber-400 scale-125' : 'text-slate-400'
                    }`}
                  >
                    {num}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Step by Step Diagram (e.g. Science concepts, story flows) */}
      {(type === 'step_diagram' || type === 'story_visual') && steps.length > 0 && (
        <div className="flex flex-col gap-2.5 py-1">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800"
            >
              <div className="w-6 h-6 rounded-full bg-indigo-500/30 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0">
                {idx + 1}
              </div>
              <span className="text-xs text-slate-200 font-medium leading-relaxed">
                {step}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VisualAid;
