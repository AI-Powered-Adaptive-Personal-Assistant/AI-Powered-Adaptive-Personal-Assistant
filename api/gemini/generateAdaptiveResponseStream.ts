/**
 * Streaming chat endpoint (Server-Sent Events).
 *
 * Emits `data: {"text": "<full text so far>", "done": false}` per chunk and a
 * final `{"text": "...", "done": true}` — exactly the shape the client already
 * parses, so no client-side stream handling had to change.
 *
 * The provider keys stay on the server; the browser only ever talks to us.
 *
 * Phase 1.1 (router): which provider is tried FIRST now depends on
 * classifyRequest() — "reasoning" requests (complex code / debugging) try
 * the NVIDIA reasoning models before Gemini; "fast" and "vision" requests
 * keep the original Gemini-first order. Either way, the full recovery chain
 * still runs if the first choice fails.
 * Phase 1.3 (telemetry): every attempt is logged via telemetry.ts.
 */
import {
  guard, readBody, buildPersona, threadsSummary, buildContents,
  buildOpenAIMessages, geminiFetch, providerFor, orderedFallbackKeys, stripReasoning,
} from '../_lib/ai.js';
import { classifyRequest, type TaskCategory } from '../_lib/router.js';
import { logTelemetry } from '../_lib/telemetry.js';

/** Streams from the OpenAI-compatible fallback chain. Returns the final text ("" if all failed). */
async function streamFallback(
  messages: any[],
  category: TaskCategory,
  attachments: any[],
  send: (obj: any) => void,
): Promise<string> {
  let full = '';
  outer: for (const key of orderedFallbackKeys(category)) {
    const { url, models, params } = providerFor(key);
    const provider = url.includes('nvidia') ? 'nvidia' : url.includes('groq') ? 'groq' : 'xai';
    for (const model of models) {
      const t0 = Date.now();
      let r: Response;
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages,
            temperature: params?.temperature ?? 0.7,
            ...(params?.top_p ? { top_p: params.top_p } : {}),
            ...(params?.max_tokens ? { max_tokens: params.max_tokens } : {}),
            ...(params?.seed ? { seed: params.seed } : {}),
            stream: true,
          }),
        });
      } catch (err) {
        logTelemetry({ provider, model, category, latencyMs: Date.now() - t0, success: false, error: String(err) });
        continue;
      }
      if (!r.ok || !r.body) {
        logTelemetry({ provider, model, category, latencyMs: Date.now() - t0, success: false, status: r.status });
        continue;
      }
      // Tell the UI the answer came from the text-only fallback, so it can
      // warn when attachments were sent (that provider can't see them).
      if (attachments?.length) send({ text: '', done: false, usedFallback: true });
      const reader = (r.body as any).getReader();
      const dec = new TextDecoder('utf-8');
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const j = JSON.parse(payload);
              const c = j?.choices?.[0]?.delta?.content || '';
              // Reasoning models (deepseek-r1, nemotron-*-reasoning) stream
              // their chain-of-thought first. Accumulate raw, but only ever
              // SEND the answer with <think>...</think> removed.
              if (c) { full += c; send({ text: stripReasoning(full), done: false }); }
            } catch { /* partial frame */ }
          }
        }
      } catch (streamErr) {
        logTelemetry({ provider, model, category, latencyMs: Date.now() - t0, success: false, error: String(streamErr) });
      } finally {
        try { await reader.cancel(); } catch { /* already closed */ }
      }
      logTelemetry({ provider, model, category, latencyMs: Date.now() - t0, success: !!full, outputChars: full.length });
      if (full) break outer;
    }
  }
  return full;
}

/** Streams from Gemini. Returns the final text ("" if it produced nothing). */
async function streamGemini(
  message: string,
  history: any[],
  attachments: any[],
  system: string,
  category: TaskCategory,
  send: (obj: any) => void,
): Promise<string> {
  let full = '';
  const t0 = Date.now();
  const body = JSON.stringify({
    contents: buildContents(message, history, attachments),
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: 0.7, topP: 0.95 },
  });
  const { res: gres } = await geminiFetch('streamGenerateContent', body, { stream: true, category });

  if (gres && gres.body) {
    const reader = (gres.body as any).getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const j = JSON.parse(line.slice(6));
            const t = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (t) { full += t; send({ text: stripReasoning(full), done: false }); }
          } catch { /* partial JSON frame */ }
        }
      }
    } catch (streamErr) {
      logTelemetry({ provider: 'gemini', category, latencyMs: Date.now() - t0, success: false, error: String(streamErr) });
    } finally {
      try { await reader.cancel(); } catch { /* already closed */ }
    }
  }
  return full;
}

export default async function handler(req: any, res: any) {
  if (!guard(req, res)) return;

  const { message, profile = {}, history = [], attachments = [] } = await readBody(req);
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // don't let a proxy buffer the stream

  const send = (obj: any) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ } };

  // Phase 1.1 — deterministic router. Plain classification, no model call.
  const category = classifyRequest(message, attachments);
  const system = buildPersona(profile, threadsSummary(profile));
  let full = '';

  try {
    if (category === 'reasoning') {
      // Deep-reasoning requests: try NVIDIA (GLM-5.2 / DeepSeek-R1) first,
      // fall back to Gemini streaming if that produced nothing.
      full = await streamFallback(buildOpenAIMessages(message, system, history), category, attachments, send);
      if (!full) {
        full = await streamGemini(message, history, attachments, system, category, send);
      }
    } else {
      // "fast" and "vision": Gemini first (native multimodal handles
      // vision directly), OpenAI-compatible chain as the fallback.
      full = await streamGemini(message, history, attachments, system, category, send);
      if (!full) {
        full = await streamFallback(buildOpenAIMessages(message, system, history), category, attachments, send);
      }
    }
  } catch (err) {
    console.error('[api] stream error:', err);
  }

  full = stripReasoning(full);
  const isAr = profile?.language === 'Arabic' || profile?.language === 'Egyptian Ammiya';
  if (!full) {
    full = isAr
      ? '⚠️ الذكاء الاصطناعي مشغول دلوقتي. جرّب تاني بعد لحظات 🙏'
      : '⚠️ The AI is busy right now. Please try again in a moment 🙏';
  }
  send({ text: full, done: true });
  res.end();
}
