/**
 * Central Model & Provider Registry for Cognify.
 * 
 * To add ANY new model or API provider in the future:
 * Simply add an entry to the `AVAILABLE_MODELS` array or `PROVIDERS` object below!
 */

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  chatEndpoint: string;
  keyPrefix?: string;
  envVar: string;
  defaultModel: string;
  models: string[];
}

export interface ModelDefinition {
  id: string;
  displayName: string;
  provider: string;
  modelId: string;
  endpoint: string;
  envKey: string;
  keyPrefix?: string;
  description: string;
  contextLength?: string;
  supportsVision?: boolean;
  supportsStreaming?: boolean;
  defaultParams?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    seed?: number;
  };
}

export const PROVIDERS: Record<string, ModelProvider> = {
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    chatEndpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    keyPrefix: 'nvapi-',
    envVar: 'NVIDIA_API_KEY',
    defaultModel: 'z-ai/glm-5.2',
    models: [
      'z-ai/glm-5.2',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
      'deepseek-ai/deepseek-r1',
      'meta/llama-3.3-70b-instruct',
      'mistralai/mistral-large-2-instruct',
      'qwen/qwen2.5-72b-instruct',
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    chatEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyPrefix: 'AIza',
    envVar: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud',
    baseUrl: 'https://api.groq.com/openai/v1',
    chatEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
    keyPrefix: 'gsk_',
    envVar: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  xai: {
    id: 'xai',
    name: 'xAI / Grok',
    baseUrl: 'https://api.x.ai/v1',
    chatEndpoint: 'https://api.x.ai/v1/chat/completions',
    keyPrefix: 'xai-',
    envVar: 'XAI_API_KEY',
    defaultModel: 'grok-2-latest',
    models: ['grok-2-latest'],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    keyPrefix: 'sk-or-',
    envVar: 'OPENROUTER_API_KEY',
    defaultModel: 'auto',
    models: ['auto', 'deepseek/deepseek-r1', 'meta-llama/llama-3.3-70b-instruct'],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatEndpoint: 'https://api.openai.com/v1/chat/completions',
    keyPrefix: 'sk-',
    envVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  },
};

export const AVAILABLE_MODELS: ModelDefinition[] = [
  {
    id: 'glm-5.2',
    displayName: 'GLM-5.2 (NVIDIA NIM)',
    provider: 'nvidia',
    modelId: 'z-ai/glm-5.2',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_API_KEY',
    keyPrefix: 'nvapi-',
    description: '753B parameter flagship agentic & reasoning model with 1M context length.',
    contextLength: '1,000,000 tokens',
    supportsVision: false,
    supportsStreaming: true,
    defaultParams: {
      temperature: 1,
      top_p: 1,
      max_tokens: 16384,
      seed: 42,
    },
  },
  {
    id: 'nemotron-3-omni',
    displayName: 'Nemotron-3 Omni 30B (NVIDIA)',
    provider: 'nvidia',
    modelId: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_API_KEY',
    keyPrefix: 'nvapi-',
    description: 'Omni-modal reasoning model with 65k context and 16k reasoning budget for disability & accessibility.',
    contextLength: '65,536 tokens',
    supportsVision: true,
    supportsStreaming: true,
    defaultParams: {
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 65536,
    },
  },
  {
    id: 'deepseek-r1-nvidia',
    displayName: 'DeepSeek R1 (NVIDIA NIM)',
    provider: 'nvidia',
    modelId: 'deepseek-ai/deepseek-r1',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_API_KEY',
    keyPrefix: 'nvapi-',
    description: 'Ultra-strong open reasoning and mathematical inference model.',
    contextLength: '128,000 tokens',
    supportsVision: false,
    supportsStreaming: true,
    defaultParams: {
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 8192,
    },
  },
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    provider: 'gemini',
    modelId: 'gemini-2.5-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    envKey: 'GEMINI_API_KEY',
    keyPrefix: 'AIza',
    description: 'Fast, multimodal model with native image and document understanding.',
    contextLength: '1,000,000 tokens',
    supportsVision: true,
    supportsStreaming: true,
    defaultParams: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    id: 'llama-3.3-70b-groq',
    displayName: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
    keyPrefix: 'gsk_',
    description: 'Ultra-fast inference via Groq LPU engine.',
    contextLength: '128,000 tokens',
    supportsVision: false,
    supportsStreaming: true,
    defaultParams: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
  {
    id: 'grok-2-xai',
    displayName: 'Grok 2 (xAI)',
    provider: 'xai',
    modelId: 'grok-2-latest',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    envKey: 'XAI_API_KEY',
    keyPrefix: 'xai-',
    description: 'High-capability reasoning model by xAI.',
    contextLength: '128,000 tokens',
    supportsVision: false,
    supportsStreaming: true,
    defaultParams: {
      temperature: 0.7,
      top_p: 0.95,
    },
  },
];

/**
 * Resolves endpoint, model ID, and default parameters for any API key based on its prefix.
 */
export function resolveProviderForKey(key: string): {
  url: string;
  model: string;
  models: string[];
  params?: Record<string, any>;
} {
  const cleanKey = (key || '').trim();
  
  if (cleanKey.startsWith('nvapi-')) {
    return {
      url: PROVIDERS.nvidia.chatEndpoint,
      model: 'z-ai/glm-5.2',
      models: PROVIDERS.nvidia.models,
      params: {
        temperature: 1,
        top_p: 1,
        max_tokens: 16384,
        seed: 42,
      },
    };
  }

  if (cleanKey.startsWith('xai-')) {
    return {
      url: PROVIDERS.xai.chatEndpoint,
      model: 'grok-2-latest',
      models: PROVIDERS.xai.models,
      params: { temperature: 0.7, top_p: 0.95 },
    };
  }

  if (cleanKey.startsWith('sk-or-')) {
    return {
      url: PROVIDERS.openrouter.chatEndpoint,
      model: 'deepseek/deepseek-r1',
      models: PROVIDERS.openrouter.models,
      params: { temperature: 0.7 },
    };
  }

  // Default fallback: Groq
  return {
    url: PROVIDERS.groq.chatEndpoint,
    model: 'llama-3.3-70b-versatile',
    models: PROVIDERS.groq.models,
    params: { temperature: 0.7, top_p: 0.95 },
  };
}
