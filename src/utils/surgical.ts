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
  // Match CJK blocks optionally joined by spaces, safe punctuation, letters/numbers
  const regex = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af\u3000-\u303f\uff00-\uffef]+(?:[ \tA-Za-z0-9.,!?'"()\-:;/_+=*&^%@~|\u2000-\u206F]+[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af\u3000-\u303f\uff00-\uffef]+)*/g;
  
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

import { extractTranslationFromResponse } from './masterPrompt';
import type { ProxySettings, GlossaryEntry } from '../types/card';

/**
 * The main surgical translation orchestrator.
 */
export async function surgicalTranslate(
  text: string,
  config: ProxySettings,
  targetLang: string,
  signal?: AbortSignal,
  glossary?: GlossaryEntry[],
  mvuDictionary?: Record<string, string>
): Promise<{ translated: string; success: boolean; fallbackTriggered: boolean }> {
  const { callProvider } = await import('./apiClient');
  const tokens = extractCJKTokens(text);
  
  if (tokens.length === 0) {
    return { translated: text, success: true, fallbackTriggered: false };
  }

  // 1. Apply local glossary / MVU dictionary translations first to save API tokens
  for (const token of tokens) {
    const trimmed = token.text.trim();
    
    // Check MVU dictionary
    if (mvuDictionary && mvuDictionary[trimmed]) {
      token.translated = mvuDictionary[trimmed];
      continue;
    }
    
    // Check Glossary
    if (glossary) {
      const match = glossary.find(g => g.source.trim() === trimmed);
      if (match && match.target.trim()) {
        token.translated = match.target.trim();
        continue;
      }
    }
  }
  
  // Only send tokens that weren't translated locally
  const pendingTokens = tokens.filter(t => !t.translated);
  if (pendingTokens.length === 0) {
    const reinserted = reinsertTranslations(text, tokens);
    return { translated: reinserted, success: true, fallbackTriggered: false };
  }

  // Batch tokens (e.g. 80 tokens per batch) to avoid exceeding output token limits on large scripts/regexes
  const BATCH_SIZE = 80;
  const tokenBatches: CJKToken[][] = [];
  for (let i = 0; i < pendingTokens.length; i += BATCH_SIZE) {
    tokenBatches.push(pendingTokens.slice(i, i + BATCH_SIZE));
  }
  
  let glossaryPrompt = '';
  if (glossary && glossary.length > 0) {
    const terms = glossary
      .filter(g => g.source.trim() && g.target.trim())
      .map(g => `  "${g.source}" → "${g.target}"`)
      .join('\n');
    if (terms) {
      glossaryPrompt = `\n\nGlossary terms (use these translations if they appear in text):\n${terms}`;
    }
  }
  
  let mvuPrompt = '';
  if (mvuDictionary && Object.keys(mvuDictionary).length > 0) {
    const terms = Object.entries(mvuDictionary)
      .filter(([k, v]) => k && v && k !== v)
      .map(([k, v]) => `  "${k}" → "${v}"`)
      .join('\n');
    if (terms) {
      mvuPrompt = `\n\nMVU variable mappings (use these translations if they appear in text):\n${terms}`;
    }
  }

  const systemPrompt = `You are a surgical translation tool. Your job is to translate CJK strings into ${targetLang} exactly line-by-line.
You will receive a list of items formatted as "#{id}\t{text}".
Return ONLY the translated items in the exact same format "#{id}\t{translated_text}".
Do NOT output any conversational text or markdown blocks. Do NOT skip items.${glossaryPrompt}${mvuPrompt}`;

  try {
    for (const batch of tokenBatches) {
      const payload = batch.map(t => `#${t.id}\t${t.text}`).join('\n');
      const rawResult = await callProvider(config, systemPrompt, payload, signal);
      
      // Clean raw result from XML reasoning tags (think, thought_process, self_check)
      const parsed = extractTranslationFromResponse(rawResult);
      const cleanedResult = parsed.translation || rawResult;

      // Parse result
      const lines = cleanedResult.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      const parsedTranslations: { id?: number; text: string }[] = [];
      for (const line of lines) {
        const matchLine = line.match(/^(?:[^\d#]*#?\s*)?(\d+)[\t \.\:\-\]\)]+(.+)$/);
        if (matchLine) {
          parsedTranslations.push({ id: parseInt(matchLine[1], 10), text: matchLine[2].trim() });
        } else {
          parsedTranslations.push({ text: line });
        }
      }

      if (parsedTranslations.length === batch.length) {
        // Positional fallback mapping (most robust if line count matches)
        for (let idx = 0; idx < batch.length; idx++) {
          const token = batch[idx];
          let translatedText = parsedTranslations[idx].text;
          
          if (translatedText.startsWith(token.text)) {
            translatedText = translatedText.substring(token.text.length).trim();
            translatedText = translatedText.replace(/^[\s\:\-\=\>\t\(\)\[\]\{\}]+/, '').trim();
          }
          const parenthesized = `(${token.text})`;
          if (translatedText.endsWith(parenthesized)) {
            translatedText = translatedText.substring(0, translatedText.length - parenthesized.length).trim();
          }
          const bracketed = `[${token.text}]`;
          if (translatedText.endsWith(bracketed)) {
            translatedText = translatedText.substring(0, translatedText.length - bracketed.length).trim();
          }
          token.translated = translatedText;
        }
      } else {
        // Match strictly by ID
        for (const parsed of parsedTranslations) {
          if (parsed.id !== undefined) {
            const token = batch.find(t => t.id === parsed.id);
            if (token) {
              let translatedText = parsed.text;
              if (translatedText.startsWith(token.text)) {
                translatedText = translatedText.substring(token.text.length).trim();
                translatedText = translatedText.replace(/^[\s\:\-\=\>\t\(\)\[\]\{\}]+/, '').trim();
              }
              const parenthesized = `(${token.text})`;
              if (translatedText.endsWith(parenthesized)) {
                translatedText = translatedText.substring(0, translatedText.length - parenthesized.length).trim();
              }
              const bracketed = `[${token.text}]`;
              if (translatedText.endsWith(bracketed)) {
                translatedText = translatedText.substring(0, translatedText.length - bracketed.length).trim();
              }
              token.translated = translatedText;
            }
          }
        }
      }
    }
    
    // Fill in any missing translations with the original text to prevent blank drops
    for (const token of tokens) {
      if (!token.translated || token.translated.trim() === '') {
        token.translated = token.text;
      }
    }
    
    const reinserted = reinsertTranslations(text, tokens);
    const isValid = verifySurgicalResult(text, reinserted);
    
    if (isValid) {
      const missing = tokens.filter(t => t.translated === t.text);
      if (missing.length > 0) {
        console.warn(`[surgicalTranslate] ${missing.length} tokens could not be translated, keeping original CJK:`, missing.map(m => m.text));
      }
      return { translated: reinserted, success: true, fallbackTriggered: false };
    } else {
      console.warn('Surgical translation failed verification. Falling back to normal translation.', { 
        text, 
        reinserted
      });
      return { translated: text, success: false, fallbackTriggered: true }; // Caller must do standard translation
    }
  } catch (err) {
    console.error('Surgical translation error:', err);
    return { translated: text, success: false, fallbackTriggered: true }; // Caller must do standard translation
  }
}
