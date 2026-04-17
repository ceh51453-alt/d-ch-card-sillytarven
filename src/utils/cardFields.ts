import type { CharacterCard, TranslationField, FieldGroup, FieldGroupConfig } from '../types/card';

/* ─── Default Field Group Configs ─── */
export const DEFAULT_FIELD_GROUPS: FieldGroupConfig[] = [
  { id: 'core', label: 'Core Fields', description: 'name, description, personality, scenario', enabled: true },
  { id: 'messages', label: 'Messages', description: 'first_mes, alternate_greetings, mes_example', enabled: true },
  { id: 'system', label: 'System Prompts', description: 'system_prompt, post_history_instructions', enabled: true },
  { id: 'creator', label: 'Creator Notes', description: 'creator_notes, creatorcomment', enabled: true },
  { id: 'lorebook', label: 'Lorebook Entries', description: 'character_book entries content + comment', enabled: true },
  { id: 'lorebook_keys', label: 'Lorebook Keys', description: 'character_book entries keywords', enabled: true },
  { id: 'regex', label: 'Regex Scripts', description: 'replaceString, scriptName', enabled: true },
  { id: 'depth_prompt', label: 'Depth Prompt', description: 'extensions.depth_prompt.prompt', enabled: true },
];

/* ─── Target Language Options ─── */
export const TARGET_LANGUAGES = [
  { value: 'Tiếng Việt', label: '🇻🇳 Tiếng Việt' },
  { value: 'English', label: '🇺🇸 English' },
  { value: '日本語', label: '🇯🇵 日本語' },
  { value: '한국어', label: '🇰🇷 한국어' },
  { value: 'Français', label: '🇫🇷 Français' },
  { value: 'Deutsch', label: '🇩🇪 Deutsch' },
  { value: 'Español', label: '🇪🇸 Español' },
  { value: '中文', label: '🇨🇳 中文' },
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

/* ─── Extract translatable fields from a card ─── */
export function extractTranslatableFields(
  card: CharacterCard,
  enabledGroups: FieldGroup[]
): TranslationField[] {
  const fields: TranslationField[] = [];
  const data = card.data;

  function addField(path: string, label: string, group: FieldGroup, text: unknown) {
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

  // Character book entries
  if (data.character_book?.entries) {
    data.character_book.entries.forEach((entry, i) => {
      addField(
        `data.character_book.entries[${i}].content`,
        `lorebook[${i}].content`,
        'lorebook',
        entry.content
      );
      addField(
        `data.character_book.entries[${i}].comment`,
        `lorebook[${i}].comment`,
        'lorebook',
        entry.comment
      );
      // Keys as joined string
      if (enabledGroups.includes('lorebook_keys') && Array.isArray(entry.keys) && entry.keys.length > 0) {
        const keysText = entry.keys.join(', ');
        if (keysText.trim()) {
          fields.push({
            path: `data.character_book.entries[${i}].keys`,
            label: `lorebook[${i}].keys`,
            group: 'lorebook_keys',
            original: keysText,
            translated: '',
            status: 'pending',
            retries: 0,
          });
        }
      }
    });
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

  // Regex scripts
  if (data.extensions?.regex_scripts) {
    data.extensions.regex_scripts.forEach((script, i) => {
      addField(
        `data.extensions.regex_scripts[${i}].scriptName`,
        `regex[${i}].scriptName`,
        'regex',
        script.scriptName
      );
      addField(
        `data.extensions.regex_scripts[${i}].replaceString`,
        `regex[${i}].replaceString`,
        'regex',
        script.replaceString
      );
    });
  }

  return fields;
}

/* ─── Apply translations back to the card JSON ─── */
export function applyTranslationsToCard(
  card: CharacterCard,
  fields: TranslationField[]
): CharacterCard {
  // Deep clone
  const result = JSON.parse(JSON.stringify(card)) as Record<string, unknown>;

  for (const field of fields) {
    if (field.status !== 'done' || !field.translated) continue;

    // Special handling for lorebook keys (array of strings)
    if (field.path.endsWith('.keys')) {
      const keys = field.translated.split(',').map(k => k.trim()).filter(Boolean);
      setNestedValue(result, field.path, keys);
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

  return { name, lorebookCount, altGreetingsCount, regexCount, hasDepthPrompt, spec };
}
