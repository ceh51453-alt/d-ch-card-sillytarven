import type { AIProvider, ProxySettings } from '../types/card';

/* ─── Error types ─── */
export class ApiError extends Error {
  statusCode?: number;
  retryable: boolean;

  constructor(message: string, statusCode?: number, retryable: boolean = false) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/* ─── Build messages for translation ─── */
function buildTranslationMessages(
  text: string,
  fieldName: string,
  targetLang: string,
  systemPromptPrefix: string
) {
  const systemPrompt = `${systemPromptPrefix ? systemPromptPrefix + '\n\n' : ''}You are a professional translator specializing in translating to ${targetLang}.
You are translating content from a SillyTavern AI character card (roleplay fiction).

STRICT RULES:
1. Translate ONLY the text content. Return ONLY the translated text, no explanations, no markdown wrapping.
2. Preserve ALL formatting: HTML tags, markdown, newlines (\\n), special characters.
3. Preserve ALL placeholders: {{char}}, {{user}}, {{original}}, <|im_start|>, <START>, etc.
4. Preserve ALL code blocks, regex patterns, JSON structures inside the text.
5. Keep proper nouns (character names, place names) consistent throughout.
6. For lorebook keys (keywords): translate naturally but keep them short and comma-separated.
7. If the text is already in ${targetLang} or is code/HTML only, return it unchanged.
8. Maintain the same tone and style of the original text.`;

  return {
    system: systemPrompt,
    user: `Translate the following "${fieldName}" field to ${targetLang}. Return ONLY the translation:\n\n${text}`,
  };
}

/* ─── Chunk long text ─── */
function chunkText(text: string, maxChars: number = 6000): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Try to split at paragraph break
    let splitIdx = remaining.lastIndexOf('\n\n', maxChars);
    if (splitIdx < maxChars * 0.3) {
      // Fallback to single newline
      splitIdx = remaining.lastIndexOf('\n', maxChars);
    }
    if (splitIdx < maxChars * 0.3) {
      // Fallback to space
      splitIdx = remaining.lastIndexOf(' ', maxChars);
    }
    if (splitIdx < maxChars * 0.3) {
      splitIdx = maxChars;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

/* ─── OpenAI-compatible API call ─── */
async function callOpenAICompatible(
  config: ProxySettings,
  system: string,
  user: string,
  signal?: AbortSignal
): Promise<string> {
  const url = config.proxyUrl.replace(/\/+$/, '') + '/chat/completions';

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: config.maxTokens,
    temperature: config.temperature,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 401) throw new ApiError('Invalid API key', 401);
    if (res.status === 429) throw new ApiError('Rate limited (429)', 429, true);
    if (res.status >= 500) throw new ApiError(`Server error ${res.status}: ${errText}`, res.status, true);
    throw new ApiError(`HTTP ${res.status}: ${errText}`, res.status);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new ApiError(`Invalid response format. Raw: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return content.trim();
}

/* ─── Anthropic API call ─── */
async function callAnthropic(
  config: ProxySettings,
  system: string,
  user: string,
  signal?: AbortSignal
): Promise<string> {
  const url = config.proxyUrl.replace(/\/+$/, '') + '/messages';

  const body = {
    model: config.model,
    max_tokens: config.maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    temperature: config.temperature,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 401) throw new ApiError('Invalid API key', 401);
    if (res.status === 429) throw new ApiError('Rate limited (429)', 429, true);
    if (res.status >= 500) throw new ApiError(`Server error ${res.status}: ${errText}`, res.status, true);
    throw new ApiError(`HTTP ${res.status}: ${errText}`, res.status);
  }

  const json = await res.json();
  const content = json.content?.[0]?.text;
  if (typeof content !== 'string') {
    throw new ApiError(`Invalid Anthropic response. Raw: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return content.trim();
}

/* ─── Google Gemini API call ─── */
async function callGemini(
  config: ProxySettings,
  system: string,
  user: string,
  signal?: AbortSignal
): Promise<string> {
  const baseUrl = config.proxyUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: config.maxTokens,
      temperature: config.temperature,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) throw new ApiError('Invalid API key', res.status);
    if (res.status === 429) throw new ApiError('Rate limited (429)', 429, true);
    if (res.status >= 500) throw new ApiError(`Server error ${res.status}: ${errText}`, res.status, true);
    throw new ApiError(`HTTP ${res.status}: ${errText}`, res.status);
  }

  const json = await res.json();
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string') {
    throw new ApiError(`Invalid Gemini response. Raw: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return content.trim();
}

/* ─── Route to correct provider ─── */
async function callProvider(
  config: ProxySettings,
  system: string,
  user: string,
  signal?: AbortSignal
): Promise<string> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, system, user, signal);
    case 'google':
      return callGemini(config, system, user, signal);
    case 'openai':
    case 'custom':
    default:
      return callOpenAICompatible(config, system, user, signal);
  }
}

/* ─── Sleep utility ─── */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ─── Main translate function with retry ─── */
export async function translateText(
  text: string,
  fieldName: string,
  config: ProxySettings,
  targetLang: string,
  signal?: AbortSignal
): Promise<string> {
  if (!text || text.trim() === '') return '';

  const chunks = chunkText(text);
  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    const { system, user } = buildTranslationMessages(chunk, fieldName, targetLang, config.systemPromptPrefix);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        if (signal?.aborted) throw new Error('Cancelled');

        const controller = new AbortController();
        const timeout = config.requestTimeout || 60000;
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Combine signals
        const combinedSignal = signal
          ? AbortSignal.any([signal, controller.signal])
          : controller.signal;

        const result = await callProvider(config, system, user, combinedSignal);
        clearTimeout(timeoutId);
        translatedChunks.push(result);
        lastError = null;
        break;
      } catch (err) {
        lastError = err as Error;
        if (signal?.aborted) throw err;

        if (err instanceof ApiError && !err.retryable && attempt < config.maxRetries) {
          throw err; // Non-retryable errors
        }

        if (attempt < config.maxRetries) {
          const baseDelay = config.retryDelay || 1000;
          const backoff = Math.min(baseDelay * Math.pow(2, attempt), 30000);
          await sleep(backoff);
        }
      }
    }

    if (lastError) throw lastError;
  }

  return translatedChunks.join('\n\n');
}

/* ─── Test connection ─── */
export async function testConnection(config: ProxySettings): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await translateText(
      'Hello, this is a connection test.',
      'test',
      { ...config, maxRetries: 0 },
      'English'
    );
    if (result) {
      return { ok: true, message: `Connected! Response: "${result.slice(0, 60)}..."` };
    }
    return { ok: false, message: 'Empty response from API' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return { ok: false, message: `Cannot reach proxy at ${config.proxyUrl}. Check if proxy is running.` };
    }
    return { ok: false, message: msg };
  }
}

/* ─── Model suggestions per provider ─── */
export function getModelSuggestions(provider: AIProvider): string[] {
  switch (provider) {
    case 'openai':
    case 'custom':
      return [
        // OpenAI latest
        'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
        'gpt-4o', 'gpt-4o-mini',
        'o4-mini', 'o3', 'o3-mini',
        // DeepSeek
        'deepseek-chat', 'deepseek-reasoner',
        // Qwen
        'qwen3-235b-a22b', 'qwen3-32b', 'qwen3-30b-a3b',
        // Claude via proxy
        'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022',
        // Gemini via proxy
        'gemini-2.5-pro-preview-05-06', 'gemini-2.5-flash-preview-04-17',
      ];
    case 'anthropic':
      return [
        'claude-sonnet-4-20250514',
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229', 'claude-3-haiku-20240307',
      ];
    case 'google':
      return [
        'gemini-3.1-pro-preview',
        'gemini-2.5-pro-preview-05-06', 'gemini-2.5-flash-preview-04-17',
        'gemini-2.0-flash', 'gemini-2.0-flash-lite',
        'gemini-1.5-pro', 'gemini-1.5-flash',
      ];
    default:
      return [];
  }
}

/* ─── Default proxy URLs per provider ─── */
export function getDefaultProxyUrl(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'custom':
    default:
      return 'http://localhost:8080/v1';
  }
}
