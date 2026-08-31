/** Non-streaming chat. Returns { result }. Keys stay server-side. */
import { guard, readBody, buildPersona, threadsSummary, buildContents, buildOpenAIMessages, geminiFetch, fallbackChat } from '../_lib/ai.js';
import { classifyRequest } from '../_lib/router.js';

export default async function handler(req: any, res: any) {
  if (!guard(req, res)) return;
  const { message, profile = {}, history = [], attachments = [] } = await readBody(req);
  if (!message) { res.status(400).json({ error: 'message is required' }); return; }

  // Phase 1.1 — deterministic router. Plain classification, no model call.
  const category = classifyRequest(message, attachments);
  const system = buildPersona(profile, threadsSummary(profile));

  try {
    // "reasoning" requests (complex code / debugging) go to the NVIDIA
    // reasoning models FIRST — Gemini Flash is a fast model, not a deep
    // reasoning one, so trying it first here would be the wrong default.
    if (category === 'reasoning') {
      const txt = await fallbackChat(buildOpenAIMessages(message, system, history), category);
      if (txt) { res.status(200).json({ result: txt }); return; }
      // fall through to Gemini below if NVIDIA/Groq/xAI all failed
    }

    const body = JSON.stringify({
      contents: buildContents(message, history, attachments),
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { temperature: 0.7, topP: 0.95 },
    });
    const { res: gres } = await geminiFetch('generateContent', body, { category });
    if (gres) {
      const j: any = await gres.json().catch(() => null);
      const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (txt) { res.status(200).json({ result: txt }); return; }
    }
    const txt = await fallbackChat(buildOpenAIMessages(message, system, history), category);
    const isAr = profile?.language === 'Arabic' || profile?.language === 'Egyptian Ammiya';
    res.status(200).json({
      result: txt || (isAr ? '⚠️ الذكاء الاصطناعي مشغول دلوقتي. جرّب تاني 🙏' : '⚠️ The AI is busy right now. Please try again 🙏'),
    });
  } catch (err) {
    console.error('[api] generateAdaptiveResponse:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
}
