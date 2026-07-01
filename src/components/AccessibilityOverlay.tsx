import React, { useState, useEffect, useRef } from "react";
import { AccessibilityMode, UserProfile } from "../types";
import { toast } from "./Toast";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Brain,
  Sparkles,
  MessageSquare,
  Eye,
  EyeOff,
  Camera,
  RefreshCw,
  Hand,
  Heart,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Smile,
  Frown,
  Clock,
  Ear,
  MessageCircle,
  Home,
  Briefcase,
  Octagon,
  User,
  Activity,
  VolumeX,
  Volume2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Hands, Results, HAND_CONNECTIONS } from "@mediapipe/hands";
import { Camera as MediaPipeCamera } from "@mediapipe/camera_utils";
import { geminiService } from "../services/geminiService";
// Type-only import keeps TensorFlow.js out of this chunk; the implementation is
// dynamically imported in startVision so tfjs only loads when the camera is used.
import type { SignClassifier } from "../lib/signClassifier";

interface AccessibilityOverlayProps {
  mode: AccessibilityMode;
  profile: UserProfile;
  aiResponse?: string;
  onTranscription: (text: string) => void;
  isListening?: boolean;
  onToggleListening?: () => void;
}

export default function AccessibilityOverlay({
  mode,
  profile,
  aiResponse = "",
  onTranscription,
  isListening = false,
  onToggleListening,
}: AccessibilityOverlayProps) {
  const [isVisionActive, setIsVisionActive] = useState(false);
  const [isVisionAnalyzing, setIsVisionAnalyzing] = useState(false);
  // Lets the user hide the floating mic / camera / voice controls (remembered).
  const [controlsHidden, setControlsHidden] = useState<boolean>(() => {
    try { return localStorage.getItem("cognify_a11y_hidden") === "1"; } catch { return false; }
  });
  const toggleControlsHidden = (next: boolean) => {
    setControlsHidden(next);
    try { localStorage.setItem("cognify_a11y_hidden", next ? "1" : "0"); } catch { /* ignore */ }
  };
  const [isAvatarSigning, setIsAvatarSigning] = useState(false);
  const [detectionConfidence, setDetectionConfidence] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<MediaPipeCamera | null>(null);
  // Local in-browser ASL fingerspelling recognizer (TF.js); loaded on demand.
  const signClfRef = useRef<SignClassifier | null>(null);
  const [liveLetter, setLiveLetter] = useState("");
  // Enlarge the camera preview to a big centered panel (toggle).
  const [camExpanded, setCamExpanded] = useState(false);

  // Free the recognizer AND stop the camera + any speech when the overlay
  // unmounts — otherwise the webcam light stays on (privacy) and TTS bleeds
  // into the next screen. Critical for a trusted hospital deployment.
  useEffect(() => {
    return () => {
      signClfRef.current?.dispose();
      signClfRef.current = null;
      try { cameraRef.current?.stop(); } catch { /* ignore */ }
      try { handsRef.current?.close(); } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if ("speechSynthesis" in window) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      }
    };
  }, []);

  const [currentWord, setCurrentWord] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Default to SILENT. The only exception is Visual (blind) mode, where reading
  // aloud is the whole point and the user can't see the toggle. Everyone else
  // turns the voice ON explicitly — and turning it off truly stops it (effect below).
  const [autoSpeak, setAutoSpeak] = useState(mode === "Visual");
  const [avatarImage, setAvatarImage] = useState(
    "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=400&h=600",
  );
  const [signHistory, setSignHistory] = useState<string[]>([]);

  // The moment the voice is muted, stop any speech that's already playing —
  // fixes "I muted it but it kept talking".
  useEffect(() => {
    if (!autoSpeak && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [autoSpeak]);

  // Update sign history when current word changes
  useEffect(() => {
    if (currentWord) {
      setSignHistory((prev) => [currentWord, ...prev].slice(0, 5));
    }
  }, [currentWord]);

  // Warm up Speech Synthesis voices list on mount
  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const handleVoices = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handleVoices);
      return () => {
        window.speechSynthesis.removeEventListener(
          "voiceschanged",
          handleVoices,
        );
      };
    }
  }, []);

  // Handle hand movement when user is speaking
  useEffect(() => {
    if (isListening) {
      setCurrentWord("listening");
    } else if (!isAvatarSigning) {
      setCurrentWord("");
    }
  }, [isListening, isAvatarSigning]);

  // --- TTS and AI RESPONSE SIGNING EFFECT ---
  useEffect(() => {
    if (aiResponse && aiResponse.length > 1) {
      setIsAvatarSigning(true);
      setAvatarImage(
        "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=400&h=600",
      ); // Speaking/Active expression

      // text-to-speech for AI response
      if (
        autoSpeak &&
        (mode === "Speech" ||
          mode === "Vocal-Deaf" ||
          mode === "Visual" ||
          mode === "Sign-Only")
      ) {
        if ("speechSynthesis" in window) {
          const cleanText = aiResponse
            .replace(/\[Signs:.*?\]/g, "")
            .replace(/[*+#_`~\[\]()]/g, "");
          const utterance = new SpeechSynthesisUtterance(cleanText);
          const hasArabic = /[\u0600-\u06FF]/.test(cleanText);
          const langMap: Record<string, string> = {
            English: "en-US",
            Arabic: "ar-SA",
            "Egyptian Ammiya": "ar-EG",
            French: "fr-FR",
            Spanish: "es-ES",
            German: "de-DE",
            Italian: "it-IT",
            Portuguese: "pt-BR",
            Russian: "ru-RU",
            Chinese: "zh-CN",
            Japanese: "ja-JP",
          };

          if (hasArabic) {
            // If profile language is Egyptian or content has Egyptian keywords, use ar-EG
            const isEgyptian =
              profile.language === "Egyptian Ammiya" ||
              cleanText.includes("يا باشا") ||
              cleanText.includes("تمام") ||
              cleanText.includes("ازيك");
            const defaultLang = isEgyptian ? "ar-EG" : "ar-SA";
            utterance.lang = defaultLang;

            const voices = window.speechSynthesis.getVoices();
            let voice = voices.find(
              (v) => v.lang.toLowerCase() === defaultLang.toLowerCase(),
            );
            if (!voice) {
              voice = voices.find(
                (v) =>
                  v.lang.toLowerCase() === "ar-eg" ||
                  v.lang.toLowerCase() === "ar-sa",
              );
            }
            if (!voice) {
              voice = voices.find((v) => v.lang.toLowerCase().startsWith("ar"));
            }
            if (voice) {
              utterance.voice = voice;
              utterance.lang = voice.lang;
            } else {
              utterance.lang = "ar";
            }
          } else {
            const defaultLang =
              langMap[profile.language || "English"] || "en-US";
            utterance.lang = defaultLang;

            const voices = window.speechSynthesis.getVoices();
            let voice = voices.find(
              (v) => v.lang.toLowerCase() === defaultLang.toLowerCase(),
            );
            if (!voice) {
              voice = voices.find((v) =>
                v.lang
                  .toLowerCase()
                  .startsWith(defaultLang.split("-")[0].toLowerCase()),
              );
            }
            if (voice) {
              utterance.voice = voice;
              utterance.lang = voice.lang;
            }
          }

          utterance.onstart = () => setIsSpeaking(true);
          utterance.onend = () => setIsSpeaking(false);
          utterance.onerror = () => setIsSpeaking(false);

          window.speechSynthesis.cancel(); // stop any ongoing synthesis
          setTimeout(() => {
            window.speechSynthesis.speak(utterance);
          }, 100);
        }
      }

      // Clean and split words for sequence
      const words = aiResponse
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
        .split(/\s+/);

      words.forEach((w, i) => {
        setTimeout(() => {
          if (w.length > 0) setCurrentWord(w.toLowerCase());
        }, i * 450);
      });

      const timer = setTimeout(
        () => {
          setIsAvatarSigning(false);
          setCurrentWord("");
          setAvatarImage(
            "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=400&h=600",
          ); // Back to neutral
        },
        words.length * 450 + 500,
      );
      return () => clearTimeout(timer);
    }
  }, [aiResponse]);

  // --- SPEECH RECOGNITION (STT) VIA MEDIA RECORDER (Backend Gemini) ---
  const transcriptionRef = useRef("");
  // --- VISION SIGN RECOGNITION (MediaPipe + Confidence Thresholding) ---
  const [visionStatus, setVisionStatus] = useState("Idle");
  const [transcription, setTranscription] = useState("");

  // Per-frame hand results from MediaPipe. Recognition now runs fully locally
  // via the TF.js fingerspelling model — no per-frame network calls to Gemini.
  const onResults = (results: Results) => {
    const video = videoRef.current;
    const clf = signClfRef.current;
    if (!video || !clf) return;

    const landmarks = results.multiHandLandmarks?.[0];
    const handScore = results.multiHandedness?.[0]?.score ?? 0;

    // No reliable hand: let the smoother know so a repeated letter can re-fire.
    if (!landmarks || landmarks.length === 0 || handScore <= 0.7) {
      setDetectionConfidence(0);
      setLiveLetter("");
      clf.smoother.handLost();
      return;
    }

    setDetectionConfidence(handScore);

    // Local classification of the 24 static letters A–Y (~30fps, zero cost).
    const pred = clf.classify(video, landmarks as any);
    if (!pred) return;

    setLiveLetter(`${pred.letter} · ${(pred.confidence * 100).toFixed(0)}%`);

    // Temporal smoother turns noisy per-frame predictions into committed letters.
    const stable = clf.smoother.push(pred);
    if (stable) {
      // Build up the fingerspelled word; the user confirms it to send to the AI.
      setTranscription((prev) => prev + stable);

      // Optional audio feedback for the committed letter.
      if (
        "speechSynthesis" in window &&
        autoSpeak &&
        (mode === "Sign-Only" || mode === "Vocal-Deaf")
      ) {
        const utterance = new SpeechSynthesisUtterance(stable);
        utterance.lang =
          profile.language === "Egyptian Ammiya"
            ? "ar-EG"
            : profile.language === "Arabic"
              ? "ar-SA"
              : "en-US";
        setTimeout(() => window.speechSynthesis.speak(utterance), 50);
      }
    }
  };

  const startVision = async () => {
    // Feature-detect: on http origins or old browsers mediaDevices is undefined.
    if (!navigator.mediaDevices?.getUserMedia) {
      setVisionStatus("Camera not supported");
      toast.error(
        "Camera isn't available on this browser/connection. A modern browser over HTTPS is required.",
        "Camera unavailable",
      );
      return;
    }
    try {
      // Lazy-load the recognizer (and TF.js) the first time the camera starts.
      if (!signClfRef.current) {
        setVisionStatus("Loading recognizer...");
        const { SignClassifier } = await import("../lib/signClassifier");
        const clf = new SignClassifier();
        // Don't hang forever on weak hospital wifi — bound the model load.
        await Promise.race([
          clf.load("/models/sign/model.json"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("model-timeout")), 20000)),
        ]);
        signClfRef.current = clf;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;

        // Initialize MediaPipe Hands
        const hands = new Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.6,
        });

        hands.onResults(onResults);
        handsRef.current = hands;

        const camera = new MediaPipeCamera(videoRef.current, {
          onFrame: async () => {
            if (handsRef.current && videoRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });

        camera.start();
        cameraRef.current = camera;
        setIsVisionActive(true);
        setVisionStatus("Live Tracking...");
      }
    } catch (err: any) {
      console.error("Camera access failed", err);
      // Translate the failure into a clear, actionable message (shown as a toast
      // so it's visible even though the status pill only renders when active).
      const name = err?.name || "";
      let msg = "Couldn't start the camera. Please try again.";
      if (name === "NotAllowedError" || name === "SecurityError") msg = "Camera permission was blocked. Enable camera access in your browser settings, then try again.";
      else if (name === "NotFoundError" || name === "DevicesNotFoundError") msg = "No camera was found on this device.";
      else if (name === "NotReadableError" || name === "TrackStartError") msg = "The camera is in use by another app. Close it and try again.";
      else if (err?.message === "model-timeout") msg = "The sign recognizer took too long to load — check the internet connection and try again.";
      setVisionStatus("Camera Error");
      toast.error(msg, "Camera");
      // Clean up any partial stream so the light doesn't stay on.
      try { cameraRef.current?.stop(); } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const stopVision = () => {
    if (cameraRef.current) cameraRef.current.stop();
    if (handsRef.current) handsRef.current.close();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    signClfRef.current?.smoother.reset();
    setIsVisionActive(false);
    setIsVisionAnalyzing(false);
    setVisionStatus("Idle");
    setDetectionConfidence(0);
    setLiveLetter("");
  };

  // Hybrid fallback: on demand (NOT per frame), send the current camera frame to
  // Gemini to interpret a full word/gesture the local letter model can't cover.
  const interpretWithAI = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || isVisionAnalyzing) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];

    setIsVisionAnalyzing(true);
    try {
      const text = await geminiService.translateSign(
        imageData,
        profile.language || "English",
        profile.level || "Basic",
      );
      const clean = (text || "")
        .replace(/\[NO_SIGN\]/gi, "")
        .replace(/[\[\]]/g, "")
        .trim();
      if (clean) {
        setTranscription((prev) => (prev ? prev + " " : "") + clean);
      }
    } catch (e) {
      console.error("AI sign interpret error", e);
    } finally {
      setIsVisionAnalyzing(false);
    }
  };

  // --- SIGNING VARIANTS ---
  const getHandPose = (word: string, side: "left" | "right") => {
    const w = word.toLowerCase();

    // Explicit Letters (ASL / Kaggle MNIST simulation fingerspelling)
    // We adjust rotation, scale, and x/y marginally depending on the letter to simulate distinct shapes.
    if (w.length === 1 && /^[a-z]$/.test(w)) {
      const charCode = w.charCodeAt(0) - 97; // 0 for 'a', 25 for 'z'
      // Create deterministic but varied offsets based on letter
      const xOffset = (charCode % 5) * 5;
      const yOffset = (charCode % 3) * 10 - 15;
      const rotateOffset = (charCode % 7) * 10 - 30;

      return {
        x: side === "left" ? xOffset : -xOffset,
        y: yOffset,
        rotate: side === "left" ? rotateOffset : -rotateOffset,
        scale: 0.9,
        opacity: 0.9,
        transition: { type: "spring", stiffness: 150, damping: 15 },
      };
    }

    // Greeting: Hello, Hi, Marhaba
    if (
      ["hello", "hi", "hey", "مرحبا", "اهلا", "سلام"].some((g) => w.includes(g))
    ) {
      return side === "left"
        ? {
            x: 55,
            y: -70,
            rotate: 85,
            scale: 1.35,
            opacity: 1,
            transition: { type: "spring", stiffness: 120, damping: 10 },
          }
        : { x: -10, y: 15, rotate: 5, scale: 0.9, opacity: 0.8 };
    }
    // Gratitude: Thanks, Shukran
    if (
      ["thank", "shukran", "شكرا", "تقدير", "love"].some((g) => w.includes(g))
    ) {
      return {
        y: [0, 50, 0],
        x: side === "left" ? 20 : -20,
        scale: [1, 1.4, 1],
        rotate: side === "left" ? -45 : 45,
        transition: { duration: 0.8, ease: "circInOut" },
      };
    }
    // Deep Cognition: Think, Know, Mind, Cognify
    if (
      [
        "think",
        "know",
        "brain",
        "mind",
        "cognify",
        "عقل",
        "فكر",
        "اعرف",
        "ذكاء",
        "ai",
      ].some((g) => w.includes(g))
    ) {
      return side === "left"
        ? {
            y: -90,
            x: 30,
            rotate: 115,
            scale: 1.15,
            opacity: 1,
            transition: { type: "spring", stiffness: 80, damping: 12 },
          }
        : { y: -25, x: -15, rotate: -20, scale: 0.85, opacity: 0.65 };
    }
    // Help / Support
    if (
      ["help", "support", "assist", "مساعدة", "عون", "please"].some((g) =>
        w.includes(g),
      )
    ) {
      return {
        y: [30, 50, 30],
        x: side === "left" ? 50 : -50,
        rotate: side === "left" ? 15 : -15,
        scale: [1.3, 1.5, 1.3],
        opacity: 1,
        transition: { repeat: Infinity, duration: 1.5 },
      };
    }
    // Directions / Questions: What, Where...
    if (
      [
        "what",
        "where",
        "how",
        "why",
        "who",
        "ماذا",
        "اين",
        "كيف",
        "لماذا",
        "من",
        "؟",
      ].some((q) => w.includes(q))
    ) {
      const shake = {
        rotate: side === "left" ? [-50, -40, -50] : [50, 40, 50],
      };
      return {
        x: side === "left" ? -65 : 65,
        y: -30,
        scale: 1.35,
        ...shake,
        transition: { repeat: Infinity, duration: 0.5, ease: "linear" },
      };
    }
    // Agreement: Yes, OK, True
    if (
      ["yes", "ok", "حق", "نعم", "حاضر", "صحيح", "تمام"].some((x) =>
        w.includes(x),
      )
    ) {
      return {
        y: [0, 40, 0, 40, 0],
        scale: 1.3,
        rotate: side === "left" ? -10 : 10,
        transition: { duration: 0.6 },
      };
    }
    // Negation: No, Not, Never
    if (
      ["no", "not", "لا", "مرفوض", "كلا", "ابدا"].some((x) => w.includes(x))
    ) {
      return {
        x: side === "left" ? [-50, 0, -50] : [50, 0, 50],
        rotate: side === "left" ? -40 : 40,
        scale: 0.8,
        transition: { duration: 0.4, repeat: 1 },
      };
    }

    // Refined fluid default signing motion
    const baseL = {
      x: [-20, 25, -5, 0],
      y: [0, -40, 20, 0],
      rotate: [-25, 45, -55, -25],
      scale: [1, 1.25, 0.9, 1],
      transition: { duration: 0.7, ease: "easeInOut" },
    };
    const baseR = {
      x: [20, -25, 5, 0],
      y: [0, 40, -20, 0],
      rotate: [25, -45, 55, 25],
      scale: [1, 1.25, 0.9, 1],
      transition: { duration: 0.8, ease: "easeInOut" },
    };
    return side === "left" ? baseL : baseR;
  };

  const signerVariants: any = {
    idle: {
      y: [0, -6, 0],
      scale: [1, 1.02, 1],
      rotate: [0, 0.5, -0.5, 0],
      transition: { repeat: Infinity, duration: 6, ease: "easeInOut" },
    },
    signing: {
      y: [0, -8, 8, 0],
      rotate: [-0.8, 0.8, -0.8],
      scale: [1, 1.03, 0.98, 1],
      transition: { repeat: Infinity, duration: 1.5, ease: "easeInOut" },
    },
  };

  // Collapsed: show only a tiny pill to bring the controls back.
  if (controlsHidden) {
    return (
      <button
        onClick={() => toggleControlsHidden(false)}
        title="Show accessibility controls"
        className="fixed bottom-32 start-4 md:start-8 z-50 w-12 h-12 rounded-full bg-slate-900 text-white shadow-xl border-2 border-slate-700 flex items-center justify-center hover:bg-slate-800 active:scale-95 pointer-events-auto"
      >
        <Eye className="w-5 h-5" />
      </button>
    );
  }

  return (
    <motion.div
      drag
      dragConstraints={{ left: -100, right: 1000, top: -800, bottom: 100 }}
      dragElastic={0.2}
      dragMomentum={false}
      className="fixed bottom-32 start-4 md:start-8 z-50 flex flex-col gap-6 pointer-events-none"
    >
      {/* Hide all accessibility controls */}
      <button
        onClick={() => toggleControlsHidden(true)}
        title="Hide accessibility controls"
        className="self-start pointer-events-auto w-9 h-9 rounded-full bg-bg-card/90 backdrop-blur border border-border text-text-muted shadow flex items-center justify-center hover:text-text-main active:scale-95"
      >
        <EyeOff className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {(mode === "Vocal-Deaf" ||
          mode === "Sign-Only" ||
          mode === "Speech" ||
          mode === "Visual") && (
          <motion.div
            key="virtual-signer-container"
            initial={{ opacity: 0, x: -25, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -25, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="flex flex-col items-center gap-2 pointer-events-auto shrink-0 cursor-grab active:cursor-grabbing"
          >
            <div className="flex flex-col items-center gap-4">
              {(mode === "Speech" ||
                mode === "Vocal-Deaf" ||
                mode === "Sign-Only" ||
                mode === "Visual") && (
                <button
                  onClick={() => {
                    setAutoSpeak(!autoSpeak);
                    if (autoSpeak && "speechSynthesis" in window) {
                      window.speechSynthesis.cancel();
                      setIsSpeaking(false);
                    }
                  }}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all active:scale-95 border-2 ${
                    autoSpeak
                      ? "bg-primary-soft border-border text-primary"
                      : "bg-bg-card border-border text-faint hover:text-text-muted"
                  }`}
                  title={
                    autoSpeak
                      ? "Auto-Speak AI Response (ON)"
                      : "Auto-Speak AI Response (OFF)"
                  }
                >
                  {autoSpeak ? (
                    <Volume2 className="w-6 h-6" />
                  ) : (
                    <VolumeX className="w-6 h-6" />
                  )}
                </button>
              )}
              {isSpeaking && (
                <button
                  onClick={() => {
                    if ("speechSynthesis" in window) {
                      window.speechSynthesis.cancel();
                    }
                    setIsSpeaking(false);
                  }}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all active:scale-95 border-2 bg-danger-soft border-danger/20 text-danger hover:bg-danger-soft"
                  title="Stop AI Voice"
                >
                  <VolumeX className="w-6 h-6" />
                </button>
              )}
              {onToggleListening && (
                <button
                  onClick={onToggleListening}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all active:scale-95 border-2 ${
                    isListening
                      ? "bg-rose-500 border-rose-400 text-white animate-pulse"
                      : "bg-slate-900 border-slate-700 text-white hover:bg-slate-800"
                  }`}
                >
                  {isListening ? (
                    <MicOff className="w-6 h-6" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )}
                </button>
              )}
            </div>
          </motion.div>
        )}

        {mode === "Sign-Only" && (
          <motion.div
            key="sign-only-controls"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="flex flex-col items-start gap-3 pointer-events-auto cursor-grab active:cursor-grabbing"
          >
            {(transcription || liveLetter || isVisionActive) && (
              <div className="bg-bg-card/95 backdrop-blur-md p-4 rounded-2xl border border-border shadow-2xl max-w-sm flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-black uppercase text-primary tracking-widest">
                      Fingerspelling
                    </span>
                    {liveLetter && (
                      <span className="text-[9px] font-mono font-bold text-faint">
                        {liveLetter}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setTranscription((p) => p.slice(0, -1))}
                      disabled={!transcription}
                      title="Backspace"
                      className="px-2 py-1 bg-surface-3 text-text-muted text-[9px] font-black uppercase rounded-lg hover:bg-surface-3 disabled:opacity-40"
                    >
                      ⌫
                    </button>
                    <button
                      onClick={() => {
                        setTranscription("");
                        signClfRef.current?.smoother.reset();
                      }}
                      disabled={!transcription}
                      className="px-2 py-1 bg-surface-3 text-text-muted text-[9px] font-black uppercase rounded-lg hover:bg-surface-3 disabled:opacity-40"
                    >
                      Clear
                    </button>
                    <button
                      onClick={interpretWithAI}
                      disabled={!isVisionActive || isVisionAnalyzing}
                      title="Interpret a full word/gesture with AI"
                      className="px-2 py-1 bg-primary text-white text-[9px] font-black uppercase rounded-lg hover:bg-primary disabled:opacity-40 flex items-center gap-1"
                    >
                      {isVisionAnalyzing ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      AI
                    </button>
                    <button
                      onClick={() => {
                        if (!transcription.trim()) return;
                        onTranscription(transcription.trim());
                        setTranscription("");
                        signClfRef.current?.smoother.reset();
                      }}
                      disabled={!transcription.trim()}
                      className="px-2 py-1 bg-emerald-500 text-white text-[9px] font-black uppercase rounded-lg hover:bg-emerald-600 disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                </div>
                <p className="text-sm font-bold text-text-main leading-relaxed italic capitalize min-h-[1.25rem]">
                  {transcription ? `"${transcription}"` : <span className="text-faint not-italic">Spell a word…</span>}
                </p>
              </div>
            )}

            <div
              className={`overflow-hidden shadow-2xl border-4 transition-all ${camExpanded ? "fixed inset-3 sm:inset-8 z-[200] rounded-2xl bg-black" : "relative rounded-[32px]"} ${isVisionActive ? (isVisionAnalyzing ? "border-accent/20" : "border-primary") : "border-border opacity-50"}`}
            >
              <button
                onClick={() => setCamExpanded((v) => !v)}
                className="absolute bottom-3 right-3 z-30 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/80 transition-all"
                title={camExpanded ? "Shrink camera" : "Enlarge camera"}
                aria-label={camExpanded ? "Shrink camera" : "Enlarge camera"}
              >
                {camExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <AnimatePresence>
                {detectionConfidence > 0 && (
                  <motion.div
                    key="confidence-bar"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{
                      opacity: 1,
                      width: `${detectionConfidence * 100}%`,
                    }}
                    exit={{ opacity: 0 }}
                    className="absolute bottom-0 left-0 h-1.5 bg-emerald-500 z-30"
                  />
                )}
              </AnimatePresence>

              {isVisionActive && (
                <div className="absolute inset-0 z-10 pointer-events-none">
                  {/* Scanning Line Animation */}
                  <motion.div
                    animate={{ top: ["0%", "100%", "0%"] }}
                    transition={{
                      repeat: Infinity,
                      duration: 3,
                      ease: "linear",
                    }}
                    className="absolute left-0 right-0 h-0.5 bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)] z-10"
                  />
                  {/* Corner Brackets */}
                  <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-emerald-400" />
                  <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-emerald-400" />
                  <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-emerald-400" />
                  <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-emerald-400" />
                </div>
              )}

              {isVisionActive && (
                <div className="absolute top-4 right-4 z-20 flex gap-2">
                  {isVisionAnalyzing && (
                    <div className="bg-accent text-black text-[8px] font-black uppercase px-2 py-1 rounded-full animate-bounce">
                      Analyzing...
                    </div>
                  )}
                </div>
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`object-cover bg-slate-900 ${camExpanded ? "w-full h-full" : "w-72 h-56"} ${isVisionActive ? "opacity-100" : "opacity-20"}`}
              />
              <canvas
                ref={canvasRef}
                width="640"
                height="480"
                className="hidden"
              />

              {!isVisionActive && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera className="w-12 h-12 text-faint opacity-50" />
                </div>
              )}

              {isVisionActive && (
                <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20">
                  <div className="px-3 py-1 bg-primary/90 text-white text-[9px] font-black uppercase tracking-widest rounded-full flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" />{" "}
                    {visionStatus}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {isVisionActive && (
                <button
                  onClick={() => {
                    setIsVisionAnalyzing(true);
                    // We rely on the existing loop or can trigger one-off if needed
                    // But for simplicity, we just show feedback
                  }}
                  className="p-4 bg-bg-card/10 hover:bg-bg-card/20 text-white rounded-3xl backdrop-blur-md transition-all active:scale-95 border border-white/5"
                  title="Force Analysis"
                >
                  <Brain className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={isVisionActive ? stopVision : startVision}
                className={`p-5 rounded-3xl shadow-2xl transition-all active:scale-95 flex items-center gap-3 ${
                  isVisionActive ? "bg-emerald-500 scale-105" : "bg-slate-900"
                }`}
              >
                {isVisionActive ? (
                  <>
                    <VideoOff className="w-6 h-6 text-white" />
                    <span className="text-white text-xs font-black uppercase tracking-widest">
                      Stop Vision
                    </span>
                  </>
                ) : (
                  <>
                    <Video className="w-6 h-6 text-white" />
                    <span className="text-white text-xs font-black uppercase tracking-widest">
                      Start Sign Translation
                    </span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
