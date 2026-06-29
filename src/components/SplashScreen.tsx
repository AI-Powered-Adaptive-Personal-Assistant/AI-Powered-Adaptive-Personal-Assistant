import { useEffect, useState } from 'react';

/**
 * Self-contained "Welcome to Cognify" splash. Mounted ONCE at the app root
 * (main.tsx) so it never remounts/flickers when the app changes views.
 * Manages its own timer + fade, then removes itself from the DOM.
 */
export default function SplashScreen() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>('show');

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const hold = reduce ? 600 : 1900;
    const t1 = setTimeout(() => setPhase('fade'), hold);
    const t2 = setTimeout(() => setPhase('gone'), hold + 550);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === 'gone') return null;

  const isAr = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase().startsWith('ar');

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center text-white"
      style={{
        background: 'radial-gradient(120% 90% at 50% 12%, #7C5CFF 0%, #5B3DF5 38%, #09090B 100%)',
        opacity: phase === 'fade' ? 0 : 1,
        transition: 'opacity 0.5s ease-in-out',
        pointerEvents: phase === 'fade' ? 'none' : 'auto',
      }}
    >
      <div className="flex flex-col items-center gap-5 splash-pop">
        <div
          className="w-[84px] h-[84px] rounded-[22px] flex items-center justify-center"
          style={{ background: 'linear-gradient(140deg,#a48dff,#5b3df5)', boxShadow: '0 18px 50px -12px rgba(91,61,245,0.7)' }}
        >
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none">
            <circle cx="6.5" cy="7" r="2.1" fill="#fff" />
            <circle cx="17" cy="6" r="2.1" fill="#fff" opacity="0.85" />
            <circle cx="13" cy="17.5" r="2.1" fill="#fff" opacity="0.7" />
            <path d="M8 8 12 16M8.4 6.7 15 6.1M15.4 7.6 13.4 15.6" stroke="#fff" strokeWidth="1.25" opacity="0.55" />
          </svg>
        </div>
        <div className="text-center">
          <div className="text-[15px] font-medium tracking-wide text-white/80 mb-1">{isAr ? 'أهلاً بك في' : 'Welcome to'}</div>
          <div style={{ fontFamily: '"Instrument Serif", Georgia, serif' }} className="text-[52px] leading-none tracking-tight">Cognify</div>
          <div className="mt-3 text-[13px] font-medium text-white/70">{isAr ? 'مدرّسك الذكي المتكيّف' : 'Your adaptive AI study mentor'}</div>
        </div>
      </div>

      <div className="absolute bottom-16 flex gap-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-2 h-2 rounded-full bg-white/70 splash-dot" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
  );
}
