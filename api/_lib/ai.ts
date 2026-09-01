/**
 * Server-side AI provider layer for the Vercel serverless functions.
 *
 * SECURITY: this file reads keys from process.env WITHOUT a VITE_ prefix, so
 * Vite never inlines them into the browser bundle. Previously the client called
 * Gemini/Groq/xAI directly with VITE_* keys, which meant every key shipped
 * inside the public JS and anyone could extract and spend them.
 *
 * Required Vercel environment variables (Project → Settings → Environment
 * Variables). Each accepts ONE key or several comma/space-separated keys, which
 * multiplies the free-tier quota because we rotate on 429/503:
 *   GEMINI_API_KEY   (Google Gemini)
 *   NVIDIA_API_KEY   (NVIDIA NIM: z-ai/glm-5.2, DeepSeek-R1; keys start with "nvapi-")
 *   GROQ_API_KEY     (Groq Cloud, keys start with "gsk_")
 *   XAI_API_KEY      (xAI / Grok, keys start with "xai-")
 */

import { PROVIDER_ORDER, type TaskCategory } from './router.js';
import { logTelemetry } from './telemetry.js';

const splitKeys = (raw?: string): string[] =>
  (raw || '').split(/[,\s]+/).map((k) => k.trim()).filter(Boolean);

export const GEMINI_KEYS = () => splitKeys(process.env.GEMINI_API_KEY);
export const NVIDIA_KEYS = () => splitKeys(process.env.NVIDIA_API_KEY);
export const GROQ_KEYS = () => splitKeys(process.env.GROQ_API_KEY);
export const XAI_KEYS = () => splitKeys(process.env.XAI_API_KEY);

/** All OpenAI-compatible fallback / alternate keys (NVIDIA first, then Groq, then xAI). */
export const FALLBACK_KEYS = () => [...NVIDIA_KEYS(), ...GROQ_KEYS(), ...XAI_KEYS()];

const KEY_GETTERS_BY_PROVIDER: Record<'nvidia' | 'groq' | 'xai', () => string[]> = {
  nvidia: NVIDIA_KEYS,
  groq: GROQ_KEYS,
  xai: XAI_KEYS,
};

/**
 * Phase 1.1 — same key pool as FALLBACK_KEYS, but reordered by the
 * deterministic router's PROVIDER_ORDER for the given task category.
 * A "reasoning" request tries NVIDIA (GLM-5.2 / DeepSeek-R1) keys before
 * Groq/xAI; a "fast" request keeps the original Groq-before-NVIDIA order.
 */
export const orderedFallbackKeys = (category: TaskCategory = 'fast'): string[] =>
  PROVIDER_ORDER[category]
    .filter((p): p is 'nvidia' | 'groq' | 'xai' => p !== 'gemini')
    .flatMap((p) => KEY_GETTERS_BY_PROVIDER[p]());

export const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
export const GEMINI_MODEL = GEMINI_MODELS[0];

/** Endpoint + model for an OpenAI-compatible key, resolved by its prefix. */
export function providerFor(key: string): {
  url: string;
  model: string;
  models: string[];
  params?: { temperature?: number; top_p?: number; max_tokens?: number; seed?: number };
} {
  const cleanKey = (key || '').trim();

  // NVIDIA NIM (GLM-5.2, DeepSeek-R1, Llama 3.3)
  if (cleanKey.startsWith('nvapi-')) {
    return {
      url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      model: 'z-ai/glm-5.2',
      models: ['z-ai/glm-5.2', 'deepseek-ai/deepseek-r1', 'meta/llama-3.3-70b-instruct'],
      params: {
        // Was temperature 1 / top_p 1 (maximum randomness). This is a tutoring
        // app whose own system prompt says "never invent facts" — high sampling
        // makes answers inconsistent between identical questions and raises the
        // confabulation rate. Aligned with the other providers.
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 16384,
        seed: 42,
      },
    };
  }

  if (cleanKey.startsWith('xai-')) {
    return {
      url: 'https://api.x.ai/v1/chat/completions',
      model: 'grok-2-latest',
      models: ['grok-2-latest'],
      params: { temperature: 0.7, top_p: 0.95 },
    };
  }

  return {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    params: { temperature: 0.7, top_p: 0.95 },
  };
}

/**
 * Strip chain-of-thought from reasoning models.
 *
 * The NVIDIA model list includes deepseek-r1 and nemotron-*-reasoning, which
 * emit their internal monologue wrapped in <think>...</think> before the real
 * answer. Nothing removed it, so a student could see the model thinking out
 * loud ("let me consider whether this level is right...") above their answer.
 * Handles the still-open tag too, which is what a truncated stream leaves.
 */
export function stripReasoning(text: string): string {
  if (!text) return text;
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // An unterminated <think> means everything after it is still reasoning.
  const open = out.search(/<think>/i);
  if (open >= 0) out = out.slice(0, open);
  return out.replace(/^\s+/, '');
}

export interface Profile {
  level?: string; role?: string; field?: string; language?: string;
  accessibilityMode?: string;
  chatThreads?: { id?: string; title?: string; lastMessageSnippet?: string }[];
  activeThreadId?: string;
}
export interface Msg { id?: string; role: string; content: string }

/** The adaptive system prompt. Kept in step with the client's previous inline version. */
export function buildPersona(profile: Profile, otherThreads = ''): string {
  const a11y = profile.accessibilityMode;
  return `You are Cognify, an adaptive AI mentor. Give the most correct, useful answer calibrated to THIS user.
- Level: ${profile.level || 'Basic'} | Role: ${profile.role || 'Student'} | Field: ${profile.field || 'General'}

## LANGUAGE
- Reply in the SAME language/dialect as the user's last message.
- Egyptian Arabic in → reply in natural Egyptian Arabic; Modern Standard in → reply in Modern Standard.
- If the user switches language mid-conversation, switch immediately.

## ANSWER STYLE
- Answer the question FIRST, then add context. No filler openers.
- Simple question → 1-4 sentences of plain prose. Bullets/headers ONLY when genuinely multi-part.
- If the input is messy or mixed-language, infer the intent and answer it.
- If you are not certain, say so briefly. Never invent facts, sources or numbers.
${a11y === 'Visual' ? '\n## ACCESSIBILITY\n- USER IS BLIND. Describe images/documents vividly and spatially. Write linear, narratable prose — no tables.' : ''}${a11y === 'Vocal-Deaf' || a11y === 'Sign-Only' ? '\n## ACCESSIBILITY\n- User is deaf. Short, visual sentences. End every reply with one line: [Signs: 3-5 emojis matching the core meaning].' : ''}${a11y === 'Speech' ? '\n## ACCESSIBILITY\n- Output is read aloud by TTS: smooth speakable prose, no tables, no markdown noise.' : ''}
${otherThreads ? `\n## MEMORY\nSummaries of the user's other threads. Use them ONLY if explicitly asked about past conversations.\n${otherThreads}\n` : ''}`;
}

export function threadsSummary(profile: Profile): string {
  return (profile.chatThreads || [])
    .filter((t) => t.id !== profile.activeThreadId)
    .map((t) => `Thread "${t.title}": ${t.lastMessageSnippet || 'No summary'}`)
    .join('\n');
}

/** Gemini `contents`, with the trailing duplicate of the current message removed. */
export function buildContents(message: string, history: Msg[], attachments: any[] = []) {
  const mapped = (history || [])
    .filter((m) => m.id !== 'welcome' && m.content?.trim())
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
  const clean = mapped[0]?.role === 'model' ? mapped.slice(1) : mapped;
  const last = clean[clean.length - 1];
  const deduped = last?.role === 'user' && last.parts?.[0]?.text === message ? clean.slice(0, -1) : clean;

  const parts: any[] = [{ text: message }];
  for (const f of attachments || []) {
    if (f?.data && f?.type) {
      const cleanData = typeof f.data === 'string' ? f.data.replace(/^data:[^;]+;base64,/, '') : f.data;
      parts.push({ inlineData: { mimeType: f.type, data: cleanData } });
    }
  }
  return [...deduped, { role: 'user', parts }];
}

/** OpenAI-compatible messages, same trailing-duplicate guard. */
export function buildOpenAIMessages(message: string, system: string, history: Msg[]) {
  const mapped = (history || [])
    .filter((m) => m.id !== 'welcome' && m.content?.trim())
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
  const last = mapped[mapped.length - 1];
  const deduped = last?.role === 'user' && last.content === message ? mapped.slice(0, -1) : mapped;
  return [{ role: 'system', content: system }, ...deduped, { role: 'user', content: message }];
}

/** POST to Gemini, rotating keys and models on 429/503. Returns the first OK response. */
export async function geminiFetch(
  path: string,
  body: string,
  opts: { stream?: boolean; category?: TaskCategory } = {},
): Promise<{ res: Response | null; status: number }> {
  const keys = GEMINI_KEYS();
  let lastStatus = 0;
  for (const model of GEMINI_MODELS) {
    for (const key of keys.length ? keys : ['']) {
      if (!key) break;
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:${path}` +
        (opts.stream ? '?alt=sse&key=' : '?key=') + key;
      const t0 = Date.now();
      let r: Response;
      try {
        r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      } catch (err) {
        lastStatus = 0;
        logTelemetry({ provider: 'gemini', model, category: opts.category, latencyMs: Date.now() - t0, inputChars: body.length, success: false, error: String(err) });
        continue;
      }
      logTelemetry({ provider: 'gemini', model, category: opts.category, latencyMs: Date.now() - t0, inputChars: body.length, success: r.ok, status: r.status });
      if (r.ok && (!opts.stream || r.body)) return { res: r, status: r.status };
      lastStatus = r.status;
      // 400 = bad request payload — another key/model won't help.
      if (r.status === 400) return { res: null, status: 400 };
      // 401/403 = bad key or exhausted quota — try next key in the pool.
      if (r.status === 401 || r.status === 403) continue;
    }
  }
  return { res: null, status: lastStatus };
}

/**
 * Non-streaming chat via the OpenAI-compatible fallbacks. "" when all fail.
 * `category` (from the Phase 1.1 router) decides which provider's keys are
 * tried first — see orderedFallbackKeys. Every attempt is logged via
 * telemetry.ts regardless of outcome.
 */
export async function fallbackChat(messages: any[], category: TaskCategory = 'fast'): Promise<string> {
  const inputChars = messages.reduce((sum, m) => sum + (m?.content?.length || 0), 0);

  for (const key of orderedFallbackKeys(category)) {
    const { url, models, params } = providerFor(key);
    for (const model of models) {
      const t0 = Date.now();
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages,
            temperature: params?.temperature ?? 0.7,
            top_p: params?.top_p ?? 0.95,
            ...(params?.max_tokens ? { max_tokens: params.max_tokens } : {}),
            ...(params?.seed ? { seed: params.seed } : {}),
          }),
        });
        if (!r.ok) {
          logTelemetry({
            provider: url.includes('nvidia') ? 'nvidia' : url.includes('groq') ? 'groq' : 'xai',
            model, category, latencyMs: Date.now() - t0, inputChars,
            success: false, status: r.status,
          });
          continue;
        }
        const j: any = await r.json();
        const txt = stripReasoning(j?.choices?.[0]?.message?.content || '');
        logTelemetry({
          provider: url.includes('nvidia') ? 'nvidia' : url.includes('groq') ? 'groq' : 'xai',
          model, category, latencyMs: Date.now() - t0, inputChars, outputChars: txt.length,
          success: !!txt, status: r.status,
        });
        if (txt) return txt;
      } catch (err) {
        logTelemetry({
          provider: url.includes('nvidia') ? 'nvidia' : url.includes('groq') ? 'groq' : 'xai',
          model, category, latencyMs: Date.now() - t0, inputChars,
          success: false, error: String(err),
        });
      }
    }
  }
  return '';
}

/** One-shot text generation: Gemini first, then the OpenAI-compatible fallbacks. */
export async function generateText(prompt: string, system?: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: { temperature: 0.7, topP: 0.95 },
  });
  const { res } = await geminiFetch('generateContent', body);
  if (res) {
    const j: any = await res.json().catch(() => null);
    const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (txt) return txt;
  }
  return fallbackChat([
    ...(system ? [{ role: 'system', content: system }] : []),
    { role: 'user', content: prompt },
  ]);
}

/** Read and JSON-parse a request body that may arrive parsed or raw. */
export async function readBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  if (req.readableEnded || req.complete) return {};
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (c: any) => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

/** Shared guard: POST only, and at least one provider key configured. */
export function guard(req: any, res: any): boolean {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  if (!GEMINI_KEYS().length && !FALLBACK_KEYS().length) {
    res.status(503).json({
      error: 'No AI provider key configured on the server. Set GEMINI_API_KEY (and optionally GROQ_API_KEY / XAI_API_KEY) in the Vercel project environment variables.',
    });
    return false;
  }
  return true;
}
