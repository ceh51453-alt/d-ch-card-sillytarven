# Hướng Dẫn Xây Dựng Card Frontend — SillyTavern V3

> Tài liệu tham chiếu toàn diện cho việc tạo character card có UI tương tác.
> Phân tích từ file mẫu: **chuyển sinh thành slimev5.42.json** (YouYuJun233)

---

## Mục Lục
1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Cấu Trúc File JSON](#2-cấu-trúc-file-json)
3. [Regex Scripts — Core Engine](#3-regex-scripts--core-engine)
4. [Kiến Trúc UI: Single Regex Pattern](#4-kiến-trúc-ui-single-regex-pattern)
5. [first_mes — Splash Screen](#5-first_mes--splash-screen)
6. [Lorebook — World Data](#6-lorebook--world-data)
7. [State Management — localStorage + Dexie](#7-state-management--localstorage--dexie)
8. [CSS Design System](#8-css-design-system)
9. [Layout 3 Pane](#9-layout-3-pane)
10. [Modal & Overlay System](#10-modal--overlay-system)
11. [Responsive Design](#11-responsive-design)
12. [MVU/Zod Configuration](#12-mvuzod-configuration)
13. [Communication: Iframe ↔ Parent](#13-communication-iframe--parent)
14. [External Dependencies](#14-external-dependencies)
15. [Encoding & Mojibake](#15-encoding--mojibake)
16. [Lỗi Thường Gặp & Khắc Phục](#16-lỗi-thường-gặp--khắc-phục)
17. [Checklist Tạo Card Mới](#17-checklist-tạo-card-mới)

---

## 1. Tổng Quan Kiến Trúc

Card frontend SillyTavern V3 hoạt động như một **ứng dụng web đơn trang (SPA)** được nhúng vào chat thông qua cơ chế regex. Toàn bộ HTML/CSS/JS nằm trong một trường `replaceString` duy nhất.

### Sơ Đồ Kiến Trúc

```
┌──────────────────────────────────────────────────┐
│ SillyTavern Chat Window                          │
│                                                  │
│  AI Message chứa keyword "youyujun233"           │
│       ↓ regex match                              │
│  ┌────────────────────────────────────────────┐   │
│  │ <iframe> (DOMPurify bypass via ```html```) │   │
│  │                                            │   │
│  │  ┌──────┬──────────┬────────┐              │   │
│  │  │ LEFT │  CENTER  │ RIGHT  │  ← 3 Pane   │   │
│  │  │ Pane │  (Chat)  │ Pane   │              │   │
│  │  └──────┴──────────┴────────┘              │   │
│  │                                            │   │
│  │  State: localStorage + IndexedDB (Dexie)   │   │
│  │  DOM:   document.getElementById (1117x)    │   │
│  │  Comm:  parent.postMessage / parent.*      │   │
│  └────────────────────────────────────────────┘   │
│                                                  │
│  Lorebook (~60 entries) → AI context/knowledge   │
└──────────────────────────────────────────────────┘
```

### Hai Mô Hình Card Chính

| Đặc điểm | Mô hình MVU/Zod | Mô hình Self-contained (slimev5.42) |
|-----------|-----------------|-------------------------------------|
| State | MVU variables qua SillyTavern API | localStorage + IndexedDB (Dexie) |
| DOM Access | `window.getAllVariables()` | `document.getElementById()` |
| Communication | `triggerSlash()`, `eventOn()` | `parent.*`, `fetch()` |
| Regex Scripts | 5-6 scripts chuyên biệt | **1 script duy nhất** (~2MB) |
| UI Injection | Nhiều regex nhỏ, mỗi cái 1 chức năng | 1 regex = toàn bộ ứng dụng |
| Complexity | Trung bình | Rất cao (full SPA) |
| Dùng khi | Card đơn giản, dashboard | Card RPG phức tạp, game engine |

---

## 2. Cấu Trúc File JSON

```
{
  "spec": "chara_card_v3",
  "data": {
    "name": "tên card",
    "first_mes": "...",           ← Splash screen HTML
    "description": "...",         ← System prompt (có thể rỗng)
    "mes_example": "...",         ← Ví dụ chat (có thể rỗng)
    "extensions": {
      "regex_scripts": [          ← MỘT script = toàn bộ UI
        {
          "scriptName": "...",
          "findRegex": "keyword",
          "replaceString": "```html\n<!DOCTYPE html>...\n```",
          "markdownOnly": true,
          "placement": [2]
        }
      ]
    },
    "character_book": {           ← Lorebook
      "entries": [ ... ]          ← ~60 entries cho world-building
    }
  }
}
```

### Giải Thích Từng Trường

| Trường | Vai trò | Ví dụ từ slimev5.42 |
|--------|---------|---------------------|
| `name` | Tên hiển thị | `"slimev5.42"` |
| `first_mes` | Tin nhắn đầu tiên — chứa splash screen HTML | ~100KB HTML |
| `description` | System prompt cho AI | Rỗng (dùng lorebook thay thế) |
| `mes_example` | Ví dụ hội thoại | Rỗng |
| `regex_scripts` | Engine render UI | 1 script, ~2MB |
| `character_book` | World data, rules, races | ~60 entries |

---

## 3. Regex Scripts — Core Engine

### Cấu Hình Quan Trọng

| Trường | Giá trị | Ý nghĩa |
|--------|---------|---------|
| `findRegex` | `"youyujun233"` | Keyword kích hoạt — AI phải trả về keyword này |
| `replaceString` | `"```html\n<!DOCTYPE html>...\n```"` | Toàn bộ ứng dụng HTML/CSS/JS |
| `markdownOnly` | `true` | **Chỉ render UI**, không ảnh hưởng prompt AI |
| `placement` | `[2]` | Chỉ áp dụng cho tin nhắn AI |
| `promptOnly` | `false` | Không gửi UI code vào prompt |
| `runOnEdit` | `false` | Không re-render khi edit |

### Quy Tắc Bọc HTML

**BẮT BUỘC**: Toàn bộ HTML có chứa `<script>` phải được bọc trong fenced code block:

```
replaceString = "Mô tả ngắn\n```html\n<!DOCTYPE html>\n...\n```"
```

> Lý do: SillyTavern sử dụng DOMPurify để sanitize HTML. Bọc trong ` ```html ``` ` sẽ bypass filter này, cho phép JavaScript chạy trong iframe.

### Keyword Strategy

```
findRegex: "youyujun233"  ← keyword duy nhất, không trùng text thường
```

- Keyword phải **duy nhất** và **khó xuất hiện ngẫu nhiên** trong text thông thường.
- AI được hướng dẫn (qua lorebook/system prompt) luôn bao gồm keyword này trong phản hồi.
- Khi regex match, toàn bộ keyword bị thay thế bằng UI app.

---

## 4. Kiến Trúc UI: Single Regex Pattern

### So Sánh Hai Mẫu Regex

**Mẫu A: Multi-Regex (MVU cards đơn giản)**
```
Script 0: Ẩn placeholder    → promptOnly
Script 1: Xóa update tags   → promptOnly
Script 2: Loading UI         → markdownOnly
Script 3: Done UI            → markdownOnly
Script 4: Dashboard          → markdownOnly
Script 5: Form khởi đầu     → markdownOnly
```

**Mẫu B: Single-Regex (slimev5.42 — card phức tạp)**
```
Script 0: Toàn bộ ứng dụng  → markdownOnly, placement [2]
           ├── Splash screen (quản lý riêng trong first_mes)
           ├── Game panel (3 pane layout)
           ├── 20+ modal overlays
           ├── Map editor
           ├── Inventory system
           ├── Character management
           ├── Alchemy system
           └── Settings panels
```

### Khi Nào Dùng Pattern Nào?

| Tiêu chí | Multi-Regex | Single-Regex |
|-----------|-------------|--------------|
| Độ phức tạp UI | Đơn giản (1-2 panel) | Phức tạp (game engine) |
| Số lượng components | < 5 | > 10 |
| State management | MVU variables đủ | Cần localStorage/DB |
| File size | < 100KB | > 500KB |
| Maintainability | Dễ debug từng script | Phải tổ chức code tốt |

---

## 5. first_mes — Splash Screen

`first_mes` trong slimev5.42 chứa một **splash screen HTML hoàn chỉnh** — màn hình chào mừng khi lần đầu mở card.

### Cấu Trúc Splash Screen

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* CSS cho splash screen */
    .splash-content { ... }
    .splash-btn { ... }
    .instructions-list { ... }
  </style>
</head>
<body>
  <!-- Video/Image nền -->
  <div id="splash-screen">
    <video id="splash-video-bg" autoplay muted loop>...</video>
    
    <!-- Tiêu đề game -->
    <div id="splash-content">
      <h1 id="splash-title">Tên Game</h1>
      <div id="splash-buttons">
        <button class="splash-btn">Bắt Đầu</button>
        <button class="splash-btn">Tiếp Tục</button>
      </div>
    </div>
  </div>

  <!-- Hướng dẫn sử dụng -->
  <div class="container">
    <h2>Hướng Dẫn</h2>
    <ul class="instructions-list">
      <li>Cài đặt plugin...</li>
      <li>Lưu ý về Preset...</li>
    </ul>
  </div>
</body>
</html>
```

### Lưu Ý first_mes

1. **Không chứa logic game** — chỉ là UI chào mừng.
2. **CSS tự chứa** — không phụ thuộc vào main app CSS.
3. **Hướng dẫn người dùng** — bao gồm notes về plugin, cài đặt, troubleshooting.
4. **Nút bấm** — có thể trigger start game flow.

---

## 6. Lorebook — World Data

slimev5.42 sử dụng **~60 lorebook entries** để cung cấp context cho AI, bao gồm:

### Phân Loại Entries

| Loại | Số lượng | Ví dụ |
|------|----------|-------|
| Chủng tộc | ~20 | Human, Elf, Dwarf, Slime, Goblin... |
| Quy tắc hệ thống | ~15 | Kiểm định, chiến đấu, sát thương... |
| Thước đo thiết kế | ~8 | Kỹ năng, vật phẩm, nhiệm vụ... |
| World-building | ~10 | Vương quốc, thế lực, thần linh... |
| Hành vi AI | ~5 | Định dạng, chain of thought, nhập vai... |

### Cấu Trúc Entry Lorebook

```json
{
  "keys": ["Elf", "Tinh linh"],      // Keywords trigger
  "content": "<tag>\nNội dung...",     // Nội dung
  "order": 100,                        // Thứ tự ưu tiên
  "position": "before_char",           // Vị trí trong prompt
  "enabled": true,
  "insertion_order": 100,
  "constant": false,                   // true = luôn bật
  "selective": false,
  "secondary_keys": [],
  "scan_depth": null,                  // null = mặc định
  "recursive": true,                   // Quét đệ quy
  "group_weight": 100
}
```

### Best Practices Lorebook

1. **Keys rõ ràng**: Mỗi entry có keywords cụ thể (VD: `["Elf", "Tinh linh"]`).
2. **Entries hệ thống** (constant): Luôn bật cho các quy tắc cốt lõi.
3. **Entries chủng tộc**: Chỉ kích hoạt khi AI nhắc đến keyword liên quan.
4. **Tránh trùng lặp**: Mỗi domain knowledge nên có đúng 1 entry.
5. **Content format**: Bọc trong tag XML tùy chỉnh (VD: `<Quy tắc kiểm định>...</Quy tắc kiểm định>`).

---

## 7. State Management — localStorage + Dexie

### localStorage (25 lần sử dụng trong slimev5.42)

```javascript
// Lưu state
localStorage.setItem('game_state', JSON.stringify(state));

// Đọc state
const state = JSON.parse(localStorage.getItem('game_state') || '{}');

// Key naming convention
localStorage.setItem('game_settings', ...);     // Cài đặt
localStorage.setItem('game_characters', ...);   // Nhân vật
localStorage.setItem('game_inventory', ...);    // Vật phẩm
```

### Dexie (IndexedDB wrapper)

```html
<!-- Import Dexie -->
<script src="https://unpkg.com/dexie/dist/dexie.js"></script>
```

```javascript
// Tạo database
const db = new Dexie('GameDatabase');
db.version(1).stores({
  characters: '++id, name, level',
  items: '++id, name, rarity',
  logs: '++id, timestamp, content'
});

// CRUD operations
await db.characters.add({ name: 'Hero', level: 1 });
const hero = await db.characters.get(1);
await db.characters.update(1, { level: 2 });
```

### Khi Nào Dùng Gì?

| Dùng | localStorage | Dexie (IndexedDB) |
|------|-------------|-------------------|
| Settings/config | ✅ | ❌ |
| Dữ liệu nhỏ (< 5MB) | ✅ | ✅ |
| Dữ liệu lớn (> 5MB) | ❌ | ✅ |
| Query phức tạp | ❌ | ✅ |
| Dữ liệu có cấu trúc | ❌ | ✅ |
| Map/image data | ❌ | ✅ |

---

## 8. CSS Design System

### CSS Variables (Custom Properties)

slimev5.42 sử dụng hệ thống CSS variables toàn diện:

```css
:root {
    /* Scale */
    --panel-scale: 1.0;
    
    /* Typography */
    --ai-font-size: 1.05em;
    --ai-font-color: #FFFFFF;
    --chat-font-family: 'Lora', serif;
    
    /* Colors — Primary palette */
    --primary-color: #7A78C2;
    --hover-color: #9896E0;
    --text-primary: #F0F4FF;
    --accent-color: #82D8F7;
    --accent-color-darker: #4A4880;
    
    /* Separators */
    --separator-rgb: 61, 64, 89;
    --separator-color: #3D4059;
    
    /* Background */
    --center-pane-bg: rgba(26, 29, 46, 0.1);
    --chat-bg-opacity: 1;
    --chat-bg-blur: 0px;
    
    /* Rarity colors — cho item/trait system */
    --rarity-mundane: #808080;
    --rarity-common: #CCCCCC;
    --rarity-rare: #4fc3f7;
    --rarity-epic: #ba68c8;
    --rarity-legendary: #ffd700;
    --rarity-mythic: #ff5252;
}
```

### Google Fonts

```css
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Long+Cang&display=swap');
```

| Font | Dùng cho |
|------|----------|
| **Cinzel** | Tiêu đề, splash screen |
| **Lora** | Body text, chat messages |
| **Press Start 2P** | Retro/game elements |
| **Long Cang** | Decorative headings |

### Theme System (Day/Night)

```css
/* Night theme (mặc định) */
body {
    background-color: #1A1D2E;
    color: #D8DEE9;
}

/* Day theme */
body.theme-day {
    --ai-font-color: #3D4F6C;
    --primary-color: #6A8EAF;
    --hover-color: #537595;
    --text-primary: #2c3e50;
    --accent-color: #88A9C3;
    background-color: #F0F4F8;
}

/* Theme-specific overrides */
body.theme-day .game-panel {
    background-image: none;
    background-color: #F7F9FF;
}
```

---

## 9. Layout 3 Pane

### Desktop Layout

```
┌──────────┬────────────────────┬──────────┐
│ LEFT     │      CENTER        │  RIGHT   │
│ (280-    │      (flex-grow)   │  (220-   │
│  350px)  │                    │   280px) │
│          │  ┌──────────────┐  │          │
│ ● Avatar │  │  Chat Area   │  │ ● Zoom  │
│ ● Stats  │  │  (messages)  │  │ ● Theme │
│ ● Equip  │  │              │  │ ● Save  │
│ ● Inven  │  │              │  │ ● Tasks │
│          │  └──────────────┘  │          │
│          │  [Input] [Send]    │          │
└──────────┴────────────────────┴──────────┘
```

### CSS Implementation

```css
.game-panel {
    display: flex;
    width: 100%;
    height: 100%;
    max-height: 100vh;
    max-height: 100dvh;      /* Dynamic viewport height */
    overflow: hidden;
    box-sizing: border-box;
}

.left-pane {
    width: clamp(280px, 20vw, 350px);
    flex-shrink: 0;
    padding: 20px;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}

.center-pane {
    flex-grow: 1;
    padding: 20px;
    border-left: 1px solid var(--separator-color);
    border-right: 1px solid var(--separator-color);
    display: flex;
    flex-direction: column;
}

.right-pane {
    width: clamp(220px, 15vw, 280px);
    flex-shrink: 0;
    padding: 20px;
    display: flex;
    flex-direction: column;
}
```

---

## 10. Modal & Overlay System

### Cấu Trúc Modal Standard

```html
<!-- Overlay backdrop -->
<div id="my-overlay" class="overlay">
  <!-- Modal container -->
  <div class="modal item-detail-modal">
    <!-- Close button (sticky) -->
    <button class="modal-close-btn">✕</button>
    
    <!-- Title -->
    <h4>Tiêu Đề Modal</h4>
    
    <!-- Scrollable content -->
    <div class="modal-content">
      <!-- Content here -->
    </div>
    
    <!-- Footer actions -->
    <div class="modal-footer">
      <button class="major-action-button">Action</button>
    </div>
  </div>
</div>
```

### CSS cho Modal

```css
.overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background-color: rgba(0,0,0,0.75);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
}

.overlay.visible {
    opacity: 1;
    pointer-events: auto;
}

.modal {
    background-image: url('https://www.transparenttextures.com/patterns/stardust.png');
    background-color: #2c2a2a;
    border: 2px solid var(--primary-color);
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    transition: transform 0.3s ease;
}

.overlay.visible .modal {
    transform: scale(1);
}
```

### Z-Index Hierarchy

```
1000  — Standard overlays
1200  — Mobile panes
1500  — Character creation screen
1600  — Map, Skills, Tasks, Achievements
1700  — Equipment picker, Skill detail
1800  — Custom editors, Trait detail
2000  — Context menu
2100  — System settings
2200  — Summary viewer
6000  — Custom dialog (highest)
```

---

## 11. Responsive Design

### Breakpoints

```css
/* Desktop: > 992px  — 3 pane layout */
/* Tablet:  ≤ 992px  — Mobile layout */

@media (max-width: 992px) {
    .game-panel {
        flex-direction: column;
    }
    
    .left-pane, .right-pane {
        position: fixed;
        z-index: 1200;
        transform: translateX(-100%); /* hidden by default */
        transition: transform 0.3s ease-in-out;
        padding-top: 60px;
    }
    
    .left-pane { left: 0; width: clamp(280px, 80vw, 350px) !important; }
    .right-pane { right: 0; width: clamp(220px, 60vw, 280px) !important; }
    
    /* Show panels with class toggle */
    .game-panel.left-pane-visible .left-pane { transform: translateX(0); }
    .game-panel.right-pane-visible .right-pane { transform: translateX(0); }
}
```

### Mobile Header

```css
.mobile-header {
    display: none; /* Hidden on desktop */
}

@media (max-width: 992px) {
    .mobile-header {
        display: flex;
        justify-content: space-between;
        padding: 10px 15px;
        background: rgba(0,0,0,0.3);
    }
}
```

### FAB (Floating Action Button)

```css
#fab-container {
    --fab-size: 56px;
    --fab-menu-radius: 110px;
    position: absolute;
    bottom: 80px;
    right: 20px;
    z-index: 1001;
}

/* Mobile: smaller FAB */
@media (max-width: 992px) {
    #fab-container {
        --fab-size: 50px;
        --fab-menu-radius: 80px;
    }
}
```

---

## 12. MVU/Zod Configuration

> **Áp dụng cho cards sử dụng mô hình MVU/Zod** (không phải self-contained như slimev5.42)

### ⚠️ Quy Tắc Bắt Buộc

1. **`initvar` phải để `[]`**

   ```json
   "initvar": []
   ```

   Mảng `initvar` mặc định phải được thiết lập là `[]` (rỗng). Nếu không, khi load character sẽ gặp lỗi ghi đè dữ liệu hoặc parse MVU state không chính xác.

2. **Biến HTML phải khớp 100% với Zod schema**

   ```
   Zod Schema:  hp, mp, attack, defense
   HTML Table:  hp, mp, attack, defense  ✅
   HTML Table:  HP, MP, atk, def         ❌ SAI!
   ```

   Tên các biến hiển thị trong bảng HTML **bắt buộc khớp chính xác hoàn toàn** với các biến được khai báo trong Zod schema. Sai lệch → bảng không tự cập nhật.

### MVU API Reference

| API | Chức năng |
|-----|----------|
| `window.getAllVariables()` | Lấy toàn bộ biến MVU |
| `window.waitGlobalInitialized('Mvu')` | Chờ engine sẵn sàng |
| `window.eventOn(event, callback)` | Lắng nghe sự kiện |
| `triggerSlash('/command')` | Chạy lệnh slash |
| `getCurrentMessageId()` | Lấy ID tin nhắn hiện tại |

### Gửi Dữ Liệu Từ Form

```javascript
if (typeof triggerSlash === 'function' && typeof getCurrentMessageId === 'function') {
    const msgId = getCurrentMessageId();
    triggerSlash('/sys ' + nội_dung);
    setTimeout(() => triggerSlash('/trigger'), 500);
    setTimeout(() => triggerSlash('/cut ' + msgId), 1500);
}
```

> **Không dùng** `document.getElementById('send_textarea')` khi sử dụng MVU — HTML render trong iframe.

---

## 13. Communication: Iframe ↔ Parent

### Mô hình slimev5.42: parent.* (91 lần)

```javascript
// Gọi hàm từ parent (SillyTavern)
parent.someFunction();

// Truy cập parent DOM
parent.document.querySelector('#something');

// Event communication
window.addEventListener('message', (event) => {
    // Handle messages from parent
});
```

### Caveat

- **`document.getElementById()`** — Chỉ truy cập DOM **bên trong iframe** (OK cho self-contained).
- **`parent.*`** — Truy cập SillyTavern DOM bên ngoài iframe (cần cẩn thận).
- **`triggerSlash()`** — Cách an toàn nhất để tương tác với SillyTavern (MVU model).

---

## 14. External Dependencies

slimev5.42 sử dụng các CDN sau:

| Library | URL | Dùng cho |
|---------|-----|----------|
| Font Awesome 6 | `cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css` | Icons |
| Dexie.js | `unpkg.com/dexie/dist/dexie.js` | IndexedDB wrapper |
| vis-network | `unpkg.com/vis-network/standalone/umd/vis-network.min.js` | Relationship graphs |
| polygon-clipping | `unpkg.com/polygon-clipping@0.15.3/dist/polygon-clipping.umd.min.js` | Map polygon editing |
| html2canvas | `cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js` | Screenshot export |
| Google Fonts | `fonts.googleapis.com/css2?family=...` | Typography |
| Transparent Textures | `transparenttextures.com/patterns/stardust.png` | Background pattern |

### Nguyên Tắc CDN

1. **Ưu tiên unpkg/cdnjs** — ổn định, nhanh.
2. **Pin phiên bản** — tránh breaking changes (VD: `@0.15.3`).
3. **Tải async** — không block rendering.
4. **Fallback** — cân nhắc inline code cho dependencies quan trọng.

---

## 15. Encoding & Mojibake

### Quy Tắc Encoding

- **Luôn** đọc/ghi JSON với `encoding='utf-8'`.
- **Luôn** dùng `json.dump(data, f, ensure_ascii=False)`.
- **Viết trực tiếp** tiếng Việt, không dùng `\uXXXX` trong Python string.

### Sửa Mojibake

```python
# Text bị lỗi: "Ä\u0091á»\u0099c"
fixed = broken_text.encode('windows-1252').decode('utf-8')
# Kết quả: "độc"
```

---

## 16. Lỗi Thường Gặp & Khắc Phục

| Lỗi | Nguyên nhân | Khắc phục |
|-----|-------------|-----------|
| HTML hiện dạng code, không render | Thiếu bọc ` ```html ``` ` | Bọc replaceString trong fenced code block |
| Chữ Việt bị `á»`, `Ä` | Sai encoding | Re-encode cp1252 → utf-8 |
| Chữ hiện `\u1eadp` | Dùng escape Unicode | Viết UTF-8 trực tiếp |
| Form hiện ở mỗi tin nhắn | findRegex match quá rộng | Dùng keyword duy nhất, cụ thể |
| Nút bấm không hoạt động (MVU) | Dùng DOM API trong iframe | Dùng `triggerSlash()` thay vì truy DOM cha |
| Chat cũ không hiện form mới | first_mes đã cached | Tạo chat mới |
| UI bị treo/freeze | Regex loop vô hạn hoặc JS nặng | Kiểm tra regex, dùng async/requestAnimationFrame |
| Card conflict với Preset plugin | Plugin Preset ghi đè regex | Tắt plugin Preset hoặc tắt regex gây lỗi |
| Modal không đóng được | Z-index conflict | Kiểm tra z-index hierarchy |
| Mobile layout vỡ | Thiếu responsive CSS | Thêm `@media (max-width: 992px)` rules |
| localStorage bị mất | User clear browser data | Implement export/import backup |
| CDN không load | Bị block hoặc timeout | Pin version, cân nhắc inline fallback |

---

## 17. Checklist Tạo Card Mới

### Bước 1: Quyết Định Mô Hình

- [ ] **MVU/Zod** — cho card đơn giản (dashboard, form)
- [ ] **Self-contained** — cho card phức tạp (game, RPG)

### Bước 2: Thiết Lập Cấu Trúc JSON

- [ ] Tạo file JSON với `spec: "chara_card_v3"`
- [ ] Viết `first_mes` (splash screen hoặc trigger keyword)
- [ ] Tạo `regex_scripts` với `markdownOnly: true`, `placement: [2]`
- [ ] Chọn `findRegex` keyword duy nhất

### Bước 3: Xây Dựng UI

- [ ] Thiết lập CSS variables (`:root`)
- [ ] Import fonts từ Google Fonts
- [ ] Xây layout (3 pane hoặc single panel)
- [ ] Tạo modal/overlay system
- [ ] Implement responsive `@media` rules

### Bước 4: State Management

- [ ] Chọn localStorage hoặc Dexie
- [ ] Implement save/load state
- [ ] Thêm export/import backup

### Bước 5: Lorebook (nếu cần)

- [ ] Tạo entries cho world-building
- [ ] Set keys rõ ràng cho mỗi entry
- [ ] Config constant entries cho quy tắc cốt lõi
- [ ] Tránh trùng lặp content

### Bước 6: MVU/Zod (nếu dùng)

- [ ] **Set `initvar` = `[]`** ⚠️
- [ ] **Đảm bảo biến HTML = biến Zod schema** ⚠️
- [ ] Test `getAllVariables()` trả về đúng

### Bước 7: Testing

- [ ] Test trên desktop (> 992px)
- [ ] Test trên mobile (≤ 992px)
- [ ] Test encoding tiếng Việt
- [ ] Test với Preset plugin tắt
- [ ] Test tạo chat mới
- [ ] Kiểm tra file size (< 5MB recommended)

### Bước 8: Encoding

- [ ] Đảm bảo file JSON là UTF-8
- [ ] Không có escape Unicode `\uXXXX` cho tiếng Việt
- [ ] Test đọc lại file không bị Mojibake
