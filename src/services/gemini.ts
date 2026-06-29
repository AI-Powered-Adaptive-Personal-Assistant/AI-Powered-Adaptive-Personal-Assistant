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

// OpenAI-compatible fallback providers (used when Gemini is rate-limited/overloaded):
//  - Groq:  VITE_GROQ_API_KEY  (keys start with "gsk_")  — free, fast
//  - xAI/Grok: VITE_XAI_API_KEY (keys start with "xai-")
// One or several comma-separated keys each.
const GROQ_KEYS: string[] = (((import.meta as any).env?.VITE_GROQ_API_KEY as string) || "")
  .split(/[,\s]+/)
  .map((k: string) => k.trim())
  .filter(Boolean);
const XAI_KEYS: string[] = (((import.meta as any).env?.VITE_XAI_API_KEY as string) || "")
  .split(/[,\s]+/)
  .map((k: string) => k.trim())
  .filter(Boolean);

/** First available fallback key (Groq or xAI). "" if none. */
function groqPrimaryKey(): string {
  return [...GROQ_KEYS, ...XAI_KEYS][0] || "";
}

/** Resolve the OpenAI-compatible endpoint + model for a key, by its prefix. */
function providerFor(key: string): { url: string; model: string } {
  if (key.startsWith("xai-")) {
    return { url: "https://api.x.ai/v1/chat/completions", model: "grok-2-latest" };
  }
  // default: Groq
  return { url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" };
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

  const { url, model } = providerFor(apiKey);
  // Try the primary model, then a known-good backup (Groq occasionally retires
  // models -> 400/404). Log the real reason so failures are debuggable.
  const models = url.includes("groq.com") ? [model, "llama-3.1-8b-instant", "llama-3.1-70b-versatile"] : [model];
  let res: Response | null = null;
  for (const m of models) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: m, messages, temperature: 0.7, stream: true }),
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
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const recent = recentMessages
    .filter((m) => m.content?.trim())
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
  const prompt = `Based on this learner (level: ${profile.level}, field: ${profile.field}, role: ${profile.role}) and their recent conversation, give 2-4 SHORT, specific, encouraging proactive study insights to help them grow. Write in ${profile.language || 'English'}. Each line starts with "* ". No preamble.\n\nRecent conversation:\n${recent || '(none yet)'}`;

  // 1) Backend (if available)
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

  // 2) Direct Gemini (static hosting)
  const apiKey = geminiPrimaryKey();
  if (apiKey) {
    try {
      const response = await fetchGeminiWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
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
    yield { text: "Couldn't connect to the AI. Please try again.", done: true, error: true };
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

// Static deploys (Vercel) have no Express backend, so /api/* returns 405.
// We try the backend once; after the first failure we remember it and skip it —
// no repeated 405s and no wasted round-trip before falling back to direct Gemini.
let backendUp: boolean | null = null;

export async function* generateAdaptiveResponseStream(
  message: string,
  profile: UserProfile,
  history: Message[],
  attachments: { name: string, type: string, data: string }[] = []
) {
  // Once we know there's no backend, go straight to the direct path.
  if (backendUp === false) {
    const apiKey = geminiPrimaryKey();
    if (apiKey) { yield* generateAdaptiveResponseStreamClient(message, profile, history, attachments, apiKey); return; }
    const groqKey = groqPrimaryKey();
    if (groqKey) { yield* generateGroqStream(message, profile, history, groqKey); return; }
    const ar = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
    yield { text: ar ? '⚠️ مفيش مفتاح ذكاء اصطناعي متفعّل.' : '⚠️ No AI key configured.', done: true, error: true };
    return;
  }
  try {
    const res = await fetch('/api/gemini/generateAdaptiveResponseStream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, profile, history, attachments })
    });

    const isHtml = res.headers.get('Content-Type')?.includes('text/html') || false;

    if (!res.ok || isHtml) {
      backendUp = false; // remember: skip the backend next time
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
      yield { text: "Couldn't connect to the AI. Please try again.", done: true, error: true };
      return;
    }

    backendUp = true; // backend is real — keep using it

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
