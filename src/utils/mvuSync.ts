import type { CharacterCard, ProxySettings } from '../types/card';

/**
 * Áp dụng Chiến Lược B: Đồng bộ hóa tên biến MVU/Zod trên toàn bộ thẻ.
 * Thay thế một tập hợp các khóa (keys) thành các khóa đã dịch (translatedKeys) 
 * trong các thành phần trọng yếu của thẻ:
 * 1. Zod Schema Script (TavernHelper)
 * 2. Regex Scripts (HTML Dashboard)
 * 3. Lorebook Entries (Đặc biệt là [initvar] và [mvu_update])
 */
export function syncMvuVariables(
  card: CharacterCard,
  variableDictionary: Record<string, string>
): CharacterCard {
  // Deep clone thẻ để tránh tham chiếu
  const result = JSON.parse(JSON.stringify(card)) as CharacterCard;
  
  if (!result.data) return result;

  // Lấy danh sách các cặp [gốc, dịch], sắp xếp theo độ dài giảm dần
  // → Tránh replace nhầm khi key ngắn là substring của key dài
  // VD: "好感" và "好感度" → replace "好感度" trước
  const entries = Object.entries(variableDictionary)
    .filter(([k, v]) => k && v && k !== v)
    .sort((a, b) => b[0].length - a[0].length);
  if (entries.length === 0) return result;

  // Escape regex special characters
  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // ─── replaceInCode: Replace biến trong ngữ cảnh code (aggressive) ───
  // Dùng cho: TavernHelper scripts, regex HTML, lorebook entries  
  // Thay thế MỌI NƠI vì các field này chứa code/data
  const replaceInCode = (text: string): string => {
    if (!text || typeof text !== 'string') return text;
    let newText = text;
    for (const [original, translated] of entries) {
      const escaped = escapeRegExp(original);
      
      const isAsciiOnly = /^[a-zA-Z0-9_]+$/.test(original);
      let regex: RegExp;
      
      if (isAsciiOnly) {
        // ASCII keys: sử dụng word boundary để tránh replace nhầm
        regex = new RegExp(`\\b${escaped}\\b`, 'g');
      } else {
        // Unicode keys (Trung/Nhật/Hàn): replace trực tiếp
        regex = new RegExp(escaped, 'g');
      }
      
      newText = newText.replace(regex, translated);
    }
    return newText;
  };

  // ─── replaceInStructured: Replace biến CHỈ trong ngữ cảnh có cấu trúc ───
  // Dùng cho: narrative fields (system_prompt, description, v.v.)
  // Chỉ replace khi biến xuất hiện trong context rõ ràng:
  //   {{getvar::KEY}}, {{setvar::KEY::}}, data-var="KEY", KEY: value (YAML), z.object fields
  const replaceInStructured = (text: string): string => {
    if (!text || typeof text !== 'string') return text;
    let newText = text;
    for (const [original, translated] of entries) {
      const escaped = escapeRegExp(original);
      
      // 1. {{getvar::KEY}} / {{setvar::KEY::}} / {{addvar::KEY}}
      newText = newText.replace(
        new RegExp(`(\\{\\{(?:getvar|setvar|addvar|getglobalvar|setglobalvar|addglobalvar)::)${escaped}`, 'g'),
        `$1${translated}`
      );
      
      // 2. data-var="KEY"
      newText = newText.replace(
        new RegExp(`(data-var\\s*=\\s*["'])${escaped}(["'])`, 'g'),
        `$1${translated}$2`
      );
      
      // 3. YAML-style KEY: (at start of line)
      newText = newText.replace(
        new RegExp(`^(\\s*)${escaped}(\\s*:)`, 'gm'),
        `$1${translated}$2`
      );
    }
    return newText;
  };

  // 1. Xử lý TavernHelper Scripts (Zod Schema) — code context
  const tavernHelper = result.data.extensions?.tavern_helper as any;
  if (tavernHelper?.scripts) {
    tavernHelper.scripts = tavernHelper.scripts.map((script: any) => ({
      ...script,
      content: replaceInCode(script.content)
    }));
  }
  // Hỗ trợ phiên bản cũ của TavernHelper
  const tavernHelperLegacy = result.data.extensions?.TavernHelper_scripts as any;
  if (Array.isArray(tavernHelperLegacy)) {
    result.data.extensions!.TavernHelper_scripts = tavernHelperLegacy.map((script: any) => ({
      ...script,
      content: replaceInCode(script.content)
    }));
  }

  // 2. Xử lý Regex Scripts (HTML UI, class, id, data-var) — code context
  if (result.data.extensions?.regex_scripts) {
    result.data.extensions.regex_scripts = result.data.extensions.regex_scripts.map((script) => ({
      ...script,
      replaceString: replaceInCode(script.replaceString)
    }));
  }

  // 3. Xử lý Lorebook Entries (Rules, [initvar], JSON Patch) — code context
  if (result.data.character_book?.entries) {
    result.data.character_book.entries = result.data.character_book.entries.map((entry) => ({
      ...entry,
      content: replaceInCode(entry.content)
    }));
  }

  // Cập nhật backup lorebook nếu có
  const extCharBook = result.data.extensions?.character_book as any;
  if (extCharBook?.entries) {
    extCharBook.entries = extCharBook.entries.map((entry: any) => ({
      ...entry,
      content: replaceInCode(entry.content)
    }));
  }

  // 4. Xử lý narrative fields — structured replacement only (chỉ thay trong macro/data-var/YAML)
  // Không replace bừa bãi trong văn xuôi
  if (result.data.system_prompt) {
    result.data.system_prompt = replaceInStructured(result.data.system_prompt);
  }
  if (result.data.post_history_instructions) {
    result.data.post_history_instructions = replaceInStructured(result.data.post_history_instructions);
  }
  if (result.data.description) {
    result.data.description = replaceInStructured(result.data.description);
  }
  if (result.data.personality) {
    result.data.personality = replaceInStructured(result.data.personality);
  }
  if (result.data.scenario) {
    result.data.scenario = replaceInStructured(result.data.scenario);
  }
  if (result.data.first_mes) {
    result.data.first_mes = replaceInStructured(result.data.first_mes);
  }

  return result;
}

/**
 * Trích xuất các biến MVU/Zod có khả năng tồn tại trong thẻ để tạo từ điển.
 * Quét TOÀN BỘ thẻ để tìm biến từ nhiều nguồn:
 * 1. [initvar] entries — cấu trúc YAML
 * 2. Zod Schema — z.object({ field: ... })
 * 3. {{getvar::XXX}} / {{setvar::XXX}} macros
 * 4. data-var="XXX" attributes trong Regex HTML
 */
export function extractPotentialMvuKeys(card: CharacterCard): string[] {
  const keys = new Set<string>();
  const data = card.data;
  if (!data) return [];

  // ─── Helper: Extract from text ───
  const scanText = (text: string) => {
    if (!text || typeof text !== 'string') return;

    // 1. YAML keys: `Key_Name:` at start of line
    const yamlKeyRegex = /^[\s]*([^\s:]+):/gm;
    let match;
    while ((match = yamlKeyRegex.exec(text)) !== null) {
      const key = match[1].trim();
      if (key && !key.startsWith('[') && !key.startsWith('<') && !key.startsWith('//') && !key.startsWith('#')) {
        keys.add(key);
      }
    }

    // 2. {{getvar::XXX}} / {{setvar::XXX::VALUE}} / {{getglobalvar::XXX}}
    const varMacroRegex = /\{\{(?:getvar|setvar|addvar|getglobalvar|setglobalvar|addglobalvar)::([^:}]+)/g;
    while ((match = varMacroRegex.exec(text)) !== null) {
      const key = match[1].trim();
      if (key) keys.add(key);
    }

    // 3. Zod fields: z.object({ field_name: z.xxx() })
    const zodFieldRegex = /(\w+)\s*:\s*z\.\w+/g;
    while ((match = zodFieldRegex.exec(text)) !== null) {
      const key = match[1];
      if (key && !['z', 'const', 'let', 'var', 'return', 'export', 'import', 'function', 'if', 'else', 'for', 'while', 'class', 'type'].includes(key)) {
        keys.add(key);
      }
    }

    // 4. data-var="XXX" attributes
    const dataVarRegex = /data-var\s*=\s*["']([^"']+)["']/g;
    while ((match = dataVarRegex.exec(text)) !== null) {
      keys.add(match[1]);
    }
  };

  // ─── Scan lorebook entries (especially [initvar], [mvu_update], rules) ───
  const entries = data.character_book?.entries || [];
  for (const entry of entries) {
    // Prioritize entries with initvar/mvu content
    const isInitvar = (entry.comment && entry.comment.toLowerCase().includes('initvar')) ||
      (entry.content && entry.content.includes('[initvar]'));
    const isMvu = (entry.comment && /mvu|variable|var/i.test(entry.comment)) ||
      (entry.name && /mvu|variable|var/i.test(entry.name));

    if (isInitvar || isMvu) {
      scanText(entry.content);
    } else if (entry.content) {
      // For other entries, only extract {{getvar/setvar}} macros
      const varMacroRegex = /\{\{(?:getvar|setvar|addvar|getglobalvar|setglobalvar|addglobalvar)::([^:}]+)/g;
      let match;
      while ((match = varMacroRegex.exec(entry.content)) !== null) {
        const key = match[1].trim();
        if (key) keys.add(key);
      }
    }
  }

  // ─── Scan TavernHelper scripts (Zod schema, MVU) ───
  const tavernHelper = data.extensions?.tavern_helper as { scripts?: { content: string }[] } | undefined;
  if (tavernHelper?.scripts) {
    for (const script of tavernHelper.scripts) {
      scanText(script.content);
    }
  }
  const tavernHelperLegacy = data.extensions?.TavernHelper_scripts as { content: string }[] | undefined;
  if (Array.isArray(tavernHelperLegacy)) {
    for (const script of tavernHelperLegacy) {
      scanText(script.content);
    }
  }

  // ─── Scan Regex scripts (data-var, getvar in HTML) ───
  if (data.extensions?.regex_scripts) {
    for (const script of data.extensions.regex_scripts) {
      if (script.replaceString) {
        // Only extract data-var and macro references from regex HTML
        const dataVarRegex = /data-var\s*=\s*["']([^"']+)["']/g;
        let match;
        while ((match = dataVarRegex.exec(script.replaceString)) !== null) {
          keys.add(match[1]);
        }
        const varMacroRegex = /\{\{(?:getvar|setvar|addvar)::([^:}]+)/g;
        while ((match = varMacroRegex.exec(script.replaceString)) !== null) {
          keys.add(match[1].trim());
        }
      }
    }
  }

  // ─── Scan narrative fields for {{getvar/setvar}} references ───
  // These fields may reference MVU variables via macros
  const narrativeFields = [
    data.system_prompt, data.post_history_instructions,
    data.description, data.personality, data.scenario, data.first_mes,
  ];
  for (const fieldText of narrativeFields) {
    if (!fieldText || typeof fieldText !== 'string') continue;
    const varMacroRegex = /\{\{(?:getvar|setvar|addvar|getglobalvar|setglobalvar|addglobalvar)::([^:}]+)/g;
    let match;
    while ((match = varMacroRegex.exec(fieldText)) !== null) {
      const key = match[1].trim();
      if (key) keys.add(key);
    }
  }
  // Also scan alternate_greetings
  if (Array.isArray(data.alternate_greetings)) {
    for (const greeting of data.alternate_greetings) {
      if (typeof greeting !== 'string') continue;
      const varMacroRegex = /\{\{(?:getvar|setvar|addvar)::([^:}]+)/g;
      let match;
      while ((match = varMacroRegex.exec(greeting)) !== null) {
        keys.add(match[1].trim());
      }
    }
  }

  // Filter out generic/noise keys
  const noiseKeys = new Set(['true', 'false', 'null', 'undefined', 'enabled', 'disabled', 'name', 'value', 'type', 'content', 'key', 'data', 'id', 'class', 'style', 'script', 'div', 'span', 'table', 'tr', 'td', 'th', 'input', 'button', 'label', 'select', 'option', 'form', 'img', 'src', 'href', 'title', 'alt', 'width', 'height']);
  return Array.from(keys).filter(k => k.length > 1 && !noiseKeys.has(k.toLowerCase()));
}

/* ═══ AI Auto-translate MVU Keys ═══ */

/**
 * Gọi AI để dịch tên biến MVU/Zod thành tên biến tương ứng trong ngôn ngữ đích.
 * Quy tắc: Tên biến dịch phải dùng underscore thay space, giữ format code-friendly.
 * VD: "好感度" → "Do_Hao_Cam", "攻击力" → "Suc_Tan_Cong"
 */
export async function aiTranslateMvuKeys(
  keys: string[],
  targetLang: string,
  proxy: ProxySettings,
  signal?: AbortSignal,
  schemaContext?: string
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};

  // Lọc keys đã là ASCII — không cần dịch
  const keysToTranslate = keys.filter(k => !/^[a-zA-Z0-9_]+$/.test(k));
  const result: Record<string, string> = {};

  // ASCII keys giữ nguyên
  for (const k of keys) {
    if (/^[a-zA-Z0-9_]+$/.test(k)) {
      result[k] = k;
    }
  }

  if (keysToTranslate.length === 0) return result;

  const systemPrompt = `You are a variable name translator for SillyTavern character cards.
Your job: translate variable names from the source language to ${targetLang}, formatted as code-friendly identifiers.

STRICT RULES:
1. Use Latin letters WITH diacritics if the target language requires them (e.g. Vietnamese: Độ_Hảo_Cảm, Sức_Tấn_Công).
2. Replace spaces with underscores (_). No spaces allowed in variable names.
3. Keep the names SHORT but meaningful (2-4 words max).
4. NO spaces, NO special characters except underscores and diacritics.
5. Be CONSISTENT: similar concepts MUST have similar naming patterns.
   - All emotion/feeling variables should follow the same pattern (e.g. Mức_X, Độ_X)
   - All stat variables should follow the same pattern
6. If a key is already in Latin/ASCII, keep it AS IS.
7. Proper nouns (character names) should be transliterated, not translated.
8. Keep numeric suffixes and prefixes intact (e.g. "攻击力2" → "Sức_Tấn_Công_2").
9. For Vietnamese specifically:
   - Use Title_Case with diacritics: Hảo_Cảm, Thể_Lực, Trí_Tuệ
   - Each word should be properly capitalized
   - Common patterns: 好感 → Hảo_Cảm, 体力 → Thể_Lực, 攻击 → Tấn_Công
10. IMPORTANT: The translated names will be used as variable names in code. They must be valid identifiers (letters, digits, underscores only + diacritics).

RESPOND in EXACT JSON format (no markdown): {"translations": {"original_key": "Translated_Key", ...}}`;

  let contextBlock = '';
  if (schemaContext && schemaContext.trim()) {
    contextBlock = `\nHere is the Zod schema or script context where these variables are defined. USE THIS CONTEXT to understand what the variables mean (look at the .describe() text or comments):\n\`\`\`javascript\n${schemaContext.slice(0, 5000)}\n\`\`\`\n\n`;
  }

  const userPrompt = `Translate these variable names to ${targetLang} (code-friendly, underscore-separated):${contextBlock}
Variables to translate:
${keysToTranslate.map((k, i) => `${i + 1}. "${k}"`).join('\n')}`;

  try {
    const url = proxy.proxyUrl.replace(/\/+$/, '');
    let apiUrl: string;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any;

    if (proxy.provider === 'anthropic') {
      apiUrl = url + '/messages';
      headers['x-api-key'] = proxy.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      body = {
        model: proxy.model,
        max_tokens: Math.min(proxy.maxTokens, 4096),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.1,
      };
    } else if (proxy.provider === 'google') {
      apiUrl = `${url}/models/${proxy.model}:generateContent?key=${proxy.apiKey}`;
      body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: Math.min(proxy.maxTokens, 4096), temperature: 0.1 },
      };
    } else {
      apiUrl = url + '/chat/completions';
      if (proxy.apiKey) headers['Authorization'] = `Bearer ${proxy.apiKey}`;
      body = {
        model: proxy.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: Math.min(proxy.maxTokens, 4096),
        temperature: 0.1,
      };
    }

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const json = await res.json();
    let responseText = '';
    if (proxy.provider === 'anthropic') {
      responseText = json.content?.[0]?.text || '';
    } else if (proxy.provider === 'google') {
      responseText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      responseText = json.choices?.[0]?.message?.content || '';
    }

    // Parse JSON response
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    const translations = parsed.translations || parsed;

    for (const [k, v] of Object.entries(translations)) {
      if (typeof v === 'string' && v.trim()) {
        result[k] = v.trim();
      }
    }

    return result;
  } catch (err) {
    console.error('AI MVU key translation failed:', err);
    // Return what we have (ASCII keys mapped to themselves)
    return result;
  }
}

/* ═══ AI Auto-extract Glossary Terms ═══ */

/**
 * Gọi AI để quét các trường văn bản của thẻ (description, personality, lorebook names...)
 * và trích xuất ra các thuật ngữ quan trọng (tên người, địa danh, khái niệm) 
 * cùng với bản dịch sang ngôn ngữ đích.
 */
export async function aiExtractGlossaryTerms(
  card: CharacterCard,
  targetLang: string,
  proxy: ProxySettings,
  signal?: AbortSignal
): Promise<Record<string, string>> {
  let context = '';
  const data = card.data || (card as any);
  if (data.name) context += `Character Name: ${data.name}\n`;
  if (data.description) context += `Description:\n${data.description}\n\n`;
  if (data.personality) context += `Personality:\n${data.personality}\n\n`;
  if (data.scenario) context += `Scenario:\n${data.scenario}\n\n`;
  
  if (data.character_book?.entries) {
    const names = data.character_book.entries.map((e: any) => e.name).filter(Boolean);
    if (names.length > 0) context += `Lorebook Entries (Concepts/Characters):\n${names.join(', ')}\n\n`;
  }
  
  // Truncate to save tokens (first 6000 chars)
  context = context.slice(0, 6000);

  if (!context.trim()) return {};

  const systemPrompt = `You are a terminology extraction AI for roleplay character cards.
Your job is to read the character's background and extract proper nouns, character names, locations, special artifacts, and unique concepts, then translate them to ${targetLang}.

RULES:
1. ONLY extract important proper nouns and specific terminology. DO NOT extract common words (like "sword", "house", "run").
2. Translate them to ${targetLang}. 
   - For Vietnamese (${targetLang}), use proper Hán Việt (Sino-Vietnamese) for Chinese/wuxia/xianxia names (e.g. 李明 -> Lý Minh, 长安 -> Trường An).
3. Keep the list concise (max 15-20 most important terms).
4. Output EXACT JSON format: {"glossary": {"Source Term": "Translated Term"}}
5. DO NOT wrap the JSON in markdown blocks like \`\`\`json. Just output the raw JSON string.`;

  const userPrompt = `Extract and translate terminology to ${targetLang} from the following text:\n\n${context}`;

  try {
    const url = proxy.proxyUrl.replace(/\/+$/, '');
    let apiUrl: string;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any;

    if (proxy.provider === 'anthropic') {
      apiUrl = url + '/messages';
      headers['x-api-key'] = proxy.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      body = {
        model: proxy.model,
        max_tokens: Math.min(proxy.maxTokens, 4096),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.1,
      };
    } else if (proxy.provider === 'google') {
      apiUrl = `${url}/models/${proxy.model}:generateContent?key=${proxy.apiKey}`;
      body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: Math.min(proxy.maxTokens, 4096), temperature: 0.1 },
      };
    } else {
      apiUrl = url + '/chat/completions';
      if (proxy.apiKey) headers['Authorization'] = `Bearer ${proxy.apiKey}`;
      body = {
        model: proxy.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: Math.min(proxy.maxTokens, 4096),
        temperature: 0.1,
      };
    }

    const res = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok) throw new Error(`API ${res.status}`);

    const json = await res.json();
    let responseText = '';
    if (proxy.provider === 'anthropic') responseText = json.content?.[0]?.text || '';
    else if (proxy.provider === 'google') responseText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    else responseText = json.choices?.[0]?.message?.content || '';

    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('\`\`\`')) {
      jsonStr = jsonStr.replace(/^\`\`\`(?:json)?\s*\n?/, '').replace(/\n?\`\`\`\s*$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    const result: Record<string, string> = {};
    const glossary = parsed.glossary || parsed;
    for (const [k, v] of Object.entries(glossary)) {
      if (typeof v === 'string' && v.trim() && typeof k === 'string' && k.trim()) {
        result[k.trim()] = v.trim();
      }
    }
    return result;
  } catch (err) {
    console.error('AI Glossary extraction failed:', err);
    throw err;
  }
}

/* ═══ Regex HTML Post-Processing ═══ */

/**
 * Bản đồ font Trung → font tương thích tiếng Việt.
 * Khi gặp font-family chứa tên font Trung, thay bằng font Việt tương ứng.
 */
const CHINESE_FONT_MAP: [RegExp, string][] = [
  // Tên tiếng Trung
  [/['"']?微软雅黑['"']?/gi, "'Segoe UI', Tahoma, sans-serif"],
  [/['"']?黑体['"']?/gi, "'Segoe UI', Arial, sans-serif"],
  [/['"']?宋体['"']?/gi, "'Times New Roman', 'Noto Serif', serif"],
  [/['"']?新宋体['"']?/gi, "'Times New Roman', serif"],
  [/['"']?楷体['"']?/gi, "'Georgia', serif"],
  [/['"']?仿宋['"']?/gi, "'Georgia', serif"],
  [/['"']?幼圆['"']?/gi, "'Segoe UI', sans-serif"],
  [/['"']?华文[^'",;}\s]+['"']?/gi, "'Segoe UI', sans-serif"],
  [/['"']?方正[^'",;}\s]+['"']?/gi, "'Segoe UI', sans-serif"],
  // Tên tiếng Anh của font Trung
  [/['"']?SimSun['"']?/gi, "'Times New Roman', 'Noto Serif', serif"],
  [/['"']?SimHei['"']?/gi, "'Segoe UI', Arial, sans-serif"],
  [/['"']?NSimSun['"']?/gi, "'Times New Roman', serif"],
  [/['"']?FangSong['"']?/gi, "'Georgia', serif"],
  [/['"']?KaiTi['"']?/gi, "'Georgia', serif"],
  [/['"']?Microsoft YaHei['"']?/gi, "'Segoe UI', Tahoma, sans-serif"],
  [/['"']?Microsoft JhengHei['"']?/gi, "'Segoe UI', Tahoma, sans-serif"],
  [/['"']?STSong['"']?/gi, "'Times New Roman', serif"],
  [/['"']?STHeiti['"']?/gi, "'Segoe UI', sans-serif"],
  [/['"']?STKaiti['"']?/gi, "'Georgia', serif"],
  [/['"']?STFangsong['"']?/gi, "'Georgia', serif"],
  [/['"']?PingFang SC['"']?/gi, "'Segoe UI', sans-serif"],
  [/['"']?PingFang TC['"']?/gi, "'Segoe UI', sans-serif"],
  [/['"']?Hiragino Sans GB['"']?/gi, "'Segoe UI', sans-serif"],
  // Font Nhật thường gặp
  [/['"']?MS Gothic['"']?/gi, "'Segoe UI', sans-serif"],
  [/['"']?MS Mincho['"']?/gi, "'Times New Roman', serif"],
  [/['"']?Meiryo['"']?/gi, "'Segoe UI', sans-serif"],
  [/['"']?Yu Gothic['"']?/gi, "'Segoe UI', sans-serif"],
];

/**
 * CSS snippet tự động ẩn dấu _ thành dấu cách trong hiển thị.
 * Hoạt động bằng cách thay thế underscore trong text nodes qua JS nhỏ.
 */
const UNDERSCORE_DISPLAY_SCRIPT = `<script>
(function(){
  function fixUnderscores(el){
    var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null);
    var node;
    while(node=walker.nextNode()){
      var p=node.parentElement;
      if(p&&(p.tagName==='SCRIPT'||p.tagName==='STYLE'||p.hasAttribute('data-var')||p.hasAttribute('data-keep-underscore')))continue;
      if(node.textContent&&node.textContent.indexOf('_')!==-1){
        node.textContent=node.textContent.replace(/_/g,' ');
      }
    }
  }
  var root=document.currentScript?document.currentScript.parentElement:document.body;
  if(root)fixUnderscores(root);
})();
</script>`;

/**
 * Hậu xử lý HTML trong regex replaceString sau khi dịch:
 * 1. Thay font chữ Trung/Nhật → font tương thích tiếng Việt
 * 2. Inject script ẩn dấu _ thành dấu cách trong hiển thị
 */
export function postProcessRegexHtml(html: string): string {
  if (!html || typeof html !== 'string') return html;

  let result = html;

  // 1. Thay font Trung/Nhật → font Việt
  for (const [pattern, replacement] of CHINESE_FONT_MAP) {
    result = result.replace(pattern, replacement);
  }

  // 2. Inject underscore display script (chỉ thêm 1 lần, kiểm tra đã có chưa)
  if (!result.includes('fixUnderscores') && result.includes('_')) {
    // Tìm vị trí thích hợp để chèn: trước </div> cuối cùng, hoặc cuối chuỗi
    const lastDivClose = result.lastIndexOf('</div>');
    if (lastDivClose !== -1) {
      result = result.slice(0, lastDivClose) + UNDERSCORE_DISPLAY_SCRIPT + result.slice(lastDivClose);
    } else {
      result += UNDERSCORE_DISPLAY_SCRIPT;
    }
  }

  return result;
}
