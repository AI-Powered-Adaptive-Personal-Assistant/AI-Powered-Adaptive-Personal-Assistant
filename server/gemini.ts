import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, Message } from "../src/types";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(`API Key Missing. Please ensure GEMINI_API_KEY is set in your environment variables.`);
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

const getSystemInstruction = (profile: UserProfile, otherThreadsSummary: string = 'None') => `
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

## TOOLS
Call generateImage only when the user asks for an image.
`;

export async function evaluateQuizPOV(question: string, pov: string): Promise<boolean> {
  try {
    const ai = getAI();
    const prompt = `A user answered a logic trick question: 
Question: "${question}"
Their custom reasoning: "${pov}" 

Is their reasoning somewhat logical, creative, or functionally identifying the trick/anomaly? 
Reply with EXACTLY ONE WORD: either "YES" or "NO".`;
    const response = await ai.models.generateContent({
       model: "gemini-3.5-flash",
       contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return response.text?.trim().toUpperCase().includes("YES") ?? true;
  } catch (error) {
    console.error('POV Eval Error', error);
    return true; // Fallback to accepting it if AI fails
  }
}

interface QuizItem {
  id: number;
  text: string;
  options: string[];
}

/** Extract the first JSON array from a model response (tolerates ``` fences). */
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

/**
 * Translate quiz questions (text + options) into the target language while
 * keeping the SAME number and ORDER of options so the caller can still score
 * by position. Returns [{id, text, options}].
 */
export async function translateQuiz(
  questions: QuizItem[],
  language: string,
): Promise<QuizItem[]> {
  if (!language || language === "English" || !Array.isArray(questions)) {
    return questions || [];
  }
  try {
    const ai = getAI();
    const dialect =
      language === "Egyptian Ammiya" ? " (Egyptian colloquial Arabic)" : "";
    const prompt = `Translate these IQ/logic quiz questions into ${language}${dialect}.
Rules:
- Keep the EXACT same number of options, in the SAME order.
- Preserve numbers, sequences and proper nouns; translate naturally otherwise.
- Keep each question solvable (do not reveal the answer).
- Return ONLY a JSON array of {"id": number, "text": string, "options": string[]}. No markdown.

Input: ${JSON.stringify(
      questions.map((q) => ({ id: q.id, text: q.text, options: q.options })),
    )}`;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const parsed = extractJsonArray(response.text?.trim() || "");
    return parsed.length ? (parsed as QuizItem[]) : questions;
  } catch (error) {
    console.error("Quiz translation error", error);
    return questions; // graceful fallback to original (English)
  }
}

export interface AssessmentQuestion {
  id: number;
  type: "mcq" | "open";
  text: string;
  options: string[];
  correctAnswer: string;
}

/**
 * Generate a field-specific knowledge assessment to measure a learner's level
 * in their chosen domain. Returns a mix of multiple-choice and one short
 * open-ended question, written directly in the requested language.
 */
export async function generateAssessment(
  field: string,
  language: string = "English",
  level: string = "Basic",
  count: number = 8,
): Promise<AssessmentQuestion[]> {
  const domain = (field || "").trim() || "General Knowledge";
  try {
    const ai = getAI();
    const dialect =
      language === "Egyptian Ammiya" ? " (Egyptian colloquial Arabic)" : "";
    const mcqCount = Math.max(1, count - 1);
    const prompt = `Generate a ${level}-level knowledge assessment for the field "${domain}" to measure a learner's actual level in that field.
Write EVERYTHING (questions and options) in ${language}${dialect}.
Produce exactly ${count} questions: ${mcqCount} multiple-choice and 1 short open-ended question.
- Multiple-choice: exactly 4 distinct options with EXACTLY ONE correct answer.
- Keep them ${level}-appropriate (foundational/easy for "Basic"), accurate, and unambiguous.
- The open-ended question should require a 1-2 sentence answer.
Return ONLY a JSON array; each item:
{"id": number, "type": "mcq" | "open", "text": string, "options": string[] (4 for mcq, [] for open), "correctAnswer": string (the exact correct option for mcq, or a concise model answer for open)}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ text: prompt }],
      config: { responseMimeType: "application/json" },
    });
    const parsed = JSON.parse(response.text?.trim() || "[]");
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
  } catch (e) {
    console.error("generateAssessment error:", e);
    return [];
  }
}

export async function generateBenchmarkComparison(
  originalMessage: string,
  userMessage: string,
  profile: UserProfile
): Promise<string> {
  const ai = getAI();
  const prompt = `You are a comparative AI benchmarking tool.
The user asked: "${userMessage}"
An AI Assistant (Cognify) replied: "${originalMessage}"

Your task is to act as ChatGPT (GPT-4) and provide YOUR improved response to this same prompt, taking into account the user's profile:
User Level: ${profile.level}
User Field: ${profile.field}

Provide your response in this EXACT format:
## ChatGPT Response
[Your simulated ChatGPT response here - be structured, clear, and very high quality]

## Critique
[A brief critique of what Cognify did well, and what your response did better or differently.]
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return response.text || "Failed to generate comparison. Please try again.";
  } catch (error) {
    console.error("Benchmark error:", error);
    return "An error occurred while generating the comparison. Please wait and try again.";
  }
}

export async function generateProactiveInsights(
  profile: UserProfile,
  recentMessages: Message[]
): Promise<string> {
  const ai = getAI();
  const context = recentMessages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
  const prompt = `You are a proactive AI mentor. The user is a ${profile.level} in the field of ${profile.field}.
Based on their recent conversation:
${context || 'No recent conversation.'}

Proactively generate 3 highly relevant study materials, actionable insights, or next steps tailored specifically to their profile and current focus. Format as a concise, engaging markdown list.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return response.text || "No insights available at the moment.";
  } catch (error) {
    console.error("Insights error:", error);
    return "Failed to generate insights. Please try again.";
  }
}

export async function generateLogicResponse(
  message: string,
  profile: UserProfile,
  moduleName: string,
  history: { role: 'user' | 'model', parts: { text: string }[] }[] = []
) {
  try {
    const ai = getAI();
    const model = "gemini-3.5-flash";
    
    const systemInstruction = `
You are the Cognify Advanced Logic Tutor, a production-grade AI designed to train logic and analytical skills focusing on "${moduleName}".

Their current IQ baseline: ${profile.iqScore || 'Unknown'}

Preferred Interaction Language: ${profile.language || 'English'} (MANDATORY: You MUST reply in this language/dialect).

========================
STRICT LANGUAGE RULES
========================
1. LANGUAGE MATCHING: If the Preferred Interaction Language is "Arabic", use Modern Standard Arabic. If "Egyptian Ammiya", use Egyptian Arabic. 
2. BIPOLAR MIRRORING: Despite rule 1, if the user switches languages mid-conversation, you MUST match their current language/dialect immediately.
3. ADAPTIVE LOGIC: For technical terms in {field}, you may provide the English term in parentheses after its Arabic translation if it enhances clarity.
2. EGYPTIAN AMMIYAH: Use warm local phrasing if detected.

========================
PRODUCTION PRIORITIES (SMART & FLEXIBLE)
========================
1. UNDERSTANDING & INTENT:
- Understand user intent clearly even if input is messy, repeated, or poorly formatted. Focus on meaning, not exact wording.
- Never say you cannot understand messy input. Always try to interpret the user correctly.

2. RAG & CONTEXT USAGE:
- Use provided context (metadata, history, or knowledge) as helpful reference only.
- DO NOT copy from the context. Always rephrase and explain in your own words.
- Combine information intelligently if multiple sources exist.

3. DYNAMIC RESPONSE STYLE:
- Adapt explanation length: Simple question -> short answer. Complex question -> clear, structured explanation.
- Be flexible and natural. Avoid robotic, repetitive, or formulaic phrasing.

4. READABILITY & FORMATTING:
- Always use a clean, structured format. Use short sentences.
- Prefer bullet points for multiple ideas to stay visually easy to read.
- Remove redundancy and unnecessary filler info.

5. MEMORY & BEHAVIOR:
- Do NOT repeat previous answers from history.
- If a question is repeated, re-explain using a different angle or a simpler approach.
- Be helpful, calm, and clear.

6. LOGIC TUTORING (SOCRATIC):
- Guide them step-by-step with hints. Do not just give answers.
- TEACH *HOW* TO THINK: Use mental models and analogies tailored to their level.

Make the experience feel like sitting with a brilliant, patient mentor who is stretching their brain's capacity.
`;

    const chatHistory = history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: h.parts
    }));

    const response = await ai.models.generateContent({
      model,
      contents: [
        ...chatHistory,
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.4,
        thinkingConfig: { thinkingBudget: -1 }
      }
    });

    return response.text || "Logic module encountered an error (empty response).";
  } catch (error) {
    console.error("Error generating logic response:", error);
    return "The logic training uplink experienced an error. Please try again.";
  }
}

export async function* generateAdaptiveResponseStream(
  message: string,
  profile: UserProfile,
  history: Message[],
  attachments: { name: string, type: string, data: string }[] = []
) {
  try {
    const ai = getAI();
    const model = "gemini-3.5-flash";

    const otherThreadsSummary = profile.chatThreads
      ?.filter(t => t.id !== profile.activeThreadId)
      .map(t => `Thread "${t.title}": ${t.lastMessageSnippet || 'No summary'}`)
      .join('\n') || 'None';

    const systemInstruction = getSystemInstruction(profile, otherThreadsSummary);

    const parts: any[] = [{ text: message }];
    attachments.forEach(file => {
      parts.push({
        inlineData: {
          mimeType: file.type,
          data: file.data
        }
      });
    });

    const historyForModel = history
      .filter(m => m.id !== 'welcome')
      .filter(m => m.content?.trim())
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model' as 'user' | 'model',
        parts: [{ text: m.content }]
      }));

    const cleanHistory = historyForModel[0]?.role === 'model' ? historyForModel.slice(1) : historyForModel;

    const stream = await ai.models.generateContentStream({
      model,
      contents: [
        ...cleanHistory,
        { role: 'user', parts }
      ],
      config: {
        systemInstruction,
        temperature: 0.7,
        topP: 0.95,
        thinkingConfig: { thinkingBudget: 1024 },
        tools: [{
          functionDeclarations: [{
            name: "generateImage",
            description: "Generate a custom high-quality image based on the user's prompt.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                prompt: {
                  type: Type.STRING,
                  description: "Detailed description of the image to generate."
                }
              },
              required: ["prompt"]
            }
          }]
        }]
      }
    });

    let fullText = "";
    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        yield { text: fullText, done: false };
      }
      
      const call = chunk.functionCalls?.[0];
      if (call && call.name === 'generateImage') {
         const args = call.args as any;
         const prompt = args.prompt;
         yield { text: `جاري توليد الصورة: "${prompt}"...`, done: false, isGeneratingImage: true };
         
         const imageResponse = await ai.models.generateContent({
           model: 'gemini-2.5-flash-image',
           contents: { parts: [{ text: prompt }] },
           config: {
             imageConfig: { aspectRatio: "1:1" }
           }
         });

         const generatedAttachments = [];
         for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
           if (part.inlineData) {
             generatedAttachments.push({
               name: `Generated_Image_${Date.now()}.png`,
               type: part.inlineData.mimeType || 'image/png',
               data: part.inlineData.data
             });
           }
         }
         yield { text: `I have generated an image based on: "${prompt}".`, done: true, attachments: generatedAttachments };
         return;
      }
    }
    
    yield { text: fullText, done: true };

  } catch (error: any) {
    console.error("Streaming error:", error);
    const errorMsg = error?.message || "";
    let friendlyText = "I encountered an error while processing your request.";
    if (errorMsg.includes("429")) {
      friendlyText = "يا مهندس، جوجل بتقول إننا استهلكنا عدد الرسايل المجانية المسموح بيها في الدقيقة. استنى بس 30 ثانية وجرب تاني وهتشتغل معاك زي الفل! ⏳";
    }
    yield { text: friendlyText, done: true, error: true };
  }
}

export async function generateAdaptiveResponse(
  message: string,
  profile: UserProfile,
  history: Message[],
  attachments: { name: string, type: string, data: string }[] = []
) {
  try {
    const ai = getAI();
    const model = "gemini-3.5-flash";

    const otherThreadsSummary = profile.chatThreads
      ?.filter(t => t.id !== profile.activeThreadId)
      .map(t => `Thread "${t.title}": ${t.lastMessageSnippet || 'No summary'}`)
      .join('\n') || 'None';

    const systemInstruction = getSystemInstruction(profile, otherThreadsSummary);

    const parts: any[] = [{ text: message }];
    attachments.forEach(file => {
      parts.push({
        inlineData: {
          mimeType: file.type,
          data: file.data
        }
      });
    });

    const historyForModel = history
      .filter(m => m.id !== 'welcome')
      .filter(m => m.content?.trim())
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model' as 'user' | 'model',
        parts: [{ text: m.content }]
      }));

    const cleanHistory = historyForModel[0]?.role === 'model' ? historyForModel.slice(1) : historyForModel;

    const response = await ai.models.generateContent({
      model,
      contents: [
        ...cleanHistory,
        { role: 'user', parts }
      ],
      config: {
        systemInstruction,
        temperature: 0.7,
        topP: 0.95,
        thinkingConfig: { thinkingBudget: 1024 },
        tools: [{
          functionDeclarations: [{
            name: "generateImage",
            description: "Generate a custom high-quality image based on the user's prompt.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                prompt: {
                  type: Type.STRING,
                  description: "Detailed description of the image to generate."
                }
              },
              required: ["prompt"]
            }
          }]
        }]
      }
    });

    let generatedAttachments: { name: string, type: string, data: string }[] = [];
    let finalText = response.text || "";

    const call = response.functionCalls?.[0];
    if (call && call.name === 'generateImage') {
      const args = call.args as any;
      const prompt = args.prompt;
      
      try {
        const imageResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: prompt }] },
          config: {
            imageConfig: {
              aspectRatio: "1:1",
            }
          }
        });
        
        for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            generatedAttachments.push({
              name: `Generated_Image_${Date.now()}.png`,
              type: part.inlineData.mimeType || 'image/png',
              data: part.inlineData.data
            });
          }
        }
        finalText = `I have generated an image based on: "${prompt}".`;
      } catch (e) {
        console.error("Image generation failed", e);
        finalText = "I apologzie, image generation is currently experiencing heavy load. Please try again in 1 minute.";
      }
    }

    return {
      text: finalText,
      attachments: generatedAttachments
    };

  } catch (error: any) {
    console.error("Error generating adaptive response:", error);
    
    const errorMsg = error?.message || "";
    let friendlyText = "I encountered an error while processing your request.";

    if (errorMsg.includes("429")) {
      friendlyText = "يا مهندس، جوجل بتقول إننا استهلكنا عدد الرسايل المجانية المسموح بيها في الدقيقة. استنى بس 30 ثانية وجرب تاني وهتشتغل معاك زي الفل! ⏳";
    } else if (errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE")) {
      friendlyText = "سيرفرات جوجل عليها ضغط كبير دلوقتي فمش قادرة ترد. جرب تبعت الرسالة كمان لحظة وهكون معاك. 🚀";
    } else if (errorMsg.includes("403") || errorMsg.includes("API Key")) {
      friendlyText = "فيه مشكلة في مفتاح الـ API بتاعك، اتأكد إنه محطوط صح في إعدادات Vercel. 🔑";
    } else if (errorMsg.includes("404")) {
      friendlyText = "الموديل ده مش متاح حالياً أو فيه تحديث من جوجل. بحاول أربط مرة تانية.. جرب كمان لحظة. 🛠️";
    } else {
      friendlyText = `حدث خطأ تقني: ${errorMsg.slice(0, 100)}. برجاء المحاولة مرة أخرى.`;
    }

    return {
      text: friendlyText,
      attachments: []
    };
  }
}
