/**
 * JSON Patch Validator — MVU-ZOD Architecture
 * 
 * Validates, translates, and simulates RFC 6902 JSON Patch operations
 * found in lorebook entries (e.g. [mvu_update] blocks).
 */

import { applyPatch, deepClone, validate } from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';
import type { z } from 'zod';
import type {
  JsonPatchOp, PatchValidationResult, PatchApplyResult,
} from '../types/mvuZodTypes';

/* ═══════════════════════════════════════════════════════════════
   EXTRACT — Find JSON Patch arrays in lorebook content
   ═══════════════════════════════════════════════════════════════ */

/**
 * Detect and extract JSON Patch arrays from lorebook entry content.
 * Looks for arrays of objects with "op" and "path" keys.
 */
export function extractJsonPatches(content: string): JsonPatchOp[][] {
  const patches: JsonPatchOp[][] = [];
  if (!content) return patches;

  // Strategy 1: Find JSON arrays that look like patch operations
  const arrayRegex = /\[[\s\S]*?\{[\s\S]*?"op"\s*:\s*"(?:add|remove|replace|test|move|copy)"[\s\S]*?\}[\s\S]*?\]/g;
  let match: RegExpExecArray | null;

  while ((match = arrayRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.every(isJsonPatchOp)) {
        patches.push(parsed as JsonPatchOp[]);
      }
    } catch {
      // Not valid JSON, try extracting individual ops
    }
  }

  // Strategy 2: Find individual patch objects (for non-array format)
  if (patches.length === 0) {
    const singleOpRegex = /\{\s*"op"\s*:\s*"(add|remove|replace|test|move|copy)"\s*,\s*"path"\s*:\s*"([^"]+)"(?:\s*,\s*"value"\s*:\s*([^}]+))?\s*\}/g;
    const singleOps: JsonPatchOp[] = [];

    while ((match = singleOpRegex.exec(content)) !== null) {
      try {
        const op = JSON.parse(match[0]) as JsonPatchOp;
        if (isJsonPatchOp(op)) singleOps.push(op);
      } catch { /* skip malformed */ }
    }

    if (singleOps.length > 0) patches.push(singleOps);
  }

  return patches;
}

/** Type guard for JSON Patch operation */
function isJsonPatchOp(obj: unknown): obj is JsonPatchOp {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.op === 'string' &&
    ['add', 'remove', 'replace', 'test', 'move', 'copy'].includes(o.op) &&
    typeof o.path === 'string';
}

/**
 * Check if a lorebook entry contains JSON Patch operations.
 */
export function hasJsonPatchOps(content: string): boolean {
  if (!content) return false;
  return /"op"\s*:\s*"(?:add|remove|replace|test|move|copy)"/.test(content) &&
    /"path"\s*:\s*"\//.test(content);
}

/* ═══════════════════════════════════════════════════════════════
   VALIDATE — Check patches against a Zod schema
   ═══════════════════════════════════════════════════════════════ */

/**
 * Validate JSON Patch operations against a Zod schema.
 * Ensures patch paths reference valid schema fields and values match types.
 */
export function validatePatchAgainstSchema(
  ops: JsonPatchOp[],
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>
): PatchValidationResult {
  const result: PatchValidationResult = {
    valid: true,
    validOps: [],
    invalidOps: [],
    referencedFields: [],
    warnings: [],
  };

  const schemaShape = schema.shape;
  const schemaKeys = new Set(Object.keys(schemaShape));

  for (const op of ops) {
    // Extract top-level field from path (e.g. "/好感度" → "好感度", "/inventory/0" → "inventory")
    const topField = op.path.split('/').filter(Boolean)[0];

    if (!topField) {
      result.invalidOps.push({ op, reason: 'Empty path' });
      result.valid = false;
      continue;
    }

    if (!result.referencedFields.includes(topField)) {
      result.referencedFields.push(topField);
    }

    // Check if field exists in schema
    if (!schemaKeys.has(topField)) {
      result.invalidOps.push({
        op,
        reason: `Field "${topField}" not found in Zod schema. Valid fields: ${[...schemaKeys].join(', ')}`,
      });
      result.valid = false;
      continue;
    }

    // For replace/add/test ops, validate value type
    if ((op.op === 'replace' || op.op === 'add' || op.op === 'test') && op.value !== undefined) {
      const fieldSchema = schemaShape[topField];
      if (fieldSchema) {
        const parseResult = fieldSchema.safeParse(op.value);
        if (!parseResult.success) {
          // For nested paths, we can't validate the leaf type easily — warn instead
          if (op.path.split('/').filter(Boolean).length > 1) {
            result.warnings.push(
              `Nested path "${op.path}": value type may not match schema (can't validate nested)`
            );
            result.validOps.push(op);
          } else {
            result.invalidOps.push({
              op,
              reason: `Value type mismatch for "${topField}": ${parseResult.error.issues[0]?.message}`,
            });
            result.valid = false;
          }
          continue;
        }
      }
    }

    result.validOps.push(op);
  }

  return result;
}

/* ═══════════════════════════════════════════════════════════════
   TRANSLATE — Apply MVU dictionary to patch paths
   ═══════════════════════════════════════════════════════════════ */

/**
 * Translate JSON Pointer paths in patch operations using MVU dictionary.
 * E.g. "/好感度" → "/Hảo_Cảm", "/inventory/0/名称" → "/inventory/0/Tên"
 */
export function translatePatchPaths(
  ops: JsonPatchOp[],
  dictionary: Record<string, string>
): JsonPatchOp[] {
  const entries = Object.entries(dictionary)
    .filter(([k, v]) => k && v && k !== v)
    .sort((a, b) => b[0].length - a[0].length);

  if (entries.length === 0) return ops;

  return ops.map(op => {
    const translated = { ...op };

    // Translate path segments
    translated.path = translateJsonPointer(op.path, entries);

    // Translate 'from' field for move/copy
    if (op.from) {
      translated.from = translateJsonPointer(op.from, entries);
    }

    // Translate string values (for add/replace/test)
    if (typeof op.value === 'string') {
      let val = op.value;
      for (const [original, replacement] of entries) {
        val = val.split(original).join(replacement);
      }
      translated.value = val;
    }

    return translated;
  });
}

/**
 * Translate segments of a JSON Pointer path.
 */
function translateJsonPointer(
  pointer: string,
  entries: [string, string][]
): string {
  const segments = pointer.split('/');
  return segments.map(seg => {
    if (!seg) return seg; // leading empty segment
    // Don't translate numeric indices
    if (/^\d+$/.test(seg)) return seg;
    // Find matching dictionary entry
    for (const [original, translated] of entries) {
      if (seg === original) return translated;
    }
    return seg;
  }).join('/');
}

/* ═══════════════════════════════════════════════════════════════
   APPLY — Dry-run patch application for preview
   ═══════════════════════════════════════════════════════════════ */

/**
 * Simulate applying patches to a state object without mutating.
 * Returns a preview of the resulting state and a change summary.
 */
export function applyPatchDryRun(
  state: Record<string, unknown>,
  ops: JsonPatchOp[]
): PatchApplyResult {
  const changes: PatchApplyResult['changes'] = [];

  try {
    const cloned = deepClone(state);
    const fastOps = ops as Operation[];

    // Validate first
    const errors = validate(fastOps, cloned);
    if (errors) {
      return {
        success: false,
        error: `Patch validation failed: ${errors.message}`,
        changes,
      };
    }

    // Record what will change
    for (const op of ops) {
      const segments = op.path.split('/').filter(Boolean);
      const topField = segments[0];
      if (!topField) continue;

      changes.push({
        path: op.path,
        from: getNestedValue(cloned, segments),
        to: op.value,
        op: op.op,
      });
    }

    // Apply
    const result = applyPatch(cloned, fastOps, true, false);
    const lastResult = result[result.length - 1];

    return {
      success: true,
      result: cloned,
      changes,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      changes,
    };
  }
}

/** Safely get a nested value from an object using path segments */
function getNestedValue(obj: Record<string, unknown>, segments: string[]): unknown {
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/* ═══════════════════════════════════════════════════════════════
   DIFF — Generate patches from two state objects
   ═══════════════════════════════════════════════════════════════ */

/**
 * Generate minimal JSON Patch operations from comparing two state objects.
 * Useful for detecting what changed between original and translated state.
 */
export function generatePatchFromDiff(
  oldState: Record<string, unknown>,
  newState: Record<string, unknown>
): JsonPatchOp[] {
  const patches: JsonPatchOp[] = [];
  const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);

  for (const key of allKeys) {
    const oldVal = oldState[key];
    const newVal = newState[key];

    if (!(key in oldState)) {
      patches.push({ op: 'add', path: `/${key}`, value: newVal });
    } else if (!(key in newState)) {
      patches.push({ op: 'remove', path: `/${key}` });
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      patches.push({ op: 'replace', path: `/${key}`, value: newVal });
    }
  }

  return patches;
}

/**
 * Extract JSON Patch field names from patch operations (for key detection).
 */
export function extractPatchFieldNames(content: string): string[] {
  const names = new Set<string>();
  const pathRegex = /"path"\s*:\s*"\/([^"/]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pathRegex.exec(content)) !== null) {
    const field = match[1];
    if (field && !/^\d+$/.test(field)) {
      names.add(field);
    }
  }

  return [...names];
}
