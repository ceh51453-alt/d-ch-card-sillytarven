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

/* ─── Default prompt template ─── */
export function getDefaultTranslationPrompt(sourceLang: string, targetLang: string): string {
  const sourceInfo = sourceLang && sourceLang !== 'auto'
    ? `You are translating FROM ${sourceLang} TO ${targetLang}.`
    : `You are translating content to ${targetLang}.`;

  return `You are a professional translator specializing in translating to ${targetLang}.
You are translating content from a SillyTavern AI character card (roleplay fiction).
${sourceInfo}

STRICT RULES:
1. Return ONLY the translated text. Do NOT include the original text, do NOT show "original → translation" pairs, no explanations, no markdown wrapping.
2. Preserve ALL formatting: HTML tags, markdown, newlines (\\n), special characters.
3. Preserve ALL placeholders: {{char}}, {{user}}, {{original}}, <|im_start|>, <START>, etc.
4. Preserve ALL code blocks, regex patterns, JSON structures inside the text.
5. Keep proper nouns (character names, place names) consistent throughout.
6. For lorebook keys (keywords): translate naturally but keep them short and comma-separated.
7. Maintain the same tone and style of the original text.
8. DO NOT translate text that is already in ${targetLang} (leave it exactly as is).
9. Variables and keys MUST NOT contain spaces. Use underscores instead of spaces (e.g., 'Tình_Yêu' instead of 'Tình Yêu').
10. Your translation must fully comply with MVU (Model-View-Update) structure rules.
11. For Japanese proper nouns (names, places, etc.), you MUST transliterate them into standard Romaji.
12. CRITICAL: The output must contain ONLY the translated text in ${targetLang}. Do NOT include source language text. Do NOT pair original text with translation. Do NOT use arrows (→) or colons (:) to show before/after.`;
}

/* ─── Build messages for translation ─── */
function buildTranslationMessages(
  text: string,
  fieldName: string,
  targetLang: string,
  systemPromptPrefix: string,
  sourceLang: string,
  customPrompt?: string,
  customSchema?: string
) {
  const schemaInstructions = customSchema
    ? `\n\nCARD SCHEMA / GLOSSARY:\nHere is the schema or variable definitions for this character. Please mentally translate these variables into the target language to establish a consistent vocabulary, and apply this vocabulary strictly when translating the text below. Maintain any variable names, JSON keys, or special formats:\n${customSchema}\n`
    : '';

  // Use custom prompt if provided, otherwise generate default
  const basePrompt = customPrompt && customPrompt.trim()
    ? customPrompt
    : getDefaultTranslationPrompt(sourceLang, targetLang);

  const systemPrompt = `${systemPromptPrefix ? systemPromptPrefix + '\n\n' : ''}${basePrompt}${schemaInstructions}`;

  const sourceHint = sourceLang && sourceLang !== 'auto' ? ` (from ${sourceLang})` : '';

  return {
    system: systemPrompt,
    user: `Translate the following "${fieldName}" field${sourceHint} to ${targetLang}. Return ONLY the pure translated text, without including any of the original text:\n\n${text}`,
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

/* ─── Clean translation response ─── */
// Strips patterns where AI returns "original → translation" instead of just translation
function cleanTranslationResponse(original: string, translated: string): string {
  let cleaned = translated;

  // Pattern 1: Full text "original → translation" or "original -> translation"
  // The AI sometimes returns "Chinese text → Vietnamese text"

  // Check if the response contains the original text with an arrow separator
  // Split by various arrow characters
  const arrowSeparators = ['→', '➜', '➡', '⇒', '->'];
  for (const sep of arrowSeparators) {
    if (cleaned.includes(sep)) {
      // Split by the separator and check if the left side looks like original text
      const parts = cleaned.split(sep);
      if (parts.length === 2) {
        const leftTrimmed = parts[0].trim();
        const rightTrimmed = parts[1].trim();
        // If left side significantly overlaps with the original, take only the right side
        if (leftTrimmed.length > 0 && rightTrimmed.length > 0) {
          const overlapRatio = calculateOverlap(original, leftTrimmed);
          if (overlapRatio > 0.3) {
            cleaned = rightTrimmed;
          }
        }
      } else if (parts.length > 2) {
        // Multiple arrows - likely "line1_orig → line1_trans\nline2_orig → line2_trans"
        // Process line by line
        const lines = cleaned.split('\n');
        const cleanedLines: string[] = [];
        for (const line of lines) {
          let processedLine = line;
          for (const s of arrowSeparators) {
            if (processedLine.includes(s)) {
              const lineParts = processedLine.split(s);
              if (lineParts.length === 2 && lineParts[1].trim().length > 0) {
                processedLine = lineParts[1].trim();
                break;
              }
            }
          }
          cleanedLines.push(processedLine);
        }
        cleaned = cleanedLines.join('\n');
      }
    }
  }

  // Pattern 2: Backtick-wrapped pairs like `original` → `translation`
  cleaned = cleaned.replace(/`[^`]+`\s*[→➜➡⇒]\s*`([^`]+)`/g, '$1');
  cleaned = cleaned.replace(/`[^`]+`\s*->\s*`([^`]+)`/g, '$1');

  // Pattern 3: Remove any remaining backtick wrapping around the whole response
  if (cleaned.startsWith('`') && cleaned.endsWith('`') && !original.startsWith('`')) {
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned.startsWith("'") && cleaned.endsWith("'") && !original.startsWith("'")) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned.trim();
}

/* ─── Calculate character overlap ratio ─── */
function calculateOverlap(a: string, b: string): number {
  // Simple character-level overlap check
  const aChars = new Set(a.split(''));
  const bChars = new Set(b.split(''));
  let overlap = 0;
  for (const ch of bChars) {
    if (aChars.has(ch)) overlap++;
  }
  return overlap / Math.max(aChars.size, 1);
}

/* ─── Main translate function with retry ─── */
export async function translateText(
  text: string,
  fieldName: string,
  config: ProxySettings,
  targetLang: string,
  sourceLang: string,
  customPrompt?: string,
  customSchema?: string,
  signal?: AbortSignal
): Promise<string> {
  if (!text || text.trim() === '') return '';

  const chunks = chunkText(text);
  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    const { system, user } = buildTranslationMessages(chunk, fieldName, targetLang, config.systemPromptPrefix, sourceLang, customPrompt, customSchema);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        if (signal?.aborted) throw new Error('Cancelled');

        const controller = new AbortController();
        const timeout = config.requestTimeout || 60000;
        const timeoutId = setTimeout(() => controller.abort('Request timeout'), timeout);

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

        // User cancelled — stop immediately
        if (signal?.aborted) throw err;

        // Detect timeout abort (from our controller) vs other errors
        const errMsg = err instanceof Error ? err.message : String(err);
        const isTimeout = errMsg.includes('timeout') || errMsg.includes('aborted');

        if (err instanceof ApiError && !err.retryable) {
          throw err; // Non-retryable API errors (401, etc.)
        }

        // Retry on timeout or retryable errors
        if (attempt < config.maxRetries) {
          const baseDelay = config.retryDelay || 1000;
          const backoff = Math.min(baseDelay * Math.pow(2, attempt), 30000);
          await sleep(backoff);
        } else if (isTimeout) {
          // Final attempt was a timeout — throw a clear error
          throw new ApiError(`Request timed out after ${(config.requestTimeout || 60000) / 1000}s`, undefined, true);
        }
      }
    }

    if (lastError) throw lastError;
  }

  const rawResult = translatedChunks.join('\n\n');
  return cleanTranslationResponse(text, rawResult);
}

/* ─── Batch translate multiple fields in one API call ─── */
export async function translateBatch(
  items: { text: string; fieldName: string }[],
  config: ProxySettings,
  targetLang: string,
  sourceLang: string,
  systemPromptPrefix: string,
  customPrompt?: string,
  customSchema?: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (items.length === 0) return [];
  if (items.length === 1) {
    const result = await translateText(items[0].text, items[0].fieldName, config, targetLang, sourceLang, customPrompt, customSchema, signal);
    return [result];
  }

  // Build combined prompt with numbered sections
  const DELIMITER = '===';
  const combinedText = items
    .map((item, i) => `${DELIMITER}${i + 1}${DELIMITER}\n${item.text}`)
    .join('\n\n');

  const schemaInstructions = customSchema
    ? `\n\nCARD SCHEMA / GLOSSARY:\n${customSchema}\n`
    : '';

  const basePrompt = customPrompt && customPrompt.trim()
    ? customPrompt
    : getDefaultTranslationPrompt(sourceLang, targetLang);

  const system = `${systemPromptPrefix ? systemPromptPrefix + '\n\n' : ''}${basePrompt}

BATCH FORMAT:
- The input contains ${items.length} numbered sections, each starting with ${DELIMITER}N${DELIMITER} (e.g., ${DELIMITER}1${DELIMITER}, ${DELIMITER}2${DELIMITER}).
- You MUST return the same numbered delimiters with the translated text for each section.
- Do NOT merge or skip any sections. Every section must be present in your output.${schemaInstructions}`;

  const sourceHint = sourceLang && sourceLang !== 'auto' ? ` (from ${sourceLang})` : '';
  const user = `Translate these ${items.length} sections${sourceHint} to ${targetLang}. Keep the ${DELIMITER}N${DELIMITER} delimiters. Return ONLY translations:\n\n${combinedText}`;

  // Call provider
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      if (signal?.aborted) throw new Error('Cancelled');

      const controller = new AbortController();
      const timeout = (config.requestTimeout || 60000) * 2; // Double timeout for batch
      const timeoutId = setTimeout(() => controller.abort('Batch request timeout'), timeout);

      const combinedSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;

      const rawResult = await callProvider(config, system, user, combinedSignal);
      clearTimeout(timeoutId);

      // Parse response by delimiters
      const results = parseBatchResponse(rawResult, items.length);
      return results;
    } catch (err) {
      lastError = err as Error;
      if (signal?.aborted) throw err;
      if (err instanceof ApiError && !err.retryable) throw err;

      if (attempt < config.maxRetries) {
        const baseDelay = config.retryDelay || 1000;
        await sleep(Math.min(baseDelay * Math.pow(2, attempt), 30000));
      }
    }
  }

  if (lastError) throw lastError;
  return items.map(() => ''); // Fallback
}

/* ─── Parse batch response into individual translations ─── */
function parseBatchResponse(response: string, expectedCount: number): string[] {
  const results: string[] = new Array(expectedCount).fill('');

  // Strategy 1: Split by ===N=== delimiters (exact or with spaces)
  const sectionRegex = /===\s*(\d+)\s*===/g;
  const matches: { index: number; num: number; fullMatch: string }[] = [];
  let match;

  while ((match = sectionRegex.exec(response)) !== null) {
    matches.push({ index: match.index, num: parseInt(match[1], 10), fullMatch: match[0] });
  }

  if (matches.length >= Math.min(expectedCount, 2)) {
    for (let i = 0; i < matches.length; i++) {
      const num = matches[i].num;
      if (num < 1 || num > expectedCount) continue;

      const startIdx = matches[i].index + matches[i].fullMatch.length;
      const endIdx = i + 1 < matches.length ? matches[i + 1].index : response.length;
      const text = response.slice(startIdx, endIdx).trim();
      if (text) results[num - 1] = text;
    }

    // Check if we got most results
    const filledCount = results.filter(r => r.trim()).length;
    if (filledCount >= expectedCount * 0.5) return results;
  }

  // Strategy 2: Try ---N--- or [N] delimiters
  const altRegex = /(?:---\s*(\d+)\s*---|^\[(\d+)\]\s*)/gm;
  const altMatches: { index: number; num: number; fullMatch: string }[] = [];

  while ((match = altRegex.exec(response)) !== null) {
    const num = parseInt(match[1] || match[2], 10);
    altMatches.push({ index: match.index, num, fullMatch: match[0] });
  }

  if (altMatches.length >= Math.min(expectedCount, 2)) {
    for (let i = 0; i < altMatches.length; i++) {
      const num = altMatches[i].num;
      if (num < 1 || num > expectedCount) continue;

      const startIdx = altMatches[i].index + altMatches[i].fullMatch.length;
      const endIdx = i + 1 < altMatches.length ? altMatches[i + 1].index : response.length;
      const text = response.slice(startIdx, endIdx).trim();
      if (text) results[num - 1] = text;
    }

    const filledCount = results.filter(r => r.trim()).length;
    if (filledCount >= expectedCount * 0.5) return results;
  }

  // Strategy 3: Line-by-line numbered patterns like "1. text" or "1: text"
  const lines = response.split('\n');
  const numberedLine = /^(\d+)[.:)\]]\s+(.+)/;
  let foundNumbered = 0;
  for (const line of lines) {
    const m = line.trim().match(numberedLine);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num >= 1 && num <= expectedCount) {
        if (!results[num - 1]) results[num - 1] = m[2].trim();
        foundNumbered++;
      }
    }
  }
  if (foundNumbered >= expectedCount * 0.5) return results;

  // Strategy 4: Split by double newlines as last resort
  const parts = response.split(/\n\n+/).filter(p => p.trim());
  for (let i = 0; i < Math.min(parts.length, expectedCount); i++) {
    if (!results[i]) {
      results[i] = parts[i].replace(/===\s*\d+\s*===/g, '').replace(/---\s*\d+\s*---/g, '').trim();
    }
  }

  return results;
}

/* ─── Test connection ─── */
export async function testConnection(config: ProxySettings): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await translateText(
      'Hello, this is a connection test.',
      'test',
      { ...config, maxRetries: 0 },
      'English',
      'auto'
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
        'gemini-3.1-pro-preview',
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
