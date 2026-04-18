import { detectLanguage, shouldSkipTranslation } from './src/utils/langDetect.ts';
import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('c:\\Users\\LOC\\Downloads\\Fate_Zero.png_vi_vi.json', 'utf8'));

console.log('--- data.description ---');
const desc = data.data.description || '';
console.log('Length:', desc.length);
console.log('Language:', detectLanguage(desc));
console.log('Skip?:', shouldSkipTranslation(desc, 'Tiếng Việt'));
console.log('Preview:', desc.substring(0, 100).replace(/\n/g, '\\n'));

console.log('\n--- data.personality ---');
const pers = data.data.personality || '';
console.log('Length:', pers.length);
console.log('Language:', detectLanguage(pers));
console.log('Skip?:', shouldSkipTranslation(pers, 'Tiếng Việt'));
console.log('Preview:', pers.substring(0, 100).replace(/\n/g, '\\n'));
