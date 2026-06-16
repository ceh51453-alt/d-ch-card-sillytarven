/* ─── Preset Parser Utility ─── */
import type { STPreset, PresetPromptEntry, ProxySettings } from '../types/card';

/**
 * Validate and parse raw JSON into STPreset.
 * Returns null if the JSON is not a valid SillyTavern preset.
 */
export function parsePresetJSON(raw: unknown): STPreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // A valid ST preset must have at least one of these distinguishing features
  const hasPrompts = Array.isArray(obj.prompts);
  const hasTemperature = typeof obj.temperature === 'number';
  const hasMaxTokens = typeof obj.openai_max_tokens === 'number';

  if (!hasPrompts && !hasTemperature && !hasMaxTokens) return null;

  return obj as unknown as STPreset;
}

/**
 * Extract AI parameters from preset → Partial<ProxySettings>
 */
export function extractAIParams(preset: STPreset): Partial<ProxySettings> {
  const params: Partial<ProxySettings> = {};

  if (typeof preset.temperature === 'number') params.temperature = preset.temperature;
  if (typeof preset.top_p === 'number') params.topP = preset.top_p;
  if (typeof preset.top_k === 'number') params.topK = preset.top_k;
  if (typeof preset.min_p === 'number') params.minP = preset.min_p;
  if (typeof preset.frequency_penalty === 'number') params.frequencyPenalty = preset.frequency_penalty;
  if (typeof preset.presence_penalty === 'number') params.presencePenalty = preset.presence_penalty;
  if (typeof preset.repetition_penalty === 'number') params.repetitionPenalty = preset.repetition_penalty;
  if (typeof preset.openai_max_tokens === 'number') params.maxTokens = preset.openai_max_tokens;
  if (typeof preset.stream_openai === 'boolean') params.useStream = preset.stream_openai;

  return params;
}

/**
 * Get enabled prompts from preset, filtered and ordered by prompt_order.
 * If prompt_order is missing, return all enabled prompts.
 */
export function getEnabledPrompts(preset: STPreset): PresetPromptEntry[] {
  if (!preset.prompts || !Array.isArray(preset.prompts)) return [];

  const prompts = preset.prompts.filter(p => p && typeof p === 'object');

  if (!preset.prompt_order || !Array.isArray(preset.prompt_order)) {
    return prompts.filter(p => p.enabled !== false);
  }

  // SillyTavern prompt_order can be:
  // 1) Flat: [{ identifier, enabled }, ...]
  // 2) Nested: [{ character_id, order: [{ identifier, enabled }, ...] }, ...]
  // Flatten both formats into a single list of { identifier, enabled } entries
  const flatEntries: Array<{ identifier: string; enabled?: boolean }> = [];
  for (const item of preset.prompt_order) {
    if (!item || typeof item !== 'object') continue;
    if (Array.isArray((item as any).order)) {
      // Nested format: { character_id, order: [...] }
      for (const entry of (item as any).order) {
        if (entry && typeof entry === 'object' && entry.identifier) {
          flatEntries.push(entry);
        }
      }
    } else if ((item as any).identifier) {
      // Flat format: { identifier, enabled }
      flatEntries.push(item as any);
    }
  }

  // Build a set of enabled identifiers
  const orderMap = new Map<string, number>();
  flatEntries.forEach((entry, idx) => {
    if (entry.enabled !== false) {
      orderMap.set(entry.identifier, idx);
    }
  });

  // Filter prompts that are in the enabled order list AND self-enabled
  const ordered = prompts
    .filter(p => p.enabled !== false && orderMap.has(p.identifier))
    .sort((a, b) => (orderMap.get(a.identifier) ?? 0) - (orderMap.get(b.identifier) ?? 0));

  return ordered;
}

/**
 * Get all prompts (enabled or disabled) from preset.
 */
export function getAllPrompts(preset: STPreset): PresetPromptEntry[] {
  if (!preset.prompts || !Array.isArray(preset.prompts)) return [];
  return preset.prompts.filter(p => p && typeof p === 'object');
}

/**
 * Filter prompts by role.
 */
export function getPromptsByRole(preset: STPreset, role: string): PresetPromptEntry[] {
  return getAllPrompts(preset).filter(p => p.role === role);
}

/**
 * Build a combined content block from selected prompts, ready for injection.
 * Each prompt is wrapped with a comment header showing its name and role.
 */
export function buildInjectionContent(prompts: PresetPromptEntry[]): string {
  if (!prompts.length) return '';

  return prompts
    .map(p => {
      const header = `<!-- [Preset Prompt: ${p.name}] (role: ${p.role}) -->`;
      return `${header}\n${p.content}`;
    })
    .join('\n\n');
}

/**
 * Summary of a preset for display purposes.
 */
export interface PresetSummary {
  totalPrompts: number;
  enabledPrompts: number;
  params: Record<string, number | boolean>;
  hasPromptOrder: boolean;
}

export function getPresetSummary(preset: STPreset): PresetSummary {
  const allPrompts = getAllPrompts(preset);
  const enabledPrompts = getEnabledPrompts(preset);
  const params: Record<string, number | boolean> = {};

  if (preset.temperature !== undefined) params.temperature = preset.temperature;
  if (preset.top_p !== undefined) params.top_p = preset.top_p;
  if (preset.top_k !== undefined) params.top_k = preset.top_k;
  if (preset.min_p !== undefined) params.min_p = preset.min_p;
  if (preset.frequency_penalty !== undefined) params.frequency_penalty = preset.frequency_penalty;
  if (preset.presence_penalty !== undefined) params.presence_penalty = preset.presence_penalty;
  if (preset.repetition_penalty !== undefined) params.repetition_penalty = preset.repetition_penalty;
  if (preset.openai_max_tokens !== undefined) params.max_tokens = preset.openai_max_tokens;
  if (preset.openai_max_context !== undefined) params.max_context = preset.openai_max_context;
  if (preset.stream_openai !== undefined) params.stream = preset.stream_openai;

  return {
    totalPrompts: allPrompts.length,
    enabledPrompts: enabledPrompts.length,
    params,
    hasPromptOrder: Array.isArray(preset.prompt_order) && preset.prompt_order.length > 0,
  };
}

/**
 * Build the combined content of all enabled prompts from an active preset.
 * Returns undefined if no content to inject (no preset, no enabled prompts, or all empty).
 */
export function getActivePresetPromptContent(preset: STPreset | undefined | null): string | undefined {
  if (!preset) return undefined;
  const enabled = getEnabledPrompts(preset);
  if (enabled.length === 0) return undefined;
  const content = buildInjectionContent(enabled);
  return content.trim() || undefined;
}
