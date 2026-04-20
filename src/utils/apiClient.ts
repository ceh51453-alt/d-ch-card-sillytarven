import type { AIProvider, ProxySettings, GlossaryEntry } from '../types/card';

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
9. FORMATTING RULES for structured text:
   - If text uses YAML-like structure (lines with "key:" format), keep underscores ONLY in the KEY part (before the colon). The VALUE part (after the colon) is normal text — do NOT add underscores.
   - XML/HTML tag names and attributes: Keep exactly as-is (e.g., <Sabercharacter>, <user_setting>).
   - Regular prose/narrative text: Write naturally WITHOUT underscores. Underscores are NOT needed in flowing text or dialogue.
   - Variable placeholders like {{char}}, {{user}}, {{random}}: Keep exactly as-is, do NOT translate.
   - Text inside angle brackets like <角色名>, <设定>: Keep the bracket structure, translate the content inside.
10. Maintain consistent terminology. If you translate a term one way, use that same translation throughout.
11. For Japanese proper nouns (names, places, etc.), you MUST transliterate them into standard Romaji.
12. CRITICAL: The output must contain ONLY the translated text in ${targetLang}. Do NOT include source language text. Do NOT pair original text with translation. Do NOT use arrows (→) or colons (:) to show before/after.
13. CRITICAL: You MUST translate the COMPLETE text. Do NOT stop early. Do NOT summarize or truncate. If the text is very long, translate ALL of it from start to finish.`;
}

/* ─── Build messages for translation ─── */
function buildTranslationMessages(
  text: string,
  fieldName: string,
  targetLang: string,
  systemPromptPrefix: string,
  sourceLang: string,
  customPrompt?: string,
  customSchema?: string,
  contextHint?: string,
  glossary?: GlossaryEntry[],
  previousTranslationContext?: string,
  previousTranslationToUpdate?: string
) {
  const schemaInstructions = customSchema
    ? `\n\nCARD SCHEMA / GLOSSARY:\nHere is the schema or variable definitions for this character. Please mentally translate these variables into the target language to establish a consistent vocabulary, and apply this vocabulary strictly when translating the text below. Maintain any variable names, JSON keys, or special formats:\n${customSchema}\n`
    : '';

  // Build glossary instructions
  let glossaryInstructions = '';
  if (glossary && glossary.length > 0) {
    const terms = glossary
      .filter(g => g.source.trim() && g.target.trim())
      .map(g => `  "${g.source}" → "${g.target}"`)
      .join('\n');
    if (terms) {
      glossaryInstructions = `\n\nMANDATORY TERMINOLOGY (use these translations exactly, no exceptions):\n${terms}\n`;
    }
  }

  // Use custom prompt if provided, otherwise generate default
  const basePrompt = customPrompt && customPrompt.trim()
    ? customPrompt
    : getDefaultTranslationPrompt(sourceLang, targetLang);

  const systemPrompt = `${systemPromptPrefix ? systemPromptPrefix + '\n\n' : ''}${basePrompt}${schemaInstructions}${glossaryInstructions}`;

  const sourceHint = sourceLang && sourceLang !== 'auto' ? ` (from ${sourceLang})` : '';

  // Contextual keyword translation: include content context for lorebook keys
  let userMsg: string;
  let previousContextMsg = '';
  
  if (previousTranslationContext) {
    previousContextMsg = `\n\n[IMPORTANT CONTEXT: You are translating part of a larger text. Here is the END of the PREVIOUS translated part so you can maintain flow, sentence structure, and terminology:\n"...${previousTranslationContext}"]`;
  }

  if (previousTranslationToUpdate && previousTranslationToUpdate.trim()) {
    // This is the Update mode: the original text changed, so we want the AI to update the existing translation.
    userMsg = `You are updating the translation of the "${fieldName}" field${sourceHint} to ${targetLang}.
Some parts of the original text are NEW or CHANGED.
Please translate the ENTIRE updated original text below, but REUSE the "PREVIOUS TRANSLATION" as much as possible for parts that haven't changed. This ensures consistency.

--- PREVIOUS TRANSLATION ---
${previousTranslationToUpdate}
--- END PREVIOUS TRANSLATION ---

Translate the following updated original text. Return ONLY the pure translated text, without including any of the original text:${previousContextMsg}\n\n${text}`;
  } else if (contextHint) {
    userMsg = `Here is the entry content for context (use these terms consistently):\n"${contextHint}"\n\nBased on the terminology above, translate the following "${fieldName}" field${sourceHint} to ${targetLang}. Return ONLY comma-separated translated keywords. Keep them short and use the SAME terms that appear in the content:${previousContextMsg}\n\n${text}`;
  } else {
    userMsg = `Translate the following "${fieldName}" field${sourceHint} to ${targetLang}. Return ONLY the pure translated text, without including any of the original text:${previousContextMsg}\n\n${text}`;
  }

  return {
    system: systemPrompt,
    user: userMsg,
  };
}

/* ─── Detect CJK content ratio ─── */
function getCJKRatio(text: string): number {
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  return text.length > 0 ? cjkChars / text.length : 0;
}

/* ─── Chunk long text (CJK-aware) ─── */
function chunkText(text: string, maxChars?: number, maxTokens?: number): string[] {
  // Auto-detect optimal chunk size based on content language
  // CJK characters use ~2-3 tokens each, so we need smaller chunks
  // to avoid hitting output token limits on Gemini/etc.
  if (maxChars === undefined) {
    const cjkRatio = getCJKRatio(text);
    
    // If the proxy supports large output, maxTokens might be huge (e.g. 50,000 to unlimited)
    // Roughly 1 token = 3-4 chars for English, 1-2 chars for CJK
    if (maxTokens && maxTokens > 4000) {
      if (cjkRatio > 0.3) maxChars = maxTokens; // e.g. 100k tokens -> 100k chars for CJK
      else if (cjkRatio > 0.1) maxChars = maxTokens * 2;
      else maxChars = maxTokens * 3; // e.g. 100k tokens -> 300k chars for Latin
    } else {
      if (cjkRatio > 0.3) {
        maxChars = 2000; // CJK-heavy: ~2000 chars ≈ 5000-6000 tokens output
      } else if (cjkRatio > 0.1) {
        maxChars = 3500; // Mixed content
      } else {
        maxChars = 6000; // Latin/Cyrillic text
      }
    }
  }

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
      // Fallback to sentence-ending punctuation for CJK
      const sentenceEnd = remaining.slice(0, maxChars).search(/[。！？；」』】）\n][^。！？；」』】）]*$/); 
      if (sentenceEnd > maxChars * 0.3) {
        splitIdx = sentenceEnd + 1;
      } else {
        splitIdx = maxChars;
      }
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

/* ─── API Key Rotation ─── */
let _keyIndex = 0;

/** Get the next API key from rotation pool. Falls back to primary key. */
function getRotatedKey(config: ProxySettings): string {
  const pool = config.apiKeys.filter(k => k.trim());
  if (pool.length === 0) return config.apiKey;

  // Include primary key in the pool if not already there
  const allKeys = [config.apiKey, ...pool].filter(Boolean);
  const uniqueKeys = [...new Set(allKeys)];
  if (uniqueKeys.length === 0) return config.apiKey;

  const key = uniqueKeys[_keyIndex % uniqueKeys.length];
  _keyIndex = (_keyIndex + 1) % uniqueKeys.length;
  return key;
}

/** Force advance to next key (e.g. after rate limit) */
function advanceKeyRotation() {
  _keyIndex++;
}

/* ─── Route to correct provider (with key rotation) ─── */
async function callProvider(
  config: ProxySettings,
  system: string,
  user: string,
  signal?: AbortSignal
): Promise<string> {
  // Create a config copy with rotated key
  const activeKey = getRotatedKey(config);
  const rotatedConfig = { ...config, apiKey: activeKey };

  try {
    switch (config.provider) {
      case 'anthropic':
        return await callAnthropic(rotatedConfig, system, user, signal);
      case 'google':
        return await callGemini(rotatedConfig, system, user, signal);
      case 'openai':
      case 'custom':
      default:
        return await callOpenAICompatible(rotatedConfig, system, user, signal);
    }
  } catch (err) {
    // On rate limit, advance to next key for the retry
    if (err instanceof ApiError && err.statusCode === 429) {
      advanceKeyRotation();
    }
    throw err;
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

/* ─── Main translate function with retry + truncation detection ─── */
export async function translateText(
  text: string,
  fieldName: string,
  config: ProxySettings,
  targetLang: string,
  sourceLang: string,
  customPrompt?: string,
  customSchema?: string,
  signal?: AbortSignal,
  contextHint?: string,
  glossary?: GlossaryEntry[],
  previousTranslationToUpdate?: string
): Promise<string> {
  if (!text || text.trim() === '') return '';

  const chunks = chunkText(text, undefined, config.maxTokens);
  const translatedChunks: string[] = [];
  let previousTranslationContext = '';

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    // Pass previousTranslationToUpdate ONLY for the first chunk to avoid passing huge duplicate blocks,
    // or pass it for all chunks? Actually, if chunked, the old translation is for the WHOLE text,
    // so passing it per chunk might be weird. But for large context models, text isn't chunked.
    // If it is chunked, AI might just figure it out.
    const { system, user } = buildTranslationMessages(
      chunk, fieldName, targetLang, config.systemPromptPrefix,
      sourceLang, customPrompt, customSchema, contextHint, glossary, previousTranslationContext,
      chunkIdx === 0 ? previousTranslationToUpdate : undefined
    );

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        if (signal?.aborted) throw new Error('Cancelled');

        const controller = new AbortController();
        // Scale timeout for longer chunks
        const baseTimeout = config.requestTimeout || 60000;
        const chunkRatio = Math.max(1, chunk.length / 2000);
        const timeout = Math.min(baseTimeout * chunkRatio, baseTimeout * 3);
        const timeoutId = setTimeout(() => controller.abort('Request timeout'), timeout);

        // Combine signals
        const combinedSignal = signal
          ? AbortSignal.any([signal, controller.signal])
          : controller.signal;

        let result = await callProvider(config, system, user, combinedSignal);
        clearTimeout(timeoutId);

        // ─── Truncation detection & continuation ───
        // If the response is suspiciously short relative to input, the model likely hit its output limit
        const minRatio = config.minResponseRatio || 0.15;
        if (chunk.length > 500 && result.length > 0) {
          const responseRatio = result.length / chunk.length;
          if (responseRatio < minRatio) {
            // Likely truncated — attempt continuation
            const continuationPrompt = `The previous translation was cut off. Continue translating from where you stopped. ` +
              `The last translated text ended with: "${result.slice(-150)}"\n\n` +
              `Continue translating the remaining original text below. Return ONLY the continuation, do NOT repeat what was already translated:\n\n` +
              `${chunk.slice(Math.floor(chunk.length * Math.max(responseRatio - 0.05, 0.1)))}`;

            try {
              const contController = new AbortController();
              const contTimeout = setTimeout(() => contController.abort('Continuation timeout'), timeout);
              const contSignal = signal
                ? AbortSignal.any([signal, contController.signal])
                : contController.signal;

              const continuation = await callProvider(config, system, continuationPrompt, contSignal);
              clearTimeout(contTimeout);

              if (continuation.trim()) {
                result = result + '\n' + continuation;
              }
            } catch {
              // Continuation failed — use what we have
            }
          }
        }

        translatedChunks.push(result);
        
        // Save the full translated content so far as context for the next chunk
        // High input token limits allow us to send everything previously translated
        previousTranslationContext = translatedChunks.join('\n\n');
        
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
  signal?: AbortSignal,
  glossary?: GlossaryEntry[]
): Promise<string[]> {
  if (items.length === 0) return [];
  if (items.length === 1) {
    const result = await translateText(items[0].text, items[0].fieldName, config, targetLang, sourceLang, customPrompt, customSchema, signal, undefined, glossary);
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

  // Build glossary block
  let glossaryBlock = '';
  if (glossary && glossary.length > 0) {
    const terms = glossary
      .filter(g => g.source.trim() && g.target.trim())
      .map(g => `  "${g.source}" → "${g.target}"`)
      .join('\n');
    if (terms) glossaryBlock = `\n\nMANDATORY TERMINOLOGY:\n${terms}\n`;
  }

  const system = `${systemPromptPrefix ? systemPromptPrefix + '\n\n' : ''}${basePrompt}

BATCH FORMAT:
- The input contains ${items.length} numbered sections, each starting with ${DELIMITER}N${DELIMITER} (e.g., ${DELIMITER}1${DELIMITER}, ${DELIMITER}2${DELIMITER}).
- You MUST return the same numbered delimiters with the translated text for each section.
- Do NOT merge or skip any sections. Every section must be present in your output.${schemaInstructions}${glossaryBlock}`;

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
