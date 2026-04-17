import { useStore } from '../store';
import { translations } from './translations';
import type { TranslationKeys } from './translations';

export function useT(): TranslationKeys {
  const locale = useStore((s) => s.locale);
  return translations[locale];
}
