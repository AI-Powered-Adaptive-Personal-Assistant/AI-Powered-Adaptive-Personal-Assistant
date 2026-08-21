/**
 * euphoniaRecorder.ts
 * ---------------------------------------------------------------------------
 * Replaces the old "SpeechRecognition guesses text, we count it as a sample"
 * approach with what google/project-euphonia-app's mobile app actually does:
 * record a REAL audio clip per phrase, and hand it off to storage so it can
 * later be used to fine-tune a personalized ASR model (the app's
 * training_colabs step).
 *
 * This module only owns:
 *   1. Recording (MediaRecorder, mic permission, clip trimming to a sane max).
 *   2. Handing the resulting Blob to a pluggable "upload" function.
 *
 * Storage is intentionally abstracted behind `EuphoniaStorageAdapter` so this
 * works whether the developer wires up Firebase Storage (like the original
 * app), a custom REST endpoint, or — with no backend at all — just keeps
 * clips in IndexedDB locally until a backend exists. See
 * euphoniaApi.ts for the companion transcription-side client.
 */

export interface EuphoniaAudioSample {
  phraseId: string;
  phraseText: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  recordedAt: string; // ISO timestamp
}

export interface EuphoniaStorageAdapter {
  /** Persist one recorded sample. Return a stable URL/key on success. */
  upload(sample: EuphoniaAudioSample): Promise<string>;
  /** How many samples exist for a given phrase (for progress display). */
  countForPhrase(phraseId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Local (no-backend) fallback adapter — keeps clips in IndexedDB so the
// "record → train later" workflow still works end-to-end before any backend
// is wired up. Swap this out for a Firebase/REST adapter once one exists.
// ---------------------------------------------------------------------------

const DB_NAME = 'euphonia_local_samples';
const STORE_NAME = 'samples';

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('phraseId', 'phraseId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class LocalIndexedDbStorageAdapter implements EuphoniaStorageAdapter {
  async upload(sample: EuphoniaAudioSample): Promise<string> {
    const db = await openLocalDb();
    const key = `${sample.phraseId}__${Date.now()}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ key, ...sample });
      tx.oncomplete = () => resolve(key);
      tx.onerror = () => reject(tx.error);
    });
  }

  async countForPhrase(phraseId: string): Promise<number> {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const idx = tx.objectStore(STORE_NAME).index('phraseId');
      const req = idx.count(IDBKeyRange.only(phraseId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async exportAllAsZipEntries(): Promise<{ key: string; blob: Blob }[]> {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result.map((r: any) => ({ key: r.key, blob: r.blob })));
      req.onerror = () => reject(req.error);
    });
  }
}

// ---------------------------------------------------------------------------
// REST adapter — point this at your own backend once you have one (or the
// Cloud Run / Firebase Storage setup described in the repo's README).
// ---------------------------------------------------------------------------

export class RestUploadStorageAdapter implements EuphoniaStorageAdapter {
  constructor(private baseUrl: string) {}

  async upload(sample: EuphoniaAudioSample): Promise<string> {
    const form = new FormData();
    form.append('phraseId', sample.phraseId);
    form.append('phraseText', sample.phraseText);
    form.append('recordedAt', sample.recordedAt);
    form.append('durationMs', String(sample.durationMs));
    form.append('audio', sample.blob, `${sample.phraseId}.webm`);

    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/samples`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = await res.json().catch(() => ({}));
    return data.url || data.key || 'uploaded';
  }

  async countForPhrase(phraseId: string): Promise<number> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/samples/count?phraseId=${encodeURIComponent(phraseId)}`);
    if (!res.ok) return 0;
    const data = await res.json().catch(() => ({ count: 0 }));
    return data.count || 0;
  }
}

// ---------------------------------------------------------------------------
// Recorder
// ---------------------------------------------------------------------------

export interface RecorderCallbacks {
  onStart?: () => void;
  onStop?: (sample: EuphoniaAudioSample) => void;
  onError?: (err: Error) => void;
  onLevel?: (rms: number) => void; // live mic level for a VU meter, 0..1
}

const MAX_CLIP_MS = 6000; // safety cap so a stuck recording can't grow forever
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

export class EuphoniaRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private maxTimer: any = null;
  private analyser: AnalyserNode | null = null;
  private audioCtx: AudioContext | null = null;
  private levelRaf: number | null = null;

  private pickMimeType(): string {
    for (const candidate of MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    }
    return '';
  }

  public async start(phraseId: string, phraseText: string, cb: RecorderCallbacks) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: false,
        },
      });
      const mimeType = this.pickMimeType();
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);

      this.chunks = [];
      this.startTime = Date.now();

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        this.teardownLevelMeter();
        const durationMs = Date.now() - this.startTime;
        const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
        const sample: EuphoniaAudioSample = {
          phraseId,
          phraseText,
          blob,
          mimeType: blob.type,
          durationMs,
          recordedAt: new Date().toISOString(),
        };
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        if (cb.onStop) cb.onStop(sample);
      };

      this.mediaRecorder.start();
      if (cb.onStart) cb.onStart();
      this.setupLevelMeter(cb.onLevel);

      this.maxTimer = setTimeout(() => this.stop(), MAX_CLIP_MS);
    } catch (err) {
      if (cb.onError) cb.onError(err as Error);
    }
  }

  public stop() {
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  public isRecording(): boolean {
    return !!this.mediaRecorder && this.mediaRecorder.state === 'recording';
  }

  private setupLevelMeter(onLevel?: (rms: number) => void) {
    if (!onLevel || !this.stream) return;
    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(buffer);
        let sumSq = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / buffer.length);
        onLevel(Math.min(1, rms * 4));
        this.levelRaf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* mic level meter is a nice-to-have; ignore failures */
    }
  }

  private teardownLevelMeter() {
    if (this.levelRaf) cancelAnimationFrame(this.levelRaf);
    this.levelRaf = null;
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch { /* ignore */ }
    }
    this.audioCtx = null;
    this.analyser = null;
  }
}

export const euphoniaRecorder = new EuphoniaRecorder();
