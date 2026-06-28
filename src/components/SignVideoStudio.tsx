import { localize } from '../lib/translations';
import { useState, useEffect, useRef } from "react";
import { UserProfile } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Square, Play, RefreshCw, Menu, Download, FileText, Settings, Video, Sparkles, Brain, Zap, Activity } from "lucide-react";
import SignAvatar3D from "./SignAvatar3D";
import { geminiService } from "../services/geminiService";

interface SignVideoStudioProps {
  profile: UserProfile;
  onMenuClick: () => void;
  isEmbedded?: boolean;
}

export default function SignVideoStudio({ profile, onMenuClick, isEmbedded }: SignVideoStudioProps) {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [sequence, setSequence] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [is3DActive, setIs3DActive] = useState(true); // real 3D engine is now the default
  const prevInputRef = useRef("");
  const recognitionRef = useRef<any>(null);

  // Advanced speech impairment states for project integrations
  const [speechProfile, setSpeechProfile] = useState<string>('Multilingual');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [euphoniaPatterns, setEuphoniaPatterns] = useState<Array<{ id: string; phrase: string; translation: string }>>([]);

  const [isDirectAudioMode, setIsDirectAudioMode] = useState(false);
  const [isRecordingDirectAudio, setIsRecordingDirectAudio] = useState(false);
  const [directRecordingTime, setDirectRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const KANEVSKY_PRESETS = [
    { id: 'ep_k1', phrase: "fanku", translation: "Thank you" },
    { id: 'ep_k2', phrase: "tanku", translation: "Thank you" },
    { id: 'ep_k3', phrase: "goo gu", translation: "Google" },
    { id: 'ep_k4', phrase: "com pu ta", translation: "Computer" },
    { id: 'ep_k5', phrase: "dee mee tree", translation: "Dimitri" },
    { id: 'ep_k6', phrase: "ree shuch", translation: "Research" },
    { id: 'ep_k7', phrase: "ha ha u", translation: "How are you?" },
    { id: 'ep_k8', phrase: "peech", translation: "Speech" },
    { id: 'ep_k9', phrase: "rec ni shun", translation: "Recognition" }
  ];

  const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  
  const t = {
    scriptInput: localize(profile.language, "Script Input", "مدخلات النص"),
    placeholder: localize(profile.language, "Type or dictate the script you want to convert to sign language video...", "اكتب أو تمتم النص الذي تريد تحويله إلى لغة الإشارة..."),
    recordSpeech: localize(profile.language, "Record Speech", "تسجيل الصوت"),
    rawRecordingHint: localize(profile.language, "Direct Acoustic AI (Euphonia)", "التقاط وتدقيق الصوت المباشر"),
    stopRecording: localize(profile.language, "Stop Recording", "إيقاف التسجيل"),
    generating: localize(profile.language, "Rendering Video...", "جاري معالجة الفيديو..."),
    generate: localize(profile.language, "Generate Video", "إنتاج الفيديو"),
    decodingSpeech: localize(profile.language, "AI reconstructing speech pattern...", "جاري فك تشفيرة النطق بـ AI..."),
    optimizingText: localize(profile.language, "AI optimizing sign concepts...", "جاري تحسين لغة الإشارة وإزالة الزوائد..."),
    speechProfileTitle: localize(profile.language, "Adaptive Vocal Speech Profile", "معايرة النطق والأصوات للمتحدث"),
    standard: localize(profile.language, "Standard", "عادي"),
    dysarthria: localize(profile.language, "Dysarthria", "صعوبة نطق"),
    stutter: localize(profile.language, "Stutter", "تأتأة"),
    aphasia: localize(profile.language, "Aphasia", "حبسة كلامية"),
    kanevsky: localize(profile.language, "Dr. Dimitri Kanevsky (Severe Deaf-Dysarthria)", "د. ديمتري كانيفسكي (صوت أصم)"),
    askAI: localize(profile.language, "Ask AI (Get Answer)", "اسأل الذكاء الاصطناعي"),
    aiResult: localize(profile.language, "AI Answer / Result", "نتيجة الإجابة (AI Answer)"),
    useAnswer: localize(profile.language, "Sign Answer", "عرض بلغة الإشارة"),
    asking: localize(profile.language, "AI thinking...", "جاري التفكير والتوليد...")
  };

  useEffect(() => {
    const saved = localStorage.getItem('cognify_euphonia_patterns');
    if (saved) {
      try {
        setEuphoniaPatterns(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  useEffect(() => {
    // Auto-translate feature when typing or speaking
    const timer = setTimeout(() => {
      if (inputText.trim() !== prevInputRef.current) {
        prevInputRef.current = inputText.trim();
        if (inputText.trim()) {
          const words = inputText.trim().split(/\s+/).filter(Boolean);
          setSequence(words);
          setPlaybackProgress(0);
          setIsPlaying(true);
        } else {
          setSequence([]);
          setIsPlaying(false);
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [inputText]);

  // Setup exact same getHandPose as overlay (used by the 2D fallback mode)
  const getHandPose = (word: string, side: 'left' | 'right') => {
    const w = word.toLowerCase();

    if (w.length === 1 && /^[a-z]$/.test(w)) {
        const charCode = w.charCodeAt(0) - 97;
        const xOffset = (charCode % 5) * 8;
        const yOffset = (charCode % 3) * 15 - 20;
        const rotateOffset = (charCode % 7) * 15 - 45;

        return {
          x: side === 'left' ? xOffset : -xOffset,
          y: yOffset + 25,
          rotate: side === 'left' ? rotateOffset : -rotateOffset,
          scale: 0.85 + (charCode % 3) * 0.1,
          opacity: 0.95,
          transition: { type: "spring", stiffness: 200, damping: 20 }
        };
    }

    if (['hello', 'hi', 'hey', 'مرحبا', 'اهلا', 'سلام'].some(g => w.includes(g))) {
        return side === 'left'
          ? { x: 60, y: -80, rotate: 90, scale: 1.4, opacity: 1, transition: { type: "spring", stiffness: 150, damping: 12 } }
          : { x: -15, y: 20, rotate: 10, scale: 0.9, opacity: 0.8 };
    }
    if (['thank', 'shukran', 'شكرا', 'تقدير', 'love'].some(g => w.includes(g))) {
        return { y: [0, 60, 0], x: side === 'left' ? 25 : -25, scale: [1, 1.3, 1], rotate: side === 'left' ? -35 : 35, transition: { duration: 0.6, ease: "easeInOut" } };
    }
    if (['think', 'know', 'brain', 'mind', 'cognify', 'عقل', 'فكر', 'اعرف', 'ذكاء', 'ai'].some(g => w.includes(g))) {
        return side === 'left'
          ? { y: -100, x: 35, rotate: 120, scale: 1.2, opacity: 1, transition: { type: "spring", stiffness: 100, damping: 10 } }
          : { y: -30, x: -20, rotate: -25, scale: 0.8, opacity: 0.6 };
    }
    if (['help', 'support', 'assist', 'مساعدة', 'عون', 'please'].some(g => w.includes(g))) {
        return { y: [40, 60, 40], x: side === 'left' ? 60 : -60, rotate: side === 'left' ? 20 : -20, scale: [1.3, 1.4, 1.3], opacity: 1, transition: { repeat: Infinity, duration: 1.2, ease: "linear" } };
    }
    if (['what', 'where', 'how', 'why', 'who', 'ماذا', 'اين', 'كيف', 'لماذا', 'من', '؟'].some(q => w.includes(q))) {
        return { x: side === 'left' ? -75 : 75, y: -40, scale: 1.4, rotate: side === 'left' ? [-60, -45, -60] : [60, 45, 60], transition: { repeat: Infinity, duration: 0.4 } };
    }
    if (['yes', 'ok', 'حق', 'نعم', 'حاضر', 'صحيح', 'تمام'].some(x => w.includes(x))) {
        return { y: [0, 45, 0, 45, 0], scale: 1.35, rotate: side === 'left' ? -15 : 15, transition: { duration: 0.5, ease: "easeOut" } };
    }
    if (['no', 'not', 'never', 'don', 'لا', 'كلا', 'ليس'].some(x => w.includes(x))) {
        return { x: side === 'left' ? [-60, 0, -60] : [60, 0, 60], rotate: side === 'left' ? -50 : 50, scale: 0.85, transition: { duration: 0.35, repeat: 1 } };
    }

    const hash = w.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const complexRotate = hash % 60 - 30;
    const complexY = hash % 50 - 25;

    return side === 'left'
      ? { x: [-30, 35, -15, 0], y: [0, complexY - 50, 30, 0], rotate: [-35, complexRotate + 50, -65, -35], scale: [1, 1.3, 0.85, 1], transition: { duration: 0.6 } }
      : { x: [30, -35, 15, 0], y: [0, complexY + 50, -30, 0], rotate: [35, -complexRotate - 50, 65, 35], scale: [1, 1.3, 0.85, 1], transition: { duration: 0.6 } };
  };

  const startRecording = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = profile.language === 'Arabic' ? 'ar-SA' : profile.language === 'Egyptian Ammiya' ? 'ar-EG' : 'en-US';

      let latestTranscript = "";

      recognition.onresult = (event: any) => {
        let fullTranscript = "";
        for (let i = 0; i < event.results.length; ++i) {
             fullTranscript += event.results[i][0].transcript;
        }
        latestTranscript = fullTranscript;
        setInputText(fullTranscript);
      };

      recognition.onerror = () => { setIsRecording(false); };
      recognition.onend = async () => {
        setIsRecording(false);
        if (latestTranscript.trim()) {
          setIsEnhancing(true);
          try {
            const enhanced = await geminiService.decodeDysarthria(
              latestTranscript, 
              'Multilingual', 
              profile.language || 'English', 
              euphoniaPatterns
            );
            if (enhanced) {
              setInputText(enhanced);
            }
          } catch (e) {
            console.error("ASR rehabilitation failed:", e);
          } finally {
            setIsEnhancing(false);
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } else {
      alert("Speech recognition is not supported in this browser.");
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const startDirectAudioRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const base64Clean = base64data.split(',')[1];
          setIsEnhancing(true);
          try {
            const decoded = await geminiService.decodeEuphoniaAudio(
              base64Clean,
              'Multilingual',
              profile.language || 'English',
              euphoniaPatterns,
              'audio/webm'
            );
            if (decoded) {
              setInputText(decoded);
            }
          } catch (err) {
            console.error("Acoustic decode failed:", err);
          } finally {
            setIsEnhancing(false);
          }
        };
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecordingDirectAudio(true);
      setDirectRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setDirectRecordingTime((prev) => {
          if (prev >= 12) {
            stopDirectAudioRecord();
            return 12;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (e) {
      console.error(e);
      alert("Microphone connection failed.");
    }
  };

  const stopDirectAudioRecord = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingDirectAudio(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const generateVideo = async () => {
    if (!inputText.trim()) return;
    setIsGenerating(true);
    try {
      // Intelligently optimize script into fluid sign concepts (Sign GLOSS tokens) via Gemini
      const optimizedScript = await geminiService.optimizeSignScript(
        inputText, 
        profile.language || 'English'
      );
      const splitWords = (optimizedScript || inputText).trim().split(/\s+/).filter(Boolean);
      setSequence(splitWords);
      setPlaybackProgress(0);
      setIsPlaying(true);
    } catch (e) {
      console.error("Gemini optimization failed, using standard words:", e);
      const words = inputText.trim().split(/\s+/).filter(Boolean);
      setSequence(words);
      setPlaybackProgress(0);
      setIsPlaying(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAskAI = async () => {
    if (!inputText.trim()) return;
    setIsAnswering(true);
    setAiResponse("");
    try {
      const language = localize(profile.language, "English", "Arabic");
      const answer = await geminiService.askGeneralQuestion(inputText, language);
      setAiResponse(answer);
    } catch (e) {
      console.error("Failed to ask general question:", e);
      setAiResponse(localize(profile.language, "Failed to connect to AI for answering.", "حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.")
      );
    } finally {
      setIsAnswering(false);
    }
  };

  // 2D fallback timeline only — in 3D mode the avatar drives progress itself
  useEffect(() => {
    if (is3DActive) return;
    let playInterval: any;
    if (isPlaying && sequence.length > 0) {
      playInterval = setInterval(() => {
        setPlaybackProgress((prev) => {
          if (prev >= sequence.length - 1) {
            clearInterval(playInterval);
            setIsPlaying(false);
            return sequence.length;
          }
          return prev + 1;
        });
      }, 1000);
    }

    return () => {
        if (playInterval) clearInterval(playInterval);
    };
  }, [isPlaying, sequence, is3DActive]);

  const activeWord = playbackProgress < sequence.length ? sequence[playbackProgress] : '';

  return (
    <div className="flex-1 flex flex-col bg-surface-2 relative overflow-hidden h-full">
      {!isEmbedded && (
        <header className="p-6 md:p-10 shrink-0 flex items-center justify-between z-10 relative bg-white border-b border-border">
           <div className="flex items-center gap-4">
             <button
              onClick={onMenuClick}
              className="lg:hidden p-2 text-text-muted bg-white shadow-sm border border-border hover:bg-surface-2 rounded-lg active:scale-95"
            >
              <Menu className="w-6 h-6" />
            </button>
             <div>
               <h1 className="text-3xl font-bold tracking-tight text-text-main flex items-center gap-3">
                 Sign Video Studio
                 <div className="px-2 py-1 bg-primary-soft text-primary rounded-md text-xs font-bold uppercase tracking-widest border border-primary/20">Beta</div>
               </h1>
               <p className="text-sm text-text-muted font-medium mt-1">Generate AI Sign Language videos from speech or text input.</p>
             </div>
           </div>

           <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-2 bg-surface-3 px-3 py-1.5 rounded-full border border-border">
                <div className={`w-2 h-2 rounded-full ${is3DActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">3D Avatar Engine</span>
              </div>
           </div>
        </header>
      )}

      <div className="bg-primary/10 border-b border-indigo-600/20 text-primary text-[10px] sm:text-xs font-mono py-2 px-4 text-center flex justify-center items-center gap-2 z-20 relative w-full font-bold">
         <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse drop-shadow-md" />
         FINGERSPELLING ENGINE (A–Z, 0–9, ARABIC MAPPING) + WORD GESTURES — RENDERED IN REAL-TIME WEBGL.
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 z-10 relative flex flex-col items-center">
         <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">

            {/* Input Section */}
            <div className="flex flex-col gap-6 w-full h-full">
               <div className="bg-white rounded-2xl shadow-sm border border-border p-6 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                     <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                       <FileText className="w-5 h-5 text-primary" />
                       {t.scriptInput}
                     </h2>

                     {/* Audio recording mode toggle: Continuous ASR vs Raw Acoustic AI */}
                     <button
                       onClick={() => {
                         setIsDirectAudioMode(!isDirectAudioMode);
                         if (isRecording) stopRecording();
                         if (isRecordingDirectAudio) stopDirectAudioRecord();
                       }}
                       className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${
                         isDirectAudioMode
                           ? 'bg-purple-100 text-accent border-border'
                           : 'bg-surface-3 text-text-muted border-border hover:bg-surface-3'
                       }`}
                     >
                        <Zap className="w-3.5 h-3.5 text-current" />
                        {isDirectAudioMode ? (localize(profile.language, "Acoustic Decrypt", "فك التشفير المباشر")) : (localize(profile.language, "ASR Dictate", "إملاء مستمر"))}
                     </button>
                  </div>

                  <div className="relative flex-1 min-h-[160px] flex flex-col">
                     <textarea
                       value={inputText}
                       onChange={(e) => setInputText(e.target.value)}
                       placeholder={t.placeholder}
                       className="flex-1 w-full p-4 bg-surface-2 border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-text-main font-medium"
                       disabled={isEnhancing}
                     />
                     <AnimatePresence>
                        {isEnhancing && (
                           <motion.div 
                             initial={{ opacity: 0 }}
                             animate={{ opacity: 1 }}
                             exit={{ opacity: 0 }}
                             className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 z-30"
                           >
                              <Activity className="w-8 h-8 text-primary animate-pulse" />
                              <span className="text-xs font-bold text-text-muted animate-bounce">{t.decodingSpeech}</span>
                           </motion.div>
                        )}
                     </AnimatePresence>
                  </div>

                  {/* AI Answer / Result Output Box */}
                  {(aiResponse || isAnswering) && (
                    <motion.div 
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-4 rounded-xl bg-gradient-to-br from-primary/70 to-slate-100/50 border border-border shadow-sm flex flex-col gap-2.5"
                    >
                       <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-primary flex items-center gap-1.5 uppercase tracking-wider">
                             <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" />
                             {t.aiResult}
                          </span>
                       </div>
                       <div className="text-sm text-text-main font-semibold leading-relaxed min-h-[50px] bg-white p-3.5 rounded-lg border border-border shadow-sm">
                          {isAnswering ? (
                            <div className="flex items-center gap-2 text-text-muted text-xs font-bold">
                              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                              {t.asking}
                            </div>
                          ) : (
                            <div>
                              <p className="mb-2 text-text-main leading-relaxed font-semibold">{aiResponse}</p>
                              <div className="flex gap-2 justify-end mt-2">
                                <button
                                  onClick={() => {
                                    setInputText(aiResponse);
                                    // Trigger signing immediately
                                    const words = aiResponse.trim().split(/\s+/).filter(Boolean);
                                    setSequence(words);
                                    setPlaybackProgress(0);
                                    setIsPlaying(true);
                                  }}
                                  className="text-[10px] font-black text-white bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary-press px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-md hover:shadow-indigo-500/20 active:scale-95"
                                >
                                  <Play className="w-3 h-3 fill-current text-white" />
                                  {t.useAnswer}
                                </button>
                              </div>
                            </div>
                          )}
                       </div>
                    </motion.div>
                  )}

                  <div className="mt-4 flex flex-col sm:flex-row gap-3">
                     {isDirectAudioMode ? (
                        isRecordingDirectAudio ? (
                           <button
                             onClick={stopDirectAudioRecord}
                             className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 active:scale-95 transform transition-all text-white font-bold rounded-xl shadow-lg shadow-purple-500/20"
                           >
                              <span className="relative flex h-3 w-3 mr-1">
                                 <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                                 <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                              </span>
                              {isArabic ? `إيقاف وتسجيل (${directRecordingTime}ث)` : `Stop & Decode (${directRecordingTime}s)`}
                           </button>
                        ) : (
                           <button
                             onClick={startDirectAudioRecord}
                             className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-tr from-purple-500 to-primary hover:from-purple-600 hover:to-primary-press active:scale-95 transform transition-all text-white font-bold rounded-xl shadow-lg shadow-purple-500/20"
                           >
                              <Zap className="w-5 h-5 text-white animate-pulse" />
                              {localize(profile.language, "Acoustic AI Record", "التقاط صوت مجهري (Acoustic)")}
                           </button>
                        )
                     ) : (
                        isRecording ? (
                           <button
                             onClick={stopRecording}
                             className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 active:scale-95 transform transition-all text-white font-medium rounded-xl shadow-lg shadow-red-500/20"
                           >
                              <Square className="w-5 h-5 fill-current" />
                              {t.stopRecording}
                           </button>
                        ) : (
                           <button
                             onClick={startRecording}
                             className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white border border-border hover:bg-surface-2 active:scale-95 transform transition-all text-text-main font-medium rounded-xl shadow-sm"
                           >
                              <Mic className="w-5 h-5 text-red-500" />
                              {t.recordSpeech}
                           </button>
                        )
                     )}

                     {/* Ask AI Button to get answer result output */}
                     <button
                       onClick={handleAskAI}
                       disabled={!inputText.trim() || isAnswering || isGenerating || isEnhancing}
                       className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-tr from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:active:scale-100 active:scale-95 transform transition-all text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20"
                     >
                        {isAnswering ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Brain className="w-5 h-5 text-white" />}
                        {isAnswering ? t.asking : t.askAI}
                     </button>

                     <button
                       onClick={generateVideo}
                       disabled={!inputText.trim() || isGenerating || isEnhancing || isAnswering}
                       className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary-press disabled:opacity-50 disabled:active:scale-100 active:scale-95 transform transition-all text-white font-bold rounded-xl shadow-lg shadow-primary/20"
                     >
                        {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
                        {isGenerating ? t.generating : t.generate}
                     </button>
                  </div>
               </div>
            </div>

            {/* Output Section */}
            <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 p-2 flex flex-col relative overflow-hidden h-[500px] lg:h-full min-h-[500px]">
               {/* Player Header */}
               <div className="absolute top-4 left-6 right-6 z-40 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                     <span className="text-xs font-black uppercase tracking-widest text-white/80 drop-shadow-md">LIVE PREVIEW</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIs3DActive(!is3DActive)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                        is3DActive
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                          : 'bg-black/40 text-white/40 border-white/10 hover:text-white hover:border-white/30'
                      }`}
                    >
                      <Sparkles className={`w-3 h-3 ${is3DActive ? 'text-emerald-400' : 'text-accent'}`} />
                      {is3DActive ? '3D Avatar' : '2D Mode'}
                    </button>
                    <button className="text-white/50 hover:text-white transition-colors bg-black/40 p-2 rounded-lg backdrop-blur-md">
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
               </div>

               {/* Video Area */}
               <div className="flex-1 relative flex items-center justify-center rounded-2xl overflow-hidden bg-slate-950">
                  {is3DActive ? (
                    <>
                      <div className="absolute inset-0 z-10">
                        <SignAvatar3D
                          words={sequence}
                          playing={isPlaying}
                          onProgress={(i) => setPlaybackProgress(i)}
                          onDone={() => {
                            setIsPlaying(false);
                            setPlaybackProgress(sequence.length);
                          }}
                        />
                      </div>

                      {sequence.length === 0 && (
                        <div className="absolute inset-x-0 bottom-28 text-center z-30 px-8 pointer-events-none">
                          <p className="text-faint text-xs font-bold uppercase tracking-widest bg-black/40 backdrop-blur-md inline-block px-4 py-2 rounded-xl border border-white/5">
                            Type a script to start signing
                          </p>
                        </div>
                      )}

                      {/* Subtitles Overlay */}
                      {sequence.length > 0 && (
                        <div className="absolute bottom-16 left-0 right-0 text-center z-30 px-8 pointer-events-none">
                           <span className="inline-block px-4 py-2 bg-black/60 backdrop-blur-md rounded-xl text-2xl font-black text-white uppercase tracking-widest border border-white/10 shadow-xl">
                              {activeWord || "—"}
                           </span>
                        </div>
                      )}
                    </>
                  ) : sequence.length === 0 ? (
                     <div className="text-center p-8 z-10 flex flex-col items-center">
                        <Video className="w-16 h-16 text-text-main mb-4" />
                        <p className="text-faint font-medium max-w-[250px]">Enter your script and generate to see the AI sign language video.</p>
                     </div>
                  ) : (
                     <>
                        <motion.div
                          className="w-full h-full relative z-10 flex flex-col items-center justify-end overflow-hidden"
                          animate={{
                             filter: isPlaying ? "contrast(1.05) saturate(1.15)" : "contrast(1) saturate(1)"
                          }}
                        >
                           <img
                             src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=600&h=800"
                             alt="AI Avatar"
                             className="absolute inset-0 w-full h-full object-cover object-top opacity-30 brightness-50 mix-blend-luminosity"
                           />

                           <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                             <motion.img
                               drag
                               dragConstraints={{ left: -150, right: 150, top: -300, bottom: 100 }}
                               dragElastic={0.2}
                               src="https://img.icons8.com/fluency/144/hand.png"
                               animate={(isPlaying ? getHandPose(activeWord || '', 'left') : { x: 0, y: 100, rotate: -20, opacity: 0.3, scale: 0.8 }) as any}
                               className="absolute bottom-1/4 left-[15%] w-48 h-48 drop-shadow-[0_20px_20px_rgba(59,130,246,0.5)] pointer-events-auto cursor-grab active:cursor-grabbing"
                               style={{ transform: 'scaleX(-1)' }}
                             />
                             <motion.img
                               drag
                               dragConstraints={{ left: -150, right: 150, top: -300, bottom: 100 }}
                               dragElastic={0.2}
                               src="https://img.icons8.com/fluency/144/hand.png"
                               animate={(isPlaying ? getHandPose(activeWord || '', 'right') : { x: 0, y: 100, rotate: 20, opacity: 0.3, scale: 0.8 }) as any}
                               className="absolute bottom-1/4 right-[15%] w-48 h-48 drop-shadow-[0_20px_20px_rgba(59,130,246,0.5)] pointer-events-auto cursor-grab active:cursor-grabbing"
                             />
                           </div>
                        </motion.div>

                        {/* Subtitles Overlay */}
                        <div className="absolute bottom-20 left-0 right-0 text-center z-30 px-8">
                           <span className="inline-block px-4 py-2 bg-black/60 backdrop-blur-md rounded-xl text-2xl font-black text-white uppercase tracking-widest border border-white/10 shadow-xl">
                              {activeWord || "—"}
                           </span>
                        </div>
                     </>
                  )}
               </div>

               {/* Player Controls Timeline */}
               <div className="mt-2 p-4 bg-slate-900/50 rounded-xl relative z-30">
                  <div className="flex items-center gap-4">
                     <button
                       onClick={() => {
                         if (sequence.length > 0) {
                            if (isPlaying) {
                              setIsPlaying(false);
                            } else {
                              if (playbackProgress >= sequence.length) setPlaybackProgress(0);
                              setIsPlaying(true);
                            }
                         }
                       }}
                       disabled={sequence.length === 0}
                       className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white hover:bg-primary disabled:opacity-50 disabled:scale-100 active:scale-95 transition-all shadow-lg"
                     >
                        {isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-5 h-5 ml-1 fill-current" />}
                     </button>

                     <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden relative border border-slate-700/50 cursor-pointer">
                        <motion.div
                          className="absolute top-0 bottom-0 left-0 bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: sequence.length > 0 ? `${(playbackProgress / Math.max(1, sequence.length)) * 100}%` : '0%' }}
                          transition={{ duration: 0.2 }}
                        />
                     </div>
                     <div className="text-xs font-mono text-faint font-medium w-12 text-right">
                       {String(Math.min(playbackProgress, 99)).padStart(2, '0')}/{String(Math.min(sequence.length, 99)).padStart(2, '0')}
                     </div>
                  </div>
               </div>
            </div>

         </div>
      </div>
    </div>
  );
}