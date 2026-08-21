/**
 * euphoniaPhraseBank.ts
 * ---------------------------------------------------------------------------
 * Mirrors google/project-euphonia-app's `assets/phrases.txt` mechanism:
 * a flat list of training phrases loaded from a text asset, optionally
 * organized into categories (an addition on top of the original, which is
 * a flat 100-line file — grouping is purely a UX affordance here).
 *
 * The file lives at /assets/euphonia_phrases_ar.txt and can be swapped for
 * another language file, exactly like the original repo swaps
 * assets/phrases.txt <-> assets/phrases_it.txt.
 */

export interface EuphoniaPhraseDef {
  id: string;
  text: string;
  category: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  'basic-needs': '💧',
  'emergency': '🚨',
  'pain-health': '🩹',
  'responses': '✅',
  'social-family': '👨‍👩‍👧',
  'education': '📚',
  'room-control': '🏠',
  'feelings': '💬',
  'time-schedule': '⏰',
  'misc-common': '🗂️',
};

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] || '💬';
}

/**
 * Parses the phrase bank text format:
 *   - blank lines ignored
 *   - lines starting with '=' or '-' (divider decoration) ignored
 *   - lines starting with '#' switch the active category
 *   - anything else is a phrase belonging to the current category
 */
export function parsePhraseBank(raw: string): EuphoniaPhraseDef[] {
  const lines = raw.split('\n');
  const phrases: EuphoniaPhraseDef[] = [];
  let currentCategory = 'general';
  let counter = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('=') || /^-{3,}$/.test(line)) continue;
    if (line.startsWith('#')) {
      currentCategory = line.replace(/^#+/, '').trim() || 'general';
      continue;
    }
    counter += 1;
    phrases.push({
      id: `eup-${counter}`,
      text: line,
      category: currentCategory,
    });
  }

  return phrases;
}

let cachedBank: EuphoniaPhraseDef[] | null = null;

/**
 * Fetches and parses the phrase bank asset. Falls back to a small built-in
 * set if the asset can't be loaded (e.g. offline first run, dev environment
 * without the assets folder wired up yet).
 */
export async function loadEuphoniaPhraseBank(
  assetUrl: string = '/assets/euphonia_phrases_ar.txt'
): Promise<EuphoniaPhraseDef[]> {
  if (cachedBank) return cachedBank;

  try {
    const res = await fetch(assetUrl);
    if (!res.ok) throw new Error(`Failed to load phrase bank: ${res.status}`);
    const raw = await res.text();
    const parsed = parsePhraseBank(raw);
    if (parsed.length === 0) throw new Error('Empty phrase bank');
    cachedBank = parsed;
    return parsed;
  } catch (err) {
    console.warn('euphoniaPhraseBank: falling back to built-in minimal set', err);
    cachedBank = FALLBACK_PHRASES;
    return FALLBACK_PHRASES;
  }
}

/** Small built-in fallback so the Studio never renders empty. */
const FALLBACK_PHRASES: EuphoniaPhraseDef[] = [
  { id: 'eup-1', text: 'أريد شرب ماء من فضلك', category: 'basic-needs' },
  { id: 'eup-2', text: 'أحتاج مساعدة عاجلة الآن', category: 'emergency' },
  { id: 'eup-3', text: 'نعم هذا صحيح تماماً', category: 'responses' },
  { id: 'eup-4', text: 'لا هذا ليس ما أقصده', category: 'responses' },
  { id: 'eup-5', text: 'أشعر بألم وأحتاج طبيب', category: 'pain-health' },
  { id: 'eup-6', text: 'ماما تعالي أحتاجك الآن', category: 'social-family' },
];

export function resetPhraseBankCache() {
  cachedBank = null;
}
