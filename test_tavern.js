const hasTranslatableText = (text) => {
  if (!text || typeof text !== 'string' || text.trim() === '') return false;
  let stripped = text
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/[\{\}\[\]\(\);:,=<>!&|+\-*/%.#@~"'\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(stripped);
  const hasCyrillic = /[\u0400-\u04ff]/.test(stripped);
  const hasSubstantialLatin = stripped.replace(/[^a-zA-ZÀ-ÿ]/g, '').length > 10;
  return { hasCJK, hasCyrillic, hasSubstantialLatin, length: stripped.length, stripped };
};

console.log(hasTranslatableText(let a = "????"; // some test comment));
