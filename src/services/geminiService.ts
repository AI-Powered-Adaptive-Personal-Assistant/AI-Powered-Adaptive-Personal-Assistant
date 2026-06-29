// Accessibility / Sign-Studio AI helpers.
//
// This is a STATIC (no-backend) deployment, so these talk to the Gemini REST
// API directly from the browser using VITE_GEMINI_API_KEY. The vision/audio
// features need a multimodal model, so there's no text-only (Groq) fallback for
// those — they degrade gracefully instead of throwing.

const GEMINI_KEYS: string[] = (((import.meta as any).env?.VITE_GEMINI_API_KEY as string) || "")
  .split(/[,\s]+/)
  .map((k: string) => k.trim())
  .filter(Boolean);

function geminiKey(): string {
  return GEMINI_KEYS[0] || "";
}

const MODEL = "gemini-3.5-flash";

/** Strip a `data:<mime>;base64,` prefix if present, returning raw base64. */
function rawBase64(data: string): string {
  const i = data.indexOf("base64,");
  return i >= 0 ? data.slice(i + 7) : data;
}

/** Low-level Gemini call. `parts` is the user content (text and/or inlineData). */
async function callGemini(parts: any[]): Promise<string> {
  const key = geminiKey();
  if (!key) return "";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
      },
    );
    if (!res.ok) return "";
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch {
    return "";
  }
}

/** Pull the first JSON object/array out of a model reply (handles ```json fences). */
function parseJson<T>(text: string, fallback: T): T {
  if (!text) return fallback;
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.search(/[[{]/);
    if (start < 0) return fallback;
    return JSON.parse(cleaned.slice(start)) as T;
  } catch {
    return fallback;
  }
}

export const geminiService = {
  async translateSign(imageData: string, language: string = "English", level: string = "Basic") {
    const prompt = `You are a sign-language interpreter. Look at this image of a person signing and translate it into natural ${language}. Calibrate the wording to a ${level} reader. Reply with ONLY the translated sentence, no preamble. If no clear sign is visible, reply with an empty string.`;
    return callGemini([
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: rawBase64(imageData) } },
    ]);
  },

  async enhanceCaptions(text: string, language: string = "English") {
    const prompt = `Clean up and punctuate this live caption into a clear ${language} sentence. Fix obvious speech-to-text errors but keep the meaning. Reply with ONLY the cleaned text:\n\n${text}`;
    return (await callGemini([{ text: prompt }])) || text;
  },

  async transcribeAudio(audioData: string, language: string = "English", mimeType: string = "audio/webm") {
    const prompt = `Transcribe this audio accurately into ${language}. Reply with ONLY the transcription.`;
    const out = await callGemini([
      { text: prompt },
      { inlineData: { mimeType, data: rawBase64(audioData) } },
    ]);
    if (!out) throw new Error("Failed to transcribe audio");
    return out;
  },

  async generateSignSequence(text: string, language: string = "English") {
    const prompt = `Convert this ${language} sentence into a simple sign-language gloss sequence (UPPERCASE keywords in signing order, no grammar words). Reply with ONLY the gloss:\n\n${text}`;
    return (await callGemini([{ text: prompt }])) || text;
  },

  async optimizeSignScript(text: string, language: string = "English") {
    const prompt = `Rewrite this ${language} script so it is clear and easy to sign: short sentences, concrete words, signing order. Reply with ONLY the rewritten script:\n\n${text}`;
    return (await callGemini([{ text: prompt }])) || text;
  },

  async askGeneralQuestion(text: string, language: string = "English") {
    const prompt = `Answer clearly and concisely in ${language}:\n\n${text}`;
    return (await callGemini([{ text: prompt }])) || "";
  },

  async generateQuickReplies(text: string, language: string = "English"): Promise<string[]> {
    const prompt = `Someone just said: "${text}". Suggest 3 short, natural ${language} replies the listener could send back. Reply with ONLY a JSON array of strings, e.g. ["...","...","..."].`;
    const out = await callGemini([{ text: prompt }]);
    return parseJson<string[]>(out, []);
  },

  async decodeDysarthria(
    text: string,
    profile: string = "General",
    language: string = "English",
    customMappings: Array<{ phrase: string; translation: string }> = [],
  ) {
    const mappings = customMappings.length
      ? `\nKnown personal mappings (phrase => meaning): ${customMappings.map((m) => `"${m.phrase}" => "${m.translation}"`).join(", ")}`
      : "";
    const prompt = `This ${language} text comes from a speaker with dysarthria/atypical speech (profile: ${profile}). Infer the intended meaning and rewrite it as clear ${language}. Reply with ONLY the corrected sentence.${mappings}\n\nText: ${text}`;
    return (await callGemini([{ text: prompt }])) || text;
  },

  async correctTranscript(
    text: string,
    language: string = "Auto-Detect",
    profile: string = "Standard",
    customMappings: Array<{ phrase: string; translation: string }> = [],
    context: string[] = [],
  ): Promise<{ corrected: string; confidence: number; alternatives: string[] }> {
    const fallback = { corrected: text, confidence: 60, alternatives: [] as string[] };
    const mappings = customMappings.length
      ? ` Known personal mappings: ${customMappings.map((m) => `"${m.phrase}" => "${m.translation}"`).join(", ")}.`
      : "";
    const ctx = context.length ? ` Recent context: ${context.slice(-3).join(" | ")}.` : "";
    const prompt = `Correct this speech-to-text transcript (language: ${language}, speaker profile: ${profile}).${mappings}${ctx} Reply with ONLY JSON: {"corrected": string, "confidence": number 0-100, "alternatives": string[]}.\n\nTranscript: ${text}`;
    const out = await callGemini([{ text: prompt }]);
    const parsed = parseJson<Partial<typeof fallback>>(out, {});
    return {
      corrected: parsed.corrected || text,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 60,
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
    };
  },

  async decodeEuphoniaAudio(
    audioData: string,
    profile: string = "General",
    language: string = "English",
    customMappings: Array<{ phrase: string; translation: string }> = [],
    mimeType: string = "audio/webm",
  ) {
    const mappings = customMappings.length
      ? `\nKnown personal mappings: ${customMappings.map((m) => `"${m.phrase}" => "${m.translation}"`).join(", ")}`
      : "";
    const prompt = `This audio is from a speaker with atypical/impaired speech (profile: ${profile}). Listen carefully and transcribe the intended meaning as clear ${language}. Reply with ONLY the transcription.${mappings}`;
    const out = await callGemini([
      { text: prompt },
      { inlineData: { mimeType, data: rawBase64(audioData) } },
    ]);
    if (!out) throw new Error("Failed to decode Euphonia raw audio");
    return out;
  },
};
