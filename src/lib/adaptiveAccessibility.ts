/**
 * Phase 6: Adaptive Accessibility & Environmental Context
 * 
 * Implements:
 * 1. Ambient Luminance Analysis (Canvas-based ITU-R BT.601 perceived luminance from video stream).
 * 2. Ambient Noise Monitor (Web Audio AudioContext + AnalyserNode FFT RMS smoothing with safe closure guards).
 * 3. Recommendation engine for dynamic UI adjustments (High Contrast & Live Captions).
 */

export type LuminanceLevel = 'dim' | 'normal' | 'glare';
export type NoiseLevel = 'quiet' | 'moderate' | 'noisy';

export interface AdaptiveRecommendations {
  highContrastRecommended: boolean;
  liveCaptionsRecommended: boolean;
  reasonEn: string;
  reasonAr: string;
}

export interface AmbientNoiseMonitor {
  start: (onNoiseLevel: (level: NoiseLevel, dbApprox: number) => void) => void;
  stop: () => void;
}

/**
 * Analyzes ambient luminance from an active video element.
 * Draws a 32x32 offscreen canvas frame, calculates average perceived luminance:
 * Y = 0.299*R + 0.587*G + 0.114*B
 * 
 * Returns:
 * - 'dim' for average luminance < 40
 * - 'glare' for average luminance > 215
 * - 'normal' otherwise
 */
export function analyzeAmbientLuminance(videoElement: HTMLVideoElement): LuminanceLevel {
  if (
    !videoElement ||
    videoElement.readyState < 2 ||
    videoElement.videoWidth === 0 ||
    videoElement.videoHeight === 0
  ) {
    return 'normal';
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return 'normal';
    }

    ctx.drawImage(videoElement, 0, 0, 32, 32);
    const imageData = ctx.getImageData(0, 0, 32, 32);
    const pixels = imageData.data;

    let totalPerceivedLuminance = 0;
    const pixelCount = 32 * 32;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      totalPerceivedLuminance += 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const averageLuminance = totalPerceivedLuminance / pixelCount;

    if (averageLuminance < 40) {
      return 'dim';
    }
    if (averageLuminance > 215) {
      return 'glare';
    }
    return 'normal';
  } catch (err) {
    console.warn('[AdaptiveA11y] Luminance analysis error:', err);
    return 'normal';
  }
}

/**
 * Creates an ambient acoustic noise monitor using Web Audio API and AnalyserNode.
 * Measures RMS volume smoothly and guards AudioContext closure on stop.
 */
export function createAmbientNoiseMonitor(stream: MediaStream): AmbientNoiseMonitor {
  let isRunning = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let audioCtx: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let analyserNode: AnalyserNode | null = null;

  const stop = () => {
    isRunning = false;

    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }

    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch (err) {
        console.warn('[AdaptiveA11y] Source node disconnect warning:', err);
      }
      sourceNode = null;
    }

    if (analyserNode) {
      try {
        analyserNode.disconnect();
      } catch (err) {
        console.warn('[AdaptiveA11y] Analyser node disconnect warning:', err);
      }
      analyserNode = null;
    }

    if (audioCtx) {
      // Guard AudioContext closure against invalid state errors
      if (audioCtx.state !== 'closed') {
        audioCtx.close().catch((err) => {
          console.warn('[AdaptiveA11y] AudioContext closure warning:', err);
        });
      }
      audioCtx = null;
    }
  };

  const start = (onNoiseLevel: (level: NoiseLevel, dbApprox: number) => void) => {
    if (isRunning) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        console.warn('[AdaptiveA11y] Web Audio API is not supported in this browser.');
        return;
      }

      if (!stream || stream.getAudioTracks().length === 0) {
        console.warn('[AdaptiveA11y] MediaStream does not contain active audio tracks.');
        return;
      }

      audioCtx = new AudioCtxClass();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch((err) => {
          console.warn('[AdaptiveA11y] Failed to resume AudioContext:', err);
        });
      }

      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 512;
      analyserNode.smoothingTimeConstant = 0.8; // Smooth RMS transitions

      sourceNode = audioCtx.createMediaStreamSource(stream);
      // NOTE: Do not connect to audioCtx.destination to prevent speaker acoustic feedback loop
      sourceNode.connect(analyserNode);

      isRunning = true;
      const buffer = new Float32Array(analyserNode.fftSize);

      intervalId = setInterval(() => {
        if (!isRunning || !analyserNode) return;

        if (typeof analyserNode.getFloatTimeDomainData === 'function') {
          analyserNode.getFloatTimeDomainData(buffer);
        } else {
          // Fallback for browsers without getFloatTimeDomainData
          const byteBuffer = new Uint8Array(analyserNode.fftSize);
          analyserNode.getByteTimeDomainData(byteBuffer);
          for (let i = 0; i < byteBuffer.length; i++) {
            buffer[i] = (byteBuffer[i] - 128) / 128;
          }
        }

        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          sumSquares += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sumSquares / buffer.length);

        // Approximate dBSPL from RMS amplitude:
        // Silence noise-floor ≈ 30-35 dB, Conversational speech ≈ 55-65 dB, Loud room > 70 dB
        const clampedRms = Math.max(0.0001, rms);
        const rawDb = 20 * Math.log10(clampedRms) + 95;
        const dbApprox = Math.round(Math.max(30, Math.min(105, rawDb)));

        let level: NoiseLevel = 'quiet';
        if (dbApprox > 70) {
          level = 'noisy';
        } else if (dbApprox >= 50) {
          level = 'moderate';
        } else {
          level = 'quiet';
        }

        onNoiseLevel(level, dbApprox);
      }, 120);
    } catch (err) {
      console.error('[AdaptiveA11y] Failed to start ambient noise monitor:', err);
      stop();
    }
  };

  return {
    start,
    stop,
  };
}

/**
 * Evaluates ambient conditions and user accessibility profile to recommend
 * real-time UI/UX accommodations (e.g. High Contrast, Live Captions).
 */
export function recommendAdaptiveAdjustments(
  luminance: 'dim' | 'normal' | 'glare',
  noiseLevel: 'quiet' | 'moderate' | 'noisy',
  currentA11y: string
): {
  highContrastRecommended: boolean;
  liveCaptionsRecommended: boolean;
  reasonEn: string;
  reasonAr: string;
} {
  const highContrastRecommended = luminance === 'glare' || luminance === 'dim';
  const liveCaptionsRecommended = noiseLevel === 'noisy' || currentA11y === 'Vocal-Deaf' || currentA11y === 'Sign-Only';

  let reasonEn = '';
  let reasonAr = '';

  if (highContrastRecommended && liveCaptionsRecommended) {
    reasonEn = luminance === 'glare'
      ? 'High glare and elevated ambient noise detected. High contrast and live captions are recommended for optimal clarity.'
      : 'Low ambient lighting and elevated noise detected. High contrast and live captions are recommended for optimal clarity.';
    reasonAr = luminance === 'glare'
      ? 'تم رصد وهج ساطع وضوضاء محيطة مرتفعة. يُوصى بتفعيل التباين العالي والتسميات التوضيحية المباشرة لضمان أقصى درجات الوضوح.'
      : 'تم رصد إضاءة منخفضة وضوضاء محيطة مرتفعة. يُوصى بتفعيل التباين العالي والتسميات التوضيحية المباشرة لتقليل الإجهاد وتحسين الوضوح.';
  } else if (highContrastRecommended) {
    if (luminance === 'glare') {
      reasonEn = 'High ambient glare detected. Enabling high-contrast mode improves readability under intense lighting.';
      reasonAr = 'تم رصد سطوع ووهج محيطي عالٍ. تفعيل وضع التباين العالي يرفع وضوح القراءة تحت الإضاءة القوية.';
    } else {
      reasonEn = 'Low ambient lighting detected. High-contrast mode helps reduce eye fatigue in dark environments.';
      reasonAr = 'تم رصد إضاءة محيطية خافتة. وضع التباين العالي يقلل من إجهاد العينين في البيئات المظلمة.';
    }
  } else if (liveCaptionsRecommended) {
    if (noiseLevel === 'noisy') {
      reasonEn = 'Loud background noise detected. Live captions will help you follow explanations without missing key details.';
      reasonAr = 'تم رصد ضوضاء محيطة صاخبة. التسميات التوضيحية المباشرة تمكنك من متابعة الشرح بوضوح دون تفويت التفاصيل.';
    } else {
      reasonEn = 'Live captions enabled to assist your active accessibility preference.';
      reasonAr = 'تم تفعيل التسميات التوضيحية لدعم تفضيلات إمكانية الوصول الحالية.';
    }
  } else {
    reasonEn = 'Ambient lighting and acoustic levels are optimal for standard viewing and audio.';
    reasonAr = 'مستويات الإضاءة والصوت المحيطة مثالية ومناسبة للتعلم دون حاجة لتعديلات إضافية.';
  }

  return {
    highContrastRecommended,
    liveCaptionsRecommended,
    reasonEn,
    reasonAr,
  };
}
