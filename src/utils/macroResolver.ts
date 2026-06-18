/**
 * SillyTavern Macro Resolver
 * Processes ST macro syntax ({{setvar::}}, {{getvar::}}, {{char}}, etc.)
 * before injecting preset prompts into the translation pipeline.
 *
 * KEY: SillyTavern macro values can contain `}` characters (e.g. XML tags),
 * newlines, and be very long. The delimiter is always `}}` so we use
 * lazy matching `([\s\S]*?)` instead of `([^}]*)`.
 */

export interface MacroContext {
  /** Character name from card */
  charName?: string;
  /** User name (defaults to "User") */
  userName?: string;
  /** Pre-seeded variables */
  initialVars?: Record<string, string>;
}

/**
 * Resolve SillyTavern macros in a prompt string.
 *
 * Supported macros:
 * - {{setvar::name::value}}     → store variable, remove from output
 * - {{setglobalvar::name::val}} → same as setvar (global scope irrelevant here)
 * - {{addvar::name::value}}     → add numeric value to variable, remove
 * - {{incvar::name}}            → increment by 1, remove
 * - {{decvar::name}}            → decrement by 1, remove
 * - {{getvar::name}}            → replace with stored value
 * - {{getglobalvar::name}}      → same as getvar
 * - {{char}} / {{Char}}         → character name
 * - {{user}} / {{User}}         → user name
 * - {{persona}}                 → user persona (→ user name)
 * - {{personality}}             → character personality (leave as context marker)
 * - {{scenario}}                → scenario (leave as context marker)
 * - {{group}}                   → group name (leave as context marker)
 * - {{lastUserMessage}}         → leave as-is (runtime only)
 * - {{roll::NdM}}               → keep dice notation
 * - {{random::min::max}}        → midpoint
 * - {{newline}}                 → \n
 * - {{trim}}                    → remove
 * - {{noop}}                    → remove
 * - {{// comment}}              → remove
 *
 * Unrecognized macros are left as-is.
 */
export function resolveMacros(text: string, ctx: MacroContext = {}): string {
  const vars: Record<string, string> = { ...(ctx.initialVars || {}) };
  const charName = ctx.charName || '{{char}}';
  const userName = ctx.userName || 'User';

  let result = text;

  // ═══ Pass 1: Extract setvar/setglobalvar (side-effect macros → populate vars, remove from output) ═══
  // Use lazy [\s\S]*? to handle values containing } characters and newlines.
  // The `::` between name and value is the reliable delimiter.
  result = result.replace(
    /\{\{set(?:global)?var::([^:}]+)::([\s\S]*?)\}\}/gi,
    (_match, name: string, value: string) => {
      vars[name.trim()] = value.trim();
      return '';
    }
  );

  // ═══ Pass 1b: addvar (numeric add) ═══
  result = result.replace(
    /\{\{addvar::([^:}]+)::([\s\S]*?)\}\}/gi,
    (_match, name: string, value: string) => {
      const existing = parseFloat(vars[name.trim()] || '0');
      const add = parseFloat(value.trim()) || 0;
      vars[name.trim()] = String(existing + add);
      return '';
    }
  );

  // ═══ Pass 1c: incvar / decvar ═══
  result = result.replace(/\{\{incvar::([^}]+)\}\}/gi, (_match, name: string) => {
    const existing = parseFloat(vars[name.trim()] || '0');
    vars[name.trim()] = String(existing + 1);
    return '';
  });
  result = result.replace(/\{\{decvar::([^}]+)\}\}/gi, (_match, name: string) => {
    const existing = parseFloat(vars[name.trim()] || '0');
    vars[name.trim()] = String(existing - 1);
    return '';
  });

  // ═══ Pass 2: Resolve getvar / getglobalvar (multi-pass for chained refs) ═══
  for (let i = 0; i < 5; i++) {
    const before = result;
    result = result.replace(
      /\{\{get(?:global)?var::([^}]+)\}\}/gi,
      (_match, name: string) => {
        const key = name.trim();
        return vars[key] ?? '';
      }
    );
    if (result === before) break;
  }

  // ═══ Pass 3: Simple substitution macros ═══
  result = result.replace(/\{\{char\}\}/gi, charName);
  result = result.replace(/\{\{user\}\}/gi, userName);
  result = result.replace(/\{\{persona\}\}/gi, userName);
  result = result.replace(/\{\{newline\}\}/gi, '\n');
  result = result.replace(/\{\{trim\}\}/gi, '');
  result = result.replace(/\{\{noop\}\}/gi, '');

  // Comment macros: {{// anything}}
  result = result.replace(/\{\{\/\/[\s\S]*?\}\}/g, '');

  // Random: replace with midpoint for deterministic behavior
  result = result.replace(
    /\{\{random::(\d+)::(\d+)\}\}/gi,
    (_match, min: string, max: string) => {
      const mid = Math.floor((parseInt(min) + parseInt(max)) / 2);
      return String(mid);
    }
  );

  // Roll: keep as notation (AI understands "2d6" etc.)
  result = result.replace(/\{\{roll::([^}]+)\}\}/gi, (_match, dice: string) => dice.trim());

  // Context macros that have no value without runtime — replace with descriptive placeholder
  result = result.replace(/\{\{personality\}\}/gi, '[character personality]');
  result = result.replace(/\{\{scenario\}\}/gi, '[scenario]');
  result = result.replace(/\{\{group\}\}/gi, '[group]');
  result = result.replace(/\{\{lastUserMessage\}\}/gi, '[last user message]');

  // Clean up empty lines left by removed macros (max 2 consecutive)
  result = result.replace(/\n{3,}/g, '\n\n');
  // Clean up lines that are just whitespace
  result = result.replace(/^\s+$/gm, '');

  return result;
}

/**
 * Extract character name from a card object.
 */
export function getCharNameFromCard(card: any): string | undefined {
  if (!card) return undefined;
  return card.data?.name || card.name || undefined;
}
