/** Module-scoped helper (planner/goals/etc). Returns { result }. */
import { guard, readBody, buildPersona, buildOpenAIMessages, buildContents, geminiFetch, fallbackChat } from '../_lib/ai.js';

export default async function handler(req: any, res: any) {
  if (!guard(req, res)) return;
  const { message, profile = {}, moduleName = '', history = [] } = await readBody(req);
  if (!message) { res.status(400).json({ error: 'message is required' }); return; }

  const system = `${buildPersona(profile)}\n\n## CONTEXT\nYou are answering inside the "${moduleName || 'general'}" module of the app. Keep the answer scoped to that context.`;
  try {
    const body = JSON.stringify({
      contents: buildContents(message, history),
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
    res.status(200).json({ result: txt });
  } catch (err) {
    console.error('[api] generateLogicResponse:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
}
