import React, { useState, useEffect } from 'react';
import { Exercise, ExerciseResult, AIAnalysis, LearningProfile } from '../../../types/learning';
import { generateAdaptiveExercise, analyzeAnswer, generateLocalExercise } from '../../../services/learningAI';
import { recordExerciseResult } from '../../../lib/learningProfile';
import ProgressBar from '../shared/ProgressBar';
import ExerciseFeedback from '../shared/ExerciseFeedback';
import { Globe, Volume2, Sparkles, Languages, MessageSquare } from 'lucide-react';

interface EnglishModuleProps {
  userId: string;
  learningProfile: LearningProfile;
  onUpdateProfile: (profile: LearningProfile) => void;
  onBack: () => void;
  isArabic?: boolean;
}

export const EnglishModule: React.FC<EnglishModuleProps> = ({
  userId,
  learningProfile,
  onUpdateProfile,
  onBack,
  isArabic = false,
}) => {
  const subjectProfile = learningProfile.subjects.english;
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [sessionQuestionCount, setSessionQuestionCount] = useState(1);
  const [sessionStars, setSessionStars] = useState(0);
  const [streak, setStreak] = useState(subjectProfile.consecutiveCorrect);

  const fetchNextExercise = async () => {
    setIsLoading(true);
    setSelectedOption(null);
    setIsAnswered(false);
    setAnalysis(null);

    try {
      const exercise = await generateAdaptiveExercise(
        {
          subject: 'english',
          difficulty: subjectProfile.currentDifficulty,
          teachingMethod: subjectProfile.preferredMethod,
          language: 'en', // English subject is naturally targeted in English
        },
        subjectProfile
      );

      if (exercise) {
        setCurrentExercise(exercise);
      } else {
        setCurrentExercise(generateLocalExercise('english', subjectProfile.currentDifficulty, 'en'));
      }
    } catch {
      setCurrentExercise(generateLocalExercise('english', subjectProfile.currentDifficulty, 'en'));
    } finally {
      setIsLoading(false);
      setStartTime(Date.now());
    }
  };

  useEffect(() => {
    fetchNextExercise();
  }, []);

  const speakEnglish = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  };

  const handleSelectOption = async (option: string) => {
    if (isAnswered || !currentExercise) return;

    setSelectedOption(option);
    setIsAnswered(true);
    const responseTime = Date.now() - startTime;

    const resultAnalysis = await analyzeAnswer(currentExercise, option, subjectProfile);
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
      subject: 'english',
      difficulty: currentExercise.difficulty,
      isCorrect,
      childAnswer: option,
      correctAnswer: currentExercise.correctAnswer,
      responseTimeMs: responseTime,
      mistakeType: resultAnalysis.mistakeType,
      attemptNumber: 1,
      teachingMethodUsed: 'audio',
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
          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-400 font-bold text-sm">
            {isArabic ? 'جاري تجهيز كلمات ومحادثة اللغة الإنجليزية...' : 'Preparing fun English vocabulary & sentences...'}
          </p>
        </div>
      ) : currentExercise ? (
        <div className="flex flex-col gap-5">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border-2 border-rose-500/30 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 font-black text-xs flex items-center gap-1.5 border border-rose-500/30">
                <Globe className="w-3.5 h-3.5" />
                {isArabic ? 'الإنجليزية التفاعلية' : 'English Adventure'} • Level {currentExercise.difficulty}
              </span>

              <button
                onClick={() => speakEnglish(currentExercise.question)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
                title="Listen in English"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            {/* Question Text */}
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 my-3 text-center">
              <p className="text-2xl sm:text-3xl font-black text-rose-300 tracking-wide mb-1">
                {currentExercise.question}
              </p>
              {currentExercise.questionArabic && (
                <p className="text-xs text-slate-400 font-medium">
                  {currentExercise.questionArabic}
                </p>
              )}
            </div>

            {/* Options */}
            <p className="text-xs font-bold text-slate-400 mb-3">
              {isArabic ? 'اختر المعنى أو الكلمة الإنجليزية المناسبة:' : 'Choose the correct English word or meaning:'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {(currentExercise.options || []).map((opt, idx) => {
                const isSelected = selectedOption === opt;
                const isCorrect = opt === currentExercise.correctAnswer;

                let buttonStyle = 'bg-slate-950/80 hover:bg-slate-800/90 border-slate-800 text-slate-200 hover:border-rose-500/50';

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
                    onClick={() => handleSelectOption(opt)}
                    disabled={isAnswered}
                    className={`p-4 rounded-2xl border-2 text-left font-black text-base sm:text-lg transition-all flex items-center justify-between shadow-md active:scale-95 ${buttonStyle}`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{opt}</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          speakEnglish(opt);
                        }}
                        className="p-1 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div className="w-6 h-6 rounded-full border border-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {String.fromCharCode(65 + idx)}
                    </div>
                  </button>
                );
              })}
            </div>
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

export default EnglishModule;
