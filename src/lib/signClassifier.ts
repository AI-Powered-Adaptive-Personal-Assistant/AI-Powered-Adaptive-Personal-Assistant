/**
 * signClassifier.ts — Local, in-browser ASL fingerspelling recognition.
 *
 * Replaces the per-frame Gemini call in AccessibilityOverlay with a tiny CNN
 * (290k params, ~1.1MB) trained on Sign Language MNIST, running via
 * @tensorflow/tfjs. Zero network calls, zero cost, ~30+ fps on CPU/WebGL.
 *
 * Covers the 24 STATIC letters A–Y (J and Z require motion and are excluded
 * by the dataset itself). The model is trained with horizontal-flip
 * augmentation, so it is hand-agnostic: left hand, right hand, and mirrored
 * selfie video all work without any handedness logic.
 *
 * Usage:
 *   const clf = new SignClassifier();
 *   await clf.load('/models/sign/model.json');
 *   // inside your MediaPipe results callback, when a hand is present:
 *   const r = clf.classify(videoEl, landmarks);     // {letter, confidence}
 *   const stable = clf.smoother.push(r);            // null | stable letter
 *   if (stable) word = clf.smoother.appendTo(word, stable);
 *   // when no hand detected for a while:
 *   clf.smoother.handLost();
 */

import * as tf from '@tensorflow/tfjs';

export const SIGN_LETTERS = 'ABCDEFGHIKLMNOPQRSTUVWXY'; // 24 static letters, no J/Z

export interface SignPrediction {
  letter: string;
  confidence: number;
}

interface Point2D { x: number; y: number; }

/* ------------------------------------------------------------------ */
/* Temporal smoother: turns noisy per-frame predictions into letters  */
/* ------------------------------------------------------------------ */
export class SignSmoother {
  private buf: SignPrediction[] = [];
  private lastEmitted = '';
  private lastEmitTime = 0;
  private gapSinceEmit = false;

  constructor(
    // Stricter defaults so an ambiguous/held hand doesn't spam a wrong letter
    // (e.g. "PPPP"): more frames must agree, at higher confidence.
    private windowSize = 10,       // frames considered
    private minAgreement = 7,      // frames that must agree
    private minConfidence = 0.82,  // mean confidence threshold
    private repeatCooldownMs = 900 // (kept for API compatibility; see push)
  ) {}

  /** Feed one frame's prediction. Returns a letter when it stabilizes, else null. */
  push(p: SignPrediction): string | null {
    this.buf.push(p);
    if (this.buf.length > this.windowSize) this.buf.shift();
    if (this.buf.length < this.minAgreement) return null;

    const counts = new Map<string, { n: number; conf: number }>();
    for (const q of this.buf) {
      const c = counts.get(q.letter) ?? { n: 0, conf: 0 };
      c.n += 1; c.conf += q.confidence;
      counts.set(q.letter, c);
    }
    let best = ''; let bestN = 0; let bestConf = 0;
    counts.forEach((v, k) => {
      if (v.n > bestN) { best = k; bestN = v.n; bestConf = v.conf / v.n; }
    });

    if (bestN < this.minAgreement || bestConf < this.minConfidence) return null;

    const now = performance.now();
    const isRepeat = best === this.lastEmitted;
    // The SAME letter only re-fires after the hand actually left (handLost →
    // gapSinceEmit). A still hand therefore commits ONE letter, not a stream of
    // repeats — this is what kills the "PPPP" spam. Double letters (LL, EE) just
    // need a brief lower-and-raise of the hand.
    if (isRepeat && !this.gapSinceEmit) {
      return null;
    }
    this.lastEmitted = best;
    this.lastEmitTime = now;
    this.gapSinceEmit = false;
    this.buf = [];               // require fresh evidence for the next letter
    return best;
  }

  /** Call when MediaPipe reports no hand (e.g. each empty results frame). */
  handLost(): void {
    this.buf = [];
    this.gapSinceEmit = true;
  }

  /** Convenience: append a stable letter to a word string. */
  appendTo(word: string, letter: string): string {
    return word + letter;
  }

  reset(): void {
    this.buf = [];
    this.lastEmitted = '';
    this.gapSinceEmit = false;
  }
}

/* ------------------------------------------------------------------ */
/* Classifier                                                          */
/* ------------------------------------------------------------------ */
export class SignClassifier {
  private model: tf.LayersModel | null = null;
  private crop28: HTMLCanvasElement;
  public smoother = new SignSmoother();

  constructor() {
    this.crop28 = document.createElement('canvas');
    this.crop28.width = 28;
    this.crop28.height = 28;
  }

  get ready(): boolean { return this.model !== null; }

  async load(modelUrl = '/models/sign/model.json'): Promise<void> {
    this.model = await tf.loadLayersModel(modelUrl);
    // warm-up so the first real frame isn't slow
    tf.tidy(() => {
      const out = this.model!.predict(tf.zeros([1, 28, 28, 1])) as tf.Tensor;
      out.dataSync();
    });
  }

  /**
   * Classify the current video frame given MediaPipe hand landmarks
   * (normalized 0..1 coords — both legacy `@mediapipe/hands` results and
   * `@mediapipe/tasks-vision` HandLandmarker output match this shape).
   */
  classify(
    video: HTMLVideoElement,
    landmarks: Point2D[],
    padding = 0.4
  ): SignPrediction | null {
    if (!this.model || !landmarks?.length) return null;

    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;

    // landmark bounding box in pixels
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of landmarks) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    let x = minX * vw, y = minY * vh;
    let w = (maxX - minX) * vw, h = (maxY - minY) * vh;

    // pad and square the crop (dataset hands fill the frame with a margin)
    const side = Math.max(w, h) * (1 + padding * 2);
    const cx = x + w / 2, cy = y + h / 2;
    let sx = cx - side / 2, sy = cy - side / 2, s = side;
    // clamp to frame
    if (sx < 0) sx = 0;
    if (sy < 0) sy = 0;
    if (sx + s > vw) s = vw - sx;
    if (sy + s > vh) s = Math.min(s, vh - sy);
    if (s < 16) return null; // degenerate crop

    // draw crop -> 28x28
    const ctx = this.crop28.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(video, sx, sy, s, s, 0, 0, 28, 28);

    // grayscale + normalize + predict
    const { letter, confidence } = tf.tidy(() => {
      const rgb = tf.browser.fromPixels(this.crop28, 3).toFloat();
      // luminance grayscale, matching dataset preprocessing
      const gray = rgb
        .mul(tf.tensor1d([0.299, 0.587, 0.114]))
        .sum(2)
        .expandDims(2)              // [28,28,1]
        .div(255)
        .expandDims(0);             // [1,28,28,1]
      const probs = (this.model!.predict(gray) as tf.Tensor).dataSync();
      let bi = 0;
      for (let i = 1; i < probs.length; i++) if (probs[i] > probs[bi]) bi = i;
      return { letter: SIGN_LETTERS[bi], confidence: probs[bi] };
    });

    return { letter, confidence };
  }

  dispose(): void {
    this.model?.dispose();
    this.model = null;
  }
}
