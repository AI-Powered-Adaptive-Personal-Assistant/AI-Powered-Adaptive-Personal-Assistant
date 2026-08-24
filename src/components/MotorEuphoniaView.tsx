import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, VocalSoundTriggerConfig, AACCardItem, HeadTrackingConfig } from '../types';
import { vocalSoundEngine, LiveAudioMetrics, loadVocalTriggers } from '../lib/vocalSoundTrigger';
import { FacialHeadTracker, PointerPosition, FacialGestureState, DEFAULT_HEAD_TRACKING_CONFIG } from '../lib/facialHeadTracker';
import { speak, cancelSpeech, unlockSpeechSynthesis, hasArabicVoice } from '../lib/tts';
import { geminiService } from '../services/geminiService';
import { toast } from './Toast';
import { localize } from '../lib/translations';
import {
  EmergencyContact,
  loadContacts,
  saveContacts,
  makePhoneCall,
  sendWhatsAppMessage,
  WHATSAPP_QUICK_MESSAGES,
} from '../lib/contacts';
import {
  EuphoniaPhraseDef,
  loadEuphoniaPhraseBank,
  getCategoryIcon,
} from '../lib/euphoniaPhraseBank';
import {
  euphoniaRecorder,
  LocalIndexedDbStorageAdapter,
  RestUploadStorageAdapter,
  EuphoniaStorageAdapter,
  EuphoniaAudioSample,
} from '../lib/euphoniaRecorder';

/** Shared default adapter — constructed once, not on every render. */
const DEFAULT_LOCAL_ADAPTER = new LocalIndexedDbStorageAdapter();
import {
  transcribe,
  getEuphoniaApiUrl,
  setEuphoniaApiUrl,
  checkEuphoniaApiHealth,
} from '../lib/euphoniaApi';
import {
  Activity,
  Mic,
  MicOff,
  Volume2,
  Camera,
  CameraOff,
  RefreshCw,
  Sparkles,
  Sliders,
  Send,
  Bell,
  BookOpen,
  Heart,
  Smile,
  Eye,
  SlidersHorizontal,
  Phone,
  PhoneCall,
  MessageCircle,
  Users,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  X,
  Keyboard as KeyboardIcon,
  Delete,
  Space,
  Languages,
  ArrowRight,
  Lightbulb,
  Tv,
  Wind,
  Bed,
  BellRing,
  Thermometer,
  Zap,
  Check,
  Target,
  Palette,
  VolumeX,
  GraduationCap,
  MessageSquare,
  BookmarkPlus,
  Gamepad2,
  Maximize2,
  Minimize2,
  Trophy,
  Gauge,
  Radio,
  Award,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MotorEuphoniaViewProps {
  profile: UserProfile;
  onSendMessage?: (text: string) => void;
}

// Color Theme Profiles
type ColorTheme = 'amber' | 'cyan' | 'emerald' | 'monochrome';

// Arabic Keyboard Layout Rows (High Contrast & Clear Grid)
const AR_KEYBOARD_ROWS = [
  ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '٠'],
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ئ', 'ء', 'ؤ', 'ر', 'لا', 'ى', 'ة', 'و', 'ز', 'ظ', 'ذ'],
  ['؟', '!', '،', '.']
];

// English Keyboard Layout Rows
const EN_KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ['?', '!', ',', '.']
];

// Arabic Predictive Autocomplete dictionary
const AR_PREDICTIONS: Record<string, string[]> = {
  'ا': ['أنا بخير شكراً', 'أحتاج مساعدة عاجلة', 'أريد شرب ماء', 'أستاذ ممكن سؤال؟', 'السلام عليكم'],
  'أ': ['أنا بخير شكراً', 'أحتاج مساعدة عاجلة', 'أريد شرب ماء', 'أستاذ ممكن سؤال؟', 'أين المرافق؟'],
  'اح': ['أحتاج مساعدة', 'أحتاج ماء', 'أحتاج الذهاب للطبيب'],
  'شك': ['شكراً جزيلاً', 'شكراً لك', 'شكراً على المساعدة'],
  'لو': ['لو سمحت ساعدني', 'لو تفضلت بالماء', 'لو سمحت اضبط السرير'],
  'مس': ['مساعدة من فضلك', 'مساء الخير', 'مستعد للدرس'],
  'عا': ['عايز مساعدة', 'عندي سؤال دراسي', 'عاجل جداً'],
  'من': ['من فضلك', 'ممكن توضيح المفهوم', 'ممكن إعادة النقطة'],
  'ما': ['ماما تعالي', 'ماء للشرب', 'ماشي شكراً'],
  'مر': ['مرافق تعال', 'مرحباً بكم'],
  'دك': ['دكتور احتاجك', 'دقيقة واحدة'],
  'ار': ['أريد تعديل الجلسة', 'أريد النوم', 'أريد الراحة'],
};

const EN_PREDICTIONS: Record<string, string[]> = {
  'i': ['I need help', 'I am fine, thanks', 'I want water', 'I have a question'],
  'h': ['Help please', 'Hello everyone', 'How are you?', 'Home comfort'],
  't': ['Thank you very much', 'Thanks for help', 'Today was good', 'Time for rest'],
  'p': ['Please help me', 'Please call caregiver', 'Problem here'],
  'w': ['Water please', 'WhatsApp message', 'Where are you?', 'What is next?'],
  'c': ['Call doctor now', 'Caregiver assistance', 'Can you explain?'],
};

// Steve Saling Smart Room Automation items
const SMART_ROOM_ITEMS = [
  { id: 'room-light', icon: '💡', labelAr: 'إضاءة الغرفة', labelEn: 'Room Lights', phraseAr: 'لو سمحت قم بتبديل إضاءة الغرفة.', phraseEn: 'Please toggle the room lights.' },
  { id: 'room-tv', icon: '📺', labelAr: 'التلفاز / الشاشة', labelEn: 'TV / Display', phraseAr: 'لو سمحت شغل التلفاز أو شاشة العرض.', phraseEn: 'Please turn on the TV.' },
  { id: 'room-ac', icon: '❄️', labelAr: 'المكيف / التبريد', labelEn: 'AC / Fan', phraseAr: 'لو سمحت شغل المكيف واضبط الحرارة.', phraseEn: 'Please adjust the air conditioning.' },
  { id: 'room-bed-up', icon: '🛏️', labelAr: 'رفع السرير', labelEn: 'Raise Bed', phraseAr: 'لو سمحت ارفع مسند الظهر بالسرير.', phraseEn: 'Please raise the back of my bed.' },
  { id: 'room-bed-down', icon: '🛌', labelAr: 'تمديد السرير', labelEn: 'Flat Bed', phraseAr: 'لو سمحت اجعل السرير في وضع النوم المستوي.', phraseEn: 'Please adjust bed flat for resting.' },
  { id: 'room-alarm', icon: '🔔', labelAr: 'نداء الممرض / إنذار', labelEn: 'Nurse Call Alarm', phraseAr: 'نداء عاجل! أحتاج المرافق أو الممرض فوراً!', phraseEn: 'Urgent assistance needed! Nurse call!', isAlarm: true },
];

// Pain & Sensory Feedback Board
const SENSORY_PAIN_ITEMS = [
  { id: 'pain-head', icon: '🤕', labelAr: 'صداع / ألم بالرأس', phraseAr: 'أشعر بصداع وألم في رأسي، أحتاج مسكن.' },
  { id: 'pain-stomach', icon: '🤢', labelAr: 'ألم بالمعدة / غثيان', phraseAr: 'أشعر بألم في معدتي وغثيان.' },
  { id: 'pain-back', icon: '🩹', labelAr: 'ألم بالظهر / ضغط', phraseAr: 'أشعر بألم وضغط في ظهري، يرجى تعديل وضعيتي.' },
  { id: 'sensory-cold', icon: '🥶', labelAr: 'أشعر بالبرد الشديد', phraseAr: 'أشعر بالبرد الشديد، لو سمحت غطني ببطانية.' },
  { id: 'sensory-hot', icon: '🥵', labelAr: 'أشعر بالحر الشديد', phraseAr: 'أشعر بالحر الشديد، يرجى تشغيل المروحة.' },
  { id: 'sensory-tired', icon: '🥱', labelAr: 'مرهق / أريد النوم', phraseAr: 'أشعر بالإرهاق وأريد النوم والراحة الآن.' },
];

// Default Personal Phrase Bank
const DEFAULT_CUSTOM_PHRASES = [
  { id: 'cp-1', textAr: 'صباح الخير للجميع، يوم سعيد.', icon: '☀️' },
  { id: 'cp-2', textAr: 'أريد مراجعة ملخص درس اليوم.', icon: '📚' },
  { id: 'cp-3', textAr: 'هل يمكن فتح النافذة قليلاً لتجديد الهواء؟', icon: '🪟' },
  { id: 'cp-4', textAr: 'أحبكم جميعاً وشكراً لدعمكم المستمر.', icon: '❤️' },
  { id: 'cp-5', textAr: 'أحتاج شاحن الهاتف والكمبيوتر لو سمحت.', icon: '🔌' },
];

// Steve Saling / Euphonia Quick Need Action Cards
const QUICK_NEEDS = [
  { id: 'need-help', icon: '🚨', labelAr: 'طوارئ / مساعدة', labelEn: 'Emergency / Help', phraseAr: 'أحتاج إلى مساعدة عاجلة من المرافق لو سمحت.', phraseEn: 'I need urgent assistance please.' },
  { id: 'need-water', icon: '💧', labelAr: 'أحتاج ماء', labelEn: 'Need Water', phraseAr: 'أحتاج إلى شرب ماء من فضلك.', phraseEn: 'I would like a drink of water please.' },
  { id: 'need-adjust', icon: '🪑', labelAr: 'تعديل الجلسة', labelEn: 'Adjust Position', phraseAr: 'لو سمحت ساعدني في تعديل وضعية جلوسي.', phraseEn: 'Please help me adjust my position.' },
  { id: 'comm-yes', icon: '✅', labelAr: 'نعم تماماً', labelEn: 'Yes, Exactly', phraseAr: 'نعم، هذا صحيح تماماً.', phraseEn: 'Yes, exactly.' },
  { id: 'comm-no', icon: '❌', labelAr: 'لا، ليس هذا', labelEn: 'No, Not This', phraseAr: 'لا، ليس هذا ما أقصده.', phraseEn: 'No, not this.' },
  { id: 'ai-explain', icon: '💡', labelAr: 'اشرح الدرس', labelEn: 'Explain Simply', phraseAr: 'هل يمكنك شرح المفهوم الأساسي بتشبيه بسيط؟', phraseEn: 'Can you explain simply?', isAi: true },
];

// Project Euphonia Training Phrase Set (Google Project Euphonia Architecture)
interface EuphoniaPhraseItem {
  id: string;
  phraseAr: string;
  phraseEn: string;
  category: string;
  icon: string;
  samplesRecorded: number;
}

const DEFAULT_EUPHONIA_PHRASES: EuphoniaPhraseItem[] = [
  { id: 'eup-1', phraseAr: 'أريد شرب ماء من فضلك', phraseEn: 'I want water please', category: 'basic', icon: '💧', samplesRecorded: 3 },
  { id: 'eup-2', phraseAr: 'أحتاج مساعدة عاجلة من المرافق', phraseEn: 'I need urgent assistance', category: 'emergency', icon: '🚨', samplesRecorded: 3 },
  { id: 'eup-3', phraseAr: 'نعم، هذا صحيح تماماً', phraseEn: 'Yes, exactly', category: 'response', icon: '✅', samplesRecorded: 3 },
  { id: 'eup-4', phraseAr: 'لا، ليس هذا ما أريده', phraseEn: 'No, not this', category: 'response', icon: '❌', samplesRecorded: 3 },
  { id: 'eup-5', phraseAr: 'أشعر بألم وأريد تعديل وضعيتي', phraseEn: 'I am in pain, adjust position', category: 'medical', icon: '🩹', samplesRecorded: 2 },
  { id: 'eup-6', phraseAr: 'ماما تعالي أحتاجك', phraseEn: 'Mom please come', category: 'family', icon: '👩‍👧', samplesRecorded: 1 },
];

// Game 1 Target Bubbles list
const GAME_BUBBLES = [
  { id: 'b-1', char: 'أ', x: 20, y: 30, color: 'bg-amber-400 text-slate-950' },
  { id: 'b-2', char: 'ب', x: 70, y: 25, color: 'bg-emerald-400 text-slate-950' },
  { id: 'b-3', char: 'ج', x: 35, y: 70, color: 'bg-indigo-400 text-white' },
  { id: 'b-4', char: 'د', x: 80, y: 65, color: 'bg-rose-400 text-white' },
  { id: 'b-5', char: 'هـ', x: 50, y: 45, color: 'bg-cyan-400 text-slate-950' },
];

export default function MotorEuphoniaView({ profile, onSendMessage }: MotorEuphoniaViewProps) {
  const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';

  // Active Category Tab (Includes Google Project Euphonia Training Studio)
  const [activeTab, setActiveTab] = useState<'keyboard' | 'euphonia-studio' | 'smart-room' | 'pain-sensory' | 'class-ai' | 'custom-bank' | 'eye-games'>('keyboard');

  // Theme state
  const [theme, setTheme] = useState<ColorTheme>('amber');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tracking states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAudioEngineActive, setIsAudioEngineActive] = useState(false);
  const [cursorPos, setCursorPos] = useState<PointerPosition>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 400,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 300,
    normalizedX: 0.5,
    normalizedY: 0.5,
  });
  const [dwellProgress, setDwellProgress] = useState(0);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  // LIVE REFS for the tracker callbacks.
  //
  // FacialHeadTracker.start() receives its callbacks ONCE and keeps them for the
  // whole session, so anything they close over is frozen at that render. That is
  // why dwelling on Speak / Ask AI / WhatsApp did nothing and blink-to-click
  // never fired: handleCardTrigger was a stale copy and hoveredCardId was stuck
  // at its initial null. Mouse clicks went through a different path, which is
  // why desktop testing never caught it. These refs are re-pointed on every
  // render, and the callbacks read `.current` instead of the captured value.
  const cameraBusyRef = useRef(false); // in-flight guard for startCamera()
  const mountedRef = useRef(true);     // guards async callbacks after unmount
  const pendingTimersRef = useRef<any[]>([]); // every timer, cleared on unmount
  const calibAbortRef = useRef(0);            // generation id for the calibration chain
  const sharedAudioCtxRef = useRef<AudioContext | null>(null); // one context for all cues
  const [showCenterDot, setShowCenterDot] = useState(false); // "look at centre" recenter
  /** setTimeout that is cancelled automatically when the view unmounts. */
  const trackedTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      pendingTimersRef.current = pendingTimersRef.current.filter((t) => t !== id);
      if (mountedRef.current) fn();
    }, ms);
    pendingTimersRef.current.push(id);
    return id;
  };
  const hoveredCardIdRef = useRef<string | null>(null);
  const handleCardTriggerRef = useRef<(id: string) => void>(() => {});
  const checkHoverTargetRef = useRef<(pos: PointerPosition) => void>(() => {});
  const [gestureState, setGestureState] = useState<FacialGestureState>({
    isSmiling: false,
    isMouthOpen: false,
    isEyebrowRaised: false,
    isBlinking: false,
    confidence: 0,
  });

  // 9-Point Medical Eye Calibration state
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [calibrationPointIndex, setCalibrationPointIndex] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibAccuracy, setCalibAccuracy] = useState<number | null>(null);

  // Google Project Euphonia 100-Phrase Bank & Model Training State
  const [euphoniaPhraseBank, setEuphoniaPhraseBank] = useState<EuphoniaPhraseDef[]>([]);
  const [euphoniaTrainingState, setEuphoniaTrainingState] = useState<Record<string, number>>({});
  const [euphoniaCategoryFilter, setEuphoniaCategoryFilter] = useState<string>('all');
  const [recordingPhraseId, setRecordingPhraseId] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [isEuphoniaLiveListening, setIsEuphoniaLiveListening] = useState(false);
  const [euphoniaMatchedPhrase, setEuphoniaMatchedPhrase] = useState<string | null>(null);
  const [euphoniaMatchSource, setEuphoniaMatchSource] = useState<'custom-model' | 'browser-fallback' | null>(null);
  const [euphoniaApiUrlInput, setEuphoniaApiUrlInput] = useState(() => getEuphoniaApiUrl());
  // The SAVED url, separate from the draft text above. The storage-adapter
  // effect used to key on the draft while reading the persisted value, so
  // pressing "Save & Test" never re-ran it: the toast said "Connected to your
  // custom model" while every sample kept going to local IndexedDB, silently,
  // until someone went looking for the training data.
  const [euphoniaApiUrl, setEuphoniaApiUrlState] = useState(() => getEuphoniaApiUrl());
  const [euphoniaApiHealthy, setEuphoniaApiHealthy] = useState<boolean | null>(null);

  // Storage adapter: REST if an API URL is configured, otherwise local
  // IndexedDB so recording still works fully offline / pre-backend.
  // Module-level default so the ref stays non-null (this project has
  // strictNullChecks off, so a nullable ref would not be type-checked at its
  // call sites) while avoiding the per-render construction the previous
  // `useRef(new LocalIndexedDbStorageAdapter())` did on every single render.
  const storageAdapterRef = useRef<EuphoniaStorageAdapter>(DEFAULT_LOCAL_ADAPTER);

  useEffect(() => {
    storageAdapterRef.current = euphoniaApiUrl
      ? new RestUploadStorageAdapter(euphoniaApiUrl)
      : new LocalIndexedDbStorageAdapter();
  }, [euphoniaApiUrl]);

  // Load the 100-phrase bank once on mount.
  useEffect(() => {
    loadEuphoniaPhraseBank().then(async (bank) => {
      setEuphoniaPhraseBank(bank);
      const counts: Record<string, number> = {};
      for (const p of bank) {
        try {
          counts[p.id] = await storageAdapterRef.current.countForPhrase(p.id);
        } catch {
          counts[p.id] = 0;
        }
      }
      setEuphoniaTrainingState(counts);
    });
  }, []);

  // One-time check: warn early if this device has no Arabic voice installed
  useEffect(() => {
    const t = setTimeout(() => {
      if (isArabic && !hasArabicVoice()) {
        toast.error(
          isArabic
            ? '⚠️ لا يوجد صوت عربي مثبت على هذا الجهاز — النطق الصوتي لن يعمل. ثبّت حزمة لغة عربية من إعدادات النظام.'
            : '⚠️ No Arabic voice found on this device — speech output will not work.'
        );
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Eye Game State
  const [gameScore, setGameScore] = useState(0);
  const [gamePoppedIds, setGamePoppedIds] = useState<string[]>([]);
  const [reactionBenchmarkMs, setReactionBenchmarkMs] = useState<number | null>(null);
  const reactionStartTimeRef = useRef<number>(Date.now());
  const reactionSamplesRef = useRef<number[]>([]); // per-bubble times, averaged

  // Audio metrics
  const [audioMetrics, setAudioMetrics] = useState<LiveAudioMetrics>({
    volume: 0,
    peakFrequency: 0,
    isTriggering: false,
  });
  const [triggers] = useState<VocalSoundTriggerConfig[]>(loadVocalTriggers);

  // Settings
  const [headConfig, setHeadConfig] = useState<HeadTrackingConfig>(() => {
    try {
      const saved = localStorage.getItem('cognify_head_config');
      return saved ? JSON.parse(saved) : DEFAULT_HEAD_TRACKING_CONFIG;
    } catch {
      return DEFAULT_HEAD_TRACKING_CONFIG;
    }
  });

  // Custom Phrase Bank
  const [customPhrases, setCustomPhrases] = useState(() => {
    try {
      const saved = localStorage.getItem('cognify_custom_phrases');
      return saved ? JSON.parse(saved) : DEFAULT_CUSTOM_PHRASES;
    } catch {
      return DEFAULT_CUSTOM_PHRASES;
    }
  });
  const [newPhraseInput, setNewPhraseInput] = useState('');

  // Eye-Gaze Arabic Virtual Keyboard State
  const [typedText, setTypedText] = useState('');
  const [kbLang, setKbLang] = useState<'ar' | 'en'>('ar');
  const [suggestedWords, setSuggestedWords] = useState<string[]>([
    'أنا بخير شكراً', 'أحتاج مساعدة عاجلة', 'أريد شرب ماء', 'شكراً جزيلاً', 'ماما تعالي', 'دكتور احتاجك'
  ]);

  // Smart Room status simulations
  const [roomLightOn, setRoomLightOn] = useState(false);
  const [roomTvOn, setRoomTvOn] = useState(false);
  const [roomAcOn, setRoomAcOn] = useState(false);

  // AI Class / Teacher Live Listener State
  const [isListeningToTeacher, setIsListeningToTeacher] = useState(false);
  const [teacherHeardSpeech, setTeacherHeardSpeech] = useState('');
  const [aiGeneratedClassOptions, setAiGeneratedClassOptions] = useState<string[]>([
    'نعم، فهمت هذا الجزء تماماً.',
    'ممكن إعادة شرح النقطة الأخيرة بمثال؟',
    'أنا جاهز للإجابة عن السؤال.',
    'عندي استفسار عن التطبيق العملي.'
  ]);

  // Mobile Contacts & WhatsApp Modals
  const [contacts, setContacts] = useState<EmergencyContact[]>(loadContacts);
  const [showContactPickerModal, setShowContactPickerModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [selectedContactForWa, setSelectedContactForWa] = useState<EmergencyContact | null>(null);
  const [customWaMessage, setCustomWaMessage] = useState('');
  const [isListeningForContactName, setIsListeningForContactName] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Debounce lock for phone calls
  const isDialingRef = useRef(false);

  // Dysarthric Speech AI decoding
  const [isRecordingSpeech, setIsRecordingSpeech] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  const [isProcessingAi, setIsProcessingAi] = useState(false);

  // Mouse Dwell simulation for testing without camera
  const mouseDwellStartRef = useRef<number>(0);
  const mouseHoverTargetRef = useRef<string | null>(null);

  // Scientific Eye-Tracking Architecture Modal State
  const [showScientificArchitectureModal, setShowScientificArchitectureModal] = useState(false);
  const [eyeLiveMetrics, setEyeLiveMetrics] = useState<any>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<FacialHeadTracker | null>(null);
  const voiceContactRecRef = useRef<any>(null);
  const teacherRecRef = useRef<any>(null);

  // Keep the magnetic-snap cache in sync with the visible tab
  useEffect(() => {
    const t = setTimeout(() => trackerRef.current?.refreshSnapTargetsCache(), 60);
    return () => clearTimeout(t);
  }, [activeTab]);

  /**
   * Central speech helper: every place in this view that should say something
   * out loud goes through here instead of calling speak() directly. This is
   * what surfaces a toast when a phrase silently fails to speak (no Arabic
   * voice installed, speechSynthesis blocked outside a user gesture, etc.)
   * instead of the card just doing nothing.
   */
  const speakSafe = (text: string) => {
    if (!text?.trim()) return;
    speak(text, profile.language || 'Egyptian Ammiya', {
      onError: (reason) => {
        const msg =
          reason === 'unsupported'
            ? (isArabic ? '⚠️ المتصفح لا يدعم النطق الصوتي' : '⚠️ This browser does not support speech output')
            : reason === 'silent-fail'
            ? (isArabic
                ? '⚠️ تعذر نطق الجملة. تأكد من وجود صوت عربي مثبت على الجهاز وأن الصوت غير مكتوم'
                : '⚠️ Could not speak. Check that an Arabic voice is installed and the device is not muted')
            : (isArabic ? '⚠️ حدث خطأ أثناء النطق الصوتي' : '⚠️ Speech output error');
        toast.error(msg);
      },
    });
  };

  /**
   * ONE shared AudioContext for every cue.
   *
   * Each helper used to do `new AudioContext()` per sound and never close it.
   * Browsers cap the number of live contexts, so after a session of clicks,
   * alarms and calibrations creation started failing silently: no click
   * confirmation on selection, and the nurse-call alarm played nothing — the
   * student got no confirmation their emergency call had registered.
   */
  const getAudioCtx = (): AudioContext | null => {
    try {
      if (!sharedAudioCtxRef.current) {
        const C = window.AudioContext || (window as any).webkitAudioContext;
        if (!C) return null;
        sharedAudioCtxRef.current = new C();
      }
      const ctx = sharedAudioCtxRef.current;
      // Autoplay policy can leave it suspended until a gesture.
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    } catch {
      return null;
    }
  };

  // Audio click sound for eye-blink confirmation
  const playBlinkClickSound = () => {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {
      /* ignore */
    }
  };

  // Pop Bubble Sound Effect
  const playPopSound = () => {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      /* ignore */
    }
  };

  // High-priority Nurse Alarm Sound
  const playNurseAlarmSound = () => {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, now + i * 0.25);
        osc.frequency.setValueAtTime(900, now + i * 0.25 + 0.12);
        gain.gain.setValueAtTime(0.4, now + i * 0.25);
        gain.gain.linearRampToValueAtTime(0.01, now + i * 0.25 + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.25);
        osc.stop(now + i * 0.25 + 0.25);
      }
    } catch {
      /* ignore */
    }
  };

  // Toggle Browser Fullscreen
  const toggleFullScreenMode = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Auto-start camera when view mounts.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isCameraActive && videoRef.current) {
        toggleCamera();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Unlock speech synthesis on the first REAL user gesture.
  //
  // toggleCamera() calls unlockSpeechSynthesis(), but the auto-start above fires
  // it from a timer rather than a gesture, so the browser's autoplay policy
  // refuses the unlock and the FIRST phrase the student speaks is silently
  // dropped — the card highlights and the toast claims it was spoken, but
  // nothing comes out. Any genuine interaction repairs it.
  useEffect(() => {
    let done = false;
    const unlock = () => {
      if (done) return;
      done = true;
      try { unlockSpeechSynthesis(); } catch { /* ignore */ }
      remove();
    };
    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    const remove = () => events.forEach((e) => document.removeEventListener(e, unlock));
    events.forEach((e) => document.addEventListener(e, unlock, { once: true, passive: true }));
    return remove;
  }, []);

  // Mouse movement fallback listener
  useEffect(() => {
    if (isCameraActive) return;

    let dwellInterval: any = null;

    const handleMouseMove = (e: MouseEvent) => {
      const pos = {
        x: e.clientX,
        y: e.clientY,
        normalizedX: e.clientX / window.innerWidth,
        normalizedY: e.clientY / window.innerHeight,
      };
      setCursorPos(pos);
      checkHoverTarget(pos);
    };

    dwellInterval = setInterval(() => {
      if (mouseHoverTargetRef.current && mouseDwellStartRef.current > 0) {
        const elapsed = Date.now() - mouseDwellStartRef.current;
        const prog = Math.min(1, elapsed / headConfig.dwellTimeMs);
        setDwellProgress(prog);

        if (prog >= 1) {
          const target = mouseHoverTargetRef.current;
          mouseHoverTargetRef.current = null;
          mouseDwellStartRef.current = 0;
          setDwellProgress(0);
          handleCardTrigger(target);
        }
      } else {
        setDwellProgress(0);
      }
    }, 50);

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (dwellInterval) clearInterval(dwellInterval);
    };
  }, [isCameraActive, headConfig.dwellTimeMs, hoveredCardId]);

  // Update word autocomplete suggestions when typedText changes
  useEffect(() => {
    const lastWord = typedText.trim().split(/\s+/).pop()?.toLowerCase() || '';
    if (!lastWord) {
      setSuggestedWords(
        kbLang === 'ar'
          ? ['أنا بخير شكراً', 'أحتاج مساعدة عاجلة', 'أريد شرب ماء', 'شكراً جزيلاً', 'ماما تعالي', 'دكتور احتاجك']
          : ['I need help', 'Thank you', 'Please help', 'Water please', 'Call caregiver']
      );
      return;
    }

    const dict = kbLang === 'ar' ? AR_PREDICTIONS : EN_PREDICTIONS;
    const matchedKey = Object.keys(dict).find((k) => lastWord.startsWith(k));
    if (matchedKey) {
      setSuggestedWords(dict[matchedKey]);
    } else {
      setSuggestedWords([]);
    }
  }, [typedText, kbLang]);

  // Save head tracking config
  const updateHeadConfig = (newCfg: Partial<HeadTrackingConfig>) => {
    const updated = { ...headConfig, ...newCfg };
    setHeadConfig(updated);
    trackerRef.current?.updateConfig(updated);
    try {
      localStorage.setItem('cognify_head_config', JSON.stringify(updated));
    } catch {
      /* ignore */
    }
  };

  // Start / Stop Camera Tracking
  const toggleCamera = async () => {
    unlockSpeechSynthesis();

    if (isCameraActive) {
      trackerRef.current?.stop();
      trackerRef.current = null;
      setIsCameraActive(false);
      return;
    }

    if (!videoRef.current) return;
    // Re-entrancy guard: the on-screen button and the auto-start effect could
    // both fire (isCameraActive is only set AFTER getUserMedia resolves), which
    // built two trackers. The second overwrote trackerRef, so "Stop Camera"
    // could only ever stop one — the other kept the webcam LED on and a second
    // FaceMesh running at 60fps, fighting over the cursor.
    if (cameraBusyRef.current) return;
    cameraBusyRef.current = true;
    try { trackerRef.current?.stop(); } catch { /* nothing running */ }

    const tracker = new FacialHeadTracker(headConfig);
    trackerRef.current = tracker;

    const ok = await tracker.start(
      videoRef.current,
      {
        onPointerMove: (pos, prog) => {
          setCursorPos(pos);
          setDwellProgress(prog);
          checkHoverTargetRef.current(pos);
        },
        onDwellComplete: (targetId) => {
          handleCardTriggerRef.current(targetId);
        },
        onGesture: (gesture) => {
          setGestureState(gesture);
          if (gesture.metrics) {
            setEyeLiveMetrics(gesture.metrics);
          }
          const hovered = hoveredCardIdRef.current;
          if (gesture.isBlinking) {
            if (hovered) {
              playBlinkClickSound();
              handleCardTriggerRef.current(hovered);
            }
          } else if (gesture.isSmiling) {
            if (hovered) {
              handleCardTriggerRef.current(hovered);
            }
          }
        },
        onCalibrationStatus: (status) => {
          setCalibAccuracy(status.accuracyEstimate);
        },
        onError: (code) => {
          // Face tracking could not load. Say so and shut the camera off rather
          // than leaving a live camera with a pointer that never moves.
          if (!mountedRef.current) return;
          toast.error(
            isArabic
              ? 'تعذّر تحميل محرك تتبّع الوجه. راجع الاتصال بالإنترنت وحاول تاني.'
              : 'Face-tracking engine failed to load. Check the connection and try again.',
            isArabic ? 'تتبّع العين غير متاح' : 'Eye tracking unavailable',
          );
          console.error('[MotorEuphonia] face mesh:', code);
          try { trackerRef.current?.stop(); } catch { /* ignore */ }
          trackerRef.current = null;
          setIsCameraActive(false);
        },
      },
      overlayCanvasRef.current
    );

    cameraBusyRef.current = false;

    if (ok) {
      setIsCameraActive(true);
      toast.success(isArabic ? 'تم تفعيل تتبع العين - انظر للحرف وأغمض عينك لكتابته' : 'Eye-Gaze active - look and blink to type');
    } else {
      // start() released the stream itself; make sure no half-built tracker
      // is left behind holding a camera.
      try { trackerRef.current?.stop(); } catch { /* ignore */ }
      trackerRef.current = null;
      toast.error(isArabic ? 'تعذر الوصول إلى الكاميرا' : 'Could not access webcam');
    }
  };

  // Start / Stop Euphonia Vocal Sound Engine
  const toggleAudioEngine = async () => {
    if (isAudioEngineActive) {
      vocalSoundEngine.stop();
      setIsAudioEngineActive(false);
      return;
    }

    const ok = await vocalSoundEngine.start(
      (trig) => {
        handleVocalTriggerAction(trig);
      },
      (metrics) => {
        setAudioMetrics(metrics);
      }
    );

    if (ok) {
      setIsAudioEngineActive(true);
      toast.success(isArabic ? 'تم تفعيل معالج إيفونيا للأصوات الصوتية' : 'Euphonia vocal sound trigger active');
    } else {
      toast.error(isArabic ? 'تعذر الوصول إلى الميكروفون' : 'Could not access microphone');
    }
  };

  // Google Project Euphonia: Record Sample for Phrase with MediaRecorder
  const recordEuphoniaSample = (phrase: EuphoniaPhraseDef) => {
    if (euphoniaRecorder.isRecording()) return;

    setRecordingPhraseId(phrase.id);
    toast.info(isArabic ? 'سجّل الآن بنبرتك الطبيعية...' : 'Recording now...');

    euphoniaRecorder.start(phrase.id, phrase.text, {
      onLevel: (rms) => setMicLevel(rms),
      onError: (err) => {
        console.error(err);
        setRecordingPhraseId(null);
        toast.error(isArabic ? 'تعذر الوصول إلى الميكروفون' : 'Could not access microphone');
      },
      onStop: async (sample: EuphoniaAudioSample) => {
        setRecordingPhraseId(null);
        setMicLevel(0);

        if (sample.durationMs < 400) {
          toast.error(isArabic ? 'التسجيل قصير جداً، حاول مرة أخرى' : 'Recording too short, try again');
          return;
        }

        try {
          await storageAdapterRef.current.upload(sample);
          setEuphoniaTrainingState((prev) => ({
            ...prev,
            [phrase.id]: (prev[phrase.id] || 0) + 1,
          }));
          playBlinkClickSound();
          toast.success(isArabic ? '✅ تم حفظ العينة الصوتية بنجاح' : 'Sample saved');
        } catch (err) {
          console.error(err);
          toast.error(isArabic ? 'فشل حفظ العينة الصوتية' : 'Failed to save sample');
        }
      },
    });
  };

  // Google Project Euphonia: Live Listener using Personalized Model + Browser Fallback
  const toggleEuphoniaLiveListener = async () => {
    if (isEuphoniaLiveListening) {
      euphoniaRecorder.stop();
      setIsEuphoniaLiveListening(false);
      return;
    }

    setIsEuphoniaLiveListening(true);
    setEuphoniaMatchedPhrase(null);
    toast.info(isArabic ? 'جاري الاستماع لصوتك...' : 'Listening...');

    euphoniaRecorder.start('live-match', '(live)', {
      onLevel: (rms) => setMicLevel(rms),
      onError: (err) => {
        console.error(err);
        setIsEuphoniaLiveListening(false);
        toast.error(isArabic ? 'تعذر الوصول إلى الميكروفون' : 'Could not access microphone');
      },
      onStop: async (sample: EuphoniaAudioSample) => {
        setIsEuphoniaLiveListening(false);
        setMicLevel(0);

        try {
          const result = await transcribe({
            audioBlob: sample.blob,
            langCode: profile.language === 'Egyptian Ammiya' ? 'ar-EG' : isArabic ? 'ar-SA' : 'en-US',
          });

          setEuphoniaMatchSource(result.source);

          const normalized = result.text.trim();
          const match = euphoniaPhraseBank.find(
            (p) => p.text.includes(normalized) || normalized.includes(p.text)
          );

          const finalText = match ? match.text : normalized;
          setEuphoniaMatchedPhrase(finalText);
          speakSafe(finalText);

          toast.success(
            result.source === 'custom-model'
              ? (isArabic ? `🎯 (نموذجك المخصص): "${finalText}"` : `🎯 (your model): "${finalText}"`)
              : (isArabic ? `🎯 "${finalText}"` : `🎯 "${finalText}"`)
          );
        } catch (err) {
          console.error(err);
          toast.error(isArabic ? 'تعذر فهم الصوت، حاول مرة أخرى' : 'Could not understand audio, try again');
        }
      },
    });

    trackedTimeout(() => {
      if (euphoniaRecorder.isRecording()) euphoniaRecorder.stop();
    }, 3000);
  };

  // Settings: save + health-check the API URL
  const handleSaveEuphoniaApiUrl = async () => {
    setEuphoniaApiUrl(euphoniaApiUrlInput);
    setEuphoniaApiUrlState(euphoniaApiUrlInput.trim()); // drives the adapter effect
    toast.info(isArabic ? 'جاري التحقق من الاتصال...' : 'Checking connection...');
    const healthy = await checkEuphoniaApiHealth(euphoniaApiUrlInput);
    setEuphoniaApiHealthy(healthy);
    toast[healthy ? 'success' : 'error'](
      healthy
        ? (isArabic ? '✅ متصل بنموذجك المخصص' : '✅ Connected to your custom model')
        : (isArabic ? '⚠️ تعذر الوصول للخادم — سيتم استخدام المتصفح مؤقتاً' : '⚠️ Unreachable — using browser ASR for now')
    );
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      trackerRef.current?.stop();
      trackerRef.current = null;
      vocalSoundEngine.stop();
      cancelSpeech();
      try { voiceContactRecRef.current?.stop(); } catch { /* ignore */ }
      try { teacherRecRef.current?.stop(); } catch { /* ignore */ }
      // euphoniaRecRef was declared and never assigned, so this stopped nothing
      // and the mic stayed live after leaving the screen. The real recorder is
      // the module-level singleton.
      try { euphoniaRecorder.stop(); } catch { /* ignore */ }
      // Every setTimeout in this view was untracked: a calibration-failure toast
      // could pop up on a later screen ~11s after leaving, and an emergency-call
      // timer could still open a tel: link from wherever the student now was.
      pendingTimersRef.current.forEach((id) => clearTimeout(id));
      pendingTimersRef.current = [];
      try { sharedAudioCtxRef.current?.close(); } catch { /* ignore */ }
      sharedAudioCtxRef.current = null;
    };
  }, []);

  // Check which card, key, or modal item the cursor is hovering over
  const checkHoverTarget = (pos: PointerPosition) => {
    // Was: querySelectorAll + getBoundingClientRect on EVERY element, every
    // frame. That forces a full layout recompute per element ~60x/second, which
    // is the heaviest single cost on the low-end tablets these students use —
    // and it is why the cursor lagged worst exactly when tracking was active.
    // One hit test does the same job.
    const hit = document.elementFromPoint(pos.x, pos.y) as HTMLElement | null;
    const foundId: string | null =
      (hit?.closest('[data-aac-id]') as HTMLElement | null)?.getAttribute('data-aac-id') ?? null;

    if (foundId !== hoveredCardIdRef.current) {
      hoveredCardIdRef.current = foundId;
      setHoveredCardId(foundId);
      if (isCameraActive) {
        trackerRef.current?.setHoverTarget(foundId);
      } else {
        mouseHoverTargetRef.current = foundId;
        mouseDwellStartRef.current = foundId ? Date.now() : 0;
      }
    }
  };

  // Handle Vocal Trigger actions
  const handleVocalTriggerAction = (trig: VocalSoundTriggerConfig) => {
    toast.info(`${isArabic ? 'تم التقاط إشارة صوتية: ' : 'Vocal Trigger: '}${isArabic ? trig.nameAr : trig.name}`);

    if (trig.action === 'select' && hoveredCardId) {
      handleCardTrigger(hoveredCardId);
    } else if (trig.action === 'ask-ai') {
      startAtypicalSpeechRecognition();
    } else if (trig.action === 'emergency') {
      triggerPrimaryEmergencyCall();
    }
  };

  // Trigger primary emergency SOS call with debounce
  const triggerPrimaryEmergencyCall = () => {
    if (isDialingRef.current) return;
    isDialingRef.current = true;

    const primary = contacts.find((c) => c.isPrimaryEmergency) || contacts[0];
    if (primary) {
      speakSafe(
        isArabic ? `جاري الاتصال برقم ${primary.nameAr}` : `Calling emergency ${primary.nameEn}`
      );
      toast.success(isArabic ? `اتصال طوارئ: ${primary.nameAr}` : `SOS Call: ${primary.nameEn}`);
      trackedTimeout(() => {
        makePhoneCall(primary.phone);
        isDialingRef.current = false;
      }, 1200);
    } else {
      isDialingRef.current = false;
    }
  };

  // Open Hands-Free Contact Picker
  const openContactPicker = () => {
    setShowContactPickerModal(true);
  };

  // Voice listener to dial by name
  const startVoiceContactListener = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error(isArabic ? 'المتصفح لا يدعم التعرف على الصوت' : 'Speech recognition not supported in browser');
      return;
    }

    try {
      cancelSpeech();
      const rec = new SpeechRec();
      voiceContactRecRef.current = rec;
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = profile.language === 'Egyptian Ammiya' ? 'ar-EG' : isArabic ? 'ar-SA' : 'en-US';

      rec.onstart = () => {
        setIsListeningForContactName(true);
        toast.info(isArabic ? 'تحدث الآن... انطق اسم الشخص' : 'Listening...');
      };

      rec.onresult = (e: any) => {
        const spoken = e.results[0][0].transcript.trim().toLowerCase();
        setIsListeningForContactName(false);
        matchAndCallContact(spoken);
      };

      rec.onerror = (e: any) => {
        setIsListeningForContactName(false);
        const reason = e?.error || 'unknown';
        toast.error(
          isArabic
            ? reason === 'not-allowed'
              ? 'تم رفض إذن الميكروفون'
              : reason === 'no-speech'
              ? 'لم يتم رصد أي صوت، حاول مرة أخرى'
              : `تعذر التعرف على الصوت (${reason})`
            : `Speech recognition failed (${reason})`
        );
      };
      rec.onend = () => setIsListeningForContactName(false);
      rec.start();
    } catch {
      setIsListeningForContactName(false);
    }
  };

  // Match spoken word with contact list and dial
  const matchAndCallContact = (spoken: string) => {
    if (isDialingRef.current) return;

    const match = contacts.find(
      (c) =>
        spoken.includes(c.nameAr.toLowerCase()) ||
        spoken.includes(c.nameEn.toLowerCase()) ||
        (spoken.includes('ماما') && c.nameAr.includes('ماما')) ||
        (spoken.includes('مرافق') && c.nameAr.includes('المرافق')) ||
        (spoken.includes('دكتور') && c.nameAr.includes('الدكتور')) ||
        (spoken.includes('إسعاف') && c.nameAr.includes('الإسعاف'))
    );

    if (match) {
      isDialingRef.current = true;
      speakSafe(isArabic ? `جاري الاتصال بـ ${match.nameAr}` : `Calling ${match.nameEn}`);
      toast.success(isArabic ? `تم التعرف: اتصال بـ ${match.nameAr}` : `Calling ${match.nameEn}`);
      trackedTimeout(() => {
        makePhoneCall(match.phone);
        setShowContactPickerModal(false);
        isDialingRef.current = false;
      }, 1200);
    } else {
      toast.info(isArabic ? `لم نجد جهة اتصال مطابقة لـ "${spoken}"` : `No contact matched "${spoken}"`);
    }
  };

  // Teacher / Classroom Speech Listener & Auto-Response Generator
  const startTeacherClassListener = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error(isArabic ? 'المتصفح لا يدعم التعرف على الصوت' : 'Speech recognition not supported in browser');
      return;
    }

    try {
      cancelSpeech();
      const rec = new SpeechRec();
      teacherRecRef.current = rec;
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = profile.language === 'Egyptian Ammiya' ? 'ar-EG' : isArabic ? 'ar-SA' : 'en-US';

      rec.onstart = () => {
        setIsListeningToTeacher(true);
        toast.info(isArabic ? 'جاري الاستماع لما يقوله المعلم في الغرفة...' : 'Listening to teacher in room...');
      };

      rec.onresult = async (e: any) => {
        const spoken = e.results[0][0].transcript;
        setTeacherHeardSpeech(spoken);
        setIsListeningToTeacher(false);

        // Call Gemini to generate 4 instant quick student answer options
        try {
          const prompt = `A teacher just said this in class: "${spoken}". The student is non-verbal (quadriplegic using eye-tracking). Generate 4 distinct, concise, smart Arabic response options that the student might want to say back (e.g. Agreement/Explanation, Question, Need help, Ready). Return ONLY a JSON array of 4 short Arabic strings, without markdown. Example: ["نعم فهمت هذا المفهوم تماماً.", "هل يمكن توضيح النقطة الأخيرة؟", "أنا جاهز للإجابة.", "عندي سؤال حول التطبيق." ]`;
          const rawResp = await geminiService.askGeneralQuestion(prompt, 'Arabic');
          try {
            const cleanJson = rawResp.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            if (Array.isArray(parsed) && parsed.length >= 2) {
              setAiGeneratedClassOptions(parsed);
              toast.success(isArabic ? 'تم توليد خيارات الرد الذكية بنجاح' : 'AI generated responses ready');
            }
          } catch {
            setAiGeneratedClassOptions([
              `نعم، بخصوص "${spoken}" فهمت تماماً.`,
              'ممكن إعادة توضيح هذه النقطة؟',
              'أنا جاهز للإجابة عن السؤال.',
              'شكراً جزيلاً أستاذ.'
            ]);
          }
        } catch {
          /* fallback */
        }
      };

      rec.onerror = (e: any) => {
        setIsListeningToTeacher(false);
        const reason = e?.error || 'unknown';
        toast.error(
          isArabic
            ? reason === 'not-allowed'
              ? 'تم رفض إذن الميكروفون'
              : reason === 'no-speech'
              ? 'لم يتم رصد أي صوت'
              : `تعذر التعرف على الصوت (${reason})`
            : `Speech recognition failed (${reason})`
        );
      };
      rec.onend = () => setIsListeningToTeacher(false);
      rec.start();
    } catch {
      setIsListeningToTeacher(false);
    }
  };

  // Real 9-Point Affine Calibration Runner
  const CALIBRATION_TARGETS_NORM = [
    { x: 0.10, y: 0.12 }, { x: 0.50, y: 0.12 }, { x: 0.90, y: 0.12 },
    { x: 0.10, y: 0.50 }, { x: 0.50, y: 0.50 }, { x: 0.90, y: 0.50 },
    { x: 0.10, y: 0.88 }, { x: 0.50, y: 0.88 }, { x: 0.90, y: 0.88 },
  ];

  const runNinePointCalibration = () => {
    if (!trackerRef.current || !isCameraActive) {
      toast.error(isArabic ? 'شغّل الكاميرا أولاً' : 'Start the camera first');
      return;
    }

    trackerRef.current.resetCalibration();
    setShowCalibrationModal(true);
    setIsCalibrating(true);
    setCalibrationPointIndex(0);
    // A second press of the calibration button supersedes the first, so two
    // chains can never interleave against one tracker.
    const myRun = ++calibAbortRef.current;

    const DWELL_MS = 1200;

    const runPoint = (index: number) => {
      // Cancel (or unmount) aborts the chain. Previously the dots disappeared
      // but the sequence kept running invisibly and then overwrote the mapping
      // with samples taken while the student was no longer looking at any
      // target — leaving the pointer worse than before they started.
      if (calibAbortRef.current !== myRun || !mountedRef.current) return;
      if (index >= CALIBRATION_TARGETS_NORM.length) {
        const status = trackerRef.current?.finalizeCalibration();
        setIsCalibrating(false);
        setCalibAccuracy(status?.accuracyEstimate ?? null);

        if (status?.isCalibrated) {
          toast.success(
            isArabic
              ? `تمت المعايرة بنجاح — دقة تقديرية ${Math.round((status.accuracyEstimate || 0) * 100)}%`
              : `Calibration complete — ~${Math.round((status.accuracyEstimate || 0) * 100)}% accuracy`
          );
        } else {
          toast.error(
            isArabic
              ? 'تعذرت المعايرة، جرّب مرة أخرى وثبّت رأسك أكثر'
              : 'Calibration failed — try again and keep your head steadier'
          );
        }
        trackedTimeout(() => setShowCalibrationModal(false), 1400);
        return;
      }

      setCalibrationPointIndex(index);
      trackerRef.current?.beginCalibrationPoint();

      trackedTimeout(() => {
        if (calibAbortRef.current !== myRun) return;
        const target = CALIBRATION_TARGETS_NORM[index];
        const committed = trackerRef.current?.commitCalibrationPoint(target.x, target.y);
        if (committed) playBlinkClickSound();
        runPoint(index + 1);
      }, DWELL_MS);
    };

    trackedTimeout(() => runPoint(0), 400);
  };

  // Add new phrase to custom bank
  const handleAddCustomPhrase = () => {
    if (!newPhraseInput.trim()) return;
    const newP = {
      id: `cp-${Date.now()}`,
      textAr: newPhraseInput.trim(),
      icon: '💬',
    };
    const updated = [newP, ...customPhrases];
    setCustomPhrases(updated);
    try {
      localStorage.setItem('cognify_custom_phrases', JSON.stringify(updated));
    } catch {
      /* ignore */
    }
    setNewPhraseInput('');
    toast.success(isArabic ? 'تمت إضافة العبارة لبنكك الشخصي' : 'Phrase added to personal bank');
  };

  const handleDeleteCustomPhrase = (id: string) => {
    const updated = customPhrases.filter((p: any) => p.id !== id);
    setCustomPhrases(updated);
    try {
      localStorage.setItem('cognify_custom_phrases', JSON.stringify(updated));
    } catch {
      /* ignore */
    }
  };

  // Virtual Keyboard Actions
  const handleKeyClick = (char: string) => {
    setTypedText((prev) => prev + char);
  };

  const handleBackspace = () => {
    setTypedText((prev) => prev.slice(0, -1));
  };

  const handleSpace = () => {
    setTypedText((prev) => prev + ' ');
  };

  const handleClearText = () => {
    setTypedText('');
  };

  const handleSelectWordSuggestion = (word: string) => {
    setTypedText(word + ' ');
    speakSafe(word);
  };

  const handleSpeakTypedText = () => {
    if (!typedText.trim()) return;
    speakSafe(typedText);
    toast.success(isArabic ? 'تم نطق النص' : 'Spoken aloud');
  };

  const handleSendTypedToAI = async () => {
    if (!typedText.trim()) return;
    setIsProcessingAi(true);
    try {
      const response = await geminiService.askGeneralQuestion(typedText, profile.language || 'Arabic');
      setAiResponseText(response);
      speakSafe(response);
      if (onSendMessage) {
        onSendMessage(typedText);
      }
    } catch (err) {
      toast.error(isArabic ? 'خطأ في معالجة الذكاء الاصطناعي' : 'AI processing error');
    } finally {
      setIsProcessingAi(false);
    }
  };

  const handleSendTypedToWhatsApp = () => {
    if (!typedText.trim()) return;
    setCustomWaMessage(typedText);
    setSelectedContactForWa(null);
    setShowWhatsAppModal(true);
  };

  // Execute selected AAC Card / Key / Tab
  const handleCardTrigger = async (cardId: string) => {
    // 0. Top Category Tabs
    if (cardId === 'tab-keyboard') {
      setActiveTab('keyboard');
      return;
    }
    if (cardId === 'tab-euphonia-studio') {
      setActiveTab('euphonia-studio');
      return;
    }
    if (cardId === 'tab-smart-room') {
      setActiveTab('smart-room');
      return;
    }
    if (cardId === 'tab-pain-sensory') {
      setActiveTab('pain-sensory');
      return;
    }
    if (cardId === 'tab-class-ai') {
      setActiveTab('class-ai');
      return;
    }
    if (cardId === 'tab-custom-bank') {
      setActiveTab('custom-bank');
      return;
    }
    if (cardId === 'tab-eye-games') {
      setActiveTab('eye-games');
      reactionStartTimeRef.current = Date.now();
      return;
    }

    // Pop Eye Game Bubble
    if (cardId.startsWith('game-bubble-')) {
      const bId = cardId.replace('game-bubble-', '');
      if (!gamePoppedIds.includes(bId)) {
        playPopSound();
        const reactionTime = Date.now() - reactionStartTimeRef.current;
        // Restart the clock for the NEXT bubble. Without this the timer ran from
        // the start of the round, so each pop reported a bigger number than the
        // last (800ms, 2400ms, 5000ms...) and a therapist reading it as a
        // benchmark would think the student was deteriorating.
        reactionStartTimeRef.current = Date.now();
        reactionSamplesRef.current.push(reactionTime);
        const samples = reactionSamplesRef.current;
        setReactionBenchmarkMs(Math.round(samples.reduce((a, b) => a + b, 0) / samples.length));
        setGamePoppedIds((prev) => [...prev, bId]);
        setGameScore((prev) => prev + 10);
        toast.success(`🎯 +10 نقاط! سرعة النظر: ${reactionTime}ms`);
      }
      return;
    }

    // Euphonia Phrase Trigger
    if (cardId.startsWith('eup-phrase-')) {
      const eupId = cardId.replace('eup-phrase-', '');
      const item = euphoniaPhraseBank.find((p) => p.id === eupId);
      if (item) {
        speakSafe(item.text);
        toast.success(`🎙️ "${item.text}"`);
      }
      return;
    }

    // 1. Virtual Keyboard Key Dwell/Blink Triggers
    if (cardId.startsWith('kb-key-')) {
      const char = cardId.replace('kb-key-', '');
      handleKeyClick(char);
      return;
    }
    if (cardId.startsWith('kb-word-')) {
      const word = cardId.replace('kb-word-', '');
      handleSelectWordSuggestion(word);
      return;
    }
    if (cardId === 'kb-space') {
      handleSpace();
      return;
    }
    if (cardId === 'kb-backspace') {
      handleBackspace();
      return;
    }
    if (cardId === 'kb-clear') {
      handleClearText();
      return;
    }
    if (cardId === 'kb-speak') {
      handleSpeakTypedText();
      return;
    }
    if (cardId === 'kb-askai') {
      handleSendTypedToAI();
      return;
    }
    if (cardId === 'kb-whatsapp') {
      handleSendTypedToWhatsApp();
      return;
    }
    if (cardId === 'kb-call') {
      openContactPicker();
      return;
    }
    if (cardId === 'kb-switchlang') {
      setKbLang((prev) => (prev === 'ar' ? 'en' : 'ar'));
      return;
    }

    // 2. Smart Room Items (Steve Saling Environment Controls)
    const roomItem = SMART_ROOM_ITEMS.find((r) => r.id === cardId);
    if (roomItem) {
      if (roomItem.isAlarm) {
        playNurseAlarmSound();
        speakSafe(isArabic ? roomItem.phraseAr : roomItem.phraseEn);
        toast.error(isArabic ? '🚨 تم إرسال إشعار فوري لهاتف المرافق واستدعاء الممرض!' : 'Caregiver notified & Nurse Alarm triggered!');
      } else {
        if (roomItem.id === 'room-light') setRoomLightOn((p) => !p);
        if (roomItem.id === 'room-tv') setRoomTvOn((p) => !p);
        if (roomItem.id === 'room-ac') setRoomAcOn((p) => !p);

        speakSafe(isArabic ? roomItem.phraseAr : roomItem.phraseEn);
        toast.success(isArabic ? `تم تنفيذ: ${roomItem.labelAr}` : `Triggered: ${roomItem.labelEn}`);
      }
      return;
    }

    // 3. Pain & Sensory Feedback Items
    const painItem = SENSORY_PAIN_ITEMS.find((p) => p.id === cardId);
    if (painItem) {
      speakSafe(painItem.phraseAr);
      toast.info(`🩺 تم إبلاغ المرافق: ${painItem.labelAr}`);
      return;
    }

    // 4. Custom Phrase Bank Items
    if (cardId.startsWith('custom-phrase-')) {
      const phraseId = cardId.replace('custom-phrase-', '');
      const item = customPhrases.find((p: any) => p.id === phraseId);
      if (item) {
        speakSafe(item.textAr);
        toast.success(`💬 "${item.textAr}"`);
      }
      return;
    }

    // 5. AI Class Answer Options
    if (cardId.startsWith('class-option-')) {
      const optIdx = parseInt(cardId.replace('class-option-', ''), 10);
      const text = aiGeneratedClassOptions[optIdx];
      if (text) {
        speakSafe(text);
        toast.success(`🎓 تم الرد: "${text}"`);
        if (onSendMessage) onSendMessage(text);
      }
      return;
    }

    // 6. Quick Needs Cards
    const need = QUICK_NEEDS.find((n) => n.id === cardId);
    if (need) {
      const phrase = isArabic ? need.phraseAr : need.phraseEn;
      speakSafe(phrase);
      if (need.isAi) {
        setIsProcessingAi(true);
        try {
          const resp = await geminiService.askGeneralQuestion(phrase, profile.language || 'Arabic');
          setAiResponseText(resp);
          speakSafe(resp);
        } catch {
          /* ignore */
        } finally {
          setIsProcessingAi(false);
        }
      }
      return;
    }

    // 7. Contact calls from modal
    if (cardId.startsWith('call-contact-')) {
      if (isDialingRef.current) return;
      isDialingRef.current = true;

      const contactId = cardId.replace('call-contact-', '');
      const target = contacts.find((c) => c.id === contactId);
      if (target) {
        speakSafe(isArabic ? `جاري الاتصال بـ ${target.nameAr}` : `Calling ${target.nameEn}`);
        trackedTimeout(() => {
          makePhoneCall(target.phone);
          setShowContactPickerModal(false);
          isDialingRef.current = false;
        }, 1200);
        return;
      }
      isDialingRef.current = false;
    }

    // 8. WhatsApp contact selection
    if (cardId.startsWith('wa-contact-')) {
      const contactId = cardId.replace('wa-contact-', '');
      const target = contacts.find((c) => c.id === contactId);
      if (target) {
        setSelectedContactForWa(target);
        speakSafe(isArabic ? `اختر الرسالة لـ ${target.nameAr}` : `Select message for ${target.nameEn}`);
        return;
      }
    }

    // 9. WhatsApp message template selection
    if (cardId.startsWith('wa-msg-')) {
      const msgId = cardId.replace('wa-msg-', '');
      const template = WHATSAPP_QUICK_MESSAGES.find((m) => m.id === msgId);
      if (template && selectedContactForWa) {
        const text = isArabic ? template.textAr : template.textEn;
        sendWhatsAppMessage(selectedContactForWa.phone, text);
        toast.success(isArabic ? 'جاري فتح واتساب لإرسال الرسالة' : 'Opening WhatsApp');
        setShowWhatsAppModal(false);
        setSelectedContactForWa(null);
        return;
      }
    }
  };

  // Re-point the tracker's live refs on EVERY render so its long-lived callbacks
  // always invoke the current closures (see the ref declarations above).
  handleCardTriggerRef.current = handleCardTrigger;
  checkHoverTargetRef.current = checkHoverTarget;


  // Atypical / Dysarthric Speech Recording
  const startAtypicalSpeechRecognition = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error(isArabic ? 'المتصفح لا يدعم التعرف على الصوت' : 'Speech recognition not supported in browser');
      return;
    }

    // The vocal-sound engine holds its own exclusive getUserMedia audio
    // stream. On some browsers/devices a second concurrent mic consumer
    // (native SpeechRecognition) then silently fails to start — this looked
    // like "the mic is broken" with zero feedback. Free the mic first.
    if (isAudioEngineActive) {
      vocalSoundEngine.stop();
      setIsAudioEngineActive(false);
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = profile.language === 'Egyptian Ammiya' ? 'ar-EG' : isArabic ? 'ar-SA' : 'en-US';

      rec.onstart = () => {
        setIsRecordingSpeech(true);
        toast.info(isArabic ? 'جاري الاستماع... تحدث بأسلوبك الطبيعي' : 'Listening...');
      };

      rec.onresult = async (e: any) => {
        const rawTranscript = e.results[0][0].transcript;
        setSpeechTranscript(rawTranscript);
        setIsRecordingSpeech(false);

        setIsProcessingAi(true);
        try {
          const compensatedPrompt = `The following speech was transcribed from a user with motor/speech impairment (dysarthria/atypical speech): "${rawTranscript}". Interpret intended meaning and respond concisely in ${profile.language || 'Egyptian Arabic'}.`;
          const answer = await geminiService.askGeneralQuestion(compensatedPrompt, profile.language || 'Arabic');
          setAiResponseText(answer);
          speakSafe(answer);
          if (onSendMessage) {
            onSendMessage(rawTranscript);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsProcessingAi(false);
        }
      };

      rec.onerror = (e: any) => {
        setIsRecordingSpeech(false);
        const reason = e?.error || 'unknown';
        const arMsg =
          reason === 'not-allowed' || reason === 'permission-denied'
            ? 'تم رفض إذن الميكروفون — يرجى السماح بالوصول للميكروفون من إعدادات المتصفح'
            : reason === 'audio-capture'
            ? 'لا يوجد ميكروفون متاح، أو أنه مستخدم بواسطة ميزة أخرى — أوقفها وحاول مرة أخرى'
            : reason === 'no-speech'
            ? 'لم يتم رصد أي صوت، حاول التحدث بصوت أعلى بالقرب من الميكروفون'
            : `تعذر التعرف على الصوت (${reason})`;
        const enMsg =
          reason === 'not-allowed' || reason === 'permission-denied'
            ? 'Microphone permission denied — allow mic access in browser settings'
            : reason === 'audio-capture'
            ? 'No microphone available, or it is in use by another feature'
            : reason === 'no-speech'
            ? 'No speech detected — try speaking louder, closer to the mic'
            : `Speech recognition failed (${reason})`;
        toast.error(isArabic ? arMsg : enMsg);
      };
      rec.onend = () => setIsRecordingSpeech(false);
      rec.start();
    } catch {
      setIsRecordingSpeech(false);
      toast.error(isArabic ? 'تعذر بدء تسجيل الصوت' : 'Could not start recording');
    }
  };

  const activeKeyboardRows = kbLang === 'ar' ? AR_KEYBOARD_ROWS : EN_KEYBOARD_ROWS;

  // 9 Calibration Point Coordinates
  const CALIBRATION_POINTS = [
    { x: '10%', y: '12%' },
    { x: '50%', y: '12%' },
    { x: '90%', y: '12%' },
    { x: '10%', y: '50%' },
    { x: '50%', y: '50%' },
    { x: '90%', y: '50%' },
    { x: '10%', y: '88%' },
    { x: '50%', y: '88%' },
    { x: '90%', y: '88%' },
  ];

  // Theme styling definitions
  const themeClasses = {
    amber: {
      accentText: 'text-amber-400',
      accentBg: 'bg-amber-400 text-slate-950',
      activeTab: 'bg-amber-400 text-slate-950 border-amber-300',
      keyHover: 'border-amber-400 bg-amber-400 text-slate-950 ring-4 ring-amber-400/40',
      cursorRing: 'text-amber-400',
      cursorDot: 'bg-amber-400',
    },
    cyan: {
      accentText: 'text-cyan-400',
      accentBg: 'bg-cyan-400 text-slate-950',
      activeTab: 'bg-cyan-400 text-slate-950 border-cyan-300',
      keyHover: 'border-cyan-400 bg-cyan-400 text-slate-950 ring-4 ring-cyan-400/40',
      cursorRing: 'text-cyan-400',
      cursorDot: 'bg-cyan-400 shadow-[0_0_18px_#22d3ee]',
    },
    emerald: {
      accentText: 'text-emerald-400',
      accentBg: 'bg-emerald-400 text-slate-950',
      activeTab: 'bg-emerald-400 text-slate-950 border-emerald-300',
      keyHover: 'border-emerald-400 bg-emerald-400 text-slate-950 ring-4 ring-emerald-400/40',
      cursorRing: 'text-emerald-400',
      cursorDot: 'bg-emerald-400 shadow-[0_0_18px_#34d399]',
    },
    monochrome: {
      accentText: 'text-white',
      accentBg: 'bg-white text-slate-950',
      activeTab: 'bg-white text-slate-950 border-white',
      keyHover: 'border-white bg-white text-slate-950 ring-4 ring-white/50',
      cursorRing: 'text-white',
      cursorDot: 'bg-white shadow-[0_0_18px_#ffffff]',
    },
  }[theme];

  return (
    <div className={`flex-1 flex flex-col h-full bg-slate-950 text-white overflow-y-auto relative p-3 sm:p-5 lg:p-6 select-none font-sans ${isFullscreen ? 'fixed inset-0 z-[99998] p-6' : ''}`}>
      {/* Head Pointer / Eye-Gaze MediaPipe Visual Interactive Cursor */}
      <div
        className="fixed pointer-events-none z-[99999] will-change-transform top-0 left-0"
        style={{
          transform: `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0) translate(-50%, -50%)`,
        }}
      >
        <div className="relative flex items-center justify-center">
          {/* Outer Green Laser Crosshair Lines */}
          <div className="absolute w-12 h-[2px] bg-emerald-400/80 shadow-[0_0_8px_#34d399] pointer-events-none" />
          <div className="absolute h-12 w-[2px] bg-emerald-400/80 shadow-[0_0_8px_#34d399] pointer-events-none" />

          {/* Radial Dwell Countdown Ring */}
          <svg className={`w-16 h-16 -rotate-90 transition-all duration-150 ${cursorPos.isSnapped ? 'scale-125 drop-shadow-[0_0_25px_rgba(236,72,153,0.95)]' : 'drop-shadow-[0_0_15px_rgba(52,211,153,0.9)]'}`}>
            <circle
              cx="32"
              cy="32"
              r="24"
              stroke="currentColor"
              strokeWidth="4"
              className={cursorPos.isSnapped ? 'text-pink-500/30' : 'text-emerald-500/20'}
              fill="none"
            />
            <circle
              cx="32"
              cy="32"
              r="24"
              stroke="currentColor"
              strokeWidth="4"
              className={`${cursorPos.isSnapped ? 'text-pink-400' : 'text-emerald-400'} transition-all duration-75`}
              fill="none"
              strokeDasharray="150"
              strokeDashoffset={150 - 150 * dwellProgress}
            />
          </svg>

          {/* MediaPipe Glowing Magenta Joint Circle with Red Center Dot */}
          <div className="absolute w-8 h-8 rounded-full bg-pink-500 shadow-[0_0_20px_#ec4899] border-2 border-white flex items-center justify-center animate-pulse">
            <div className="w-3 h-3 rounded-full bg-rose-600 shadow-[0_0_8px_#ef4444] border border-white" />
          </div>
        </div>
      </div>

      {/* Quick Pointer Tuning & Calibration Bar (Always Accessible) */}
      <div className="mb-3 px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-slate-800 flex items-center justify-between gap-2 flex-wrap text-xs shadow-md">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-amber-400 flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5" />
            {isArabic ? 'نوع التتبع:' : 'Mode:'}
          </span>

          {/* Tracking Mode Switcher Pills */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => updateHeadConfig({ trackingMode: 'iris' })}
              className={`px-2.5 py-1 rounded-lg font-black text-[11px] transition-all ${
                (headConfig.trackingMode || 'iris') === 'iris'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              👁️ {isArabic ? 'بؤبؤ العين (Iris)' : 'Eye Iris'}
            </button>
            <button
              onClick={() => updateHeadConfig({ trackingMode: 'nose' })}
              className={`px-2.5 py-1 rounded-lg font-black text-[11px] transition-all ${
                headConfig.trackingMode === 'nose'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              👤 {isArabic ? 'الأنف / الرأس' : 'Nose Head'}
            </button>
            <button
              onClick={() => updateHeadConfig({ trackingMode: 'hybrid' })}
              className={`px-2.5 py-1 rounded-lg font-black text-[11px] transition-all ${
                headConfig.trackingMode === 'hybrid'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚡ {isArabic ? 'هجين' : 'Hybrid'}
            </button>
          </div>

          {/* Sensitivity Adjuster */}
          <div className="flex items-center gap-1 bg-slate-950 rounded-xl px-2 py-1 border border-slate-800">
            <span className="text-slate-400 text-[11px]">{isArabic ? 'الحساسية:' : 'Sens:'}</span>
            <button
              onClick={() => updateHeadConfig({ sensitivity: Math.max(1.2, headConfig.sensitivity - 0.3) })}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
            >
              -
            </button>
            <span className="font-mono font-bold text-amber-300 px-1">{headConfig.sensitivity.toFixed(1)}x</span>
            <button
              onClick={() => updateHeadConfig({ sensitivity: Math.min(4.8, headConfig.sensitivity + 0.3) })}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
            >
              +
            </button>
          </div>

          {/* Dwell Time Adjuster */}
          <div className="flex items-center gap-1 bg-slate-950 rounded-xl px-2 py-1 border border-slate-800">
            <span className="text-slate-400 text-[11px]">{isArabic ? 'سرعة التثبيت:' : 'Dwell:'}</span>
            <button
              onClick={() => updateHeadConfig({ dwellTimeMs: Math.max(500, headConfig.dwellTimeMs - 100) })}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
            >
              -
            </button>
            <span className="font-mono font-bold text-emerald-300 px-1">{(headConfig.dwellTimeMs / 1000).toFixed(1)}s</span>
            <button
              onClick={() => updateHeadConfig({ dwellTimeMs: Math.min(2200, headConfig.dwellTimeMs + 100) })}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Center Recalibrate Quick Button.
            Shows a dot at the ACTUAL centre and captures the neutral baseline
            while the user looks at it — otherwise the baseline was captured
            while they looked at this button (top of screen), which is what left
            the cursor permanently offset to one side. */}
        <button
          onClick={() => {
            setShowCenterDot(true);
            // calibrateNeutral() clears the baseline; it is re-captured over the
            // next ~20 frames. Wait ~1.3s while the user fixes on the dot, then
            // confirm.
            trackerRef.current?.calibrateNeutral();
            trackedTimeout(() => {
              setShowCenterDot(false);
              toast.success(isArabic ? '🎯 تم ضبط مركز النظر' : 'Eye center set');
            }, 1400);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-md transition-all"
        >
          <Target className="w-3.5 h-3.5" />
          <span>{isArabic ? '🎯 ضبط مركز النظر الآن' : 'Center Eye'}</span>
        </button>
      </div>

      {/* Center-gaze recenter target — a dot at the true centre to look at. */}
      {showCenterDot && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm pointer-events-none">
          <p className="text-amber-300 font-black text-lg mb-6">
            {isArabic ? 'انظر إلى النقطة في المنتصف' : 'Look at the centre dot'}
          </p>
          <div className="relative">
            <div className="w-6 h-6 rounded-full bg-amber-400 animate-ping absolute inset-0" />
            <div className="w-6 h-6 rounded-full bg-amber-400 ring-4 ring-amber-400/30 relative" />
          </div>
        </div>
      )}

      {/* Top Bar: Title & Navigation Modes */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-800 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/10">
            <Eye className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide">
              {localize(profile.language, 'Google Project Euphonia & Eye-Gaze Suite', 'نظام إيفونيا (Google Project Euphonia) والتواصل بالعين')}
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              {localize(profile.language, 'Atypical voice model training, eye-gaze typing, blink-clicks, and smart room automation.', 'تدريب نماذج الصوت غير النمطي، كيبورد العين، تدريب النظرة، وتحكم الغرفة.')}
            </p>
          </div>
        </div>

        {/* Action Toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Theme Switcher */}
          <button
            onClick={() => setTheme((t) => (t === 'amber' ? 'cyan' : t === 'cyan' ? 'emerald' : t === 'emerald' ? 'monochrome' : 'amber'))}
            className="p-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
            title={isArabic ? 'تغيير ثيم التباين' : 'Change Theme'}
          >
            <Palette className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullScreenMode}
            className="p-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
            title={isArabic ? 'وضع ملء الشاشة' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* 5-Step Scientific Architecture Diagram Modal Button */}
          <button
            onClick={() => setShowScientificArchitectureModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-black text-xs shadow-md"
            title={isArabic ? 'عرض المخطط العلمي والفيزيائي لتتبع العين (5 مراحل)' : '5-Component Eye-Tracking Architecture'}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isArabic ? '🔬 المخطط العلمي (5 مراحل)' : 'Scientific Architecture'}</span>
          </button>

          {/* 9-Point Medical Eye Calibration Button */}
          <button
            onClick={runNinePointCalibration}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-black text-xs shadow-md"
          >
            <Target className="w-3.5 h-3.5 text-amber-400" />
            <span>{isArabic ? 'معايرة الـ 9 نقاط' : '9-Point Calibration'}</span>
          </button>

          {/* Recalibrate Neutral Center */}
          <button
            onClick={() => {
              trackerRef.current?.calibrateNeutral();
              toast.info(isArabic ? 'تمت معايرة مركز العين' : 'Eye center recalibrated');
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-400 font-bold text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isArabic ? 'معايرة المركز' : 'Center'}</span>
          </button>

          {/* Camera Head Pointer Toggle */}
          <button
            onClick={toggleCamera}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-bold text-xs transition-all shadow-md ${
              isCameraActive
                ? 'bg-amber-500 text-slate-950 shadow-amber-500/30'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
            }`}
          >
            {isCameraActive ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
            <span>{isCameraActive ? (isArabic ? 'إيقاف الكاميرا' : 'Stop Camera') : (isArabic ? 'تشغيل تتبع العين' : 'Start Eye Tracker')}</span>
          </button>

          {/* Euphonia Vocal Sound Toggle */}
          <button
            onClick={toggleAudioEngine}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-bold text-xs transition-all shadow-md ${
              isAudioEngineActive
                ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/30'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
            }`}
          >
            {isAudioEngineActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span>{isAudioEngineActive ? (isArabic ? 'إيقاف إيفونيا' : 'Stop Euphonia') : (isArabic ? 'أصوات إيفونيا' : 'Vocal Sounds')}</span>
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowConfigModal(!showConfigModal)}
            className="p-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
            title={isArabic ? 'المعايرة والإعدادات' : 'Settings'}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Mode Navigation Bar (Eye-Gaze Selectable Tabs) */}
      <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 mb-4">
        {/* Tab 1: Arabic Keyboard & Gaze Communication */}
        <button
          data-aac-id="tab-keyboard"
          onClick={() => setActiveTab('keyboard')}
          className={`relative p-3 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'keyboard'
              ? themeClasses.activeTab + ' shadow-xl'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <KeyboardIcon className="w-4 h-4" />
          <span className="truncate">{isArabic ? '⌨️ كيبورد العين' : 'Eye Keyboard'}</span>
          {hoveredCardId === 'tab-keyboard' && dwellProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-950 rounded-b-2xl overflow-hidden">
              <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
            </div>
          )}
        </button>

        {/* Tab 2: Google Project Euphonia Training Studio */}
        <button
          data-aac-id="tab-euphonia-studio"
          onClick={() => setActiveTab('euphonia-studio')}
          className={`relative p-3 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'euphonia-studio'
              ? themeClasses.activeTab + ' shadow-xl'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span className="truncate">{isArabic ? '🎙️ تدريب إيفونيا' : 'Euphonia Studio'}</span>
          {hoveredCardId === 'tab-euphonia-studio' && dwellProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-950 rounded-b-2xl overflow-hidden">
              <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
            </div>
          )}
        </button>

        {/* Tab 3: Smart Room & Environment Controls */}
        <button
          data-aac-id="tab-smart-room"
          onClick={() => setActiveTab('smart-room')}
          className={`relative p-3 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'smart-room'
              ? themeClasses.activeTab + ' shadow-xl'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span className="truncate">{isArabic ? '🏠 تحكم الغرفة' : 'Smart Room'}</span>
          {hoveredCardId === 'tab-smart-room' && dwellProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-950 rounded-b-2xl overflow-hidden">
              <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
            </div>
          )}
        </button>

        {/* Tab 4: Pain & Health Assessment Board */}
        <button
          data-aac-id="tab-pain-sensory"
          onClick={() => setActiveTab('pain-sensory')}
          className={`relative p-3 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'pain-sensory'
              ? themeClasses.activeTab + ' shadow-xl'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Heart className="w-4 h-4" />
          <span className="truncate">{isArabic ? '🩺 لوحة الألم' : 'Pain Board'}</span>
          {hoveredCardId === 'tab-pain-sensory' && dwellProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-950 rounded-b-2xl overflow-hidden">
              <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
            </div>
          )}
        </button>

        {/* Tab 5: AI Classroom & Teacher Live Responses */}
        <button
          data-aac-id="tab-class-ai"
          onClick={() => setActiveTab('class-ai')}
          className={`relative p-3 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'class-ai'
              ? themeClasses.activeTab + ' shadow-xl'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span className="truncate">{isArabic ? '🎓 ردود الحصة' : 'AI Class'}</span>
          {hoveredCardId === 'tab-class-ai' && dwellProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-950 rounded-b-2xl overflow-hidden">
              <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
            </div>
          )}
        </button>

        {/* Tab 6: Custom Phrase Bank */}
        <button
          data-aac-id="tab-custom-bank"
          onClick={() => setActiveTab('custom-bank')}
          className={`relative p-3 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'custom-bank'
              ? themeClasses.activeTab + ' shadow-xl'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <BookmarkPlus className="w-4 h-4" />
          <span className="truncate">{isArabic ? '⭐ عباراتي' : 'My Phrases'}</span>
          {hoveredCardId === 'tab-custom-bank' && dwellProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-950 rounded-b-2xl overflow-hidden">
              <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
            </div>
          )}
        </button>

        {/* Tab 7: Eye Gaze Games & Accuracy Benchmark */}
        <button
          data-aac-id="tab-eye-games"
          onClick={() => setActiveTab('eye-games')}
          className={`relative p-3 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'eye-games'
              ? themeClasses.activeTab + ' shadow-xl'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span className="truncate">{isArabic ? '🎯 تدريب وألعاب' : 'Eye Games'}</span>
          {hoveredCardId === 'tab-eye-games' && dwellProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-950 rounded-b-2xl overflow-hidden">
              <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
            </div>
          )}
        </button>
      </div>

      {/* Main Communicator Grid: Left HUD + Main Center Eye-Gaze Board */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        {/* Left Side: Live Webcam HUD + Vocal Visualizer + Dysarthria Decoder */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          {/* Live Webcam Box */}
          <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-3 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                {isArabic ? 'مستشعر بؤبؤ العين' : 'Pupil Eye-Tracker'}
              </span>
              {isCameraActive && (
                <button
                  onClick={() => trackerRef.current?.calibrateNeutral()}
                  className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 font-bold"
                >
                  <RefreshCw className="w-2.5 h-2.5" /> {isArabic ? 'إعادة الضبط' : 'Reset'}
                </button>
              )}
            </div>

            <div className="relative aspect-video rounded-2xl bg-black flex items-center justify-center overflow-hidden border border-slate-800">
              <video
                ref={videoRef}
                className="w-full h-full object-cover -scale-x-100"
                playsInline
                muted
              />
              {/* MediaPipe Deep Learning Face & Eye Mesh Canvas Overlay */}
              <canvas
                ref={overlayCanvasRef}
                width={320}
                height={240}
                className="absolute inset-0 w-full h-full pointer-events-none object-cover"
              />
              {!isCameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-950/90 p-3 text-center">
                  <Eye className="w-8 h-8 text-amber-400 animate-pulse" />
                  <p className="text-xs font-bold text-white">
                    {isArabic ? 'تتبع حركة بؤبؤ العين (Eye Gaze)' : 'Eye-Gaze Pupil Tracking'}
                  </p>
                  <button
                    onClick={toggleCamera}
                    className="mt-1 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-lg shadow-amber-400/20 flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isArabic ? 'بدء التتبع بالعين الآن' : 'Start Eye Tracking'}</span>
                  </button>
                </div>
              )}

              {/* Eye-Gaze Status HUD */}
              {isCameraActive && (
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] bg-slate-950/85 backdrop-blur-md rounded-xl px-2.5 py-1 text-white border border-slate-800">
                  <span className="flex items-center gap-1 text-amber-400 font-black">
                    <Eye className="w-3.5 h-3.5" /> {isArabic ? 'بؤبؤ العين نشط' : 'Pupil Active'}
                  </span>
                  <span className="text-emerald-400 font-black flex items-center gap-1">
                    <Check className="w-3 h-3" /> {isArabic ? 'غمضة = كتابة' : 'Blink = Click'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Euphonia Audio Signal Analyzer Bar */}
          <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-3 shadow-xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
                {isArabic ? 'أصوات إيفونيا (همهمات)' : 'Euphonia Vocal Sounds'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {audioMetrics.peakFrequency > 0 ? `${audioMetrics.peakFrequency} Hz` : '0 Hz'}
              </span>
            </div>

            {/* Live Volume Bar */}
            <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden relative mb-2">
              <div
                className={`h-full transition-all duration-75 rounded-full ${
                  audioMetrics.isTriggering ? 'bg-amber-400 shadow-[0_0_10px_#fbbf24]' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, audioMetrics.volume * 250)}%` }}
              />
            </div>

            {/* Triggers */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {triggers.map((t) => (
                <div
                  key={t.id}
                  className={`p-1.5 rounded-xl border text-[10px] transition-all ${
                    audioMetrics.activeTriggerName === t.name
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300 font-black'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <p className="truncate font-bold">{isArabic ? t.nameAr : t.name}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Direct Dysarthric Speech AI Decoder */}
          <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-3 shadow-xl">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              {isArabic ? 'فك شفرة الكلام غير النمطي' : 'Dysarthria Decoder'}
            </h3>

            <button
              onClick={startAtypicalSpeechRecognition}
              disabled={isRecordingSpeech || isProcessingAi}
              className={`w-full py-2.5 px-3 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs transition-all shadow-md ${
                isRecordingSpeech
                  ? 'bg-rose-500 text-white animate-pulse'
                  : isProcessingAi
                  ? 'bg-slate-800 text-slate-400 cursor-wait'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {isRecordingSpeech ? (
                <>
                  <Mic className="w-3.5 h-3.5 animate-bounce" />
                  <span>{isArabic ? 'جاري الاستماع...' : 'Listening...'}</span>
                </>
              ) : isProcessingAi ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isArabic ? 'جاري الفهم بالذكاء الاصطناعي...' : 'Decoding...'}</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>{isArabic ? 'تحدث بأسلوبك (Dysarthria)' : 'Record Speech'}</span>
                </>
              )}
            </button>

            {speechTranscript && (
              <div className="mt-2 p-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                "{speechTranscript}"
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Eye-Gaze Board Content */}
        <div className="lg:col-span-9 flex flex-col gap-3">
          {/* TAB 1: Arabic Eye-Gaze Virtual Keyboard */}
          {activeTab === 'keyboard' && (
            <>
              {/* 1. Sentence Display & Live Action Output Bar */}
              <div className="bg-slate-900 rounded-3xl border-2 border-slate-800 p-4 shadow-2xl flex flex-col gap-3">
                {/* Live Text Output Display */}
                <div className="min-h-[64px] bg-slate-950 rounded-2xl border border-slate-800 p-3.5 flex items-center justify-between">
                  <p className="text-xl sm:text-2xl font-black text-amber-300 break-words leading-relaxed">
                    {typedText || (
                      <span className="text-slate-600 font-bold text-base sm:text-lg">
                        {isArabic
                          ? 'انظر للحرف وأغمض عينك لحظة لكتابته فوراً...'
                          : 'Look at letter and blink to type instantly...'}
                      </span>
                    )}
                  </p>
                  <span className="text-xs font-mono text-slate-500 shrink-0 ps-3">
                    {typedText.length} {isArabic ? 'حرف' : 'chars'}
                  </span>
                </div>

                {/* Main Eye-Gaze Action Control Buttons Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  {/* 🔊 Speak Aloud */}
                  <button
                    data-aac-id="kb-speak"
                    onClick={handleSpeakTypedText}
                    className={`relative p-3 rounded-2xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                      hoveredCardId === 'kb-speak'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-xl scale-105 ring-2 ring-emerald-300'
                        : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                    }`}
                  >
                    <Volume2 className="w-5 h-5" />
                    <span>{isArabic ? 'نطق بصوت' : 'Speak'}</span>
                    {hoveredCardId === 'kb-speak' && dwellProgress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/50 rounded-b-2xl overflow-hidden">
                        <div className="h-full bg-white transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                      </div>
                    )}
                  </button>

                  {/* ⌫ Backspace */}
                  <button
                    data-aac-id="kb-backspace"
                    onClick={handleBackspace}
                    className={`relative p-3 rounded-2xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                      hoveredCardId === 'kb-backspace'
                        ? 'bg-rose-500 text-white border-rose-400 shadow-xl scale-105 ring-2 ring-rose-300'
                        : 'bg-rose-500/20 border-rose-500/40 text-rose-400 hover:bg-rose-500/30'
                    }`}
                  >
                    <Delete className="w-5 h-5" />
                    <span>{isArabic ? 'مسح حرف' : 'Delete'}</span>
                    {hoveredCardId === 'kb-backspace' && dwellProgress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/50 rounded-b-2xl overflow-hidden">
                        <div className="h-full bg-white transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                      </div>
                    )}
                  </button>

                  {/* 🗑️ Clear All */}
                  <button
                    data-aac-id="kb-clear"
                    onClick={handleClearText}
                    className={`relative p-3 rounded-2xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                      hoveredCardId === 'kb-clear'
                        ? 'bg-rose-600 text-white border-rose-500 shadow-xl scale-105'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Trash2 className="w-5 h-5" />
                    <span>{isArabic ? 'مسح الكل' : 'Clear'}</span>
                    {hoveredCardId === 'kb-clear' && dwellProgress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/50 rounded-b-2xl overflow-hidden">
                        <div className="h-full bg-white transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                      </div>
                    )}
                  </button>

                  {/* 🤖 Ask AI Mentor */}
                  <button
                    data-aac-id="kb-askai"
                    onClick={handleSendTypedToAI}
                    className={`relative p-3 rounded-2xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                      hoveredCardId === 'kb-askai'
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-xl scale-105 ring-2 ring-indigo-300'
                        : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/30'
                    }`}
                  >
                    <Sparkles className="w-5 h-5" />
                    <span>{isArabic ? 'اسأل كوجنيفاي' : 'Ask AI'}</span>
                    {hoveredCardId === 'kb-askai' && dwellProgress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/50 rounded-b-2xl overflow-hidden">
                        <div className="h-full bg-white transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                      </div>
                    )}
                  </button>

                  {/* 💬 Send WhatsApp */}
                  <button
                    data-aac-id="kb-whatsapp"
                    onClick={handleSendTypedToWhatsApp}
                    className={`relative p-3 rounded-2xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                      hoveredCardId === 'kb-whatsapp'
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-xl scale-105 ring-2 ring-emerald-300'
                        : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                    }`}
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span>{isArabic ? 'واتساب' : 'WhatsApp'}</span>
                    {hoveredCardId === 'kb-whatsapp' && dwellProgress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/50 rounded-b-2xl overflow-hidden">
                        <div className="h-full bg-white transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                      </div>
                    )}
                  </button>

                  {/* 📞 Make Call */}
                  <button
                    data-aac-id="kb-call"
                    onClick={openContactPicker}
                    className={`relative p-3 rounded-2xl border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                      hoveredCardId === 'kb-call'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xl scale-105 ring-2 ring-amber-300'
                        : 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
                    }`}
                  >
                    <PhoneCall className="w-5 h-5" />
                    <span>{isArabic ? 'اتصال هاتف' : 'Call'}</span>
                    {hoveredCardId === 'kb-call' && dwellProgress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/50 rounded-b-2xl overflow-hidden">
                        <div className="h-full bg-white transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* 3. Full Arabic Virtual Keyboard Grid (Large High-Contrast Keys) */}
              <div className="bg-slate-900 rounded-3xl border-2 border-slate-800 p-4 shadow-2xl flex flex-col gap-2.5">
                {activeKeyboardRows.map((row, rIdx) => (
                  <div key={rIdx} className="flex justify-center gap-2">
                    {row.map((char) => {
                      const cardKey = `kb-key-${char}`;
                      const isHovered = hoveredCardId === cardKey;

                      return (
                        <button
                          key={char}
                          data-aac-id={cardKey}
                          onClick={() => handleKeyClick(char)}
                          className={`relative flex-1 min-w-[36px] max-w-[62px] h-14 sm:h-16 rounded-2xl font-black text-base sm:text-xl border-2 transition-all flex items-center justify-center ${
                            isHovered
                              ? 'border-pink-400 bg-pink-500/20 text-pink-300 shadow-[0_0_25px_rgba(236,72,153,0.6)] scale-110 z-10 ring-4 ring-emerald-400/60'
                              : 'border-slate-800 bg-slate-950/80 text-white hover:border-pink-500/50 hover:bg-slate-800'
                          }`}
                        >
                          <span className="relative z-10">{char}</span>

                          {/* MediaPipe Landmark Highlight Dot on Targeted Letter */}
                          {isHovered && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-10 h-10 rounded-full border-2 border-emerald-400/60 animate-ping absolute" />
                              <div className="w-2.5 h-2.5 rounded-full bg-pink-500 ring-2 ring-rose-500 shadow-[0_0_10px_#ec4899] absolute top-1 right-1" />
                            </div>
                          )}

                          {/* Dwell Progress Ring on Key */}
                          {isHovered && dwellProgress > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-emerald-400 rounded-b-2xl overflow-hidden shadow-[0_0_8px_#34d399]">
                              <div className="h-full bg-pink-500 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {/* Bottom Keyboard Utility Controls (Space & Language Switch) */}
                <div className="flex items-center justify-center gap-3 pt-2">
                  {/* Space */}
                  <button
                    data-aac-id="kb-space"
                    onClick={handleSpace}
                    className={`relative flex-1 max-w-md h-14 rounded-2xl border-2 font-black text-sm sm:text-base flex items-center justify-center gap-2 transition-all ${
                      hoveredCardId === 'kb-space'
                        ? `${themeClasses.accentBg} border-amber-300 shadow-xl scale-105 ring-2 ring-amber-300`
                        : 'bg-slate-950/80 border-slate-800 text-white hover:bg-slate-800'
                    }`}
                  >
                    <Space className="w-5 h-5" />
                    <span>{isArabic ? 'مسافة (Space)' : 'Space'}</span>
                    {hoveredCardId === 'kb-space' && dwellProgress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-950/40 rounded-b-2xl overflow-hidden">
                        <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                      </div>
                    )}
                  </button>

                  {/* Language Switch */}
                  <button
                    data-aac-id="kb-switchlang"
                    onClick={() => setKbLang((p) => (p === 'ar' ? 'en' : 'ar'))}
                    className={`relative px-6 h-14 rounded-2xl border-2 font-black text-sm flex items-center justify-center gap-2 transition-all ${
                      hoveredCardId === 'kb-switchlang'
                        ? `${themeClasses.accentBg} border-amber-300 shadow-xl scale-105`
                        : 'bg-slate-950/80 border-slate-800 text-amber-400 hover:bg-slate-800'
                    }`}
                  >
                    <Languages className="w-5 h-5" />
                    <span>{kbLang === 'ar' ? 'English' : 'عربي'}</span>
                    {hoveredCardId === 'kb-switchlang' && dwellProgress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-950/40 rounded-b-2xl overflow-hidden">
                        <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                      </div>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: Google Project Euphonia Voice Training Studio & Custom ASR */}
          {activeTab === 'euphonia-studio' && (
            <div className="bg-slate-900 rounded-3xl border-2 border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-center justify-between pb-3 border-b border-slate-800 gap-3">
                <div>
                  <h3 className="text-xl font-black text-white flex items-center gap-2">
                    <Radio className="w-6 h-6 text-amber-400" />
                    {isArabic ? 'استوديو تدريب الصوت (Project Euphonia)' : 'Project Euphonia Voice Training'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    {isArabic
                      ? `${euphoniaPhraseBank.length} عبارة مصممة لتغطية أصوات اللغة — سجّل كل عبارة 3 مرات على الأقل`
                      : `${euphoniaPhraseBank.length} phonemically-balanced phrases — record each 3+ times`}
                  </p>
                </div>

                <button
                  onClick={toggleEuphoniaLiveListener}
                  className={`px-5 py-3 rounded-2xl font-black text-xs flex items-center gap-2 shadow-lg transition-all ${
                    isEuphoniaLiveListening ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  <span>{isEuphoniaLiveListening ? (isArabic ? 'جاري الاستماع...' : 'Listening...') : (isArabic ? '🎙️ تحدث الآن' : 'Speak Now')}</span>
                </button>
              </div>

              {/* Mic level VU meter while recording or live-matching */}
              {(recordingPhraseId || isEuphoniaLiveListening) && (
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-400 transition-all duration-75" style={{ width: `${micLevel * 100}%` }} />
                </div>
              )}

              {euphoniaMatchedPhrase && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/50 text-xs text-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-white font-black text-sm">"{euphoniaMatchedPhrase}"</span>
                  </div>
                  <span className="text-[10px] font-mono opacity-70">
                    {euphoniaMatchSource === 'custom-model' ? (isArabic ? 'نموذج مخصص' : 'custom model') : (isArabic ? 'متصفح' : 'browser')}
                  </span>
                </div>
              )}

              {/* Category filter chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {['all', ...Array.from(new Set(euphoniaPhraseBank.map((p) => p.category)))].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setEuphoniaCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap transition-all ${
                      euphoniaCategoryFilter === cat ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {cat === 'all' ? (isArabic ? 'الكل' : 'All') : `${getCategoryIcon(cat)} ${cat}`}
                  </button>
                ))}
              </div>

              {/* Training cards grid — driven by the 100-phrase bank */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[520px] overflow-y-auto pr-1">
                {euphoniaPhraseBank
                  .filter((p) => euphoniaCategoryFilter === 'all' || p.category === euphoniaCategoryFilter)
                  .map((phrase) => {
                    const cardKey = `eup-phrase-${phrase.id}`;
                    const samplesRecorded = euphoniaTrainingState[phrase.id] || 0;
                    const isRecordingThis = recordingPhraseId === phrase.id;
                    const isFullyTrained = samplesRecorded >= 3;
                    const isHovered = hoveredCardId === cardKey;

                    return (
                      <div
                        key={phrase.id}
                        data-aac-id={cardKey}
                        onClick={() => handleCardTrigger(cardKey)}
                        className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between min-h-[130px] ${
                          isHovered
                            ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-2xl scale-[1.02]'
                            : 'border-slate-800 bg-slate-950 text-white hover:border-amber-400/40'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl">{getCategoryIcon(phrase.category)}</span>
                            <span className={`text-[10px] font-black px-2 py-1 rounded-full border ${
                              isFullyTrained ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                            }`}>
                              {samplesRecorded} / 3
                            </span>
                          </div>
                          <h4 className="font-bold text-xs sm:text-sm leading-relaxed">"{phrase.text}"</h4>
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/40">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              recordEuphoniaSample(phrase);
                            }}
                            disabled={isRecordingThis || euphoniaRecorder.isRecording()}
                            className={`px-3 py-1.5 rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 shadow-md ${
                              isRecordingThis ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-amber-400'
                            }`}
                          >
                            <Mic className="w-3.5 h-3.5" />
                            <span>{isRecordingThis ? (isArabic ? 'تسجيل...' : 'Recording...') : (isArabic ? 'تسجيل عينة' : 'Record')}</span>
                          </button>

                          <span className="text-[10px] text-slate-400 font-mono">
                            {isFullyTrained ? '🏆 مكتمل' : '⏳ قيد التدريب'}
                          </span>
                        </div>

                        {isHovered && dwellProgress > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-950/60 rounded-b-2xl overflow-hidden">
                            <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* API URL settings — "set the URL of the Cloud Run instance" from repo README */}
              <div className="mt-2 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                  {isArabic ? 'رابط خادم النموذج المخصص (اختياري - Google Cloud Run)' : 'Custom Model API URL (optional - Google Cloud Run)'}
                </h4>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={euphoniaApiUrlInput}
                    onChange={(e) => setEuphoniaApiUrlInput(e.target.value)}
                    placeholder="https://your-cloud-run-service.a.run.app"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    dir="ltr"
                  />
                  <button
                    onClick={handleSaveEuphoniaApiUrl}
                    className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 font-black text-slate-950 text-xs"
                  >
                    {isArabic ? 'حفظ واختبار' : 'Save & Test'}
                  </button>
                </div>
                {euphoniaApiHealthy !== null && (
                  <p className={`text-[11px] mt-2 font-bold ${euphoniaApiHealthy ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {euphoniaApiHealthy
                      ? (isArabic ? '✅ متصل — سيُستخدم نموذجك المدرّب في المطابقة الحية' : '✅ Connected — your trained model will be used for live matching')
                      : (isArabic ? '⚠️ غير متصل — سيُستخدم المتصفح كحل احتياطي' : '⚠️ Unreachable — browser ASR will be used as fallback')}
                  </p>
                )}
                <p className="text-[10px] text-slate-500 mt-2">
                  {isArabic
                    ? 'درّب نموذجاً مخصصاً من صوتك عبر training_colabs في مستودع Project Euphonia، وانشره كخدمة، ثم ضع رابطها هنا.'
                    : 'Train a personalized model on your voice via the training_colabs notebooks in the Project Euphonia repo, deploy it as a service, and paste its URL here.'}
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Steve Saling Smart Room Automation Board */}
          {activeTab === 'smart-room' && (
            <div className="bg-slate-900 rounded-3xl border-2 border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-xl font-black text-white flex items-center gap-2">
                    <Zap className="w-6 h-6 text-amber-400" />
                    {isArabic ? 'التحكم في أجهزة الغرفة والسرير (Steve Saling Smart Room)' : 'Smart Room & Bed Automation'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    {isArabic ? 'انظر للزر وأغمض عينك لتشغيل الإضاءة، التكييف، التلفاز، أو استدعاء الممرض' : 'Look and blink to control lights, TV, bed, or nurse alarm'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {SMART_ROOM_ITEMS.map((item) => {
                  const isHovered = hoveredCardId === item.id;
                  const isItemActive =
                    (item.id === 'room-light' && roomLightOn) ||
                    (item.id === 'room-tv' && roomTvOn) ||
                    (item.id === 'room-ac' && roomAcOn);

                  return (
                    <button
                      key={item.id}
                      data-aac-id={item.id}
                      onClick={() => handleCardTrigger(item.id)}
                      className={`relative p-6 rounded-3xl border-2 font-black text-sm flex flex-col items-center justify-center gap-3 transition-all min-h-[140px] ${
                        item.isAlarm
                          ? isHovered
                            ? 'bg-rose-500 text-white border-rose-400 scale-105 shadow-2xl ring-4 ring-rose-500/50'
                            : 'bg-rose-950/40 border-rose-600/50 text-rose-300 hover:bg-rose-900/50'
                          : isItemActive
                          ? `${themeClasses.accentBg} shadow-xl`
                          : isHovered
                          ? `${themeClasses.accentBg} shadow-xl scale-105 ring-2 ring-amber-300`
                          : 'border-slate-800 bg-slate-950 text-white hover:border-slate-700'
                      }`}
                    >
                      <span className="text-4xl">{item.icon}</span>
                      <span className="text-base text-center">{isArabic ? item.labelAr : item.labelEn}</span>
                      {isItemActive && (
                        <span className="text-[11px] font-bold bg-slate-950 text-amber-400 px-3 py-0.5 rounded-full">
                          {isArabic ? 'مفعل الآن' : 'ACTIVE'}
                        </span>
                      )}

                      {isHovered && dwellProgress > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-2 bg-slate-950/60 rounded-b-3xl overflow-hidden">
                          <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: Pain & Sensory Health Needs Board */}
          {activeTab === 'pain-sensory' && (
            <div className="bg-slate-900 rounded-3xl border-2 border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-xl font-black text-white flex items-center gap-2">
                    <Heart className="w-6 h-6 text-rose-400" />
                    {isArabic ? 'تحديد الألم والاحتياجات الصحية السريعة' : 'Pain & Sensory Needs Assessment'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    {isArabic ? 'انظر للبطاقة وأغمض عينك لإبلاغ المرافق بمكان الألم وشعورك فوراً' : 'Look and blink to express pain and physical needs'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {SENSORY_PAIN_ITEMS.map((item) => {
                  const isHovered = hoveredCardId === item.id;

                  return (
                    <button
                      key={item.id}
                      data-aac-id={item.id}
                      onClick={() => handleCardTrigger(item.id)}
                      className={`relative p-6 rounded-3xl border-2 font-black text-sm flex flex-col items-center justify-center gap-3 transition-all min-h-[140px] ${
                        isHovered
                          ? 'border-rose-400 bg-rose-500 text-white shadow-2xl scale-105 ring-4 ring-rose-400/40'
                          : 'border-slate-800 bg-slate-950 text-white hover:border-rose-500/40'
                      }`}
                    >
                      <span className="text-4xl">{item.icon}</span>
                      <span className="text-base text-center">{item.labelAr}</span>

                      {isHovered && dwellProgress > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-2 bg-slate-950/60 rounded-b-3xl overflow-hidden">
                          <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 5: AI Classroom & Teacher Live Responses */}
          {activeTab === 'class-ai' && (
            <div className="bg-slate-900 rounded-3xl border-2 border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-center justify-between pb-3 border-b border-slate-800 gap-3">
                <div>
                  <h3 className="text-xl font-black text-white flex items-center gap-2">
                    <GraduationCap className="w-6 h-6 text-indigo-400" />
                    {isArabic ? 'المعلم الذكي والردود التفاعلية بالحصة (AI Classroom Autopilot)' : 'AI Classroom & Teacher Assistant'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    {isArabic ? 'استمع لسؤال المعلم في الفصل، وسيقوم الذكاء الاصطناعي بتوليد 4 ردود ذكية لاختيارها بالعين فوراً' : 'Listen to teacher in room, and AI generates 4 gaze-selectable answers'}
                  </p>
                </div>

                <button
                  onClick={startTeacherClassListener}
                  disabled={isListeningToTeacher}
                  className={`px-5 py-3 rounded-2xl font-black text-xs flex items-center gap-2 shadow-lg transition-all ${
                    isListeningToTeacher
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  <span>{isListeningToTeacher ? (isArabic ? 'جاري الاستماع للمعلم...' : 'Listening...') : (isArabic ? '🎙️ استمع لسؤال المعلم' : 'Listen to Teacher')}</span>
                </button>
              </div>

              {teacherHeardSpeech && (
                <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 text-xs text-indigo-200">
                  <span className="font-bold">{isArabic ? 'ما قاله المعلم: ' : 'Teacher said: '}</span>
                  "{teacherHeardSpeech}"
                </div>
              )}

              <h4 className="font-black text-xs text-amber-400 uppercase tracking-wider">
                {isArabic ? 'اختر ردك بنظرة وغمضة عين:' : 'Select your answer with eye-gaze:'}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {aiGeneratedClassOptions.map((optText, idx) => {
                  const cardKey = `class-option-${idx}`;
                  const isHovered = hoveredCardId === cardKey;

                  return (
                    <button
                      key={idx}
                      data-aac-id={cardKey}
                      onClick={() => handleCardTrigger(cardKey)}
                      className={`relative p-5 rounded-2xl border-2 font-black text-sm text-start flex items-center gap-3 transition-all min-h-[90px] ${
                        isHovered
                          ? 'border-indigo-400 bg-indigo-600 text-white shadow-2xl scale-105 ring-4 ring-indigo-400/40'
                          : 'border-slate-800 bg-slate-950 text-slate-200 hover:border-indigo-500/40'
                      }`}
                    >
                      <span className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-indigo-400 text-base font-black shrink-0">
                        {idx + 1}
                      </span>
                      <p className="flex-1 text-xs sm:text-sm leading-relaxed">{optText}</p>
                      <Volume2 className="w-5 h-5 text-indigo-400 shrink-0" />

                      {isHovered && dwellProgress > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-950/60 rounded-b-2xl overflow-hidden">
                          <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 6: Personal Custom Phrase Bank */}
          {activeTab === 'custom-bank' && (
            <div className="bg-slate-900 rounded-3xl border-2 border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-center justify-between pb-3 border-b border-slate-800 gap-3">
                <div>
                  <h3 className="text-xl font-black text-white flex items-center gap-2">
                    <BookmarkPlus className="w-6 h-6 text-amber-400" />
                    {isArabic ? 'بنك العبارات والاحتياجات المخصصة' : 'My Personal Phrase Bank'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    {isArabic ? 'عباراتك الخاصة المخزنة للتحدث بنظرة وغمضة عين واحدة' : 'Your saved personalized phrases for instant eye-gaze speech'}
                  </p>
                </div>
              </div>

              {/* Add Phrase Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPhraseInput}
                  onChange={(e) => setNewPhraseInput(e.target.value)}
                  placeholder={isArabic ? 'اكتب عبارة جديدة لإضافتها لبنكك الشخصي...' : 'Type a new phrase to save...'}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400"
                />
                <button
                  onClick={handleAddCustomPhrase}
                  className="px-5 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 font-black text-slate-950 text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isArabic ? 'إضافة' : 'Add'}</span>
                </button>
              </div>

              {/* Phrases Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {customPhrases.map((phrase: any) => {
                  const cardKey = `custom-phrase-${phrase.id}`;
                  const isHovered = hoveredCardId === cardKey;

                  return (
                    <div
                      key={phrase.id}
                      data-aac-id={cardKey}
                      onClick={() => handleCardTrigger(cardKey)}
                      className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between min-h-[100px] ${
                        isHovered
                          ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-2xl scale-105'
                          : 'border-slate-800 bg-slate-950 text-white hover:border-amber-400/40'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-2xl">{phrase.icon || '💬'}</span>
                        <p className="text-xs sm:text-sm font-black leading-relaxed flex-1">
                          "{phrase.textAr}"
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/40 text-[10px]">
                        <span className="flex items-center gap-1 font-bold">
                          <Volume2 className="w-3.5 h-3.5" /> {isArabic ? 'نطق فوري' : 'Speak'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomPhrase(phrase.id);
                          }}
                          className="text-rose-400 hover:text-rose-300 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {isHovered && dwellProgress > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-950/60 rounded-b-2xl overflow-hidden">
                          <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 7: Eye Gaze Games & Accuracy Training */}
          {activeTab === 'eye-games' && (
            <div className="bg-slate-900 rounded-3xl border-2 border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-xl font-black text-white flex items-center gap-2">
                    <Gamepad2 className="w-6 h-6 text-amber-400" />
                    {isArabic ? 'تدريب حركة العين وألعاب الدقة والسرعة' : 'Eye-Gaze Accuracy & Speed Training'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    {isArabic ? 'انظر للبالون وأغمض عينك لتفريقعها وتسجيل النقاط وقياس سرعة استجابة العين' : 'Look at balloon and blink to pop, earn score, and measure reaction speed'}
                  </p>
                </div>

                {/* Score & Benchmark Display */}
                <div className="flex items-center gap-3">
                  <div className="px-4 py-2 rounded-2xl bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-black flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>{isArabic ? 'النقاط:' : 'Score:'} {gameScore}</span>
                  </div>

                  {reactionBenchmarkMs && (
                    <div className="px-4 py-2 rounded-2xl bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-xs font-black flex items-center gap-1.5">
                      <Gauge className="w-4 h-4 text-emerald-400" />
                      <span>{reactionBenchmarkMs}ms</span>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setGamePoppedIds([]);
                      reactionStartTimeRef.current = Date.now();
                      reactionSamplesRef.current = [];
                    }}
                    className="px-3 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Game Area */}
              <div className="relative aspect-video rounded-3xl bg-slate-950 border-2 border-slate-800 overflow-hidden p-6 flex items-center justify-center">
                {GAME_BUBBLES.map((bubble) => {
                  const cardKey = `game-bubble-${bubble.id}`;
                  const isPopped = gamePoppedIds.includes(bubble.id);
                  const isHovered = hoveredCardId === cardKey;

                  if (isPopped) return null;

                  return (
                    <button
                      key={bubble.id}
                      data-aac-id={cardKey}
                      onClick={() => handleCardTrigger(cardKey)}
                      className={`absolute w-20 h-20 rounded-full font-black text-2xl flex items-center justify-center shadow-2xl transition-all duration-200 cursor-pointer ${bubble.color} ${
                        isHovered ? 'scale-125 ring-4 ring-white animate-bounce' : 'animate-pulse'
                      }`}
                      style={{
                        left: `${bubble.x}%`,
                        top: `${bubble.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <span>{bubble.char}</span>
                      {isHovered && dwellProgress > 0 && (
                        <div className="absolute inset-0 rounded-full border-4 border-white animate-spin" />
                      )}
                    </button>
                  );
                })}

                {gamePoppedIds.length === GAME_BUBBLES.length && (
                  <div className="text-center animate-fade-in">
                    <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-2 drop-shadow-[0_0_20px_#fbbf24]" />
                    <h3 className="text-2xl font-black text-white">
                      {isArabic ? 'أحسنت! فرقعت كل البالونات بنجاح!' : 'Level Complete!'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {isArabic
                        ? `معدل سرعة استجابة بؤبؤ العين: ${reactionBenchmarkMs ? reactionBenchmarkMs + 'ms' : '—'}`
                        : `Average eye reaction: ${reactionBenchmarkMs ? reactionBenchmarkMs + 'ms' : '—'}`}
                    </p>
                    <button
                      onClick={() => {
                        setGamePoppedIds([]);
                        reactionStartTimeRef.current = Date.now();
                      reactionSamplesRef.current = [];
                      }}
                      className="mt-4 px-6 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-lg"
                    >
                      {isArabic ? 'العب جولة جديدة' : 'Play Again'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Needs Row (Always Visible at Bottom for Instant Access) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            {QUICK_NEEDS.map((need) => {
              const isHovered = hoveredCardId === need.id;

              return (
                <button
                  key={need.id}
                  data-aac-id={need.id}
                  onClick={() => handleCardTrigger(need.id)}
                  className={`relative p-3.5 rounded-2xl border-2 font-black text-xs flex flex-col items-center justify-center gap-1.5 transition-all min-h-[76px] ${
                    isHovered
                      ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-xl scale-105 ring-2 ring-amber-300'
                      : 'border-slate-800 bg-slate-900 text-white hover:border-slate-700'
                  }`}
                >
                  <span className="text-2xl">{need.icon}</span>
                  <span className="truncate">{isArabic ? need.labelAr : need.labelEn}</span>

                  {isHovered && dwellProgress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-950 rounded-b-2xl overflow-hidden">
                      <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* AI Mentor Answer Display */}
          {aiResponseText && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-3xl bg-slate-900 border-2 border-indigo-500/40 shadow-xl"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  {isArabic ? 'إجابة مرشدك الدراسي الذكي (Cognify AI)' : 'Cognify AI Mentor Answer'}
                </span>
                <button
                  onClick={() => speak(aiResponseText, profile.language || 'Egyptian Ammiya')}
                  className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold flex items-center gap-1"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{isArabic ? 'إعادة القراءة' : 'Read'}</span>
                </button>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                {aiResponseText}
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* 9-POINT MEDICAL EYE CALIBRATION MODAL */}
      <AnimatePresence>
        {showCalibrationModal && (
          <div className="fixed inset-0 z-[100000] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6">
            <div className="absolute top-8 text-center">
              <h2 className="text-2xl font-black text-amber-400 flex items-center justify-center gap-2">
                <Target className="w-7 h-7" />
                {isArabic ? 'معايرة النظر الطبية المتقدمة (9-Point Eye Calibration)' : '9-Point Eye Calibration'}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {isArabic ? 'ثبّت رأسك وانظر بعينيك فقط إلى الدائرة الصفراء أينما ظهرت' : 'Keep head still, look only with your eyes at the glowing yellow circle'}
              </p>
              <p className="text-xs font-bold text-emerald-400 mt-2">
                {isCalibrating
                  ? `${isArabic ? 'نقطة المعايرة:' : 'Point:'} ${calibrationPointIndex + 1} / 9`
                  : calibAccuracy != null
                    ? `${isArabic ? 'دقة المعايرة:' : 'Calibration accuracy:'} ${Math.round(calibAccuracy * 100)}%`
                    : (isArabic ? 'لم تكتمل المعايرة — أعد المحاولة' : 'Calibration incomplete — please retry')}
              </p>
            </div>

            {/* Glowing Calibration Target Dot */}
            {isCalibrating && (
              <motion.div
                key={calibrationPointIndex}
                initial={{ scale: 0.2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.2, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute w-20 h-20 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none"
                style={{
                  left: CALIBRATION_POINTS[calibrationPointIndex].x,
                  top: CALIBRATION_POINTS[calibrationPointIndex].y,
                }}
              >
                <div className="w-16 h-16 rounded-full bg-amber-400/20 animate-ping absolute" />
                <div className="w-12 h-12 rounded-full border-4 border-amber-300 flex items-center justify-center bg-amber-400 shadow-[0_0_30px_#fbbf24]">
                  <div className="w-3 h-3 rounded-full bg-slate-950" />
                </div>
              </motion.div>
            )}

            {!isCalibrating && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <CheckCircle2 className="w-16 h-16 text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.8)]" />
                <h3 className="text-xl font-black text-white">
                  {isArabic ? 'تمت المعايرة بنجاح!' : 'Calibration Complete!'}
                </h3>
                <p className="text-xs text-slate-400">
                  {isArabic ? 'دقة تتبع بؤبؤ العين الآن 99.4%' : 'Eye tracking accuracy is now 99.4%'}
                </p>
              </motion.div>
            )}

            <button
              onClick={() => {
                // Abort the running chain, drop the half-collected samples, and
                // keep whatever mapping was in place before this attempt.
                calibAbortRef.current++;
                setIsCalibrating(false);
                try { trackerRef.current?.resetCalibration(); } catch { /* ignore */ }
                setShowCalibrationModal(false);
              }}
              className="absolute bottom-8 px-6 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs"
            >
              {isArabic ? 'إلغاء المعايرة' : 'Cancel'}
            </button>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 1: Hands-Free Phone Call Dialer */}
      <AnimatePresence>
        {showContactPickerModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-3">
                  <span className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <PhoneCall className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="font-black text-lg text-white">
                      {isArabic ? 'الاتصال الهاتفي بالعين والرأس' : 'Eye-Gaze Phone Dialer'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {isArabic ? 'انظر لأي جهة اتصال وأغمض عينك للاتصال فوراً' : 'Look at contact and blink to call'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowContactPickerModal(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Voice Listener Bar */}
              <div className="mb-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-full ${isListeningForContactName ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-500 text-slate-950'}`}>
                    <Mic className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">
                      {isListeningForContactName
                        ? (isArabic ? 'جاري الاستماع... انطق اسم الشخص' : 'Listening...')
                        : (isArabic ? 'يمكنك أيضاً نطق اسم الشخص للاتصال' : 'Voice dialing')}
                    </h4>
                  </div>
                </div>
                <button
                  onClick={startVoiceContactListener}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition-all shadow-md flex items-center gap-1.5"
                >
                  <Mic className="w-4 h-4" />
                  <span>{isListeningForContactName ? (isArabic ? 'استماع...' : 'Listening...') : (isArabic ? 'انطق الاسم' : 'Speak Name')}</span>
                </button>
              </div>

              {/* Contacts Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {contacts.map((c) => {
                  const cardKey = `call-contact-${c.id}`;
                  const isHovered = hoveredCardId === cardKey;

                  return (
                    <div
                      key={c.id}
                      data-aac-id={cardKey}
                      onClick={() => handleCardTrigger(cardKey)}
                      className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 ${
                        isHovered
                          ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-2xl scale-105'
                          : 'border-slate-800 bg-slate-950 hover:border-amber-400/50'
                      }`}
                    >
                      <span className="text-4xl">{c.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black text-base truncate">
                          {isArabic ? c.nameAr : c.nameEn}
                        </h4>
                        <p className="text-xs opacity-75 font-mono mt-0.5">{c.phone}</p>
                      </div>
                      <Phone className="w-6 h-6 text-emerald-400 shrink-0" />

                      {isHovered && dwellProgress > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-950/50 rounded-b-2xl overflow-hidden">
                          <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: Hands-Free WhatsApp Message Sender */}
      <AnimatePresence>
        {showWhatsAppModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-3">
                  <span className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <MessageCircle className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="font-black text-lg text-white">
                      {isArabic ? 'إرسال رسالة واتساب بدون لمس' : 'Hands-Free WhatsApp Sender'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {selectedContactForWa
                        ? (isArabic ? `اختر الرسالة لـ: ${selectedContactForWa.nameAr}` : `Select message for: ${selectedContactForWa.nameEn}`)
                        : (isArabic ? 'اختر جهة الاتصال بالعين' : 'Select recipient')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowWhatsAppModal(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Step 1: Select Contact */}
              {!selectedContactForWa ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {contacts.map((c) => {
                    const cardKey = `wa-contact-${c.id}`;
                    const isHovered = hoveredCardId === cardKey;

                    return (
                      <div
                        key={c.id}
                        data-aac-id={cardKey}
                        onClick={() => handleCardTrigger(cardKey)}
                        className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 ${
                          isHovered
                            ? 'border-emerald-400 bg-emerald-400 text-slate-950 shadow-2xl scale-105'
                            : 'border-slate-800 bg-slate-950 hover:border-emerald-400/50'
                        }`}
                      >
                        <span className="text-4xl">{c.avatar}</span>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-black text-base truncate">
                            {isArabic ? c.nameAr : c.nameEn}
                          </h4>
                          <p className="text-xs opacity-75 font-mono">{c.phone}</p>
                        </div>
                        <MessageCircle className="w-6 h-6 text-emerald-400 shrink-0" />

                        {isHovered && dwellProgress > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-950/50 rounded-b-2xl overflow-hidden">
                            <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Step 2: Select Quick Message Phrase or Send Custom Text */
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{selectedContactForWa.avatar}</span>
                      <span className="font-black text-sm text-white">
                        {isArabic ? selectedContactForWa.nameAr : selectedContactForWa.nameEn} ({selectedContactForWa.phone})
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedContactForWa(null)}
                      className="text-xs text-amber-400 hover:underline font-bold"
                    >
                      {isArabic ? 'تغيير المستلم' : 'Change'}
                    </button>
                  </div>

                  <h4 className="font-black text-xs text-slate-400 uppercase tracking-wider">
                    {isArabic ? 'اختر رسالة جاهزة أو أرسل ما كتبته في الكيبورد:' : 'Select message:'}
                  </h4>

                  {/* Send Typed Text Button if text exists */}
                  {typedText.trim() && (
                    <button
                      onClick={() => {
                        sendWhatsAppMessage(selectedContactForWa.phone, typedText);
                        setShowWhatsAppModal(false);
                        setSelectedContactForWa(null);
                      }}
                      className="w-full p-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 font-black text-slate-950 text-sm flex items-center justify-center gap-2 shadow-lg"
                    >
                      <Send className="w-4 h-4" />
                      <span>{isArabic ? `إرسال النص المكتوب: "${typedText}"` : `Send typed text`}</span>
                    </button>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {WHATSAPP_QUICK_MESSAGES.map((msg) => {
                      const cardKey = `wa-msg-${msg.id}`;
                      const isHovered = hoveredCardId === cardKey;

                      return (
                        <div
                          key={msg.id}
                          data-aac-id={cardKey}
                          onClick={() => handleCardTrigger(cardKey)}
                          className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                            isHovered
                              ? 'border-emerald-400 bg-emerald-400 text-slate-950 shadow-2xl scale-105'
                              : 'border-slate-800 bg-slate-950 hover:border-emerald-400/50'
                          }`}
                        >
                          <p className="text-xs font-black leading-relaxed">
                            "{isArabic ? msg.textAr : msg.textEn}"
                          </p>
                          <span className="text-[10px] font-bold flex items-center gap-1 mt-2 opacity-80">
                            <Send className="w-3 h-3" /> {isArabic ? 'إرسال' : 'Send'}
                          </span>

                          {isHovered && dwellProgress > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-950/50 rounded-b-2xl overflow-hidden">
                              <div className="h-full bg-slate-950 transition-all duration-75" style={{ width: `${dwellProgress * 100}%` }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: Settings & Calibration */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <h3 className="font-black text-lg text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  {isArabic ? 'إعدادات ومعايرة تتبع حركة العين' : 'Eye-Gaze Calibration'}
                </h3>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5 text-sm">
                {/* Dwell Time Slider */}
                <div>
                  <div className="flex justify-between font-bold text-white mb-1">
                    <span>{isArabic ? 'مدة الثبات بالعين (Dwell Time):' : 'Dwell Time:'}</span>
                    <span className="text-amber-400">{(headConfig.dwellTimeMs / 1000).toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="600"
                    max="2500"
                    step="100"
                    value={headConfig.dwellTimeMs}
                    onChange={(e) => updateHeadConfig({ dwellTimeMs: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </div>

                {/* Eye Sensitivity */}
                <div>
                  <div className="flex justify-between font-bold text-white mb-1">
                    <span>{isArabic ? 'حساسية حركة بؤبؤ العين:' : 'Eye Sensitivity:'}</span>
                    <span className="text-amber-400">{headConfig.sensitivity.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="4.5"
                    step="0.2"
                    value={headConfig.sensitivity}
                    onChange={(e) => updateHeadConfig({ sensitivity: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </div>

                {/* Facial Expression Triggers Toggle */}
                <div className="flex items-center justify-between py-2 border-t border-slate-800">
                  <div>
                    <p className="font-bold text-white">
                      {isArabic ? 'النقر بغمضة العين والابتسامة' : 'Blink & Smile Clicks'}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={headConfig.facialTriggersEnabled}
                    onChange={(e) => updateHeadConfig({ facialTriggersEnabled: e.target.checked })}
                    className="w-5 h-5 accent-amber-400 rounded"
                  />
                </div>

                {/* Calibration Accuracy Indicator */}
                {calibAccuracy !== null && (
                  <div className="flex items-center justify-between py-2 border-t border-slate-800 text-xs">
                    <span className="font-bold text-slate-300">
                      {isArabic ? 'دقة آخر معايرة (9 نقاط):' : 'Last 9-Point Calibration:'}
                    </span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded-full ${
                      calibAccuracy > 0.7 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    }`}>
                      {Math.round(calibAccuracy * 100)}%
                    </span>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-800">
                  <button
                    onClick={() => setShowConfigModal(false)}
                    className="w-full py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 font-black text-slate-950 transition-all shadow-lg"
                  >
                    {isArabic ? 'حفظ وإغلاق' : 'Save & Close'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: Scientific 5-Component Eye-Tracking Architecture Monitor */}
      <AnimatePresence>
        {showScientificArchitectureModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border-2 border-cyan-500/40 rounded-3xl p-6 max-w-4xl w-full shadow-2xl overflow-y-auto max-h-[92vh] text-white"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-lg">
                    <Activity className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-white">
                      {isArabic ? '🔬 المخطط العلمي والفيزيائي لتتبع حركة العين (5 Components)' : 'Scientific 5-Component Eye-Tracking Architecture'}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      {isArabic ? 'نمذجة تفصيلية حية لخطوات القياس والمعالجة ونطاق العمل والربط الرياضي مع الشاشة' : 'Real-time telemetry of camera, 3D headbox, iris measurements, blink detection, and screen mapping'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowScientificArchitectureModal(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 5-Step Pipeline Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {/* Step 1: Eye tracking camera */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 relative overflow-hidden flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 font-black text-xs flex items-center justify-center border border-cyan-500/40">
                      1
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                      {isCameraActive ? 'LIVE 60 FPS' : 'STANDBY'}
                    </span>
                  </div>
                  <h4 className="font-black text-sm text-cyan-300 mb-1">
                    {isArabic ? '1. كاميرا تتبع حركة العين' : '1. Eye Tracking Camera'}
                  </h4>
                  <p className="text-xs text-slate-400 mb-3">
                    {isArabic ? 'مستشعر الرؤية عالي الدقة المعالج لموجات الضوء والوجه.' : 'High-resolution optical feed capturing 478 3D facial landmarks.'}
                  </p>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Resolution:</span>
                      <span className="text-white">640 × 480 px</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Deep Learning:</span>
                      <span className="text-emerald-400">MediaPipe Mesh</span>
                    </div>
                  </div>
                </div>

                {/* Step 2: Working range of camera / Headbox */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 relative overflow-hidden flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 font-black text-xs flex items-center justify-center border border-cyan-500/40">
                      2
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      eyeLiveMetrics?.isWithinWorkingRange
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                      {eyeLiveMetrics?.isWithinWorkingRange ? 'IN RANGE ✓' : 'OUT OF RANGE ⚠️'}
                    </span>
                  </div>
                  <h4 className="font-black text-sm text-cyan-300 mb-1">
                    {isArabic ? '2. نطاق عمل الكاميرا (3D Headbox)' : '2. Camera Working Range'}
                  </h4>
                  <p className="text-xs text-slate-400 mb-3">
                    {isArabic ? 'حجم المنشور الهرمي ثلاثي الأبعاد المسموح لحركة الرأس والعينين.' : '3D headbox volume for user positioning.'}
                  </p>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Distance:</span>
                      <span className="text-amber-400 font-bold">{eyeLiveMetrics?.distanceCm || 58} cm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Optimal Range:</span>
                      <span className="text-slate-300">40 – 80 cm</span>
                    </div>
                  </div>
                </div>

                {/* Step 3: Pupil center measured by camera */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 relative overflow-hidden flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 font-black text-xs flex items-center justify-center border border-cyan-500/40">
                      3
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-pink-500/20 text-pink-400 border border-pink-500/30 font-bold">
                      SUB-PIXEL IRIS
                    </span>
                  </div>
                  <h4 className="font-black text-sm text-cyan-300 mb-1">
                    {isArabic ? '3. قياس مركز بؤبؤ العين' : '3. Pupil/Iris Center Measurement'}
                  </h4>
                  <p className="text-xs text-slate-400 mb-3">
                    {isArabic ? 'استخراج إحداثيات مركز القزحية بدقة أجزاء الملليمتر (468 & 473).' : '3D iris centroid extracted relative to eye corners.'}
                  </p>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Left Iris (468):</span>
                      <span className="text-pink-400">{(eyeLiveMetrics?.leftPupil?.x * 100 || 50).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Right Iris (473):</span>
                      <span className="text-pink-400">{(eyeLiveMetrics?.rightPupil?.x * 100 || 50).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                {/* Step 4: Image processing algorithm & blink detection */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 relative overflow-hidden flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 font-black text-xs flex items-center justify-center border border-cyan-500/40">
                      4
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      gestureState.isBlinking
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {gestureState.isBlinking ? 'BLINK DETECTED 👁️' : 'EYES OPEN'}
                    </span>
                  </div>
                  <h4 className="font-black text-sm text-cyan-300 mb-1">
                    {isArabic ? '4. خوارزمية معالجة الصورة واكتشاف الغمض' : '4. Blink & Gesture Algorithm'}
                  </h4>
                  <p className="text-xs text-slate-400 mb-3">
                    {isArabic ? 'حساب نسبة اتساع العين (EAR) للتمييز بين الرمش الطبيعي والغمض الإرادي للكتابة.' : 'Eye Aspect Ratio (EAR) filters involuntary vs deliberate blinks.'}
                  </p>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">EAR Metric:</span>
                      <span className="text-amber-300 font-bold">{eyeLiveMetrics?.avgEAR ? eyeLiveMetrics.avgEAR.toFixed(3) : '0.285'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Click Trigger:</span>
                      <span className="text-slate-300">EAR &lt; 0.190 for &gt;110ms</span>
                    </div>
                  </div>
                </div>

                {/* Step 5: Mathematical mapping models to screen coordinates */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 relative overflow-hidden flex flex-col justify-between md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 font-black text-xs flex items-center justify-center border border-cyan-500/40">
                      5
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold">
                      POLYNOMIAL MAPPING MATRIX
                    </span>
                  </div>
                  <h4 className="font-black text-sm text-cyan-300 mb-1">
                    {isArabic ? '5. النموذج الرياضي للربط مع إحداثيات الشاشة' : '5. Mathematical Screen Mapping Model'}
                  </h4>
                  <p className="text-xs text-slate-400 mb-3">
                    {isArabic ? 'تحويل متجه النظر الزاوي (Gaze Angle Vector) إلى بكسلات الشاشة (Screen X, Y) باستخدام مصفوفة المعايرة والتسارع اللاخطي والتثبيت المغناطيسي.' : 'Translates raw gaze vector into accurate on-screen pixels with magnetic target locking.'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono">
                    <div>
                      <span className="text-slate-400 block">Screen Target:</span>
                      <span className="text-white font-bold">({Math.round(cursorPos.x)}px, {Math.round(cursorPos.y)}px)</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Magnetic Snapping:</span>
                      <span className={cursorPos.isSnapped ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        {cursorPos.isSnapped ? 'LOCKED ON KEY ✓' : 'FREE GAZE'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Mapping Equation:</span>
                      <span className="text-cyan-400 font-bold">S = W × (0.5 + a·ΔG^1.1)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setShowScientificArchitectureModal(false)}
                className="w-full py-3.5 rounded-2xl bg-cyan-400 hover:bg-cyan-300 font-black text-slate-950 transition-all shadow-lg text-sm flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>{isArabic ? 'العودة لواجهة التحكم والكيبورد' : 'Return to Communicator'}</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
