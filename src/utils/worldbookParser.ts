/* ─── Worldbook (World Info) Parser ───
 * Handles standalone worldbook JSON files from SillyTavern.
 * Converts between worldbook format ↔ pseudo CharacterCard for reuse
 * of the existing translation pipeline.
 *
 * Key differences from character_book:
 *   - entries is Object {"0": {...}} not Array [{...}]
 *   - key (array) vs keys (array)
 *   - keysecondary (array) vs secondary_keys (array)
 *   - disable (bool) vs enabled (bool, inverted)
 *   - order (number) vs insertion_order (number)
 */

import type { CharacterCard, CharacterBookEntry } from '../types/card';

/* ─── Worldbook Entry (standalone format) ─── */
export interface WorldbookEntry {
  uid?: number;
  key: string[];
  keysecondary?: string[];
  comment: string;
  content: string;
  name?: string;
  constant?: boolean;
  selective?: boolean;
  order?: number;
  position?: number | string;
  disable?: boolean;
  excludeRecursion?: boolean;
  preventRecursion?: boolean;
  delayUntilRecursion?: boolean;
  probability?: number;
  useProbability?: boolean;
  depth?: number;
  selectiveLogic?: number;
  group?: string;
  scanDepth?: number | null;
  caseSensitive?: boolean | null;
  matchWholeWords?: boolean | null;
  automationId?: string;
  role?: number | null;
  vectorized?: boolean;
  displayIndex?: number;
  groupOverride?: boolean;
  groupWeight?: number;
  sticky?: number | null;
  cooldown?: number | null;
  delay?: number | null;
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Worldbook {
  entries: Record<string, WorldbookEntry>;
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

/* ─── Detection ─── */

/**
 * Check if a parsed JSON object is a standalone worldbook format.
 * Worldbooks have `entries` as an Object (not Array) and lack card-specific fields.
 */
export function isWorldbookFormat(json: unknown): json is Worldbook {
  if (!json || typeof json !== 'object') return false;
  const obj = json as Record<string, unknown>;

  // Must have entries
  if (!obj.entries || typeof obj.entries !== 'object') return false;

  // entries must be an object (not array) — this is the key differentiator
  if (Array.isArray(obj.entries)) return false;

  // Should NOT have card-specific fields
  if (typeof obj.spec === 'string') return false;
  if (typeof obj.first_mes === 'string') return false;
  if (obj.data && typeof obj.data === 'object' && typeof (obj.data as any).first_mes === 'string') return false;

  // Validate at least one entry has worldbook structure (key array, content string)
  const entryKeys = Object.keys(obj.entries);
  if (entryKeys.length === 0) return false;

  const firstEntry = (obj.entries as Record<string, unknown>)[entryKeys[0]];
  if (!firstEntry || typeof firstEntry !== 'object') return false;

  const entry = firstEntry as Record<string, unknown>;
  // Worldbook entries typically have `key` (array) and `content` (string)
  const hasKeyArray = Array.isArray(entry.key);
  const hasContent = typeof entry.content === 'string';

  return hasKeyArray || hasContent;
}

/* ─── Worldbook → Pseudo-Card Conversion ─── */

/**
 * Convert a standalone worldbook to a pseudo CharacterCard structure
 * so it can flow through the existing translation pipeline.
 */
export function worldbookToCard(worldbook: Worldbook, fileName?: string): CharacterCard {
  // Convert entries object → array, mapping field names
  const entriesObj = worldbook.entries || {};
  const sortedKeys = Object.keys(entriesObj).sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  const entries: CharacterBookEntry[] = sortedKeys.map((key) => {
    const wb = entriesObj[key];
    return worldbookEntryToCardEntry(wb, key);
  });

  const wbName = worldbook.name || fileName?.replace(/\.json$/i, '') || 'Worldbook';

  const card: CharacterCard = {
    name: wbName,
    spec: 'worldbook', // Marker to identify as worldbook-origin
    spec_version: '1.0',
    data: {
      name: wbName,
      description: worldbook.description || '',
      first_mes: '',
      mes_example: '',
      personality: '',
      scenario: '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      character_book: {
        name: worldbook.name,
        description: worldbook.description,
        scan_depth: worldbook.scan_depth,
        token_budget: worldbook.token_budget,
        recursive_scanning: worldbook.recursive_scanning,
        extensions: worldbook.extensions,
        entries,
      },
    },
  };

  return card;
}

/** Convert a single worldbook entry to character_book entry format */
function worldbookEntryToCardEntry(wb: WorldbookEntry, originalKey: string): CharacterBookEntry {
  const entry: CharacterBookEntry = {
    // Map field names
    keys: Array.isArray(wb.key) ? [...wb.key] : [],
    secondary_keys: Array.isArray(wb.keysecondary) ? [...wb.keysecondary] : [],
    comment: wb.comment || '',
    content: wb.content || '',
    name: wb.name,
    constant: wb.constant,
    selective: wb.selective,
    insertion_order: wb.order,
    enabled: wb.disable != null ? !wb.disable : true,
    position: typeof wb.position === 'number' ? String(wb.position) : wb.position as string | undefined,
    extensions: wb.extensions,
    // Preserve original data for round-trip
    _wb_original_key: originalKey,
    _wb_uid: wb.uid,
  };

  // Copy all other fields for round-trip fidelity
  const knownFields = new Set([
    'key', 'keysecondary', 'comment', 'content', 'name', 'constant',
    'selective', 'order', 'position', 'disable', 'extensions', 'uid',
  ]);

  for (const [k, v] of Object.entries(wb)) {
    if (!knownFields.has(k)) {
      entry[`_wb_${k}`] = v;
    }
  }

  return entry;
}

/* ─── Pseudo-Card → Worldbook Conversion ─── */

/**
 * Convert a translated pseudo-card back to worldbook format.
 * Uses the original worldbook as base to preserve non-translatable fields.
 */
export function cardToWorldbook(
  card: CharacterCard,
  originalWorldbook: Worldbook
): Worldbook {
  const result: Worldbook = JSON.parse(JSON.stringify(originalWorldbook));
  const translatedEntries = card.data?.character_book?.entries || [];

  // Update worldbook name/description if translated
  if (card.data?.character_book?.name) {
    result.name = card.data.character_book.name;
  }
  if (card.data?.character_book?.description) {
    result.description = card.data.character_book.description;
  }

  // Map translated entries back to worldbook format
  for (const entry of translatedEntries) {
    const originalKey = (entry as any)._wb_original_key as string | undefined;
    if (originalKey == null || !result.entries[originalKey]) continue;

    const target = result.entries[originalKey];

    // Map translated fields back
    target.content = entry.content;
    target.comment = entry.comment;
    if (entry.name != null) target.name = entry.name;

    // Map keys back
    if (Array.isArray(entry.keys)) {
      target.key = [...entry.keys];
    }
    if (Array.isArray(entry.secondary_keys)) {
      target.keysecondary = [...entry.secondary_keys];
    }
  }

  return result;
}

/* ─── Worldbook Summary ─── */

export function getWorldbookSummary(worldbook: Worldbook) {
  const entryKeys = Object.keys(worldbook.entries || {});
  const entryCount = entryKeys.length;
  const name = worldbook.name || 'Unnamed Worldbook';

  // Count entries with content
  let withContent = 0;
  let totalContentLength = 0;
  for (const key of entryKeys) {
    const entry = worldbook.entries[key];
    if (entry.content && entry.content.trim()) {
      withContent++;
      totalContentLength += entry.content.length;
    }
  }

  return {
    name,
    entryCount,
    withContent,
    totalContentLength,
    hasDescription: !!worldbook.description,
  };
}
