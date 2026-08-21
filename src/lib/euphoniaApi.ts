/**
 * euphoniaApi.ts
 * ---------------------------------------------------------------------------
 * Client for the trained-model transcription service — the counterpart to
 * this repo's `api/` folder (a containerized web service meant for Cloud Run
 * that serves the fine-tuned Whisper-based model). The app just needs a URL;
 * how it's deployed (Cloud Run, any other host) is out of scope here.
 *
 * Design goal: work identically whether or not the developer has deployed
 * that service yet.
 *   - If a URL is configured (Settings → "Euphonia API URL"), POST the
 *     recorded audio there and use its transcription.
 *   - If no URL is configured, or the call fails, gracefully fall back to
 *     the browser's built-in SpeechRecognition — so live matching still
 *     works, it's just not the personalized model.
 *
 * This mirrors the repo's actual intent: "set the URL of the Google Cloud
 * Run instance in the app Settings and start transcribing your speech."
 */

const SETTINGS_KEY = 'cognify_euphonia_api_url';

export function getEuphoniaApiUrl(): string {
  try {
    return localStorage.getItem(SETTINGS_KEY) || '';
  } catch {
    return '';
  }
}

export function setEuphoniaApiUrl(url: string) {
  try {
    localStorage.setItem(SETTINGS_KEY, url.trim());
  } catch {
    /* ignore */
  }
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  source: 'custom-model' | 'browser-fallback';
}

/**
 * Sends a recorded audio blob to the configured personalized ASR endpoint.
 * Throws if no URL is configured or the request fails — caller decides
 * whether to fall back.
 */
export async function transcribeWithCustomModel(audio: Blob): Promise<TranscriptionResult> {
  const apiUrl = getEuphoniaApiUrl();
  if (!apiUrl) {
    throw new Error('No Euphonia API URL configured');
  }

  const form = new FormData();
  form.append('audio', audio, 'clip.webm');

  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/transcribe`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Transcription API returned ${res.status}`);
  }

  const data = await res.json();
  if (!data || typeof data.text !== 'string') {
    throw new Error('Malformed transcription response');
  }

  return {
    text: data.text,
    confidence: typeof data.confidence === 'number' ? data.confidence : undefined,
    source: 'custom-model',
  };
}

/**
 * Convenience health check so Settings can show "Connected" / "Unreachable"
 * instead of the user only finding out the endpoint is broken mid-use.
 */
export async function checkEuphoniaApiHealth(apiUrl: string): Promise<boolean> {
  if (!apiUrl) return false;
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Records a short browser-native transcription as a fallback when no custom
 * model is configured/reachable. Wraps the Web Speech API in the same
 * Promise-based shape as transcribeWithCustomModel so callers don't need to
 * branch on which path they're using.
 */
export function transcribeWithBrowserFallback(langCode: string): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      reject(new Error('Browser does not support SpeechRecognition'));
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = langCode;

    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript as string;
      resolve({ text: transcript, source: 'browser-fallback' });
    };
    rec.onerror = (e: any) => reject(new Error(e.error || 'speech recognition error'));
    rec.onend = () => {
      // If onresult never fired (silence), reject so caller can handle it.
    };

    rec.start();
  });
}

/**
 * High-level entry point used by the UI: try the custom model first (if an
 * audio blob and a configured URL are available), otherwise fall back to
 * the browser. This is the function the Studio component should call.
 */
export async function transcribe(options: {
  audioBlob?: Blob | null;
  langCode: string;
}): Promise<TranscriptionResult> {
  const apiUrl = getEuphoniaApiUrl();

  if (options.audioBlob && apiUrl) {
    try {
      return await transcribeWithCustomModel(options.audioBlob);
    } catch (err) {
      console.warn('Custom Euphonia model unreachable, falling back to browser ASR:', err);
    }
  }

  return transcribeWithBrowserFallback(options.langCode);
}
