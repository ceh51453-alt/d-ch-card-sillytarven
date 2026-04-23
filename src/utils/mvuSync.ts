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

  // Hàm helper: Replace thông minh — chỉ replace trong ngữ cảnh biến
  // Không replace nếu key nằm giữa chữ cái khác (cho ASCII)
  const replaceInText = (text: string): string => {
    if (!text || typeof text !== 'string') return text;
    let newText = text;
    for (const [original, translated] of entries) {
      const escaped = escapeRegExp(original);
      
      // Xác định loại boundary dựa trên nội dung key
      const isAsciiOnly = /^[a-zA-Z0-9_]+$/.test(original);
      let regex: RegExp;
      
      if (isAsciiOnly) {
        // ASCII keys: sử dụng word boundary để tránh replace nhầm
        // VD: "name" không replace trong "username"
        regex = new RegExp(`\\b${escaped}\\b`, 'g');
      } else {
        // Unicode keys (Trung/Nhật/Hàn): không có word boundary
        // Nhưng kiểm tra không nằm trong giữa chuỗi ASCII (VD: function name)
        regex = new RegExp(escaped, 'g');
      }
      
      newText = newText.replace(regex, translated);
    }
    return newText;
  };

  // 1. Xử lý TavernHelper Scripts (Zod Schema)
  const tavernHelper = result.data.extensions?.tavern_helper as any;
  if (tavernHelper?.scripts) {
    tavernHelper.scripts = tavernHelper.scripts.map((script: any) => ({
      ...script,
      content: replaceInText(script.content)
    }));
  }
  // Hỗ trợ phiên bản cũ của TavernHelper
  const tavernHelperLegacy = result.data.extensions?.TavernHelper_scripts as any;
  if (Array.isArray(tavernHelperLegacy)) {
    result.data.extensions!.TavernHelper_scripts = tavernHelperLegacy.map((script: any) => ({
      ...script,
      content: replaceInText(script.content)
    }));
  }

  // 2. Xử lý Regex Scripts (HTML UI, class, id, data-var)
  if (result.data.extensions?.regex_scripts) {
    result.data.extensions.regex_scripts = result.data.extensions.regex_scripts.map((script) => ({
      ...script,
      replaceString: replaceInText(script.replaceString)
    }));
  }

  // 3. Xử lý Lorebook Entries (Rules, [initvar], JSON Patch)
  if (result.data.character_book?.entries) {
    result.data.character_book.entries = result.data.character_book.entries.map((entry) => ({
      ...entry,
      content: replaceInText(entry.content)
    }));
  }

  // Cập nhật backup lorebook nếu có
  const extCharBook = result.data.extensions?.character_book as any;
  if (extCharBook?.entries) {
    extCharBook.entries = extCharBook.entries.map((entry: any) => ({
      ...entry,
      content: replaceInText(entry.content)
    }));
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

  // Filter out generic/noise keys
  const noiseKeys = new Set(['true', 'false', 'null', 'undefined', 'enabled', 'disabled', 'name', 'value', 'type', 'content', 'key', 'data', 'id', 'class', 'style']);
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
1. Use ONLY Latin letters (with diacritics if the target language requires, like Vietnamese).
2. Replace spaces with underscores (_).
3. Keep the names SHORT but meaningful (2-5 words max).
4. NO spaces, NO special characters except underscores.
5. Be CONSISTENT: similar concepts should have similar naming patterns.
6. If a key is already in Latin/ASCII, keep it AS IS.
7. Proper nouns (names) should be transliterated, not translated.

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
