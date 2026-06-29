import { motion } from 'motion/react';

/**
 * Brief "Welcome to Cognify" splash shown for ~2s on app open, then fades out.
 * Bilingual; respects prefers-reduced-motion (handled globally in index.css).
 */
export default function SplashScreen({ isAr = false }: { isAr?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center text-white"
      style={{ background: 'radial-gradient(120% 90% at 50% 10%, #7C5CFF 0%, #5B3DF5 38%, #09090B 100%)' }}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
        className="flex flex-col items-center gap-5"
      >
        <div className="w-[84px] h-[84px] rounded-[22px] flex items-center justify-center shadow-2xl"
          style={{ background: 'linear-gradient(140deg,#a48dff,#5b3df5)', boxShadow: '0 18px 50px -12px rgba(91,61,245,0.7)' }}>
          <motion.svg
            width="46" height="46" viewBox="0 0 24 24" fill="none"
            animate={{ rotate: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          >
            <circle cx="6.5" cy="7" r="2.1" fill="#fff" />
            <circle cx="17" cy="6" r="2.1" fill="#fff" opacity="0.85" />
            <circle cx="13" cy="17.5" r="2.1" fill="#fff" opacity="0.7" />
            <path d="M8 8 12 16M8.4 6.7 15 6.1M15.4 7.6 13.4 15.6" stroke="#fff" strokeWidth="1.25" opacity="0.55" />
          </motion.svg>
        </div>

        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="text-center"
        >
          <div className="text-[15px] font-medium tracking-wide text-white/80 mb-1">
            {isAr ? 'أهلاً بك في' : 'Welcome to'}
          </div>
          <div className="font-serif text-[52px] leading-none tracking-tight">Cognify</div>
          <div className="mt-3 text-[13px] font-medium text-white/70">
            {isAr ? 'مدرّسك الذكي المتكيّف' : 'Your adaptive AI study mentor'}
          </div>
        </motion.div>
      </motion.div>

      {/* loading shimmer dots */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-16 flex gap-2"
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-2 h-2 rounded-full bg-white/70"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.18 }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
