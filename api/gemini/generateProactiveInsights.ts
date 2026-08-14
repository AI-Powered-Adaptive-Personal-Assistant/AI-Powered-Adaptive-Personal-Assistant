/** Short proactive study insights from recent messages. Returns { result }. */
import { guard, readBody, generateText } from '../_lib/ai.js';

export default async function handler(req: any, res: any) {
  if (!guard(req, res)) return;
  const { profile = {}, recentMessages = [] } = await readBody(req);
  const isAr = profile?.language === 'Arabic' || profile?.language === 'Egyptian Ammiya';

  const convo = (Array.isArray(recentMessages) ? recentMessages : [])
    .map((m: any) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
    .join('\n')
    .slice(-4000);

  const prompt = `Based on this student's recent study conversation, give 2-3 short, specific, actionable insights about what to focus on next.
Student: Level ${profile.level || 'Basic'}, Field ${profile.field || 'General'}.
Write in ${isAr ? 'Arabic' : 'English'}. Be concrete — no generic advice, no preamble.

Conversation:
${convo || '(no recent messages)'}`;

  try {
    const txt = await generateText(prompt);
    res.status(200).json({ result: txt });
  } catch (err) {
    console.error('[api] generateProactiveInsights:', err);
    res.status(500).json({ error: 'AI request failed' });
  }
}
