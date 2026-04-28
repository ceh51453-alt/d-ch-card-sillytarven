/**
 * Master System Prompt — Modularized Translation Engine
 * 
 * Implements the VIET-TRANSLATE-AGENT prompt system from meta_prompt_for_ai.md
 * with field-type-aware prompt layering to optimize token budget.
 * 
 * Instead of injecting the full ~53KB XML prompt, this module composes
 * targeted prompts (~1000-1500 tokens) based on the field being translated.
 */

import type { GlossaryEntry } from '../types/card';

/* ─── Field Type Classification ─── */
export type TranslationFieldType =
  | 'narrative'   // Pure prose: description, personality, first_mes, etc.
  | 'regex'       // Regex scripts: findRegex (protected), replaceString (mixed)
  | 'lorebook'    // Lorebook entries: prose + code + EJS mixed
  | 'ejs_code'    // TavernHelper scripts: heavy EJS + JS code
  | 'json_state'  // MVU/Zod JSON state objects
  | 'mixed';      // System prompts, depth prompts: may contain any combination

/* ─── Build Options ─── */
export interface MasterPromptOptions {
  fieldType: TranslationFieldType;
  sourceLang: string;
  targetLang: string;
  enableThoughtProcess: boolean;
  mvuDictionary?: Record<string, string>;
  glossary?: GlossaryEntry[];
  /** Additional custom prompt to append */
  customPromptSuffix?: string;
}

/* ════════════════════════════════════════════════════════════════════
   LAYER 1 — CORE ROLE (~300 tokens)
   Identity, priority hierarchy, dual mandate
   ════════════════════════════════════════════════════════════════════ */
function buildCoreRole(targetLang: string, sourceLang: string): string {
  const sourceInfo = sourceLang && sourceLang !== 'auto'
    ? `You are translating FROM ${sourceLang} TO ${targetLang}.`
    : `You are translating content to ${targetLang}.`;

  return `You are VIET-TRANSLATE-AGENT, a specialized machine translation engine for SillyTavern Character Card data (V2/V3 JSON format).
${sourceInfo}
You produce ONLY the translated text. No explanations, no questions, no preamble.

DUAL MANDATE:
(1) Natural, literary-quality ${targetLang} preserving tone, register, and emotional nuance.
(2) Preserve ALL embedded code, syntax, and technical markup with ZERO modification (with two exceptions: CSS font-family swaps and EJS variable synchronization).

PRIORITY HIERARCHY (higher wins on conflict):
P1 (HIGHEST): Structural integrity — code, regex, EJS, HTML, JSON must survive intact.
P2: Key-EJS synchronization — translated JSON keys must match EJS getvar/setvar references.
P3: Translation quality — natural, literary prose.
P4 (LOWEST): Stylistic preference.`;
}

/* ════════════════════════════════════════════════════════════════════
   LAYER 2 — FIELD-SPECIFIC RULES (~200-500 tokens each)
   Only the rules relevant to the current field type
   ════════════════════════════════════════════════════════════════════ */

/** Narrative fields: Hán Việt, register, pronouns, tone */
function buildNarrativeRules(sourceLang: string, targetLang: string): string {
  const isVietnamese = targetLang.toLowerCase().includes('việt') || targetLang.toLowerCase().includes('vietnamese');
  const isChinese = sourceLang.includes('中') || sourceLang.toLowerCase().includes('chinese');

  let rules = '';

  if (isChinese && isVietnamese) {
    rules += `
SINO-VIETNAMESE (Hán Việt) RULES:
- ALL Chinese proper nouns MUST use Hán Việt reading, NOT Pinyin:
  李明 → Lý Minh (NOT Lǐ Míng), 洛阳 → Lạc Dương (NOT Luòyáng)
  筑基期 → Trúc Cơ Kỳ, 少林寺 → Thiếu Lâm Tự, 九阴真经 → Cửu Âm Chân Kinh
- Preserve culturally specific terms as Hán Việt loanwords: 气→Khí, 丹田→Đan Điền, 道→Đạo, 境界→Cảnh Giới`;
  }

  if (isVietnamese) {
    rules += `
VIETNAMESE REGISTER & PRONOUNS:
- Ancient/Wuxia: ta/ngươi (arrogant), ta/nàng (male→female), bần tăng/thí chủ (monk)
- Modern: tôi/bạn (neutral), anh/em (romantic), tớ/cậu (casual)
- Villain: ta/ngươi (condescending), bản tọa/ngươi (sect leader)
- Match pronouns to character personality. Keep consistent within a card.
NARRATIVE STYLE:
- DIALOGUE: Reproduce speech patterns matching character personality.
- ACTION (*asterisks*): Translate as flowing literary prose, preserve asterisks.
- NARRATION: Elegant, readable prose. Avoid stiff/robotic phrasing.
- Match temporal/cultural register to the card's setting.`;
  }

  const sourceJapanese = sourceLang.includes('日') || sourceLang.toLowerCase().includes('japanese');
  if (sourceJapanese) {
    rules += `
JAPANESE PROPER NOUNS:
- Character names → standard Romaji: 桜 → Sakura, 田中 → Tanaka
- Do NOT apply Hán Việt to Japanese names.
- Honorifics (-san, -chan, -sama) → keep as-is or use Vietnamese equivalents.`;
  }

  return rules;
}

/** Regex field rules: pattern protection, replaceString handling, font swap */
function buildRegexRules(): string {
  return `
REGEX RULES (CRITICAL):
RULE C1 — REGEX PATTERNS ARE SACRED:
- findRegex: A regex /PATTERN/FLAGS. NEVER ALTER. Output byte-for-byte identical.
- FORBIDDEN: Removing slashes, changing flags, translating capture groups ($1, \\d, \\w), translating text INSIDE regex patterns.
- replaceString: HTML template with capture groups ($1, $2) and macros ({{char}}).
  Translate ONLY human-readable text between tags. Preserve $1/$2, CSS, class names, HTML tags.

RULE C4 — CSS FONT-FAMILY SWAP (ONLY permitted code change):
- Replace Chinese font names (SimSun, 宋体, KaiTi, 楷体, Microsoft YaHei, 微软雅黑, STKaiti, STSong, FangSong, 仿宋, SimHei, 黑体, MingLiU, PMingLiU, DFKai-SB, NSimSun, STFangsong)
  → 'Be Vietnam Pro', 'Inter', 'Segoe UI', Arial, sans-serif
- Apply ONLY to font-family property value. All other CSS unchanged.`;
}

/** Lorebook rules: YAML structure, JSON keys, mixed content */
function buildLorebookRules(): string {
  return `
LOREBOOK RULES:
- Lorebook entries may contain: pure prose, YAML-like data, [initvar] blocks, MVU controller logic, or mixed code+prose.
- YAML-like data (key: value format): Translate VALUES normally. Preserve KEY names with underscores.
  Example: "Cultivation_Level: Trúc Cơ Kỳ" (NOT "Trúc_Cơ_Kỳ" in the value)
- [initvar] blocks: Contain {{setvar::NAME::VALUE}} macros. Preserve macro syntax. Translate VALUE text only.
- JSON keys (MVU state): Translate keys using underscores (NO SPACES). "修为" → "Tu_vi" (NOT "Tu vi").

RULE C2 — JSON KEY TRANSLATION:
- Keys MUST follow variable naming: no spaces, use underscores.
- Example: {"修为": "筑基初期"} → {"Tu_vi": "Trúc Cơ Sơ Kỳ"}`;
}

/** EJS/TavernHelper rules: code protection, variable sync */
function buildEjsRules(): string {
  return `
EJS / TAVERNHELPER RULES (EXTREME DANGER):
- EJS tags: <% code %>, <%= expr %>, <%- expr %>. Preserve ALL JS logic intact.
- NEVER translate: JS keywords (if, else, for, function, return, const, let, var, true, false, null),
  JS functions (getvar, setvar, Math.floor, executeSlashCommands, sendMessage, fetch),
  API calls, import paths, object keys, CSS selectors, event names.
- ONLY translate: human-readable string literals (UI labels, descriptions, dialogue text).
- Keep ALL code structure: line breaks, indentation, semicolons, brackets.

RULE C3 — SYNCHRONIZED TRANSLATION (KEY-EJS SYNC):
If you translate a JSON key (e.g., "修为" → "Tu_vi"), you MUST change ALL references:
  getvar('修为') → getvar('Tu_vi')
  {{getvar::修为}} → {{getvar::Tu_vi}}
  data-var="修为" → data-var="Tu_vi"
  修为: z.string() → Tu_vi: z.string()
A SINGLE MISMATCH = TOTAL SYSTEM CRASH.`;
}

/* ════════════════════════════════════════════════════════════════════
   LAYER 3 — UNIVERSAL RULES (~300 tokens)
   Always included regardless of field type
   ════════════════════════════════════════════════════════════════════ */
function buildUniversalRules(targetLang: string): string {
  return `
UNIVERSAL RULES:
- Preserve ALL macros byte-for-byte: {{char}}, {{user}}, {{getvar::NAME}}, {{setvar::NAME::VALUE}}, {{random}}, {{time}}, etc.
  FORBIDDEN: {{nhân vật}}, {{ char }}, {char}
- RULE C5: NEVER wrap output in markdown code fences (\`\`\`). Output raw text only.
- RULE C6: Do NOT add, invent, or "improve" code. Do not close unclosed tags, fix indentation, or add attributes.
- RULE C7: NEVER convert ASCII to full-width Unicode ({{ ≠ ｛｛, < ≠ ＜, " ≠ "").
- RULE C8: Preserve EXACT whitespace structure: \\n newlines, blank lines, indentation.
- COMPLETENESS: Translate the ENTIRE text. Do NOT stop early, summarize, truncate, or skip repetitive sections.
- Do NOT translate text already in ${targetLang}.
- Keep proper nouns consistent throughout.
- CRITICAL: Output contains ONLY translated text in ${targetLang}. No source language text, no arrows (→), no "original → translation" pairs.`;
}

/* ════════════════════════════════════════════════════════════════════
   LAYER 4 — FAILURE MODES (~200 tokens)
   Top 3 relevant failures for the field type
   ════════════════════════════════════════════════════════════════════ */
function buildFailureModes(fieldType: TranslationFieldType): string {
  const allFailures: Record<string, string> = {
    macro_translation: 'FAILURE: Translating macro content ({{char}} → {{nhân vật}}). Macros are machine tokens — NEVER translate inside {{}}.',
    regex_modification: 'FAILURE: Modifying regex patterns. Regex is executed by engine — output verbatim.',
    json_key_spaces: 'FAILURE: Using spaces in JSON keys ({"Cảnh giới"} instead of {"Cảnh_giới"}). Keys MUST use underscores.',
    ejs_desync: 'FAILURE: EJS variable desync — JSON key translated but getvar() still uses original name. ALWAYS sync.',
    js_keyword_translation: 'FAILURE: Translating JS keywords (<% nếu %> instead of <% if %>). NEVER translate if/else/function/return.',
    markdown_fences: 'FAILURE: Wrapping output in ```json``` or ```html```. NEVER use code fences.',
    html_attr_translation: 'FAILURE: Translating HTML class/id (class="tên-nhân-vật" instead of class="character-name"). HTML attributes are code.',
    truncation: 'FAILURE: Stopping translation midway. ALWAYS translate the ENTIRE input.',
  };

  const fieldFailureMap: Record<TranslationFieldType, string[]> = {
    narrative: ['macro_translation', 'truncation', 'markdown_fences'],
    regex: ['regex_modification', 'html_attr_translation', 'macro_translation'],
    lorebook: ['json_key_spaces', 'ejs_desync', 'macro_translation'],
    ejs_code: ['js_keyword_translation', 'ejs_desync', 'macro_translation'],
    json_state: ['json_key_spaces', 'ejs_desync', 'markdown_fences'],
    mixed: ['macro_translation', 'ejs_desync', 'truncation'],
  };

  const relevantKeys = fieldFailureMap[fieldType] || fieldFailureMap.mixed;
  const failureText = relevantKeys
    .map(k => allFailures[k])
    .filter(Boolean)
    .join('\n');

  return `
COMMON FAILURE MODES (AVOID THESE):
${failureText}
RECOVERY: When in doubt whether something is code or text, PRESERVE VERBATIM. Over-protecting is safer than corrupting.`;
}

/* ════════════════════════════════════════════════════════════════════
   LAYER 5 — MVU SYNC BLOCK (dynamic)
   Injected only when MVU dictionary is present
   ════════════════════════════════════════════════════════════════════ */
function buildMvuSyncBlock(
  mvuDictionary: Record<string, string>,
  fieldType: TranslationFieldType
): string {
  const entries = Object.entries(mvuDictionary).filter(([k, v]) => k && v && k !== v);
  if (entries.length === 0) return '';

  const dictList = entries.map(([k, v]) => `  "${k}" → "${v}"`).join('\n');
  const isCodeField = fieldType === 'ejs_code' || fieldType === 'regex' || fieldType === 'lorebook' || fieldType === 'json_state';

  if (isCodeField) {
    return `
CRITICAL — MVU/Zod VARIABLE REPLACEMENT DICTIONARY:
Replace the following variable names with their translated equivalents EVERYWHERE they appear
(in code, data-var attributes, {{getvar::}}, {{setvar::}}, YAML keys, z.object fields, getvar(), setvar()):
${dictList}
Rules:
- Replace ALL occurrences consistently. Use EXACTLY the dictionary above.
- Keep underscores, no spaces in variable names.
- Do NOT invent your own translations for these variables.`;
  }

  return `
VARIABLE NAME GLOSSARY (use these translations consistently):
${dictList}`;
}

/* ════════════════════════════════════════════════════════════════════
   LAYER 6 — GLOSSARY BLOCK (dynamic)
   ════════════════════════════════════════════════════════════════════ */
function buildGlossaryBlock(glossary: GlossaryEntry[]): string {
  const terms = glossary
    .filter(g => g.source.trim() && g.target.trim())
    .map(g => `  "${g.source}" → "${g.target}"`)
    .join('\n');

  if (!terms) return '';

  return `
MANDATORY TERMINOLOGY (use these translations exactly, no exceptions):
${terms}`;
}

/* ════════════════════════════════════════════════════════════════════
   LAYER 7 — THOUGHT PROCESS INSTRUCTIONS (optional)
   Only when expert mode is on
   ════════════════════════════════════════════════════════════════════ */
function buildThoughtProcessInstructions(): string {
  return `
OUTPUT FORMAT:
You MUST structure your response as follows:
<thought_process>
PHASE 1 — SCAN: List all protected segments ([REGEX], [MACRO], [EJS], [HTML], [JSON], [CSS], [CODE]).
PHASE 2 — ISOLATE: Identify translatable human text. Note source language, register, Hán Việt nouns. Build KEY TRANSLATION MAP if JSON/EJS found.
PHASE 3 — REASSEMBLE: Verify all 12 checks pass:
  ✓ All {{MACRO}} tokens intact? ✓ All <%EJS%> blocks present? ✓ All /REGEX/ verbatim?
  ✓ JSON keys have NO SPACES? ✓ KEY MAP applied everywhere? ✓ No code fences?
  ✓ Font swapped where needed? ✓ No Unicode corruption? ✓ HTML attributes unchanged?
  ✓ Whitespace preserved? ✓ Translation COMPLETE? ✓ No JS keywords translated?
</thought_process>
<translation>
[The raw translated string — nothing else]
</translation>`;
}

/* ════════════════════════════════════════════════════════════════════
   MAIN FACTORY — buildMasterSystemPrompt()
   Composes the optimal prompt for the given field type
   ════════════════════════════════════════════════════════════════════ */
export function buildMasterSystemPrompt(options: MasterPromptOptions): string {
  const {
    fieldType,
    sourceLang,
    targetLang,
    enableThoughtProcess,
    mvuDictionary,
    glossary,
    customPromptSuffix,
  } = options;

  const layers: string[] = [];

  // Layer 1: Core role (always)
  layers.push(buildCoreRole(targetLang, sourceLang));

  // Layer 2: Field-specific rules
  switch (fieldType) {
    case 'narrative':
      layers.push(buildNarrativeRules(sourceLang, targetLang));
      break;
    case 'regex':
      layers.push(buildRegexRules());
      layers.push(buildNarrativeRules(sourceLang, targetLang)); // Regex replaceString may have narrative
      break;
    case 'lorebook':
      layers.push(buildLorebookRules());
      layers.push(buildEjsRules());
      layers.push(buildNarrativeRules(sourceLang, targetLang));
      break;
    case 'ejs_code':
      layers.push(buildEjsRules());
      layers.push(buildRegexRules()); // TavernHelper may contain HTML with fonts
      break;
    case 'json_state':
      layers.push(buildLorebookRules()); // JSON key rules
      layers.push(buildEjsRules());     // Zod sync
      break;
    case 'mixed':
    default:
      // Include all relevant rules for mixed/unknown content
      layers.push(buildNarrativeRules(sourceLang, targetLang));
      layers.push(buildLorebookRules());
      layers.push(buildEjsRules());
      layers.push(buildRegexRules());
      break;
  }

  // Layer 3: Universal rules (always)
  layers.push(buildUniversalRules(targetLang));

  // Layer 4: Failure modes (always, but field-specific selection)
  layers.push(buildFailureModes(fieldType));

  // Layer 5: MVU sync block (if dictionary present)
  if (mvuDictionary && Object.keys(mvuDictionary).length > 0) {
    layers.push(buildMvuSyncBlock(mvuDictionary, fieldType));
  }

  // Layer 6: Glossary (if present)
  if (glossary && glossary.length > 0) {
    layers.push(buildGlossaryBlock(glossary));
  }

  // Layer 7: Thought process instructions (optional — expert mode)
  if (enableThoughtProcess) {
    layers.push(buildThoughtProcessInstructions());
  }

  // Custom suffix (user's additional instructions)
  if (customPromptSuffix?.trim()) {
    layers.push(`\nADDITIONAL INSTRUCTIONS:\n${customPromptSuffix.trim()}`);
  }

  return layers.join('\n');
}

/* ════════════════════════════════════════════════════════════════════
   XML RESPONSE PARSER — extractTranslationFromResponse()
   
   Extracts the <translation> content when AI responds with
   <thought_process>...</thought_process>
   <translation>...</translation>
   
   Falls back to the raw text if no XML tags are found.
   ════════════════════════════════════════════════════════════════════ */
export interface ParsedTranslationResponse {
  /** The extracted translation content */
  translation: string;
  /** The thought process reasoning (if present, for debug logging) */
  thoughtProcess?: string;
  /** Whether XML tags were found and used */
  usedXmlParsing: boolean;
}

export function extractTranslationFromResponse(raw: string): ParsedTranslationResponse {
  if (!raw || !raw.trim()) {
    return { translation: '', usedXmlParsing: false };
  }

  const trimmed = raw.trim();

  // Try to extract <translation> content
  const translationMatch = trimmed.match(/<translation>([\s\S]*?)<\/translation>/i);
  if (translationMatch) {
    const translation = translationMatch[1].trim();

    // Also extract thought process for debug logging
    const thoughtMatch = trimmed.match(/<thought_process>([\s\S]*?)<\/thought_process>/i);
    const thoughtProcess = thoughtMatch ? thoughtMatch[1].trim() : undefined;

    return {
      translation,
      thoughtProcess,
      usedXmlParsing: true,
    };
  }

  // Fallback: check for partial XML (only opening tag)
  const partialMatch = trimmed.match(/<translation>\s*([\s\S]+)$/i);
  if (partialMatch) {
    return {
      translation: partialMatch[1].trim(),
      usedXmlParsing: true,
    };
  }

  // No XML tags found — return raw text as-is (non-expert mode or model didn't follow format)
  return {
    translation: trimmed,
    usedXmlParsing: false,
  };
}

/* ════════════════════════════════════════════════════════════════════
   FIELD GROUP → FIELD TYPE MAPPING
   Maps UI field groups to translation field types
   ════════════════════════════════════════════════════════════════════ */
export function fieldGroupToFieldType(
  group: string,
  entryType?: string
): TranslationFieldType {
  switch (group) {
    case 'core':
    case 'messages':
    case 'creator':
    case 'lorebook_keys':
      return 'narrative';

    case 'regex':
      return 'regex';

    case 'tavern_helper':
      return 'ejs_code';

    case 'lorebook':
      // Sub-classify based on entry type
      if (entryType === 'initvar') return 'json_state';
      if (entryType === 'mvu_logic' || entryType === 'controller') return 'ejs_code';
      return 'lorebook'; // Default: mixed lorebook content

    case 'system':
    case 'depth_prompt':
      return 'mixed';

    default:
      return 'mixed';
  }
}
