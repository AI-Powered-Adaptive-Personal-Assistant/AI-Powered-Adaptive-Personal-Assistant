/**
 * Phase 1.1 — Deterministic Code Router.
 *
 * GOLDEN RULE: this is plain if/else logic. It NEVER calls a model to decide
 * which model to use — that would defeat the point (slower + costs money on
 * every single request just to route it).
 *
 * Given the user's message and any attachments, `classifyRequest` returns a
 * TaskCategory. api/_lib/ai.ts uses that category to decide which provider
 * family to try FIRST. The existing multi-provider fallback chain
 * (Gemini → NVIDIA → Groq → xAI) still runs underneath as the safety net —
 * the router only changes the starting order, it doesn't remove resilience.
 */

export type TaskCategory = 'fast' | 'reasoning' | 'vision';

// Signals that a message is a debugging / complex-code request rather than a
// quick, direct concept question ("What is recursion?").
const REASONING_SIGNALS: RegExp[] = [
  /```/, // fenced code block pasted in
  /\b(error|exception|traceback|stack ?trace)\b/i,
  /\b(segfault|crash(ed|ing)?|undefined is not a function)\b/i,
  /\b(typeerror|nullpointerexception|syntaxerror|referenceerror|indexoutofbounds)\b/i,
  /\bfix (my|this)\b/i,
  /\bwhy (is|does|isn'?t|doesn'?t|won'?t) (my|this)\b/i,
  /\b(debug(ging)?|compile error|runtime error|stacktrace)\b/i,
  /\b(refactor|optimi[sz]e|architecture|design pattern)\b/i,
];

// A long, multi-part message is more likely to need deep reasoning than a
// one-line "what is X" question — even without an explicit code signal.
const LONG_MESSAGE_CHARS = 500;

/**
 * Classify a single request. Pure function, no I/O, no model calls.
 */
export function classifyRequest(
  message: string,
  attachments: { type?: string }[] = [],
): TaskCategory {
  // An image/screenshot always needs the vision-capable model, regardless
  // of what the accompanying text says.
  if (Array.isArray(attachments) && attachments.some((a) => a?.type?.startsWith('image/'))) return 'vision';

  const text = typeof message === 'string' ? message : '';
  if (REASONING_SIGNALS.some((rx) => rx.test(text))) return 'reasoning';
  if (text.length > LONG_MESSAGE_CHARS) return 'reasoning';

  return 'fast';
}

/**
 * Which provider family to try FIRST for each category.
 *
 * - fast: Gemini 2.5 Flash (or Groq) — short/direct concept questions.
 * - reasoning: NVIDIA NIM (GLM-5.2 / DeepSeek-R1) — complex code & debugging.
 * - vision: Gemini (native multimodal) — images / screenshots.
 *
 * This does NOT replace the existing recovery chain from Phase 0
 * (Gemini ➔ Groq ➔ NVIDIA ➔ xAI) — it just decides which end of that chain
 * gets tried first for a given request.
 */
export const PROVIDER_ORDER: Record<TaskCategory, ('gemini' | 'nvidia' | 'groq' | 'xai')[]> = {
  fast: ['gemini', 'groq', 'nvidia', 'xai'],
  reasoning: ['nvidia', 'gemini', 'groq', 'xai'],
  vision: ['gemini', 'nvidia', 'groq', 'xai'],
};
