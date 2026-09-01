/**
 * Visual Companion (الرفيق البصري) — a life-assistant camera tool for blind
 * users. Not a generic "describe this image" box: every description is
 * generated with a safety-first, literal-text-first prompt (see the
 * ACCESSIBILITY block in api/_lib/ai.ts's buildPersona for 'Visual' mode),
 * spoken aloud automatically, and can be labeled ("remember this as...") so
 * the same person/object is recognizable in future descriptions.
 *
 * One tap = camera frame → vision-classified request (Phase 1 router sends
 * image attachments to the vision-capable model first) → spoken answer.
 * No continuous background capture: that would mean firing a paid API call
 * every few seconds with no user intent behind it. The person controls when
 * a description happens, same as a sighted person choosing when to look.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, CameraOff, Volume2, BookmarkPlus, Loader2, AlertTriangle, X, Trash2 } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, VisionMemory } from '../types';
import { localize } from '../lib/translations';
import { generateAdaptiveResponse } from '../services/gemini';
import { speak, cancelSpeech, unlockSpeechSynthesis, isSpeaking } from '../lib/tts';

interface VisionCompanionViewProps {
  profile: UserProfile;
  setProfile?: (profile: UserProfile) => void;
}

type Status = 'idle' | 'starting-camera' | 'ready' | 'analyzing' | 'camera-denied' | 'unsupported';

const isArabicLang = (lang?: string) => lang === 'Arabic' || lang === 'Egyptian Ammiya';

export default function VisionCompanionView({ profile, setProfile }: VisionCompanionViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [lastDescription, setLastDescription] = useState<string>('');
  const [lastSnapshot, setLastSnapshot] = useState<string>(''); // data URL, for the "save memory" preview + resend
  const [announce, setAnnounce] = useState<string>(''); // sr-only live region text
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const lang = profile.language;
  const memories = profile.visionMemories || [];

  const t = (en: string, ar: string) => localize(lang, en, ar);

  const startCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }
    setStatus('starting-camera');
    try {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus('ready');
      setAnnounce(t('Camera ready. Tap the big button to describe what\'s in front of you.', 'الكاميرا جاهزة. اضغط الزرار الكبير عشان أوصفلك اللي قدامك.'));
    } catch {
      setStatus('camera-denied');
    }
  }, [facingMode, t]);

  useEffect(() => {
    // Unlock speechSynthesis inside this mount's user-gesture chain where
    // possible; the real unlock still happens on the first button tap below,
    // this just primes it early so that first tap's speech isn't dropped.
    unlockSpeechSynthesis();
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      cancelSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flipCamera = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  };

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const describeScene = async () => {
    unlockSpeechSynthesis();
    if (status !== 'ready' && status !== 'analyzing') {
      // Camera isn't up yet (denied/unsupported) — nothing to capture.
      speak(
        t('Camera is not available. Please allow camera access.', 'الكاميرا مش متاحة. من فضلك اسمح بالوصول للكاميرا.'),
        lang,
      );
      return;
    }
    const frame = captureFrame();
    if (!frame) {
      speak(t('Could not capture the camera image, please try again.', 'معرفتش آخد صورة من الكاميرا، جرب تاني.'), lang);
      return;
    }
    setLastSnapshot(frame);
    setStatus('analyzing');
    setAnnounce(t('Analyzing what\'s in front of you...', 'بحلل اللي قدامك...'));

    // Known people/objects the user has labeled before — passed as plain
    // context so the model can say "this looks like the X you saved" when
    // relevant, without us needing real face-recognition/embeddings.
    const knownContext = memories.length
      ? `\n\nContext — things the user previously asked me to remember (mention only if this photo plausibly matches one):\n${memories
          .slice(-15)
          .map((m) => `- "${m.label}": ${m.description}`)
          .join('\n')}`
      : '';

    const prompt = isArabicLang(lang)
      ? `دي صورة من كاميرا شخص كفيف بيمشي في حياته اليومية. وصفهالي بالظبط زي التعليمات المكتوبة في الـ system prompt (خطر الأول، بعدين أي نص مكتوب حرفيًا، بعدين وصف عملي مختصر).${knownContext}`
      : `This is a photo from a blind person's everyday-life camera. Describe it exactly per the system instructions (hazards first, then any visible text verbatim, then a brief practical description).${knownContext}`;

    try {
      const result = await generateAdaptiveResponse(
        prompt,
        profile,
        [],
        [{ name: 'scene.jpg', type: 'image/jpeg', data: frame }],
      );
      setLastDescription(result);
      setStatus('ready');
      setAnnounce(result);
      speak(result, lang, {
        onError: () => setAnnounce((prev) => prev), // description still shown as text even if TTS fails
      });
    } catch {
      setStatus('ready');
      const err = t('Something went wrong analyzing the image. Please try again.', 'حصلت مشكلة وأنا بحلل الصورة. جرب تاني.');
      setLastDescription(err);
      speak(err, lang);
    }
  };

  const openSaveDialog = () => {
    if (!lastDescription) return;
    cancelSpeech();
    setLabelInput('');
    setShowSaveDialog(true);
  };

  const saveMemory = async () => {
    if (!labelInput.trim() || !profile.uid) { setShowSaveDialog(false); return; }
    const memory: VisionMemory = {
      id: `vm_${Date.now()}`,
      label: labelInput.trim(),
      description: lastDescription,
      createdAt: new Date().toISOString(),
    };
    const updated = [...memories, memory];
    if (setProfile) setProfile({ ...profile, visionMemories: updated });
    setShowSaveDialog(false);
    const msg = t(`Saved as "${memory.label}".`, `اتحفظت باسم "${memory.label}".`);
    setAnnounce(msg);
    speak(msg, lang);
    try {
      await setDoc(doc(db, `users/${profile.uid}`), { visionMemories: updated }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    }
  };

  const deleteMemory = async (id: string) => {
    if (!profile.uid) return;
    const updated = memories.filter((m) => m.id !== id);
    if (setProfile) setProfile({ ...profile, visionMemories: updated });
    try {
      await setDoc(doc(db, `users/${profile.uid}`), { visionMemories: updated }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    }
  };

  const replaySpeech = () => {
    if (!lastDescription) return;
    if (isSpeaking()) { cancelSpeech(); return; }
    speak(lastDescription, lang);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-bg-main overflow-hidden relative" dir={isArabicLang(lang) ? 'rtl' : 'ltr'}>
      {/* Screen-reader-only live region: every status/result change is announced
          automatically, so a blind user never has to hunt for what happened. */}
      <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">{announce}</div>

      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {/* Camera preview — mainly useful to a sighted companion helping set up,
          or for the competition demo; the blind user drives entirely by the
          button below + spoken feedback, never needs to see this. */}
      <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center">
        {status === 'camera-denied' ? (
          <div className="text-center p-8 max-w-sm">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="text-white font-semibold mb-2">
              {t('Camera access is needed for the Visual Companion to work.', 'محتاجين إذن الكاميرا عشان الرفيق البصري يشتغل.')}
            </p>
            <button
              onClick={() => startCamera()}
              className="mt-3 px-5 py-2.5 rounded-lg bg-primary text-white font-semibold"
            >
              {t('Try again', 'حاول تاني')}
            </button>
          </div>
        ) : status === 'unsupported' ? (
          <div className="text-center p-8 max-w-sm text-white">
            <p>{t('This device/browser does not support camera access.', 'الجهاز أو المتصفح ده مش بيدعم الوصول للكاميرا.')}</p>
          </div>
        ) : (
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        )}

        {status === 'starting-camera' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}

        {/* Flip camera (front/back) — small, top corner, not the primary control. */}
        {(status === 'ready' || status === 'analyzing') && (
          <button
            onClick={flipCamera}
            aria-label={t('Switch camera', 'بدّل الكاميرا')}
            className="absolute top-4 end-4 p-2.5 rounded-full bg-black/50 text-white backdrop-blur-sm"
          >
            <Camera className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Result + primary controls panel */}
      <div className="shrink-0 bg-bg-card border-t border-border p-4 sm:p-6 space-y-4">
        {lastDescription && (
          <div className="bg-bg-main border border-border rounded-xl p-4 max-h-32 overflow-y-auto custom-scrollbar">
            <p className="text-sm text-text-main leading-relaxed">{lastDescription}</p>
          </div>
        )}

        {/* THE control: huge, single tap, unambiguous label — designed to be
            found instantly by touch or a single swipe with a screen reader. */}
        <button
          onClick={describeScene}
          disabled={status === 'analyzing' || status === 'starting-camera'}
          className="w-full min-h-[76px] rounded-2xl bg-primary text-white text-lg sm:text-xl font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-transform disabled:opacity-70"
        >
          {status === 'analyzing' ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              {t('Analyzing...', 'بحلل الصورة...')}
            </>
          ) : (
            <>
              <Camera className="w-6 h-6" />
              {t("What's in front of me?", 'إيه اللي قدامي؟')}
            </>
          )}
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={replaySpeech}
            disabled={!lastDescription}
            className="min-h-[52px] rounded-xl border border-border bg-bg-main text-text-main font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Volume2 className="w-5 h-5" />
            {t('Repeat aloud', 'كرر بالصوت')}
          </button>
          <button
            onClick={openSaveDialog}
            disabled={!lastDescription}
            className="min-h-[52px] rounded-xl border border-border bg-bg-main text-text-main font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <BookmarkPlus className="w-5 h-5" />
            {t('Remember this', 'احفظ ده')}
          </button>
        </div>

        {memories.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-2">
              {t('Saved', 'المحفوظات')} ({memories.length})
            </h3>
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar">
              {memories.slice().reverse().map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-3 text-xs font-medium text-text-main"
                >
                  {m.label}
                  <button
                    onClick={() => deleteMemory(m.id)}
                    aria-label={t(`Forget "${m.label}"`, `انسَ "${m.label}"`)}
                    className="hover:text-danger"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* "Remember this as..." dialog */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowSaveDialog(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-sm bg-bg-card rounded-2xl p-5 space-y-4 border border-border"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-text-main">{t('Remember this as...', 'احفظ ده باسم...')}</h3>
                <button onClick={() => setShowSaveDialog(false)} aria-label={t('Close', 'إغلاق')}>
                  <X className="w-5 h-5 text-text-muted" />
                </button>
              </div>
              <input
                autoFocus
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveMemory(); }}
                placeholder={t('e.g. "Ahmed" or "blood pressure medicine"', 'مثلاً "أحمد" أو "دوا الضغط"')}
                className="w-full px-4 py-3 rounded-xl border border-border bg-bg-main text-text-main"
              />
              <button
                onClick={saveMemory}
                disabled={!labelInput.trim()}
                className="w-full min-h-[48px] rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
              >
                {t('Save', 'احفظ')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
