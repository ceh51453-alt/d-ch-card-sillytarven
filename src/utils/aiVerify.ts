import type { CharacterCard, ProxySettings, TranslationField } from '../types/card';

/* ═══ Types ═══ */

export interface VerifyIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  location: string;       // e.g. "lorebook[3].content", "regex[0].replaceString"
  description: string;    // what's wrong
  original: string;       // snippet from original
  current: string;        // snippet from translated
  suggestion: string;     // AI-suggested fix
  autoFixable: boolean;   // can be auto-fixed
  fixPath?: string;       // JSON path for auto-fix
  fixValue?: string;      // replacement value for auto-fix
}

export interface VerifyResult {
  totalIssues: number;
  errors: number;
  warnings: number;
  info: number;
  issues: VerifyIssue[];
  summary: string;
}

/* ═══ Extract all system references from a card ═══ */

interface SystemReference {
  type: 'variable' | 'macro' | 'data-var' | 'zod-field' | 'ejs' | 'css-class' | 'css-id' | 'function';
  name: string;
  source: string; // where it was found
}

/**
 * Deep-scan a card for all system-level references that must stay consistent:
 * - {{getvar::XXX}}, {{setvar::XXX}}, {{getglobalvar::XXX}}, etc.
 * - data-var="XXX" attributes
 * - Zod schema field names (z.object({ field: ... }))
 * - .prefault() / .default() values
 * - EJS templates (<%=, <%, %>)
 * - CSS class/id references in regex HTML
 * - SillyTavern macros: {{char}}, {{user}}, {{random}}, etc.
 */
export function extractSystemReferences(card: CharacterCard): SystemReference[] {
  const refs: SystemReference[] = [];
  const data = card.data;
  if (!data) return refs;

  const scan = (text: string, source: string) => {
    if (!text || typeof text !== 'string') return;

    // {{getvar::XXX}} / {{setvar::XXX::value}} / {{getglobalvar::XXX}}
    const varMacroRegex = /\{\{(getvar|setvar|addvar|getglobalvar|setglobalvar|addglobalvar)::([^:}]+)/g;
    let m;
    while ((m = varMacroRegex.exec(text)) !== null) {
      refs.push({ type: 'variable', name: m[2].trim(), source });
    }

    // data-var="XXX"
    const dataVarRegex = /data-var\s*=\s*["']([^"']+)["']/g;
    while ((m = dataVarRegex.exec(text)) !== null) {
      refs.push({ type: 'data-var', name: m[1], source });
    }

    // Zod fields: z.object({ field_name: z.XXX() })
    const zodFieldRegex = /(\w+)\s*:\s*z\.\w+/g;
    while ((m = zodFieldRegex.exec(text)) !== null) {
      if (!['z', 'const', 'let', 'var', 'return', 'export', 'import', 'function'].includes(m[1])) {
        refs.push({ type: 'zod-field', name: m[1], source });
      }
    }

    // .prefault("XXX") or .default("XXX")
    const prefaultRegex = /\.(?:prefault|default)\s*\(\s*["']([^"']+)["']/g;
    while ((m = prefaultRegex.exec(text)) !== null) {
      refs.push({ type: 'zod-field', name: `prefault:${m[1]}`, source });
    }

    // EJS templates: <%= ... %>, <% ... %>
    const ejsRegex = /<%[=-]?\s*([\s\S]*?)%>/g;
    while ((m = ejsRegex.exec(text)) !== null) {
      refs.push({ type: 'ejs', name: m[1].trim().slice(0, 80), source });
    }

    // Standard SillyTavern macros (should NEVER be translated)
    const stMacroRegex = /\{\{(char|user|random|roll|time|date|idle_duration|input|lastMessage|lastMessageId|newline|trim|noop|original|personality|scenario|persona|mesExamples|description|charFirstMes|charJailbreak|sysPrompt|worldInfo|lorebook|inventory)\}\}/gi;
    while ((m = stMacroRegex.exec(text)) !== null) {
      refs.push({ type: 'macro', name: `{{${m[1]}}}`, source });
    }

    // CSS IDs: id="XXX" or id='XXX'
    const cssIdRegex = /\bid\s*=\s*["']([^"']+)["']/g;
    while ((m = cssIdRegex.exec(text)) !== null) {
      refs.push({ type: 'css-id', name: m[1], source });
    }

    // Function calls that look like API: executeSlashCommands, triggerGroupMessage, etc.
    const funcRegex = /\b(executeSlashCommands|triggerGroupMessage|setVariable|getVariable|sendMessage|fetch)\s*\(/g;
    while ((m = funcRegex.exec(text)) !== null) {
      refs.push({ type: 'function', name: m[1], source });
    }
  };

  // Scan lorebook entries
  if (data.character_book?.entries) {
    data.character_book.entries.forEach((entry, i) => {
      scan(entry.content, `lorebook[${i}].content`);
      if (entry.name) scan(entry.name, `lorebook[${i}].name`);
    });
  }

  // Scan regex scripts
  if (data.extensions?.regex_scripts) {
    data.extensions.regex_scripts.forEach((script, i) => {
      scan(script.replaceString, `regex[${i}].replaceString`);
      if (script.trimStrings) {
        script.trimStrings.forEach((ts, j) => scan(ts, `regex[${i}].trimStrings[${j}]`));
      }
    });
  }

  // Scan TavernHelper scripts
  const th = data.extensions?.tavern_helper as any;
  if (th?.scripts) {
    th.scripts.forEach((script: any, i: number) => {
      scan(script.content, `tavernHelper[${i}].content`);
    });
  }
  const thLegacy = data.extensions?.TavernHelper_scripts as any[];
  if (Array.isArray(thLegacy)) {
    thLegacy.forEach((script: any, i: number) => {
      scan(script.content, `tavernHelper_legacy[${i}].content`);
    });
  }

  // Scan system prompt & description (for macros)
  scan(data.system_prompt || '', 'system_prompt');
  scan(data.description || '', 'description');
  scan(data.first_mes || '', 'first_mes');
  scan(data.mes_example || '', 'mes_example');

  // Deduplicate
  const seen = new Set<string>();
  return refs.filter(r => {
    const key = `${r.type}:${r.name}:${r.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ═══ Quick local verification (no AI needed) ═══ */

export function quickVerify(
  originalCard: CharacterCard,
  translatedCard: CharacterCard
): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const origRefs = extractSystemReferences(originalCard);
  const transRefs = extractSystemReferences(translatedCard);

  // Build maps
  const origBySource = new Map<string, SystemReference[]>();
  for (const r of origRefs) {
    if (!origBySource.has(r.source)) origBySource.set(r.source, []);
    origBySource.get(r.source)!.push(r);
  }
  const transBySource = new Map<string, SystemReference[]>();
  for (const r of transRefs) {
    if (!transBySource.has(r.source)) transBySource.set(r.source, []);
    transBySource.get(r.source)!.push(r);
  }

  // Check each source location
  for (const [source, origList] of origBySource) {
    const transList = transBySource.get(source) || [];
    const transNames = new Set(transList.map(r => r.name));

    for (const ref of origList) {
      // Check if a variable/macro/data-var reference is missing in the translation
      if (!transNames.has(ref.name)) {
        // For macros, this is always an error (they should never change)
        if (ref.type === 'macro') {
          issues.push({
            id: crypto.randomUUID(),
            severity: 'error',
            location: source,
            description: `Missing SillyTavern macro: ${ref.name} was in original but not found in translation`,
            original: ref.name,
            current: '(missing)',
            suggestion: `Restore ${ref.name} in the translated text`,
            autoFixable: false,
          });
        }
        // For variables, check if dictionary mapping exists (Strategy B might have renamed it)
        else if (ref.type === 'variable' || ref.type === 'data-var') {
          issues.push({
            id: crypto.randomUUID(),
            severity: 'warning',
            location: source,
            description: `Variable "${ref.name}" not found in translation. It may have been renamed by Strategy B or accidentally translated.`,
            original: ref.name,
            current: '(missing or renamed)',
            suggestion: `Verify variable "${ref.name}" exists or is correctly mapped in MVU dictionary`,
            autoFixable: false,
          });
        }
        // Zod fields
        else if (ref.type === 'zod-field') {
          issues.push({
            id: crypto.randomUUID(),
            severity: 'error',
            location: source,
            description: `Zod schema field "${ref.name}" missing in translation. This will break the card's state management.`,
            original: ref.name,
            current: '(missing)',
            suggestion: `Restore Zod field "${ref.name}" in the schema definition`,
            autoFixable: false,
          });
        }
        // EJS templates
        else if (ref.type === 'ejs') {
          issues.push({
            id: crypto.randomUUID(),
            severity: 'error',
            location: source,
            description: `EJS template expression missing: <% ${ref.name.slice(0, 40)} %>`,
            original: `<% ${ref.name} %>`,
            current: '(missing)',
            suggestion: `Restore the EJS template expression`,
            autoFixable: false,
          });
        }
      }
    }
  }

  return issues;
}

/* ═══ Field-level verification (per-field checks on TranslationField[]) ═══ */

export interface FieldIssue extends VerifyIssue {
  fieldPath: string;
  category: 'residual_source' | 'html_broken' | 'bracket_mismatch' | 'macro_damaged' | 'json_broken' | 'mvu_inconsistent' | 'length_anomaly' | 'empty_translation';
}

/** Count CJK characters in text */
function countCJK(text: string): number {
  return (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/g) || []).length;
}

/** Count HTML open/close tags */
function countHtmlTags(text: string): { open: number; close: number; selfClose: number } {
  const open = (text.match(/<[a-z][^/>]*>/gi) || []).length;
  const close = (text.match(/<\/[a-z][^>]*>/gi) || []).length;
  const selfClose = (text.match(/<[a-z][^>]*\/>/gi) || []).length;
  return { open, close, selfClose };
}

/** Count bracket pairs */
function countBrackets(text: string): Record<string, [number, number]> {
  return {
    '()': [(text.match(/\(/g) || []).length, (text.match(/\)/g) || []).length],
    '{}': [(text.match(/\{/g) || []).length, (text.match(/\}/g) || []).length],
    '[]': [(text.match(/\[/g) || []).length, (text.match(/\]/g) || []).length],
  };
}

/** Extract all {{macro::xxx}} patterns */
function extractMacros(text: string): string[] {
  return (text.match(/\{\{[^}]+\}\}/g) || []);
}

/** Check if text looks like it contains JSON */
function hasJsonContent(text: string): boolean {
  return /^\s*[\[{]/.test(text.trim()) && /[\]}]\s*$/.test(text.trim());
}

/** Verify all translated fields for common errors */
export function verifyFields(
  fields: TranslationField[],
  mvuDictionary: Record<string, string> = {},
  sourceLang = 'Chinese'
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const isCJKSource = /chinese|中文|japanese|日本語|korean|한국어/i.test(sourceLang) || sourceLang === 'auto';

  for (const field of fields) {
    if (field.status !== 'done' || !field.translated) continue;
    const orig = field.original;
    const trans = field.translated;

    // ─── 1. Residual source text (untranslated CJK left behind) ───
    if (isCJKSource && orig.length > 10) {
      const origCJK = countCJK(orig);
      const transCJK = countCJK(trans);
      // If original was CJK-heavy and translation still has >40% CJK ratio of original
      if (origCJK > 5 && transCJK > 0) {
        const ratio = transCJK / origCJK;
        if (ratio > 0.4) {
          issues.push({
            id: crypto.randomUUID(), fieldPath: field.path,
            severity: ratio > 0.7 ? 'error' : 'warning',
            category: 'residual_source',
            location: field.label,
            description: `${transCJK} CJK characters remain (${Math.round(ratio * 100)}% of original). Text may be untranslated.`,
            original: orig.slice(0, 100),
            current: trans.slice(0, 100),
            suggestion: 'Re-translate this field to ensure all source text is converted.',
            autoFixable: false,
          });
        }
      }
    }

    // ─── 2. HTML tag balance (for regex/tavern_helper fields) ───
    if ((field.group === 'regex' || field.group === 'tavern_helper') && /<[a-z]/i.test(orig)) {
      const origTags = countHtmlTags(orig);
      const transTags = countHtmlTags(trans);
      const origNet = origTags.open - origTags.close;
      const transNet = transTags.open - transTags.close;
      if (Math.abs(origNet - transNet) > 1 || Math.abs(origTags.open - transTags.open) > 2) {
        issues.push({
          id: crypto.randomUUID(), fieldPath: field.path,
          severity: 'error', category: 'html_broken',
          location: field.label,
          description: `HTML tag mismatch: original has ${origTags.open} open / ${origTags.close} close tags, translation has ${transTags.open} / ${transTags.close}.`,
          original: `Open: ${origTags.open}, Close: ${origTags.close}`,
          current: `Open: ${transTags.open}, Close: ${transTags.close}`,
          suggestion: 'Check translated HTML for missing or extra tags.',
          autoFixable: false,
        });
      }
    }

    // ─── 3. Bracket mismatch (for code-heavy fields) ───
    if (field.group === 'tavern_helper' || field.group === 'lorebook' || field.group === 'regex') {
      const origBrackets = countBrackets(orig);
      const transBrackets = countBrackets(trans);
      for (const [pair, [origOpen, origClose]] of Object.entries(origBrackets)) {
        const [transOpen, transClose] = transBrackets[pair];
        const origDiff = origOpen - origClose;
        const transDiff = transOpen - transClose;
        if (Math.abs(origDiff - transDiff) > 1) {
          issues.push({
            id: crypto.randomUUID(), fieldPath: field.path,
            severity: 'warning', category: 'bracket_mismatch',
            location: field.label,
            description: `Bracket ${pair} mismatch: original balance ${origDiff >= 0 ? '+' : ''}${origDiff}, translation balance ${transDiff >= 0 ? '+' : ''}${transDiff}.`,
            original: `${pair[0]}:${origOpen} ${pair[1]}:${origClose}`,
            current: `${pair[0]}:${transOpen} ${pair[1]}:${transClose}`,
            suggestion: `Check ${pair} brackets in the translation.`,
            autoFixable: false,
          });
        }
      }
    }

    // ─── 4. SillyTavern macro damage ───
    const origMacros = extractMacros(orig);
    const transMacros = extractMacros(trans);
    if (origMacros.length > 0) {
      const origSet = new Set(origMacros);
      const transSet = new Set(transMacros);

      // Collect missing macros (in orig, not in trans) and extra macros (in trans, not in orig)
      const missingMacros: string[] = [];
      const extraMacros: string[] = [];

      for (const m of origSet) {
        if (!transSet.has(m)) {
          const varMatch = m.match(/\{\{(getvar|setvar|addvar)::([^:}]+)/);
          if (varMatch) {
            const varName = varMatch[2].trim();
            const mappedName = mvuDictionary[varName];
            if (mappedName && transSet.has(m.replace(varName, mappedName))) continue;
          }
          missingMacros.push(m);
        }
      }

      for (const m of transSet) {
        if (!origSet.has(m)) {
          const varMatch = m.match(/\{\{(?:getvar|setvar|addvar)::([^:}]+)/);
          const isKnownMapping = varMatch && Object.values(mvuDictionary).includes(varMatch[1].trim());
          if (!isKnownMapping) {
            extraMacros.push(m);
          }
        }
      }

      // Compute auto-fix: replace extra (translated) macros with missing (original) macros
      let fixedTrans: string | null = null;
      if (missingMacros.length > 0 && extraMacros.length > 0) {
        fixedTrans = trans;
        if (origMacros.length === transMacros.length) {
          // Same macro count → positional 1:1 replacement
          for (let i = 0; i < origMacros.length; i++) {
            const om = origMacros[i], tm = transMacros[i];
            if (om !== tm && !origSet.has(tm)) {
              fixedTrans = fixedTrans.replace(tm, om);
            }
          }
        } else {
          // Different counts → match missing↔extra by appearance order
          const sortByPos = (arr: string[], text: string) =>
            [...arr].sort((a, b) => text.indexOf(a) - text.indexOf(b));
          const sortedMissing = sortByPos(missingMacros, orig);
          const sortedExtra = sortByPos(extraMacros, trans);
          const n = Math.min(sortedMissing.length, sortedExtra.length);
          for (let i = 0; i < n; i++) {
            fixedTrans = fixedTrans!.replace(sortedExtra[i], sortedMissing[i]);
          }
        }
        if (fixedTrans === trans) fixedTrans = null; // no actual change
      }

      // Create issues for missing macros (auto-fixable if we computed a fix)
      for (const m of missingMacros) {
        issues.push({
          id: crypto.randomUUID(), fieldPath: field.path,
          severity: 'error', category: 'macro_damaged',
          location: field.label,
          description: `Macro "${m}" from original is missing or damaged in translation.`,
          original: m,
          current: '(missing)',
          suggestion: `Restore macro "${m}" in the translated text.`,
          autoFixable: fixedTrans !== null,
          fixPath: fixedTrans !== null ? field.path : undefined,
          fixValue: fixedTrans ?? undefined,
        });
      }

      // Create issues for extra macros (warnings, not auto-fixable individually)
      for (const m of extraMacros) {
        if (/\{\{(getvar|setvar|addvar|getglobalvar|setglobalvar)::/.test(m)) {
          issues.push({
            id: crypto.randomUUID(), fieldPath: field.path,
            severity: 'warning', category: 'macro_damaged',
            location: field.label,
            description: `New/unexpected macro "${m}" in translation that wasn't in original.`,
            original: '(not present)',
            current: m,
            suggestion: 'Verify this macro is intentional (MVU rename) or accidental.',
            autoFixable: fixedTrans !== null,
            fixPath: fixedTrans !== null ? field.path : undefined,
            fixValue: fixedTrans ?? undefined,
          });
        }
      }
    }

    // ─── 5. JSON structure broken ───
    if (hasJsonContent(orig)) {
      try { JSON.parse(orig); } catch { /* original wasn't valid JSON, skip */ continue; }
      try {
        JSON.parse(trans);
      } catch (e) {
        issues.push({
          id: crypto.randomUUID(), fieldPath: field.path,
          severity: 'error', category: 'json_broken',
          location: field.label,
          description: `Translation broke JSON structure: ${e instanceof Error ? e.message : String(e)}`,
          original: orig.slice(0, 80),
          current: trans.slice(0, 80),
          suggestion: 'The translated content is no longer valid JSON. Fix the structure.',
          autoFixable: false,
        });
      }
    }

    // ─── 6. Length anomaly ───
    if (orig.length > 20) {
      const ratio = trans.length / orig.length;
      if (ratio < 0.15) {
        issues.push({
          id: crypto.randomUUID(), fieldPath: field.path,
          severity: 'error', category: 'length_anomaly',
          location: field.label,
          description: `Translation is suspiciously short: ${trans.length} chars vs ${orig.length} original (${Math.round(ratio * 100)}%).`,
          original: `${orig.length} chars`,
          current: `${trans.length} chars (${Math.round(ratio * 100)}%)`,
          suggestion: 'Translation may be truncated or incomplete. Consider re-translating.',
          autoFixable: false,
        });
      } else if (ratio > 5) {
        issues.push({
          id: crypto.randomUUID(), fieldPath: field.path,
          severity: 'warning', category: 'length_anomaly',
          location: field.label,
          description: `Translation is unusually long: ${trans.length} chars vs ${orig.length} original (${Math.round(ratio * 100)}%).`,
          original: `${orig.length} chars`,
          current: `${trans.length} chars`,
          suggestion: 'Translation may contain duplicate content or excessive explanations.',
          autoFixable: false,
        });
      }
    }

    // ─── 7. MVU variable consistency ───
    if (Object.keys(mvuDictionary).length > 0 && (field.group === 'tavern_helper' || field.group === 'lorebook' || field.group === 'regex')) {
      for (const [origVar, transVar] of Object.entries(mvuDictionary)) {
        if (!origVar || !transVar || origVar === transVar) continue;
        // If original has this variable and translation still has the original name (not renamed)
        if (orig.includes(origVar) && trans.includes(origVar) && !trans.includes(transVar)) {
          issues.push({
            id: crypto.randomUUID(), fieldPath: field.path,
            severity: 'warning', category: 'mvu_inconsistent',
            location: field.label,
            description: `MVU variable "${origVar}" should be renamed to "${transVar}" but original name still appears in translation.`,
            original: origVar,
            current: origVar,
            suggestion: `Replace "${origVar}" with "${transVar}" in the translated text.`,
            autoFixable: true,
            fixPath: field.path,
            fixValue: trans.split(origVar).join(transVar),
          });
        }
      }
    }
  }

  return issues;
}

/** Apply auto-fix to a field issue */
export function applyAutoFix(issue: FieldIssue, fields: TranslationField[]): TranslationField[] {
  if (!issue.autoFixable || !issue.fixPath || !issue.fixValue) return fields;
  return fields.map(f => {
    if (f.path === issue.fixPath) {
      return { ...f, translated: issue.fixValue! };
    }
    return f;
  });
}



export async function aiVerifyCard(
  originalCard: CharacterCard,
  translatedCard: CharacterCard,
  config: ProxySettings,
  targetLang: string,
  mvuDictionary: Record<string, string>,
  signal?: AbortSignal
): Promise<VerifyResult> {
  // Step 1: Quick local verification
  const localIssues = quickVerify(originalCard, translatedCard);

  // Step 2: Extract key sections for AI analysis
  const origData = originalCard.data;
  const transData = translatedCard.data;
  if (!origData || !transData) {
    return {
      totalIssues: localIssues.length,
      errors: localIssues.filter(i => i.severity === 'error').length,
      warnings: localIssues.filter(i => i.severity === 'warning').length,
      info: 0,
      issues: localIssues,
      summary: 'No card data to verify',
    };
  }

  // Build context for AI
  const sections: string[] = [];

  // MVU Dictionary context
  if (Object.keys(mvuDictionary).length > 0) {
    sections.push(`## MVU Variable Dictionary (Strategy B mappings):\n${Object.entries(mvuDictionary).map(([k, v]) => `  "${k}" → "${v}"`).join('\n')}`);
  }

  // Compare lorebook entries (focus on code-heavy ones)
  if (origData.character_book?.entries && transData.character_book?.entries) {
    const origEntries = origData.character_book.entries;
    const transEntries = transData.character_book.entries;
    const limit = Math.min(origEntries.length, transEntries.length);

    for (let i = 0; i < limit; i++) {
      const orig = origEntries[i];
      const trans = transEntries[i];
      // Only include entries with code-like content (variables, JSON, code blocks)
      if (orig.content && /\{\{(get|set|add)(var|globalvar)::/.test(orig.content)) {
        sections.push(`## Lorebook[${i}] "${orig.name || orig.comment || ''}":\n### ORIGINAL:\n${orig.content.slice(0, 2000)}\n### TRANSLATED:\n${trans.content.slice(0, 2000)}`);
      }
    }
  }

  // Compare TavernHelper scripts (Zod, MVU)
  const origTH = (origData.extensions?.tavern_helper as any)?.scripts || [];
  const transTH = (transData.extensions?.tavern_helper as any)?.scripts || [];
  for (let i = 0; i < Math.min(origTH.length, transTH.length); i++) {
    sections.push(`## TavernHelper Script[${i}] "${origTH[i].name || ''}":\n### ORIGINAL:\n${origTH[i].content.slice(0, 3000)}\n### TRANSLATED:\n${transTH[i].content.slice(0, 3000)}`);
  }

  // Compare regex scripts
  if (origData.extensions?.regex_scripts && transData.extensions?.regex_scripts) {
    const origRegex = origData.extensions.regex_scripts;
    const transRegex = transData.extensions.regex_scripts;
    for (let i = 0; i < Math.min(origRegex.length, transRegex.length); i++) {
      if (origRegex[i].replaceString && /data-var|getvar|setvar|class=|id=/.test(origRegex[i].replaceString)) {
        sections.push(`## Regex[${i}] "${origRegex[i].scriptName}":\n### ORIGINAL replaceString:\n${origRegex[i].replaceString.slice(0, 2000)}\n### TRANSLATED replaceString:\n${transRegex[i].replaceString.slice(0, 2000)}`);
      }
    }
  }

  // If no sections to verify, return local issues only
  if (sections.length === 0) {
    return {
      totalIssues: localIssues.length,
      errors: localIssues.filter(i => i.severity === 'error').length,
      warnings: localIssues.filter(i => i.severity === 'warning').length,
      info: 0,
      issues: localIssues,
      summary: localIssues.length === 0
        ? 'No MVU/Zod content found to verify. Card looks clean.'
        : `Found ${localIssues.length} issue(s) from local verification.`,
    };
  }

  // Step 3: Call AI for deep analysis
  const systemPrompt = `You are a SillyTavern character card integrity auditor. Your job is to compare ORIGINAL and TRANSLATED sections of a card and find issues where the translation broke functional elements.

CRITICAL ELEMENTS TO CHECK:
1. **SillyTavern Macros**: {{char}}, {{user}}, {{getvar::XXX}}, {{setvar::XXX::VALUE}} must be preserved EXACTLY. The variable names inside may be renamed per the MVU Dictionary, but the macro syntax MUST be intact.
2. **Zod Schema Fields**: Field names in z.object({...}) definitions, .prefault() values, and schema structure must match exactly with the MVU Dictionary mappings.
3. **EJS Templates**: <% %>, <%= %> blocks must be structurally preserved.
4. **HTML data-var Attributes**: data-var="XXX" must reference valid variable names (original or dictionary-mapped).
5. **JavaScript Logic**: Function names, API calls, import statements, event handlers must NOT be translated.
6. **CSS Classes/IDs**: class="XXX" and id="XXX" must be consistent between regex HTML and the JS that references them.
7. **JSON Structure**: Any JSON embedded in lorebook content must remain valid JSON after translation.
8. **Variable Consistency**: If a variable is renamed via MVU Dictionary (e.g. "好感度" → "Hao_Cam"), ALL references across ALL sections must use the same new name.

RESPOND IN THIS EXACT JSON FORMAT (no markdown wrapping):
{
  "issues": [
    {
      "severity": "error|warning|info",
      "location": "lorebook[0].content",
      "description": "Description of the issue",
      "original_snippet": "original code/text snippet",
      "translated_snippet": "current translated snippet",
      "suggested_fix": "what the translated snippet should be"
    }
  ],
  "summary": "One paragraph summary of findings"
}

If everything is correct, return: {"issues": [], "summary": "All functional elements verified. No issues found."}`;

  const userPrompt = `Verify this translated ${targetLang} SillyTavern card. Check ALL functional elements (variables, macros, Zod fields, EJS, HTML attributes, JS code) are correctly preserved or properly renamed per the MVU Dictionary.

${sections.join('\n\n---\n\n')}`;

  try {
    // Import callProvider dynamically to avoid circular dependencies
    const url = config.proxyUrl.replace(/\/+$/, '');
    let apiUrl: string;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any;

    if (config.provider === 'anthropic') {
      apiUrl = url + '/messages';
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      body = {
        model: config.model,
        max_tokens: config.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.2,
      };
    } else if (config.provider === 'google') {
      apiUrl = `${url}/models/${config.model}:generateContent?key=${config.apiKey}`;
      body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: config.maxTokens, temperature: 0.2 },
      };
    } else {
      apiUrl = url + '/chat/completions';
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      body = {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: config.maxTokens,
        temperature: 0.2,
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

    // Extract text from response
    let responseText = '';
    if (config.provider === 'anthropic') {
      responseText = json.content?.[0]?.text || '';
    } else if (config.provider === 'google') {
      responseText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      responseText = json.choices?.[0]?.message?.content || '';
    }

    // Parse AI response
    const aiIssues = parseAIVerifyResponse(responseText);

    // Merge local + AI issues
    const allIssues = [...localIssues, ...aiIssues.issues];

    return {
      totalIssues: allIssues.length,
      errors: allIssues.filter(i => i.severity === 'error').length,
      warnings: allIssues.filter(i => i.severity === 'warning').length,
      info: allIssues.filter(i => i.severity === 'info').length,
      issues: allIssues,
      summary: aiIssues.summary || (allIssues.length === 0
        ? '✅ All functional elements verified. No issues found.'
        : `Found ${allIssues.length} issue(s). Review and fix before exporting.`),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Return local issues even if AI fails
    return {
      totalIssues: localIssues.length,
      errors: localIssues.filter(i => i.severity === 'error').length,
      warnings: localIssues.filter(i => i.severity === 'warning').length,
      info: 0,
      issues: localIssues,
      summary: `AI verification failed (${msg}). Showing ${localIssues.length} local issues only.`,
    };
  }
}

/* ═══ Parse AI verification response ═══ */

function parseAIVerifyResponse(text: string): { issues: VerifyIssue[]; summary: string } {
  try {
    // Try to extract JSON from response (may be wrapped in markdown)
    let jsonStr = text.trim();
    // Strip markdown code fence
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    const issues: VerifyIssue[] = (parsed.issues || []).map((ai: any) => ({
      id: crypto.randomUUID(),
      severity: ai.severity || 'warning',
      location: ai.location || 'unknown',
      description: ai.description || '',
      original: ai.original_snippet || '',
      current: ai.translated_snippet || '',
      suggestion: ai.suggested_fix || '',
      autoFixable: false,
    }));

    return { issues, summary: parsed.summary || '' };
  } catch {
    // If JSON parse fails, try to extract issues from free text
    return {
      issues: text.trim() ? [{
        id: crypto.randomUUID(),
        severity: 'info' as const,
        location: 'AI Response',
        description: text.slice(0, 500),
        original: '',
        current: '',
        suggestion: '',
        autoFixable: false,
      }] : [],
      summary: 'Could not parse AI response as structured JSON.',
    };
  }
}
