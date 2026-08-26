import React, { useState, useEffect } from 'react';
import { Exercise, ExerciseResult, AIAnalysis, LearningProfile } from '../../../types/learning';
import { generateAdaptiveExercise, analyzeAnswer, generateLocalExercise } from '../../../services/learningAI';
import { recordExerciseResult } from '../../../lib/learningProfile';
import ProgressBar from '../shared/ProgressBar';
import ExerciseFeedback from '../shared/ExerciseFeedback';
import VisualAid from '../shared/VisualAid';
import { Lightbulb, BookOpen, Volume2, Sparkles, Image as ImageIcon } from 'lucide-react';

interface ComprehensionModuleProps {
  userId: string;
  learningProfile: LearningProfile;
  onUpdateProfile: (profile: LearningProfile) => void;
  onBack: () => void;
  isArabic?: boolean;
}

export const ComprehensionModule: React.FC<ComprehensionModuleProps> = ({
  userId,
  learningProfile,
  onUpdateProfile,
  onBack,
  isArabic = false,
}) => {
  const subjectProfile = learningProfile.subjects.comprehension;
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [sessionQuestionCount, setSessionQuestionCount] = useState(1);
  const [sessionStars, setSessionStars] = useState(0);
  const [streak, setStreak] = useState(subjectProfile.consecutiveCorrect);
  const [showVisualStory, setShowVisualStory] = useState(false);

  const fetchNextExercise = async () => {
    setIsLoading(true);
    setSelectedOption(null);
    setIsAnswered(false);
    setAnalysis(null);
    setShowVisualStory(false);

    try {
      const exercise = await generateAdaptiveExercise(
        {
          subject: 'comprehension',
          difficulty: subjectProfile.currentDifficulty,
          teachingMethod: subjectProfile.preferredMethod,
          language: isArabic ? 'ar' : 'en',
        },
        subjectProfile
      );

      if (exercise) {
        setCurrentExercise(exercise);
      } else {
        setCurrentExercise(generateLocalExercise('comprehension', subjectProfile.currentDifficulty, isArabic ? 'ar' : 'en'));
      }
    } catch {
      setCurrentExercise(generateLocalExercise('comprehension', subjectProfile.currentDifficulty, isArabic ? 'ar' : 'en'));
    } finally {
      setIsLoading(false);
      setStartTime(Date.now());
    }
  };

  useEffect(() => {
    fetchNextExercise();
  }, []);

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = isArabic ? 'ar-SA' : 'en-US';
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
      subject: 'comprehension',
      difficulty: currentExercise.difficulty,
      isCorrect,
      childAnswer: option,
      correctAnswer: currentExercise.correctAnswer,
      responseTimeMs: responseTime,
      mistakeType: resultAnalysis.mistakeType,
      attemptNumber: 1,
      teachingMethodUsed: 'text',
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
          <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-400 font-bold text-sm">
            {isArabic ? 'جاري تجهيز القصة والأسئلة الشيقة...' : 'Preparing a fun story and questions for you...'}
          </p>
        </div>
      ) : currentExercise ? (
        <div className="flex flex-col gap-5">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border-2 border-yellow-500/30 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 font-black text-xs flex items-center gap-1.5 border border-yellow-500/30">
                <Lightbulb className="w-3.5 h-3.5" />
                {isArabic ? 'الفهم القرائي والقصص' : 'Reading Comprehension'} • Level {currentExercise.difficulty}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowVisualStory(!showVisualStory)}
                  className="px-3 py-1 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-bold flex items-center gap-1 border border-indigo-500/30 transition-all"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>{isArabic ? 'قصة مرئية' : 'Visual Story'}</span>
                </button>

                <button
                  onClick={() => speakText(currentExercise.question)}
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
                  title={isArabic ? 'استمع للقصة' : 'Listen'}
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Story / Passage Box */}
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 my-3 leading-relaxed">
              <h4 className="text-lg sm:text-xl font-black text-yellow-300 mb-3">
                {isArabic
                  ? currentExercise.questionArabic || currentExercise.question
                  : currentExercise.question}
              </h4>
            </div>

            {/* Visual Story Mode if toggled or present */}
            {showVisualStory && (
              <VisualAid
                data={{
                  type: 'story_visual',
                  steps: [
                    isArabic ? '١. قراءة بداية القصة وفهم الشخصيات 📖' : '1. Read the story beginning and understand characters 📖',
                    isArabic ? '٢. معرفة الحدث الرئيسي والمكان 🏞️' : '2. Identify the main event and setting 🏞️',
                    isArabic ? '٣. استنتاج الإجابة من سياق الجمل 💡' : '3. Deduce the answer from context 💡',
                  ],
                }}
                isArabic={isArabic}
                className="mb-4"
              />
            )}

            {/* Options */}
            <p className="text-xs font-bold text-slate-400 mb-3">
              {isArabic ? 'اختر الإجابة الصحيحة عن القصة:' : 'Select the best answer about the passage:'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {(isArabic && currentExercise.optionsArabic ? currentExercise.optionsArabic : currentExercise.options || []).map(
                (opt, idx) => {
                  const originalOpt = currentExercise.options?.[idx] || opt;
                  const isSelected = selectedOption === originalOpt;
                  const isCorrect = originalOpt === currentExercise.correctAnswer;

                  let buttonStyle = 'bg-slate-950/80 hover:bg-slate-800/90 border-slate-800 text-slate-200 hover:border-yellow-500/50';

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
                      onClick={() => handleSelectOption(originalOpt)}
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

export default ComprehensionModule;
