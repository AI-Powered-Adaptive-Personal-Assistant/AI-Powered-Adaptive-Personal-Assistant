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
  }
};
