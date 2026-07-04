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

// OpenAI-compatible free fallbacks (Groq / xAI) — same keys the main chat uses.
// The sign/accessibility TEXT helpers fall back to these when Gemini is missing
// or rate-limited, so a free Groq key alone still powers the disability section.
// (Vision/audio helpers stay Gemini-only — Groq text models aren't multimodal.)
const GROQ_KEYS: string[] = (((import.meta as any).env?.VITE_GROQ_API_KEY as string) || "")
  .split(/[,\s]+/).map((k: string) => k.trim()).filter(Boolean);
const XAI_KEYS: string[] = (((import.meta as any).env?.VITE_XAI_API_KEY as string) || "")
  .split(/[,\s]+/).map((k: string) => k.trim()).filter(Boolean);

const FALLBACK_KEYS: string[] = [...GROQ_KEYS, ...XAI_KEYS];

/** Text-only completion via an OpenAI-compatible provider (Groq/xAI). Rotates
 *  across every key on quota/overload so the free tier lasts longer. "" on failure. */
async function callGroqText(prompt: string): Promise<string> {
  if (!FALLBACK_KEYS.length) return "";
  for (const key of FALLBACK_KEYS) {
    const isXai = key.startsWith("xai-");
    const url = isXai ? "https://api.x.ai/v1/chat/completions" : "https://api.groq.com/openai/v1/chat/completions";
    const model = isXai ? "grok-2-latest" : "llama-3.3-70b-versatile";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.7 }),
      });
      if (res.ok) {
        const d = await res.json();
        return d.choices?.[0]?.message?.content || "";
      }
      console.error(`Fallback text provider failed (${res.status})`);
      if (res.status === 400) return ""; // malformed — no key will fix it
      // 429/rate-limit or bad key → rotate to the next key.
    } catch (e) {
      console.error("Fallback text provider threw:", e);
    }
  }
  return "";
}

/** Text helper: try Gemini, then fall back to Groq/xAI so a free key still works. */
async function callText(prompt: string): Promise<string> {
  const viaGemini = await callGemini([{ text: prompt }]);
  if (viaGemini) return viaGemini;
  return callGroqText(prompt);
}

// Known-good Gemini model IDs, tried in order (there is NO "gemini-3.5-flash").
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

/** Strip a `data:<mime>;base64,` prefix if present, returning raw base64. */
function rawBase64(data: string): string {
  const i = data.indexOf("base64,");
  return i >= 0 ? data.slice(i + 7) : data;
}

/**
 * Low-level Gemini call. `parts` is the user content (text and/or inlineData).
 * Rotates across ALL configured keys: when one key is quota-exhausted/overloaded
 * (429/503) or invalid (401/403), it moves to the next key instead of giving up.
 * This spreads the free-tier quota across every key so the disability section
 * (which many users hit at once) doesn't die on a single key's limit.
 */
async function callGemini(parts: any[]): Promise<string> {
  if (!GEMINI_KEYS.length) {
    console.error("Gemini accessibility call skipped: VITE_GEMINI_API_KEY is not set.");
    return "";
  }
  const body = JSON.stringify({ contents: [{ role: "user", parts }] });
  for (const key of GEMINI_KEYS) {
    for (const model of MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body },
        );
        if (res.ok) {
          const d = await res.json();
          return d.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
        const errText = await res.text().catch(() => "");
        console.error(`Gemini model "${model}" failed (${res.status}):`, errText.slice(0, 300));
        // 400 = malformed request — no key or model will fix it.
        if (res.status === 400) return "";
        // Quota/overload or bad key → stop trying models on THIS key, rotate to the next key.
        if (res.status === 429 || res.status === 503 || res.status === 401 || res.status === 403) break;
        // Other statuses (e.g. 404 model): try the next model on the same key.
      } catch (e) {
        console.error(`Gemini model "${model}" threw:`, e);
      }
    }
  }
  return "";
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
    // STRICT anti-hallucination prompt. A single webcam frame is ambiguous, so
    // the model MUST refuse unless it sees a clear, deliberate sign — otherwise
    // it invents sentences ("the mobile device is secured…") from random hands.
    const prompt = `You read sign language (ASL fingerspelling A–Z / 0–9 and common word signs) from a single webcam frame.

STRICT RULES — follow exactly:
1. Reply ONLY with the single word or short sign the hand is CLEARLY and DELIBERATELY forming, in ${language}, calibrated to a ${level} reader.
2. If the hand is at rest, mid-transition, blurry, ambiguous, holding an object/phone, or you are AT ALL unsure — reply with EXACTLY: [NO_SIGN]
3. NEVER describe the scene, the person, the room, objects, or the phone. NEVER guess. NEVER write a full sentence or narration.
4. When uncertain, ALWAYS prefer [NO_SIGN]. A wrong word is worse than [NO_SIGN].

Reply with just the sign, or [NO_SIGN]. Nothing else.`;
    return callGemini([
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: rawBase64(imageData) } },
    ]);
  },

  async enhanceCaptions(text: string, language: string = "English") {
    const prompt = `Clean up and punctuate this live caption into a clear ${language} sentence. Fix obvious speech-to-text errors but keep the meaning. Reply with ONLY the cleaned text:\n\n${text}`;
    return (await callText(prompt)) || text;
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
    return (await callText(prompt)) || text;
  },

  async optimizeSignScript(text: string, language: string = "English") {
    const prompt = `Rewrite this ${language} script so it is clear and easy to sign: short sentences, concrete words, signing order. Reply with ONLY the rewritten script:\n\n${text}`;
    return (await callText(prompt)) || text;
  },

  async askGeneralQuestion(text: string, _language: string = "English") {
    // Mirror the QUESTION's language (fixes "Arabic in → English out").
    const prompt = `Answer the following clearly and concisely. IMPORTANT: reply in the SAME language and dialect as the question — if it's Arabic (incl. Egyptian), answer in Arabic; if English, answer in English.\n\nQuestion: ${text}`;
    return (await callText(prompt)) || "";
  },

  async generateQuickReplies(text: string, language: string = "English"): Promise<string[]> {
    const prompt = `Someone just said: "${text}". Suggest 3 short, natural ${language} replies the listener could send back. Reply with ONLY a JSON array of strings, e.g. ["...","...","..."].`;
    const out = await callText(prompt);
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
    return (await callText(prompt)) || text;
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
    const out = await callText(prompt);
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
