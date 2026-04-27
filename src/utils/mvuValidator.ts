/**
 * MVU Variable Integrity Validator
 * 
 * Validates that MVU/Zod variables are correctly replaced in translated text.
 * Runs after each field is translated to catch:
 * 1. Original variable names still present (should have been translated)
 * 2. Expected translated names missing (AI forgot to include)
 * 3. Structural integrity (YAML format, macro syntax preserved)
 */

export interface MvuValidationResult {
  valid: boolean;
  /** Original keys still found in translated text (should have been replaced) */
  unreplaced: string[];
  /** Translated keys found (correctly replaced) */
  replaced: string[];
  /** Warnings (non-critical issues) */
  warnings: string[];
  /** Summary message */
  summary: string;
}

/**
 * Validate that MVU variables are correctly replaced in the translated text.
 * 
 * @param original - Original (untranslated) text
 * @param translated - Translated text
 * @param dictionary - MVU dictionary (original → translated key names)
 * @param fieldType - Type of field for context-specific checks
 */
export function validateMvuVariables(
  original: string,
  translated: string,
  dictionary: Record<string, string>,
  fieldType?: 'initvar' | 'mvu_logic' | 'rules' | 'narrative' | 'controller' | 'tavern_helper' | 'regex'
): MvuValidationResult {
  const result: MvuValidationResult = {
    valid: true,
    unreplaced: [],
    replaced: [],
    warnings: [],
    summary: '',
  };

  if (!translated || !dictionary || Object.keys(dictionary).length === 0) {
    result.summary = 'No dictionary to validate against';
    return result;
  }

  const entries = Object.entries(dictionary).filter(([k, v]) => k && v && k !== v);
  if (entries.length === 0) {
    result.summary = 'Dictionary has no translatable entries';
    return result;
  }

  const isCodeField = fieldType === 'initvar' || fieldType === 'mvu_logic' || 
                      fieldType === 'tavern_helper' || fieldType === 'regex' || fieldType === 'controller';

  for (const [originalKey, translatedKey] of entries) {
    // Check if original key was present in the source text
    const originalHadKey = original.includes(originalKey);
    if (!originalHadKey) continue; // Key wasn't in original, skip

    // Check if original key is STILL in translated text (bad — should be replaced)
    const translatedStillHasOriginal = translated.includes(originalKey);
    
    // Check if translated key is in the output (good — was replaced)
    const translatedHasNewKey = translated.includes(translatedKey);

    if (translatedStillHasOriginal && !translatedHasNewKey) {
      // Original key present but translated key absent → unreplaced
      result.unreplaced.push(originalKey);
      result.valid = false;
    } else if (translatedHasNewKey) {
      result.replaced.push(originalKey);
    } else if (!translatedStillHasOriginal && !translatedHasNewKey) {
      // Neither found — variable might have been removed entirely
      if (isCodeField) {
        result.warnings.push(`Variable "${originalKey}" disappeared from translation`);
      }
    }

    // Edge case: both original AND translated present (partial replacement)
    if (translatedStillHasOriginal && translatedHasNewKey) {
      result.warnings.push(`Variable "${originalKey}" partially replaced — both original and translated versions present`);
    }
  }

  // ─── Structural checks for specific field types ───
  if (fieldType === 'initvar') {
    // Check YAML structure preservation
    const originalLineCount = original.split('\n').length;
    const translatedLineCount = translated.split('\n').length;
    if (Math.abs(originalLineCount - translatedLineCount) > originalLineCount * 0.3) {
      result.warnings.push(`YAML structure may be broken: ${originalLineCount} → ${translatedLineCount} lines`);
    }
  }

  // ─── Check macro syntax integrity ───
  const originalMacros = (original.match(/\{\{(?:getvar|setvar|addvar)::([^}]+)\}\}/g) || []).length;
  const translatedMacros = (translated.match(/\{\{(?:getvar|setvar|addvar)::([^}]+)\}\}/g) || []).length;
  if (originalMacros > 0 && translatedMacros === 0) {
    result.warnings.push(`All ${originalMacros} macros disappeared from translation`);
    result.valid = false;
  } else if (Math.abs(originalMacros - translatedMacros) > 2) {
    result.warnings.push(`Macro count changed significantly: ${originalMacros} → ${translatedMacros}`);
  }

  // Build summary
  const parts: string[] = [];
  if (result.replaced.length > 0) parts.push(`${result.replaced.length} ✅`);
  if (result.unreplaced.length > 0) parts.push(`${result.unreplaced.length} ❌`);
  if (result.warnings.length > 0) parts.push(`${result.warnings.length} ⚠️`);
  result.summary = parts.join(' | ') || 'OK';

  return result;
}

/**
 * Auto-fix unreplaced variables in translated text using the dictionary.
 * Only applies to code fields (not narrative) where aggressive replacement is safe.
 */
export function autoFixMvuVariables(
  translated: string,
  dictionary: Record<string, string>,
  unreplacedKeys: string[]
): string {
  if (unreplacedKeys.length === 0) return translated;

  let fixed = translated;
  // Sort by length descending to avoid partial replacements
  const sortedKeys = [...unreplacedKeys].sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const replacement = dictionary[key];
    if (!replacement || key === replacement) continue;

    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isAscii = /^[a-zA-Z0-9_]+$/.test(key);
    const regex = isAscii
      ? new RegExp(`\\b${escaped}\\b`, 'g')
      : new RegExp(escaped, 'g');

    fixed = fixed.replace(regex, replacement);
  }

  return fixed;
}

/**
 * Generate a final sync verification report comparing original and translated card.
 * Returns a summary of variable replacement status across all translated fields.
 */
export function generateSyncReport(
  fields: { original: string; translated: string; label: string; group: string; entryType?: string }[],
  dictionary: Record<string, string>
): { totalVars: number; replaced: number; unreplaced: number; warnings: string[]; details: string[] } {
  const entries = Object.entries(dictionary).filter(([k, v]) => k && v && k !== v);
  if (entries.length === 0) return { totalVars: 0, replaced: 0, unreplaced: 0, warnings: [], details: [] };

  const globalReplaced = new Set<string>();
  const globalUnreplaced = new Set<string>();
  const warnings: string[] = [];
  const details: string[] = [];

  for (const field of fields) {
    if (!field.translated) continue;

    const fieldType = (field.entryType || field.group) as any;
    const validation = validateMvuVariables(field.original, field.translated, dictionary, fieldType);

    for (const k of validation.replaced) globalReplaced.add(k);
    for (const k of validation.unreplaced) {
      globalUnreplaced.add(k);
      details.push(`❌ "${k}" unreplaced in ${field.label}`);
    }
    for (const w of validation.warnings) {
      warnings.push(`${field.label}: ${w}`);
    }
  }

  // Remove from unreplaced if it was replaced elsewhere
  for (const k of globalReplaced) {
    globalUnreplaced.delete(k);
  }

  return {
    totalVars: entries.length,
    replaced: globalReplaced.size,
    unreplaced: globalUnreplaced.size,
    warnings,
    details,
  };
}
