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
      const finish = () => { try { db.close(); } catch {} };
      tx.oncomplete = () => { finish(); resolve(key); };
      tx.onerror = () => { finish(); reject(tx.error); };
      tx.onabort = () => { finish(); reject(tx.error); };
    });
  }

  async countForPhrase(phraseId: string): Promise<number> {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const idx = tx.objectStore(STORE_NAME).index('phraseId');
      const req = idx.count(IDBKeyRange.only(phraseId));
      const finish = () => { try { db.close(); } catch {} };
      req.onsuccess = () => { finish(); resolve(req.result); };
      req.onerror = () => { finish(); reject(req.error); };
      tx.onerror = () => { finish(); reject(tx.error); };
    });
  }

  async exportAllAsZipEntries(): Promise<{ key: string; blob: Blob }[]> {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      const finish = () => { try { db.close(); } catch {} };
      req.onsuccess = () => { finish(); resolve(req.result.map((r: any) => ({ key: r.key, blob: r.blob }))); };
      req.onerror = () => { finish(); reject(req.error); };
      tx.onerror = () => { finish(); reject(tx.error); };
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
  // Generation guard for the window between "start()" and the microphone
  // actually opening. The re-entrancy check below only sees state that is set
  // AFTER the await, so a second Record press (or Live-Listen, which stays
  // enabled) during the permission prompt sailed straight past it and both
  // streams opened — the first orphaned with its tracks live, mic indicator on
  // for the rest of the tab's life. stop() during that window did nothing at
  // all: the UI said stopped while the mic came up anyway.
  private startToken = 0;
  private wantsRunning = false;

  private pickMimeType(): string {
    for (const candidate of MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    }
    return '';
  }

  public async start(phraseId: string, phraseText: string, cb: RecorderCallbacks) {
    // Re-entrancy guard. This recorder is shared, and the live-listen button
    // stayed enabled during a phrase recording: a second start() overwrote
    // every field, orphaning the first MediaStream with its tracks still live
    // (mic indicator on for good) and leaving the old max-clip timer to fire
    // against the new recording.
    if (this.stream || this.mediaRecorder) {
      try { this.stop(); } catch { /* fall through to a clean start */ }
    }
    this.wantsRunning = true;
    const token = ++this.startToken;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: false,
        },
      });
      // Superseded by a later start(), or stopped while the device was still
      // opening. Release the stream WE opened instead of orphaning it.
      if (token !== this.startToken || !this.wantsRunning) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
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
      // getUserMedia already succeeded by this point — only the MediaRecorder
      // construction failed (no MediaRecorder, or the mimeType was rejected on
      // older Safari). Without this the mic stayed live with no UI to stop it,
      // and every retry orphaned another stream on top.
      try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
      this.stream = null;
      this.mediaRecorder = null;
      if (this.maxTimer) { clearTimeout(this.maxTimer); this.maxTimer = null; }
      try { this.teardownLevelMeter(); } catch { /* ignore */ }
      if (cb.onError) cb.onError(err as Error);
    }
  }

  public stop() {
    this.wantsRunning = false;
    this.startToken++;   // invalidate any start() still awaiting getUserMedia
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    } else {
      // mediaRecorder was never active or already stopped: release hardware now
      try {
        this.stream?.getTracks().forEach((t) => t.stop());
      } catch {}
      this.stream = null;
      this.mediaRecorder = null;
      try {
        this.teardownLevelMeter();
      } catch {}
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
      if (this.audioCtx.state !== 'closed') {
        try {
          this.audioCtx.close().catch(() => {});
        } catch {
          /* ignore */
        }
      }
      this.audioCtx = null;
    }
    this.analyser = null;
  }
}

export const euphoniaRecorder = new EuphoniaRecorder();
