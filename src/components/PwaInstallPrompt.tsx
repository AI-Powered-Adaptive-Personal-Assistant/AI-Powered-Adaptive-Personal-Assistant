import React, { useState, useEffect } from 'react';
import { Download, X, Sparkles, Smartphone } from 'lucide-react';
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

  const L = (en: string, ar: string) => localize(language, en, ar);

  useEffect(() => {
    // If previously dismissed in this browser session, do not prompt again
    try {
      if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === 'true') {
        return;
      }
    } catch {
      // Ignore sessionStorage access errors in restricted sandbox environments
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

  if (!isVisible || !deferredPrompt) {
    return null;
  }

  return (
    <aside
      role="alert"
      aria-live="polite"
      aria-label={L('Install Cognify Application', 'تثبيت تطبيق كوجنيفاي')}
      className="fixed bottom-5 start-4 end-4 sm:start-auto sm:end-6 max-w-md z-50 bg-bg-card border border-border shadow-2xl rounded-3xl p-5 backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <div className="flex items-start gap-3.5">
        <div className="p-3 bg-primary-soft text-primary rounded-2xl shrink-0 mt-0.5">
          <Smartphone className="w-6 h-6" />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-text-main flex items-center gap-1.5">
              <span>{L('Install Cognify App', 'تثبيت تطبيق كوجنيفاي')}</span>
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </h3>
            <button
              onClick={handleDismiss}
              className="text-text-muted hover:text-text-main p-1 rounded-lg hover:bg-surface-3 transition-colors"
              aria-label={L('Close install banner', 'إغلاق نافذة التثبيت')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-text-muted mt-1 leading-relaxed">
            {L(
              'Add Cognify to your home screen for quick offline access, full-screen study mode, and seamless assistive tools.',
              'أضف كوجنيفاي لشاشتك الرئيسية لتجربة أسرع، استخدام مريح بدون إنترنت، ووصول فوري لأدوات الإتاحة.'
            )}
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleInstall}
              disabled={isInstalling}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-black shadow-sm hover:bg-primary-press active:scale-95 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>{L('Install Cognify App', 'تثبيت تطبيق كوجنيفاي')}</span>
            </button>

            <button
              onClick={handleDismiss}
              className="px-3.5 py-2.5 rounded-xl bg-surface-3 hover:bg-surface-2 text-text-muted hover:text-text-main text-xs font-bold transition-all"
            >
              {L('Not now', 'ليس الآن')}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
