import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Self-contained "Welcome to Cognify" splash screen.
 * Matches the new modern dark UI aesthetic with ambient glow and vibrant brand gradient.
 */
export default function SplashScreen() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>('show');

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const hold = reduce ? 500 : 1600;
    const t1 = setTimeout(() => setPhase('fade'), hold);
    const t2 = setTimeout(() => setPhase('gone'), hold + 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === 'gone') return null;

  const isAr = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase().startsWith('ar');

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0A0C14] text-white select-none overflow-hidden"
      style={{
        opacity: phase === 'fade' ? 0 : 1,
        transition: 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: phase === 'fade' ? 'none' : 'auto',
      }}
    >
      {/* Background ambient lighting */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-rose-500/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-teal-500/15 rounded-full blur-[120px]" />
        <div className="absolute -top-20 right-1/3 w-80 h-80 bg-amber-500/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
        {/* Modern Brand Icon */}
        <div className="w-20 h-20 rounded-[24px] bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-400 p-0.5 shadow-2xl shadow-rose-500/30 flex items-center justify-center">
          <div className="w-full h-full bg-[#0E111D] rounded-[22px] flex items-center justify-center">
            <Sparkles className="w-9 h-9 text-rose-400 animate-pulse" />
          </div>
        </div>

        {/* Brand Text */}
        <div className="text-center space-y-2">
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
            {isAr ? 'أهلاً بك في' : 'Welcome to'}
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-none">
            Cognify
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-400 pt-1">
            {isAr ? 'مساعدك الذكي المتكيف' : 'Your adaptive AI study mentor'}
          </p>
        </div>
      </div>

      {/* Modern 3-Color Pulsing Dots */}
      <div className="absolute bottom-14 flex items-center gap-2 z-10">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0s' }} />
        <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-bounce" style={{ animationDelay: '0.3s' }} />
      </div>
    </div>
  );
}

