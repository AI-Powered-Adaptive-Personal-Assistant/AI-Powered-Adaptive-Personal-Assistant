/**
 * Generic one-shot generation used by the accessibility/vision service
 * (sign translation, dysarthria decoding, audio transcription, quick replies…).
 *
 * Body: { parts: [{ text }, { inlineData: { mimeType, data } }, ...] }
 * Returns: { result: string }
 *
 * Accepts Gemini-style `parts` so the client's existing callGemini(parts) shape
 * is unchanged — only the transport moved. Keys live in server-only env vars, so
 * nothing provider-related ships in the browser bundle.
 *
 * If Gemini fails and the request is TEXT-ONLY, we fall back to the
 * OpenAI-compatible providers. A request carrying inlineData (image/audio) can't
 * be served by those text-only fallbacks, which matches the previous behaviour.
 */
import { guard, readBody, geminiFetch, fallbackChat } from '../_lib/ai.js';

export default async function handler(req: any, res: any) {
  if (!guard(req, res)) return;

  const { parts } = await readBody(req);
  if (!Array.isArray(parts) || parts.length === 0) {
    res.status(400).json({ error: 'parts[] is required' });
    return;
  }

  // Guard the serverless body limit (Vercel caps request bodies ~4.5MB). A long
  // recording or large frame would otherwise fail with an opaque platform error.
  const inlineBytes = parts.reduce(
    (n: number, p: any) => n + (typeof p?.inlineData?.data === 'string' ? p.inlineData.data.length : 0), 0);
  if (inlineBytes > 4_000_000) {
    res.status(413).json({ error: 'Attached media is too large. Please record or capture something shorter.' });
    return;
  }

  try {
    const body = JSON.stringify({ contents: [{ role: 'user', parts }] });
    const { res: gres } = await geminiFetch('generateContent', body);
    if (gres) {
      const j: any = await gres.json().catch(() => null);
      const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (txt) { res.status(200).json({ result: txt }); return; }
    }

    const hasMedia = parts.some((p: any) => p?.inlineData);
    if (!hasMedia) {
      const prompt = parts.map((p: any) => p?.text || '').join('\n').trim();
      if (prompt) {
        const txt = await fallbackChat([{ role: 'user', content: prompt }]);
        if (txt) { res.status(200).json({ result: txt }); return; }
      }
    }

    // Empty string keeps the client's existing "" contract for a failed call, so
    // every caller's own fallback/degraded path still behaves as before.
    res.status(200).json({ result: '' });
  } catch (err) {
    console.error('[api] generateContent:', err);
    res.status(200).json({ result: '' });
  }
}
