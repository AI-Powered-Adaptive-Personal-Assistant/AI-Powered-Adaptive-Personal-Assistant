/**
 * Project Euphonia Non-Speech Vocal Sound Trigger Engine.
 *
 * Implements real-time Web Audio API spectral analysis (FFT + pitch/energy detection)
 * allowing individuals with quadriplegia or ALS who cannot speak standard words to trigger
 * commands, selections, and AI prompts using customized vocal sounds (humming, tones, clicks).
 */

import { VocalSoundTriggerConfig, VocalTriggerAction } from '../types';

const STORAGE_KEY = 'cognify_vocal_triggers';

export const DEFAULT_VOCAL_TRIGGERS: VocalSoundTriggerConfig[] = [
  {
    id: 'low-hum',
    name: 'Low Hum / Bass Tone',
    nameAr: 'صوت همهمة منخفضة',
    targetFrequencyHz: 220, // Low pitch vocalization
    minEnergyThreshold: 0.18,
    action: 'select',
    enabled: true,
  },
  {
    id: 'high-tone',
    name: 'High Tone / "Ahhh"',
    nameAr: 'نبرة صوتية عالية',
    targetFrequencyHz: 850, // Mid/High pitch vowel sound
    minEnergyThreshold: 0.20,
    action: 'next',
    enabled: true,
  },
  {
    id: 'sharp-sound',
    name: 'Sharp Sound / Click',
    nameAr: 'صوت حاد أو نقرة',
    targetFrequencyHz: 1800, // High frequency burst
    minEnergyThreshold: 0.28,
    action: 'ask-ai',
    enabled: true,
  },
];

export function loadVocalTriggers(): VocalSoundTriggerConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* fallback to defaults */
  }
  return DEFAULT_VOCAL_TRIGGERS;
}

export function saveVocalTriggers(triggers: VocalSoundTriggerConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(triggers));
  } catch {
    /* ignore */
  }
}

export interface LiveAudioMetrics {
  volume: number;          // Normalized 0 to 1
  peakFrequency: number;   // In Hz
  isTriggering: boolean;
  activeTriggerName?: string;
}

export class VocalSoundEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private triggers: VocalSoundTriggerConfig[] = [];
  private lastTriggerTime = 0;
  private cooldownMs = 650; // Prevents re-triggering while sustaining a sound
  private isRunning = false;

  private onTriggerCallback?: (trigger: VocalSoundTriggerConfig, metrics: LiveAudioMetrics) => void;
  private onMetricsCallback?: (metrics: LiveAudioMetrics) => void;

  constructor() {
    this.triggers = loadVocalTriggers();
  }

  public setTriggers(triggers: VocalSoundTriggerConfig[]) {
    this.triggers = triggers;
    saveVocalTriggers(triggers);
  }

  public getTriggers(): VocalSoundTriggerConfig[] {
    return this.triggers;
  }

  public async start(
    onTrigger?: (trigger: VocalSoundTriggerConfig, metrics: LiveAudioMetrics) => void,
    onMetrics?: (metrics: LiveAudioMetrics) => void
  ): Promise<boolean> {
    if (this.isRunning) return true;
    this.onTriggerCallback = onTrigger;
    this.onMetricsCallback = onMetrics;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.mediaStream = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.65;
      source.connect(this.analyser);

      this.isRunning = true;
      this.processLoop();
      return true;
    } catch (err) {
      console.error('Failed to start Vocal Sound Engine:', err);
      this.stop();
      return false;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {
        /* ignore */
      }
      this.audioCtx = null;
    }
    this.analyser = null;
  }

  private processLoop = (): void => {
    if (!this.isRunning || !this.analyser || !this.audioCtx) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    // Compute RMS volume & Peak Frequency
    let sumSquares = 0;
    let maxVal = 0;
    let maxIndex = 0;

    for (let i = 0; i < bufferLength; i++) {
      const val = dataArray[i];
      sumSquares += val * val;
      if (val > maxVal) {
        maxVal = val;
        maxIndex = i;
      }
    }

    const rms = Math.sqrt(sumSquares / bufferLength) / 255;
    const sampleRate = this.audioCtx.sampleRate;
    const peakFreq = Math.round((maxIndex * sampleRate) / (bufferLength * 2));

    const now = Date.now();
    let triggeredConfig: VocalSoundTriggerConfig | undefined;

    // Check against configured triggers
    if (rms > 0.08 && now - this.lastTriggerTime > this.cooldownMs) {
      for (const config of this.triggers) {
        if (!config.enabled) continue;
        if (rms < config.minEnergyThreshold) continue;

        // Check if frequency is within +/- 35% of target frequency or peak match
        const freqRatio = Math.abs(peakFreq - config.targetFrequencyHz) / Math.max(config.targetFrequencyHz, 100);
        if (freqRatio <= 0.35) {
          triggeredConfig = config;
          this.lastTriggerTime = now;
          break;
        }
      }
    }

    const metrics: LiveAudioMetrics = {
      volume: rms,
      peakFrequency: peakFreq,
      isTriggering: !!triggeredConfig,
      activeTriggerName: triggeredConfig?.name,
    };

    if (this.onMetricsCallback) {
      this.onMetricsCallback(metrics);
    }

    if (triggeredConfig && this.onTriggerCallback) {
      this.onTriggerCallback(triggeredConfig, metrics);
    }

    this.animationFrameId = requestAnimationFrame(this.processLoop);
  };
}

export const vocalSoundEngine = new VocalSoundEngine();
