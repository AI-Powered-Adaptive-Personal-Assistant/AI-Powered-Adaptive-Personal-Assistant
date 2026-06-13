import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini client
// Note: In this environment, process.env.GEMINI_API_KEY is automatically available to the frontend.
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY 
});

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

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ text: prompt }]
      });
      return JSON.parse(response.text?.trim() || "[]");
    } catch (e) {
      console.error("Pro Sequence Generation Error:", e);
      return [];
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
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
   * Reconstructs/decodes distorted or slurred speech from speech-impaired individuals
   */
  async decodeDysarthria(text: string, profile: string = "General", language: string = "English", customMappings: Array<{ phrase: string; translation: string }> = []) {
    let mappingsText = "";
    if (customMappings && customMappings.length > 0) {
      mappingsText = `Here is a set of customized/personalized training voice mapping examples configured by the user for Project Euphonia style matching:
${customMappings.map(m => `- When standard ASR transcribes sounds like "${m.phrase}", they actually mean: "${m.translation}"`).join("\n")}

Prioritize matching the input "${text}" against these custom trained patterns above with high tolerance. If the input heavily approximates, looks like, or phonetically resembles one of their custom sounds, output that mapped translation.`;
    }

    let profileContext = `The user has a speech-impairment profile of: "${profile}".`;
    if (profile === 'Kanevsky') {
      profileContext = `The user is specifically Dr. Dimitri Kanevsky, a world-class deaf speech/ASR scientist. He has a Russian accent layered with profound deaf-accented dysarthric speech properties.
      Common features of his spoken and transcribed words:
      - Vowels are shortened, and final consonants are often unvoiced or omitted.
      - specific phonetic substitutions (e.g. using "f" or "t" instead of "th" leading to soundings like "fanku" or "tanku" for "thank you").
      - Distortions like "goo gu" or "gugu" for "Google", "com pu ta" or "com-pu-ta" for "computer", "p ee ch" or "peech" for "speech", "reg ni shun" or "rec-ni-shun" for "recognition", and "dee-mee-tree" or "di-mi-ti" for his own name "Dimitri".
      - Brief "ha ha" or "ha ha u" for "hello, how are you".
      - "ree shuch" or "ree-shuch" for "research".
      Reconstruct his speech honoring these exact characteristics into highly articulate, professional, intellectual, and scientific English sentences.`;
    }

    const prompt = `You are an expert speech therapy assistant and real-time communication decoder for speech-impaired individuals (e.g., dysarthria, cerebral palsy, stutter, or aphasia) functioning as a personalized Project Euphonia speech translator.
    
    ${profileContext}
    
    Standard automated speech-to-text tools transcribed their voice as:
    "${text}"
    
    ${mappingsText}
    
    This transcription is likely highly distorted, containing slurred phonetic approximations, repeated syllables, stuttering fragments, or incomplete words.
    
    Your task: Contextually decode, reconstruct, and smooth out this garbled text into a natural, complete, clear statement they intended to speak in ${language}.
    
    Guidelines:
    1. Preserve their exact semantic intent without fabricating complex stories. Keep it simple and helpful.
    2. Correct stuttering, spelling/phonetic approximations, slurs, and missing particles.
    3. If the input is already perfectly clear, just keep it, or refine slightly for high quality.
    4. Return ONLY the reconstructed statement. No explanations, no "The user meant", no quotes. Just the simple clean result.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
   */
  async decodeEuphoniaAudio(audioData: string, profile: string = "General", language: string = "English", customMappings: Array<{ phrase: string; translation: string }> = [], mimeType: string = "audio/webm") {
    let mappingsText = "";
    if (customMappings && customMappings.length > 0) {
      mappingsText = `Here is a set of customized voice-mapping associations configured by the user for acoustic matching:
${customMappings.map(m => `- Sound label/approximation: "${m.phrase}" ➜ Intended phrase: "${m.translation}"`).join("\n")}

Prioritize looking for matching acoustic patterns in the audio clip corresponding to these mapped profiles. If the user's vocal sounds approximate one of these targets, translate it directly to the corresponding Intended phrase.`;
    }

    let profileContext = `Speaker Speech Profile Context: "${profile}" (e.g. Dysarthria/slurred speech, Stutter syllable repetition, Aphasia word-gaps).`;
    if (profile === 'Kanevsky') {
      profileContext = `Speaker Speech Profile Context: Dimitri Kanevsky, deaf speech and Google Research scientist (severe Russian-accented deaf dysarthria). His speech sounds are characterized by dropped final consonants, shortened vowels, Russian-slurred rhythm, and unique phonetic patterns (e.g. "fanku/tanku" for "thank you", "goo-gu" for "Google", "com-pu-ta" for "computer", "peech" for "speech", "rec-ni-shun" for "recognition", "dee-mee-tree" for "Dimitri", "ree-shuch" for "research"). Expect strong syllabic mutations and reconstruct them into fluent professional academic English.`;
    }

    const prompt = `You are a state-of-the-art Project Euphonia Direct Multimodal Auditory Speech Recognition system (a deep learning acoustic recognition engine for atypical speech).
    
    Your mission is to decode a raw voice audio track recorded by an individual with a severe speech impairment, which standard speech recognition software fails to understand or register.
    
    ${profileContext}
    Target Language: ${language}
    
    ${mappingsText}
    
    Deep Learning Acoustic Directives:
    1. Listen directly to the raw tone, cadence, and phonetics in this audio stream.
    2. If the auditory sounds approximate one of the user's custom mapped phrases (using phonetic matching or deep visual/lexical similarity), output their calibrated translation!
    3. If no explicit mapping matches, use your advanced deep visual and audio generative comprehension layers to reconstruct the slurred vocalizations into the most accurate, grammatically perfect sentence intended in ${language}.
    4. Keep the output clean, humble, and conversational.
    5. Return ONLY the final translated sentence. Do NOT write notes, markdown backticks, prefix headers, or explanations.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
  }
};
