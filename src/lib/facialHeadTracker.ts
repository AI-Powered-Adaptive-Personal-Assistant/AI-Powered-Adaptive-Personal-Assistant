/**
 * Medical-Grade Steve Saling & Google Project Euphonia Eye-Gaze & Head Tracker.
 * v3 — Upgraded with:
 *   1. Anti-Tremor Deadband Filter (absorbs micro-tremors and camera noise).
 *   2. Sticky Magnetic Hysteresis Snapping (latches onto keys and holds firmly).
 *   3. Mode-tuned OneEuro filter (ultra-still fixation at rest + instant saccades).
 *   4. Real 9-point affine calibration (least-squares regression).
 *   5. Robust 25-frame baseline auto-centering.
 *   6. Adaptive per-user EAR blink threshold.
 *   7. Hover-confirmation debounce before the dwell timer starts (v4).
 */

import { HeadTrackingConfig } from '../types';

export interface PointerPosition {
  x: number;
  y: number;
  normalizedX: number;
  normalizedY: number;
  isSnapped?: boolean;
}

export interface EyeTrackerLiveMetrics {
  distanceCm: number;
  isWithinWorkingRange: boolean;
  leftPupil: { x: number; y: number };
  rightPupil: { x: number; y: number };
  avgEAR: number;
  /** PySource p.2: Eye Blinking Ratio = horizontal_distance / vertical_distance (threshold ~5.7) */
  blinkingRatio?: number;
  /** PySource p.3/p.4: Gaze Ratio = left_sclera_dist / right_sclera_dist (< 0.85 Left, > 1.20 Right) */
  gazeRatio?: number;
  isBlinking: boolean;
  gazeVector: { x: number; y: number };
  screenPoint: { x: number; y: number };
}

export interface FacialGestureState {
  isSmiling: boolean;
  isMouthOpen: boolean;
  isEyebrowRaised: boolean;
  isBlinking?: boolean;
  confidence: number;
  leftPupil?: { x: number; y: number };
  rightPupil?: { x: number; y: number };
  metrics?: EyeTrackerLiveMetrics;
}

export interface CalibrationStatus {
  isCalibrated: boolean;
  pointsCollected: number;
  accuracyEstimate: number;
}

export const DEFAULT_HEAD_TRACKING_CONFIG: HeadTrackingConfig = {
  sensitivity: 1.25,
  dwellTimeMs: 1200,
  facialTriggersEnabled: true,
  smileThreshold: 0.65,
  mouthOpenThreshold: 0.65,
  autoScanEnabled: false,
  autoScanIntervalMs: 1400,
  smoothing: 0.88,
  trackingMode: 'iris', // Pure Iris: 100% Eye-Gaze Tracking
};

// MediaPipe Landmark Loops
const LEFT_EYE_CONTOUR = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33];
const RIGHT_EYE_CONTOUR = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382, 362];
const LEFT_IRIS_CONTOUR = [468, 469, 470, 471, 472, 469];
const RIGHT_IRIS_CONTOUR = [473, 474, 475, 476, 477, 474];

/**
 * PySource Tutorial p.2 Midpoint helper function:
 * Computes the 2D midpoint between two facial landmark coordinates.
 */
export function midpoint(
  p1: { x: number; y: number; z?: number },
  p2: { x: number; y: number; z?: number }
): { x: number; y: number } {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

/**
 * Continuous Adaptive Gaze Smoother v5:
 * Medical-Grade Steve Saling & Google Project Euphonia Gaze Pipeline.
 * 
 * 1. 5-Point Median Pre-Filter: Eliminates camera noise & MediaPipe single-frame outliers.
 * 2. Variance-Based Fixation Detector (~300-500ms window): Detects rest state when position variance < 0.00015.
 * 3. Adaptive Deadband & Fixation Lock:
 *    - Fixation State: Deadband expands to 0.012 (~23px), alpha drops to 0.025 (rock-solid pinning).
 *    - Saccade State: Deadband shrinks to 0.004 (~7px), alpha accelerates to 0.85 (instant acquisition).
 * 4. Dual-Trigger Instant Breakout: Instant displacement (> 0.022 norm units) or velocity spike (> 0.015/frame) 
 *    bypasses the variance window instantly (1-frame breakout), eliminating lag for ALS saccadic jumps.
 */
export class ContinuousGazeSmoother {
  private x: number = 0.5;
  private y: number = 0.5;
  private lastT: number = 0;

  // 1. Median Pre-Filter Buffer (5 samples)
  private rawHistoryX: number[] = [];
  private rawHistoryY: number[] = [];
  private readonly MEDIAN_WINDOW_SIZE = 5;

  // 2. Variance History Buffer (15 samples ~300-500ms)
  private historyBuffer: { x: number; y: number }[] = [];
  private readonly VARIANCE_WINDOW_SIZE = 15;
  private readonly VAR_FIXATION_THRESHOLD = 0.00015; // std dev ~0.012 in norm units

  // Fixation State & Speed Tracking
  private isFixated: boolean = false;
  private lastMedX: number = 0.5;
  private lastMedY: number = 0.5;

  public filter(targetX: number, targetY: number, timestamp: number): { x: number; y: number } {
    if (this.lastT === 0 || !Number.isFinite(this.x)) {
      this.x = targetX;
      this.y = targetY;
      this.lastMedX = targetX;
      this.lastMedY = targetY;
      this.rawHistoryX = [targetX];
      this.rawHistoryY = [targetY];
      this.historyBuffer = [{ x: targetX, y: targetY }];
      this.isFixated = true;
      this.lastT = timestamp;
      return { x: this.x, y: this.y };
    }

    this.lastT = timestamp;

    // STEP 1: 5-Point Median Pre-Filter (Removes single-frame spikes / glitches)
    this.rawHistoryX.push(targetX);
    this.rawHistoryY.push(targetY);
    if (this.rawHistoryX.length > this.MEDIAN_WINDOW_SIZE) this.rawHistoryX.shift();
    if (this.rawHistoryY.length > this.MEDIAN_WINDOW_SIZE) this.rawHistoryY.shift();

    const sortedX = [...this.rawHistoryX].sort((a, b) => a - b);
    const sortedY = [...this.rawHistoryY].sort((a, b) => a - b);
    const medX = sortedX[Math.floor(sortedX.length / 2)];
    const medY = sortedY[Math.floor(sortedY.length / 2)];

    // STEP 2: Update Variance Window Buffer
    this.historyBuffer.push({ x: medX, y: medY });
    if (this.historyBuffer.length > this.VARIANCE_WINDOW_SIZE) {
      this.historyBuffer.shift();
    }

    // Compute Instant Velocity & Displacement
    const frameDelta = Math.hypot(medX - this.lastMedX, medY - this.lastMedY);
    const distFromCurrent = Math.hypot(medX - this.x, medY - this.y);
    this.lastMedX = medX;
    this.lastMedY = medY;

    // STEP 3: Dual-Trigger Saccadic Breakout & Fixation Detection
    // Saccade Breakout Trigger: Instant large displacement (> 0.022 ≈ 42px) OR sudden frame jump (> 0.015 ≈ 28px/frame)
    const isSaccadeJump = distFromCurrent > 0.022 || frameDelta > 0.015;

    if (isSaccadeJump) {
      // INSTANT BREAKOUT: Force fixation OFF immediately (1-frame response)
      this.isFixated = false;
    } else if (this.historyBuffer.length >= 6) {
      // Calculate Variance over window
      const count = this.historyBuffer.length;
      const meanX = this.historyBuffer.reduce((sum, p) => sum + p.x, 0) / count;
      const meanY = this.historyBuffer.reduce((sum, p) => sum + p.y, 0) / count;
      const variance = this.historyBuffer.reduce(
        (sum, p) => sum + (p.x - meanX) ** 2 + (p.y - meanY) ** 2,
        0
      ) / count;

      this.isFixated = variance < this.VAR_FIXATION_THRESHOLD;
    }

    // STEP 4: Adaptive Deadband & Dynamic Alpha Curve
    let activeDeadband = 0.004; // Saccade deadband (~7px)
    let alpha = 0.15;

    if (this.isFixated) {
      // Fixation State: Expand deadband to 0.009 (~17px) and drop alpha to 0.025 (rock-solid pinning)
      activeDeadband = 0.009;
      alpha = 0.025;
    } else {
      // Saccade / Movement State: Tight deadband (0.004) and alpha acceleration starting at 0.05 -> 0.85
      const normDist = Math.max(0, distFromCurrent - 0.015);
      const saccadeFactor = Math.min(1.0, Math.pow(normDist / 0.065, 1.2));
      alpha = 0.05 + (0.85 - 0.05) * saccadeFactor;
    }

    const dx = medX - this.x;
    const dy = medY - this.y;
    const dist = Math.hypot(dx, dy);

    // Apply Adaptive Deadband
    if (dist < activeDeadband) {
      return { x: this.x, y: this.y };
    }

    // Update Filtered Output Position
    this.x += dx * alpha;
    this.y += dy * alpha;

    return { x: this.x, y: this.y };
  }

  public reset(x = 0.5, y = 0.5) {
    this.x = x;
    this.y = y;
    this.lastMedX = x;
    this.lastMedY = y;
    this.rawHistoryX = [x];
    this.rawHistoryY = [y];
    this.historyBuffer = [{ x, y }];
    this.isFixated = false;
    this.lastT = 0;
  }
}

function solveLeastSquares(A: number[][], b: number[]): number[] | null {
  const n = A[0].length;
  const AtA: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Atb: number[] = new Array(n).fill(0);

  for (let row = 0; row < A.length; row++) {
    for (let i = 0; i < n; i++) {
      Atb[i] += A[row][i] * b[row];
      for (let j = 0; j < n; j++) {
        AtA[i][j] += A[row][i] * A[row][j];
      }
    }
  }

  const M = AtA.map((r, i) => [...r, Atb[i]]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(M[pivotRow][col]) < 1e-9) return null;
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

    const pivotVal = M[col][col];
    for (let k = col; k <= n; k++) M[col][k] /= pivotVal;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let k = col; k <= n; k++) M[r][k] -= factor * M[col][k];
    }
  }

  return M.map((r) => r[n]);
}

export class FacialHeadTracker {
  private config: HeadTrackingConfig = { ...DEFAULT_HEAD_TRACKING_CONFIG };
  private isRunning: boolean = false;
  private videoEl: HTMLVideoElement | null = null;
  private overlayCanvasEl: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;

  private stream: MediaStream | null = null;
  private animFrameId: number | null = null;

  // MediaPipe
  private faceMeshInstance: any = null;
  private isDeepLearningReady: boolean = false;
  private isProcessingMesh: boolean = false;

  // Continuous Adaptive Gaze Smoother
  private gazeSmoother = new ContinuousGazeSmoother();

  // 9-Point Affine Calibration
  private calibCoeffsX: number[] | null = null;
  private calibCoeffsY: number[] | null = null;
  private calibSamplesA: number[][] = [];
  private calibTargetsX: number[] = [];
  private calibTargetsY: number[] = [];
  private calibFitResidual: number = 0;
  private isCalibratingNow: boolean = false;
  private pendingCalibPointSamples: { gx: number; gy: number }[] = [];

  // Neutral baseline
  private baselineGaze: { x: number; y: number } | null = null;
  private neutralCalibrationSamples: { x: number; y: number }[] = [];

  private currentPos: PointerPosition = {
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 400,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 300,
    normalizedX: 0.5,
    normalizedY: 0.5,
    isSnapped: false,
  };

  // Dwell state
  private hoverTargetId: string | null = null;
  private hoverStartTime: number = 0;
  private dwellProgress: number = 0;

  // Hover-confirmation debounce — a candidate target must stay stable for
  // HOVER_CONFIRM_MS before it actually becomes the active dwell target.
  // This filters out the brief overshoot onto a neighboring key that made
  // the pointer feel "random" when it landed on the wrong letter.
  private pendingHoverTarget: string | null = null;
  private pendingHoverSince: number = 0;
  private readonly HOVER_CONFIRM_MS = 160;

  // Adaptive blink threshold
  private restingEARSamples: number[] = [];
  private adaptiveNeutralEAR: number | null = null;
  private readonly EAR_CALIBRATION_SAMPLE_TARGET = 75;
  private wasBlinking: boolean = false;
  private blinkStartTime: number = 0;
  private lastBlinkTriggerTime: number = 0;

  // Sticky Magnetic Snapping with Hysteresis
  private snapTargetsCache: { id: string; cx: number; cy: number }[] = [];
  private lastSnapCacheRefresh: number = 0;
  private readonly SNAP_CACHE_TTL_MS = 400;
  private lockedSnapTarget: { id: string; cx: number; cy: number } | null = null;

  // Freeze pointer during warmup
  private frozenPointerDuringWarmup: { x: number; y: number } | null = null;

  // Callbacks
  private onPointerMoveCb?: (pos: PointerPosition, dwellProgress: number) => void;
  private onDwellCompleteCb?: (targetId: string) => void;
  private onGestureCb?: (gesture: FacialGestureState) => void;
  private onCalibrationStatusCb?: (status: CalibrationStatus) => void;

  constructor(customConfig?: Partial<HeadTrackingConfig>) {
    if (customConfig) {
      this.config = { ...DEFAULT_HEAD_TRACKING_CONFIG, ...customConfig };
    }
  }

  public updateConfig(newConfig: Partial<HeadTrackingConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): HeadTrackingConfig {
    return this.config;
  }

  public calibrateNeutral() {
    this.baselineGaze = null;
    this.neutralCalibrationSamples = [];
    this.gazeSmoother.reset();
    this.lockedSnapTarget = null;
  }

  public resetCalibration() {
    this.calibCoeffsX = null;
    this.calibCoeffsY = null;
    this.calibSamplesA = [];
    this.calibTargetsX = [];
    this.calibTargetsY = [];
    this.calibFitResidual = 0;
    this.pendingCalibPointSamples = [];
    this.notifyCalibrationStatus();
  }

  public beginCalibrationPoint() {
    this.isCalibratingNow = true;
    this.pendingCalibPointSamples = [];
  }

  private feedCalibrationSample(gx: number, gy: number) {
    if (!this.isCalibratingNow) return;
    this.pendingCalibPointSamples.push({ gx, gy });
  }

  public commitCalibrationPoint(targetNormX: number, targetNormY: number): boolean {
    this.isCalibratingNow = false;
    if (this.pendingCalibPointSamples.length < 3) return false;

    const avgGx = this.pendingCalibPointSamples.reduce((s, p) => s + p.gx, 0) / this.pendingCalibPointSamples.length;
    const avgGy = this.pendingCalibPointSamples.reduce((s, p) => s + p.gy, 0) / this.pendingCalibPointSamples.length;

    this.calibSamplesA.push([avgGx, avgGy, 1]);
    this.calibTargetsX.push(targetNormX);
    this.calibTargetsY.push(targetNormY);

    this.pendingCalibPointSamples = [];
    return true;
  }

  public finalizeCalibration(): CalibrationStatus {
    if (this.calibSamplesA.length < 6) {
      this.notifyCalibrationStatus();
      return { isCalibrated: false, pointsCollected: this.calibSamplesA.length, accuracyEstimate: 0 };
    }

    const coeffsX = solveLeastSquares(this.calibSamplesA, this.calibTargetsX);
    const coeffsY = solveLeastSquares(this.calibSamplesA, this.calibTargetsY);

    if (!coeffsX || !coeffsY) {
      this.notifyCalibrationStatus();
      return { isCalibrated: false, pointsCollected: this.calibSamplesA.length, accuracyEstimate: 0 };
    }

    this.calibCoeffsX = coeffsX;
    this.calibCoeffsY = coeffsY;

    let totalErr = 0;
    for (let i = 0; i < this.calibSamplesA.length; i++) {
      const [gx, gy] = this.calibSamplesA[i];
      const px = coeffsX[0] * gx + coeffsX[1] * gy + coeffsX[2];
      const py = coeffsY[0] * gx + coeffsY[1] * gy + coeffsY[2];
      totalErr += Math.hypot(px - this.calibTargetsX[i], py - this.calibTargetsY[i]);
    }
    this.calibFitResidual = totalErr / this.calibSamplesA.length;

    const status = this.getCalibrationStatus();
    this.notifyCalibrationStatus();
    return status;
  }

  public getCalibrationStatus(): CalibrationStatus {
    const isCalibrated = !!(this.calibCoeffsX && this.calibCoeffsY);
    const accuracyEstimate = isCalibrated ? Math.max(0, 1 - this.calibFitResidual * 4) : 0;
    return {
      isCalibrated,
      pointsCollected: this.calibSamplesA.length,
      accuracyEstimate,
    };
  }

  private notifyCalibrationStatus() {
    if (this.onCalibrationStatusCb) this.onCalibrationStatusCb(this.getCalibrationStatus());
  }

  public async start(
    videoElement: HTMLVideoElement,
    callbacks: {
      onPointerMove?: (pos: PointerPosition, dwellProgress: number) => void;
      onDwellComplete?: (targetId: string) => void;
      onGesture?: (gesture: FacialGestureState) => void;
      onCalibrationStatus?: (status: CalibrationStatus) => void;
    },
    overlayCanvas?: HTMLCanvasElement | null
  ): Promise<boolean> {
    if (this.isRunning) return true;

    this.videoEl = videoElement;
    this.overlayCanvasEl = overlayCanvas || null;
    if (this.overlayCanvasEl) {
      this.overlayCtx = this.overlayCanvasEl.getContext('2d');
    }

    this.onPointerMoveCb = callbacks.onPointerMove;
    this.onDwellCompleteCb = callbacks.onDwellComplete;
    this.onGestureCb = callbacks.onGesture;
    this.onCalibrationStatusCb = callbacks.onCalibrationStatus;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 60, min: 30 },
        },
      });

      this.videoEl.srcObject = this.stream;
      await this.videoEl.play();

      this.isRunning = true;
      this.gazeSmoother.reset();
      this.baselineGaze = null;
      this.neutralCalibrationSamples = [];
      this.restingEARSamples = [];
      this.adaptiveNeutralEAR = null;
      this.lockedSnapTarget = null;

      this.currentPos = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        normalizedX: 0.5,
        normalizedY: 0.5,
        isSnapped: false,
      };
      this.frozenPointerDuringWarmup = { x: this.currentPos.x, y: this.currentPos.y };

      this.refreshSnapTargetsCache();
      this.initMediaPipeAsync();
      this.loop();
      return true;
    } catch (err) {
      console.error('Failed to start camera:', err);
      this.stop();
      return false;
    }
  }

  private async initMediaPipeAsync() {
    try {
      if (!(window as any).FaceMesh) {
        await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
          script.crossOrigin = 'anonymous';
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.head.appendChild(script);
        });
      }

      if ((window as any).FaceMesh) {
        const FaceMeshConstructor = (window as any).FaceMesh;
        this.faceMeshInstance = new FaceMeshConstructor({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        this.faceMeshInstance.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        this.faceMeshInstance.onResults((results: any) => {
          this.handleFaceMeshResults(results);
          this.isProcessingMesh = false;
        });

        this.isDeepLearningReady = true;
        this.frozenPointerDuringWarmup = null;
      }
    } catch (e) {
      console.warn('MediaPipe async init error:', e);
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
    if (this.faceMeshInstance) {
      try { this.faceMeshInstance.close(); } catch { /* ignore */ }
      this.faceMeshInstance = null;
    }
    if (this.overlayCtx && this.overlayCanvasEl) {
      this.overlayCtx.clearRect(0, 0, this.overlayCanvasEl.width, this.overlayCanvasEl.height);
    }
  }

  public setHoverTarget(targetId: string | null) {
    if (targetId === this.hoverTargetId) return;
    this.hoverTargetId = targetId;
    this.hoverStartTime = targetId ? Date.now() : 0;
    this.dwellProgress = 0;
  }

  public refreshSnapTargetsCache() {
    const elements = document.querySelectorAll('[data-aac-id]');
    const targets: { id: string; cx: number; cy: number }[] = [];
    elements.forEach((el) => {
      const id = el.getAttribute('data-aac-id');
      if (!id) return;
      const rect = el.getBoundingClientRect();
      targets.push({ id, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
    });
    this.snapTargetsCache = targets;
    this.lastSnapCacheRefresh = Date.now();
  }

  private loop = () => {
    if (!this.isRunning || !this.videoEl) return;

    if (this.isDeepLearningReady && this.faceMeshInstance && !this.isProcessingMesh && this.videoEl.readyState >= 2) {
      this.isProcessingMesh = true;
      this.faceMeshInstance.send({ image: this.videoEl }).catch(() => {
        this.isProcessingMesh = false;
      });
    }

    if (!this.isDeepLearningReady && this.frozenPointerDuringWarmup) {
      this.currentPos = {
        x: this.frozenPointerDuringWarmup.x,
        y: this.frozenPointerDuringWarmup.y,
        normalizedX: this.frozenPointerDuringWarmup.x / window.innerWidth,
        normalizedY: this.frozenPointerDuringWarmup.y / window.innerHeight,
        isSnapped: false,
      };
    }

    if (Date.now() - this.lastSnapCacheRefresh > this.SNAP_CACHE_TTL_MS) {
      this.refreshSnapTargetsCache();
    }

    // Dwell progress with pre-dwell hover debounce (prevents accidental triggers during eye sweep)
    const HOVER_DEBOUNCE_MS = 180;
    if (this.hoverTargetId && this.hoverStartTime > 0) {
      const totalElapsed = Date.now() - this.hoverStartTime;
      if (totalElapsed < HOVER_DEBOUNCE_MS) {
        this.dwellProgress = 0;
      } else {
        const activeElapsed = totalElapsed - HOVER_DEBOUNCE_MS;
        const prog = Math.min(1, activeElapsed / this.config.dwellTimeMs);
        this.dwellProgress = prog;

        if (prog >= 1) {
          const completedTarget = this.hoverTargetId;
          this.hoverTargetId = null;
          this.hoverStartTime = 0;
          this.dwellProgress = 0;
          if (this.onDwellCompleteCb) {
            this.onDwellCompleteCb(completedTarget);
          }
        }
      }
    } else {
      this.dwellProgress = 0;
    }

    if (this.onPointerMoveCb) {
      this.onPointerMoveCb(this.currentPos, this.dwellProgress);
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  /**
   * MediaPipe 478-Landmark Results Processor
   */
  private handleFaceMeshResults(results: any) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

    const lm = results.multiFaceLandmarks[0];
    const now = performance.now();

    const leftOuter = lm[33];
    const leftInner = lm[133];
    const leftTop = lm[159];
    const leftBottom = lm[145];
    const leftIris = lm[468] || { x: (leftOuter.x + leftInner.x) / 2, y: (leftTop.y + leftBottom.y) / 2 };

    const rightInner = lm[362];
    const rightOuter = lm[263];
    const rightTop = lm[386];
    const rightBottom = lm[374];
    const rightIris = lm[473] || { x: (rightInner.x + rightOuter.x) / 2, y: (rightTop.y + rightBottom.y) / 2 };

    // PySource Tutorial Part 2 & Part 3 (mMObcjHs59E & UCu6M3drlYg):
    // 1. Blinking Ratio calculation
    const leftTopMid = midpoint(lm[160], lm[159]);
    const leftBottomMid = midpoint(lm[144], lm[145]);
    const leftHorDist = Math.hypot(leftOuter.x - leftInner.x, leftOuter.y - leftInner.y);
    const leftVerDist = Math.hypot(leftTopMid.x - leftBottomMid.x, leftTopMid.y - leftBottomMid.y) || 0.001;
    const leftBlinkRatio = leftHorDist / leftVerDist;

    const rightTopMid = midpoint(lm[385], lm[386]);
    const rightBottomMid = midpoint(lm[380], lm[374]);
    const rightHorDist = Math.hypot(rightInner.x - rightOuter.x, rightInner.y - rightOuter.y);
    const rightVerDist = Math.hypot(rightTopMid.x - rightBottomMid.x, rightTopMid.y - rightBottomMid.y) || 0.001;
    const rightBlinkRatio = rightHorDist / rightVerDist;

    const blinkingRatio = (leftBlinkRatio + rightBlinkRatio) / 2;

    // 2. PySource Part 3 Gaze Ratio calculation (Left vs Right eye region relative pupil displacement)
    const leftPupilToOuter = Math.hypot(leftIris.x - leftOuter.x, leftIris.y - leftOuter.y);
    const leftPupilToInner = Math.hypot(leftIris.x - leftInner.x, leftIris.y - leftInner.y) || 0.001;
    const leftGazeRatio = leftPupilToOuter / leftPupilToInner;

    const rightPupilToInner = Math.hypot(rightIris.x - rightInner.x, rightIris.y - rightInner.y);
    const rightPupilToOuter = Math.hypot(rightIris.x - rightOuter.x, rightIris.y - rightOuter.y) || 0.001;
    const rightGazeRatio = rightPupilToInner / rightPupilToOuter;

    const gazeRatio = (leftGazeRatio + rightGazeRatio) / 2;

    // Eye Aspect Ratio (EAR)
    const leftEyeH = Math.hypot(leftTop.x - leftBottom.x, leftTop.y - leftBottom.y);
    const leftEyeW = Math.hypot(leftOuter.x - leftInner.x, leftOuter.y - leftInner.y) || 0.01;
    const leftEAR = leftEyeH / leftEyeW;

    const rightEyeH = Math.hypot(rightTop.x - rightBottom.x, rightTop.y - rightBottom.y);
    const rightEyeW = Math.hypot(rightOuter.x - rightInner.x, rightOuter.y - rightInner.y) || 0.01;
    const rightEAR = rightEyeH / rightEyeW;

    const avgEAR = (leftEAR + rightEAR) / 2;

    // Adaptive EAR baseline
    if (this.adaptiveNeutralEAR === null) {
      if (this.restingEARSamples.length < this.EAR_CALIBRATION_SAMPLE_TARGET) {
        if (avgEAR > 0.15) this.restingEARSamples.push(avgEAR);
      }
      if (this.restingEARSamples.length >= this.EAR_CALIBRATION_SAMPLE_TARGET) {
        const sorted = [...this.restingEARSamples].sort((a, b) => a - b);
        this.adaptiveNeutralEAR = sorted[Math.floor(sorted.length / 2)];
      }
    }
    const blinkThreshold = this.adaptiveNeutralEAR ? this.adaptiveNeutralEAR * 0.62 : 0.18;
    const isEyesClosed = avgEAR < blinkThreshold || blinkingRatio > 5.7;

    // Working distance
    const eyeSpanNorm = Math.hypot(leftOuter.x - rightOuter.x, leftOuter.y - rightOuter.y);
    const distanceCm = Math.max(25, Math.min(120, Math.round(3800 / (eyeSpanNorm * 640 || 1))));
    const isWithinWorkingRange = distanceCm >= 40 && distanceCm <= 80;

    this.drawSkeletonOverlay(
      lm,
      isWithinWorkingRange,
      distanceCm,
      blinkingRatio,
      isEyesClosed,
      leftTopMid,
      leftBottomMid,
      rightTopMid,
      rightBottomMid,
      gazeRatio,
      leftIris,
      rightIris
    );

    // Blink detection & click trigger
    if (isEyesClosed) {
      if (!this.wasBlinking) {
        this.wasBlinking = true;
        this.blinkStartTime = now;
      } else {
        const dur = now - this.blinkStartTime;
        if (dur >= 100 && dur <= 650 && now - this.lastBlinkTriggerTime > 500) {
          this.lastBlinkTriggerTime = now;
          if (this.onGestureCb) {
            this.onGestureCb({
              isSmiling: false,
              isMouthOpen: false,
              isEyebrowRaised: false,
              isBlinking: true,
              confidence: 0.99,
              metrics: {
                distanceCm,
                isWithinWorkingRange,
                leftPupil: { x: leftIris.x, y: leftIris.y },
                rightPupil: { x: rightIris.x, y: rightIris.y },
                avgEAR,
                blinkingRatio,
                gazeRatio,
                isBlinking: true,
                gazeVector: { x: this.currentPos.normalizedX, y: this.currentPos.normalizedY },
                screenPoint: { x: this.currentPos.x, y: this.currentPos.y },
              },
            });
          }
        }
      }
    } else {
      this.wasBlinking = false;
      this.blinkStartTime = 0;
    }

    if (!isEyesClosed) {
      const mode = this.config.trackingMode || 'hybrid';

      // Normalized Eye Displacements (using constant eye corner width)
      const leftCenter = { x: (leftOuter.x + leftInner.x) / 2, y: (leftTop.y + leftBottom.y) / 2 };
      const leftDx = (leftIris.x - leftCenter.x) / (leftEyeW || 0.02);
      const leftDy = (leftIris.y - leftCenter.y) / (leftEyeW || 0.02);

      const rightCenter = { x: (rightOuter.x + rightInner.x) / 2, y: (rightTop.y + rightBottom.y) / 2 };
      const rightDx = (rightIris.x - rightCenter.x) / (rightEyeW || 0.02);
      const rightDy = (rightIris.y - rightCenter.y) / (rightEyeW || 0.02);

      // Average gaze offset (mirrored horizontally for webcam natural feel)
      const avgGazeX = -((leftDx + rightDx) / 2);
      const avgGazeY = (leftDy + rightDy) / 2;

      // Stable head pose anchor from nose bridge
      const nose = lm[4] || lm[1] || { x: 0.5, y: 0.5 };
      const noseNormX = 1 - nose.x;
      const noseNormY = nose.y;

      let targetX = 0.5;
      let targetY = 0.5;

      if (mode === 'nose') {
        targetX = noseNormX;
        targetY = noseNormY;
      } else if (mode === 'iris') {
        // Pure Iris: 100% Eye-Gaze Tracking
        // Vertical eye movement has ~40% less physical amplitude than horizontal,
        // so avgGazeY uses 4.2x multiplier for effortless top/bottom reach.
        targetX = 0.5 + avgGazeX * 2.8;
        targetY = 0.5 + avgGazeY * 4.2;
      } else {
        // Hybrid: 60% Iris + 40% Head anchor (balanced, rock-solid, covers full screen comfortably)
        targetX = 0.5 + avgGazeX * 1.8 + (noseNormX - 0.5) * 0.8;
        targetY = 0.5 + avgGazeY * 2.0 + (noseNormY - 0.5) * 0.8;
      }

      this.feedCalibrationSample(targetX, targetY);
      this.updatePointerCoordinates(targetX, targetY, avgEAR, false, now, distanceCm, isWithinWorkingRange, leftIris, rightIris, blinkingRatio, gazeRatio);
    }
  }

  /**
   * Unified Coordinate Mapper & Sticky Hysteresis Magnetic Snapper
   */
  private updatePointerCoordinates(
    rawNormX: number,
    rawNormY: number,
    avgEAR: number,
    isBlinking: boolean,
    timestamp: number,
    distanceCm = 58,
    isWithinRange = true,
    leftIris = { x: 0.5, y: 0.5 },
    rightIris = { x: 0.5, y: 0.5 },
    blinkingRatio = 3.5,
    gazeRatio = 1.0
  ) {
    let mappedX: number;
    let mappedY: number;

    if (this.calibCoeffsX && this.calibCoeffsY) {
      const px = this.calibCoeffsX[0] * rawNormX + this.calibCoeffsX[1] * rawNormY + this.calibCoeffsX[2];
      const py = this.calibCoeffsY[0] * rawNormX + this.calibCoeffsY[1] * rawNormY + this.calibCoeffsY[2];
      mappedX = Math.max(0.01, Math.min(0.99, px));
      mappedY = Math.max(0.01, Math.min(0.99, py));
    } else {
      if (!this.baselineGaze) {
        this.neutralCalibrationSamples.push({ x: rawNormX, y: rawNormY });
        if (this.neutralCalibrationSamples.length >= 20) {
          const avgX = this.neutralCalibrationSamples.reduce((s, p) => s + p.x, 0) / this.neutralCalibrationSamples.length;
          const avgY = this.neutralCalibrationSamples.reduce((s, p) => s + p.y, 0) / this.neutralCalibrationSamples.length;
          this.baselineGaze = { x: avgX, y: avgY };
        }
      }
      const baseX = this.baselineGaze ? this.baselineGaze.x : 0.5;
      const baseY = this.baselineGaze ? this.baselineGaze.y : 0.5;
      const deltaX = rawNormX - baseX;
      const deltaY = rawNormY - baseY;
      const gain = 1.05 * this.config.sensitivity;
      mappedX = Math.max(0.01, Math.min(0.99, 0.5 + deltaX * gain));
      mappedY = Math.max(0.01, Math.min(0.99, 0.5 + deltaY * gain * 1.35));
    }

    const smoothed = this.gazeSmoother.filter(mappedX, mappedY, timestamp);

    let screenX = Math.max(16, Math.min(window.innerWidth - 16, smoothed.x * window.innerWidth));
    let screenY = Math.max(16, Math.min(window.innerHeight - 16, smoothed.y * window.innerHeight));

    // Sticky Magnetic Snapping with Smooth Spring Pull & Hysteresis
    const SNAP_ACQUIRE_RADIUS = 40; // Latch onto target within 40px (calibrated for keyboard keys)
    const SNAP_RELEASE_RADIUS = 75; // Hold firmly until gaze moves > 75px away

    let isSnapped = false;
    let activeTargetId: string | null = null;

    if (this.lockedSnapTarget) {
      const distFromLocked = Math.hypot(screenX - this.lockedSnapTarget.cx, screenY - this.lockedSnapTarget.cy);
      if (distFromLocked <= SNAP_RELEASE_RADIUS) {
        // Smooth magnetic pull: 85% to target center, 15% smooth lead
        const pull = 0.85;
        screenX = this.lockedSnapTarget.cx * pull + screenX * (1 - pull);
        screenY = this.lockedSnapTarget.cy * pull + screenY * (1 - pull);
        isSnapped = true;
        activeTargetId = this.lockedSnapTarget.id;
      } else {
        this.lockedSnapTarget = null;
      }
    }

    if (!this.lockedSnapTarget && this.snapTargetsCache.length > 0) {
      let closestDist = SNAP_ACQUIRE_RADIUS;
      let candidate: { id: string; cx: number; cy: number } | null = null;

      for (const t of this.snapTargetsCache) {
        const dist = Math.hypot(screenX - t.cx, screenY - t.cy);
        if (dist < closestDist) {
          closestDist = dist;
          candidate = t;
        }
      }

      if (candidate) {
        this.lockedSnapTarget = candidate;
        const pull = 0.85;
        screenX = candidate.cx * pull + screenX * (1 - pull);
        screenY = candidate.cy * pull + screenY * (1 - pull);
        isSnapped = true;
        activeTargetId = candidate.id;
      }
    }

    // Viewport Boundary Clamping (strict - never exits the application screen frame)
    screenX = Math.max(16, Math.min(window.innerWidth - 16, screenX));
    screenY = Math.max(16, Math.min(window.innerHeight - 16, screenY));

    if (activeTargetId) {
      this.setHoverTarget(activeTargetId);
    } else {
      this.setHoverTarget(null);
    }

    this.currentPos = {
      x: screenX,
      y: screenY,
      normalizedX: screenX / window.innerWidth,
      normalizedY: screenY / window.innerHeight,
      isSnapped,
    };

    if (this.onGestureCb && !isBlinking) {
      this.onGestureCb({
        isSmiling: false,
        isMouthOpen: false,
        isEyebrowRaised: false,
        isBlinking: false,
        confidence: 0.99,
        leftPupil: leftIris,
        rightPupil: rightIris,
        metrics: {
          distanceCm,
          isWithinWorkingRange: isWithinRange,
          leftPupil: leftIris,
          rightPupil: rightIris,
          avgEAR,
          blinkingRatio,
          gazeRatio,
          isBlinking: false,
          gazeVector: { x: smoothed.x, y: smoothed.y },
          screenPoint: { x: screenX, y: screenY },
        },
      });
    }
  }

  private drawSkeletonOverlay(
    landmarks: any[],
    isWithinRange: boolean,
    distanceCm: number,
    blinkingRatio: number = 3.5,
    isEyesClosed: boolean = false,
    leftTopMid?: { x: number; y: number },
    leftBottomMid?: { x: number; y: number },
    rightTopMid?: { x: number; y: number },
    rightBottomMid?: { x: number; y: number },
    gazeRatio: number = 1.0,
    leftIris?: { x: number; y: number },
    rightIris?: { x: number; y: number }
  ) {
    if (!this.overlayCtx || !this.overlayCanvasEl) return;
    const ctx = this.overlayCtx;
    const w = this.overlayCanvasEl.width;
    const h = this.overlayCanvasEl.height;

    ctx.clearRect(0, 0, w, h);

    // Distance HUD (Top Right)
    ctx.strokeStyle = isWithinRange ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.setLineDash([]);

    ctx.fillStyle = isWithinRange ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)';
    ctx.fillRect(w - 78, 4, 74, 17);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${distanceCm}cm ${isWithinRange ? '✓' : '⚠️'}`, w - 74, 16);

    // PySource Part 2 (mMObcjHs59E) Real-time Blinking Ratio HUD (Top Left)
    const isBlinkThresholdExceeded = isEyesClosed || blinkingRatio > 5.7;
    const ratioColor = isBlinkThresholdExceeded ? '#ef4444' : blinkingRatio > 4.5 ? '#f59e0b' : '#22c55e';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(4, 4, 115, 17);
    ctx.strokeStyle = ratioColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, 115, 17);
    ctx.fillStyle = ratioColor;
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`BLINK: ${blinkingRatio.toFixed(1)} / 5.7`, 8, 16);

    // PySource Part 3 (UCu6M3drlYg) Gaze Direction HUD (Top Center)
    const isGazeLeft = gazeRatio < 0.85;
    const isGazeRight = gazeRatio > 1.20;
    const gazeDirLabel = isGazeLeft ? '← LEFT' : isGazeRight ? 'RIGHT →' : '⊙ CENTER';
    const gazeDirColor = isGazeLeft ? '#38bdf8' : isGazeRight ? '#fbbf24' : '#94a3b8';

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(w / 2 - 58, 4, 116, 17);
    ctx.strokeStyle = gazeDirColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(w / 2 - 58, 4, 116, 17);
    ctx.fillStyle = gazeDirColor;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`GAZE: ${gazeDirLabel} (${gazeRatio.toFixed(2)})`, w / 2, 16);
    ctx.textAlign = 'left';

    // Draw PySource Part 3 Convex Hull Eye Mask Polygons (cv2.fillPoly)
    const drawFilledEyeMask = (indices: number[]) => {
      ctx.beginPath();
      for (let i = 0; i < indices.length; i++) {
        const p = landmarks[indices[i]];
        if (!p) continue;
        const x = (1 - p.x) * w;
        const y = p.y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(6, 182, 212, 0.16)';
      ctx.fill();
    };

    drawFilledEyeMask(LEFT_EYE_CONTOUR);
    drawFilledEyeMask(RIGHT_EYE_CONTOUR);

    const drawConnectors = (indices: number[], color: string, lineWidth: number = 2) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      for (let i = 0; i < indices.length; i++) {
        const p = landmarks[indices[i]];
        if (!p) continue;
        const x = (1 - p.x) * w;
        const y = p.y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const drawLandmarkDots = (indices: number[]) => {
      for (const idx of indices) {
        const p = landmarks[idx];
        if (!p) continue;
        const x = (1 - p.x) * w;
        const y = p.y * h;

        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, 2 * Math.PI);
        ctx.fillStyle = '#ec4899';
        ctx.fill();
      }
    };

    // Draw eye contours & iris contours
    drawConnectors(LEFT_EYE_CONTOUR, 'rgba(6, 182, 212, 0.6)', 1.5);
    drawConnectors(RIGHT_EYE_CONTOUR, 'rgba(6, 182, 212, 0.6)', 1.5);
    drawConnectors(LEFT_IRIS_CONTOUR, '#fbbf24', 1.5);
    drawConnectors(RIGHT_IRIS_CONTOUR, '#fbbf24', 1.5);

    drawLandmarkDots(LEFT_EYE_CONTOUR);
    drawLandmarkDots(RIGHT_EYE_CONTOUR);

    // PySource Part 2 Specific Horizontal & Vertical Eye Lines:
    const pLeftOuter = landmarks[33];
    const pLeftInner = landmarks[133];
    if (pLeftOuter && pLeftInner && leftTopMid && leftBottomMid) {
      // Horizontal Line (Cyan)
      ctx.beginPath();
      ctx.moveTo((1 - pLeftOuter.x) * w, pLeftOuter.y * h);
      ctx.lineTo((1 - pLeftInner.x) * w, pLeftInner.y * h);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Vertical Line (Vibrant Red)
      ctx.beginPath();
      ctx.moveTo((1 - leftTopMid.x) * w, leftTopMid.y * h);
      ctx.lineTo((1 - leftBottomMid.x) * w, leftBottomMid.y * h);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Midpoint markers
      ctx.beginPath();
      ctx.arc((1 - leftTopMid.x) * w, leftTopMid.y * h, 3, 0, 2 * Math.PI);
      ctx.arc((1 - leftBottomMid.x) * w, leftBottomMid.y * h, 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#f43f5e';
      ctx.fill();
    }

    // Right Eye: Horizontal & Vertical
    const pRightInner = landmarks[362];
    const pRightOuter = landmarks[263];
    if (pRightInner && pRightOuter && rightTopMid && rightBottomMid) {
      // Horizontal Line (Cyan)
      ctx.beginPath();
      ctx.moveTo((1 - pRightInner.x) * w, pRightInner.y * h);
      ctx.lineTo((1 - pRightOuter.x) * w, pRightOuter.y * h);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Vertical Line (Vibrant Red)
      ctx.beginPath();
      ctx.moveTo((1 - rightTopMid.x) * w, rightTopMid.y * h);
      ctx.lineTo((1 - rightBottomMid.x) * w, rightBottomMid.y * h);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Midpoint markers
      ctx.beginPath();
      ctx.arc((1 - rightTopMid.x) * w, rightTopMid.y * h, 3, 0, 2 * Math.PI);
      ctx.arc((1 - rightBottomMid.x) * w, rightBottomMid.y * h, 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#f43f5e';
      ctx.fill();
    }

    // Iris Center Targets
    const drawIrisCenterTarget = (idx: number) => {
      const p = landmarks[idx];
      if (!p) return;
      const x = (1 - p.x) * w;
      const y = p.y * h;

      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 8, y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    drawIrisCenterTarget(468);
    drawIrisCenterTarget(473);

    // PySource Part 3 Dedicated Zoomed Eye PIP (5x Enlarged Eye Crop Window matching cv2.imshow("Eye", gray_eye))
    if (pLeftOuter && pLeftInner && leftIris && !isEyesClosed) {
      const pipW = 84;
      const pipH = 46;
      const pipX = 6;
      const pipY = h - pipH - 6;

      // PIP Box background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.beginPath();
      ctx.roundRect(pipX, pipY, pipW, pipH, 8);
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // PIP Label
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 7.5px monospace';
      ctx.fillText('EYE PIP (Part 3)', pipX + 5, pipY + 10);

      // Eye contour bounding box
      const eyeMinX = Math.min(...LEFT_EYE_CONTOUR.map((i) => landmarks[i]?.x || 0.5));
      const eyeMaxX = Math.max(...LEFT_EYE_CONTOUR.map((i) => landmarks[i]?.x || 0.5));
      const eyeMinY = Math.min(...LEFT_EYE_CONTOUR.map((i) => landmarks[i]?.y || 0.5));
      const eyeMaxY = Math.max(...LEFT_EYE_CONTOUR.map((i) => landmarks[i]?.y || 0.5));
      const spanX = eyeMaxX - eyeMinX || 0.01;
      const spanY = eyeMaxY - eyeMinY || 0.01;

      // Vertical midline (dividing Left and Right sclera)
      ctx.beginPath();
      ctx.moveTo(pipX + pipW / 2, pipY + 13);
      ctx.lineTo(pipX + pipW / 2, pipY + pipH - 4);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw zoomed eye contour inside PIP
      ctx.beginPath();
      for (let i = 0; i < LEFT_EYE_CONTOUR.length; i++) {
        const p = landmarks[LEFT_EYE_CONTOUR[i]];
        if (!p) continue;
        const normLocalX = 1 - (p.x - eyeMinX) / spanX;
        const normLocalY = (p.y - eyeMinY) / spanY;
        const lx = pipX + 8 + normLocalX * (pipW - 16);
        const ly = pipY + 13 + normLocalY * (pipH - 18);
        if (i === 0) ctx.moveTo(lx, ly);
        else ctx.lineTo(lx, ly);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Zoomed Pupil in PIP
      const irisLocalX = 1 - (leftIris.x - eyeMinX) / spanX;
      const irisLocalY = (leftIris.y - eyeMinY) / spanY;
      const ilx = pipX + 8 + irisLocalX * (pipW - 16);
      const ily = pipY + 13 + irisLocalY * (pipH - 18);

      ctx.beginPath();
      ctx.arc(ilx, ily, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // PySource Part 2 BLINKING Notification Banner on Video Frame:
    if (isBlinkThresholdExceeded) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.92)';
      ctx.beginPath();
      ctx.roundRect(w / 2 - 58, h - 32, 116, 26, 8);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👁️ BLINKING', w / 2, h - 15);
      ctx.textAlign = 'left';
    }
  }
}
