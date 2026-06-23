import { UserProfile, Message } from "../types";
import { toast } from "../components/Toast";

// Supports ONE or MANY keys: set VITE_GEMINI_API_KEY to a single key, or several
// comma/space-separated keys to multiply the free-tier quota. On 429/503 the
// retry rotates to the next key.
const GEMINI_KEYS: string[] = (((import.meta as any).env?.VITE_GEMINI_API_KEY as string) || "")
  .split(/[,\s]+/)
  .map((k: string) => k.trim())
  .filter(Boolean);

/** First key (used to build the initial request URL). "" if none configured. */
function geminiPrimaryKey(): string {
  return GEMINI_KEYS[0] || "";
}

// Groq is used as an automatic fallback when Gemini is rate-limited/overloaded.
// Set VITE_GROQ_API_KEY (one or several comma-separated keys) to enable it.
const GROQ_KEYS: string[] = (((import.meta as any).env?.VITE_GROQ_API_KEY as string) || "")
  .split(/[,\s]+/)
  .map((k: string) => k.trim())
  .filter(Boolean);
function groqPrimaryKey(): string {
  return GROQ_KEYS[0] || "";
}

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
) {
  const messages = [
    { role: "system", content: buildPersona(profile) },
    ...history
      .filter((m) => m.id !== "welcome" && m.content?.trim())
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    yield { text: "⚠️ AI is busy right now. Please try again in a moment.", done: true, error: true };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";
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
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
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

export async function evaluateQuizPOV(question: string, pov: string): Promise<boolean> {
  try {
    const res = await fetch('/api/gemini/evaluateQuizPOV', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, pov })
    });
    const isHtml = res.headers.get('Content-Type')?.includes('text/html');
    if (!res.ok || isHtml) {
      return true;
    }
    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error("evaluateQuizPOV error:", err);
    return true;
  }
}

export interface QuizItem {
  id: number;
  text: string;
  options: string[];
}

export interface AssessmentQuestion {
  id: number;
  type: "mcq" | "open";
  text: string;
  options: string[];
  correctAnswer: string;
}

function normalizeAssessment(parsed: any): AssessmentQuestion[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((q: any, i: number) => ({
      id: typeof q.id === "number" ? q.id : i + 1,
      type: q.type === "open" ? ("open" as const) : ("mcq" as const),
      text: String(q.text || ""),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correctAnswer: String(q.correctAnswer || ""),
    }))
    .filter((q) => q.text && (q.type === "open" || q.options.length >= 2));
}

async function generateAssessmentDirect(
  field: string,
  language: string,
  level: string,
  count: number,
  apiKey: string,
): Promise<AssessmentQuestion[]> {
  const model = "gemini-3.5-flash";
  const dialect =
    language === "Egyptian Ammiya" ? " (Egyptian colloquial Arabic)" : "";
  const mcqCount = Math.max(1, count - 1);
  const prompt = `You are an expert examiner creating a focused assessment for a learner whose field/track is: "${field}".
Generate exactly ${count} questions that test REAL core knowledge, concepts and terminology SPECIFIC to "${field}".
STRICT rules:
- Every question MUST be clearly about "${field}".
- DO NOT use generic IQ, riddles, trick questions, math puzzles or general trivia.
- Level: ${level} (foundational core concepts for "Basic").
- Write EVERYTHING in ${language}${dialect}.
- ${mcqCount} multiple-choice (exactly 4 options, ONE correct) + 1 short open-ended question to explain a key concept in "${field}".
Return ONLY a JSON array; each item:
{"id": number, "type": "mcq"|"open", "text": string, "options": string[] (4 for mcq, [] for open), "correctAnswer": string}`;
  const response = await fetchGeminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) return [];
  const d = await response.json();
  const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return normalizeAssessment(extractJsonArray(txt));
}

/**
 * Generate a field-specific assessment (mixed MCQ + open). Tries the backend,
 * then falls back to a direct in-browser Gemini call. Returns [] on failure so
 * the caller can fall back to a static question set.
 */
async function generateAssessmentGroq(
  field: string,
  language: string,
  level: string,
  count: number,
  groqKey: string,
): Promise<AssessmentQuestion[]> {
  const dialect = language === "Egyptian Ammiya" ? " (Egyptian colloquial Arabic)" : "";
  const mcqCount = Math.max(1, count - 1);
  const prompt = `You are an expert examiner creating a focused assessment for a learner whose field/track is: "${field}".
Generate exactly ${count} questions testing REAL core knowledge SPECIFIC to "${field}". DO NOT use generic IQ/riddles/trivia.
Level: ${level}. Write everything in ${language}${dialect}.
${mcqCount} multiple-choice (4 options, ONE correct) + 1 short open-ended question about "${field}".
Return ONLY a JSON array: [{"id": number, "type": "mcq"|"open", "text": string, "options": string[], "correctAnswer": string}]`;
  const txt = await groqChat([{ role: "user", content: prompt }], groqKey);
  return normalizeAssessment(extractJsonArray(txt));
}

export async function generateAssessment(
  field: string,
  language: string = "English",
  level: string = "Basic",
  count: number = 8,
): Promise<AssessmentQuestion[]> {
  const apiKey = geminiPrimaryKey();
  const groqKey = groqPrimaryKey();
  const direct = async (): Promise<AssessmentQuestion[]> => {
    if (apiKey) {
      const qs = await generateAssessmentDirect(field, language, level, count, apiKey);
      if (qs.length) return qs;
    }
    // Gemini unavailable/empty → try Groq so the field quiz still works.
    if (groqKey) return await generateAssessmentGroq(field, language, level, count, groqKey);
    return [];
  };
  try {
    const res = await fetch("/api/gemini/generateAssessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, language, level, count }),
    });
    const isHtml = res.headers.get("Content-Type")?.includes("text/html");
    if (res.ok && !isHtml) {
      const data = await res.json();
      const qs = normalizeAssessment(data.result);
      if (qs.length) return qs;
    }
    return await direct();
  } catch (err) {
    console.error("generateAssessment error:", err);
    try {
      return await direct();
    } catch {
      return [];
    }
  }
}

function extractJsonArray(raw: string): any[] {
  if (!raw) return [];
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
}

async function translateQuizDirect(
  questions: QuizItem[],
  language: string,
  apiKey: string,
): Promise<QuizItem[] | null> {
  const model = "gemini-3.5-flash";
  const dialect =
    language === "Egyptian Ammiya" ? " (Egyptian colloquial Arabic)" : "";
  const prompt = `Translate these IQ/logic quiz questions into ${language}${dialect}.
Rules:
- Keep the EXACT same number of options, in the SAME order.
- Preserve numbers, sequences and proper nouns; translate naturally otherwise.
- Keep each question solvable (do not reveal the answer).
- Return ONLY a JSON array of {"id": number, "text": string, "options": string[]}. No markdown.

Input: ${JSON.stringify(questions)}`;
  const response = await fetchGeminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    },
  );
  if (!response.ok) return null;
  const d = await response.json();
  const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = extractJsonArray(txt);
  return parsed.length ? (parsed as QuizItem[]) : null;
}

/**
 * Translate quiz questions into the target language (text + options, order
 * preserved). Tries the Express backend first, then falls back to a direct
 * in-browser Gemini call (static hosting). Returns null on total failure so
 * the caller can keep the original English questions.
 */
export async function translateQuiz(
  questions: QuizItem[],
  language: string,
): Promise<QuizItem[] | null> {
  if (!language || language === "English") return questions;
  const payload = questions.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options,
  }));
  const apiKey =
    geminiPrimaryKey();

  try {
    const res = await fetch("/api/gemini/translateQuiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: payload, language }),
    });
    const isHtml = res.headers.get("Content-Type")?.includes("text/html");
    if (res.ok && !isHtml) {
      const data = await res.json();
      if (Array.isArray(data.result) && data.result.length) return data.result;
    }
    if (apiKey) return await translateQuizDirect(payload, language, apiKey);
    return null;
  } catch (err) {
    console.error("translateQuiz error:", err);
    if (apiKey) {
      try {
        return await translateQuizDirect(payload, language, apiKey);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function generateBenchmarkComparison(
  originalMessage: string,
  userMessage: string,
  profile: UserProfile
): Promise<string> {
  try {
    const res = await fetch('/api/gemini/generateBenchmarkComparison', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalMessage, userMessage, profile })
    });
    const isHtml = res.headers.get('Content-Type')?.includes('text/html');
    if (!res.ok || isHtml) {
      if (!isHtml && res.status === 503) {
        toast.warning(
          profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya'
            ? "خادم التقييمات مجهد حاليا (503). يتعذر إنشاء مقارنة النماذج."
            : "Benchmark server overloaded (503). Unable to generate model comparison.",
          profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya' ? "الخدمة مشغولة" : "Assessments Overloaded"
        );
      }
      return `### System Fallback (Static Web Warning)
The benchmark feature requires the Express backend which is not running in this static deployment. 
To use benchmarks, please visit our official full-stack deployment URL on Cloud Run or set up a server backend.`;
    }
    const data = await res.json();
    return data.result;
  } catch (err: any) {
    return `Error generating comparison: ${err.message}`;
  }
}

export async function generateProactiveInsights(
  profile: UserProfile,
  recentMessages: Message[]
): Promise<string> {
  try {
    const res = await fetch('/api/gemini/generateProactiveInsights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, recentMessages })
    });
    const isHtml = res.headers.get('Content-Type')?.includes('text/html');
    if (!res.ok || isHtml) {
      return "* Connect to full-stack Cloud Run build to view proactive study insights.";
    }
    const data = await res.json();
    return data.result;
  } catch (err) {
    return "Insights unavailable.";
  }
}

// Non-streaming Groq completion → returns the full text ("" on failure).
async function groqChat(
  messages: { role: string; content: string }[],
  apiKey: string,
): Promise<string> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.7 }),
    });
    if (!res.ok) return "";
    const d = await res.json();
    return d.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

export async function generateLogicResponse(
  message: string,
  profile: UserProfile,
  moduleName: string,
  history: { role: 'user' | 'model', parts: { text: string }[] }[] = []
): Promise<string> {
  try {
    const res = await fetch('/api/gemini/generateLogicResponse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, profile, moduleName, history })
    });
    const isHtml = res.headers.get('Content-Type')?.includes('text/html');
    const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
    if (!res.ok || isHtml) {
      let text = "";
      const apiKey = geminiPrimaryKey();
      if (apiKey) {
        try {
          const prompt = `You are a Logic Tutor on ${moduleName}.\nUser Profile: ${JSON.stringify(profile)}\nUser: ${message}`;
          const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }]
            })
          });
          if (response.ok) {
            const d = await response.json();
            text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
          }
        } catch { /* fall through to Groq */ }
      }
      // Fallback to Groq if Gemini failed/returned nothing.
      if (!text) {
        const groqKey = groqPrimaryKey();
        if (groqKey) {
          text = await groqChat([
            { role: "system", content: `You are a Logic Tutor for the "${moduleName}" module. ${buildPersona(profile)}` },
            { role: "user", content: message },
          ], groqKey);
        }
      }
      if (text) return text;
      return isAr
        ? "⚠️ الذكاء مشغول دلوقتي بسبب الضغط. جرّب كمان شوية 🙏"
        : "⚠️ The AI is busy right now. Please try again in a moment 🙏";
    }
    const data = await res.json();
    return data.result;
  } catch (err: any) {
    const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
    return isAr
      ? "⚠️ حصلت مشكلة في الاتصال. جرّب تاني 🙏"
      : "⚠️ Connection issue — please try again 🙏";
  }
}

async function* generateAdaptiveResponseStreamClient(
  message: string,
  profile: UserProfile,
  history: Message[],
  attachments: { name: string, type: string, data: string }[] = [],
  apiKey: string
) {
  const model = "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

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
  contents.push(...cleanHistory);

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

  const res = await fetchGeminiWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        temperature: 0.7,
        topP: 0.95
      }
    })
  });

  if (!res.ok) {
    // Gemini failed (overloaded/rate-limited) → automatically fall back to Groq.
    const groqKey = groqPrimaryKey();
    if (groqKey) {
      yield* generateGroqStream(message, profile, history, groqKey);
      return;
    }
    const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
    if (res.status === 503) {
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
          ? `عذراً، فشل الاتصال بخوادم الذكاء الاصطناعي (رمز ${res.status}). تأكد من صحة مفتاح الـ API.`
          : `AI gateway communication error (Status: ${res.status}). Please verify your custom API key.`,
        isArabic ? "فشل بوابة الذكاء" : "Gateway Error"
      );
      yield { 
        text: isArabic 
          ? `⚠️ عذراً، فشل الاتصال بخوادم الذكاء الاصطناعي (رمز ${res.status}).` 
          : `⚠️ AI gateway communication error (Status: ${res.status}).`, 
        done: true, 
        error: true 
      };
    }
    return;
  }

  if (!res.body) {
    yield { text: "Error communicating directly with Google AI.", done: true, error: true };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = '';
  let fullText = '';

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

  yield { text: fullText, done: true };
}

export async function* generateAdaptiveResponseStream(
  message: string,
  profile: UserProfile,
  history: Message[],
  attachments: { name: string, type: string, data: string }[] = []
) {
  try {
    const res = await fetch('/api/gemini/generateAdaptiveResponseStream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, profile, history, attachments })
    });

    const isHtml = res.headers.get('Content-Type')?.includes('text/html') || false;

    if (!res.ok || isHtml) {
      const apiKey = geminiPrimaryKey();
      if (apiKey) {
        yield* generateAdaptiveResponseStreamClient(message, profile, history, attachments, apiKey);
        return;
      }
      // No Gemini key configured → use Groq directly if available.
      const groqKey = groqPrimaryKey();
      if (groqKey) {
        yield* generateGroqStream(message, profile, history, groqKey);
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
      yield { text: "Error communicating with intelligence core.", done: true, error: true };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';

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
  } catch (err: any) {
    const isArabic = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
    toast.error(
      isArabic
        ? `تعذر إرسال الرسالة لعدم ثبات الشبكة: ${err.message || 'خطأ اتصال مجهول'}.`
        : `Primary socket signal failed to reach the server: ${err.message || 'Connection lost'}.`,
      isArabic ? "انقطاع الاتصال" : "Signal Loss"
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
  try {
    const res = await fetch('/api/gemini/generateAdaptiveResponse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, profile, history, attachments })
    });
    const isHtml = res.headers.get('Content-Type')?.includes('text/html');
    if (!res.ok || isHtml) {
      const apiKey = geminiPrimaryKey();
      if (apiKey) {
        let text = "";
        const clientStream = generateAdaptiveResponseStreamClient(message, profile, history, attachments, apiKey);
        for await (const chunk of clientStream) {
          if (chunk.text) text = chunk.text;
        }
        return text;
      }
      return "Express Backend is not operational on this static host deployment. Go to full Cloud Run app environment.";
    }
    const data = await res.json();
    return data.result;
  } catch (err: any) {
    return `Communication error: ${err.message}`;
  }
}
