/**
 * Adaptive per-user pronunciation learning for speech-to-text.
 *
 * Maintains a word-level pronunciation dictionary that grows from the user's
 * confirmed corrections and is applied instantly (offline, zero-cost) to raw
 * transcripts before any AI step. This is what lets the recognizer adapt to a
 * specific user's atypical pronunciation over time.
 *
 * Persistence: localStorage (consistent with the other speech settings the app
 * already stores there, e.g. cognify_euphonia_patterns).
 */

const DICT_KEY = "cognify_pron_dict";
const VOCAB_KEY = "cognify_custom_vocab";

/** misspelled/heard word (normalized, lowercase) -> intended word. */
export type PronDict = Record<string, string>;

export function loadPronDict(): PronDict {
  try {
    return JSON.parse(localStorage.getItem(DICT_KEY) || "{}");
  } catch {
    return {};
  }
}

export function savePronDict(dict: PronDict): void {
  try {
    localStorage.setItem(DICT_KEY, JSON.stringify(dict));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** Custom vocabulary: names, places, technical terms, personal phrases. */
export function loadVocab(): string[] {
  try {
    return JSON.parse(localStorage.getItem(VOCAB_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveVocab(vocab: string[]): void {
  try {
    localStorage.setItem(VOCAB_KEY, JSON.stringify(vocab));
  } catch {
    /* ignore */
  }
}

const STRIP = /[.,/#!$%^&*;:{}=\-_`~()?"']/g;
const norm = (w: string) => w.toLowerCase().replace(STRIP, "");

/** Carry the original token's capitalization style onto the replacement. */
function matchCase(src: string, dst: string): string {
  if (!src) return dst;
  if (src === src.toUpperCase() && /[A-Za-z]/.test(src) && src.length > 1) {
    return dst.toUpperCase();
  }
  if (src[0] === src[0].toUpperCase()) {
    return dst.charAt(0).toUpperCase() + dst.slice(1);
  }
  return dst;
}

/** Apply known word-level corrections to a transcript, token by token. */
export function applyPronunciation(text: string, dict: PronDict): string {
  if (!text || !Object.keys(dict).length) return text;
  return text.replace(/\S+/g, (token) => {
    const m = token.match(/^(\W*)([\s\S]*?)(\W*)$/);
    const lead = m?.[1] ?? "";
    const core = m?.[2] ?? token;
    const trail = m?.[3] ?? "";
    const fix = dict[norm(core)];
    return fix ? lead + matchCase(core, fix) + trail : token;
  });
}

export interface LearnedMapping {
  from: string;
  to: string;
}

/**
 * Diff a raw transcript against the user's corrected version and extract
 * word-level pronunciation mappings. Only learns when the two are word-aligned
 * (same token count) to avoid noisy mappings from inserted/dropped words.
 */
export function learnFromCorrection(
  raw: string,
  corrected: string,
): LearnedMapping[] {
  const rawTokens = raw.trim().split(/\s+/).filter(Boolean);
  const corTokens = corrected.trim().split(/\s+/).filter(Boolean);
  if (!rawTokens.length || rawTokens.length !== corTokens.length) return [];

  const out: LearnedMapping[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const from = norm(rawTokens[i]);
    const to = corTokens[i].replace(STRIP, "");
    if (from && to && from !== to.toLowerCase()) {
      out.push({ from, to });
    }
  }
  return out;
}

/** Merge learned mappings into the dict; returns the new dict + the ones added/changed. */
export function mergeMappings(
  dict: PronDict,
  learned: LearnedMapping[],
): { dict: PronDict; added: LearnedMapping[] } {
  const next = { ...dict };
  const added: LearnedMapping[] = [];
  for (const { from, to } of learned) {
    if (next[from] !== to) {
      next[from] = to;
      added.push({ from, to });
    }
  }
  return { dict: next, added };
}

/**
 * Express the dictionary as {phrase, translation} pairs so it can be fed to the
 * existing Gemini decode services as extra customMappings — the model then also
 * benefits from the user's learned corrections.
 */
export function dictToMappings(
  dict: PronDict,
): { phrase: string; translation: string }[] {
  return Object.entries(dict).map(([phrase, translation]) => ({
    phrase,
    translation,
  }));
}
