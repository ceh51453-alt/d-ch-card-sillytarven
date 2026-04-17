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

  return { parseCardFile, clearCard };
}
