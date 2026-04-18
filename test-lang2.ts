import fs from 'fs';

const VI_UNIQUE_CHARS_G = /[ạảẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđĐ]/g;
const VI_ALL_DIACRITICS_G = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/g;
const CJK_G = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
const KANA_G = /[\u3040-\u309f\u30a0-\u30ff]/g;
const HANGUL_G = /[\uac00-\ud7af\u1100-\u11ff]/g;

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')           
    .replace(/\{\{[^}]+\}\}/g, '')     
    .replace(/\[\[?[^\]]*\]?\]/g, '')  
    .replace(/```[\s\S]*?```/g, '')    
    .replace(/https?:\/\/\S+/g, '')    
    .trim();
}

function detectLanguage(text: string): string {
  const clean = cleanText(text);
  if (clean.length < 5) return 'unknown';

  const viUniqueMatches = clean.match(VI_UNIQUE_CHARS_G);
  if (viUniqueMatches && viUniqueMatches.length >= 2) return 'Tiếng Việt';

  const viAllMatches = clean.match(VI_ALL_DIACRITICS_G);
  if (viAllMatches && viAllMatches.length >= 5) {
    const viExclusiveTest = /[ơưăĂƠƯ]/.test(clean);
    if (viExclusiveTest) return 'Tiếng Việt';
  }

  const cjkMatches = clean.match(CJK_G);
  const kanaMatches = clean.match(KANA_G);
  const hangulMatches = clean.match(HANGUL_G);

  const cjkCount = cjkMatches?.length || 0;
  const kanaCount = kanaMatches?.length || 0;
  const hangulCount = hangulMatches?.length || 0;

  if (kanaCount > 0 && (kanaCount + cjkCount) > 3) return '日本語';
  if (hangulCount > 3) return '한국어';
  if (cjkCount > 3 && kanaCount === 0 && hangulCount === 0) return '中文';

  const cyrillicMatches = clean.match(/[\u0400-\u04ff]/g);
  if (cyrillicMatches && cyrillicMatches.length > 3) return 'Русский';

  const germanChars = clean.match(/[äöüßÄÖÜẞ]/g);
  if (germanChars && germanChars.length >= 3) return 'Deutsch';

  const spanishChars = clean.match(/[ñ¿¡Ñ]/g);
  if (spanishChars && spanishChars.length >= 2) return 'Español';

  const frenchChars = clean.match(/[çœæÇŒÆ]/g);
  if (frenchChars && frenchChars.length >= 2) return 'Français';

  const latinLetters = clean.match(/[a-zA-Z]/g);
  if (latinLetters && latinLetters.length > clean.length * 0.3) return 'English';

  return 'unknown';
}

const inputStr = `
<Avengercharacter>
迦摩:
  基本信息:
    姓名: 迦摩 (Kama / Mara)
    性别: 女
    身高/体重: 156cm / 46kg
天敌: 高对魔力/高精神耐性从者
特记: 天魔之瞳常开, 每个人在她眼中都
带着各自欲望的「色彩」。最喜欢温暖的橙
红色——代表「想要守护某人」的感情。逗
弄他人时从不提高音量, 语调始终慵懒平
缓, 但手上的动作精确到令人怀疑她是否在
认真。
</Avengercharacter>
`;

console.log('Result:', detectLanguage(inputStr));
