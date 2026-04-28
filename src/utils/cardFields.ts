import type { CharacterCard, TranslationField, FieldGroup, FieldGroupConfig } from '../types/card';

/* ─── Default Field Group Configs ─── */
export const DEFAULT_FIELD_GROUPS: FieldGroupConfig[] = [
  { id: 'core', label: 'Core Fields', description: 'name, description, personality, scenario', enabled: true },
  { id: 'messages', label: 'Messages', description: 'first_mes, alternate_greetings, mes_example', enabled: true },
  { id: 'system', label: 'System Prompts', description: 'system_prompt, post_history_instructions', enabled: true },
  { id: 'creator', label: 'Creator Notes', description: 'creator_notes, creatorcomment', enabled: true },
  { id: 'lorebook', label: 'Lorebook Entries', description: 'character_book entries content + comment + name', enabled: true },
  { id: 'lorebook_keys', label: 'Lorebook Keys', description: 'character_book entries keywords + secondary_keys', enabled: true },
  { id: 'regex', label: 'Regex Scripts', description: 'replaceString, scriptName, findRegex, trimStrings', enabled: true },
  { id: 'depth_prompt', label: 'Depth Prompt', description: 'extensions.depth_prompt.prompt', enabled: true },
  { id: 'tavern_helper', label: 'TavernHelper Scripts', description: 'TavernHelper/JS-Slash-Runner script content', enabled: true },
];

/* ─── Language Options ─── */
export const SOURCE_LANGUAGES = [
  { value: 'auto', label: '🔍 Auto Detect' },
  { value: '中文', label: '🇨🇳 中文' },
  { value: 'English', label: '🇺🇸 English' },
  { value: '日本語', label: '🇯🇵 日本語' },
  { value: '한국어', label: '🇰🇷 한국어' },
  { value: 'Tiếng Việt', label: '🇻🇳 Tiếng Việt' },
  { value: 'Français', label: '🇫🇷 Français' },
  { value: 'Deutsch', label: '🇩🇪 Deutsch' },
  { value: 'Español', label: '🇪🇸 Español' },
  { value: 'Русский', label: '🇷🇺 Русский' },
];

export const TARGET_LANGUAGES = [
  { value: 'Tiếng Việt', label: '🇻🇳 Tiếng Việt' },
  { value: 'English', label: '🇺🇸 English' },
  { value: '日本語', label: '🇯🇵 日本語' },
  { value: '한국어', label: '🇰🇷 한국어' },
  { value: 'Français', label: '🇫🇷 Français' },
  { value: 'Deutsch', label: '🇩🇪 Deutsch' },
  { value: 'Español', label: '🇪🇸 Español' },
  { value: '中文', label: '🇨🇳 中文' },
  { value: 'Русский', label: '🇷🇺 Русский' },
];

/* ─── Helper: Set nested value ─── */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

/* ─── Check if text is only HTML/code (should not translate) ─── */
function isCodeOnly(text: string): boolean {
  const stripped = text
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/\s+/g, '')
    .trim();
  return stripped.length === 0;
}

/**
 * Check if text has translatable natural-language content.
 * Less aggressive than isCodeOnly — used for regex/TavernHelper content
 * that may have text embedded inside HTML tags or mixed with code.
 */
function hasTranslatableText(text: string): boolean {
  if (!text || typeof text !== 'string' || text.trim() === '') return false;
  // Strip pure code patterns
  let stripped = text
    .replace(/<style[\s\S]*?<\/style>/gi, '')  // remove style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '') // remove script blocks
    .replace(/<[^>]+>/g, '')                     // remove HTML tags
    .replace(/\{\{[^}]+\}\}/g, '')               // remove {{macros}}
    .replace(/<\|[^|]+\|>/g, '')                 // remove <|special|> tokens
    .replace(/[\{\}\[\]\(\);:,=<>!&|+\-*/%.#@~`"'\\]/g, '') // remove code symbols
    .replace(/\s+/g, ' ')
    .trim();
  // If remaining text has CJK characters, Cyrillic, or >10 chars of Latin text, it's translatable
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(stripped);
  const hasCyrillic = /[\u0400-\u04ff]/.test(stripped);
  const hasSubstantialLatin = stripped.replace(/[^a-zA-ZÀ-ÿ]/g, '').length > 10;
  return hasCJK || hasCyrillic || hasSubstantialLatin || stripped.length > 20;
}

/* ─── Classify lorebook entry type for MVU per-type strategy ─── */
type LorebookEntryType = 'initvar' | 'mvu_logic' | 'rules' | 'narrative' | 'controller';

function classifyLorebookEntry(entry: { name?: string; comment?: string; content?: string }): LorebookEntryType {
  const name = (entry.name || '').toLowerCase();
  const comment = (entry.comment || '').toLowerCase();
  const content = entry.content || '';

  // [initvar] — variable initialization YAML
  if (content.includes('[initvar]') || comment.includes('initvar') || name.includes('initvar') || name.includes('var_init')) {
    return 'initvar';
  }

  // Controller — MVU controller/update logic
  if (/controller|mvu_update|update_mvu/i.test(comment) || /controller|mvu_update/i.test(name)) {
    return 'controller';
  }

  // MVU logic — contains setvar/getvar/addvar macros or Zod patterns
  if (/mvu|zod|variable/i.test(comment) || /mvu|zod|variable/i.test(name)) {
    return 'mvu_logic';
  }
  
  // Check content for heavy macro usage (more than 3 setvar/getvar macros = probably logic)
  const macroCount = (content.match(/\{\{(?:setvar|getvar|addvar)::/g) || []).length;
  if (macroCount >= 3) {
    return 'mvu_logic';
  }

  // Rules / world info
  if (/rules|rule|world_info|system|guideline/i.test(comment) || /rules|rule|world_info/i.test(name)) {
    return 'rules';
  }

  return 'narrative';
}

/* ─── Extract translatable fields from a card ─── */
export function extractTranslatableFields(
  card: CharacterCard,
  enabledGroups: FieldGroup[]
): TranslationField[] {
  const fields: TranslationField[] = [];
  const data = card.data;

  function addField(path: string, label: string, group: FieldGroup, text: unknown, entryType?: LorebookEntryType) {
    if (!enabledGroups.includes(group)) return;
    if (typeof text !== 'string' || text.trim() === '') return;
    if (isCodeOnly(text)) return;
    fields.push({
      path,
      label,
      group,
      original: text,
      translated: '',
      status: 'pending',
      retries: 0,
      entryType,
    });
  }

  function addArrayField(basePath: string, label: string, group: FieldGroup, arr: unknown) {
    if (!enabledGroups.includes(group)) return;
    if (!Array.isArray(arr)) return;
    arr.forEach((item, i) => {
      if (typeof item === 'string' && item.trim() !== '' && !isCodeOnly(item)) {
        fields.push({
          path: `${basePath}[${i}]`,
          label: `${label}[${i}]`,
          group,
          original: item,
          translated: '',
          status: 'pending',
          retries: 0,
        });
      }
    });
  }

  // Root level
  addField('name', 'name', 'core', card.name);
  addField('description', 'description', 'core', card.description);
  addField('personality', 'personality', 'core', card.personality);
  addField('scenario', 'scenario', 'core', card.scenario);
  addField('first_mes', 'first_mes', 'messages', card.first_mes);
  addField('mes_example', 'mes_example', 'messages', card.mes_example);
  addField('creatorcomment', 'creatorcomment', 'creator', card.creatorcomment);

  if (!data) return fields;

  // Data level
  addField('data.name', 'data.name', 'core', data.name);
  addField('data.description', 'data.description', 'core', data.description);
  addField('data.personality', 'data.personality', 'core', data.personality);
  addField('data.scenario', 'data.scenario', 'core', data.scenario);
  addField('data.first_mes', 'data.first_mes', 'messages', data.first_mes);
  addField('data.mes_example', 'data.mes_example', 'messages', data.mes_example);
  addField('data.creator_notes', 'data.creator_notes', 'creator', data.creator_notes);
  addField('data.system_prompt', 'data.system_prompt', 'system', data.system_prompt);
  addField('data.system_prompts', 'data.system_prompts', 'system', data.system_prompts);
  addField('data.post_history_instructions', 'data.post_history_instructions', 'system', data.post_history_instructions);

  // Alternate greetings
  addArrayField('data.alternate_greetings', 'data.alternate_greetings', 'messages', data.alternate_greetings);

  // Group only greetings
  addArrayField('data.group_only_greetings', 'data.group_only_greetings', 'messages', data.group_only_greetings);

  // Character book entries — with MVU entry classification
  if (data.character_book) {
    addField('data.character_book.name', 'lorebook.name', 'lorebook', data.character_book.name);
    addField('data.character_book.description', 'lorebook.description', 'lorebook', data.character_book.description);

    if (data.character_book.entries) {
      data.character_book.entries.forEach((entry, i) => {
        const eType = classifyLorebookEntry(entry);
        const typeTag = eType !== 'narrative' ? ` [${eType}]` : '';

        // Entry name (display name)
        addField(
          `data.character_book.entries[${i}].name`,
          `lorebook[${i}].name${typeTag}`,
          'lorebook',
          entry.name,
          eType
        );
        addField(
          `data.character_book.entries[${i}].content`,
          `lorebook[${i}].content${typeTag}`,
          'lorebook',
          entry.content,
          eType
        );
        addField(
          `data.character_book.entries[${i}].comment`,
          `lorebook[${i}].comment${typeTag}`,
          'lorebook',
          entry.comment,
          eType
        );
        // Primary keys as joined string
        if (enabledGroups.includes('lorebook_keys') && Array.isArray(entry.keys) && entry.keys.length > 0) {
          const keysText = entry.keys.join(', ');
          if (keysText.trim()) {
            fields.push({
              path: `data.character_book.entries[${i}].keys`,
              label: `lorebook[${i}].keys${typeTag}`,
              group: 'lorebook_keys',
              original: keysText,
              translated: '',
              status: 'pending',
              retries: 0,
              entryType: eType,
            });
          }
        }
        // Secondary keys as joined string
        if (enabledGroups.includes('lorebook_keys') && Array.isArray(entry.secondary_keys) && entry.secondary_keys.length > 0) {
          const secKeysText = entry.secondary_keys.join(', ');
          if (secKeysText.trim()) {
            fields.push({
              path: `data.character_book.entries[${i}].secondary_keys`,
              label: `lorebook[${i}].secondary_keys${typeTag}`,
              group: 'lorebook_keys',
              original: secKeysText,
              translated: '',
              status: 'pending',
              retries: 0,
              entryType: eType,
            });
          }
        }
      });
    }
  }

  // Depth prompt
  if (data.extensions?.depth_prompt) {
    addField(
      'data.extensions.depth_prompt.prompt',
      'depth_prompt.prompt',
      'depth_prompt',
      data.extensions.depth_prompt.prompt
    );
  }

  // Regex scripts — extract all translatable sub-fields
  if (data.extensions?.regex_scripts) {
    data.extensions.regex_scripts.forEach((script, i) => {
      addField(
        `data.extensions.regex_scripts[${i}].scriptName`,
        `regex[${i}].scriptName`,
        'regex',
        script.scriptName
      );
      // Regex pattern itself (sometimes contains natural language text to match)
      if (enabledGroups.includes('regex') && typeof script.findRegex === 'string' && script.findRegex.trim() !== '') {
        fields.push({
          path: `data.extensions.regex_scripts[${i}].findRegex`,
          label: `regex[${i}].findRegex`,
          group: 'regex',
          original: script.findRegex,
          translated: '',
          status: 'pending',
          retries: 0,
        });
      }
      // replaceString
      if (enabledGroups.includes('regex') && typeof script.replaceString === 'string' && script.replaceString.trim() !== '') {
        fields.push({
          path: `data.extensions.regex_scripts[${i}].replaceString`,
          label: `regex[${i}].replaceString`,
          group: 'regex',
          original: script.replaceString,
          translated: '',
          status: 'pending',
          retries: 0,
        });
      }
      // trimStrings — array of strings to trim from output
      if (enabledGroups.includes('regex') && Array.isArray(script.trimStrings)) {
        script.trimStrings.forEach((trimStr, j) => {
          if (typeof trimStr === 'string' && trimStr.trim() !== '' && hasTranslatableText(trimStr)) {
            fields.push({
              path: `data.extensions.regex_scripts[${i}].trimStrings[${j}]`,
              label: `regex[${i}].trimStrings[${j}]`,
              group: 'regex',
              original: trimStr,
              translated: '',
              status: 'pending',
              retries: 0,
            });
          }
        });
      }
    });
  }

  // TavernHelper scripts (JS-Slash-Runner)
  // New format: data.extensions.tavern_helper.scripts[]
  const tavernHelper = data.extensions?.tavern_helper as { scripts?: { name?: string; content: string; enabled?: boolean }[] } | undefined;
  if (tavernHelper?.scripts) {
    tavernHelper.scripts.forEach((script, i) => {
      if (enabledGroups.includes('tavern_helper') && typeof script.content === 'string' && script.content.trim() !== '') {
        if (hasTranslatableText(script.content)) {
          fields.push({
            path: `data.extensions.tavern_helper.scripts[${i}].content`,
            label: `tavernHelper[${i}].content${script.name ? ` (${script.name})` : ''}`,
            group: 'tavern_helper',
            original: script.content,
            translated: '',
            status: 'pending',
            retries: 0,
          });
        }
      }
    });
  }
  // Legacy format: data.extensions.TavernHelper_scripts[]
  const tavernHelperLegacy = data.extensions?.TavernHelper_scripts as { name?: string; content: string; enabled?: boolean }[] | undefined;
  if (Array.isArray(tavernHelperLegacy)) {
    tavernHelperLegacy.forEach((script, i) => {
      if (enabledGroups.includes('tavern_helper') && typeof script.content === 'string' && script.content.trim() !== '') {
        if (hasTranslatableText(script.content)) {
          fields.push({
            path: `data.extensions.TavernHelper_scripts[${i}].content`,
            label: `tavernHelper_legacy[${i}].content${script.name ? ` (${script.name})` : ''}`,
            group: 'tavern_helper',
            original: script.content,
            translated: '',
            status: 'pending',
            retries: 0,
          });
        }
      }
    });
  }

  return fields;
}

/* ─── Apply translations back to the card JSON ─── */
export function applyTranslationsToCard(
  card: CharacterCard,
  fields: TranslationField[],
  exportKeyMode: 'merge' | 'translated_only' | 'original_only' = 'merge'
): CharacterCard {
  // Deep clone
  const result = JSON.parse(JSON.stringify(card)) as Record<string, unknown>;

  for (const field of fields) {
    if (field.status !== 'done' || !field.translated) continue;

    // Special handling for lorebook keys AND secondary_keys (array of strings)
    if (field.path.endsWith('.keys') || field.path.endsWith('.secondary_keys')) {
      const translatedKeys = field.translated.split(',').map(k => k.trim()).filter(Boolean);
      const originalKeys = field.original.split(',').map(k => k.trim()).filter(Boolean);

      let finalKeys: string[];
      switch (exportKeyMode) {
        case 'translated_only':
          finalKeys = translatedKeys;
          break;
        case 'original_only':
          finalKeys = originalKeys;
          break;
        case 'merge':
        default:
          // MERGE: keep original keys + add translated keys (deduplicate)
          // This ensures SillyTavern triggers work in BOTH original and translated languages
          finalKeys = [...new Set([...originalKeys, ...translatedKeys])];
          break;
      }
      setNestedValue(result, field.path, finalKeys);
    } else {
      setNestedValue(result, field.path, field.translated);
    }
  }

  return result as CharacterCard;
}

/* ─── Validate if JSON is a valid SillyTavern card ─── */
export function validateCard(json: unknown): { valid: boolean; error?: string } {
  if (!json || typeof json !== 'object') {
    return { valid: false, error: 'Invalid JSON: not an object' };
  }
  const obj = json as Record<string, unknown>;

  const hasSpec = typeof obj.spec === 'string';
  const hasFirstMes = typeof obj.first_mes === 'string';
  const hasData = obj.data && typeof obj.data === 'object';
  const hasCharBook = hasData && (obj.data as Record<string, unknown>).character_book != null;
  const hasDataFirstMes = hasData && typeof (obj.data as Record<string, unknown>).first_mes === 'string';

  if (!hasSpec && !hasFirstMes && !hasCharBook && !hasDataFirstMes) {
    return {
      valid: false,
      error: 'Not a SillyTavern card: missing spec, first_mes, or data.character_book',
    };
  }

  return { valid: true };
}

/* ─── Get card summary info ─── */
export function getCardSummary(card: CharacterCard) {
  const name = card.data?.name || card.name || 'Unknown';
  const lorebookCount = card.data?.character_book?.entries?.length ?? 0;
  const altGreetingsCount = card.data?.alternate_greetings?.length ?? 0;
  const regexCount = card.data?.extensions?.regex_scripts?.length ?? 0;
  const hasDepthPrompt = !!card.data?.extensions?.depth_prompt?.prompt;
  const spec = card.spec || 'unknown';
  const tavernHelperCount = 
    ((card.data?.extensions?.tavern_helper as any)?.scripts?.length ?? 0) + 
    (Array.isArray(card.data?.extensions?.TavernHelper_scripts) ? (card.data.extensions!.TavernHelper_scripts as any[]).length : 0);

  return { name, lorebookCount, altGreetingsCount, regexCount, hasDepthPrompt, spec, tavernHelperCount };
}
