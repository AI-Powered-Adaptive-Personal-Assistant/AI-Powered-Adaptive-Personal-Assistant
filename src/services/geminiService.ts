export const geminiService = {
  async translateSign(imageData: string, language: string = "English", level: string = "Basic") {
    const res = await fetch('/api/gemini/translateSign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, language, level })
    });
    const data = await res.json();
    return data.result;
  },

  async enhanceCaptions(text: string, language: string = "English") {
    const res = await fetch('/api/gemini/enhanceCaptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language })
    });
    const data = await res.json();
    return data.result;
  },

  async transcribeAudio(audioData: string, language: string = "English", mimeType: string = "audio/webm") {
    const res = await fetch('/api/gemini/transcribeAudio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioData, language, mimeType })
    });
    if (!res.ok) {
        throw new Error("Failed to transcribe audio");
    }
    const data = await res.json();
    return data.result;
  },

  async generateSignSequence(text: string, language: string = "English") {
    const res = await fetch('/api/gemini/generateSignSequence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language })
    });
    const data = await res.json();
    return data.result;
  },

  async optimizeSignScript(text: string, language: string = "English") {
    const res = await fetch('/api/gemini/optimizeSignScript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language })
    });
    const data = await res.json();
    return data.result;
  },

  async askGeneralQuestion(text: string, language: string = "English") {
    const res = await fetch('/api/gemini/askGeneralQuestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language })
    });
    const data = await res.json();
    return data.result;
  },

  async generateQuickReplies(text: string, language: string = "English") {
    const res = await fetch('/api/gemini/generateQuickReplies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language })
    });
    const data = await res.json();
    return data.result;
  },

  async decodeDysarthria(text: string, profile: string = "General", language: string = "English", customMappings: Array<{ phrase: string; translation: string }> = []) {
    const res = await fetch('/api/gemini/decodeDysarthria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, profile, language, customMappings })
    });
    const data = await res.json();
    return data.result;
  },

  async decodeEuphoniaAudio(audioData: string, profile: string = "General", language: string = "English", customMappings: Array<{ phrase: string; translation: string }> = [], mimeType: string = "audio/webm") {
    const res = await fetch('/api/gemini/decodeEuphoniaAudio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioData, profile, language, customMappings, mimeType })
    });
    if (!res.ok) {
        throw new Error("Failed to decode Euphonia raw audio");
    }
    const data = await res.json();
    return data.result;
  }
};
