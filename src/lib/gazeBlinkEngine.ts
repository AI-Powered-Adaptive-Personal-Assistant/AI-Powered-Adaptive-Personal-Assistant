import { FacialGestureState } from './facialHeadTracker';

export interface GazeBlinkConfig {
  blinkRatioThreshold: number; // PySource p.2 default: 5.7
  blinkMinDurationMs: number;
  blinkMaxDurationMs: number;
  blinkCooldownMs: number;
  gazeLeftThreshold: number;   // normalized offset (-0.15)
  gazeRightThreshold: number;  // normalized offset (+0.15)
  gazeLeftRatioThreshold: number;  // PySource p.3/p.4 default: 0.85
  gazeRightRatioThreshold: number; // PySource p.3/p.4 default: 1.20
  gazeStabilityMs: number;
  audioEnabled: boolean;
  audioVolume: number;
}

export const DEFAULT_GAZE_BLINK_CONFIG: GazeBlinkConfig = {
  blinkRatioThreshold: 5.7,
  blinkMinDurationMs: 150,
  blinkMaxDurationMs: 500,
  blinkCooldownMs: 300,
  gazeLeftThreshold: -0.15,
  gazeRightThreshold: 0.15,
  gazeLeftRatioThreshold: 0.85,
  gazeRightRatioThreshold: 1.20,
  gazeStabilityMs: 300,
  audioEnabled: true,
  audioVolume: 0.5,
};

export type GazeDirection = 'left' | 'right' | 'center';

export interface GazeBlinkState {
  gazeDirection: GazeDirection;
  isBlinkClick: boolean;
  eyesClosed: boolean;
  blinkingRatio: number;
  gazeRatio: number;
  blinkDurationMs: number;
  gazeStabilityMs: number;
  totalBlinks: number;
  lastBlinkTimestamp: number;
}

export class GazeBlinkEngine {
  private config: GazeBlinkConfig;
  private audioCtx: AudioContext | null = null;

  // Blink state
  private blinkStartTime: number = 0;
  private lastBlinkEndTime: number = 0;
  private totalBlinks: number = 0;
  private wasEyesClosed: boolean = false;
  private isBlinkClickEvt: boolean = false;
  
  // Gaze state
  private currentDirection: GazeDirection = 'center';
  private targetDirection: GazeDirection = 'center';
  private directionStartTime: number = 0;

  constructor(config?: Partial<GazeBlinkConfig>) {
    this.config = { ...DEFAULT_GAZE_BLINK_CONFIG, ...config };
    this.initAudio();
  }

  private initAudio() {
    if (typeof window !== 'undefined' && window.AudioContext) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private playClickSound() {
    if (!this.config.audioEnabled || !this.audioCtx) return;
    
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.audioCtx.currentTime + 0.1);

    gain.gain.setValueAtTime(this.config.audioVolume, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.1);
  }

  private playDirectionSound() {
    if (!this.config.audioEnabled || !this.audioCtx) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, this.audioCtx.currentTime);
    
    gain.gain.setValueAtTime(this.config.audioVolume * 0.3, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.05);
  }

  public updateConfig(config: Partial<GazeBlinkConfig>) {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): GazeBlinkConfig {
    return { ...this.config };
  }

  public update(gestureState: FacialGestureState, timestamp?: number): GazeBlinkState {
    const now = timestamp || performance.now();
    this.isBlinkClickEvt = false;

    // --- Blink Detection (PySource p.2 Blinking Ratio) ---
    const blinkingRatio = gestureState.metrics?.blinkingRatio ?? (gestureState.metrics?.avgEAR ? 1 / gestureState.metrics.avgEAR : 3.5);
    const isEyesClosed = Boolean(gestureState.isBlinking || blinkingRatio > this.config.blinkRatioThreshold);
    let blinkDurationMs = 0;

    if (isEyesClosed) {
      if (!this.wasEyesClosed) {
        this.blinkStartTime = now;
      }
      blinkDurationMs = now - this.blinkStartTime;
    } else {
      if (this.wasEyesClosed) {
        const duration = now - this.blinkStartTime;
        const timeSinceLastBlink = now - this.lastBlinkEndTime;
        
        if (
          duration >= this.config.blinkMinDurationMs && 
          duration <= this.config.blinkMaxDurationMs &&
          timeSinceLastBlink >= this.config.blinkCooldownMs
        ) {
          // Valid blink click
          this.isBlinkClickEvt = true;
          this.totalBlinks++;
          this.lastBlinkEndTime = now;
          this.playClickSound();
        }
      }
    }
    this.wasEyesClosed = isEyesClosed;

    // --- Gaze Direction (PySource Part 3 & 4 Gaze Ratio) ---
    let newTargetDirection: GazeDirection = 'center';
    const gazeRatio = gestureState.metrics?.gazeRatio ?? 1.0;
    const gazeX = gestureState.metrics?.gazeVector?.x || 0;

    if (gestureState.metrics?.gazeRatio !== undefined) {
      if (gazeRatio < this.config.gazeLeftRatioThreshold) {
        newTargetDirection = 'left';
      } else if (gazeRatio > this.config.gazeRightRatioThreshold) {
        newTargetDirection = 'right';
      }
    } else {
      if (gazeX < this.config.gazeLeftThreshold) {
        newTargetDirection = 'left';
      } else if (gazeX > this.config.gazeRightThreshold) {
        newTargetDirection = 'right';
      }
    }

    if (newTargetDirection !== this.targetDirection) {
      this.targetDirection = newTargetDirection;
      this.directionStartTime = now;
    }

    const gazeStabilityMs = now - this.directionStartTime;

    if (this.targetDirection !== this.currentDirection && gazeStabilityMs >= this.config.gazeStabilityMs) {
      this.currentDirection = this.targetDirection;
      this.playDirectionSound();
    }

    return {
      gazeDirection: this.currentDirection,
      isBlinkClick: this.isBlinkClickEvt,
      eyesClosed: isEyesClosed,
      blinkingRatio,
      gazeRatio,
      blinkDurationMs: isEyesClosed ? blinkDurationMs : 0,
      gazeStabilityMs: gazeStabilityMs,
      totalBlinks: this.totalBlinks,
      lastBlinkTimestamp: this.lastBlinkEndTime
    };
  }

  public getDirection(): GazeDirection {
    return this.currentDirection;
  }

  public isBlinkClick(): boolean {
    return this.isBlinkClickEvt;
  }

  public reset() {
    this.blinkStartTime = 0;
    this.lastBlinkEndTime = 0;
    this.totalBlinks = 0;
    this.wasEyesClosed = false;
    this.isBlinkClickEvt = false;
    this.currentDirection = 'center';
    this.targetDirection = 'center';
    this.directionStartTime = 0;
  }

  public destroy() {
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(console.error);
    }
  }
}
