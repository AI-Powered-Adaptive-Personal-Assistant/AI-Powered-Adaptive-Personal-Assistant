import React, { useState, useEffect } from 'react';
import { Exercise, ExerciseResult, AIAnalysis, LearningProfile } from '../../../types/learning';
import { generateAdaptiveExercise, analyzeAnswer, generateLocalExercise } from '../../../services/learningAI';
import { recordExerciseResult } from '../../../lib/learningProfile';
import ProgressBar from '../shared/ProgressBar';
import ExerciseFeedback from '../shared/ExerciseFeedback';
import { Edit3, CheckCircle2, Sparkles, HelpCircle, Delete } from 'lucide-react';

interface WritingModuleProps {
  userId: string;
  learningProfile: LearningProfile;
  onUpdateProfile: (profile: LearningProfile) => void;
  onBack: () => void;
  isArabic?: boolean;
}

export const WritingModule: React.FC<WritingModuleProps> = ({
  userId,
  learningProfile,
  onUpdateProfile,
  onBack,
  isArabic = false,
}) => {
  const subjectProfile = learningProfile.subjects.writing;
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  const [userInput, setUserInput] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [sessionQuestionCount, setSessionQuestionCount] = useState(1);
  const [sessionStars, setSessionStars] = useState(0);
  const [streak, setStreak] = useState(subjectProfile.consecutiveCorrect);
  const [showHint, setShowHint] = useState(false);

  const fetchNextExercise = async () => {
    setIsLoading(true);
    setUserInput('');
    setSelectedOption(null);
    setIsAnswered(false);
    setAnalysis(null);
    setShowHint(false);

    try {
      const exercise = await generateAdaptiveExercise(
        {
          subject: 'writing',
          difficulty: subjectProfile.currentDifficulty,
          teachingMethod: subjectProfile.preferredMethod,
          language: isArabic ? 'ar' : 'en',
        },
        subjectProfile
      );

      if (exercise) {
        setCurrentExercise(exercise);
      } else {
        setCurrentExercise(generateLocalExercise('writing', subjectProfile.currentDifficulty, isArabic ? 'ar' : 'en'));
      }
    } catch {
      setCurrentExercise(generateLocalExercise('writing', subjectProfile.currentDifficulty, isArabic ? 'ar' : 'en'));
    } finally {
      setIsLoading(false);
      setStartTime(Date.now());
    }
  };

  useEffect(() => {
    fetchNextExercise();
  }, []);

  const handleSubmitAnswer = async (answer: string) => {
    if (isAnswered || !currentExercise || !answer.trim()) return;

    setSelectedOption(answer);
    setIsAnswered(true);
    const responseTime = Date.now() - startTime;

    const resultAnalysis = await analyzeAnswer(currentExercise, answer, subjectProfile);
    setAnalysis(resultAnalysis);

    const isCorrect = resultAnalysis.isCorrect;
    if (isCorrect) {
      setSessionStars((prev) => prev + currentExercise.difficulty * 2);
      setStreak((prev) => prev + 1);
    } else {
      setStreak(0);
    }

    const result: ExerciseResult = {
      exerciseId: currentExercise.id,
      subject: 'writing',
      difficulty: currentExercise.difficulty,
      isCorrect,
      childAnswer: answer,
      correctAnswer: currentExercise.correctAnswer,
      responseTimeMs: responseTime,
      mistakeType: resultAnalysis.mistakeType,
      attemptNumber: 1,
      teachingMethodUsed: 'interactive',
      topic: currentExercise.topic,
      timestamp: Date.now(),
    };

    const updatedProfile = await recordExerciseResult(userId, result, learningProfile);
    onUpdateProfile(updatedProfile);
  };

  const handleNext = () => {
    setSessionQuestionCount((prev) => prev + 1);
    fetchNextExercise();
  };

  return (
    <div className="max-w-3xl mx-auto w-full p-4 sm:p-6 text-white animate-in fade-in duration-300">
      <ProgressBar
        currentQuestion={sessionQuestionCount}
        totalQuestions={10}
        starsEarned={sessionStars}
        streakCount={streak}
        difficulty={subjectProfile.currentDifficulty}
        isArabic={isArabic}
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-slate-900/60 rounded-3xl border border-slate-800">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-400 font-bold text-sm">
            {isArabic ? 'جاري تجهيز تمرين الكتابة والإملاء...' : 'Preparing a fun writing activity for you...'}
          </p>
        </div>
      ) : currentExercise ? (
        <div className="flex flex-col gap-5">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border-2 border-orange-500/30 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 font-black text-xs flex items-center gap-1.5 border border-orange-500/30">
                <Edit3 className="w-3.5 h-3.5" />
                {isArabic ? 'استوديو الكتابة' : 'Writing Studio'} • Level {currentExercise.difficulty}
              </span>

              {currentExercise.hint && (
                <button
                  onClick={() => setShowHint(!showHint)}
                  className="px-3 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1 border border-amber-500/30 transition-all"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{isArabic ? 'تلميح' : 'Hint'}</span>
                </button>
              )}
            </div>

            {/* Question / Prompt */}
            <h3 className="text-xl sm:text-2xl font-black text-white leading-relaxed mb-4">
              {isArabic
                ? currentExercise.questionArabic || currentExercise.question
                : currentExercise.question}
            </h3>

            {/* Hint Box */}
            {showHint && currentExercise.hint && (
              <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs font-medium mb-4 flex items-center gap-2 animate-in slide-in-from-top-2">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{isArabic ? currentExercise.hintArabic || currentExercise.hint : currentExercise.hint}</span>
              </div>
            )}

            {/* Multiple Choice Options Or Text Input */}
            {currentExercise.options && currentExercise.options.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
                {(isArabic && currentExercise.optionsArabic ? currentExercise.optionsArabic : currentExercise.options).map(
                  (opt, idx) => {
                    const originalOpt = currentExercise.options?.[idx] || opt;
                    const isSelected = selectedOption === originalOpt;
                    const isCorrect = originalOpt === currentExercise.correctAnswer;

                    let buttonStyle = 'bg-slate-950/80 hover:bg-slate-800/90 border-slate-800 text-slate-200 hover:border-orange-500/50';

                    if (isAnswered) {
                      if (isCorrect) {
                        buttonStyle = 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-[1.02]';
                      } else if (isSelected) {
                        buttonStyle = 'bg-rose-500/20 border-rose-500 text-rose-300';
                      } else {
                        buttonStyle = 'bg-slate-950/40 border-slate-800 text-slate-500 opacity-60';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handleSubmitAnswer(originalOpt)}
                        disabled={isAnswered}
                        className={`p-4 rounded-2xl border-2 text-left font-black text-base sm:text-lg transition-all flex items-center justify-between shadow-md active:scale-95 ${buttonStyle}`}
                      >
                        <span>{opt}</span>
                        <div className="w-6 h-6 rounded-full border border-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            ) : (
              /* Text Input Area for free-form writing */
              <div className="flex flex-col gap-3 mt-4">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  disabled={isAnswered}
                  placeholder={isArabic ? 'اكتب إجابتك هنا...' : 'Type your answer here...'}
                  className="w-full p-4 rounded-2xl bg-slate-950 border-2 border-slate-800 focus:border-orange-500 text-white font-bold text-lg outline-none transition-all placeholder:text-slate-600"
                />
                {!isAnswered && (
                  <button
                    onClick={() => handleSubmitAnswer(userInput)}
                    disabled={!userInput.trim()}
                    className="self-end px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 font-black text-sm transition-all shadow-lg shadow-orange-500/20"
                  >
                    {isArabic ? 'إرسال الإجابة' : 'Submit'}
                  </button>
                )}
              </div>
            )}
          </div>

          {isAnswered && (
            <ExerciseFeedback
              analysis={analysis}
              isCorrect={analysis?.isCorrect ?? false}
              correctAnswer={currentExercise.correctAnswer}
              onNext={handleNext}
              isArabic={isArabic}
            />
          )}
        </div>
      ) : null}
    </div>
  );
};

export default WritingModule;
