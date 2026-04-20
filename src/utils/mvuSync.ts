import type { CharacterCard } from '../types/card';

/**
 * Áp dụng Chiến Lược B: Đồng bộ hóa tên biến MVU/Zod trên toàn bộ thẻ.
 * Thay thế một tập hợp các khóa (keys) thành các khóa đã dịch (translatedKeys) 
 * trong các thành phần trọng yếu của thẻ:
 * 1. Zod Schema Script (TavernHelper)
 * 2. Regex Scripts (HTML Dashboard)
 * 3. Lorebook Entries (Đặc biệt là [initvar] và [mvu_update])
 */
export function syncMvuVariables(
  card: CharacterCard,
  variableDictionary: Record<string, string>
): CharacterCard {
  // Deep clone thẻ để tránh tham chiếu
  const result = JSON.parse(JSON.stringify(card)) as CharacterCard;
  
  if (!result.data) return result;

  // Lấy danh sách các cặp [gốc, dịch]
  const entries = Object.entries(variableDictionary).filter(([k, v]) => k && v && k !== v);
  if (entries.length === 0) return result;

  // Hàm helper để thay thế an toàn
  const replaceInText = (text: string): string => {
    if (!text || typeof text !== 'string') return text;
    let newText = text;
    for (const [original, translated] of entries) {
      // Dùng RegExp toàn cục, không dùng \b vì tiếng Trung/Nhật không có word boundary
      // Để an toàn hơn cho Regex JS, ta escape các ký tự đặc biệt của original
      const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapeRegExp(original), 'g');
      newText = newText.replace(regex, translated);
    }
    return newText;
  };

  // 1. Xử lý TavernHelper Scripts (Zod Schema)
  const tavernHelper = result.data.extensions?.tavern_helper as any;
  if (tavernHelper?.scripts) {
    tavernHelper.scripts = tavernHelper.scripts.map((script: any) => ({
      ...script,
      content: replaceInText(script.content)
    }));
  }
  // Hỗ trợ phiên bản cũ của TavernHelper
  const tavernHelperLegacy = result.data.extensions?.TavernHelper_scripts as any;
  if (Array.isArray(tavernHelperLegacy)) {
    result.data.extensions!.TavernHelper_scripts = tavernHelperLegacy.map((script: any) => ({
      ...script,
      content: replaceInText(script.content)
    }));
  }

  // 2. Xử lý Regex Scripts (HTML UI, class, id, data-var)
  if (result.data.extensions?.regex_scripts) {
    result.data.extensions.regex_scripts = result.data.extensions.regex_scripts.map((script) => ({
      ...script,
      replaceString: replaceInText(script.replaceString)
    }));
  }

  // 3. Xử lý Lorebook Entries (Rules, [initvar], JSON Patch)
  if (result.data.character_book?.entries) {
    result.data.character_book.entries = result.data.character_book.entries.map((entry) => ({
      ...entry,
      content: replaceInText(entry.content)
    }));
  }

  // Cập nhật backup lorebook nếu có
  const extCharBook = result.data.extensions?.character_book as any;
  if (extCharBook?.entries) {
    extCharBook.entries = extCharBook.entries.map((entry: any) => ({
      ...entry,
      content: replaceInText(entry.content)
    }));
  }

  return result;
}

/**
 * Trích xuất các biến MVU/Zod có khả năng tồn tại trong thẻ để tạo từ điển.
 * Tính năng này quét nội dung của [initvar] hoặc Zod Schema để tìm các key.
 */
export function extractPotentialMvuKeys(card: CharacterCard): string[] {
  const keys = new Set<string>();
  const data = card.data;
  if (!data) return [];

  // Tìm trong lorebook entry có tên hoặc comment chứa "initvar"
  const entries = data.character_book?.entries || [];
  const initvarEntry = entries.find(e => 
    (e.comment && e.comment.toLowerCase().includes('initvar')) || 
    (e.content && e.content.includes('[initvar]'))
  );

  if (initvarEntry) {
    // Thử bóc tách các key theo cấu trúc YAML đơn giản (VD: `Tên_Biến:`)
    const yamlKeyRegex = /^[\s]*([^\s:]+):/gm;
    let match;
    while ((match = yamlKeyRegex.exec(initvarEntry.content)) !== null) {
      const key = match[1].trim();
      // Loại bỏ các key vô nghĩa hoặc không phải biến
      if (key && !key.startsWith('[') && !key.startsWith('<')) {
        keys.add(key);
      }
    }
  }

  return Array.from(keys);
}

/* ═══ Regex HTML Post-Processing ═══ */

/**
 * Bản đồ font Trung → font tương thích tiếng Việt.
 * Khi gặp font-family chứa tên font Trung, thay bằng font Việt tương ứng.
 */
const CHINESE_FONT_MAP: [RegExp, string][] = [
  // Tên tiếng Trung
  [/['"]?微软雅黑['"]?/gi, "'Segoe UI', Tahoma, sans-serif"],
  [/['"]?黑体['"]?/gi, "'Segoe UI', Arial, sans-serif"],
  [/['"]?宋体['"]?/gi, "'Times New Roman', 'Noto Serif', serif"],
  [/['"]?新宋体['"]?/gi, "'Times New Roman', serif"],
  [/['"]?楷体['"]?/gi, "'Georgia', serif"],
  [/['"]?仿宋['"]?/gi, "'Georgia', serif"],
  [/['"]?幼圆['"]?/gi, "'Segoe UI', sans-serif"],
  [/['"]?华文[^'",;}\s]+['"]?/gi, "'Segoe UI', sans-serif"],
  [/['"]?方正[^'",;}\s]+['"]?/gi, "'Segoe UI', sans-serif"],
  // Tên tiếng Anh của font Trung
  [/['"]?SimSun['"]?/gi, "'Times New Roman', 'Noto Serif', serif"],
  [/['"]?SimHei['"]?/gi, "'Segoe UI', Arial, sans-serif"],
  [/['"]?NSimSun['"]?/gi, "'Times New Roman', serif"],
  [/['"]?FangSong['"]?/gi, "'Georgia', serif"],
  [/['"]?KaiTi['"]?/gi, "'Georgia', serif"],
  [/['"]?Microsoft YaHei['"]?/gi, "'Segoe UI', Tahoma, sans-serif"],
  [/['"]?Microsoft JhengHei['"]?/gi, "'Segoe UI', Tahoma, sans-serif"],
  [/['"]?STSong['"]?/gi, "'Times New Roman', serif"],
  [/['"]?STHeiti['"]?/gi, "'Segoe UI', sans-serif"],
  [/['"]?STKaiti['"]?/gi, "'Georgia', serif"],
  [/['"]?STFangsong['"]?/gi, "'Georgia', serif"],
  [/['"]?PingFang SC['"]?/gi, "'Segoe UI', sans-serif"],
  [/['"]?PingFang TC['"]?/gi, "'Segoe UI', sans-serif"],
  [/['"]?Hiragino Sans GB['"]?/gi, "'Segoe UI', sans-serif"],
  // Font Nhật thường gặp
  [/['"]?MS Gothic['"]?/gi, "'Segoe UI', sans-serif"],
  [/['"]?MS Mincho['"]?/gi, "'Times New Roman', serif"],
  [/['"]?Meiryo['"]?/gi, "'Segoe UI', sans-serif"],
  [/['"]?Yu Gothic['"]?/gi, "'Segoe UI', sans-serif"],
];

/**
 * CSS snippet tự động ẩn dấu _ thành dấu cách trong hiển thị.
 * Hoạt động bằng cách thay thế underscore trong text nodes qua JS nhỏ.
 */
const UNDERSCORE_DISPLAY_SCRIPT = `<script>
(function(){
  function fixUnderscores(el){
    var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null);
    var node;
    while(node=walker.nextNode()){
      var p=node.parentElement;
      if(p&&(p.tagName==='SCRIPT'||p.tagName==='STYLE'||p.hasAttribute('data-var')||p.hasAttribute('data-keep-underscore')))continue;
      if(node.textContent&&node.textContent.indexOf('_')!==-1){
        node.textContent=node.textContent.replace(/_/g,' ');
      }
    }
  }
  var root=document.currentScript?document.currentScript.parentElement:document.body;
  if(root)fixUnderscores(root);
})();
</script>`;

/**
 * Hậu xử lý HTML trong regex replaceString sau khi dịch:
 * 1. Thay font chữ Trung/Nhật → font tương thích tiếng Việt
 * 2. Inject script ẩn dấu _ thành dấu cách trong hiển thị
 */
export function postProcessRegexHtml(html: string): string {
  if (!html || typeof html !== 'string') return html;

  let result = html;

  // 1. Thay font Trung/Nhật → font Việt
  for (const [pattern, replacement] of CHINESE_FONT_MAP) {
    result = result.replace(pattern, replacement);
  }

  // 2. Inject underscore display script (chỉ thêm 1 lần, kiểm tra đã có chưa)
  if (!result.includes('fixUnderscores') && result.includes('_')) {
    // Tìm vị trí thích hợp để chèn: trước </div> cuối cùng, hoặc cuối chuỗi
    const lastDivClose = result.lastIndexOf('</div>');
    if (lastDivClose !== -1) {
      result = result.slice(0, lastDivClose) + UNDERSCORE_DISPLAY_SCRIPT + result.slice(lastDivClose);
    } else {
      result += UNDERSCORE_DISPLAY_SCRIPT;
    }
  }

  return result;
}
