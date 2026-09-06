import React, { useState, useEffect } from 'react';
import { Download, X, Sparkles, Smartphone, Share2, PlusSquare } from 'lucide-react';
import { localize } from '../lib/translations';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PwaInstallPromptProps {
  language?: string;
}

const STORAGE_KEY = 'cognify_pwa_dismissed';

export default function PwaInstallPrompt({ language }: PwaInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);

  const L = (en: string, ar: string) => localize(language, en, ar);

  useEffect(() => {
    // If running inside standalone PWA mode (already installed), never show
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
    if (isStandalone) return;

    // If previously dismissed in this browser session, do not prompt again
    try {
      if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === 'true') {
        return;
      }
    } catch {
      // Ignore sessionStorage access errors in restricted sandbox environments
    }

    // Check if iOS Safari
    const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIos) {
      setIsIosDevice(true);
      // Show on iOS after a brief delay so page renders first
      const timer = setTimeout(() => setIsVisible(true), 2500);
      return () => clearTimeout(timer);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent automatic mini-infobar or default banner
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      setIsVisible(false);
      setDeferredPrompt(null);
      try {
        sessionStorage.setItem(STORAGE_KEY, 'true');
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        try {
          sessionStorage.setItem(STORAGE_KEY, 'true');
        } catch {}
      }
    } catch (err) {
      console.warn('PWA installation prompt error:', err);
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
      setIsVisible(false);
    }
  };

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, 'true');
    } catch {}
    setIsVisible(false);
  };

  // Keyboard accessibility: Escape to dismiss
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  // If on Android/Desktop and beforeinstallprompt hasn't triggered yet, don't show
  if (!isIosDevice && !deferredPrompt) {
    return null;
  }

  return (
    <aside
      role="alert"
      aria-live="polite"
      aria-label={L('Install Cognify Application', 'تثبيت تطبيق كوجنيفاي')}
      className="fixed bottom-5 start-4 end-4 sm:start-auto sm:end-6 max-w-md z-50 bg-[#121524]/95 border border-slate-700/80 shadow-2xl rounded-3xl p-5 backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <div className="flex items-start gap-3.5">
        <div className="p-3 bg-rose-500/15 text-rose-400 rounded-2xl shrink-0 mt-0.5 border border-rose-500/20">
          <Smartphone className="w-6 h-6" />
        </div>

        <div className="flex-1 text-start">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>{L('Install Cognify on Phone', 'تثبيت كوجنيفاي على هاتفك')}</span>
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
            </h3>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              aria-label={L('Close install banner', 'إغلاق نافذة التثبيت')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {L(
              'Add Cognify to your home screen for quick offline access, full-screen study mode, and seamless assistive tools.',
              'أضف كوجنيفاي لشاشتك الرئيسية لتجربة أسرع، استخدام مريح بدون إنترنت، ووصول فوري لأدوات الإتاحة.'
            )}
          </p>

          {/* iOS Safari Guided Steps */}
          {isIosDevice ? (
            <div className="mt-3.5 p-3 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs text-slate-200">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-black flex items-center justify-center shrink-0">1</span>
                <span className="flex items-center gap-1">
                  {L('Tap Safari Share button', 'اضغط زر المشاركة في سفاري')} <Share2 className="w-3.5 h-3.5 text-rose-400 inline" />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-black flex items-center justify-center shrink-0">2</span>
                <span className="flex items-center gap-1">
                  {L('Select "Add to Home Screen"', 'اختر "إضافة إلى الشاشة الرئيسية"')} <PlusSquare className="w-3.5 h-3.5 text-rose-400 inline" />
                </span>
              </div>
              <button
                onClick={handleDismiss}
                className="w-full mt-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all"
              >
                {L('Got it', 'فهمت ذلك')}
              </button>
            </div>
          ) : (
            /* Android / Chrome Native Action Buttons */
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleInstall}
                disabled={isInstalling}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white text-xs font-black shadow-lg shadow-rose-500/20 hover:opacity-95 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>{L('Install Cognify App', 'تثبيت تطبيق كوجنيفاي')}</span>
              </button>

              <button
                onClick={handleDismiss}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all"
              >
                {L('Not now', 'ليس الآن')}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
