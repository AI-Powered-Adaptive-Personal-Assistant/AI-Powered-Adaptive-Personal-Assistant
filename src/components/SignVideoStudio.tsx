import { useState, useEffect, useRef } from "react";
import { UserProfile } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Square, Play, RefreshCw, Menu, Download, FileText, Settings, Video, Sparkles, Brain } from "lucide-react";
import SignAvatar3D from "./SignAvatar3D";

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
  const [is3DActive, setIs3DActive] = useState(true); // real 3D engine is now the default
  const prevInputRef = useRef("");
  const recognitionRef = useRef<any>(null);

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
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = profile.language === 'Arabic' ? 'ar-SA' : profile.language === 'Egyptian Ammiya' ? 'ar-EG' : 'en-US';

      recognition.onresult = (event: any) => {
        let fullTranscript = "";
        for (let i = 0; i < event.results.length; ++i) {
             fullTranscript += event.results[i][0].transcript;
        }
        setInputText(fullTranscript);
      };

      recognition.onerror = () => { setIsRecording(false); };
      recognition.onend = () => { setIsRecording(false); };

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

  const generateVideo = () => {
    if (!inputText.trim()) return;
    setIsGenerating(true);
    setTimeout(() => {
      const words = inputText.trim().split(/\s+/).filter(Boolean);
      setSequence(words);
      setIsGenerating(false);
      setPlaybackProgress(0);
      setIsPlaying(true);
    }, 600);
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
    <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden h-full">
      {!isEmbedded && (
        <header className="p-6 md:p-10 shrink-0 flex items-center justify-between z-10 relative bg-white border-b border-slate-200">
           <div className="flex items-center gap-4">
             <button
              onClick={onMenuClick}
              className="lg:hidden p-2 text-slate-500 bg-white shadow-sm border border-slate-200 hover:bg-slate-50 rounded-lg active:scale-95"
            >
              <Menu className="w-6 h-6" />
            </button>
             <div>
               <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                 Sign Video Studio
                 <div className="px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-bold uppercase tracking-widest border border-primary/20">Beta</div>
               </h1>
               <p className="text-sm text-slate-500 font-medium mt-1">Generate AI Sign Language videos from speech or text input.</p>
             </div>
           </div>

           <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                <div className={`w-2 h-2 rounded-full ${is3DActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">3D Avatar Engine</span>
              </div>
           </div>
        </header>
      )}

      <div className="bg-indigo-600/10 border-b border-indigo-600/20 text-indigo-700 text-[10px] sm:text-xs font-mono py-2 px-4 text-center flex justify-center items-center gap-2 z-20 relative w-full font-bold">
         <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse drop-shadow-md" />
         FINGERSPELLING ENGINE (A–Z, 0–9, ARABIC MAPPING) + WORD GESTURES — RENDERED IN REAL-TIME WEBGL.
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 z-10 relative flex flex-col items-center">
         <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">

            {/* Input Section */}
            <div className="flex flex-col gap-6 w-full h-full">
               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                     <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                       <FileText className="w-5 h-5 text-primary" />
                       Script Input
                     </h2>
                  </div>

                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Type or dictate the script you want to convert to sign language video..."
                    className="flex-1 w-full p-4 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-700"
                  />

                  <div className="mt-4 flex flex-col sm:flex-row gap-3">
                     {isRecording ? (
                        <button
                          onClick={stopRecording}
                          className="flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 active:scale-95 transform transition-all text-white font-medium rounded-xl shadow-lg shadow-red-500/20"
                        >
                           <Square className="w-5 h-5 fill-current" />
                           Stop Recording
                        </button>
                     ) : (
                        <button
                          onClick={startRecording}
                          className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 transform transition-all text-slate-700 font-medium rounded-xl shadow-sm"
                        >
                           <Mic className="w-5 h-5 text-red-500" />
                           Record Speech
                        </button>
                     )}

                     <button
                       onClick={generateVideo}
                       disabled={!inputText.trim() || isGenerating}
                       className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-blue-700 disabled:opacity-50 disabled:active:scale-100 active:scale-95 transform transition-all text-white font-bold rounded-xl shadow-lg shadow-primary/20"
                     >
                        {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
                        {isGenerating ? 'Rendering Video...' : 'Generate Video'}
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
                      <Sparkles className={`w-3 h-3 ${is3DActive ? 'text-emerald-400' : 'text-amber-400'}`} />
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
                          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest bg-black/40 backdrop-blur-md inline-block px-4 py-2 rounded-xl border border-white/5">
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
                        <Video className="w-16 h-16 text-slate-700 mb-4" />
                        <p className="text-slate-400 font-medium max-w-[250px]">Enter your script and generate to see the AI sign language video.</p>
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
                       className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white hover:bg-blue-600 disabled:opacity-50 disabled:scale-100 active:scale-95 transition-all shadow-lg"
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
                     <div className="text-xs font-mono text-slate-400 font-medium w-12 text-right">
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
