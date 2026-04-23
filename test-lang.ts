import { detectLanguage, shouldSkipTranslation } from './src/utils/langDetect.ts';

const text = "那是三天前的傍晚。记忆的画面像被按下了倒带键，周围明亮的教室场景瞬间褪色、重组，变成了那个充满暖黄色灯光的游戏厅。那天我和青羽子正坐在地毯上打游戏，屏幕上的格斗...";
console.log("Detected:", detectLanguage(text));
console.log("Should skip:", shouldSkipTranslation(text, 'Tiếng Việt', '中文'));
