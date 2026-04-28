const fs = require('fs');

function hasTranslatableText(text) {
  if (!text || typeof text !== 'string' || text.trim() === '') return false;
  // Strip pure code patterns
  let stripped = text
    .replace(/<style[\s\S]*?<\/style>/gi, '')  // remove style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '') // remove script blocks
    .replace(/<[^>]+>/g, '')                     // remove HTML tags
    .replace(/\{\{[^}]+\}\}/g, '')               // remove {{macros}}
    .replace(/<\|[^|]+\|>/g, '')                 // remove <|special|> tokens
    .replace(/[\{\}\[\]\(\);:,=<>!&|+\-*/%.#@~`"'\\]/g, '') // remove code symbols
    .replace(/\s+/g, ' ')
    .trim();
  // If remaining text has CJK characters, Cyrillic, or >10 chars of Latin text, it's translatable
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(stripped);
  const hasCyrillic = /[\u0400-\u04ff]/.test(stripped);
  const hasSubstantialLatin = stripped.replace(/[^a-zA-ZÀ-ÿ]/g, '').length > 10;
  console.log({ text, stripped, hasCJK, hasCyrillic, hasSubstantialLatin, length: stripped.length });
  return hasCJK || hasCyrillic || hasSubstantialLatin || stripped.length > 20;
}

// Read test cards if any exist
const files = fs.readdirSync('.').filter(f => f.endsWith('.json'));
for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.data?.extensions?.regex_scripts) {
      console.log(`\n--- File: ${file} ---`);
      data.data.extensions.regex_scripts.forEach(script => {
        if (script.findRegex) {
           const res = hasTranslatableText(script.findRegex);
           console.log(`[${res ? 'YES' : 'NO' }] findRegex: ${script.findRegex}`);
        }
      });
    }
  } catch(e) {}
}
