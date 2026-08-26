import React, { useState, useEffect } from 'react';
import { MemoryCard, ExerciseResult, LearningProfile } from '../../../types/learning';
import { recordExerciseResult } from '../../../lib/learningProfile';
import ProgressBar from '../shared/ProgressBar';
import ExerciseFeedback from '../shared/ExerciseFeedback';
import { Brain, Sparkles, RefreshCw, Trophy, CheckCircle2 } from 'lucide-react';

interface MemoryModuleProps {
  userId: string;
  learningProfile: LearningProfile;
  onUpdateProfile: (profile: LearningProfile) => void;
  onBack: () => void;
  isArabic?: boolean;
}

const EMOJI_POOL = ['🍎', '🚀', '🌟', '🐶', '🍕', '🎈', '🐱', '🌈', '🍦', '⚽', '🎸', '🌺'];

export const MemoryModule: React.FC<MemoryModuleProps> = ({
  userId,
  learningProfile,
  onUpdateProfile,
  onBack,
  isArabic = false,
}) => {
  const subjectProfile = learningProfile.subjects.memory;
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<number>(0);
  const [moves, setMoves] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [sessionQuestionCount, setSessionQuestionCount] = useState(1);
  const [sessionStars, setSessionStars] = useState(0);
  const [streak, setStreak] = useState(subjectProfile.consecutiveCorrect);

  const pairCount = Math.min(3 + subjectProfile.currentDifficulty, 6); // 4 to 6 pairs

  const initializeGame = () => {
    const selectedEmojis = [...EMOJI_POOL].sort(() => Math.random() - 0.5).slice(0, pairCount);
    const cardItems: MemoryCard[] = [];

    selectedEmojis.forEach((emoji, idx) => {
      cardItems.push({
        id: `card_${idx}_a`,
        content: emoji,
        type: 'emoji',
        isFlipped: false,
        isMatched: false,
      });
      cardItems.push({
        id: `card_${idx}_b`,
        content: emoji,
        type: 'emoji',
        isFlipped: false,
        isMatched: false,
      });
    });

    setCards(cardItems.sort(() => Math.random() - 0.5));
    setFlippedIndices([]);
    setMatchedPairs(0);
    setMoves(0);
    setIsCompleted(false);
    setStartTime(Date.now());
  };

  useEffect(() => {
    initializeGame();
  }, [subjectProfile.currentDifficulty]);

  const handleCardClick = (index: number) => {
    if (
      flippedIndices.length === 2 ||
      cards[index].isFlipped ||
      cards[index].isMatched ||
      isCompleted
    ) {
      return;
    }

    const newCards = [...cards];
    newCards[index].isFlipped = true;
    setCards(newCards);

    const newFlipped = [...flippedIndices, index];
    setFlippedIndices(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      const [firstIdx, secondIdx] = newFlipped;

      if (cards[firstIdx].content === cards[secondIdx].content) {
        // Match found!
        setTimeout(async () => {
          const matchedCards = [...newCards];
          matchedCards[firstIdx].isMatched = true;
          matchedCards[secondIdx].isMatched = true;
          setCards(matchedCards);
          setFlippedIndices([]);

          const nextMatched = matchedPairs + 1;
          setMatchedPairs(nextMatched);

          if (nextMatched === pairCount) {
            // Game Won!
            setIsCompleted(true);
            const totalDuration = Date.now() - startTime;
            setSessionStars((prev) => prev + subjectProfile.currentDifficulty * 3);
            setStreak((prev) => prev + 1);

            const result: ExerciseResult = {
              exerciseId: `mem_${Date.now()}`,
              subject: 'memory',
              difficulty: subjectProfile.currentDifficulty,
              isCorrect: true,
              childAnswer: `${moves + 1} moves`,
              correctAnswer: `${pairCount} pairs`,
              responseTimeMs: totalDuration,
              attemptNumber: 1,
              teachingMethodUsed: 'visual',
              topic: 'card_matching',
              timestamp: Date.now(),
            };

            const updatedProfile = await recordExerciseResult(userId, result, learningProfile);
            onUpdateProfile(updatedProfile);
          }
        }, 500);
      } else {
        // No match - flip back
        setTimeout(() => {
          const resetCards = [...newCards];
          resetCards[firstIdx].isFlipped = false;
          resetCards[secondIdx].isFlipped = false;
          setCards(resetCards);
          setFlippedIndices([]);
        }, 900);
      }
    }
  };

  const handleNextGame = () => {
    setSessionQuestionCount((prev) => prev + 1);
    initializeGame();
  };

  return (
    <div className="max-w-3xl mx-auto w-full p-4 sm:p-6 text-white animate-in fade-in duration-300">
      <ProgressBar
        currentQuestion={sessionQuestionCount}
        totalQuestions={5}
        starsEarned={sessionStars}
        streakCount={streak}
        difficulty={subjectProfile.currentDifficulty}
        isArabic={isArabic}
      />

      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border-2 border-purple-500/30 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 mb-6">
          <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 font-black text-xs flex items-center gap-1.5 border border-purple-500/30">
            <Brain className="w-3.5 h-3.5" />
            {isArabic ? 'نادي الذاكرة والمطابقة' : 'Memory Card Lab'} • {pairCount} {isArabic ? 'أزواج' : 'Pairs'}
          </span>

          <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
            <span>{isArabic ? `الحركات: ${moves}` : `Moves: ${moves}`}</span>
            <span>{isArabic ? `المطابقات: ${matchedPairs}/${pairCount}` : `Matched: ${matchedPairs}/${pairCount}`}</span>
          </div>
        </div>

        {/* Card Grid */}
        <div
          className={`grid gap-3 sm:gap-4 my-4 ${
            pairCount <= 4 ? 'grid-cols-4' : 'grid-cols-4 sm:grid-cols-6'
          }`}
        >
          {cards.map((card, idx) => (
            <button
              key={card.id}
              onClick={() => handleCardClick(idx)}
              disabled={card.isFlipped || card.isMatched}
              className={`h-24 sm:h-28 rounded-2xl border-2 font-black text-3xl sm:text-4xl transition-all duration-300 transform flex items-center justify-center shadow-lg select-none ${
                card.isMatched
                  ? 'bg-emerald-950/80 border-emerald-500/60 scale-95 shadow-emerald-500/20 opacity-80'
                  : card.isFlipped
                  ? 'bg-indigo-600/30 border-indigo-400 rotate-y-180 scale-100 shadow-indigo-500/30'
                  : 'bg-slate-950/90 hover:bg-slate-800 border-slate-800 hover:border-purple-500/50 hover:scale-105 active:scale-95'
              }`}
            >
              {card.isFlipped || card.isMatched ? (
                <span>{card.content}</span>
              ) : (
                <Brain className="w-8 h-8 text-slate-600 opacity-60" />
              )}
            </button>
          ))}
        </div>

        {/* Win Completion Card */}
        {isCompleted && (
          <div className="p-6 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500/50 shadow-2xl text-center mt-6 animate-in zoom-in-95 duration-300">
            <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-2 animate-bounce" />
            <h4 className="text-xl font-black text-emerald-300 mb-1">
              {isArabic ? 'رائع جداً! أنهيت جميع البطاقات بنجاح! 🎉' : 'Super Memory! You matched all pairs! 🎉'}
            </h4>
            <p className="text-xs sm:text-sm text-slate-300 mb-4">
              {isArabic
                ? `أنهيت اللعبة في ${moves} حركة! ذاكرتك أصبحت أقوى!`
                : `Completed in ${moves} moves! Your visual memory is leveling up!`}
            </p>
            <button
              onClick={handleNextGame}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-sm transition-all shadow-lg hover:opacity-90 active:scale-95"
            >
              {isArabic ? 'الجولة التالية' : 'Next Round'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MemoryModule;
