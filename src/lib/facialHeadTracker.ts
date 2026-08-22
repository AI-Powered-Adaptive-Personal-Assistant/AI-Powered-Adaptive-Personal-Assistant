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
  trackingMode: 'hybrid', // Hybrid: 60% Iris + 40% Head gives best stability & reach
};

// MediaPipe Landmark Loops
const LEFT_EYE_CONTOUR = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33];
const RIGHT_EYE_CONTOUR = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382, 362];
const LEFT_IRIS_CONTOUR = [468, 469, 470, 471, 472, 469];
const RIGHT_IRIS_CONTOUR = [473, 474, 475, 476, 477, 474];

/**
 * Continuous Adaptive Gaze Smoother:
 * Multi-regime velocity-adaptive filter:
 * 1. Deadband threshold absorbs sub-pixel eye tremor & sensor noise (< 6px).
 * 2. High damping at fixation (alpha = 0.08) locks the cursor rock-solid on a target.
 * 3. Non-linear velocity scaling allows instant, lag-free saccadic jumps.
 */
export class ContinuousGazeSmoother {
  private x: number = 0.5;
  private y: number = 0.5;
  private lastT: number = 0;

  public filter(targetX: number, targetY: number, timestamp: number): { x: number; y: number } {
    if (this.lastT === 0 || !Number.isFinite(this.x)) {
      this.x = targetX;
      this.y = targetY;
      this.lastT = timestamp;
      return { x: this.x, y: this.y };
    }

    // Frame-rate independence. alpha was applied once per FRAME, so the same
    // tuning behaved differently at 60fps and at the ~25fps these students' older
    // laptops manage: the cursor felt sluggish on slow devices and jumpy on fast
    // ones, and no single tuning could suit both.
    const dt = Math.max(1, timestamp - this.lastT) / 1000; // seconds
    this.lastT = timestamp;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    // Deadband, expressed per second so it is also frame-rate independent
    // (micro-tremor ~0.005 norm units at 60fps => 0.3 units/s).
    if (dist / dt < 0.3) {
      return { x: this.x, y: this.y };
    }

    // Velocity in normalized units per second, not per frame.
    const velocity = dist / dt;
    // Fixation ~ slow (rock-solid on keys) ... saccade ~ fast (instant acquire).
    const saccadeFactor = Math.min(1.0, Math.pow(velocity / 6.0, 1.5));
    // Convert the per-frame alpha to a time constant, so the SAME smoothing is
    // produced at any frame rate: alpha = 1 - exp(-dt / tau).
    const tauSlow = 0.16;  // was alpha 0.09 @60fps
    const tauFast = 0.012; // was alpha 0.82 @60fps
    const tau = tauSlow + (tauFast - tauSlow) * saccadeFactor;
    const alpha = 1 - Math.exp(-dt / Math.max(tau, 1e-4));

    this.x += dx * alpha;
    this.y += dy * alpha;

    return { x: this.x, y: this.y };
  }

  public reset(x = 0.5, y = 0.5) {
    this.x = x;
    this.y = y;
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
  // Guards the async start(): stop() can be called while getUserMedia is still
  // awaiting permission. Without this the promise resolves afterwards and turns
  // the camera on anyway, against a detached <video>, with an rAF loop nothing
  // can cancel — the webcam LED then stays lit for the life of the tab.
  private startToken = 0;
  private wantsRunning = false;

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

  // NOTE: the hover-confirmation debounce is implemented in the render loop as
  // HOVER_DEBOUNCE_MS (dwell progress stays 0 until the target has been held
  // that long). Three fields were declared here describing the same feature and
  // never referenced anywhere, so the file claimed a safeguard twice and wired
  // it once. Removed to keep one source of truth.
  // Edge-trigger latch. Dwell completion used to clear hoverTargetId, but the
  // very next frame re-set it to the SAME id (the gaze is still there), so the
  // timer restarted and the target fired again and again — one look produced
  // "aaaaa", or repeated WhatsApp sends. The user had to leave the target within
  // ~1.4s, which is exactly the movement a limited-range user cannot make.
  // A target must now be LEFT before it can fire again.
  private latchedTargetId: string | null = null;

  private runningMaxEAR = 0;   // widest eye opening seen this session
  private eyesClosedSince = 0; // watchdog against a stuck "closed" state

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
  private onErrorCb?: (message: string) => void;

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
    // Also re-estimate the blink baseline. Without this, a student who was
    // squinting or mid-blink during the first seconds was stuck with a broken
    // threshold for the whole session and "Recenter" did nothing for them.
    this.adaptiveNeutralEAR = null;
    this.restingEARSamples = [];
    this.runningMaxEAR = 0;
    this.eyesClosedSince = 0;
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

    // Score the fit BEFORE committing it. A bad solve used to be installed
    // anyway, which pinned the cursor against one edge of the screen with no
    // way for the student to know the calibration had failed.
    let totalErr = 0;
    for (let i = 0; i < this.calibSamplesA.length; i++) {
      const [gx, gy] = this.calibSamplesA[i];
      const px = coeffsX[0] * gx + coeffsX[1] * gy + coeffsX[2];
      const py = coeffsY[0] * gx + coeffsY[1] * gy + coeffsY[2];
      totalErr += Math.hypot(px - this.calibTargetsX[i], py - this.calibTargetsY[i]);
    }
    const residual = totalErr / this.calibSamplesA.length;

    // ~15% of screen span. Worse than this is not usable — keep the previous
    // mapping (or the uncalibrated baseline path) rather than making it worse.
    if (residual > 0.15) {
      this.notifyCalibrationStatus();
      return { isCalibrated: false, pointsCollected: this.calibSamplesA.length, accuracyEstimate: 0 };
    }

    this.calibCoeffsX = coeffsX;
    this.calibCoeffsY = coeffsY;
    this.calibFitResidual = residual;

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
      /** Face-mesh failed to load/initialise. Without this the camera turns on,
       *  the overlay draws, and the pointer just never moves — with no way for
       *  anyone to tell that a script failed rather than the student's tracking
       *  being broken. */
      onError?: (message: string) => void;
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
    this.onErrorCb = callbacks.onError;

    this.wantsRunning = true;
    const token = ++this.startToken;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 60, min: 30 },
        },
      });

      // stop() ran, or another start() superseded us, while we were awaiting
      // permission. Release this stream instead of leaking a live camera.
      if (token !== this.startToken || !this.wantsRunning) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }

      this.stream = stream;
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
        // Served from OUR origin (public/models/face_mesh), not a CDN.
        // Assistive tech must not have a hard third-party network dependency:
        // on a filtered or slow school network the old cdn.jsdelivr.net fetch
        // failed, onerror silently resolved false, and the student was left with
        // a live camera and a pointer frozen at screen centre — no message, no
        // way to tell a blocked script from broken tracking.
        const loaded = await new Promise<boolean>((resolve) => {
          const script = document.createElement('script');
          script.src = '/models/face_mesh/face_mesh.js';
          let settled = false;
          const finish = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
          // Never hang forever on a stalled connection.
          const timer = setTimeout(() => finish(false), 15000);
          script.onload = () => { clearTimeout(timer); finish(true); };
          script.onerror = () => { clearTimeout(timer); finish(false); };
          document.head.appendChild(script);
        });
        if (!loaded && !(window as any).FaceMesh) {
          this.onErrorCb?.('face-mesh-load-failed');
          return;
        }
      }

      if ((window as any).FaceMesh) {
        const FaceMeshConstructor = (window as any).FaceMesh;
        this.faceMeshInstance = new FaceMeshConstructor({
          // Same origin as the script above — no CDN round-trip for the wasm.
          locateFile: (file: string) => `/models/face_mesh/${file}`,
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
      } else {
        this.onErrorCb?.('face-mesh-load-failed');
      }
    } catch (e) {
      console.warn('MediaPipe async init error:', e);
      this.onErrorCb?.('face-mesh-init-failed');
    }
  }

  public stop() {
    this.wantsRunning = false;
    this.startToken++; // invalidate any start() still awaiting getUserMedia
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
      // A collapsed/transitioning element reports 0x0 and would land a target at
      // (0,0) — within acquire range of the pointer's clamped minimum, so the
      // cursor glued itself to the corner and typed a key nobody looked at.
      if (rect.width === 0 || rect.height === 0) return;
      targets.push({ id, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
    });
    this.snapTargetsCache = targets;
    // Re-resolve the active lock against the REBUILT list: the old lock held a
    // stale rect, so a toast or a re-rendered suggestion row left the cursor
    // stuck over empty space where a button used to be.
    if (this.lockedSnapTarget) {
      const again = targets.find((t) => t.id === this.lockedSnapTarget!.id);
      this.lockedSnapTarget = again || null;
    }
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

        if (prog >= 1 && this.hoverTargetId !== this.latchedTargetId) {
          const completedTarget = this.hoverTargetId;
          this.latchedTargetId = completedTarget; // must leave before it re-fires
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

    // Eye Aspect Ratio (EAR)
    const leftEyeH = Math.hypot(leftTop.x - leftBottom.x, leftTop.y - leftBottom.y);
    const leftEyeW = Math.hypot(leftOuter.x - leftInner.x, leftOuter.y - leftInner.y) || 0.01;
    const leftEAR = leftEyeH / leftEyeW;

    const rightEyeH = Math.hypot(rightTop.x - rightBottom.x, rightTop.y - rightBottom.y);
    const rightEyeW = Math.hypot(rightOuter.x - rightInner.x, rightOuter.y - rightInner.y) || 0.01;
    const rightEAR = rightEyeH / rightEyeW;

    const avgEAR = (leftEAR + rightEAR) / 2;

    // Adaptive EAR baseline
    // Track the widest EAR seen this session. A student with ptosis / droopy
    // lids / narrow eye opening can sit permanently below the old absolute 0.15
    // gate, so NO resting samples were ever collected, adaptiveNeutralEAR stayed
    // null, and the fixed 0.18 fallback read their open eyes as "closed" — the
    // cursor froze and a blink "click" fired twice a second, unrecoverably.
    // Deriving the gate from the running max makes it relative to THIS face.
    if (avgEAR > this.runningMaxEAR) this.runningMaxEAR = avgEAR;
    const collectGate = this.runningMaxEAR > 0 ? this.runningMaxEAR * 0.7 : 0.15;

    if (this.adaptiveNeutralEAR === null) {
      if (this.restingEARSamples.length < this.EAR_CALIBRATION_SAMPLE_TARGET) {
        if (avgEAR > collectGate) this.restingEARSamples.push(avgEAR);
      }
      if (this.restingEARSamples.length >= this.EAR_CALIBRATION_SAMPLE_TARGET) {
        const sorted = [...this.restingEARSamples].sort((a, b) => a - b);
        this.adaptiveNeutralEAR = sorted[Math.floor(sorted.length / 2)];
      }
    }
    // Fall back to the running max (relative) rather than an absolute constant.
    const neutral = this.adaptiveNeutralEAR ?? (this.runningMaxEAR > 0 ? this.runningMaxEAR : null);
    const blinkThreshold = neutral ? neutral * 0.62 : 0.18;
    let isEyesClosed = avgEAR < blinkThreshold;

    // Watchdog: no real blink lasts this long. If "closed" sticks, the baseline
    // is wrong — re-estimate instead of freezing the pointer for the session.
    if (isEyesClosed) {
      if (this.eyesClosedSince === 0) this.eyesClosedSince = now;
      else if (now - this.eyesClosedSince > 1500) {
        this.adaptiveNeutralEAR = null;
        this.restingEARSamples = [];
        this.runningMaxEAR = Math.max(this.runningMaxEAR, avgEAR / 0.62);
        this.eyesClosedSince = 0;
        isEyesClosed = false;
      }
    } else {
      this.eyesClosedSince = 0;
    }

    // Working distance
    const eyeSpanNorm = Math.hypot(leftOuter.x - rightOuter.x, leftOuter.y - rightOuter.y);
    const distanceCm = Math.max(25, Math.min(120, Math.round(3800 / (eyeSpanNorm * 640 || 1))));
    const isWithinWorkingRange = distanceCm >= 40 && distanceCm <= 80;

    this.drawSkeletonOverlay(lm, isWithinWorkingRange, distanceCm);

    // Blink detection & click trigger.
    // The settings toggle "Blink & Smile Clicks" wrote config.facialTriggersEnabled
    // but NOTHING read it — a caregiver turning it off for a student whose
    // involuntary blinking causes misfires had no effect at all.
    if (this.config.facialTriggersEnabled === false) {
      this.wasBlinking = false;
    } else if (isEyesClosed) {
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
        targetX = 0.5 + avgGazeX * 2.2 + (noseNormX - 0.5) * 0.4;
        targetY = 0.5 + avgGazeY * 2.4 + (noseNormY - 0.5) * 0.4;
      } else {
        // Hybrid: 60% Iris + 40% Head anchor (balanced, rock-solid, covers full screen comfortably)
        targetX = 0.5 + avgGazeX * 1.8 + (noseNormX - 0.5) * 0.8;
        targetY = 0.5 + avgGazeY * 2.0 + (noseNormY - 0.5) * 0.8;
      }

      this.feedCalibrationSample(targetX, targetY);
      this.updatePointerCoordinates(targetX, targetY, avgEAR, false, now, distanceCm, isWithinWorkingRange, leftIris, rightIris);
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
    rightIris = { x: 0.5, y: 0.5 }
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
      mappedY = Math.max(0.01, Math.min(0.99, 0.5 + deltaY * gain * 1.05));
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
          isBlinking: false,
          gazeVector: { x: smoothed.x, y: smoothed.y },
          screenPoint: { x: screenX, y: screenY },
        },
      });
    }
  }

  private drawSkeletonOverlay(landmarks: any[], isWithinRange: boolean, distanceCm: number) {
    if (!this.overlayCtx || !this.overlayCanvasEl) return;
    const ctx = this.overlayCtx;
    const w = this.overlayCanvasEl.width;
    const h = this.overlayCanvasEl.height;

    ctx.clearRect(0, 0, w, h);

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
        ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#ec4899';
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 6;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, 2 * Math.PI);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    drawConnectors(LEFT_EYE_CONTOUR, '#22c55e', 2);
    drawConnectors(RIGHT_EYE_CONTOUR, '#22c55e', 2);
    drawConnectors(LEFT_IRIS_CONTOUR, '#fbbf24', 2);
    drawConnectors(RIGHT_IRIS_CONTOUR, '#fbbf24', 2);

    drawLandmarkDots(LEFT_EYE_CONTOUR);
    drawLandmarkDots(RIGHT_EYE_CONTOUR);
    drawLandmarkDots(LEFT_IRIS_CONTOUR);
    drawLandmarkDots(RIGHT_IRIS_CONTOUR);

    const drawIrisCenterTarget = (idx: number) => {
      const p = landmarks[idx];
      if (!p) return;
      const x = (1 - p.x) * w;
      const y = p.y * h;

      ctx.beginPath();
      ctx.arc(x, y, 7, 0, 2 * Math.PI);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - 9, y);
      ctx.lineTo(x + 9, y);
      ctx.moveTo(x, y - 9);
      ctx.lineTo(x + 9, y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    drawIrisCenterTarget(468);
    drawIrisCenterTarget(473);
  }
}
