import { useCallback } from 'react';
import { useStore } from '../store';
import { validateCard, getCardSummary } from '../utils/cardFields';
import { extractCharaFromPNG } from '../utils/pngHandler';
import type { CharacterCard } from '../types/card';

export function useCardParser() {
  const { setCard, addToast, clearCard } = useStore();

  const parseCardFile = useCallback(
    async (file: File) => {
      const isPng = file.name.toLowerCase().endsWith('.png');
      const isJson = file.name.toLowerCase().endsWith('.json');

      if (!isJson && !isPng) {
        addToast('error', 'Only .json and .png files are accepted');
        return null;
      }

      try {
        let text = '';
        let dataUrl: string | null = null;
        if (isPng) {
          try {
            const extracted = await extractCharaFromPNG(file);
            text = extracted.json;
            dataUrl = extracted.dataUrl;
          } catch (e) {
            addToast('error', 'Failed to extract character data from PNG');
            return null;
          }
        } else {
          text = await file.text();
        }

        const json = JSON.parse(text);
        const validation = validateCard(json);

        if (!validation.valid) {
          addToast('error', validation.error || 'Invalid card format');
          return null;
        }

        const card = json as CharacterCard;
        const summary = getCardSummary(card);
        setCard(card, file.name, dataUrl);
        addToast('success', `Loaded: ${summary.name} (${summary.lorebookCount} lorebook entries)`);
        return card;
      } catch (err) {
        addToast('error', `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
    [setCard, addToast]
  );

  const updateCardFromOriginal = useCallback(
    async (file: File) => {
      const isPng = file.name.toLowerCase().endsWith('.png');
      const isJson = file.name.toLowerCase().endsWith('.json');

      if (!isJson && !isPng) {
        addToast('error', 'Only .json and .png files are accepted');
        return null;
      }

      try {
        let text = '';
        let dataUrl: string | null = null;
        if (isPng) {
          try {
            const extracted = await extractCharaFromPNG(file);
            text = extracted.json;
            dataUrl = extracted.dataUrl;
          } catch (e) {
            addToast('error', 'Failed to extract character data from PNG');
            return null;
          }
        } else {
          text = await file.text();
        }

        const json = JSON.parse(text);
        const validation = validateCard(json);

        if (!validation.valid) {
          addToast('error', validation.error || 'Invalid card format');
          return null;
        }

        const newCard = json as CharacterCard;
        const currentFields = useStore.getState().fields;
        
        if (currentFields.length === 0) {
          addToast('error', 'No existing translations to update from. Please load a translated card first.');
          return null;
        }

        // Dynamically import extractTranslatableFields to avoid circular deps if any,
        // or just use it if imported. We'll import it at the top of the file.
        const { extractTranslatableFields } = await import('../utils/cardFields');
        
        // Extract all fields from the NEW card
        const allGroups = ['core', 'messages', 'system', 'creator', 'lorebook', 'lorebook_keys', 'regex', 'depth_prompt'] as any;
        const newFields = extractTranslatableFields(newCard, allGroups);
        
        // Merge strategy:
        // For each new field, find the corresponding field in currentFields by path.
        // If current field is found and has a translation:
        // - If new original == old original: set as 'done', copy translated text.
        // - If new original != old original: set as 'pending', but store old translated text in `previousTranslation`.
        let matchedCount = 0;
        let updatedCount = 0;

        const mergedFields = newFields.map(nf => {
          const cf = currentFields.find(f => f.path === nf.path);
          if (cf && (cf.status === 'done' || cf.status === 'skipped')) {
            if (cf.original === nf.original) {
              matchedCount++;
              return { ...nf, status: cf.status, translated: cf.translated };
            } else {
              // The text changed! Set to pending but keep the old translation as reference.
              updatedCount++;
              return { ...nf, status: 'pending' as const, previousTranslation: cf.translated };
            }
          }
          return nf;
        });

        setCard(newCard, file.name, dataUrl);
        useStore.getState().setFields(mergedFields);
        useStore.getState().setPhase('idle');
        
        addToast('success', `Updated Card: ${matchedCount} fields unchanged, ${updatedCount} fields modified/new.`);
        return newCard;
      } catch (err) {
        addToast('error', `Failed to update: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
    [setCard, addToast]
  );

  return { parseCardFile, clearCard, updateCardFromOriginal };
}
