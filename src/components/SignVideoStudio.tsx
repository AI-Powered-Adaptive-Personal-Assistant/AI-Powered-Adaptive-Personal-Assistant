import { localize } from '../lib/translations';
import { useState, useEffect, useRef } from "react";
import { UserProfile } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Square, Play, RefreshCw, Menu, FileText, Settings, Video, Sparkles, Brain, Zap, Activity, Camera, CameraOff, Hand, Keyboard, Volume2 } from "lucide-react";
import SignAvatar3D from "./SignAvatar3D";
import { geminiService } from "../services/geminiService";
import { Hands, Results } from "@mediapipe/hands";
import { Camera as MediaPipeCamera } from "@mediapipe/camera_utils";
import type { SignClassifier } from "../lib/signClassifier";
import { speak, cancelSpeech } from "../lib/tts";

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
  // Which text is currently being spoken aloud — the user's script or the AI's
  // answer. One shared value because speechSynthesis has a single output: starting
  // one must visibly stop the other rather than leaving two "Stop" buttons lit.
  const [speakingWhat, setSpeakingWhat] = useState<null | 'input' | 'answer'>(null);
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
  const directStreamRef = useRef<MediaStream | null>(null); // safety handle to release the mic
  const directElapsedRef = useRef(0);

  // Unified input mode: the user fills the script by SIGNING (camera), TYPING, or SPEAKING.
  const [inputMode, setInputMode] = useState<'sign' | 'text' | 'voice'>('text');
  const [isSignCamActive, setIsSignCamActive] = useState(false);
  const [signCamStatus, setSignCamStatus] = useState(""); // loading / live / error label
  const [liveLetter, setLiveLetter] = useState(""); // current recognised letter + confidence
  const [signCamError, setSignCamError] = useState("");
  const signVideoRef = useRef<HTMLVideoElement | null>(null);
  const signStreamRef = useRef<MediaStream | null>(null);
  // Local, on-device fingerspelling recognition (MediaPipe hands + tiny CNN) —
  // real-time, accurate for the 24 static letters, and ZERO API cost/quota.
  const handsRef = useRef<Hands | null>(null);
  const signCameraRef = useRef<MediaPipeCamera | null>(null);
  const signClfRef = useRef<SignClassifier | null>(null);
  // Set true by stopSignCam so an in-flight startSignCam (awaiting model load /
  // camera permission) can bail and release the camera instead of leaking it when
  // the user switches input mode during the load.
  const signCamCancelRef = useRef(false);

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

  const [voiceLang, setVoiceLang] = useState<string>(profile.language || 'Egyptian Ammiya');

  const isArabic = voiceLang === 'Arabic' || voiceLang === 'Egyptian Ammiya';
  const isEgyptian = voiceLang === 'Egyptian Ammiya';
  const isFrench = voiceLang === 'French';
  
  const t = {
    scriptInput: localize(voiceLang, "Script Input", "مدخلات النص"),
    placeholder: isEgyptian 
      ? "اكتب رسالتك أو سؤالك هنا واضغط Enter..."
      : isArabic 
      ? "اكتب رسالتك أو سؤالك هنا واضغط Enter..."
      : isFrench
      ? "Écrivez votre message ou question et appuyez sur Entrée..."
      : "Type your message or question and press Enter...",
    recordSpeech: localize(voiceLang, "Record Speech", "تسجيل الصوت"),
    rawRecordingHint: localize(voiceLang, "Direct Acoustic AI (Euphonia)", "التقاط وتدقيق الصوت المباشر"),
    stopRecording: localize(voiceLang, "Stop Recording", "إيقاف التسجيل"),
    generating: localize(voiceLang, "Rendering Video...", "جاري معالجة الفيديو..."),
    generate: localize(voiceLang, "Generate Video", "إنتاج الفيديو"),
    decodingSpeech: localize(voiceLang, "AI reconstructing speech pattern...", "جاري فك تشفيرة النطق بـ AI..."),
    optimizingText: localize(voiceLang, "AI optimizing sign concepts...", "جاري تحسين لغة الإشارة وإزالة الزوائد..."),
    speechProfileTitle: localize(voiceLang, "Adaptive Vocal Speech Profile", "معايرة النطق والأصوات للمتحدث"),
    standard: localize(voiceLang, "Standard", "عادي"),
    dysarthria: localize(voiceLang, "Dysarthria", "صعوبة نطق"),
    stutter: localize(voiceLang, "Stutter", "تأتأة"),
    aphasia: localize(voiceLang, "Aphasia", "حبسة كلامية"),
    kanevsky: localize(voiceLang, "Dr. Dimitri Kanevsky (Severe Deaf-Dysarthria)", "د. ديمتري كانيفسكي (صوت أصم)"),
    askAI: localize(voiceLang, "Ask AI (Get Answer)", "اسأل الذكاء الاصطناعي"),
    aiResult: localize(voiceLang, "AI Answer / Result", "نتيجة الإجابة (AI Answer)"),
    useAnswer: localize(voiceLang, "Sign Answer", "عرض بلغة الإشارة"),
    asking: localize(voiceLang, "AI thinking...", "جاري التفكير والتوليد..."),
    modeSign: localize(voiceLang, "Sign", "إشارة"),
    modeText: localize(voiceLang, "Type", "كتابة"),
    modeVoice: localize(voiceLang, "Speak", "صوت"),
    howToInput: localize(voiceLang, "How do you want to talk to Cognify?", "عايز تكلّم كوجنيفاي إزاي؟"),
    startCamera: localize(voiceLang, "Start Camera", "تشغيل الكاميرا"),
    stopCamera: localize(voiceLang, "Stop Camera", "إيقاف الكاميرا"),
    signHint: localize(voiceLang, "Fingerspell (A–Y) in front of the camera — letters are read live and added automatically.", "اهجِ الحروف (A–Y) قدّام الكاميرا — بتتقري لحظيًا وتتضاف تلقائيًا."),
    space: localize(voiceLang, "Space", "مسافة"),
    del: localize(voiceLang, "Delete", "حذف"),
    clear: localize(voiceLang, "Clear", "مسح"),
    sayAloud: localize(voiceLang, "Say it aloud", "انطقها بصوت"),
    stopAloud: localize(voiceLang, "Stop", "إيقاف"),
    readAnswer: localize(voiceLang, "Read aloud", "اقرأ بصوت"),
  };

  const DYNAMIC_AAC_PHRASES = isEgyptian ? [
    { text: "عندي سؤال يا باشا", icon: "🙋‍♂️" },
    { text: "ممكن تعيد الشرح تاني؟", icon: "🔄" },
    { text: "محتاج توضيح أبسط شوية", icon: "💡" },
    { text: "تمام جداً فهمت، تسلم!", icon: "✅" },
  ] : isArabic ? [
    { text: "عندي سؤال لو سمحت", icon: "🙋‍♂️" },
    { text: "ممكن إعادة الشرح من فضلك؟", icon: "🔄" },
    { text: "محتاج توضيح بطريقة أبسط", icon: "💡" },
    { text: "تمام جداً فهمت، شكراً!", icon: "✅" },
  ] : isFrench ? [
    { text: "J'ai une question s'il vous plaît", icon: "🙋‍♂️" },
    { text: "Pouvez-vous répéter le point ?", icon: "🔄" },
    { text: "Pouvez-vous expliquer plus simplement ?", icon: "💡" },
    { text: "Très bien compris, merci !", icon: "✅" },
  ] : [
    { text: "I have a question please", icon: "🙋‍♂️" },
    { text: "Could you repeat that please?", icon: "🔄" },
    { text: "Can you explain simpler?", icon: "💡" },
    { text: "Understood clearly, thank you!", icon: "✅" },
  ];

  /** Speak any text aloud and remember WHICH box it came from.
   *  - 'input'  → the app becomes the student's VOICE: they type or fingerspell
   *               and the person in front of them hears it.
   *  - 'answer' → reads the AI's reply, so a blind or low-vision student can
   *               hear it instead of reading it. */
  const speakAloud = (what: 'input' | 'answer') => {
    const text = (what === 'input' ? inputText : aiResponse).trim();
    if (!text) return;
    speak(text, voiceLang, {
      onStart: () => setSpeakingWhat(what),
      onEnd: () => setSpeakingWhat(null),
      onError: () => setSpeakingWhat(null),
    });
  };

  const stopSpeakAloud = () => {
    cancelSpeech();
    setSpeakingWhat(null);
  };

  // A blind / low-vision student can't see the answer appear, so read it to them
  // automatically. Everyone else gets the button and is not spoken at unasked.
  const autoReadAnswer = profile.accessibilityMode === 'Visual';
  useEffect(() => {
    if (!autoReadAnswer || !aiResponse.trim() || isAnswering) return;
    speakAloud('answer');
    // speakAloud is stable enough for this purpose; re-running on every render
    // would restart the speech mid-sentence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiResponse, isAnswering, autoReadAnswer]);

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
      // Hands-free flow: keep listening while the user talks (no cut-off at the
      // first pause), auto-stop after ~3s of silence, then auto-ask the AI and
      // auto-sign the answer — zero extra button presses.
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = profile.language === 'Arabic' ? 'ar-SA' : profile.language === 'Egyptian Ammiya' ? 'ar-EG' : 'en-US';

      let latestTranscript = "";
      let silenceTimer: any = null;
      const armSilenceTimer = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        // 3s of silence = the user finished their thought → stop and answer.
        silenceTimer = setTimeout(() => { try { recognition.stop(); } catch { /* ignore */ } }, 3000);
      };

      recognition.onresult = (event: any) => {
        let fullTranscript = "";
        for (let i = 0; i < event.results.length; ++i) {
             fullTranscript += event.results[i][0].transcript;
        }
        latestTranscript = fullTranscript;
        setInputText(fullTranscript);
        armSilenceTimer(); // still talking — push the auto-stop back
      };

      recognition.onerror = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        setIsRecording(false);
      };
      recognition.onend = async () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        setIsRecording(false);
        let finalText = latestTranscript.trim();
        if (finalText) {
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
              finalText = enhanced;
            }
          } catch (e) {
            console.error("ASR rehabilitation failed:", e);
          } finally {
            setIsEnhancing(false);
          }
          // AUTO: question → answer → avatar signs it. No button press.
          handleAskAI(finalText);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      armSilenceTimer(); // if the user never speaks at all, stop after the grace period
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
      directStreamRef.current = stream;
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
              // AUTO: decoded speech → answer → avatar signs it.
              handleAskAI(decoded);
            }
          } catch (err) {
            console.error("Acoustic decode failed:", err);
          } finally {
            setIsEnhancing(false);
          }
        };
        stream.getTracks().forEach(t => t.stop());
        directStreamRef.current = null;
      };

      mediaRecorder.start();
      setIsRecordingDirectAudio(true);
      directElapsedRef.current = 0;
      setDirectRecordingTime(0);

      // Plain ref-driven timer — no setState call inside a state updater.
      recordingTimerRef.current = setInterval(() => {
        directElapsedRef.current += 1;
        setDirectRecordingTime(directElapsedRef.current);
        if (directElapsedRef.current >= 12) stopDirectAudioRecord();
      }, 1000);
    } catch (e) {
      console.error(e);
      // Release the mic if getUserMedia succeeded but MediaRecorder threw (e.g.
      // Safari, which lacks audio/webm) — otherwise the mic stays live forever.
      directStreamRef.current?.getTracks().forEach((t) => t.stop());
      directStreamRef.current = null;
      setIsRecordingDirectAudio(false);
      alert("Microphone connection failed.");
    }
  };

  const stopDirectAudioRecord = () => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // Safety net: if onstop never fires (recorder error), still release the mic.
    directStreamRef.current?.getTracks().forEach((t) => t.stop());
    directStreamRef.current = null;
    setIsRecordingDirectAudio(false);
  };

  // --- SIGN LANGUAGE CAMERA INPUT (on-device fingerspelling, no API) ---
  // Each recognised frame is classified locally; the smoother commits a stable
  // letter which gets appended to the script. Real-time, accurate, zero quota.
  const onSignResults = (results: Results) => {
    const video = signVideoRef.current;
    const clf = signClfRef.current;
    // A stopped camera nulls the stream ref; bail so a late in-flight frame
    // can't append a stray letter after the user stopped.
    if (!video || !clf || !signStreamRef.current) return;

    const landmarks = results.multiHandLandmarks?.[0];
    const handScore = results.multiHandedness?.[0]?.score ?? 0;

    if (!landmarks || landmarks.length === 0 || handScore <= 0.7) {
      setLiveLetter("");
      clf.smoother.handLost();
      return;
    }

    const pred = clf.classify(video, landmarks as any);
    if (!pred) return;
    setLiveLetter(`${pred.letter} · ${(pred.confidence * 100).toFixed(0)}%`);

    const stable = clf.smoother.push(pred);
    if (stable) {
      setSignCamError("");
      setInputText((prev) => prev + stable);
    }
  };

  const startSignCam = async () => {
    setSignCamError("");
    signCamCancelRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setSignCamError(localize(profile.language, "Camera isn't available on this browser/connection.", "الكاميرا مش متاحة على المتصفح/الاتصال ده."));
      return;
    }
    try {
      // Lazy-load the on-device recognizer (and TF.js) the first time.
      if (!signClfRef.current) {
        setSignCamStatus(localize(profile.language, "Loading recognizer…", "جاري تحميل المُميِّز…"));
        const { SignClassifier } = await import("../lib/signClassifier");
        const clf = new SignClassifier();
        await Promise.race([
          clf.load("/models/sign/model.json"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("model-timeout")), 20000)),
        ]);
        signClfRef.current = clf;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      // If the user left sign mode (or hit Stop) while we were awaiting the model
      // or camera permission, release the freshly-acquired camera instead of
      // leaking it. The !signVideoRef.current clause also avoids building a
      // MediaPipe camera around a null (unmounted) video element.
      if (signCamCancelRef.current || !signVideoRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        setSignCamStatus("");
        return;
      }
      signStreamRef.current = stream;
      if (signVideoRef.current) signVideoRef.current.srcObject = stream;

      // Pin the CDN to the exact installed version — the version-less URL serves
      // "latest", whose WASM/assets can drift out of sync with the bundled JS and
      // silently break detection.
      const hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });
      hands.onResults(onSignResults);
      handsRef.current = hands;

      const camera = new MediaPipeCamera(signVideoRef.current!, {
        onFrame: async () => {
          if (handsRef.current && signVideoRef.current) {
            await handsRef.current.send({ image: signVideoRef.current });
          }
        },
        width: 640, height: 480,
      });
      camera.start();
      signCameraRef.current = camera;
      setIsSignCamActive(true);
      setSignCamStatus(localize(profile.language, "Live", "مباشر"));
    } catch (err: any) {
      console.error("Sign camera failed", err);
      const name = err?.name || "";
      let msg = localize(profile.language, "Couldn't start the camera. Please try again.", "تعذّر تشغيل الكاميرا. حاول تاني.");
      if (name === "NotAllowedError" || name === "SecurityError") msg = localize(profile.language, "Camera permission was blocked. Enable it in your browser settings.", "إذن الكاميرا مرفوض. فعّله من إعدادات المتصفح.");
      else if (err?.message === "model-timeout") msg = localize(profile.language, "The recognizer took too long to load — check the connection.", "المُميِّز أخد وقت طويل في التحميل — راجِع الاتصال.");
      setSignCamError(msg);
      setSignCamStatus("");
      try { signCameraRef.current?.stop(); } catch { /* ignore */ }
      signStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      signStreamRef.current = null;
    }
  };

  const stopSignCam = () => {
    signCamCancelRef.current = true; // abort any in-flight startSignCam
    try { signCameraRef.current?.stop(); } catch { /* ignore */ }
    signCameraRef.current = null;
    try { handsRef.current?.close(); } catch { /* ignore */ }
    handsRef.current = null;
    if (signStreamRef.current) {
      signStreamRef.current.getTracks().forEach((tr) => tr.stop());
      signStreamRef.current = null;
    }
    if (signVideoRef.current) signVideoRef.current.srcObject = null;
    signClfRef.current?.smoother.reset();
    setIsSignCamActive(false);
    setLiveLetter("");
    setSignCamStatus("");
  };

  // Release the camera when leaving sign mode or unmounting.
  useEffect(() => {
    if (inputMode !== 'sign') stopSignCam();
  }, [inputMode]);

  useEffect(() => {
    return () => {
      stopSignCam();
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      recognitionRef.current = null; // stop the live STT session too, not just the camera
      stopDirectAudioRecord();
      cancelSpeech(); // don't let "Say it aloud" keep talking over the next screen
      signClfRef.current?.dispose();
      signClfRef.current = null; // no stale handle a late frame could touch
    };
  }, []);

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

  // `textOverride` lets auto-flows (voice) pass the fresh transcript directly,
  // avoiding a stale inputText from React state.
  const handleAskAI = async (textOverride?: string) => {
    const question = (textOverride ?? inputText).trim();
    if (!question) return;
    // Claim this input as already-handled so the 1s auto-translate debounce
    // (which watches inputText) doesn't fire afterwards and overwrite the
    // avatar's ANSWER sequence with the raw QUESTION text.
    prevInputRef.current = question;
    setIsAnswering(true);
    setAiResponse("");
    try {
      const language = localize(profile.language, "English", "Arabic");
      const answer = await geminiService.askGeneralQuestion(question, language);
      setAiResponse(answer);
      // Auto-sign the answer on the avatar immediately — no extra button press.
      if (answer) {
        const words = answer.trim().split(/\s+/).filter(Boolean);
        if (words.length) {
          setSequence(words);
          setPlaybackProgress(0);
          setIsPlaying(true);
        }
        // Automatically speak the AI answer in natural voice
        speak(answer, voiceLang, {
          onStart: () => setSpeakingWhat('answer'),
          onEnd: () => setSpeakingWhat(null),
          onError: () => setSpeakingWhat(null),
        });
      }
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
              className="p-2 text-text-muted bg-white shadow-sm border border-border hover:bg-surface-2 rounded-lg active:scale-95"
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

      <div className={`flex-1 min-h-0 overflow-y-auto z-10 relative flex flex-col items-center ${isEmbedded ? 'p-3 md:p-5' : 'p-6 md:p-10'}`}>
         <div className={`w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 ${isEmbedded ? 'gap-4' : 'gap-8 h-full'}`}>

            {/* Input Section */}
            <div className="flex flex-col gap-6 w-full h-full">
               <div className={`bg-white rounded-2xl shadow-sm border border-border flex-1 flex flex-col ${isEmbedded ? 'p-4' : 'p-6'}`}>
                  <div className="flex items-center justify-between mb-4">
                     <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                       <FileText className="w-5 h-5 text-primary" />
                       {t.scriptInput}
                     </h2>

                     {/* Audio recording mode toggle: Continuous ASR vs Raw Acoustic AI — voice mode only */}
                     {inputMode === 'voice' && (
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
                     )}
                  </div>

                  {/* Voice Language & Dialect Selector */}
                  <div className="mb-3 flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-border">
                    <span className="text-[11px] font-bold text-text-muted flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-primary" />
                      {isArabic ? "لهجة الصوت:" : "Voice Dialect:"}
                    </span>
                    <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-border">
                      {[
                        { id: 'Egyptian Ammiya', label: '🇪🇬 مصري' },
                        { id: 'Arabic', label: '🇸🇦 فصحى' },
                        { id: 'English', label: '🇺🇸 English' },
                        { id: 'French', label: '🇫🇷 Français' },
                      ].map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setVoiceLang(id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                            voiceLang === id ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Unified input-mode selector: SIGN / TYPE / SPEAK */}
                  <div className="mb-3">
                    <p className="text-[11px] font-bold text-text-muted mb-1.5">{t.howToInput}</p>
                    <div className="grid grid-cols-3 gap-2 p-1 bg-surface-2 rounded-2xl border border-border" role="tablist" aria-label={t.howToInput}>
                      {([
                        { id: 'sign', label: t.modeSign, Icon: Hand },
                        { id: 'text', label: t.modeText, Icon: Keyboard },
                        { id: 'voice', label: t.modeVoice, Icon: Volume2 },
                      ] as const).map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          role="tab"
                          aria-selected={inputMode === id}
                          onClick={() => setInputMode(id)}
                          className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${
                            inputMode === id
                              ? 'bg-primary text-white shadow-sm'
                              : 'text-text-muted hover:bg-surface-3'
                          }`}
                        >
                          <Icon className="w-4 h-4" /> {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Communication Bridge AAC Cards */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-text-muted flex items-center gap-1">
                        ⚡ {isArabic ? "عبارات سريعة بنقرة واحدة (Bridge Phrases):" : "Quick 1-Tap Bridge Phrases:"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DYNAMIC_AAC_PHRASES.map((card, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setInputText(card.text);
                            handleAskAI(card.text);
                          }}
                          className="px-2.5 py-1 bg-surface-2 hover:bg-primary-soft hover:text-primary hover:border-primary/40 text-text-main text-[11px] font-semibold rounded-lg border border-border transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
                        >
                          <span>{card.icon}</span>
                          <span>{card.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SIGN camera panel — on-device live fingerspelling */}
                  {inputMode === 'sign' && (
                    <div className="mb-4 rounded-2xl border border-border bg-slate-900 overflow-hidden">
                      <div className="relative aspect-video bg-slate-950 flex items-center justify-center">
                        <video
                          ref={signVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className={`w-full h-full object-cover ${isSignCamActive ? 'opacity-100' : 'opacity-0'}`}
                          style={{ transform: 'scaleX(-1)' }}
                        />
                        {/* Live status badge */}
                        {isSignCamActive && (
                          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-emerald-500/90 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> {signCamStatus || 'Live'}
                          </div>
                        )}
                        {/* Big live letter read-out */}
                        {isSignCamActive && liveLetter && (
                          <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-lg font-black px-3 py-1 rounded-xl border border-white/10">
                            {liveLetter}
                          </div>
                        )}
                        {!isSignCamActive && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/50">
                            <Camera className="w-10 h-10" />
                            <span className="text-[11px] font-bold px-6 text-center">{t.signHint}</span>
                          </div>
                        )}
                      </div>
                      <div className="p-3 flex flex-wrap gap-2">
                        <button
                          onClick={isSignCamActive ? stopSignCam : startSignCam}
                          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                            isSignCamActive ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'flex-1 bg-primary text-white hover:bg-primary-press'
                          }`}
                        >
                          {isSignCamActive ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                          {isSignCamActive ? t.stopCamera : t.startCamera}
                        </button>
                        {isSignCamActive && (
                          <>
                            <button
                              onClick={() => setInputText((p) => p + ' ')}
                              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all active:scale-95"
                            >
                              {t.space}
                            </button>
                            <button
                              onClick={() => setInputText((p) => p.slice(0, -1))}
                              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all active:scale-95"
                            >
                              ⌫ {t.del}
                            </button>
                          </>
                        )}
                      </div>
                      {signCamError && (
                        <p className="px-3 pb-3 text-[11px] font-bold text-red-300">{signCamError}</p>
                      )}
                    </div>
                  )}

                  <div className={`relative flex-1 flex flex-col ${isEmbedded ? 'min-h-[90px]' : 'min-h-[160px]'}`}>
                     <textarea
                       id="sign-script-input"
                       name="sign-script"
                       aria-label={t.scriptInput}
                       value={inputText}
                       onChange={(e) => setInputText(e.target.value)}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           if (inputText.trim() && !isAnswering && !isGenerating && !isEnhancing) {
                             handleAskAI();
                           }
                         }
                       }}
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
                                    // Claim this input as already-handled so the 1s
                                    // auto-translate debounce doesn't re-fire and
                                    // restart playback from the top.
                                    prevInputRef.current = aiResponse.trim();
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
                                {/* Hear the ANSWER — for blind/low-vision students, and for
                                    anyone who'd rather listen than read it. */}
                                <button
                                  onClick={() => (speakingWhat === 'answer' ? stopSpeakAloud() : speakAloud('answer'))}
                                  aria-label={speakingWhat === 'answer' ? t.stopAloud : t.readAnswer}
                                  className={`text-[10px] font-black text-white px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
                                    speakingWhat === 'answer'
                                      ? 'bg-rose-500 hover:bg-rose-600'
                                      : 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700'
                                  }`}
                                >
                                  {speakingWhat === 'answer'
                                    ? <><Square className="w-3 h-3 fill-current" /> {t.stopAloud}</>
                                    : <><Volume2 className="w-3 h-3" /> {t.readAnswer}</>}
                                </button>
                              </div>
                            </div>
                          )}
                       </div>
                    </motion.div>
                  )}

                  <div className="mt-4 flex flex-col sm:flex-row gap-3">
                     {inputMode === 'voice' && (
                      isDirectAudioMode ? (
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
                     ))}

                     {/* "Say it aloud" — the app speaks FOR the student. A non-verbal
                         or speech-impaired user types (or fingerspells) and this gives
                         them a voice to talk to a hearing person in the room. */}
                     <button
                       onClick={() => (speakingWhat === 'input' ? stopSpeakAloud() : speakAloud('input'))}
                       disabled={!inputText.trim() && speakingWhat !== 'input'}
                       aria-label={speakingWhat === 'input' ? t.stopAloud : t.sayAloud}
                       className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 disabled:opacity-50 disabled:active:scale-100 active:scale-95 transform transition-all text-white font-bold rounded-xl shadow-lg ${
                         speakingWhat === 'input'
                           ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
                           : 'bg-gradient-to-tr from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 shadow-sky-500/20'
                       }`}
                     >
                       {speakingWhat === 'input' ? <Square className="w-5 h-5 fill-current" /> : <Volume2 className="w-5 h-5" />}
                       {speakingWhat === 'input' ? t.stopAloud : t.sayAloud}
                     </button>

                     {/* Ask AI Button to get answer result output */}
                     <button
                       onClick={() => handleAskAI()}
                       disabled={!inputText.trim() || isAnswering || isGenerating || isEnhancing}
                       className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-tr from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:active:scale-100 active:scale-95 transform transition-all text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20"
                     >
                        {isAnswering ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Brain className="w-5 h-5 text-white" />}
                        <span>{isAnswering ? t.asking : t.askAI}</span>
                        <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] bg-black/20 rounded font-mono">↵</kbd>
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
            <div className={`bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 p-2 flex flex-col relative overflow-hidden ${isEmbedded ? 'h-[min(340px,52dvh)] lg:h-[440px]' : 'h-[min(500px,60dvh)] sm:h-[500px] lg:h-full sm:min-h-[500px]'}`}>
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