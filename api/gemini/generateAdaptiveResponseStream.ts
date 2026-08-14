/**
 * Streaming chat endpoint (Server-Sent Events).
 *
 * Emits `data: {"text": "<full text so far>", "done": false}` per chunk and a
 * final `{"text": "...", "done": true}` — exactly the shape the client already
 * parses, so no client-side stream handling had to change.
 *
 * The provider keys stay on the server; the browser only ever talks to us.
 */
import {
  guard, readBody, buildPersona, threadsSummary, buildContents,
  buildOpenAIMessages, geminiFetch, providerFor, FALLBACK_KEYS,
} from '../_lib/ai.js';

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

  const system = buildPersona(profile, threadsSummary(profile));
  let full = '';

  try {
    // ── 1) Gemini (streaming) ────────────────────────────────────────────────
    const body = JSON.stringify({
      contents: buildContents(message, history, attachments),
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { temperature: 0.7, topP: 0.95 },
    });
    const { res: gres } = await geminiFetch('streamGenerateContent', body, { stream: true });

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
              if (t) { full += t; send({ text: full, done: false }); }
            } catch { /* partial JSON frame */ }
          }
        }
      } finally {
        try { await reader.cancel(); } catch { /* already closed */ }
      }
    }

    // ── 2) OpenAI-compatible fallback, only if Gemini produced nothing ───────
    if (!full) {
      const messages = buildOpenAIMessages(message, system, history);
      outer: for (const key of FALLBACK_KEYS()) {
        const { url, models } = providerFor(key);
        for (const model of models) {
          let r: Response;
          try {
            r = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
              body: JSON.stringify({ model, messages, temperature: 0.7, stream: true }),
            });
          } catch { continue; }
          if (!r.ok || !r.body) continue;
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
                  if (c) { full += c; send({ text: full, done: false }); }
                } catch { /* partial frame */ }
              }
            }
          } finally {
            try { await reader.cancel(); } catch { /* already closed */ }
          }
          if (full) break outer;
        }
      }
    }
  } catch (err) {
    console.error('[api] stream error:', err);
  }

  const isAr = profile?.language === 'Arabic' || profile?.language === 'Egyptian Ammiya';
  if (!full) {
    full = isAr
      ? '⚠️ الذكاء الاصطناعي مشغول دلوقتي. جرّب تاني بعد لحظات 🙏'
      : '⚠️ The AI is busy right now. Please try again in a moment 🙏';
  }
  send({ text: full, done: true });
  res.end();
}
