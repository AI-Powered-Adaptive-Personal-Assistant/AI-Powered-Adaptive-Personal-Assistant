import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PointerPosition, FacialGestureState } from '../lib/facialHeadTracker';
import { GazeBlinkEngine, GazeBlinkState } from '../lib/gazeBlinkEngine';
import { speak } from '../lib/tts';
import { toast } from './Toast';
import { 
  getOptiKeyPredictions, 
  applyOptiKeyPrediction, 
  OPTIKEY_QUICK_PHRASES, 
  OptiKeyQuickPhrase 
} from '../lib/optikeyPrediction';
import { 
  Volume2, Delete, Trash2, Sparkles, MessageCircle, PhoneCall, 
  Languages, Space, Eye, EyeOff, ArrowLeft, ArrowRight, Minus, 
  Settings2, AlertTriangle, LayoutGrid, Columns2, Check, ZoomIn, ZoomOut,
  Maximize2, Minimize2, Palette, Sliders, Type, Hash, ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GazeBlinkKeyboardProps {
  isArabic: boolean;
  cursorPos: PointerPosition;
  gestureState: FacialGestureState;
  onSpeakText?: (text: string) => void;
  onSendToAI?: (text: string) => void;
  onSendToWhatsApp?: (text: string) => void;
  onOpenCallPicker?: () => void;
  themeAccent?: 'amber' | 'cyan' | 'emerald' | 'pink' | 'yellow' | 'monochrome';
  /**
   * Dwell time from the shared eye-tracking settings. The keyboard kept its own
   * 750ms in local state, so the "Dwell Time" slider in Settings — the one
   * control a caregiver reaches for when keys fire too early or not at all —
   * did nothing here, and the value never synced with the student's profile.
   */
  dwellTimeMsOverride?: number;
  /**
   * True while single-switch auto-scan is driving. The keyboard runs its OWN
   * dwell and blink-click off the raw cursor, neither of which knows about the
   * scan: a blink would fire the scan's selection AND whatever key the cursor
   * happened to be over, and the dwell would fire keys the scan never
   * highlighted.
   */
  suppressOwnSelection?: boolean;
}

// 1. Standard QWERTY / Arabic
const AR_ROWS_STANDARD = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ئ', 'ء', 'ؤ', 'ر', 'لا', 'ى', 'ة', 'و', 'ز', 'ظ', 'ذ'],
  ['؟', '!', '،', '.', ' '],
];

const EN_ROWS_STANDARD = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ['?', '!', ',', '.', ' '],
];

// 2. Alphabetical (أ ب ت ث / A B C D)
const AR_ROWS_ALPHA = [
  ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ'],
  ['د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص'],
  ['ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق'],
  ['ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي'],
  ['ة', 'ى', 'لا', '؟', '!', ' '],
];

const EN_ROWS_ALPHA = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  ['H', 'I', 'J', 'K', 'L', 'M', 'N'],
  ['O', 'P', 'Q', 'R', 'S', 'T', 'U'],
  ['V', 'W', 'X', 'Y', 'Z', '?', '!'],
  [' ', ',', '.'],
];

// 3. Numbers & Symbols
const AR_ROWS_NUMS = [
  ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '٠'],
  ['+', '-', '×', '÷', '=', '%', '$', '#', '@'],
  ['(', ')', '[', ']', '{', '}', '<', '>', '/', '\\'],
  ['❤️', '👍', '🙏', '😊', '😭', '🔥', ' '],
];

const EN_ROWS_NUMS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['+', '-', '*', '/', '=', '%', '$', '#', '@'],
  ['(', ')', '[', ']', '{', '}', '<', '>', '/', '\\'],
  ['❤️', '👍', '🙏', '😊', '😭', '🔥', ' '],
];

// Themes configuration
export type KeyboardTheme = 'amber' | 'cyan' | 'emerald' | 'pink' | 'yellow' | 'monochrome';

const THEME_CONFIGS: Record<KeyboardTheme, { text: string; bg: string; border: string; ring: string; nameAr: string; nameEn: string }> = {
  amber: { text: 'text-amber-400', bg: 'bg-amber-400', border: 'border-amber-400', ring: 'ring-amber-400', nameAr: 'كهرماني دافئ', nameEn: 'Amber Gold' },
  cyan: { text: 'text-cyan-400', bg: 'bg-cyan-400', border: 'border-cyan-400', ring: 'ring-cyan-400', nameAr: 'سماوي نيون', nameEn: 'Cyber Cyan' },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-400', border: 'border-emerald-400', ring: 'ring-emerald-400', nameAr: 'زمردي مريح', nameEn: 'Emerald' },
  pink: { text: 'text-pink-400', bg: 'bg-pink-400', border: 'border-pink-400', ring: 'ring-pink-400', nameAr: 'وردي ناعم', nameEn: 'Rose Pink' },
  yellow: { text: 'text-yellow-300', bg: 'bg-yellow-300', border: 'border-yellow-300', ring: 'ring-yellow-300', nameAr: 'أصفر عالي التباين', nameEn: 'High-Contrast Yellow' },
  monochrome: { text: 'text-white', bg: 'bg-white', border: 'border-white', ring: 'ring-white', nameAr: 'أبيض وأسود عالي الوضوح', nameEn: 'Monochrome' },
};

// Key Size Presets
export type KeyScale = 'compact' | 'normal' | 'large' | 'giant';

const SCALE_PRESETS: Record<KeyScale, { keyMinH: string; textSize: string; containerP: string; gap: string; nameAr: string; nameEn: string }> = {
  compact: { keyMinH: 'min-h-[42px]', textSize: 'text-base font-semibold', containerP: 'p-2.5', gap: 'gap-1.5', nameAr: 'مدمج (صغير)', nameEn: 'Compact (S)' },
  normal: { keyMinH: 'min-h-[52px]', textSize: 'text-xl font-bold', containerP: 'p-3.5', gap: 'gap-2', nameAr: 'قياسي (متوسط)', nameEn: 'Standard (M)' },
  large: { keyMinH: 'min-h-[66px]', textSize: 'text-2xl font-black', containerP: 'p-4', gap: 'gap-2.5', nameAr: 'كبير (واضح)', nameEn: 'Large (L)' },
  giant: { keyMinH: 'min-h-[82px]', textSize: 'text-3xl font-black', containerP: 'p-5', gap: 'gap-3', nameAr: 'عملاق (سهل جداً بالعين)', nameEn: 'Giant (XL)' },
};

export default function GazeBlinkKeyboard({
  isArabic,
  cursorPos,
  gestureState,
  onSpeakText,
  onSendToAI,
  onSendToWhatsApp,
  onOpenCallPicker,
  dwellTimeMsOverride,
  suppressOwnSelection = false,
  themeAccent = 'amber'
}: GazeBlinkKeyboardProps) {
  // Text & Language State
  const [typedText, setTypedText] = useState('');
  const [kbLang, setKbLang] = useState<'ar' | 'en'>(isArabic ? 'ar' : 'en');
  const [layoutType, setLayoutType] = useState<'standard' | 'alpha' | 'nums'>('standard');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Gaze & Eye Telemetry State
  const [gazeDirection, setGazeDirection] = useState<'left' | 'right' | 'center'>('center');
  const [eyesClosed, setEyesClosed] = useState(false);
  const [currentRatio, setCurrentRatio] = useState(3.5);
  const [currentGazeRatio, setCurrentGazeRatio] = useState(1.0);
  const [blinkCount, setBlinkCount] = useState(0);

  // Flexibility & Customization State
  const [keyScale, setKeyScale] = useState<KeyScale>('normal');
  const [activeTheme, setActiveTheme] = useState<KeyboardTheme>(themeAccent);
  const [layoutMode, setLayoutMode] = useState<'full' | 'split'>('full');
  const [selectionMode, setSelectionMode] = useState<'hybrid' | 'dwell' | 'blink'>('hybrid');
  const [dwellTimeMs, setDwellTimeMs] = useState(750);
  const [dwellProgress, setDwellProgress] = useState<{ key: string; percent: number } | null>(null);

  // Modular UI Visibility Toggles
  const [showQuickPhrases, setShowQuickPhrases] = useState(false);
  const [showPredictions, setShowPredictions] = useState(true);
  const [showGazeBanner, setShowGazeBanner] = useState(true);
  const [showTelemetryHUD, setShowTelemetryHUD] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isKeyboardFullscreen, setIsKeyboardFullscreen] = useState(false);
  const [audioFeedback, setAudioFeedback] = useState(true);

  // Algorithmic Settings (PySource Part 2 & 3)
  const [ratioThreshold, setRatioThreshold] = useState(5.7);
  const [gazeLeftRatioThreshold, setGazeLeftRatioThreshold] = useState(0.85);
  const [gazeRightRatioThreshold, setGazeRightRatioThreshold] = useState(1.20);
  const [blinkMinDuration, setBlinkMinDuration] = useState(200);
  const [gazeThreshold, setGazeThreshold] = useState(0.15);

  const engineRef = useRef<GazeBlinkEngine | null>(null);
  const keyRefs = useRef<Map<string, HTMLElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Dwell state
  const dwellStartTimeRef = useRef<number>(0);
  const currentDwellKeyRef = useRef<string | null>(null);
  const lastDwellTriggerTimeRef = useRef<number>(0);

  // Sync theme when parent prop changes
  useEffect(() => {
    setActiveTheme(themeAccent);
  }, [themeAccent]);

  useEffect(() => {
    const engine = new GazeBlinkEngine({
      blinkRatioThreshold: ratioThreshold,
      blinkMinDurationMs: blinkMinDuration,
      gazeLeftThreshold: -gazeThreshold,
      gazeRightThreshold: gazeThreshold,
      gazeLeftRatioThreshold,
      gazeRightRatioThreshold,
      audioEnabled: audioFeedback,
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
    };
  }, [ratioThreshold, blinkMinDuration, gazeThreshold, gazeLeftRatioThreshold, gazeRightRatioThreshold, audioFeedback]);

  // OptiKey intelligent word predictions
  const predictions = useMemo(() => {
    return getOptiKeyPredictions(typedText, kbLang, 5);
  }, [typedText, kbLang]);

  const handleSpeak = useCallback((customText?: string) => {
    const textToSpeak = customText ?? typedText;
    if (!textToSpeak) return;
    if (onSpeakText) {
      onSpeakText(textToSpeak);
    } else {
      speak(textToSpeak, kbLang === 'ar' ? 'Arabic' : 'English');
    }
  }, [typedText, kbLang, onSpeakText]);

  const handleKeyPress = useCallback((key: string) => {
    setActiveKey(key);
    setTimeout(() => setActiveKey(null), 200);

    // Audio click feedback
    if (audioFeedback && typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(key.startsWith('PRED_') ? 880 : 650, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.onended = () => { ctx.close().catch(() => {}); };
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } catch (e) {
        // ignore audio errors
      }
    }

    if (key.startsWith('PRED_')) {
      const predIndex = parseInt(key.replace('PRED_', ''), 10);
      const chosenWord = predictions[predIndex];
      if (chosenWord) {
        setTypedText(prev => applyOptiKeyPrediction(prev, chosenWord));
        toast.info(isArabic ? `تم إكمال: ${chosenWord}` : `Completed: ${chosenWord}`);
      }
      return;
    }

    if (key.startsWith('PHRASE_')) {
      const phraseId = key.replace('PHRASE_', '');
      const phrase = OPTIKEY_QUICK_PHRASES.find(p => p.id === phraseId);
      if (phrase) {
        const phraseText = kbLang === 'ar' ? phrase.ar : phrase.en;
        setTypedText(phraseText);
        handleSpeak(phraseText);
        toast.success(phraseText);
      }
      return;
    }

    if (key === 'BACKSPACE') {
      setTypedText(prev => prev.slice(0, -1));
    } else if (key === 'SPACE') {
      setTypedText(prev => prev + ' ');
    } else if (key === 'CLEAR') {
      setTypedText('');
    } else if (key === 'SPEAK') {
      handleSpeak();
    } else if (key === 'AI') {
      if (typedText && onSendToAI) onSendToAI(typedText);
    } else if (key === 'WHATSAPP') {
      if (typedText && onSendToWhatsApp) onSendToWhatsApp(typedText);
    } else if (key === 'CALL') {
      if (onOpenCallPicker) onOpenCallPicker();
    } else if (key === 'LANG') {
      setKbLang(prev => prev === 'ar' ? 'en' : 'ar');
    } else if (key === 'PHRASES_TOGGLE') {
      setShowQuickPhrases(prev => !prev);
    } else {
      setTypedText(prev => prev + key);
    }
  }, [typedText, predictions, kbLang, isArabic, onSendToAI, onSendToWhatsApp, onOpenCallPicker, handleSpeak, audioFeedback]);

  // Main frame loop (Gaze + Blink + Dwell Time)
  useEffect(() => {
    if (!engineRef.current) return;
    const engine = engineRef.current;
    
    const state = engine.update(gestureState);
    const now = performance.now();
    
    setGazeDirection(state.gazeDirection);
    setEyesClosed(state.eyesClosed);
    setCurrentRatio(state.blinkingRatio);
    setCurrentGazeRatio(state.gazeRatio);
    setBlinkCount(state.totalBlinks);

    // Collision detection for hover
    if (containerRef.current) {
      const x = cursorPos.x;
      const y = cursorPos.y;
      
      let foundKey: string | null = null;
      keyRefs.current.forEach((el, keyId) => {
        const rect = el.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          foundKey = keyId;
        }
      });
      
      setHoveredKey(foundKey);

      // --- Dwell Selection Logic ---
      const allowDwell = !suppressOwnSelection && (selectionMode === 'dwell' || selectionMode === 'hybrid');
      const allowBlink = !suppressOwnSelection && (selectionMode === 'blink' || selectionMode === 'hybrid');

      if (allowDwell && foundKey) {
        if (currentDwellKeyRef.current !== foundKey) {
          currentDwellKeyRef.current = foundKey;
          dwellStartTimeRef.current = now;
          setDwellProgress({ key: foundKey, percent: 0 });
        } else {
          const elapsed = now - dwellStartTimeRef.current;
          const pct = Math.max(0, Math.min(100, Math.round((elapsed / dwellTimeMs) * 100)));
          setDwellProgress({ key: foundKey, percent: pct });

          if (elapsed >= dwellTimeMs && now - lastDwellTriggerTimeRef.current > dwellTimeMs + 200) {
            lastDwellTriggerTimeRef.current = now;
            dwellStartTimeRef.current = now + 350;
            handleKeyPress(foundKey);
          }
        }
      } else {
        currentDwellKeyRef.current = null;
        setDwellProgress(null);
      }

      // --- PySource Blink Click Logic ---
      if (allowBlink && state.isBlinkClick && foundKey) {
        handleKeyPress(foundKey);
        currentDwellKeyRef.current = null;
        setDwellProgress(null);
      }
    }
  }, [cursorPos, gestureState, handleKeyPress, selectionMode, dwellTimeMs, suppressOwnSelection]);

  // Adopt the shared dwell setting whenever it changes.
  useEffect(() => {
    if (typeof dwellTimeMsOverride === 'number' && dwellTimeMsOverride > 0) {
      setDwellTimeMs(dwellTimeMsOverride);
    }
  }, [dwellTimeMsOverride]);

  // Active Rows based on Language and Layout Type
  const rows = useMemo(() => {
    if (layoutType === 'nums') {
      return kbLang === 'ar' ? AR_ROWS_NUMS : EN_ROWS_NUMS;
    }
    if (layoutType === 'alpha') {
      return kbLang === 'ar' ? AR_ROWS_ALPHA : EN_ROWS_ALPHA;
    }
    return kbLang === 'ar' ? AR_ROWS_STANDARD : EN_ROWS_STANDARD;
  }, [layoutType, kbLang]);

  const currentTheme = THEME_CONFIGS[activeTheme] || THEME_CONFIGS.amber;
  const currentScale = SCALE_PRESETS[keyScale] || SCALE_PRESETS.normal;

  // Cycle key scaling
  const cycleScale = () => {
    const scales: KeyScale[] = ['compact', 'normal', 'large', 'giant'];
    const nextIdx = (scales.indexOf(keyScale) + 1) % scales.length;
    setKeyScale(scales[nextIdx]);
    toast.info(isArabic ? `حجم الأزرار: ${SCALE_PRESETS[scales[nextIdx]].nameAr}` : `Key Size: ${SCALE_PRESETS[scales[nextIdx]].nameEn}`);
  };

  const renderKey = (char: string, rowIndex: number, colIndex: number, totalCols: number) => {
    let opacityClass = 'opacity-100';

    if (layoutMode === 'split') {
      const isFirstHalf = colIndex < Math.ceil(totalCols / 2);
      const isLeftHalf = isArabic ? !isFirstHalf : isFirstHalf;
      if (gazeDirection === 'left' && !isLeftHalf) opacityClass = 'opacity-35';
      if (gazeDirection === 'right' && isLeftHalf) opacityClass = 'opacity-35';
      if (gazeDirection === 'center') opacityClass = 'opacity-85';
    }

    const isHovered = hoveredKey === char;
    const isActive = activeKey === char;
    const isDwellActive = dwellProgress?.key === char;
    const dwellPct = isDwellActive ? dwellProgress.percent : 0;
    
    return (
      <button
        key={`key-${char}-${rowIndex}-${colIndex}`}
        data-aac-id={`kb-key-${char}`}
        ref={(el) => {
          if (el) keyRefs.current.set(char, el);
          else keyRefs.current.delete(char);
        }}
        onClick={() => handleKeyPress(char)}
        className={`relative flex-1 flex items-center justify-center ${currentScale.keyMinH} rounded-2xl ${currentScale.textSize} transition-all duration-150 overflow-hidden select-none
          ${opacityClass}
          ${isHovered ? `ring-4 ${currentTheme.ring} bg-slate-800 shadow-2xl shadow-black/80 scale-[1.05] z-20` : 'bg-slate-900 border border-slate-700/80 hover:border-slate-500'}
          ${isActive ? `${currentTheme.bg} text-slate-950 scale-95` : 'text-slate-100'}
        `}
      >
        {/* Dwell Progress Fill */}
        {isDwellActive && dwellPct > 0 && (
          <div 
            className={`absolute bottom-0 left-0 right-0 ${currentTheme.bg} opacity-40 transition-all duration-75 pointer-events-none`}
            style={{ height: `${dwellPct}%` }}
          />
        )}

        <span className="relative z-10">{char === ' ' ? '␣ مسافة' : char}</span>
        {isActive && (
          <motion.div
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.5, opacity: 0 }}
            className={`absolute inset-0 rounded-2xl ${currentTheme.bg}`}
          />
        )}
      </button>
    );
  };

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col ${isKeyboardFullscreen ? 'fixed inset-0 z-[99999] rounded-none' : 'h-full rounded-3xl'} bg-slate-950 text-white border border-slate-800 ${currentScale.containerP} ${currentScale.gap} shadow-2xl transition-all ${isArabic ? 'dir-rtl' : 'dir-ltr'}`}
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      {/* 1. Ultra-Flexible Top Quick Bar */}
      <div className="flex flex-wrap justify-between items-center gap-2 px-1 pb-1 border-b border-slate-800/80">
        {/* Left Telemetry Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Eye State Indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${eyesClosed ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
            {eyesClosed ? <EyeOff size={13} /> : <Eye size={13} />}
            <span>{eyesClosed ? (isArabic ? 'مغلق' : 'Closed') : (isArabic ? 'مفتوح' : 'Open')}</span>
          </div>

          {/* Ratio telemetry */}
          {showTelemetryHUD && (
            <>
              <div className={`px-2.5 py-1 rounded-full font-mono text-xs font-bold border transition-colors ${
                currentRatio > ratioThreshold ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse' : 'bg-slate-900 text-slate-300 border-slate-800'
              }`}>
                <span>{isArabic ? 'رمش:' : 'Blink:'} </span>
                <span className={currentRatio > ratioThreshold ? 'text-rose-400' : currentTheme.text}>
                  {currentRatio.toFixed(1)}
                </span>
                <span className="text-slate-600">/{ratioThreshold.toFixed(1)}</span>
              </div>

              <div className={`px-2.5 py-1 rounded-full font-mono text-xs font-bold border transition-colors ${
                gazeDirection === 'left' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' :
                gazeDirection === 'right' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                'bg-slate-900 text-slate-300 border-slate-800'
              }`}>
                <span>{isArabic ? 'نظر:' : 'Gaze:'} </span>
                <span className={gazeDirection === 'left' ? 'text-sky-400' : gazeDirection === 'right' ? 'text-amber-400' : 'text-slate-300'}>
                  {currentGazeRatio.toFixed(2)}
                </span>
                <span className="text-slate-600"> ({gazeDirection === 'left' ? '←' : gazeDirection === 'right' ? '→' : '⊙'})</span>
              </div>
            </>
          )}
        </div>

        {/* Right Flexibility Controls Bar */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Key Size Scaling Button (Zoom) */}
          <button
            onClick={cycleScale}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 bg-slate-900 border border-slate-800 hover:border-slate-700 ${currentTheme.text} transition-all`}
            title={isArabic ? 'تغيير حجم الأزرار' : 'Change Key Size'}
          >
            <Type size={13} />
            <span>{currentScale.nameAr.split(' ')[0]}</span>
          </button>

          {/* Layout Type Switcher (Standard, Alpha, Numbers) */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
            <button
              onClick={() => setLayoutType('standard')}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${layoutType === 'standard' ? `${currentTheme.bg} text-slate-950 shadow` : 'text-slate-400 hover:text-white'}`}
              title={isArabic ? 'لوحة قياسية (Standard QWERTY)' : 'Standard'}
            >
              {isArabic ? 'قياسي' : 'Standard'}
            </button>
            <button
              onClick={() => setLayoutType('alpha')}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${layoutType === 'alpha' ? `${currentTheme.bg} text-slate-950 shadow` : 'text-slate-400 hover:text-white'}`}
              title={isArabic ? 'ترتيب أبجدي (أ ب ت ث)' : 'Alphabetical'}
            >
              {isArabic ? 'أبجدي' : 'ABC'}
            </button>
            <button
              onClick={() => setLayoutType('nums')}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${layoutType === 'nums' ? `${currentTheme.bg} text-slate-950 shadow` : 'text-slate-400 hover:text-white'}`}
              title={isArabic ? 'أرقام ورموز وإيموجي' : '123 / Emojis'}
            >
              123
            </button>
          </div>

          {/* Full vs Split Toggle */}
          <button
            onClick={() => setLayoutMode(prev => prev === 'full' ? 'split' : 'full')}
            className={`px-2 py-1 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border ${
              layoutMode === 'split' 
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' 
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
            title={isArabic ? 'تبديل بين كيبورد كامل أو مقسوم' : 'Toggle Full / Split'}
          >
            {layoutMode === 'full' ? <LayoutGrid size={13} /> : <Columns2 size={13} />}
            <span>{layoutMode === 'full' ? (isArabic ? 'كامل' : 'Full') : (isArabic ? 'مقسوم' : 'Split')}</span>
          </button>

          {/* Quick Phrases Emergency Drawer */}
          <button
            ref={(el) => { if (el) keyRefs.current.set('PHRASES_TOGGLE', el); else keyRefs.current.delete('PHRASES_TOGGLE'); }}
            onClick={() => setShowQuickPhrases(!showQuickPhrases)}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
              showQuickPhrases 
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' 
                : 'bg-slate-900 text-rose-400 hover:bg-slate-800 border border-rose-500/30'
            }`}
          >
            <AlertTriangle size={13} />
            <span>{isArabic ? 'طوارئ' : 'SOS'}</span>
          </button>

          {/* Fullscreen Toggle */}
          <button 
            onClick={() => setIsKeyboardFullscreen(!isKeyboardFullscreen)}
            className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
            title={isArabic ? 'تكبير الكيبورد على الشاشة بالكامل' : 'Fullscreen Keyboard'}
          >
            {isKeyboardFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>

          {/* Comprehensive Settings Modal Toggle */}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-xl transition-colors ${showSettings ? currentTheme.bg + ' text-slate-950' : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'}`}
            title={isArabic ? 'تخصيص وإعدادات الواجهة' : 'Customize UI & Settings'}
          >
            <Settings2 size={15} />
          </button>
        </div>
      </div>

      {/* 2. Comprehensive Flexibility Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div className="p-4 bg-slate-900 rounded-3xl border-2 border-slate-800 space-y-4 mb-2 shadow-2xl">
              <div className="text-xs text-slate-300 font-black pb-2 border-b border-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  {isArabic ? 'تخصيص الواجهة الشامل (مرونة تامة للتحكم وحجم الأزرار والثيمات)' : 'Flexible UI Customization Studio'}
                </span>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-slate-800">
                  ✕ {isArabic ? 'إغلاق' : 'Close'}
                </button>
              </div>

              {/* Theme Picker */}
              <div>
                <label className="text-xs text-slate-300 block mb-2 font-bold flex items-center gap-1.5">
                  <Palette size={14} className={currentTheme.text} />
                  {isArabic ? 'ثيم الألوان والتباين البصري:' : 'Theme & High-Contrast Style:'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {(Object.keys(THEME_CONFIGS) as KeyboardTheme[]).map((thm) => (
                    <button
                      key={thm}
                      onClick={() => setActiveTheme(thm)}
                      className={`p-2 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                        activeTheme === thm 
                          ? `${THEME_CONFIGS[thm].bg} text-slate-950 shadow-lg ring-2 ring-white scale-105` 
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full ${THEME_CONFIGS[thm].bg} border border-black/30`} />
                      <span className="truncate">{isArabic ? THEME_CONFIGS[thm].nameAr : THEME_CONFIGS[thm].nameEn}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Key Size Scaling Selector */}
              <div>
                <label className="text-xs text-slate-300 block mb-2 font-bold">
                  {isArabic ? 'حجم أزرار لوحة المفاتيح:' : 'Key Target Size:'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(SCALE_PRESETS) as KeyScale[]).map((sc) => (
                    <button
                      key={sc}
                      onClick={() => setKeyScale(sc)}
                      className={`p-2.5 rounded-2xl border text-xs font-bold transition-all ${
                        keyScale === sc 
                          ? `${currentTheme.bg} text-slate-950 shadow-lg scale-105` 
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {isArabic ? SCALE_PRESETS[sc].nameAr : SCALE_PRESETS[sc].nameEn}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selection Mode Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="text-xs text-slate-300 block mb-1.5 font-bold">
                    {isArabic ? 'طريقة الاختيار:' : 'Selection Method:'}
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setSelectionMode('hybrid')}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                        selectionMode === 'hybrid' 
                          ? `${currentTheme.bg} text-slate-950 border-transparent shadow` 
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      ✨ {isArabic ? 'هجين' : 'Hybrid'}
                    </button>
                    <button
                      onClick={() => setSelectionMode('dwell')}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                        selectionMode === 'dwell' 
                          ? `${currentTheme.bg} text-slate-950 border-transparent shadow` 
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      ⏱️ {isArabic ? 'ثبات' : 'Dwell'}
                    </button>
                    <button
                      onClick={() => setSelectionMode('blink')}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                        selectionMode === 'blink' 
                          ? `${currentTheme.bg} text-slate-950 border-transparent shadow` 
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      👁️ {isArabic ? 'رمش' : 'Blink'}
                    </button>
                  </div>
                </div>

                {/* Dwell duration slider */}
                {(selectionMode === 'dwell' || selectionMode === 'hybrid') && (
                  <div>
                    <div className="flex justify-between text-xs mb-1 text-slate-300">
                      <span>⏱️ {isArabic ? 'سرعة الثبات البصري:' : 'Dwell Time:'}</span>
                      <span className={`${currentTheme.text} font-mono font-bold`}>{dwellTimeMs}ms</span>
                    </div>
                    <input 
                      type="range" min="350" max="1600" step="50" 
                      value={dwellTimeMs} 
                      onChange={(e) => setDwellTimeMs(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                )}
              </div>

              {/* PySource Blink Ratio Slider */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex justify-between text-xs mb-1 text-slate-300">
                  <span>📐 {isArabic ? 'عتبة نسبة الرمش (PySource Blinking Ratio Threshold):' : 'Blink Threshold:'}</span>
                  <span className={`${currentTheme.text} font-mono font-bold`}>{ratioThreshold.toFixed(1)}</span>
                </div>
                <input 
                  type="range" min="3.5" max="8.0" step="0.1" 
                  value={ratioThreshold} 
                  onChange={(e) => setRatioThreshold(Number(e.target.value))}
                  className="w-full accent-amber-400"
                />
              </div>

              {/* Feature Visibility Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={showPredictions} 
                    onChange={(e) => setShowPredictions(e.target.checked)} 
                    className="rounded text-amber-400 focus:ring-0"
                  />
                  <span>{isArabic ? 'شريط التنبؤ بالكلمات' : 'Prediction Bar'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={showTelemetryHUD} 
                    onChange={(e) => setShowTelemetryHUD(e.target.checked)} 
                    className="rounded text-amber-400 focus:ring-0"
                  />
                  <span>{isArabic ? 'أرقام الحسابات (HUD)' : 'Telemetry HUD'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={audioFeedback} 
                    onChange={(e) => setAudioFeedback(e.target.checked)} 
                    className="rounded text-amber-400 focus:ring-0"
                  />
                  <span>{isArabic ? 'صوت النقر عند الاختيار' : 'Audio Clicks'}</span>
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Emergency AAC Quick Presets Drawer */}
      <AnimatePresence>
        {showQuickPhrases && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div className="p-3.5 bg-slate-900/95 rounded-3xl border-2 border-rose-500/40 shadow-2xl mb-1">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
                <span className="text-xs font-black text-rose-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  {isArabic ? 'عبارات الطوارئ والتواصل الفوري السريع' : 'Emergency & Fast AAC Presets'}
                </span>
                <button 
                  onClick={() => setShowQuickPhrases(false)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800"
                >
                  ✕ {isArabic ? 'إغلاق' : 'Close'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {OPTIKEY_QUICK_PHRASES.map((phrase) => {
                  const phraseKey = `PHRASE_${phrase.id}`;
                  const isHovered = hoveredKey === phraseKey;
                  const isDwellActive = dwellProgress?.key === phraseKey;
                  const dwellPct = isDwellActive ? dwellProgress.percent : 0;
                  const label = kbLang === 'ar' ? phrase.ar : phrase.en;

                  return (
                    <button
                      key={phrase.id}
                      ref={(el) => {
                        if (el) keyRefs.current.set(phraseKey, el);
                        else keyRefs.current.delete(phraseKey);
                      }}
                      onClick={() => handleKeyPress(phraseKey)}
                      className={`relative p-2.5 rounded-2xl border text-left flex items-center gap-2 transition-all overflow-hidden ${
                        isHovered 
                          ? 'border-rose-400 bg-rose-500/20 shadow-lg shadow-rose-500/20 scale-[1.03]' 
                          : 'border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {isDwellActive && dwellPct > 0 && (
                        <div 
                          className="absolute inset-y-0 left-0 bg-rose-500/40 transition-all duration-75 pointer-events-none"
                          style={{ width: `${dwellPct}%` }}
                        />
                      )}
                      <span className="text-2xl shrink-0">{phrase.icon}</span>
                      <span className="text-xs font-bold leading-tight truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. Text Display & Quick Actions */}
      <div className="bg-slate-900 rounded-3xl p-3.5 border border-slate-800 flex flex-col gap-2.5 shrink-0 shadow-lg">
        <div className="min-h-[55px] text-2xl font-bold break-words text-white flex items-center px-2">
          {typedText || <span className="text-slate-600 font-normal text-sm">{isArabic ? 'انظر إلى أي حرف واغمض عينك أو ثبت نظرك للكتابة...' : 'Gaze at any key and blink or dwell...'}</span>}
          <span className={`inline-block w-2.5 h-6 ml-1.5 align-middle animate-pulse ${currentTheme.bg}`}></span>
        </div>
        
        {/* Action Controls */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/60">
          <button 
            data-aac-id="kb-speak"
            ref={(el) => { if (el) keyRefs.current.set('SPEAK', el); else keyRefs.current.delete('SPEAK'); }}
            onClick={() => handleSpeak()}
            className={`flex-1 min-w-[70px] py-2.5 rounded-2xl flex justify-center items-center gap-1.5 text-xs font-bold transition-all ${
              hoveredKey === 'SPEAK' 
                ? `ring-4 ${currentTheme.ring} bg-slate-800 shadow-md scale-105` 
                : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
            } ${activeKey === 'SPEAK' ? currentTheme.bg + ' text-slate-950 scale-95' : ''}`}
          >
            <Volume2 size={16} />
            <span>{isArabic ? 'نطق' : 'Speak'}</span>
          </button>

          <button 
            data-aac-id="kb-backspace"
            ref={(el) => { if (el) keyRefs.current.set('BACKSPACE', el); else keyRefs.current.delete('BACKSPACE'); }}
            onClick={() => handleKeyPress('BACKSPACE')}
            className={`flex-1 min-w-[70px] py-2.5 rounded-2xl flex justify-center items-center gap-1.5 text-xs font-bold transition-all ${
              hoveredKey === 'BACKSPACE' 
                ? `ring-4 ${currentTheme.ring} bg-slate-800 shadow-md scale-105` 
                : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
            } ${activeKey === 'BACKSPACE' ? currentTheme.bg + ' text-slate-950 scale-95' : ''}`}
          >
            <Delete size={16} />
            <span>{isArabic ? 'حذف' : 'Del'}</span>
          </button>

          <button 
            data-aac-id="kb-clear"
            ref={(el) => { if (el) keyRefs.current.set('CLEAR', el); else keyRefs.current.delete('CLEAR'); }}
            onClick={() => handleKeyPress('CLEAR')}
            className={`flex-1 min-w-[70px] py-2.5 rounded-2xl flex justify-center items-center gap-1.5 text-xs font-bold transition-all text-rose-400 ${
              hoveredKey === 'CLEAR' ? 'ring-4 ring-rose-500 bg-rose-500/10 scale-105' : 'bg-slate-800 hover:bg-slate-700'
            } ${activeKey === 'CLEAR' ? 'bg-rose-500 text-white scale-95' : ''}`}
          >
            <Trash2 size={16} />
            <span>{isArabic ? 'مسح' : 'Clear'}</span>
          </button>
          
          {onSendToAI && (
            <button 
              data-aac-id="kb-ai"
              ref={(el) => { if (el) keyRefs.current.set('AI', el); else keyRefs.current.delete('AI'); }}
              onClick={() => { if(typedText) onSendToAI(typedText); }}
              className={`flex-1 min-w-[70px] py-2.5 rounded-2xl flex justify-center items-center gap-1.5 text-xs font-bold transition-all text-purple-400 ${
                hoveredKey === 'AI' ? 'ring-4 ring-purple-500 bg-purple-500/10 scale-105' : 'bg-slate-800 hover:bg-slate-700'
              } ${activeKey === 'AI' ? 'bg-purple-500 text-white scale-95' : ''}`}
            >
              <Sparkles size={16} />
              <span>{isArabic ? 'ذكاء' : 'AI'}</span>
            </button>
          )}
          
          {onSendToWhatsApp && (
            <button 
              data-aac-id="kb-whatsapp"
              ref={(el) => { if (el) keyRefs.current.set('WHATSAPP', el); else keyRefs.current.delete('WHATSAPP'); }}
              onClick={() => { if(typedText) onSendToWhatsApp(typedText); }}
              className={`flex-1 min-w-[70px] py-2.5 rounded-2xl flex justify-center items-center gap-1.5 text-xs font-bold transition-all text-emerald-400 ${
                hoveredKey === 'WHATSAPP' ? 'ring-4 ring-emerald-500 bg-emerald-500/10 scale-105' : 'bg-slate-800 hover:bg-slate-700'
              } ${activeKey === 'WHATSAPP' ? 'bg-emerald-500 text-white scale-95' : ''}`}
            >
              <MessageCircle size={16} />
              <span>واتساب</span>
            </button>
          )}

          {onOpenCallPicker && (
            <button 
              data-aac-id="kb-call"
              ref={(el) => { if (el) keyRefs.current.set('CALL', el); else keyRefs.current.delete('CALL'); }}
              onClick={onOpenCallPicker}
              className={`flex-1 min-w-[70px] py-2.5 rounded-2xl flex justify-center items-center gap-1.5 text-xs font-bold transition-all text-amber-400 ${
                hoveredKey === 'CALL' ? 'ring-4 ring-amber-500 bg-amber-500/10 scale-105' : 'bg-slate-800 hover:bg-slate-700'
              } ${activeKey === 'CALL' ? 'bg-amber-500 text-slate-950 scale-95' : ''}`}
            >
              <PhoneCall size={16} />
              <span>{isArabic ? 'اتصال' : 'Call'}</span>
            </button>
          )}

          <button 
            data-aac-id="kb-lang"
            ref={(el) => { if (el) keyRefs.current.set('LANG', el); else keyRefs.current.delete('LANG'); }}
            onClick={() => setKbLang(prev => prev === 'ar' ? 'en' : 'ar')}
            className={`flex-1 min-w-[70px] py-2.5 rounded-2xl flex justify-center items-center gap-1.5 text-xs font-black transition-all text-cyan-400 ${
              hoveredKey === 'LANG' ? 'ring-4 ring-cyan-500 bg-cyan-500/10 scale-105' : 'bg-slate-800 hover:bg-slate-700'
            } ${activeKey === 'LANG' ? 'bg-cyan-500 text-slate-950 scale-95' : ''}`}
          >
            <Languages size={16} />
            <span>{kbLang === 'ar' ? 'EN' : 'عربي'}</span>
          </button>
        </div>
      </div>

      {/* 5. Smart Word Predictions Bar */}
      {showPredictions && (
        <div className="bg-slate-900/90 rounded-2xl p-2 border border-slate-800/90 flex items-center gap-2 shrink-0 overflow-hidden">
          <div className={`text-xs font-black ${currentTheme.text} flex items-center gap-1 px-2 shrink-0`}>
            <Sparkles size={14} />
            <span className="hidden sm:inline">{isArabic ? 'التنبؤ الذكي:' : 'Predictions:'}</span>
          </div>

          <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar">
            {predictions.map((predWord, idx) => {
              const predKey = `PRED_${idx}`;
              const isHovered = hoveredKey === predKey;
              const isDwellActive = dwellProgress?.key === predKey;
              const dwellPct = isDwellActive ? dwellProgress.percent : 0;

              return (
                <button
                  key={predKey}
                  data-aac-id={`kb-pred-${idx}`}
                  ref={(el) => {
                    if (el) keyRefs.current.set(predKey, el);
                    else keyRefs.current.delete(predKey);
                  }}
                  onClick={() => handleKeyPress(predKey)}
                  className={`relative flex-1 py-2 px-3 rounded-2xl font-bold text-sm transition-all overflow-hidden whitespace-nowrap text-center ${
                    isHovered 
                      ? `ring-4 ${currentTheme.ring} bg-slate-800 text-white scale-[1.03] shadow-xl z-10` 
                      : 'bg-slate-950/80 border border-slate-800 text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {isDwellActive && dwellPct > 0 && (
                    <div 
                      className={`absolute inset-y-0 left-0 ${currentTheme.bg} opacity-40 transition-all duration-75 pointer-events-none`}
                      style={{ width: `${dwellPct}%` }}
                    />
                  )}
                  <span className="relative z-10">{predWord}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Dynamic Main Keyboard Grid */}
      <div className="flex-1 relative flex flex-col bg-slate-950 rounded-3xl p-3 min-h-[300px] border border-slate-900 overflow-hidden">
        {/* In Split Mode: Highlighting Box Overlays */}
        {layoutMode === 'split' && (
          <>
            <div className={`absolute inset-y-2 left-2 right-[51%] rounded-2xl transition-all duration-300 pointer-events-none ${
              gazeDirection === 'left' ? 'bg-sky-500/10 border-2 border-sky-500/50 shadow-xl shadow-sky-500/10' : 'border border-transparent'
            }`} />
            <div className={`absolute inset-y-2 left-[51%] right-2 rounded-2xl transition-all duration-300 pointer-events-none ${
              gazeDirection === 'right' ? 'bg-amber-500/10 border-2 border-amber-500/50 shadow-xl shadow-amber-500/10' : 'border border-transparent'
            }`} />
            <div className="absolute top-4 bottom-4 left-1/2 w-0.5 bg-slate-800 -translate-x-1/2 z-0 rounded-full" />
          </>
        )}

        {/* Rows Container */}
        <div className={`flex-1 flex flex-col justify-around ${currentScale.gap} z-10 w-full relative`}>
          {rows.map((row, rIndex) => (
            <div key={rIndex} className={`flex w-full ${currentScale.gap} px-0.5`}>
              {layoutMode === 'split' ? (
                <>
                  {/* Left Half */}
                  <div className={`flex-1 flex ${currentScale.gap} justify-end`}>
                    {row.slice(0, Math.ceil(row.length / 2)).map((char, cIndex) => 
                      renderKey(char, rIndex, cIndex, row.length)
                    )}
                  </div>
                  {/* Divider Gap */}
                  <div className="w-3 shrink-0" />
                  {/* Right Half */}
                  <div className={`flex-1 flex ${currentScale.gap} justify-start`}>
                    {row.slice(Math.ceil(row.length / 2)).map((char, cIndex) => 
                      renderKey(char, rIndex, cIndex + Math.ceil(row.length / 2), row.length)
                    )}
                  </div>
                </>
              ) : (
                /* Full Unified Row Layout */
                row.map((char, cIndex) => renderKey(char, rIndex, cIndex, row.length))
              )}
            </div>
          ))}
          
          {/* Space Bar Row */}
          <div className="flex w-full justify-center px-1 pt-1">
            <button
              data-aac-id="kb-space"
              ref={(el) => { if (el) keyRefs.current.set('SPACE', el); else keyRefs.current.delete('SPACE'); }}
              onClick={() => handleKeyPress('SPACE')}
              className={`relative w-2/3 max-w-lg ${currentScale.keyMinH} rounded-2xl flex items-center justify-center transition-all overflow-hidden select-none
                ${hoveredKey === 'SPACE' ? `ring-4 ${currentTheme.ring} bg-slate-800 shadow-2xl scale-[1.03]` : 'bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-500'}
                ${activeKey === 'SPACE' ? `${currentTheme.bg} text-slate-950 scale-95` : ''}
              `}
            >
              {dwellProgress?.key === 'SPACE' && dwellProgress.percent > 0 && (
                <div 
                  className={`absolute inset-y-0 left-0 ${currentTheme.bg} opacity-35 transition-all duration-75`}
                  style={{ width: `${dwellProgress.percent}%` }}
                />
              )}
              <div className="flex items-center gap-2 relative z-10 font-bold text-sm">
                <Space size={22} />
                <span>{isArabic ? 'مسافة' : 'Space'}</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
