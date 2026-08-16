import { UserProfile, Message } from "../types";
import { toast } from "../components/Toast";

// SECURITY: provider keys are NEVER read in the browser any more.
//
// They used to come from VITE_GEMINI_API_KEY / VITE_GROQ_API_KEY /
// VITE_XAI_API_KEY. Vite inlines every VITE_* variable into the production
// bundle at build time, so all of those keys were extractable from the public
// JS — anyone could read them from the deployed site and spend the quota.
// (.env being gitignored protects the repo, not the shipped bundle.)
//
// All provider calls now go through our own serverless functions under /api/,
// which hold the keys in server-only Vercel environment variables:
//   GEMINI_API_KEY, GROQ_API_KEY, XAI_API_KEY   (note: no VITE_ prefix)
// The Gemini → Groq → xAI failover and multi-key rotation moved server-side too,
// so there is no longer any in-browser fallback that could need a key.
const GEMINI_KEYS: string[] = [];

/** First key (used to build the initial request URL). "" if none configured. */
function geminiPrimaryKey(): string {
  return GEMINI_KEYS[0] || "";
}

// OpenAI-compatible fallback providers (used when Gemini is rate-limited/overloaded):
//  - NVIDIA NIM: VITE_NVIDIA_API_KEY (keys start with "nvapi-") — GLM-5.2, DeepSeek-R1
//  - Groq:  VITE_GROQ_API_KEY  (keys start with "gsk_")  — free, fast
//  - xAI/Grok: VITE_XAI_API_KEY (keys start with "xai-")
// One or several comma-separated keys each.
const NVIDIA_KEYS: string[] = [];
const GROQ_KEYS: string[] = [];
const XAI_KEYS: string[] = [];

/** First available fallback key (NVIDIA, Groq, or xAI). "" if none. */
function fallbackPrimaryKey(): string {
  return [...NVIDIA_KEYS, ...GROQ_KEYS, ...XAI_KEYS][0] || "";
}
const groqPrimaryKey = fallbackPrimaryKey;

/** Resolve the OpenAI-compatible endpoint + model for a key, by its prefix. */
function providerFor(key: string): {
  url: string;
  model: string;
  models: string[];
  params?: { temperature?: number; top_p?: number; max_tokens?: number; seed?: number };
} {
  const cleanKey = (key || "").trim();

  // NVIDIA NIM (GLM-5.2, DeepSeek-R1)
  if (cleanKey.startsWith("nvapi-")) {
    return {
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      model: "z-ai/glm-5.2",
      models: ["z-ai/glm-5.2", "deepseek-ai/deepseek-r1", "meta/llama-3.3-70b-instruct"],
      params: {
        temperature: 1,
        top_p: 1,
        max_tokens: 16384,
        seed: 42,
      },
    };
  }

  if (cleanKey.startsWith("xai-")) {
    return {
      url: "https://api.x.ai/v1/chat/completions",
      model: "grok-2-latest",
      models: ["grok-2-latest"],
      params: { temperature: 0.7, top_p: 0.95 },
    };
  }

  // default: Groq
  return {
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    params: { temperature: 0.7, top_p: 0.95 },
  };
}

// The /api/* routes now EXIST as Vercel serverless functions (see /api/gemini/*),
// so always use them — they hold the provider keys server-side. `null` means
// "not probed yet"; a non-OK/HTML response flips it to false, which now only
// disables pointless retries (there is no in-browser key path to fall back to).
let backendUp: boolean | null = null;

// Known-good Gemini model IDs, tried in order — the first that responds wins.
// (There is NO "gemini-3.5-flash"; using a non-existent model 404s silently.)
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
/** Primary Gemini model (used by non-streaming one-shot helpers). */
const GEMINI_MODEL = GEMINI_MODELS[0];

// One-time visibility into AI config (never logs the key values themselves), so
// a "the chat silently does nothing" problem is diagnosable from DevTools.
console.info(
  `[Cognify AI] Gemini key: ${GEMINI_KEYS.length ? "set" : "MISSING"} · ` +
  `Groq/xAI fallback: ${GROQ_KEYS.length || XAI_KEYS.length ? "set" : "none"} · model: ${GEMINI_MODEL}`,
);

/** Compact adaptive system prompt (shared by the Groq fallback). */
function buildPersona(profile: UserProfile): string {
  return `You are Cognify, an adaptive AI mentor. Answer the most correct, useful answer calibrated to THIS user.
- Level: ${profile.level} | Role: ${profile.role} | Field: ${profile.field}
- Reply in the SAME language/dialect as the user's last message (incl. Egyptian Arabic if they use it).
- Basic: simple, analogies, no jargon. Intermediate: normal, brief reasoning. Advanced: rigorous, direct.
- Answer first, no filler openers. Be honest if unsure; never invent facts.`;
}

// Stream a chat completion from Groq (OpenAI-compatible). Yields {text, done}.
async function* generateGroqStream(
  message: string,
  profile: UserProfile,
  history: Message[],
  apiKey: string,
  signal?: AbortSignal,
) {
  const mapped = history
    .filter((m) => m.id !== "welcome" && m.content?.trim())
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
  // The caller's history already ends with the just-sent user message; we add it
  // again below. Drop the trailing duplicate so it isn't sent twice.
  const lastM = mapped[mapped.length - 1];
  const dedupedMapped = (lastM?.role === "user" && lastM.content === message) ? mapped.slice(0, -1) : mapped;
  const messages = [
    { role: "system", content: buildPersona(profile) },
    ...dedupedMapped,
    { role: "user", content: message },
  ];

  const { url, model, models, params } = providerFor(apiKey);
  let res: Response | null = null;
  for (const m of models || [model]) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: m,
        messages,
        temperature: params?.temperature ?? 0.7,
        ...(params?.top_p ? { top_p: params.top_p } : {}),
        ...(params?.max_tokens ? { max_tokens: params.max_tokens } : {}),
        ...(params?.seed ? { seed: params.seed } : {}),
        stream: true,
      }),
      signal,
    });
    if (r.ok && r.body) { res = r; break; }
    const errText = await r.text().catch(() => "");
    console.error(`Fallback provider model "${m}" failed (${r.status}):`, errText.slice(0, 300));
    if (r.status === 401 || r.status === 403) break; // bad key — no point trying other models
  }

  if (!res || !res.body) {
    yield { text: "⚠️ AI is busy right now. Please try again in a moment.", done: true, error: true };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";
  // Keep partial text if the stream is interrupted, instead of throwing.
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const chunk = json.choices?.[0]?.delta?.content || "";
          if (chunk) {
            fullText += chunk;
            yield { text: fullText, done: false };
          }
        } catch {
          /* ignore partial json */
        }
      }
    }
  } catch (e) {
    console.error('Fallback stream interrupted — keeping partial text:', e);
  } finally {
    // Stop early -> generator .return() -> cancel the reader so the provider
    // stops streaming/generating instead of running on after the user hit Stop.
    reader.cancel().catch(() => {});
  }
  yield { text: fullText, done: true };
}

// Retry transient Gemini errors (503 overloaded / 429 rate-limited) with
// exponential backoff, rotating across keys if more than one is configured.
async function fetchGeminiWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
): Promise<Response> {
  let res = await fetch(url, init);
  let attempt = 0;
  let keyIdx = 0;
  while ((res.status === 503 || res.status === 429) && attempt < retries) {
    // Short wait — we rotate to a fresh key each retry, so no long backoff is needed.
    await new Promise((r) => setTimeout(r, 250));
    attempt++;
    // Rotate to the next key on rate-limit/overload (helps if several are set).
    if (GEMINI_KEYS.length > 1) {
      keyIdx = (keyIdx + 1) % GEMINI_KEYS.length;
      url = url.replace(/([?&]key=)[^&]+/, `$1${GEMINI_KEYS[keyIdx]}`);
    }
    res = await fetch(url, init);
  }
  return res;
}

export async function generateBenchmarkComparison(
  originalMessage: string,
  userMessage: string,
  profile: UserProfile
): Promise<string> {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const prompt = `You are an evaluation assistant. Compare two answers to the same question and explain, briefly and concretely, how they differ in correctness, depth and clarity for a ${profile.level} ${profile.field} learner.

Question / original answer:
${originalMessage}

Alternative answer:
${userMessage}

Write a short markdown comparison (bullets are fine) in ${profile.language || 'English'}. Be specific; no preamble.`;

  // 1) Optional backend (skipped on static deploys where backendUp === false).
  if (backendUp !== false) {
    try {
      const res = await fetch('/api/gemini/generateBenchmarkComparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalMessage, userMessage, profile })
      });
      const isHtml = res.headers.get('Content-Type')?.includes('text/html');
      if (res.ok && !isHtml) {
        const data = await res.json();
        if (data.result) return data.result;
      }
    } catch { /* fall through to direct providers */ }
  }

  // 2) Direct Gemini (static hosting).
  const apiKey = geminiPrimaryKey();
  if (apiKey) {
    try {
      const response = await fetchGeminiWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
        },
      );
      if (response.ok) {
        const d = await response.json();
        const txt = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt) return txt;
      }
    } catch { /* fall through to Groq */ }
  }

  // 3) Groq fallback.
  const groqKey = groqPrimaryKey();
  if (groqKey) {
    const txt = await groqChat([{ role: 'user', content: prompt }], groqKey);
    if (txt) return txt;
  }

  return isAr
    ? '⚠️ تعذّر إنشاء المقارنة الآن. جرّب تاني بعد لحظات.'
    : '⚠️ Couldn’t generate the comparison right now. Please try again in a moment.';
}

export async function generateProactiveInsights(
  profile: UserProfile,
  recentMessages: Message[]
): Promise<string> {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const recent = recentMessages
    .filter((m) => m.content?.trim())
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
  const prompt = `Based on this learner (level: ${profile.level}, field: ${profile.field}, role: ${profile.role}) and their recent conversation, give 2-4 SHORT, specific, encouraging proactive study insights to help them grow. Write in ${profile.language || 'English'}. Each line starts with "* ". No preamble.\n\nRecent conversation:\n${recent || '(none yet)'}`;

  // 1) Backend (only if this build actually has one — static deploys skip it)
  if (backendUp !== false) {
    try {
      const res = await fetch('/api/gemini/generateProactiveInsights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, recentMessages })
      });
      const isHtml = res.headers.get('Content-Type')?.includes('text/html');
      if (res.ok && !isHtml) {
        const data = await res.json();
        if (data.result) return data.result;
      }
    } catch { /* fall through */ }
  }

  // 2) Direct Gemini (static hosting)
  const apiKey = geminiPrimaryKey();
  if (apiKey) {
    try {
      const response = await fetchGeminiWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
        },
      );
      if (response.ok) {
        const d = await response.json();
        const txt = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt) return txt;
      }
    } catch { /* fall through */ }
  }

  // 3) Groq fallback
  const groqKey = groqPrimaryKey();
  if (groqKey) {
    const txt = await groqChat([{ role: 'user', content: prompt }], groqKey);
    if (txt) return txt;
  }

  return isAr
    ? '* ركّز على نقاط ضعفك واعمل تمارين منتظمة في مجالك.\n* راجع آخر اللي اتعلمته كل أسبوع.'
    : '* Keep practicing regularly in your field and target your weak spots.\n* Review what you learned each week.';
}

// Non-streaming Groq completion → returns the full text ("" on failure).
async function groqChat(
  messages: { role: string; content: string }[],
  apiKey: string,
): Promise<string> {
  try {
    const { url, model } = providerFor(apiKey);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.7 }),
    });
    if (!res.ok) return "";
    const d = await res.json();
    return d.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

// Generate a short, content-based chat title (3-6 words) from the first
// exchange — like ChatGPT's auto-naming. Falls back to a trimmed message.
export async function generateChatTitle(
  userMessage: string,
  aiReply: string,
  language?: string,
): Promise<string> {
  const fallback = userMessage.trim().slice(0, 40);
  const prompt = `Create a SHORT title (3 to 6 words) summarizing this conversation's topic. ${
    language ? `Write it in ${language}.` : 'Use the same language as the user.'
  } Reply with ONLY the title — no quotes, no trailing punctuation, no "Title:" prefix.

User: ${userMessage.slice(0, 500)}
Assistant: ${aiReply.slice(0, 500)}`;

  const clean = (t: string) =>
    t.replace(/^["'#\s]+|["'.\s]+$/g, '').replace(/^title:\s*/i, '').split('\n')[0].slice(0, 60).trim();

  // Direct Gemini → Groq fallback.
  const apiKey = geminiPrimaryKey();
  if (apiKey) {
    try {
      const res = await fetchGeminiWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
        },
      );
      if (res.ok) {
        const d = await res.json();
        const txt = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt) return clean(txt) || fallback;
      }
    } catch { /* fall through */ }
  }
  const groqKey = groqPrimaryKey();
  if (groqKey) {
    const txt = await groqChat([{ role: 'user', content: prompt }], groqKey);
    if (txt) return clean(txt) || fallback;
  }
  return fallback;
}

export async function generateLogicResponse(
  message: string,
  profile: UserProfile,
  moduleName: string,
  history: { role: 'user' | 'model', parts: { text: string }[] }[] = []
): Promise<string> {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';

  // Direct (no-backend) path: Gemini → Groq. Used when there's no backend, and
  // as the fallback when a backend request fails.
  const direct = async (): Promise<string> => {
    let text = "";
    const apiKey = geminiPrimaryKey();
    if (apiKey) {
      try {
        const prompt = `You are a Logic Tutor on ${moduleName}.\nUser Profile: ${JSON.stringify(profile)}\nUser: ${message}`;
        const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
        });
        if (response.ok) {
          const d = await response.json();
          text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
      } catch { /* fall through to Groq */ }
    }
    if (!text) {
      const groqKey = groqPrimaryKey();
      if (groqKey) {
        text = await groqChat([
          { role: "system", content: `You are a Logic Tutor for the "${moduleName}" module. ${buildPersona(profile)}` },
          { role: "user", content: message },
        ], groqKey);
      }
    }
    return text || (isAr
      ? "⚠️ الذكاء مشغول دلوقتي بسبب الضغط. جرّب كمان شوية 🙏"
      : "⚠️ The AI is busy right now. Please try again in a moment 🙏");
  };

  if (backendUp === false) return direct();

  try {
    const res = await fetch('/api/gemini/generateLogicResponse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, profile, moduleName, history })
    });
    const isHtml = res.headers.get('Content-Type')?.includes('text/html');
    if (!res.ok || isHtml) {
      backendUp = false;
      return direct();
    }
    const data = await res.json();
    return data.result;
  } catch {
    return direct();
  }
}

async function* generateAdaptiveResponseStreamClient(
  message: string,
  profile: UserProfile,
  history: Message[],
  attachments: { name: string, type: string, data: string }[] = [],
  apiKey: string,
  signal?: AbortSignal
) {
  const otherThreadsSummary = profile.chatThreads
    ?.filter(t => t.id !== profile.activeThreadId)
    .map(t => `Thread "${t.title}": ${t.lastMessageSnippet || 'No summary'}`)
    .join('\n') || 'None';

  const systemInstruction = `
You are Cognify, an adaptive AI mentor. Your only goal: the most correct, useful answer possible, calibrated to THIS user.

## USER
- Level: ${profile.level} | Role: ${profile.role} (${profile.educationLevel || 'N/A'})
- Field: ${profile.field}
- Context: ${profile.role === 'Student' ? `${profile.faculty} @ ${profile.university}` : `${profile.jobTitle} @ ${profile.work}`}
- Preferred language: ${profile.language || 'English'}
- Accessibility mode: ${profile.accessibilityMode}

## CALIBRATION (highest priority)
- Basic: short sentences, everyday analogies, zero jargon, one idea at a time.
- Intermediate: normal professional vocabulary, show brief reasoning.
- Advanced: be rigorous and direct, skip the basics, engage with nuance, trade-offs and edge cases.
- Anchor examples in the user's field (${profile.field}) whenever natural.

## LANGUAGE MIRRORING (strict)
Always reply in the same language AND dialect as the user's LAST message:
- English → English.
- فصحى → فصحى.
- مصري (علامات: "ازيك"، "عايز"، "ليه"، "ازاي") → رد بمصري طبيعي وودود ("تمام يا باشا"، "خليني أقولك على حاجة"...) مع الحفاظ على دقة المصطلحات التقنية — ممكن تكتب المصطلح الإنجليزي بين قوسين.
- If the user switches language mid-conversation, switch immediately.

## ANSWER STYLE
- Answer the question FIRST, then add context. No filler openers ("Great question!", "Sure!").
- Simple question → 1-4 sentences of plain prose. Use bullets/headers ONLY when the answer is genuinely multi-part.
- If the input is messy, misspelled or mixed-language, infer the intent and answer it. Never say you can't understand.
- If asked the same thing again, explain it from a different angle — never repeat your previous wording.
- If you are not certain about a fact, say so briefly. Never invent facts, sources or numbers.

## ACCESSIBILITY
${profile.accessibilityMode === 'Visual' ? `- USER IS BLIND. Describe images/documents vividly and spatially (layout, positions, colors). Write linear, narratable prose — no tables, no visual-only formatting.` : ''}
${(profile.accessibilityMode === 'Vocal-Deaf' || profile.accessibilityMode === 'Sign-Only') ? `- User is deaf. Short, visual sentences. End every reply with one line: [Signs: 3-5 emojis matching the core meaning].` : ''}
${profile.accessibilityMode === 'Speech' ? `- Output is read aloud by TTS: smooth speakable prose, no tables, no symbol clutter, no markdown noise.` : ''}

## MEMORY
Summaries of the user's other threads are below. Use them ONLY if the user explicitly asks about past conversations. Otherwise ignore them completely — never volunteer them, especially not on greetings.
${otherThreadsSummary}
`;

  const contents: any[] = [];
  const historyForModel = history
    .filter(m => m.id !== 'welcome')
    .filter(m => m.content?.trim())
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

  const cleanHistory = historyForModel[0]?.role === 'model' ? historyForModel.slice(1) : historyForModel;
  // The caller passes the just-sent user message as the LAST item of `history`,
  // and we also append it explicitly below (with its attachments). Drop that
  // trailing duplicate so the question isn't sent to the model twice — that
  // both wastes tokens/quota and muddies the context.
  const last = cleanHistory[cleanHistory.length - 1];
  const dedupedHistory = (last?.role === 'user' && last.parts?.[0]?.text === message)
    ? cleanHistory.slice(0, -1)
    : cleanHistory;
  contents.push(...dedupedHistory);

  const currentParts: any[] = [{ text: message }];
  attachments.forEach(file => {
    currentParts.push({
      inlineData: {
        mimeType: file.type,
        data: file.data
      }
    });
  });
  contents.push({ role: 'user', parts: currentParts });

  const body = JSON.stringify({
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.7,
      topP: 0.95
    }
  });

  // Try each known-good model until one responds. A wrong model 404s, so this
  // also protects us if Google retires a model. Log the real reason on failure
  // so it's never an invisible "the chat just broke".
  let res: Response | null = null;
  let lastStatus = 0; // real HTTP status of the last failed attempt (res is null on failure)
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const r = await fetchGeminiWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal
    });
    if (r.ok && r.body) { res = r; break; }
    lastStatus = r.status;
    const errText = await r.text().catch(() => "");
    console.error(`Gemini model "${model}" failed (${r.status}):`, errText.slice(0, 300));
    if (r.status === 400 || r.status === 401 || r.status === 403) break; // bad key/request — other models won't help
  }

  if (!res || !res.ok) {
    // Gemini failed (overloaded/rate-limited) → automatically fall back to Groq.
    const groqKey = groqPrimaryKey();
    if (groqKey) {
      // Signal the fallback so the UI can warn if attachments (images/PDFs) were
      // sent — the text-only fallback provider can't see them.
      yield { text: '', done: false, usedFallback: true };
      yield* generateGroqStream(message, profile, history, groqKey, signal);
      return;
    }
    const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
    const status = res?.status ?? lastStatus; // res is null here, so use the captured status
    if (status === 503) {
      toast.error(
        isArabic
          ? "منصة Google Gemini غير متوفرة حالياً بسبب زيادة الضغط (رمز 503). يرجى المحاولة بعد لحظات."
          : "Google Gemini is currently rate-limited or overloaded (503 Service Unavailable). Please try again shortly.",
        isArabic ? "الخدمة مثقلة بالأحمال" : "Gemini Overloaded"
      );
      yield {
        text: isArabic
          ? "⚠️ منصة Google Gemini غير متوفرة حالياً بسبب زيادة الضغط (رمز 503)."
          : "⚠️ Google Gemini is currently overloaded (503 Service Unavailable).",
        done: true,
        error: true
      };
    } else {
      toast.error(
        isArabic
          ? `عذراً، فشل الاتصال بخوادم الذكاء الاصطناعي (رمز ${status}). تأكد من صحة مفتاح الـ API.`
          : `AI gateway communication error (Status: ${status}). Please verify your custom API key.`,
        isArabic ? "فشل بوابة الذكاء" : "Gateway Error"
      );
      yield {
        text: isArabic
          ? `⚠️ عذراً، فشل الاتصال بخوادم الذكاء الاصطناعي (رمز ${status}).`
          : `⚠️ AI gateway communication error (Status: ${status}).`,
        done: true,
        error: true
      };
    }
    return;
  }

  if (!res.body) {
    yield { text: "Couldn't connect to the AI. Please try again.", done: true, error: true };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = '';
  let fullText = '';

  // If the network drops mid-stream, DON'T throw (that would discard everything
  // already written). Keep what we have and finalize it gracefully.
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            const chunkText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (chunkText) {
              fullText += chunkText;
              yield { text: fullText, done: false };
            }
          } catch (e) {
            // ignore parsing streams error
          }
        }
      }
    }
  } catch (e) {
    console.error('Gemini stream interrupted — keeping partial text:', e);
  } finally {
    // When the consumer stops early (Stop button -> generator .return()), cancel
    // the reader so the HTTP stream closes and Google stops generating (and billing).
    reader.cancel().catch(() => {});
  }

  yield { text: fullText, done: true };
}

export async function* generateAdaptiveResponseStream(
  message: string,
  profile: UserProfile,
  history: Message[],
  attachments: { name: string, type: string, data: string }[] = [],
  signal?: AbortSignal
) {
  // Once we know there's no backend, go straight to the direct path.
  if (backendUp === false) {
    const apiKey = geminiPrimaryKey();
    if (apiKey) { yield* generateAdaptiveResponseStreamClient(message, profile, history, attachments, apiKey, signal); return; }
    const groqKey = groqPrimaryKey();
    if (groqKey) { yield* generateGroqStream(message, profile, history, groqKey, signal); return; }
    const ar = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
    yield { text: ar ? '⚠️ مفيش مفتاح ذكاء اصطناعي متفعّل.' : '⚠️ No AI key configured.', done: true, error: true };
    return;
  }
  try {
    const res = await fetch('/api/gemini/generateAdaptiveResponseStream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, profile, history, attachments }),
      signal
    });

    const isHtml = res.headers.get('Content-Type')?.includes('text/html') || false;

    if (!res.ok || isHtml) {
      backendUp = false; // remember: skip the backend next time
      const apiKey = geminiPrimaryKey();
      if (apiKey) {
        yield* generateAdaptiveResponseStreamClient(message, profile, history, attachments, apiKey, signal);
        return;
      }
      // No Gemini key configured → use Groq directly if available.
      const groqKey = groqPrimaryKey();
      if (groqKey) {
        yield* generateGroqStream(message, profile, history, groqKey, signal);
        return;
      }

      const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
      
      if (!isHtml) {
        if (res.status === 503) {
          toast.error(
            isArabic 
              ? "فشل الاتصال: خادم الذكاء الاصطناعي مجهد ومثقل بطلبات الخدمة حالياً (503). يرجى المحاولة مرة أخرى."
              : "Connection overload: The Google AI service is temporarily down or busy (503). Please try again shortly.",
            isArabic ? "الخدمة مجهدة حالياً" : "AI Service Overloaded"
          );
        } else if (res.status >= 500) {
          toast.error(
            isArabic
              ? `حدث خطأ تقني داخلي في خادم الاتصال (رمز ${res.status}).`
              : `Internal gateway error occurred on the server (Status: ${res.status}).`,
            isArabic ? "خطأ الاتصال مفقود" : "Internal Gateway Fault"
          );
        } else {
          toast.warning(
            isArabic
              ? `لم تكتمل العملية بنجاح (رمز الاستجابة: ${res.status}).`
              : `Request failed with response status: ${res.status}.`,
            isArabic ? "فشل طلب الخدمة" : "Request Failure"
          );
        }
      }

      const cloudRunUrl = "https://ais-pre-yrqajcztyb24fektpr6ddb-78152961995.europe-west1.run.app";
      const explanationText = isArabic 
        ? `⚠️ **تنبيه هام حول بيئة التشغيل من كوجنيفي:**
        
أنت تقوم حاليًا بتصفح التطبيق عبر استضافة ساكنة (Static Hosting مثل Vercel)، وهي لا تدعم الـ Express Backend اللازم لتشغيل وظائف الذكاء الاصطناعي السحابية.

للحصول على كامل أداء كوجنيفي، من فضلك افتح رابط التشغيل المباشر والكامل للـ Full-Stack على منصة **Cloud Run** من جوجل:
👉 **[زيارة رابط التشغيل المتكامل والكامل من هنا](${cloudRunUrl})**

*إذا كنت تفضل استخدام Vercel، يمكنك ببساطة وضع مفتاحك الخاص للذكاء الاصطناعي باسم \`VITE_GEMINI_API_KEY\` في إعدادات البيئة بـ Vercel ليعمل معك مباشرة.*`
        : `⚠️ **Cognify Deployment Warning:**

You are currently accessing the application on a Static Host (such as Vercel). This environment does not run the backend Express server needed for server-side AI tasks.

To experience Cognify's full-stack features, please use our fully integrated **Cloud Run** preview URL:
👉 **[Open the Full-Stack Cloud Run App Here](${cloudRunUrl})**

*If you prefer to host on Vercel, you can configure your own Gemini API key inside Vercel's environment variables as \`VITE_GEMINI_API_KEY\` to enable direct in-browser logic processing.*`;

      yield { text: explanationText, done: true, error: true };
      return;
    }

    if (!res.body) {
      yield { text: "Couldn't connect to the AI. Please try again.", done: true, error: true };
      return;
    }

    backendUp = true; // backend is real — keep using it

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.replace('data: ', '');
            try {
              const chunk = JSON.parse(jsonStr);
              yield chunk;
            } catch (e) {
              console.error("Stream parsing error", e);
            }
          }
        }
      }
    } finally {
      // Stop early -> cancel the server stream so it stops proxying tokens.
      reader.cancel().catch(() => {});
    }
  } catch (err: any) {
    // User pressed Stop (AbortController) — not a real error, don't toast.
    if (err?.name === 'AbortError') { yield { text: '', done: true }; return; }
    const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
    toast.error(
      isArabic
        ? "تعذّر الاتصال بالخادم. تأكّد من اتصالك بالإنترنت وحاول مرة أخرى."
        : "Couldn't reach the server. Check your connection and try again.",
      isArabic ? "خطأ في الاتصال" : "Connection Error"
    );
    yield { text: `Error: ${err.message}`, done: true, error: true };
  }
}

export async function generateAdaptiveResponse(
  message: string,
  profile: UserProfile,
  history: Message[],
  attachments: { name: string, type: string, data: string }[] = []
) {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';

  // Direct (no-backend) path: stream from Gemini/Groq and collect the full text.
  const direct = async (): Promise<string> => {
    let text = "";
    for await (const chunk of generateAdaptiveResponseStream(message, profile, history, attachments)) {
      if (chunk.text) text = chunk.text;
    }
    return text || (isAr
      ? "⚠️ الذكاء مشغول دلوقتي. جرّب تاني 🙏"
      : "⚠️ The AI is busy right now. Please try again in a moment 🙏");
  };

  if (backendUp === false) return direct();

  try {
    const res = await fetch('/api/gemini/generateAdaptiveResponse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, profile, history, attachments })
    });
    const isHtml = res.headers.get('Content-Type')?.includes('text/html');
    if (!res.ok || isHtml) {
      backendUp = false;
      return direct();
    }
    const data = await res.json();
    return data.result;
  } catch {
    return direct();
  }
}
