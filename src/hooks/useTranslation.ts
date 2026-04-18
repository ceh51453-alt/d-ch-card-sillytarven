import { useCallback, useRef } from 'react';
import { useStore } from '../store';
import { translateText, translateBatch } from '../utils/apiClient';
import { extractTranslatableFields, applyTranslationsToCard } from '../utils/cardFields';
import { shouldSkipTranslation } from '../utils/langDetect';
import type { FieldGroup, FieldGroupConfig, TranslationField } from '../types/card';

export function useTranslation() {
  const store = useStore();
  const abortRef = useRef<AbortController | null>(null);
  const pauseRef = useRef(false);

  /**
   * Prepare fields for translation.
   * If `continueMode` is true, merge new field groups with existing translated fields.
   */
  const prepareFields = useCallback((continueMode = false) => {
    if (!store.card) return [];
    const enabledGroups = store.translationConfig.fieldGroups
      .filter((g: FieldGroupConfig) => g.enabled)
      .map((g: FieldGroupConfig) => g.id) as FieldGroup[];
    const newFields = extractTranslatableFields(store.card, enabledGroups);

    // In continue mode: preserve already-done fields from previous runs
    if (continueMode && store.fields.length > 0) {
      const existingMap = new Map(store.fields.map(f => [f.path, f]));
      const mergedFields = newFields.map(nf => {
        const existing = existingMap.get(nf.path);
        // Keep existing translation if done or skipped
        if (existing && (existing.status === 'done' || existing.status === 'skipped')) {
          return existing;
        }
        return nf;
      });
      // Also keep done/skipped fields from groups not currently enabled
      for (const ef of store.fields) {
        if ((ef.status === 'done' || ef.status === 'skipped') && !mergedFields.find(m => m.path === ef.path)) {
          mergedFields.push(ef);
        }
      }
      store.setFields(mergedFields);
      return mergedFields;
    }

    // Skip detection: mark fields already in target language or wrong source language
    if (store.translationConfig.skipAlreadyTranslated) {
      const targetLang = store.translationConfig.targetLanguage;
      const sourceLang = store.translationConfig.sourceLanguage;
      for (const f of newFields) {
        if (f.original.length > 5 && shouldSkipTranslation(f.original, targetLang, sourceLang)) {
          f.status = 'skipped';
          f.translated = f.original; // Keep original since it's either correct or we don't want to translate it
        }
      }
    }

    store.setFields(newFields);
    return newFields;
  }, [store]);

  /* ─── Check pause/abort helpers ─── */
  const checkAbort = () => abortRef.current?.signal.aborted;

  const waitForPause = async (): Promise<boolean> => {
    while (pauseRef.current) {
      await new Promise((r) => setTimeout(r, 200));
      if (checkAbort()) return true; // aborted
    }
    return false; // not aborted
  };

  /* ─── Translate a single field ─── */
  const translateSingleField = async (field: TranslationField, index: number, fields: TranslationField[]) => {
    store.setCurrentFieldIndex(index);
    store.updateField(field.path, { status: 'translating' });
    store.addLog('active', `Translating: ${field.label} (${field.original.length} chars)`);

    try {
      const translated = await translateText(
        field.original,
        field.label,
        store.proxy,
        store.translationConfig.targetLanguage,
        store.translationConfig.sourceLanguage,
        store.translationConfig.translationPrompt,
        store.translationConfig.customSchema,
        abortRef.current?.signal
      );

      // Min response length validation
      const ratio = store.proxy.minResponseRatio || 0;
      if (ratio > 0 && field.original.length > 20) {
        const responseRatio = translated.length / field.original.length;
        if (responseRatio < ratio) {
          if ((field.retries || 0) < 1) {
            store.updateField(field.path, { retries: (field.retries || 0) + 1 });
            store.addLog('retry', `⚠️ Translation too short for ${field.label}: ${translated.length}/${field.original.length} chars (${(responseRatio * 100).toFixed(0)}% ratio). Auto-retrying...`);
            await new Promise((r) => setTimeout(r, store.proxy.retryDelay || 1000));
            return 'retry'; // Signal to retry
          } else {
            store.addLog('warning', `Translation still short for ${field.label}: ${translated.length}/${field.original.length} chars. Accepting result.`);
          }
        }
      }

      store.updateField(field.path, { status: 'done', translated });
      store.addLog('success', `Translated: ${field.label} (${translated.length} chars)`);
      return 'done';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Cancelled' || checkAbort()) {
        store.updateField(field.path, { status: 'pending' });
        throw err; // Re-throw for cancel handling
      }
      store.updateField(field.path, { status: 'error', error: msg, retries: (field.retries || 0) + 1 });
      store.addLog('error', `Failed: ${field.label} — ${msg}`);
      store.addToast('error', `Failed: ${field.label}`);
      return 'error';
    }
  };

  /* ─── Translate one batch of fields (single API call + fallback) ─── */
  const translateOneBatch = async (batchFields: TranslationField[]) => {
    // Mark all as translating
    for (const f of batchFields) {
      store.updateField(f.path, { status: 'translating' });
    }
    const totalChars = batchFields.reduce((s, f) => s + f.original.length, 0);
    store.addLog('active', `Batch translating ${batchFields.length} entries (${totalChars} chars)`);

    try {
      const items = batchFields.map(f => ({ text: f.original, fieldName: f.label }));
      const results = await translateBatch(
        items,
        store.proxy,
        store.translationConfig.targetLanguage,
        store.translationConfig.sourceLanguage,
        store.proxy.systemPromptPrefix,
        store.translationConfig.translationPrompt,
        store.translationConfig.customSchema,
        abortRef.current?.signal
      );

      // Apply results — collect empties for fallback
      let doneCount = 0;
      const emptyFields: TranslationField[] = [];
      for (let j = 0; j < batchFields.length; j++) {
        const translated = results[j] || '';
        if (translated.trim()) {
          store.updateField(batchFields[j].path, { status: 'done', translated });
          doneCount++;
        } else {
          emptyFields.push(batchFields[j]);
        }
      }

      // Fallback: translate empty results individually
      if (emptyFields.length > 0) {
        store.addLog('warning', `${emptyFields.length} empty, falling back to individual...`);
        for (const ef of emptyFields) {
          if (checkAbort()) throw new Error('Cancelled');
          try {
            store.updateField(ef.path, { status: 'translating' });
            const translated = await translateText(
              ef.original, ef.label, store.proxy,
              store.translationConfig.targetLanguage,
              store.translationConfig.sourceLanguage,
              store.translationConfig.translationPrompt,
              store.translationConfig.customSchema,
              abortRef.current?.signal
            );
            store.updateField(ef.path, { status: 'done', translated });
            doneCount++;
          } catch (fallbackErr) {
            const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            if (fbMsg === 'Cancelled' || checkAbort()) throw fallbackErr;
            store.updateField(ef.path, { status: 'error', error: fbMsg });
          }
        }
      }

      store.addLog('success', `Batch complete: ${doneCount}/${batchFields.length}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Cancelled' || checkAbort()) {
        for (const f of batchFields) {
          store.updateField(f.path, { status: 'pending' });
        }
        throw err;
      }

      // Batch completely failed — fallback ALL to single
      store.addLog('warning', `Batch failed, falling back for ${batchFields.length} entries...`);
      for (const f of batchFields) {
        if (checkAbort()) throw new Error('Cancelled');
        try {
          store.updateField(f.path, { status: 'translating' });
          const translated = await translateText(
            f.original, f.label, store.proxy,
            store.translationConfig.targetLanguage,
            store.translationConfig.sourceLanguage,
            store.translationConfig.translationPrompt,
            store.translationConfig.customSchema,
            abortRef.current?.signal
          );
          store.updateField(f.path, { status: 'done', translated });
        } catch (fallbackErr) {
          const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          if (fbMsg === 'Cancelled' || checkAbort()) throw fallbackErr;
          store.updateField(f.path, { status: 'error', error: fbMsg });
        }
      }
    }
  };

  /* ─── Main translation loop ─── */
  const startTranslation = useCallback(async (continueMode = false) => {
    const allFields = prepareFields(continueMode);
    if (allFields.length === 0) {
      store.addToast('info', 'No translatable fields found');
      return;
    }

    // Filter to only fields that need translation
    const fields = allFields.filter(f => f.status === 'pending' || f.status === 'error');
    const skippedCount = allFields.filter(f => f.status === 'skipped').length;
    const alreadyDone = allFields.filter(f => f.status === 'done').length;

    if (fields.length === 0) {
      store.addToast('info', 'All fields are already translated or skipped');
      store.setPhase('done');
      return;
    }

    abortRef.current = new AbortController();
    pauseRef.current = false;
    store.setPhase('translating');
    store.setStartTime(Date.now());
    store.clearLogs();

    const logParts = [`Starting translation of ${fields.length} fields to ${store.translationConfig.targetLanguage}`];
    if (skippedCount > 0) logParts.push(`(${skippedCount} skipped — already in target language)`);
    if (alreadyDone > 0) logParts.push(`(${alreadyDone} already done)`);
    store.addLog('info', logParts.join(' '));

    const isBatchLorebook = store.translationConfig.lorebookStrategy === 'batch';
    const batchSize = store.translationConfig.lorebookBatchSize || 20;
    const lorebookGroups: FieldGroup[] = ['lorebook', 'lorebook_keys'];

    let i = 0;
    while (i < fields.length) {
      // Check abort
      if (checkAbort()) {
        store.setPhase('cancelled');
        store.addLog('warning', 'Translation cancelled by user');
        return;
      }

      // Handle pause
      if (await waitForPause()) {
        store.setPhase('cancelled');
        return;
      }

      const field = fields[i];

      // ─── Batch mode for lorebook fields ───
      if (isBatchLorebook && lorebookGroups.includes(field.group)) {
        const concurrency = store.translationConfig.concurrentBatches || 1;
        const MAX_BATCH_CHARS = Math.max(store.proxy.maxTokens || 65536, 10000);

        // Step 1: Collect ALL consecutive lorebook fields
        const allLorebookFields: TranslationField[] = [];
        while (i < fields.length && lorebookGroups.includes(fields[i].group)) {
          allLorebookFields.push(fields[i]);
          i++;
        }

        // Step 2: Split into sub-batches by batchSize AND char limit (no overlap possible)
        const subBatches: TranslationField[][] = [];
        let currentBatch: TranslationField[] = [];
        let currentChars = 0;
        for (const f of allLorebookFields) {
          // Start new batch if size or char limit exceeded
          if (currentBatch.length >= batchSize || (currentBatch.length > 0 && currentChars + f.original.length > MAX_BATCH_CHARS)) {
            subBatches.push(currentBatch);
            currentBatch = [];
            currentChars = 0;
          }
          currentBatch.push(f);
          currentChars += f.original.length;
        }
        if (currentBatch.length > 0) subBatches.push(currentBatch);

        store.setCurrentFieldIndex(i - 1);
        store.addLog('info', `${allLorebookFields.length} lorebook fields → ${subBatches.length} batch(es), concurrency: ${concurrency}`);

        // Step 3: Dispatch sub-batches with concurrency limit (sliding window)
        let batchIdx = 0;
        while (batchIdx < subBatches.length) {
          if (checkAbort()) {
            store.setPhase('cancelled');
            store.addLog('warning', 'Translation cancelled');
            return;
          }

          // Take up to `concurrency` batches
          const window = subBatches.slice(batchIdx, batchIdx + concurrency);
          batchIdx += window.length;

          try {
            const results = await Promise.allSettled(
              window.map(batch => translateOneBatch(batch))
            );

            for (const r of results) {
              if (r.status === 'rejected') {
                const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
                if (msg === 'Cancelled' || checkAbort()) {
                  store.setPhase('cancelled');
                  store.addLog('warning', 'Translation cancelled');
                  return;
                }
              }
            }
          } catch {
            store.setPhase('cancelled');
            store.addLog('warning', 'Translation cancelled');
            return;
          }

          // Delay between batch windows
          if (batchIdx < subBatches.length && store.proxy.requestDelay > 0) {
            await new Promise((r) => setTimeout(r, store.proxy.requestDelay));
          }
        }

        // Delay before next non-lorebook field
        if (i < fields.length && store.proxy.requestDelay > 0) {
          await new Promise((r) => setTimeout(r, store.proxy.requestDelay));
        }
        continue;
      }

      // ─── Single field mode ───
      try {
        const result = await translateSingleField(field, i, fields);
        if (result === 'retry') {
          continue; // Don't increment i
        }
      } catch {
        // Cancel was thrown
        store.setPhase('cancelled');
        store.addLog('warning', 'Translation cancelled');
        return;
      }

      i++;

      // Delay between requests
      if (i < fields.length && store.proxy.requestDelay > 0) {
        await new Promise((r) => setTimeout(r, store.proxy.requestDelay));
      }
    }

    store.setPhase('done');
    const doneCount = store.fields.filter((f) => f.status === 'done').length;
    const failCount = store.fields.filter((f) => f.status === 'error').length;
    store.addLog('info', `Translation complete: ${doneCount} done, ${failCount} failed`);
    store.addToast('success', `Translation complete! ${doneCount}/${fields.length} fields translated`);
  }, [prepareFields, store]);

  const pauseTranslation = useCallback(() => {
    pauseRef.current = true;
    store.setPhase('paused');
    store.addLog('warning', 'Translation paused');
  }, [store]);

  const resumeTranslation = useCallback(() => {
    pauseRef.current = false;
    store.setPhase('translating');
    store.addLog('info', 'Translation resumed');
  }, [store]);

  const cancelTranslation = useCallback(() => {
    abortRef.current?.abort();
    pauseRef.current = false;
    store.setPhase('cancelled');
  }, [store]);

  const retranslateField = useCallback(async (path: string) => {
    const field = store.fields.find((f) => f.path === path);
    if (!field) return;

    const controller = new AbortController();
    store.updateField(path, { status: 'translating', error: undefined });
    store.addLog('active', `Re-translating: ${field.label}`);

    try {
      const translated = await translateText(
        field.original,
        field.label,
        store.proxy,
        store.translationConfig.targetLanguage,
        store.translationConfig.sourceLanguage,
        store.translationConfig.translationPrompt,
        store.translationConfig.customSchema,
        controller.signal
      );
      store.updateField(path, { status: 'done', translated });
      store.addLog('success', `Re-translated: ${field.label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      store.updateField(path, { status: 'error', error: msg });
      store.addLog('error', `Re-translate failed: ${field.label} — ${msg}`);
    }
  }, [store]);

  const getExportCard = useCallback(() => {
    if (!store.card) return null;
    return applyTranslationsToCard(store.card, store.fields);
  }, [store]);

  /** Continue translation — merge with existing done fields, only translate pending/error */
  const continueTranslation = useCallback(async () => {
    await startTranslation(true);
  }, [startTranslation]);

  return {
    prepareFields,
    startTranslation,
    continueTranslation,
    pauseTranslation,
    resumeTranslation,
    cancelTranslation,
    retranslateField,
    getExportCard,
  };
}
