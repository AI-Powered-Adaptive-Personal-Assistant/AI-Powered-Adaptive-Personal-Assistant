import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Sparkles, 
  RefreshCw, 
  X, 
  Volume2, 
  MessageSquare, 
  History, 
  AlertCircle, 
  Maximize2, 
  Trash2,
  ChevronRight,
  Heart,
  Settings,
  Plus,
  Copy,
  Check,
  Zap,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { geminiService } from '../services/geminiService';

interface LiveCaptionsProps {
  language?: string;
  onClose: () => void;
}

interface SoundboardItem {
  id: string;
  emoji: string;
  textEn: string;
  textAr: string;
}

interface EuphoniaPattern {
  id: string;
  phrase: string;
  translation: string;
}

const SOUNDBOARD_DATA: Record<'essentials' | 'needs' | 'social' | 'emergencies', SoundboardItem[]> = {
  essentials: [
    { id: 'yes', emoji: '👍', textEn: "Yes", textAr: "نعم" },
    { id: 'no', emoji: '👎', textEn: "No", textAr: "لا" },
    { id: 'thanks', emoji: '🙏', textEn: "Thank you so much", textAr: "شكراً جزيلاً لك" },
    { id: 'sorry', emoji: '🙇', textEn: "Sorry", textAr: "عذراً / أسف" },
    { id: 'hello', emoji: '👋', textEn: "Hello, nice to see you", textAr: "مرحباً، يسعدني رؤيتك" },
    { id: 'goodbye', emoji: '👋', textEn: "Goodbye", textAr: "مع السلامة" },
    { id: 'agree', emoji: '🤝', textEn: "I agree with that", textAr: "أنا أتفق مع هذا" },
    { id: 'ok', emoji: '👌', textEn: "Okay, perfect", textAr: "حسناً، ممتاز" }
  ],
  needs: [
    { id: 'help', emoji: '🆘', textEn: "I need assistance, please", textAr: "أحتاج إلى مساعدة من فضلك" },
    { id: 'bathroom', emoji: '🚽', textEn: "Where is the restroom?", textAr: "أين دورة المياه؟" },
    { id: 'hungry', emoji: '🍔', textEn: "I am hungry", textAr: "أنا جائع" },
    { id: 'thirsty', emoji: '🥤', textEn: "I am thirsty", textAr: "أنا عطشان" },
    { id: 'rest', emoji: '🛌', textEn: "I need to rest for a bit", textAr: "أريد أن أرتاح قليلاً" },
    { id: 'water', emoji: '💧', textEn: "Can I have some water?", textAr: "هل يمكنني الحصول على بعض الماء؟" },
    { id: 'write', emoji: '📝', textEn: "Can you write it down?", textAr: "هل يمكنك كتابتها؟" }
  ],
  social: [
    { id: 'meet', emoji: '😊', textEn: "Nice to meet you", textAr: "سعيد بلقائك" },
    { id: 'moment', emoji: '⏱️', textEn: "One moment, please", textAr: "لحظة واحدة من فضلك" },
    { id: 'tool', emoji: '🗣️', textEn: "I am using this tablet tool to express myself", textAr: "أنا أستخدم هذه المنصة للنطق لتسهيل تواصلنا" },
    { id: 'slow', emoji: '🐢', textEn: "Could you speak a bit slower?", textAr: "تكلم ببطء أكثر من فضلك" },
    { id: 'how_are_you', emoji: '❤️', textEn: "How are you today?", textAr: "كيف حالك اليوم?" },
    { id: 'welcome', emoji: '🌸', textEn: "You are welcome", textAr: "على الرحب والسعة" }
  ],
  emergencies: [
    { id: 'emergency', emoji: '🚨', textEn: "This is an emergency, I need urgent help", textAr: "هذه حالة طارئة، أحتاج لمساعدة عاجلة" },
    { id: 'sick', emoji: '🤢', textEn: "I feel very sick", textAr: "أشعر بمرض شديد" },
    { id: 'call', emoji: '📞', textEn: "Please call my emergency contact", textAr: "برجاء الاتصال برقم الطوارئ الخاص بي" },
    { id: 'medicine', emoji: '💊', textEn: "I need my medication", textAr: "أريد تناول دوائي" },
    { id: 'pain', emoji: '💥', textEn: "I am in high pain", textAr: "أشعر بألم شديد" },
    { id: 'danger', emoji: '⚠️', textEn: "Wait, this is dangerous", textAr: "انتظر، هذا خطر" }
  ]
};

export default function LiveCaptions({ language = 'en-US', onClose }: LiveCaptionsProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [volume, setVolume] = useState(0);
  const [enhancedText, setEnhancedText] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Speech impaired vocal deck states
  const [speechProfile, setSpeechProfile] = useState<string>('Multilingual');
  const [isDecodingSpeech, setIsDecodingSpeech] = useState(false);
  const [originalGarbledText, setOriginalGarbledText] = useState('');

  const [activeTab, setActiveTab] = useState<'essentials' | 'needs' | 'social' | 'emergencies' | 'favorites'>('essentials');
  const [customText, setCustomText] = useState('');
  const [showBigMode, setShowBigMode] = useState(false);
  const [aiSmartReplies, setAiSmartReplies] = useState<string[]>([]);
  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);
  const [speechHistory, setSpeechHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('cognify_speech_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Performance / Accessibility Calibration states
  const [pauseThreshold, setPauseThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('cognify_pause_threshold');
    return saved ? Number(saved) : 2500;
  });
  const [speechRate, setSpeechRate] = useState<number>(() => {
    const saved = localStorage.getItem('cognify_speech_rate');
    return saved ? Number(saved) : 1.0;
  });
  const [speechPitch, setSpeechPitch] = useState<number>(() => {
    const saved = localStorage.getItem('cognify_speech_pitch');
    return saved ? Number(saved) : 1.0;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedState, setCopiedState] = useState(false);

  // Customized Saved Presets ("My Presets")
  const [favorites, setFavorites] = useState<SoundboardItem[]>(() => {
    try {
      const saved = localStorage.getItem('cognify_speech_presets');
      return saved ? JSON.parse(saved) : [
        { id: 'fav1', emoji: '🏡', textEn: "I am ready to go home", textAr: "أنا جاهز للذهاب إلى المنزل" },
        { id: 'fav2', emoji: '☕', textEn: "I would love some coffee", textAr: "أود بعض القهوة" },
        { id: 'fav3', emoji: '⚕️', textEn: "May I have my medicine please?", textAr: "هل يمكنني الحصول على الدواء من فضلك؟" }
      ];
    } catch {
      return [];
    }
  });

  // Project Euphonia Voice Training Deck states
  const [euphoniaPatterns, setEuphoniaPatterns] = useState<EuphoniaPattern[]>(() => {
    try {
      const saved = localStorage.getItem('cognify_euphonia_patterns');
      return saved ? JSON.parse(saved) : [
        { id: 'ep1', phrase: "wa wa", translation: "Can I have some water?" },
        { id: 'ep2', phrase: "baf roo", translation: "Where is the restroom?" },
        { id: 'ep3', phrase: "hoh", translation: "I want to go home" },
        { id: 'ep4', phrase: "hep me", translation: "Please help me" }
      ];
    } catch {
      return [];
    }
  });
  const [newSoundPattern, setNewSoundPattern] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [isEuphoniaTrainingOpen, setIsEuphoniaTrainingOpen] = useState(false);

  const recognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Project Euphonia Direct Multimodal States
  const [isDirectAudioMode, setIsDirectAudioMode] = useState(false);
  const [isRecordingDirectAudio, setIsRecordingDirectAudio] = useState(false);
  const [directRecordingTime, setDirectRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startDirectAudioRecord = async () => {
    try {
      if (isListening) {
        // Stop standard continuous ASR to prevent mic resource locks
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        setIsListening(false);
      }
      setError(null);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Select appropriate mic mime type
      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' };
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        
        // Stop all track releases
        stream.getTracks().forEach(track => track.stop());

        setIsDecodingSpeech(true);
        setOriginalGarbledText('Feeding raw vocal audio into Gemini Deep Learning Acoustic model descriptor...');

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const base64Content = base64data.split(',')[1];

          try {
            const decodedResult = await geminiService.decodeEuphoniaAudio(
              base64Content,
              speechProfile,
              language,
              euphoniaPatterns,
              mediaRecorder.mimeType || 'audio/webm'
            );
            
            if (decodedResult && decodedResult.trim() !== "") {
              setEnhancedText(decodedResult);
              setTranscript(decodedResult);
              fetchSmartReplies(decodedResult);
            } else {
              setError("We couldn't decode any clear phrases from your recording. Please try repeating clearly.");
            }
          } catch (err: any) {
            console.error("Direct audio recognition failed:", err);
            setError("Direct voice decryption with Deep Learning failed. Double-check your microphone and try again.");
          } finally {
            setIsDecodingSpeech(false);
          }
        };
      };

      mediaRecorder.start();
      setIsRecordingDirectAudio(true);
      setDirectRecordingTime(0);

      // Start volume level visualizer
      startAudioLevelTracking();

      recordingTimerRef.current = setInterval(() => {
        setDirectRecordingTime(prev => {
          if (prev >= 6) { // Auto cut-off at 6s
            stopDirectAudioRecord();
            return 6;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Failed to access microphone for raw audio capture:", err);
      setError("Cannot open raw recording mic. Verify browser permission in site setting.");
    }
  };

  const stopDirectAudioRecord = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingDirectAudio(false);
    stopAudioLevelTracking();
  };

  const isArabic = language.startsWith('ar');

  const t = {
    listeningLive: isArabic ? "مساعد استماع مباشر" : "Listening Live",
    standby: isArabic ? "مستعد للنطق والاستماع" : "Speech & Listen Standby",
    waitingSpeech: isArabic ? "في انتظار سماع حديث مسموع..." : "Listening for voice to transcribe...",
    aiSimplified: isArabic ? "تبسيط ذكي" : "AI Simplified",
    clearAll: isArabic ? "مسح الكلام" : "Clear All",
    optimizing: isArabic ? "تحسين بالذكاء الاصطناعي..." : "Optimizing text...",
    tapToSpeak: isArabic ? "افتح الميكروفون" : "Tap to Speak",
    tapToStop: isArabic ? "إيقاف الميكروفون" : "Tap to Stop",
    speechProfileTitle: isArabic ? "تكييف نمط الكلام والصوت" : "AI Voice Capture Profile",
    speechProfileSubtitle: isArabic ? "تخصيص الخوارزمية حسب طبيعة وصعوبة النطق لديك" : "Adapts Gemini's contextual decoding to your speech pattern",
    speechProfiles: {
      Standard: isArabic ? "صوت عادي (مستمع)" : "Ordinary/Standard Voice",
      Dysarthria: isArabic ? "صعوبة نطق / تداخل" : "Slurred / Dysarthria",
      Stutter: isArabic ? "تأتأة / تردد كلامي" : "Stutter / Syllables",
      Aphasia: isArabic ? "حبسة / فجوات لفظية" : "Aphasia / Word-Gaps",
      Kanevsky: isArabic ? "د. كانيفسكي (صوت أصم)" : "Dr. Dimitri Kanevsky (Severe Deaf-Dysarthria)"
    },
    speechProfileShort: {
      Standard: isArabic ? "عادي" : "Ordinary",
      Dysarthria: isArabic ? "صعوبة نطق" : "Dysarthria",
      Stutter: isArabic ? "تأتأة" : "Stutter",
      Aphasia: isArabic ? "حبسة كلامية" : "Aphasia",
      Kanevsky: isArabic ? "كانيفسكي" : "Kanevsky"
    },
    decodingSpeech: isArabic ? "جاري فك تشبير النطق المريض..." : "AI reconstructing speech pattern...",
    phoneticDetected: isArabic ? "النص الملتقط مجهرياً" : "Raw Phonetic Stream",
    vocalDeckTitle: isArabic ? "مساعد النطق والتحدث" : "Vocal Speech Assistant",
    aiSmartTitle: isArabic ? "الردود التفاعلية بالذكاء الاصطناعي" : "AI Smart Predictive Responses",
    aiSmartDesc: isArabic ? "ردود سريعة ذكية مولدة بناءً على ما يقال الآن" : "Context-aware replies generated live from what you hear",
    customInputPlaceholder: isArabic ? "اكتب هنا شيئاً لنطقه بالصوت أو عرضه..." : "Type custom sentence to speak, click Speak...",
    speakBtnText: isArabic ? "انطق بصوت" : "Speak Voice",
    showBigText: isArabic ? "تكبير الحجم" : "Show Massive",
    categories: {
      essentials: isArabic ? "أساسيات" : "Essentials",
      needs: isArabic ? "احتياجات" : "Needs",
      social: isArabic ? "تواصل واجتماع" : "Social",
      emergencies: isArabic ? "حالات طارئة" : "Emergencies",
      favorites: isArabic ? "مفضلتي" : "My Presets"
    },
    historyTitle: isArabic ? "العبارات الأخيرة" : "Speech History",
    noHistory: isArabic ? "لا توجد عبارات سابقة" : "No recent custom phrases",
    noReplies: isArabic ? "تحدث أولاً لرؤية الاقتراحات الذكية" : "No captions yet. Speak to generate AI predicted options"
  };

  // Safe Voice Synthesis Wrapper
  const speakText = (textToSpeak: string) => {
    if (!textToSpeak.trim()) return;
    try {
      window.speechSynthesis.cancel();
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = language;
        utterance.rate = speechRate;
        utterance.pitch = speechPitch;
        
        const voices = window.speechSynthesis.getVoices();
        // Look for exact locale match or general language prefix (e.g. 'ar' or 'en')
        const voice = voices.find(v => v.lang.startsWith(language.startsWith('ar') ? 'ar' : 'en'));
        if (voice) {
          utterance.voice = voice;
        }
        
        window.speechSynthesis.speak(utterance);
      }, 50);
    } catch (err) {
      console.error("Speech synthesis failure:", err);
    }
  };

  const handleCustomSpeak = (textToSpeak: string) => {
    if (!textToSpeak.trim()) return;
    speakText(textToSpeak);
    // Add to history
    setSpeechHistory(prev => {
      const filtered = prev.filter(item => item !== textToSpeak);
      return [textToSpeak, ...filtered].slice(0, 8); // Keep last 8 unique
    });
  };

  const handleAddCustomPreset = () => {
    if (!customText.trim()) return;
    const newPreset: SoundboardItem = {
      id: 'user_' + Date.now(),
      emoji: '⭐',
      textEn: customText,
      textAr: customText
    };
    setFavorites(prev => [...prev, newPreset]);
    setCustomText('');
  };

  const clearHistory = () => {
    setSpeechHistory([]);
  };

  const fetchSmartReplies = async (text: string) => {
    if (!text.trim() || text.length < 10) return;
    setIsGeneratingReplies(true);
    try {
      const suggestions = await geminiService.generateQuickReplies(text, language);
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        setAiSmartReplies(suggestions);
      }
    } catch (e) {
      console.error("Error generating quick replies:", e);
    } finally {
      setIsGeneratingReplies(false);
    }
  };

  // Save history & calibration configuration to localStorage
  useEffect(() => {
    localStorage.setItem('cognify_speech_history', JSON.stringify(speechHistory));
  }, [speechHistory]);

  useEffect(() => {
    localStorage.setItem('cognify_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('cognify_euphonia_patterns', JSON.stringify(euphoniaPatterns));
  }, [euphoniaPatterns]);

  useEffect(() => {
    localStorage.setItem('cognify_pause_threshold', String(pauseThreshold));
  }, [pauseThreshold]);

  useEffect(() => {
    localStorage.setItem('cognify_speech_rate', String(speechRate));
  }, [speechRate]);

  useEffect(() => {
    localStorage.setItem('cognify_speech_pitch', String(speechPitch));
  }, [speechPitch]);

  const copyToClipboard = () => {
    const textToCopy = enhancedText || transcript || interimTranscript;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 2000);
  };

  useEffect(() => {
    // Check for Browser Speech Recognition Support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not fully supported in this browser. Please use Google Chrome.");
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      startAudioLevelTracking();
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error);
      if (event.error === 'not-allowed') {
        setError("Microphone access denied. Enable permissions in the browser bar.");
      }
      setIsListening(false);
      stopAudioLevelTracking();
    };

    recognition.onend = () => {
      setIsListening(false);
      stopAudioLevelTracking();
    };

    recognition.onresult = (event: any) => {
      let finalStr = '';
      let interimStr = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalStr += text;
        } else {
          interimStr += text;
        }
      }

      if (finalStr) {
        setTranscript(prev => prev + ' ' + finalStr);
        setInterimTranscript('');
      } else {
        setInterimTranscript(interimStr);
      }

      // Live predictive responses updates of transcript quiet period
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = setTimeout(async () => {
        const fullText = (transcript + ' ' + interimStr).trim();
        if (fullText.length > 2) {
          if (speechProfile !== 'Standard') {
            handleDysarthriaCorrection(fullText);
          } else {
            handleEnhancement(fullText);
            fetchSmartReplies(fullText);
          }
        }
      }, pauseThreshold);
    };

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      stopAudioLevelTracking();
    };
  }, [language, transcript, speechProfile, pauseThreshold]);

  const startAudioLevelTracking = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const avg = sum / dataArray.length;
        setVolume(avg);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (e) {
      console.error("Audio visualizer tracking failed:", e);
    }
  };

  const stopAudioLevelTracking = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    setVolume(0);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Start microphone failed:", e);
      }
    }
  };

  const handleEnhancement = async (text: string) => {
    setIsEnhancing(true);
    try {
      const result = await geminiService.enhanceCaptions(text, language);
      setEnhancedText(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleDysarthriaCorrection = async (text: string) => {
    setIsDecodingSpeech(true);
    setOriginalGarbledText(text);

    // Fast, local client-side matching for trained soundboard triggers
    const cleanIn = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").trim();
    if (cleanIn.length > 1) {
      const matched = euphoniaPatterns.find(p => {
        const cleanP = p.phrase.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").trim();
        return cleanIn === cleanP || cleanIn.includes(cleanP) || cleanP.includes(cleanIn);
      });

      if (matched) {
        setEnhancedText(matched.translation);
        fetchSmartReplies(matched.translation);
        setIsDecodingSpeech(false);
        return;
      }
    }

    try {
      const result = await geminiService.decodeDysarthria(text, speechProfile, language, euphoniaPatterns);
      setEnhancedText(result);
      fetchSmartReplies(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDecodingSpeech(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-neutral-950 text-white flex flex-col lg:flex-row items-stretch overflow-hidden"
    >
      {/* LEFT COLUMN: Deep Live Captions Viewer */}
      <div className="flex-1 flex flex-col justify-between p-6 lg:p-8 relative bg-neutral-950 border-r border-white/5 order-1">
        {/* Caption Header */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-2 pb-4 border-b border-white/5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setIsDirectAudioMode(false);
                if (isListening) toggleListening();
                setEnhancedText('');
                setTranscript('');
                setAiSmartReplies([]);
              }}
              className={`text-[10px] md:text-[11px] font-black uppercase tracking-wider py-2 px-3 border rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                !isDirectAudioMode 
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' 
                  : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Continuous Captions
            </button>
            <button
              onClick={() => {
                setIsDirectAudioMode(true);
                if (isListening) {
                  if (recognitionRef.current) recognitionRef.current.stop();
                  setIsListening(false);
                }
                setEnhancedText('');
                setTranscript('');
                setAiSmartReplies([]);
              }}
              className={`text-[10px] md:text-[11px] font-black uppercase tracking-wider py-2 px-3 border rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                isDirectAudioMode 
                  ? 'border-purple-500/30 bg-purple-500/10 text-purple-400' 
                  : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Zap className="w-3.5 h-3.5 animate-pulse text-purple-400" />
              Project Euphonia Acoustic AI
            </button>
          </div>
          
          <div className="flex items-center justify-between sm:justify-end gap-3 flex-1 sm:flex-none">
            <div className="flex items-center gap-2.5">
              <div className={`w-2.5 h-2.5 rounded-full ${isListening || isRecordingDirectAudio ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">
                {isRecordingDirectAudio ? "Recording Raw Wave..." : (isListening ? t.listeningLive : t.standby)}
              </span>
            </div>
            
            <button 
              onClick={onClose}
              className="lg:hidden p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Caption Display Space */}
        <div className="my-auto py-12 max-w-2xl mx-auto text-center w-full">
          <AnimatePresence mode="wait">
            {enhancedText ? (
              <motion.div
                key="enhanced"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full mb-6">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-yellow-500">{t.aiSimplified}</span>
                </div>
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight bg-gradient-to-r from-white via-white to-neutral-400 bg-clip-text text-transparent">
                  "{enhancedText}"
                </h1>
                <div className="flex items-center justify-center gap-3 mt-8">
                  <button 
                    onClick={() => { setEnhancedText(''); setTranscript(''); setAiSmartReplies([]); }}
                    className="text-[11px] font-black uppercase tracking-wider text-white/30 hover:text-white border border-white/10 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-all"
                  >
                    {t.clearAll}
                  </button>
                  <button 
                    onClick={copyToClipboard}
                    className="text-[11px] font-black uppercase tracking-wider text-white/30 hover:text-white border border-white/10 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-all inline-flex items-center gap-1.5"
                  >
                    {copiedState ? <Check className="w-3.5 h-3.5 text-emerald-405 animate-pulse" /> : <Copy className="w-3.5 h-3.5 text-white/50" />}
                    {copiedState ? "Copied!" : "Copy Caption"}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={isDirectAudioMode ? "euphonia_mode" : "transcript_mode"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full flex flex-col gap-6"
              >
                {isDirectAudioMode ? (
                  <div className="max-w-md mx-auto bg-purple-950/25 border border-purple-500/15 p-6 rounded-2xl space-y-4 shadow-xl">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full mx-auto">
                      <Zap className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">Deep Learning Matcher</span>
                    </div>
                    <h3 className="text-base font-extrabold text-neutral-100 uppercase tracking-wider">Acoustic AI Decode</h3>
                    <p className="text-xs text-neutral-300 leading-normal">
                      Does standard speech-to-text ignore you or show silence? Project Euphonia bypasses standard word engines. Standard recordings are analyzed frame-by-frame by Gemini's deep hearing networks using your profile.
                    </p>
                    <div className="text-[11px] font-semibold text-neutral-300 py-2.5 px-3 bg-neutral-950 rounded-xl border border-white/5">
                      {isRecordingDirectAudio ? (
                        <span className="text-emerald-400 animate-pulse font-bold">
                          🎙️ Acoustic matching ACTIVE: Speak now ({directRecordingTime}s)
                        </span>
                      ) : "Press the Microphone below & speak your custom sounds."}
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-black leading-tight text-white/95 break-words">
                      {transcript}
                    </h1>
                    <h2 className="text-2xl md:text-4xl text-neutral-500 font-medium italic leading-relaxed">
                      {interimTranscript || (!transcript && t.waitingSpeech)}
                    </h2>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {isEnhancing && (
            <div className="flex items-center justify-center gap-2 text-yellow-500 mt-6">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest">{t.optimizing}</span>
            </div>
          )}

          {isDecodingSpeech && (
            <div className="flex flex-col items-center justify-center gap-2.5 text-purple-400 mt-6 bg-purple-500/5 border border-purple-500/10 p-4 rounded-2xl max-w-md mx-auto">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                <span className="text-[10px] font-black uppercase tracking-widest">{t.decodingSpeech}</span>
              </div>
              {originalGarbledText && (
                <p className="text-[11px] text-neutral-400 italic">
                  {t.phoneticDetected}: "{originalGarbledText}"
                </p>
              )}
            </div>
          )}
        </div>

        {/* Waveform / Visualizer & Call Trigger */}
        <div className="flex flex-col items-center gap-4 py-4 mt-auto">
          <div className="relative">
            {/* Audio Pulsing Waves (Deep Mode vs Continuous Mode) */}
            <AnimatePresence>
              {((isListening || isRecordingDirectAudio) && volume > 5) && (
                <>
                  <motion.div 
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 1 + (volume / 90), opacity: 0 }}
                    transition={{ duration: 0.45, repeat: Infinity }}
                    className={`absolute inset-0 rounded-full -z-10 ${isDirectAudioMode ? 'bg-purple-500/35' : 'bg-emerald-500/30'}`}
                  />
                  <motion.div 
                    initial={{ scale: 1, opacity: 0.3 }}
                    animate={{ scale: 1 + (volume / 50), opacity: 0 }}
                    transition={{ duration: 0.75, repeat: Infinity, delay: 0.15 }}
                    className={`absolute inset-0 rounded-full -z-20 ${isDirectAudioMode ? 'bg-purple-500/20' : 'bg-emerald-500/20'}`}
                  />
                </>
              )}
            </AnimatePresence>

            {isDirectAudioMode ? (
              <button
                onClick={isRecordingDirectAudio ? stopDirectAudioRecord : startDirectAudioRecord}
                className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all shadow-xl z-20 relative cursor-pointer ${
                  isRecordingDirectAudio 
                  ? 'bg-purple-600 hover:bg-purple-700 text-white scale-108 shadow-purple-500/40 ring-4 ring-purple-500/20' 
                  : 'bg-gradient-to-tr from-purple-500 to-indigo-600 text-white hover:from-purple-600 hover:to-indigo-750 hover:scale-103 shadow-purple-500/20'
                }`}
              >
                {isRecordingDirectAudio ? (
                  <span className="relative flex h-5 w-5 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                  </span>
                ) : (
                  <Zap className="w-7 md:w-8 h-7 md:h-8 text-white" />
                )}
              </button>
            ) : (
              <button
                onClick={toggleListening}
                className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all shadow-xl z-10 relative cursor-pointer ${
                  isListening 
                  ? 'bg-emerald-500 hover:bg-emerald-600 scale-105 shadow-emerald-500/40 text-black' 
                  : 'bg-white text-black hover:bg-neutral-100 hover:scale-102 shadow-white/10'
                }`}
              >
                {isListening ? <MicOff className="w-7 md:w-8 h-7 md:h-8" /> : <Mic className="w-7 md:w-8 h-7 md:h-8" />}
              </button>
            )}
          </div>
          
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/45">
            {isDirectAudioMode 
              ? (isRecordingDirectAudio ? `Tap to Stop & Decode (${directRecordingTime}s)` : "Tap for Multimodal Acoustic Decrypt")
              : (isListening ? t.tapToStop : t.tapToSpeak)
            }
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN: Premium Soundboard & Speech Assistant */}
      <div className="flex-1 lg:max-w-[480px] bg-neutral-900 border-l border-white/5 flex flex-col justify-between overflow-hidden order-2 relative">
        
        {/* Assistant Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-neutral-900/50 sticky top-0 backdrop-blur-md z-20">
          <div className="flex items-center gap-3">
            <Volume2 className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-sm font-bold text-white leading-none mb-1">{t.vocalDeckTitle}</h3>
              <p className="text-[11px] text-neutral-400 font-medium">{t.standby}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="hidden lg:flex p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable assistant sections */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* SECTION 1: Standard Custom Speech Input */}
          <div className="space-y-3 bg-neutral-950/40 p-4 rounded-2xl border border-white/5">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Custom Speech</span>
            </div>
            
            <div className="flex flex-col gap-2">
              <textarea 
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder={t.customInputPlaceholder}
                dir={isArabic ? "rtl" : "ltr"}
                className="w-full text-sm bg-neutral-950 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-primary/50 text-white placeholder-neutral-500 resize-none h-20"
              />
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {customText.trim() && (
                  <button 
                    onClick={() => setCustomText('')}
                    className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button 
                  onClick={handleAddCustomPreset}
                  disabled={!customText.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold text-purple-400 bg-purple-500/10 disabled:opacity-40 hover:bg-purple-500/20 px-3 py-2 rounded-lg transition-all border border-purple-500/15"
                  title="Bookmark phrase to My Presets"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Preset
                </button>
                <button 
                  onClick={() => setShowBigMode(true)}
                  disabled={!customText.trim()}
                  className="flex items-center gap-1.5 text-xs font-bold text-neutral-200 bg-neutral-800 disabled:opacity-40 hover:bg-neutral-750 px-3 py-2 rounded-lg transition-colors border border-white/5"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  {t.showBigText}
                </button>
                <button 
                  onClick={() => {
                    handleCustomSpeak(customText);
                    setCustomText('');
                  }}
                  disabled={!customText.trim()}
                  className="flex items-center gap-1.5 text-xs font-black text-black bg-white hover:bg-neutral-150 disabled:opacity-45 px-4 py-2 rounded-lg transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  {t.speakBtnText}
                </button>
              </div>
            </div>
          </div>

          {/* PROJECT EUPHONIA ACCOUSTIC TRAINING ACCORDION */}
          <div className="bg-neutral-950/40 p-4 rounded-2xl border border-purple-500/15 space-y-3 shadow-md shadow-purple-500/2">
            <button 
              onClick={() => setIsEuphoniaTrainingOpen(!isEuphoniaTrainingOpen)}
              className="flex items-center justify-between w-full hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Project Euphonia - AI Voice Training Deck</span>
              </div>
              <ChevronRight className={`w-4 h-4 text-neutral-400 transform transition-transform ${isEuphoniaTrainingOpen ? 'rotate-90' : ''}`} />
            </button>

            {isEuphoniaTrainingOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                className="space-y-4 pt-2 border-t border-white/5 overflow-hidden text-left"
              >
                <div className="bg-purple-500/5 rounded-xl p-3 border border-purple-500/10 text-[11px] text-neutral-300 leading-relaxed">
                  <strong className="text-purple-300 font-bold block mb-1">How it works:</strong>
                  Assign customized phonetic approximations (what standard dictation programs transcribed your atypical voice as) to your intended messages. Standard dictation transcriptions get translated immediately when detected!
                </div>

                <div className="space-y-2 p-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Train Custom Vocal Pattern</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">When ASR/Dictation Hears:</span>
                      <input 
                        type="text" 
                        placeholder="e.g. wa wa"
                        value={newSoundPattern}
                        onChange={(e) => setNewSoundPattern(e.target.value)}
                        className="w-full text-xs bg-neutral-950 border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-purple-500 placeholder-neutral-650"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block mb-1">What You Intend to Say:</span>
                      <input 
                        type="text" 
                        placeholder="e.g. Please give me some water"
                        value={newTranslation}
                        onChange={(e) => setNewTranslation(e.target.value)}
                        className="w-full text-xs bg-neutral-950 border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-purple-500 placeholder-neutral-650"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!newSoundPattern.trim() || !newTranslation.trim()) return;
                      const newPat: EuphoniaPattern = {
                        id: 'ep_' + Date.now(),
                        phrase: newSoundPattern.trim(),
                        translation: newTranslation.trim()
                      };
                      setEuphoniaPatterns(prev => [...prev, newPat]);
                      setNewSoundPattern('');
                      setNewTranslation('');
                    }}
                    disabled={!newSoundPattern.trim() || !newTranslation.trim()}
                    className="text-[11px] font-bold text-white bg-purple-600 disabled:opacity-40 hover:bg-purple-500 transition-colors py-2 px-3.5 rounded-lg w-full mt-1.5 flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/10 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Save Voice Mapping
                  </button>
                </div>

                {/* Trained items list */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-extrabold text-purple-400 tracking-wider">Trained Mappings ({euphoniaPatterns.length})</span>
                    {euphoniaPatterns.length > 0 && (
                      <button 
                        onClick={() => {
                          if (confirm("Reset and clear custom pattern dictionary?")) {
                            setEuphoniaPatterns([]);
                          }
                        }}
                        className="text-[9px] font-bold text-rose-400 hover:underline"
                      >
                        Reset Model
                      </button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
                    {euphoniaPatterns.map((pat) => (
                      <div key={pat.id} className="flex items-center justify-between bg-neutral-950/80 p-2.5 border border-white/5 rounded-xl group/pat hover:border-purple-500/20 transition-all">
                        <div className="text-[11px] leading-tight flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-purple-300 font-mono font-medium">"{pat.phrase}"</span>
                            <span className="text-neutral-400 text-[10px]">➜</span>
                            <span className="text-emerald-400 font-semibold">{pat.translation}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => setEuphoniaPatterns(prev => prev.filter(p => p.id !== pat.id))}
                          className="text-neutral-500 hover:text-rose-400 opacity-40 group-hover/pat:opacity-100 transition-opacity"
                          title="Remove training"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {euphoniaPatterns.length === 0 && (
                      <p className="text-[10px] text-neutral-500 italic text-center py-2">No custom patterns mapped yet.</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* ADVANCED ACCESSIBILITY SETTINGS ACCORDION */}
          <div className="bg-neutral-950/40 p-4 rounded-2xl border border-white/5 space-y-3">
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="flex items-center justify-between w-full hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Pronunciation & Capture Settings</span>
              </div>
              <ChevronRight className={`w-4 h-4 text-neutral-400 transform transition-transform ${isSettingsOpen ? 'rotate-90' : ''}`} />
            </button>

            {isSettingsOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                className="space-y-4 pt-2 border-t border-white/5 overflow-hidden"
              >
                {/* 1. Pause Timeout Slider */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-300 font-semibold">Speech Pause Threshold</span>
                    <span className="text-emerald-450 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px]">{ (pauseThreshold / 1000).toFixed(1) }s</span>
                  </div>
                  <input 
                    type="range"
                    min="1000"
                    max="6500"
                    step="500"
                    value={pauseThreshold}
                    onChange={(e) => setPauseThreshold(Number(e.target.value))}
                    className="w-full h-1 bg-neutral-850 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <p className="text-[10px] text-neutral-400 leading-normal">
                    Extend this time if you have blocks/stutters. It tells Gemini to wait longer before reconstructing your speech.
                  </p>
                </div>

                {/* 2. Audio Vocal deck Rate and Pitch settings */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-300">Speech Rate</span>
                      <span className="text-purple-400 font-mono text-[10px]">{speechRate.toFixed(1)}x</span>
                    </div>
                    <input 
                      type="range"
                      min="0.5"
                      max="1.8"
                      step="0.1"
                      value={speechRate}
                      onChange={(e) => setSpeechRate(Number(e.target.value))}
                      className="w-full h-1 bg-neutral-850 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-300">Voice Pitch</span>
                      <span className="text-purple-400 font-mono text-[10px]">{speechPitch.toFixed(1)}</span>
                    </div>
                    <input 
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.1"
                      value={speechPitch}
                      onChange={(e) => setSpeechPitch(Number(e.target.value))}
                      className="w-full h-1 bg-neutral-850 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* SECTION 2: AI Dynamic Predictive Responses */}
          <div className="space-y-3 bg-neutral-950/40 p-4 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">{t.aiSmartTitle}</span>
              </div>
              <button 
                onClick={() => fetchSmartReplies(transcript || "Hello")}
                disabled={isGeneratingReplies}
                className="p-1 px-2 text-[10px] uppercase font-black tracking-widest text-white/40 hover:text-white flex items-center gap-1 bg-white/5 rounded-md hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isGeneratingReplies ? 'animate-spin' : ''}`} />
                Regen
              </button>
            </div>
            <p className="text-[10px] text-neutral-400">{t.aiSmartDesc}</p>

            <div className="flex flex-col gap-2 min-h-12 pt-1">
              {isGeneratingReplies ? (
                <div className="flex items-center gap-2 justify-center py-4 text-xs text-neutral-400">
                  <RefreshCw className="w-3 h-3 animate-spin text-yellow-400" />
                  <span>Generating adaptive replies...</span>
                </div>
              ) : aiSmartReplies.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {aiSmartReplies.map((reply, idx) => (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleCustomSpeak(reply)}
                      className="text-left w-full p-2.5 rounded-xl bg-gradient-to-r from-yellow-500/10 to-yellow-500/5 hover:from-yellow-500/20 hover:to-yellow-500/10 border border-yellow-500/20 text-yellow-100 text-xs font-semibold transition-all flex items-center justify-between"
                    >
                      <span className="pr-2">{reply}</span>
                      <Volume2 className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-[11px] text-neutral-500 italic">
                  {t.noReplies}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: Category Preset Soundboard (Quick Sound deck) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Preset Decks</span>
              <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Tap to Speak</span>
            </div>

            {/* Quick Categories Navigation tabs */}
            <div className="flex flex-wrap gap-1 p-1 bg-neutral-950 rounded-xl border border-white/5">
              {(['essentials', 'needs', 'social', 'favorites', 'emergencies'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  className={`text-[10px] py-1.5 px-2.5 rounded-lg font-bold transition-all flex-1 text-center truncate ${
                    activeTab === cat 
                    ? 'bg-neutral-800 text-white shadow-md' 
                    : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {t.categories[cat]}
                </button>
              ))}
            </div>

            {/* SOUND GRID */}
            <div className="grid grid-cols-2 gap-2 min-h-[140px] pt-1">
              {((activeTab === 'favorites' ? favorites : SOUNDBOARD_DATA[activeTab as keyof typeof SOUNDBOARD_DATA]) || []).map((item) => {
                const phrase = isArabic ? item.textAr : item.textEn;
                const activeColor = activeTab === 'essentials' 
                  ? 'hover:border-blue-500/40 hover:bg-blue-500/10 text-neutral-100' 
                  : activeTab === 'needs'
                  ? 'hover:border-orange-500/40 hover:bg-orange-500/10 text-neutral-100'
                  : activeTab === 'social'
                  ? 'hover:border-green-500/40 hover:bg-green-500/10 text-neutral-100'
                  : activeTab === 'favorites'
                  ? 'hover:border-purple-500/40 hover:bg-purple-500/10 text-neutral-100 border-purple-500/10'
                  : 'hover:border-rose-500/40 hover:bg-rose-500/10 text-neutral-100';

                return (
                  <motion.div
                    key={item.id}
                    className="relative group w-full"
                  >
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => speakText(phrase)}
                      className={`w-full flex flex-col items-center justify-center p-3 text-center bg-neutral-950 hover:bg-neutral-950/80 border border-white/5 rounded-2xl transition-all cursor-pointer ${activeColor}`}
                    >
                      <span className="text-lg md:text-xl mb-1.5">{item.emoji}</span>
                      <span className="text-xs font-bold leading-tight line-clamp-1">{phrase}</span>
                    </motion.button>
                    {activeTab === 'favorites' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFavorites(prev => prev.filter(f => f.id !== item.id));
                        }}
                        className="absolute top-1 right-1 p-1 bg-rose-500/20 text-rose-455 hover:bg-rose-650 hover:text-white rounded-full transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-rose-500/30 scale-90"
                        title="Delete Preset"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
              {activeTab === 'favorites' && favorites.length === 0 && (
                <div className="col-span-2 text-center py-6 text-[11px] text-neutral-500 italic">
                  No custom presets yet. Type in Custom Speech above and click "+ Preset" to add common sentences here!
                </div>
              )}
            </div>
          </div>

          {/* SECTION 4: Recent History List */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-neutral-400">
                <History className="w-3.5 h-3.5" />
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">{t.historyTitle}</span>
              </div>
              {speechHistory.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="test-xs text-[10px] text-neutral-500 hover:text-rose-400 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {speechHistory.length > 0 ? (
                speechHistory.map((phrase, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ x: 2 }}
                    onClick={() => speakText(phrase)}
                    className="text-left w-full px-3 py-2 text-xs bg-neutral-950/30 hover:bg-neutral-950/70 border border-white/5 rounded-xl text-neutral-300 hover:text-white transition-all flex items-center justify-between"
                  >
                    <span className="truncate pr-4">{phrase}</span>
                    <Volume2 className="w-3.5 h-3.5 text-neutral-500" />
                  </motion.button>
                ))
              ) : (
                <div className="text-center py-4 text-[11px] text-neutral-500 italic bg-white/2 rounded-xl">
                  {t.noHistory}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Dynamic decorative branding/credits for aesthetic feel */}
        <div className="p-3 bg-neutral-950/20 border-t border-white/5 text-center flex items-center justify-center gap-1 text-[10px] text-neutral-500 italic">
          <span>{isArabic ? "مصمم بكل فخر للدمج والتمكين الرقمي" : "Designed for independence & communication enablement"}</span>
          <Heart className="w-2.5 h-2.5 text-rose-500/70 filled animate-pulse" />
        </div>
      </div>

      {/* FULL-SCREEN MASSIVE TYPEWRITER BOARD (Show Big text mode) */}
      <AnimatePresence>
        {showBigMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-neutral-950 flex flex-col justify-between p-8"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-yellow-500 tracking-widest bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 rounded-full">
                {isArabic ? "لوحة الاتصال المباشرة" : "Visual Communication Board"}
              </span>
              <button
                onClick={() => setShowBigMode(false)}
                className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center text-center max-w-5xl mx-auto py-12 px-4">
              <h1 
                dir={isArabic ? "rtl" : "ltr"}
                className="text-4xl md:text-6xl lg:text-8xl font-black font-sans leading-relaxed tracking-tight text-white select-none whitespace-pre-wrap break-words"
              >
                {customText}
              </h1>
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => speakText(customText)}
                className="flex items-center gap-2 px-6 py-3 bg-white text-black font-black uppercase text-xs tracking-widest rounded-full hover:bg-neutral-100 shadow-2xl transition-all"
              >
                <Volume2 className="w-4 h-4" />
                {t.speakBtnText}
              </button>
              <button
                onClick={() => setShowBigMode(false)}
                className="px-6 py-3 bg-neutral-800 text-white font-black uppercase text-xs tracking-widest rounded-full hover:bg-neutral-750 transition-colors"
              >
                Close View
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
