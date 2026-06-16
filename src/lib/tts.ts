/**
 * Shared text-to-speech helper.
 *
 * Consolidates the Arabic / Egyptian-aware voice selection that was previously
 * duplicated across AccessibilityOverlay, LogicSandbox and ChatInterface, and
 * powers the "read selected region aloud" feature.
 */

const LANG_MAP: Record<string, string> = {
  English: "en-US",
  Arabic: "ar-SA",
  "Egyptian Ammiya": "ar-EG",
  French: "fr-FR",
  Spanish: "es-ES",
  German: "de-DE",
  Italian: "it-IT",
  Portuguese: "pt-BR",
  Russian: "ru-RU",
  Chinese: "zh-CN",
  Japanese: "ja-JP",
};

/** Strip sign markers and markdown noise so speech sounds clean. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[Signs:.*?\]/g, "")
    .replace(/[*+#_`~\[\]()]/g, "")
    .trim();
}

function pickVoice(targetLang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const lower = targetLang.toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === lower) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(lower.split("-")[0]))
  );
}

/** Build a configured utterance with the best voice for the given language. */
export function buildUtterance(
  text: string,
  language?: string,
): SpeechSynthesisUtterance {
  const clean = cleanForSpeech(text);
  const utterance = new SpeechSynthesisUtterance(clean);
  const hasArabic = /[؀-ۿ]/.test(clean);

  if (hasArabic) {
    const isEgyptian =
      language === "Egyptian Ammiya" ||
      clean.includes("يا باشا") ||
      clean.includes("تمام") ||
      clean.includes("ازيك");
    const defaultLang = isEgyptian ? "ar-EG" : "ar-SA";
    utterance.lang = defaultLang;
    const voice = pickVoice(defaultLang) || pickVoice("ar");
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "ar";
    }
  } else {
    const defaultLang = LANG_MAP[language || "English"] || "en-US";
    utterance.lang = defaultLang;
    const voice = pickVoice(defaultLang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
  }

  return utterance;
}

export interface SpeakCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

/** Speak text aloud, cancelling any current speech first. */
export function speak(
  text: string,
  language?: string,
  cb?: SpeakCallbacks,
): void {
  if (!("speechSynthesis" in window)) return;
  const utterance = buildUtterance(text, language);
  if (!utterance.text) return;
  utterance.onstart = () => cb?.onStart?.();
  utterance.onend = () => cb?.onEnd?.();
  utterance.onerror = () => cb?.onError?.();
  window.speechSynthesis.cancel();
  // Small delay works around a Chrome bug where speak() right after cancel() is dropped.
  setTimeout(() => window.speechSynthesis.speak(utterance), 60);
}

/** Stop any ongoing speech. */
export function cancelSpeech(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return "speechSynthesis" in window && window.speechSynthesis.speaking;
}
