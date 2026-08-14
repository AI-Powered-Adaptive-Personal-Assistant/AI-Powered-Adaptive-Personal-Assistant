/** Non-streaming chat. Returns { result }. Keys stay server-side. */
import { guard, readBody, buildPersona, threadsSummary, buildContents, buildOpenAIMessages, geminiFetch, fallbackChat } from '../_lib/ai.js';

export default async function handler(req: any, res: any) {
  if (!guard(req, res)) return;
  const { message, profile = {}, history = [], attachments = [] } = await readBody(req);
  if (!message) { res.status(400).json({ error: 'message is required' }); return; }

  const system = buildPersona(profile, threadsSummary(profile));
  try {
    const body = JSON.stringify({
      contents: buildContents(message, history, attachments),
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { temperature: 0.7, topP: 0.95 },
    });
    const { res: gres } = await geminiFetch('generateContent', body);
    if (gres) {
      const j: any = await gres.json().catch(() => null);
      const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (txt) { res.status(200).json({ result: txt }); return; }
    }
    const txt = await fallbackChat(buildOpenAIMessages(message, system, history));
    const isAr = profile?.language === 'Arabic' || profile?.language === 'Egyptian Ammiya';
    res.status(200).json({
      result: txt || (isAr ? '⚠️ الذكاء الاصطناعي مشغول دلوقتي. جرّب تاني 🙏' : '⚠️ The AI is busy right now. Please try again 🙏'),
    });
  } catch (err) {
    console.error('[api] generateAdaptiveResponse:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
}
