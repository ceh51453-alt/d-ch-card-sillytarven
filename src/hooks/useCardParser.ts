import { useCallback } from 'react';
import { useStore } from '../store';
import { validateCard, getCardSummary } from '../utils/cardFields';
import type { CharacterCard } from '../types/card';

export function useCardParser() {
  const { setCard, addToast, clearCard } = useStore();

  const parseCardFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.json')) {
        addToast('error', 'Only .json files are accepted');
        return null;
      }

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const validation = validateCard(json);

        if (!validation.valid) {
          addToast('error', validation.error || 'Invalid card format');
          return null;
        }

        const card = json as CharacterCard;
        const summary = getCardSummary(card);
        setCard(card, file.name);
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
