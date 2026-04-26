import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Sparkles, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { geminiService } from '../services/geminiService';

interface LiveCaptionsProps {
  language?: string;
  onClose: () => void;
}

export default function LiveCaptions({ language = 'en-US', onClose }: LiveCaptionsProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [volume, setVolume] = useState(0);
  const [enhancedText, setEnhancedText] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Check for Browser Support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Try Chrome.");
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = true;
    recognition.interimResults = true; // CRITICAL for "quick" live feedback
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      startAudioLevelTracking();
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error);
      if (event.error === 'not-allowed') {
        setError("Microphone access denied.");
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

      // AI Enhancement Trigger
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = setTimeout(async () => {
        const fullText = transcript + ' ' + interimStr;
        if (fullText.trim().length > 15) {
          handleEnhancement(fullText.trim());
        }
      }, 2500);
    };

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      stopAudioLevelTracking();
    };
  }, [language]);

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
      console.error("Audio track failed", e);
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
        console.error("Start failed", e);
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

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-white overflow-hidden"
    >
      {/* Header Controls */}
      <div className="absolute top-8 left-0 right-0 px-8 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs font-black uppercase tracking-[0.2em] text-white/50">
            {isListening ? "Listening Live" : "Standby"}
          </span>
        </div>
        
        <button 
          onClick={onClose}
          className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Caption Block */}
      <div className="w-full max-w-4xl flex flex-col items-center text-center gap-12">
        <AnimatePresence mode="wait">
          {enhancedText ? (
            <motion.div
              key="enhanced"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative group"
            >
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 bg-primary/20 border border-primary/30 rounded-full">
                <Sparkles className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">AI Simplified</span>
              </div>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-black leading-[1.1] tracking-tight bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent italic">
                "{enhancedText}"
              </h1>
              <button 
                onClick={() => { setEnhancedText(''); setTranscript(''); }}
                className="mt-8 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors"
              >
                Clear All
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="transcript"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex flex-col gap-4"
            >
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight text-white mb-4">
                {transcript}
              </h1>
              <h2 className="text-3xl md:text-5xl lg:text-6xl font-medium leading-tight text-white/40 italic">
                {interimTranscript || (!transcript && "Waiting for speech...")}
              </h2>
            </motion.div>
          )}
        </AnimatePresence>

        {isEnhancing && (
          <div className="flex items-center gap-2 text-primary">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-xs font-bold uppercase tracking-widest">Optimizing...</span>
          </div>
        )}
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-6 py-3 rounded-2xl font-bold backdrop-blur-md shadow-2xl border border-red-400"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Controls */}
      <div className="absolute bottom-12 flex flex-col items-center gap-6">
        <div className="relative">
          {/* Audio Visualizer Rings */}
          <AnimatePresence>
            {isListening && volume > 10 && (
              <>
                <motion.div 
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1 + (volume / 100), opacity: 0 }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-full bg-red-500/30 -z-10"
                />
                <motion.div 
                  initial={{ scale: 1, opacity: 0.3 }}
                  animate={{ scale: 1 + (volume / 60), opacity: 0 }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
                  className="absolute inset-0 rounded-full bg-red-500/20 -z-20"
                />
              </>
            )}
          </AnimatePresence>

          <button
            onClick={toggleListening}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl z-10 relative ${
              isListening 
              ? 'bg-red-500 hover:bg-red-600 scale-110 shadow-red-500/50' 
              : 'bg-white text-black hover:bg-white/90 shadow-white/20 hover:scale-105'
            }`}
          >
            {isListening ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
          </button>
        </div>
        
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">
          {isListening ? "Tap to Stop" : "Tap to Speak"}
        </p>
      </div>
    </motion.div>
  );
}
