import React from 'react';
import { CheckCircle2, XCircle, Sparkles, ArrowRight, Volume2, Lightbulb } from 'lucide-react';
import { AIAnalysis } from '../../../types/learning';

interface ExerciseFeedbackProps {
  analysis: AIAnalysis | null;
  isCorrect: boolean;
  correctAnswer: string;
  onNext: () => void;
  isArabic?: boolean;
  isSubmitting?: boolean;
}

export const ExerciseFeedback: React.FC<ExerciseFeedbackProps> = ({
  analysis,
  isCorrect,
  correctAnswer,
  onNext,
  isArabic = false,
  isSubmitting = false,
}) => {
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = isArabic ? 'ar-SA' : 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const explanationText = isArabic
    ? analysis?.explanationArabic || analysis?.explanation || (isCorrect ? 'إجابة صحيحة وممتازة!' : `الإجابة الصحيحة هي: ${correctAnswer}`)
    : analysis?.explanation || (isCorrect ? 'Awesome work! That is correct!' : `The correct answer is: ${correctAnswer}`);

  const encouragementText = isArabic
    ? analysis?.encouragementArabic || analysis?.encouragement || (isCorrect ? 'أنت بطل! استمر هكذا! 🌟' : 'محاولة رائعة! التعلم يأتي بالتجربة! 💪')
    : analysis?.encouragement || (isCorrect ? 'You are a superstar! Keep shining! 🌟' : 'Great try! Every mistake makes your brain stronger! 💪');

  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl border-2 transition-all shadow-2xl backdrop-blur-md animate-in fade-in duration-300 ${
        isCorrect
          ? 'bg-emerald-950/70 border-emerald-500/50 shadow-emerald-900/30'
          : 'bg-amber-950/70 border-amber-500/50 shadow-amber-900/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {isCorrect ? (
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
              <XCircle className="w-6 h-6" />
            </div>
          )}

          <div>
            <h4
              className={`text-base sm:text-lg font-black ${
                isCorrect ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {isCorrect
                ? isArabic
                  ? 'رائع جداً! إجابة صحيحة! 🎉'
                  : 'Fantastic! That is Correct! 🎉'
                : isArabic
                ? 'محاولة طيبة، دعنا نفهمها معاً! 💡'
                : 'Nice try! Let\'s learn this together! 💡'}
            </h4>
            <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5">
              {encouragementText}
            </p>
          </div>
        </div>

        {/* Listen to explanation button */}
        <button
          onClick={() => speakText(explanationText)}
          className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-all shrink-0"
          title={isArabic ? 'استمع للشرح' : 'Listen to explanation'}
        >
          <Volume2 className="w-4 h-4" />
        </button>
      </div>

      {/* Explanation Box */}
      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 mb-4 text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
        <div className="flex items-center gap-1.5 text-indigo-400 font-bold mb-1 text-xs">
          <Lightbulb className="w-3.5 h-3.5" />
          <span>{isArabic ? 'الشرح المبسط:' : 'Friendly Explanation:'}</span>
        </div>
        {explanationText}
      </div>

      {/* Next Question Button */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={isSubmitting}
          className={`px-6 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 transition-all shadow-lg active:scale-95 ${
            isCorrect
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 hover:opacity-90 shadow-emerald-500/25'
              : 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:opacity-90 shadow-amber-500/25'
          }`}
        >
          <span>{isArabic ? 'السؤال التالي' : 'Next Question'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ExerciseFeedback;
