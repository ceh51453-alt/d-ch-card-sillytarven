import { useCallback, useRef } from 'react';
import { useStore } from '../store';
import { translateText } from '../utils/apiClient';
import { extractTranslatableFields, applyTranslationsToCard } from '../utils/cardFields';
import type { FieldGroup, FieldGroupConfig } from '../types/card';

export function useTranslation() {
  const store = useStore();
  const abortRef = useRef<AbortController | null>(null);
  const pauseRef = useRef(false);

  const prepareFields = useCallback(() => {
    if (!store.card) return [];
    const enabledGroups = store.translationConfig.fieldGroups
      .filter((g: FieldGroupConfig) => g.enabled)
      .map((g: FieldGroupConfig) => g.id) as FieldGroup[];
    const fields = extractTranslatableFields(store.card, enabledGroups);
    store.setFields(fields);
    return fields;
  }, [store]);

  const startTranslation = useCallback(async () => {
    const fields = prepareFields();
    if (fields.length === 0) {
      store.addToast('info', 'No translatable fields found');
      return;
    }

    abortRef.current = new AbortController();
    pauseRef.current = false;
    store.setPhase('translating');
    store.setStartTime(Date.now());
    store.clearLogs();
    store.addLog('info', `Starting translation of ${fields.length} fields to ${store.translationConfig.targetLanguage}`);

    for (let i = 0; i < fields.length; i++) {
      // Check abort
      if (abortRef.current?.signal.aborted) {
        store.setPhase('cancelled');
        store.addLog('warning', 'Translation cancelled by user');
        return;
      }

      // Handle pause
      while (pauseRef.current) {
        await new Promise((r) => setTimeout(r, 200));
        if (abortRef.current?.signal.aborted) {
          store.setPhase('cancelled');
          return;
        }
      }

      const field = fields[i];
      store.setCurrentFieldIndex(i);
      store.updateField(field.path, { status: 'translating' });
      store.addLog('active', `Translating: ${field.label} (${field.original.length} chars)`);

      try {
        const translated = await translateText(
          field.original,
          field.label,
          store.proxy,
          store.translationConfig.targetLanguage,
          abortRef.current?.signal
        );

        // Min response length validation
        const ratio = store.proxy.minResponseRatio || 0;
        if (ratio > 0 && field.original.length > 20) {
          const responseRatio = translated.length / field.original.length;
          if (responseRatio < ratio) {
            // Auto-retry once for suspiciously short translations
            if ((field.retries || 0) < 1) {
              store.updateField(field.path, { retries: (field.retries || 0) + 1 });
              store.addLog('retry', `⚠️ Translation too short for ${field.label}: ${translated.length}/${field.original.length} chars (${(responseRatio * 100).toFixed(0)}% ratio). Auto-retrying...`);
              i--; // Retry this field
              await new Promise((r) => setTimeout(r, store.proxy.retryDelay || 1000));
              continue;
            } else {
              store.addLog('warning', `Translation still short for ${field.label}: ${translated.length}/${field.original.length} chars. Accepting result.`);
            }
          }
        }

        store.updateField(field.path, { status: 'done', translated });
        store.addLog('success', `Translated: ${field.label} (${translated.length} chars)`);

        // Delay between requests
        if (i < fields.length - 1 && store.proxy.requestDelay > 0) {
          await new Promise((r) => setTimeout(r, store.proxy.requestDelay));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'Cancelled' || abortRef.current?.signal.aborted) {
          store.updateField(field.path, { status: 'pending' });
          store.setPhase('cancelled');
          store.addLog('warning', 'Translation cancelled');
          return;
        }

        store.updateField(field.path, { status: 'error', error: msg, retries: (field.retries || 0) + 1 });
        store.addLog('error', `Failed: ${field.label} — ${msg}`);
        store.addToast('error', `Failed: ${field.label}`);
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

  return {
    prepareFields,
    startTranslation,
    pauseTranslation,
    resumeTranslation,
    cancelTranslation,
    retranslateField,
    getExportCard,
  };
}
