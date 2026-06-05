import { UserProfile, Message } from "../types";

export async function evaluateQuizPOV(question: string, pov: string): Promise<boolean> {
  const res = await fetch('/api/gemini/evaluateQuizPOV', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, pov })
  });
  const data = await res.json();
  return data.result;
}

export async function generateBenchmarkComparison(
  originalMessage: string,
  userMessage: string,
  profile: UserProfile
): Promise<string> {
  const res = await fetch('/api/gemini/generateBenchmarkComparison', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalMessage, userMessage, profile })
  });
  const data = await res.json();
  return data.result;
}

export async function generateProactiveInsights(
  profile: UserProfile,
  recentMessages: Message[]
): Promise<string> {
  const res = await fetch('/api/gemini/generateProactiveInsights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, recentMessages })
  });
  const data = await res.json();
  return data.result;
}

export async function generateLogicResponse(
  message: string,
  profile: UserProfile,
  moduleName: string,
  history: { role: 'user' | 'model', parts: { text: string }[] }[] = []
): Promise<string> {
  const res = await fetch('/api/gemini/generateLogicResponse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, profile, moduleName, history })
  });
  const data = await res.json();
  return data.result;
}

export async function* generateAdaptiveResponseStream(
  message: string,
  profile: UserProfile,
  history: Message[],
  attachments: { name: string, type: string, data: string }[] = []
) {
  const res = await fetch('/api/gemini/generateAdaptiveResponseStream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, profile, history, attachments })
  });

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
    buffer = lines.pop() || ''; // keep the last partial chunk in the buffer

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
}

export async function generateAdaptiveResponse(
  message: string,
  profile: UserProfile,
  history: Message[],
  attachments: { name: string, type: string, data: string }[] = []
) {
  const res = await fetch('/api/gemini/generateAdaptiveResponse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, profile, history, attachments })
  });
  const data = await res.json();
  return data.result;
}
