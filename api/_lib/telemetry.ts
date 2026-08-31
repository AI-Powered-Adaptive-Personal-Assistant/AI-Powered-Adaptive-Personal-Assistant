/**
 * Phase 1.3 — Cost & Telemetry Monitor.
 *
 * Deliberately simple for this stage (per the roadmap's "no over-engineered
 * systems before Phase 0/1 are solid" rule): one structured log line per AI
 * call, written as JSON so it's greppable locally and directly queryable
 * once these logs are shipped to Vercel's log drain / any log sink later.
 * No new database, no new infra — just make the data exist.
 *
 * Fields match the roadmap spec:
 *   [Model, Input Tokens, Output Tokens, Latency ms, Cost, Success/Fail]
 *
 * Token counts are approximate (chars/4) since none of the current
 * providers are wired up to return exact usage for every path yet — good
 * enough to spot cost/latency outliers, which is the actual goal here.
 */

export type Provider = 'gemini' | 'nvidia' | 'groq' | 'xai' | 'none';

export interface TelemetryEntry {
  provider: Provider;
  model?: string;
  category?: string; // TaskCategory from router.ts
  latencyMs: number;
  inputChars?: number;
  outputChars?: number;
  success: boolean;
  status?: number;
  error?: string;
}

// Rough per-1K-token USD costs, only for the models actually in rotation.
// Approximate on purpose — this is for spotting which provider is
// expensive, not for billing.
const COST_PER_1K_TOKENS: Record<string, number> = {
  'gemini-2.5-flash': 0.0003,
  'gemini-2.0-flash': 0.0003,
  'gemini-flash-latest': 0.0003,
  'z-ai/glm-5.2': 0.002,
  'deepseek-ai/deepseek-r1': 0.0025,
  'meta/llama-3.3-70b-instruct': 0.0009,
  'llama-3.3-70b-versatile': 0.0006,
  'llama-3.1-8b-instant': 0.0001,
  'grok-2-latest': 0.002,
};

const approxTokens = (chars = 0) => Math.ceil(chars / 4);

export function estimateCostUsd(model: string | undefined, inputChars = 0, outputChars = 0): number {
  const rate = (model && COST_PER_1K_TOKENS[model]) || 0.001; // conservative default
  const totalTokens = approxTokens(inputChars) + approxTokens(outputChars);
  return Number(((totalTokens / 1000) * rate).toFixed(6));
}

/**
 * Log one AI call. Never throws — a telemetry failure must never break a
 * user-facing request.
 */
export function logTelemetry(entry: TelemetryEntry): void {
  try {
    const inputTokens = approxTokens(entry.inputChars);
    const outputTokens = approxTokens(entry.outputChars);
    const cost = estimateCostUsd(entry.model, entry.inputChars, entry.outputChars);
    console.log(
      JSON.stringify({
        type: 'ai_call',
        ts: new Date().toISOString(),
        provider: entry.provider,
        model: entry.model || 'unknown',
        category: entry.category || 'unclassified',
        inputTokens,
        outputTokens,
        latencyMs: entry.latencyMs,
        costUsd: cost,
        success: entry.success,
        status: entry.status,
        error: entry.error,
      }),
    );
  } catch {
    /* telemetry must never break the request */
  }
}
