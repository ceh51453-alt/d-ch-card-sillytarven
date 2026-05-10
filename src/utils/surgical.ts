export interface CJKToken {
  id: number;
  text: string;
  start: number;
  end: number;
  translated?: string;
}

/**
 * Extracts segments of CJK text, avoiding code brackets and braces.
 */
export function extractCJKTokens(text: string): CJKToken[] {
  const tokens: CJKToken[] = [];
  // Match CJK blocks optionally joined by spaces, simple punctuation, letters/numbers
  const regex = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af\u3000-\u303f\uff00-\uffef]+(?:[ \tA-Za-z0-9.,!?'"()\-:]+[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af\u3000-\u303f\uff00-\uffef]+)*/g;
  
  let match;
  let id = 1;
  while ((match = regex.exec(text)) !== null) {
    const hasIdeograph = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/.test(match[0]);
    if (hasIdeograph) {
      tokens.push({
        id: id++,
        text: match[0],
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }
  return tokens;
}

/**
 * Reinserts translated tokens back into the original string safely by iterating in reverse.
 */
export function reinsertTranslations(original: string, tokens: CJKToken[]): string {
  let result = original;
  // Sort by start index descending to avoid offsetting issues
  const sortedTokens = [...tokens].sort((a, b) => b.start - a.start);
  
  for (const token of sortedTokens) {
    if (token.translated) {
      result = result.slice(0, token.start) + token.translated + result.slice(token.end);
    }
  }
  return result;
}

/**
 * Verifies if structural integrity of code has been broken during translation.
 */
export function verifySurgicalResult(original: string, translated: string): boolean {
  // Check if backticks count matches
  const countChar = (str: string, char: string) => (str.match(new RegExp(`\\${char}`, 'g')) || []).length;
  
  if (countChar(original, '`') !== countChar(translated, '`')) return false;
  if (countChar(original, '{') !== countChar(translated, '{')) return false;
  if (countChar(original, '}') !== countChar(translated, '}')) return false;
  if (countChar(original, '<') !== countChar(translated, '<')) return false;
  if (countChar(original, '>') !== countChar(translated, '>')) return false;
  
  return true;
}

import { callProvider } from './apiClient';
import type { ProxySettings } from '../types/card';

/**
 * The main surgical translation orchestrator.
 */
export async function surgicalTranslate(
  text: string,
  config: ProxySettings,
  targetLang: string,
  signal?: AbortSignal
): Promise<{ translated: string; success: boolean; fallbackTriggered: boolean }> {
  const tokens = extractCJKTokens(text);
  
  if (tokens.length === 0) {
    return { translated: text, success: true, fallbackTriggered: false };
  }

  // Build compact payload
  const payload = tokens.map(t => `#${t.id}\t${t.text}`).join('\n');
  
  const systemPrompt = `You are a surgical translation tool. Your job is to translate CJK strings into ${targetLang} exactly line-by-line.
You will receive a list of items formatted as "#{id}\\t{text}".
Return ONLY the translated items in the exact same format "#{id}\\t{translated_text}".
Do NOT output any conversational text or markdown blocks. Do NOT skip items.`;

  try {
    const result = await callProvider(config, systemPrompt, payload, signal);
    
    // Parse result
    const lines = result.split('\\n');
    for (const line of lines) {
      const match = line.match(/^#(\\d+)\\t(.+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const translatedText = match[2].trim();
        const token = tokens.find(t => t.id === id);
        if (token) {
          token.translated = translatedText;
        }
      }
    }
    
    const reinserted = reinsertTranslations(text, tokens);
    const isValid = verifySurgicalResult(text, reinserted);
    
    if (isValid) {
      return { translated: reinserted, success: true, fallbackTriggered: false };
    } else {
      console.warn('Surgical translation failed verification. Falling back to normal translation.', { text, reinserted });
      return { translated: text, success: false, fallbackTriggered: true }; // Caller must do standard translation
    }
  } catch (err) {
    console.error('Surgical translation error:', err);
    return { translated: text, success: false, fallbackTriggered: true }; // Caller must do standard translation
  }
}

