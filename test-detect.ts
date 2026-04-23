import { detectLanguage, shouldSkipTranslation } from './src/utils/langDetect';

const text1 = `那是三天前的傍晚。记忆的画面像被按下了倒带键，周围明亮的教室场景瞬间褪色、重组，变成了那个充满暖黄色灯光的游戏厅。那天我和青羽子正坐在地毯上打游戏，屏幕上的格斗人物正打得难解难分。

"妈妈！这边的领结歪了哦！"

她自然地伸出手帮我整理领口，指尖擦过我的脖子，带着温热的触感。那一瞬间，我心里那点仅存的荒谬感，竟然奇迹般地消失了。取而代之的，是一种酸酸涨涨的、想要流泪的冲动。`;

const text2 = `"妈妈！这边的领结歪了哦！"`;

console.log("text1 detected:", detectLanguage(text1));
console.log("text2 detected:", detectLanguage(text2));

console.log("shouldSkip text1 (VN, CN):", shouldSkipTranslation(text1, 'Tiếng Việt', '中文'));
console.log("shouldSkip text2 (VN, CN):", shouldSkipTranslation(text2, 'Tiếng Việt', '中文'));

// What if source language is "auto"?
console.log("shouldSkip text1 (VN, auto):", shouldSkipTranslation(text1, 'Tiếng Việt', 'auto'));

// What if source language is actually "CN 中文" literally?
console.log("shouldSkip text1 (VN, CN 中文):", shouldSkipTranslation(text1, 'Tiếng Việt', 'CN 中文'));
