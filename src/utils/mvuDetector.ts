import type { CharacterCard } from '../types/card';
import type { MvuZodSummary } from '../types/mvuZodTypes';
import { extractZodSchemas, getAllSchemaFieldNames } from './zodSchemaEngine';
import { hasJsonPatchOps } from './jsonPatchValidator';

/**
 * Auto-detect whether a card uses MVU/Zod architecture.
 * Checks for: Zod schema in TavernHelper, [initvar] entries, {{setvar}} macros, regex dashboards.
 */

export interface MvuCardSummary {
  isMvu: boolean;
  hasZodSchema: boolean;
  initvarCount: number;
  variableCount: number;
  regexDashboard: boolean;
  /** Confidence score 0-1 */
  confidence: number;
  reasons: string[];
}

/**
 * Quick check: is this an MVU/Zod card?
 */
export function isMvuCard(card: CharacterCard): boolean {
  return getMvuCardSummary(card).isMvu;
}

/**
 * Detailed analysis of MVU/Zod patterns in a card.
 */
export function getMvuCardSummary(card: CharacterCard): MvuCardSummary {
  const data = card.data;
  const result: MvuCardSummary = {
    isMvu: false,
    hasZodSchema: false,
    initvarCount: 0,
    variableCount: 0,
    regexDashboard: false,
    confidence: 0,
    reasons: [],
  };

  if (!data) return result;

  let score = 0;

  // ─── Check TavernHelper scripts for Zod schema ───
  const tavernHelper = data.extensions?.tavern_helper as { scripts?: { content: string }[] } | undefined;
  const scripts = tavernHelper?.scripts || (data.extensions?.TavernHelper_scripts as { content: string }[] | undefined) || [];
  
  for (const script of scripts) {
    if (!script.content) continue;
    // Zod patterns
    if (/z\.object\s*\(/.test(script.content)) {
      result.hasZodSchema = true;
      score += 3;
      result.reasons.push('Zod schema found in TavernHelper');
    }
    if (/z\.string\(\)|z\.number\(\)|z\.boolean\(\)|z\.enum\(/.test(script.content)) {
      score += 1;
    }
    // MVU update patterns
    if (/mvu_update|updateMVU|MVU|model-view-update/i.test(script.content)) {
      score += 2;
      result.reasons.push('MVU pattern found in TavernHelper');
    }
  }

  // ─── Check lorebook entries for [initvar] ───
  const entries = data.character_book?.entries || [];
  const varNames = new Set<string>();

  for (const entry of entries) {
    const content = entry.content || '';
    const comment = entry.comment || '';
    const name = entry.name || '';

    // [initvar] detection
    if (content.includes('[initvar]') || comment.toLowerCase().includes('initvar') || name.toLowerCase().includes('initvar')) {
      result.initvarCount++;
      score += 2;
      
      // Count YAML keys in initvar
      const yamlKeys = content.match(/^[\s]*([^\s:]+):/gm);
      if (yamlKeys) {
        for (const k of yamlKeys) {
          const key = k.replace(/^\s+/, '').replace(/:$/, '');
          if (key && !key.startsWith('[') && !key.startsWith('<') && !key.startsWith('#')) {
            varNames.add(key);
          }
        }
      }
    }

    // {{setvar/getvar}} macros
    const macros = content.match(/\{\{(?:setvar|getvar|addvar)::([^:}]+)/g);
    if (macros) {
      for (const m of macros) {
        const key = m.replace(/\{\{(?:setvar|getvar|addvar)::/, '');
        varNames.add(key);
      }
    }

    // MVU/controller entries
    if (/mvu|controller|variable/i.test(comment) || /mvu|controller|variable/i.test(name)) {
      score += 1;
    }
  }

  result.variableCount = varNames.size;
  if (varNames.size > 0) {
    result.reasons.push(`${varNames.size} unique variables detected`);
    score += Math.min(varNames.size / 5, 2); // Up to +2 for many vars
  }

  // ─── Check regex scripts for dashboard UI (data-var attributes) ───
  if (data.extensions?.regex_scripts) {
    for (const script of data.extensions.regex_scripts) {
      if (script.replaceString && /data-var\s*=/.test(script.replaceString)) {
        result.regexDashboard = true;
        score += 2;
        result.reasons.push('Regex dashboard with data-var found');
        break;
      }
    }
  }

  // ─── Compute final result ───
  result.confidence = Math.min(score / 8, 1); // Normalize to 0-1
  result.isMvu = score >= 3; // Threshold: at least Zod OR (initvar + vars)

  if (result.initvarCount > 0) {
    result.reasons.push(`${result.initvarCount} [initvar] entries`);
  }

  return result;
}

/* ═══════════════════════════════════════════════════════════════
   MVU-ZOD Enhanced Detection
   ═══════════════════════════════════════════════════════════════ */

/**
 * Extended detection with Zod schema extraction and JSON Patch support.
 * Backward-compatible: includes all legacy MvuCardSummary fields.
 */
export function getMvuZodSummary(card: CharacterCard): MvuZodSummary {
  const legacy = getMvuCardSummary(card);

  // Extract Zod schemas from TavernHelper
  const zodSchemas = extractZodSchemas(card);
  const allFieldNames = getAllSchemaFieldNames(zodSchemas);

  // Count lorebook entries with JSON Patch operations
  let jsonPatchEntries = 0;
  const entries = card.data?.character_book?.entries || [];
  for (const entry of entries) {
    if (entry.content && hasJsonPatchOps(entry.content)) {
      jsonPatchEntries++;
    }
  }

  // Detect structured output support
  const supportsStructuredOutput = zodSchemas.some(s => s.compiled && s.fields.length > 0);

  // Boost confidence if ZOD schemas are real
  let confidence = legacy.confidence;
  if (zodSchemas.length > 0 && zodSchemas.some(s => s.compiled)) {
    confidence = Math.min(confidence + 0.2, 1);
  }
  if (jsonPatchEntries > 0) {
    confidence = Math.min(confidence + 0.1, 1);
  }

  return {
    ...legacy,
    confidence,
    hasZodSchema: legacy.hasZodSchema || zodSchemas.some(s => s.compiled),
    zodSchemas,
    jsonPatchEntries,
    zodFieldCount: allFieldNames.length,
    supportsStructuredOutput,
    reasons: [
      ...legacy.reasons,
      ...(zodSchemas.length > 0 ? [`${zodSchemas.length} Zod schema(s) extracted (${allFieldNames.length} fields)`] : []),
      ...(jsonPatchEntries > 0 ? [`${jsonPatchEntries} JSON Patch entries detected`] : []),
    ],
  };
}

/**
 * Quick check: does this card contain JSON Patch operations?
 */
export function hasJsonPatchSupport(card: CharacterCard): boolean {
  const entries = card.data?.character_book?.entries || [];
  return entries.some(e => e.content && hasJsonPatchOps(e.content));
}
