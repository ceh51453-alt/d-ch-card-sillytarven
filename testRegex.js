const text = '/【开场白导航】/s';
let stripped = text
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/[\{\}\[\]\(\);:,=<>!&|+\-*/%.#@~`"'\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(stripped);
console.log('stripped:', stripped, 'hasCJK:', hasCJK);
