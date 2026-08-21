import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;
function getAi() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "AIzaSy_placeholder_key_replace_in_env";
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export const geminiService = {
  /**
   * Translates a sign language image to text.
   */
  async translateSign(imageData: string, language: string = "English", level: string = "Basic") {
    const prompt = `You are an advanced Sign Language recognition AI expert, modeled after the Kaggle Sign Language MNIST dataset for alphabet recognition, alongside diverse global sign language datasets (like ArSL and ASL).
    
    Analyze this image frame completely, paying CRITICAL attention to:
    1. Hand shape, orientation, and fingerspelling configurations (especially A-Z letters based on Sign Language MNIST).
    2. Facial expressions (eyebrows, mouth, eyes) which add crucial context and grammar.
    3. Precise orientation and spatial location of the hands.
    
    CONTEXT FOR THIS USER:
    - Target Language Context: ${language}
    - Signer Skill Level: ${level} (If 'Basic', recognize foundational, beginner-level vocabulary. If 'Advanced', look for nuances).

    INSTRUCTIONS:
    1. If the user is fingerspelling (signing a static alphabet letter A-Y), return EXACTLY that single uppercase letter (e.g., "A").
    2. If the user is signing a full word or gesture, return the best translated word in ${language}.
    3. If no hand is clearly visible or no deliberate sign is occurring, respond EXACTLY with [NO_SIGN].
    
    Return ONLY the letter, translated word, or [NO_SIGN]. Do NOT include any markdown formatting, conversational text, or punctuation.`;

    const response = await getAi().models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { text: prompt },
          { 
            inlineData: { 
              data: imageData, 
              mimeType: "image/jpeg" 
            } 
          }
        ]
      }
    });

    return response.text?.trim() || "[NO_SIGN]";
  },

  /**
   * Enhances and simplifies live captions for deaf accessibility.
   */
  async enhanceCaptions(text: string, language: string = "English") {
    const prompt = `You are an accessibility expert for deaf users. 
    Task: Clean, correct, and simplify the following live transcription.
    Content: "${text}"
    Language: ${language}
    
    Rules:
    1. Simplify complex sentences while keeping the original meaning.
    2. Correct grammar and spelling errors from the speech-to-text engine.
    3. If the language is Arabic, convert informal slang to clear, simple Modern Standard Arabic if necessary for clarity.
    4. Keep the output professional and easy to read.
    5. Return ONLY the enhanced text. No explanations.`;

    try {
      const response = await getAi().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ text: prompt }]
      });
      return response.text?.trim() || text;
    } catch (e) {
      console.error("Gemini Enhancement Error:", e);
      return text;
    }
  },

  /**
   * Transcribes audio into text and signs.
   */
  async transcribeAudio(audioData: string, language: string = "English", mimeType: string = "audio/webm") {
    const prompt = `You are an expert transcription assistant. 
    Action: Listen to the audio and transcribe speech into ${language}.
    Context: User is likely deaf or hard of hearing. Clear captions are vital.
    Dialect: If Arabic, prioritize Egyptian dialect.
    Failure Policy: If there is absolute silence or zero recognizable speech, return "[NO_SPEECH]".
    Signs Policy: After transcription, add a new line starting with "SIGNS: " then 3-5 emojis.
    Important: Do not be overly strict. If you hear someone talking even with noise, transcribe it.

    Output Template:
    [Transcription Text]
    SIGNS: [Emojis]`;

    try {
      const response = await getAi().models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            { text: prompt },
            { 
              inlineData: { 
                data: audioData, 
                mimeType: mimeType 
              } 
            }
          ]
        }
      });

      const responseText = response.text?.trim() || "";
      
      if (responseText.includes("[NO_SPEECH]") && responseText.length < 20) {
        return { text: "", signs: "" };
      }

      let text = responseText;
      let signs = "";

      if (responseText.includes("SIGNS:")) {
        const parts = responseText.split("SIGNS:");
        text = parts[0].trim();
        signs = parts[1].trim();
      } else {
        text = responseText;
      }

      return { text, signs };
    } catch (error) {
      console.error("Gemini Transcription Error:", error);
      throw error;
    }
  },

  /**
   * PRO FEATURE: Generates technical sign language animation instructions (keyframes).
   * This can be used to drive a 3D avatar or complex visual system.
   */
  async generateSignSequence(text: string, language: string = "English") {
    const prompt = `You are a Sign Language Animation Expert for the ${language} sign language.
    Task: Convert the following sentence into a sequence of technical animation instructions for a Virtual Signer.
    
    Sentence: "${text}"
    
    For each word/concept, provide:
    1. Gesture name
    2. Hand shape (e.g., Open Palm, Closed Fist, Index Point)
    3. Motion description (e.g., Circular clockwise on chest, Straight outward from chin)
    4. Facial expression intensity (0.0 to 1.0)
    
    Return the result as a clean JSON array of objects.`;

    try {
      const response = await getAi().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ text: prompt }]
      });
      return JSON.parse(response.text?.trim() || "[]");
    } catch (e) {
      console.error("Pro Sequence Generation Error:", e);
      return [];
    }
  },

  /**
   * Refines, translates, and structures any phrase (Arabic or English) into an optimized
   * sequence of simple concept words perfect for the 3D Sign Language Avatar.
   * Simplifies complex grammar, removes auxiliary words, and aligns slang/idioms to standard concepts.
   */
  async optimizeSignScript(text: string, language: string = "English") {
    const prompt = `You are an expert Sign Language Translator. 
    Your task is to take a spoken/written sentence in ${language} and optimize it into a sequence of simple concept words (Sign Language Gloss or tokens) to be signed by a 3D avatar.
    
    Input sentence: "${text}"
    
    Known major gesture keywords:
    - hello, hi, hey, مرحبا, اهلا, سلام, ازيك, HELLO
    - thanks, thank, شكرا, شكرًا, متشكر, THANK
    - yes, ok, okay, نعم, ايوه, تمام, YES
    - no, not, لا, كلا, NO
    - me, i, انا, أنا, ME
    - you, انت, أنت, انتي, YOU
    - love, حب, بحبك, LOVE
    - help, please, مساعدة, ساعدني, HELP
    
    Optimization directives:
    1. Translate the sentence into a simplified conceptual sequence of sign gloss words space-separated.
    2. Keep nouns (e.g. names like "Dimitri" or "Google") as is, as they will be fingerspelled.
    3. Eliminate auxiliary words, articles, prepositions ("in", "to", "at", "في", "على", "من"), and passive conjugation sounds.
    4. Choose words matching the known gesture keywords above whenever possible. E.g. simplify "إضافة إلى شكري لك" to "شكرا", or "هل يمكنك مساعدتي" to "ساعدني".
    5. Reduce verbs to their core imperative or active infinitive state (e.g. "أنا ذاهب" to "أنا ذاهب").
    
    Return ONLY a single line of space-separated optimized words. No quotes, no explanations, no punctuation.`;

    try {
      const response = await getAi().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ text: prompt }]
      });
      return response.text?.trim() || text;
    } catch (e) {
      console.error("Optimize Sign Script Error:", e);
      return text;
    }
  },

  /**
   * Answers a direct question from the user concisely.
   */
  async askGeneralQuestion(text: string, language: string = "English") {
    const prompt = `You are a helpful conversational AI assistant.
    The user is using a Sign Language transcription and translation applet. 
    They have input or asked the following question:
    "${text}"
    
    Please provide a very clear, highly informative, yet concise and simple response in ${language}.
    Keep it to 1-3 short sentences. Avoid complex formatting, bullet points, or markdown blocks, so that the answer is highly readable and extremely easy to translate into sign language tokens afterwards.`;

    try {
      const response = await getAi().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ text: prompt }]
      });
      return response.text?.trim() || "";
    } catch (e) {
      console.error("Ask General Question Error:", e);
      return "Error generating response from Gemini.";
    }
  },

  /**
   * Generates predictive quick-reply suggestions based on a transcript.
   */
  async generateQuickReplies(text: string, language: string = "English") {
    const prompt = `You are a real-time speech assistant for speech-impaired individuals. 
    Review the following ongoing conversation transcript:
    "${text}"
    
    Task: Suggest exactly 3 or 4 extremely brief, natural, conversational click-to-speak response options in ${language} that this speech-impaired person could tap to say immediately.
    
    Make the replies:
    1. Short (usually 2-5 words e.g., "Yes, that works", "No, thank you", "One minute please").
    2. Highly context-appropriate to what they heard above.
    3. Diverse (at least one agreement/general, one question or clarification, one gentle boundary/next step).
    4. Culturally natural in ${language}.
    
    Return the result as a raw JSON array of strings, for example: ["Yes, please", "Can you explain?", "Let me think about it"]. No markdown block syntax, no comments.`;

    try {
      const response = await getAi().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ text: prompt }],
        config: {
          responseMimeType: "application/json"
        }
      });
      const parsed = JSON.parse(response.text?.trim() || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Gemini QuickReplies Generation Error:", e);
      return [];
    }
  },

  /**
   * Reconstructs/decodes distorted or slurred speech from speech-impaired individuals.
   * Auto-detects the source language (including full support for Arabic, Egyptian Ammiya, English, etc.)
   * and smartly corrects spelling, stutters, slurs, and grammatical gaps.
   */
  async decodeDysarthria(text: string, profile: string = "Multilingual", language: string = "Auto-Detect", customMappings: Array<{ phrase: string; translation: string }> = []) {
    let mappingsText = "";
    if (customMappings && customMappings.length > 0) {
      mappingsText = `Here is a set of customized/personalized voice mapping examples configured by the user:
${customMappings.map(m => `- When they say/sound like "${m.phrase}", they actually mean: "${m.translation}"`).join("\n")}

Prioritize matching the input "${text}" against these patterns with high phonetic and semantic tolerance.`;
    }

    const prompt = `You are a state-of-the-art Multilingual Speech Therapy and communication assistant.
    Your mission is to contextually decode, reconstruct, and smooth out speech that is distorted, stuttered, slurred, or has word gaps.
    
    The user can speak in ANY language (such as Arabic, Egyptian Ammiya, English, French, Spanish, etc.).
    
    Input text transcribed from speech:
    "${text}"
    
    ${mappingsText}
    
    Please analyze this input:
    1. Auto-detect the spoken language (e.g., Arabic, English, or others) and keep the output in the same detected language.
    2. Correct any stuttering repetitions, slurred pronunciation approximations, typings, grammar, or missing words.
    3. If the input language is Egyptian Ammiya or general Arabic, render the output as highly clear, simple, and standard-aligned Arabic so it's clean for sign language translation.
    4. Guard against extreme garbling or phonetic mutations. Keep the original intent fully intact.
    
    Return ONLY the final reconstructed, cleaned statement. Do NOT include explanations, comments, quotes, or formatting backticks. Just the raw decoded text.`;

    try {
      const response = await getAi().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ text: prompt }]
      });
      return response.text?.trim() || text;
    } catch (e) {
      console.error("Gemini Dysarthria Decoding Error:", e);
      return text;
    }
  },

  /**
   * Deep Learning Acoustic Model for raw atypical audio matching (Project Euphonia Core)
   * Auto-detects language and corrects atypical pronunciation.
   */
  async decodeEuphoniaAudio(audioData: string, profile: string = "Multilingual", language: string = "Auto-Detect", customMappings: Array<{ phrase: string; translation: string }> = [], mimeType: string = "audio/webm") {
    let mappingsText = "";
    if (customMappings && customMappings.length > 0) {
      mappingsText = `Here is a set of customized voice-mapping associations configured by the user:
${customMappings.map(m => `- Sound approximation: "${m.phrase}" ➜ Intended phrase: "${m.translation}"`).join("\n")}

Prioritize looking for matching acoustic patterns corresponding to these mapped profiles.`;
    }

    const prompt = `You are a state-of-the-art Project Euphonia Direct Multimodal Auditory Speech Recognition system.
    Your mission is to decode a raw voice audio track recorded by an individual with a severe speech impairment or atypical pronunciation.
    
    Target or source language: The user can speak in ANY global language (e.g. Arabic, English, French, Spanish). Please auto-detect the spoken language and return the output in the same language.
    
    ${mappingsText}
    
    Directives:
    1. Listen to the raw audio phonetics, rhythm, and tone.
    2. If the user's vocal sound approximates any custom mapping or standard word, translate and resolve it immediately.
    3. Reconstruct any slurred vocalizations, missing particles, or voice distortion into fluent, grammatically perfect sentences in the detected language.
    4. For Arabic speech, output standard clear Arabic text.
    5. Return ONLY the final translated sentence. Do NOT write notes, markdown backticks, prefix headers, or explanations.`;

    try {
      const response = await getAi().models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            { text: prompt },
            { 
              inlineData: { 
                data: audioData, 
                mimeType: mimeType 
              } 
            }
          ]
        }
      });

      return response.text?.trim() || "";
    } catch (error) {
      console.error("Gemini Direct Euphonia Audio recognition failed:", error);
      throw error;
    }
  },

  /**
   * Accessibility speech corrector: cleans a raw transcript using the user's
   * personalized pronunciation mappings AND recent conversation context, and
   * returns a structured result with a confidence score and alternative
   * interpretations for uncertain words.
   */
  async correctTranscript(
    text: string,
    language: string = "Auto-Detect",
    profile: string = "Standard",
    customMappings: Array<{ phrase: string; translation: string }> = [],
    context: string[] = [],
  ): Promise<{ corrected: string; confidence: number; alternatives: string[] }> {
    const mappingsText = customMappings.length
      ? `Personalized pronunciation mappings (heard → intended):\n${customMappings
          .map((m) => `- "${m.phrase}" → "${m.translation}"`)
          .join("\n")}\n`
      : "";
    const contextText = context.length
      ? `Recent conversation context (most recent last), use it to resolve unclear words:\n${context
          .map((c) => `- ${c}`)
          .join("\n")}\n`
      : "";
    const profileText =
      profile && profile !== "Standard"
        ? `The speaker has a speech profile: "${profile}". Expect slurring, stutters or atypical pronunciation and reconstruct accordingly.`
        : "";

    const prompt = `You are an accessibility-focused speech-recognition corrector adapting to ONE specific user.
Raw transcript from the speech engine: "${text}"
Language: ${language}. ${profileText}
${mappingsText}${contextText}
Rules:
- Apply the personalized mappings and fix spelling/grammar/slur/stutter errors.
- Use the conversation context to resolve unclear words.
- Preserve the user's intended meaning. Do NOT add content or rewrite unnecessarily.
- Keep the SAME language as the input.
Return ONLY JSON of the form:
{"corrected": string, "confidence": number (0-100, how sure you are), "alternatives": string[] (0-3 alternative full-sentence interpretations for uncertain cases; empty if confident)}`;

    try {
      const response = await getAi().models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ text: prompt }],
        config: { responseMimeType: "application/json" },
      });
      const parsed = JSON.parse(response.text?.trim() || "{}");
      const corrected =
        typeof parsed.corrected === "string" && parsed.corrected.trim()
          ? parsed.corrected.trim()
          : text;
      const confidence =
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
          : 70;
      const alternatives = Array.isArray(parsed.alternatives)
        ? parsed.alternatives
            .filter((a: any) => typeof a === "string" && a.trim())
            .slice(0, 3)
        : [];
      return { corrected, confidence, alternatives };
    } catch (e) {
      console.error("Gemini correctTranscript Error:", e);
      return { corrected: text, confidence: 50, alternatives: [] };
    }
  },
};
