# Hướng Dẫn: Cấu Trúc Render HTML & Cách Hoạt Động Của Regex Trong SillyTavern

> Tài liệu này giải thích chi tiết cách hệ thống **Regex Scripts** trong SillyTavern hoạt động, cách `replaceString` được render thành HTML trên giao diện chat, và cách tool Regex Manager hiển thị preview.

---

## 1. Tổng Quan — Regex Script Là Gì?

Trong SillyTavern, mỗi **Regex Script** là một bộ lọc find-and-replace được áp dụng lên nội dung tin nhắn. Cấu trúc JSON:

```json
{
  "scriptName": "Tên script",
  "findRegex": "/pattern/flags",
  "replaceString": "<div class='chinh_van'>$1</div>",
  "trimStrings": ["chuỗi cần cắt bỏ"],
  "placement": ["AI_OUTPUT"],
  "disabled": false,
  "markdownOnly": true,
  "promptOnly": false,
  "substituteRegex": false,
  "minDepth": 0,
  "maxDepth": 999
}
```

### Các trường quan trọng:

| Trường | Mô tả |
|---|---|
| `scriptName` | Tên hiển thị, dùng để quản lý |
| `findRegex` | Biểu thức chính quy (regex pattern) để tìm kiếm trong tin nhắn |
| `replaceString` | Chuỗi thay thế — **có thể chứa HTML, CSS, JS, jQuery, EJS** |
| `trimStrings` | Danh sách chuỗi cần xóa khỏi kết quả trước khi hiển thị |
| `placement` | Nơi áp dụng: `AI_OUTPUT`, `USER_INPUT`, `SLASH_COMMAND` |
| `markdownOnly` | Chỉ áp dụng khi render markdown (hiển thị UI), không ảnh hưởng prompt |
| `promptOnly` | Chỉ áp dụng khi gửi prompt đến LLM, không hiển thị trên UI |

---

## 2. Pipeline Xử Lý — Từ Tin Nhắn Đến HTML

```
┌────────────────────────────────────────────────────────────────────┐
│                    SILLYTAVERN MESSAGE PIPELINE                     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. LLM trả về tin nhắn (raw text)                                │
│     ↓                                                              │
│  2. Markdown parser (marked.js) chuyển text → HTML                │
│     ↓                                                              │
│  3. ═══ REGEX ENGINE ═══                                          │
│     Duyệt qua từng RegexScript:                                   │
│     • Kiểm tra placement (AI_OUTPUT? USER_INPUT?)                 │
│     • Kiểm tra disabled, minDepth/maxDepth                        │
│     • Thực thi: message.replace(findRegex, replaceString)         │
│     • Áp dụng trimStrings để xóa chuỗi thừa                     │
│     ↓                                                              │
│  4. HTML đã được inject bởi regex → render vào DOM chat           │
│     ↓                                                              │
│  5. jQuery/Script trong replaceString được thực thi               │
│     (nếu có <script> blocks)                                      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Ví dụ cụ thể:

**Input** (tin nhắn LLM):
```
*Nàng bước đến bên hồ, ánh trăng phản chiếu.*
"Ta đợi ngươi rất lâu rồi."
[Suy nghĩ: Người này là ai?]
```

**findRegex:** `/^\*(.+)\*$/gm`
**replaceString:** `<span class="hanhdong">$1</span>`

**Output HTML:**
```html
<span class="hanhdong">Nàng bước đến bên hồ, ánh trăng phản chiếu.</span>
"Ta đợi ngươi rất lâu rồi."
[Suy nghĩ: Người này là ai?]
```

---

## 3. Cấu Trúc HTML Bên Trong `replaceString`

`replaceString` không chỉ là chuỗi đơn giản — nó có thể chứa **6 loại nội dung** phức tạp:

### 3.1. Pure HTML (Tags & CSS Classes)

Loại phổ biến nhất — thêm styling cho tin nhắn:

```html
<div class="chinh_van">
  <span style="color: #c7d2fe; border-left: 3px solid #6366f1; padding-left: 10px;">
    $1
  </span>
</div>
```

**Capture Groups:**
- `$1`, `$2`, ... — Nội dung khớp từ các group `()` trong `findRegex`
- `$&` — Toàn bộ chuỗi khớp (match toàn phần)

### 3.2. `<style>` Blocks — CSS Nội Tuyến

Inject CSS trực tiếp vào trang chat:

```html
<style>
  .chinh_van {
    border-left: 3px solid #6366f1;
    padding-left: 10px;
    margin: 4px 0;
    color: #c7d2fe;
  }
  .thoai {
    color: #67e8f9;
    font-style: italic;
  }
</style>
<div class="chinh_van">$1</div>
```

### 3.3. `<script>` Blocks — JavaScript/jQuery

Thực thi logic phức tạp khi tin nhắn được render:

```html
<div class="section">
  <div class="section-header" onclick="toggleSection(this)">
    📊 Thông số nhân vật
  </div>
  <div class="section-content">$1</div>
</div>

<script>
function toggleSection(el) {
  $(el).next('.section-content').toggleClass('hidden');
  $(el).toggleClass('collapsed');
}
</script>
```

### 3.4. jQuery Patterns

SillyTavern tích hợp jQuery, nên replaceString thường dùng:

```html
<script>
$(document).ready(function() {
  // Toggle accordion sections
  $(document).on('click', '.section-header', function() {
    $(this).toggleClass('collapsed');
    $(this).next('.section-content').toggleClass('hidden');
  });
  
  // Update stats dynamically
  $('.hp-bar').css('width', $1 + '%');
});
</script>
```

### 3.5. EJS Template Blocks

Nếu card dùng extension **ST-Prompt-template**, replaceString có thể chứa EJS:

```html
<% 
  var hp = getvar('stat_data.hp_current');
  var maxHp = getvar('stat_data.hp_max');
  var percent = Math.round(hp / maxHp * 100);
%>
<div class="hp-display">
  <div class="hp-bar" style="width: <%= percent %>%"></div>
  <span class="hp-text"><%= hp %>/<%= maxHp %></span>
</div>
```

### 3.6. Inline Event Handlers

```html
<div class="action-btn" 
     onclick="alert('Tấn công!')" 
     onmouseover="this.style.opacity='0.8'"
     onmouseout="this.style.opacity='1'">
  ⚔️ $1
</div>
```

---

## 4. Cách Phân Tích Cấu Trúc (Structure Analysis)

Tool sử dụng engine `regexInjector.ts` để phân tích replaceString thành các "zone":

```typescript
interface ReplaceStringStructure {
  htmlZones: Zone[];           // Vùng HTML thuần (không phải script/style)
  scriptZones: Zone[];         // <script>...</script> blocks
  styleZones: Zone[];          // <style>...</style> blocks
  ejsBlocks: Zone[];           // <% ... %> template blocks
  captureGroups: string[];     // $1, $2, $& được sử dụng
  functions: FunctionInfo[];   // Các function được khai báo trong script
  jqueryReadyBlocks: Zone[];   // $(document).ready(...) blocks
  hasScript: boolean;
  hasStyle: boolean;
  hasEjs: boolean;
}
```

### Ví dụ phân tích:

**Input replaceString:**
```html
<style>.box { color: red; }</style>
<div class="box">$1</div>
<script>
function initBox() {
  $('.box').fadeIn(300);
}
$(document).ready(function() {
  initBox();
});
</script>
```

**Kết quả phân tích:**
```
1 style block(s) | 1 script block(s) | 1 function(s): initBox | Captures: $1 | jQuery ready
```

---

## 5. Cách HTML Preview Hoạt Động (Trong Regex Manager)

### 5.1. Quy Trình Render Preview

```
┌─────────────────────────────────────────────────────────┐
│             REGEX MANAGER — HTML PREVIEW                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Lấy replaceString gốc (original)                   │
│     ↓                                                   │
│  2. Thay thế capture groups bằng text mẫu:             │
│     • $1, $2, $& → "Nội dung mẫu"                     │
│     • Regex: /\$[0-9&]+/g → 'Nội dung mẫu'            │
│     ↓                                                   │
│  3. Bọc trong HTML document đầy đủ (renderSafeHtml):   │
│     • <!DOCTYPE html>                                   │
│     • jQuery CDN                                        │
│     • CSS base (dark theme matching ST)                 │
│     • CSS cho các class phổ biến của ST                 │
│     • Accordion/toggle event handlers                   │
│     ↓                                                   │
│  4. Render trong <iframe> với sandbox="allow-scripts"   │
│     • Cách ly hoàn toàn khỏi trang chính              │
│     • Cho phép chạy JS/jQuery bên trong                │
│     • Chặn truy cập ra ngoài (XSS protection)         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 5.2. Template HTML Bọc Ngoài

Hàm `renderSafeHtml()` tạo một trang HTML hoàn chỉnh:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <!-- jQuery cho interactive elements -->
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    
    <style>
      /* === Base Theme (Match SillyTavern Dark) === */
      body {
        margin: 0;
        padding: 12px 16px;
        background: #0f0f12;
        color: #e8e6f0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 0.9rem;
        line-height: 1.7;
      }
      
      /* === Các class CSS phổ biến của ST Cards === */
      .chinh_van  { border-left: 3px solid #6366f1; padding-left: 10px; color: #c7d2fe; }
      .thoai      { color: #67e8f9; font-style: italic; }
      .hanhdong   { color: #fbbf24; font-style: italic; font-family: monospace; }
      .suy_nghi   { color: #c084fc; font-style: italic; opacity: 0.85; }
      
      /* === Accordion/Section System === */
      .section-header  { cursor: pointer; background: #16161e; padding: 8px 12px; }
      .section-content { padding: 12px 14px; }
      .hidden          { display: none !important; }
    </style>
  </head>
  <body>
    <div class="st-preview">
      <!-- replaceString content được inject ở đây -->
      ${htmlContent}
    </div>
    
    <script>
      // Fallback event binders cho accordion
      $(document).ready(function() {
        $(document).on('click', '.section-header', function() {
          $(this).toggleClass('collapsed');
          $(this).next('.section-content').toggleClass('hidden');
        });
      });
    </script>
  </body>
</html>
```

### 5.3. Iframe Sandbox

Preview được render trong `<iframe>` với thuộc tính bảo mật:

```jsx
<iframe
  title="Original Preview"
  srcDoc={renderSafeHtml(processedContent)}
  sandbox="allow-scripts"    // Cho phép chạy JS
  style={{
    width: '100%',
    height: '240px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)',
    background: '#0f0f12',
  }}
/>
```

**`sandbox="allow-scripts"`** có nghĩa:
- ✅ Cho phép chạy JavaScript/jQuery
- ❌ Không cho phép navigate ra trang khác
- ❌ Không cho phép submit form
- ❌ Không cho phép truy cập parent window
- ❌ Không cho phép popup

---

## 6. Code Injection — Cách Thêm Code Vào replaceString

Engine `regexInjector.ts` cung cấp API để inject code an toàn:

### 6.1. Chiến Lược Tìm Điểm Inject (Auto)

```
┌─────────────────────────────────────────────────────────┐
│           INJECTION POINT SELECTION (Auto Mode)          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Có <script> block?                                     │
│  ├── CÓ → Inject trước </script> cuối cùng            │
│  │         (không cần thêm <script> tag mới)           │
│  │                                                     │
│  └── KHÔNG → Có </div> cuối?                           │
│              ├── CÓ → Tạo <script> mới trước </div>   │
│              │                                         │
│              └── KHÔNG → Tạo <script> mới ở cuối      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 6.2. Các Vị Trí Inject Có Thể Chọn

| Position | Mô tả | Khi nào dùng |
|---|---|---|
| `auto` | Tự động chọn vị trí tốt nhất | Mặc định, phù hợp hầu hết |
| `before_script_end` | Trước `</script>` cuối | Thêm logic vào script hiện có |
| `end_of_script` | Sau script block cuối | Thêm script riêng biệt |
| `after_style` | Sau `</style>` cuối | Thêm script sau CSS |
| `before_closing_div` | Trước `</div>` cuối | Thêm nội dung HTML |
| `new_script_block` | Tạo `<script>` mới ở cuối | Khi cần script hoàn toàn mới |
| `append` | Gắn thêm ở cuối (raw) | Thêm HTML/text đơn giản |

### 6.3. Ví Dụ Inject Function

**Trước inject:**
```html
<div class="stats">$1</div>
<script>
function showStats() {
  $('.stats').show();
}
</script>
```

**Code cần inject:**
```javascript
function hideStats() {
  $('.stats').fadeOut(200);
}
```

**Sau inject (auto mode → trước `</script>`):**
```html
<div class="stats">$1</div>
<script>
function showStats() {
  $('.stats').show();
}

function hideStats() {
  $('.stats').fadeOut(200);
}
</script>
```

### 6.4. CSS Injection

Tương tự, có thể inject CSS:

```
Có <style> block? 
├── CÓ → Inject trước </style> cuối  
└── KHÔNG → Có <script>?
    ├── CÓ → Tạo <style> mới TRƯỚC <script> đầu tiên
    └── KHÔNG → Tạo <style> mới ở đầu
```

---

## 7. Syntax Validation

Khi inject code, engine tự động kiểm tra:

### 7.1. JavaScript Syntax Check

```typescript
// Với mỗi <script> block:
// 1. Thay thế capture groups ($1, $&) bằng placeholder
// 2. Dùng new Function() để kiểm tra syntax
// 3. Báo lỗi nếu có vấn đề

// Sanitize trước khi check:
scriptContent
  .replace(/\$(\d+)/g, '"__CAPTURE_$1__"')     // $1 → string
  .replace(/\$&/g, '"__CAPTURE_FULL__"')        // $& → string
  .replace(/\{\{[^}]+\}\}/g, '"__TEMPLATE__"')  // {{var}} → string
```

### 7.2. HTML Tag Balance Check

```
Đếm số open tags (không tính self-closing: br, hr, img, input, meta, link)
Đếm số close tags
Nếu chênh lệch > 2 → Cảnh báo "HTML tag mismatch"
```

---

## 8. Ví Dụ Thực Tế — Regex Phức Tạp Trong Card Game RPG

### 8.1. Card "Đấu La Đại Lục" — Accordion System

**findRegex:** `/\[PANEL:(.+?)\]([\s\S]*?)\[\/PANEL\]/g`

**replaceString:**
```html
<style>
  .game-panel {
    border: 1px solid #2a2a3e;
    border-radius: 8px;
    margin: 8px 0;
    overflow: hidden;
  }
  .game-panel-header {
    background: linear-gradient(135deg, #1a1a2e, #16213e);
    padding: 10px 14px;
    cursor: pointer;
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
  }
  .game-panel-header:hover {
    background: linear-gradient(135deg, #1e1e3a, #1a2744);
  }
  .game-panel-body {
    padding: 12px 14px;
    background: #0f0f12;
    transition: max-height 0.3s ease;
  }
  .game-panel-body.collapsed {
    display: none;
  }
  .toggle-icon {
    transition: transform 0.2s;
  }
  .toggle-icon.open {
    transform: rotate(90deg);
  }
</style>

<div class="game-panel">
  <div class="game-panel-header" onclick="togglePanel(this)">
    <span>$1</span>
    <span class="toggle-icon open">▶</span>
  </div>
  <div class="game-panel-body">
    $2
  </div>
</div>

<script>
function togglePanel(el) {
  var body = $(el).next('.game-panel-body');
  var icon = $(el).find('.toggle-icon');
  body.toggleClass('collapsed');
  icon.toggleClass('open');
}
</script>
```

### 8.2. Card với EJS + Regex — Thanh HP Động

**findRegex:** `/\[HP:(\d+)\/(\d+)\]/g`

**replaceString:**
```html
<style>
  .hp-container {
    background: #1a1a2e;
    border-radius: 12px;
    padding: 2px;
    margin: 4px 0;
    position: relative;
    height: 22px;
    overflow: hidden;
  }
  .hp-fill {
    height: 100%;
    border-radius: 10px;
    transition: width 0.5s ease;
    background: linear-gradient(90deg, #ef4444, #f97316);
  }
  .hp-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.7rem;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  }
</style>

<div class="hp-container">
  <div class="hp-fill" id="hp-bar"></div>
  <span class="hp-text">$1 / $2 HP</span>
</div>

<script>
$(document).ready(function() {
  var current = parseInt('$1') || 0;
  var max = parseInt('$2') || 100;
  var percent = Math.min(100, Math.max(0, (current / max) * 100));
  
  $('#hp-bar').css('width', percent + '%');
  
  // Đổi màu theo mức HP
  if (percent < 25) {
    $('#hp-bar').css('background', 'linear-gradient(90deg, #dc2626, #ef4444)');
  } else if (percent < 50) {
    $('#hp-bar').css('background', 'linear-gradient(90deg, #f97316, #fbbf24)');
  }
});
</script>
```

---

## 9. Lưu Ý Quan Trọng Khi Dịch Regex

### ⚠️ KHÔNG ĐƯỢC DỊCH:

| Thành phần | Lý do |
|---|---|
| `$1`, `$2`, `$&` | Capture group references — thay đổi sẽ hỏng regex |
| CSS class names | `.chinh_van`, `.thoai` — code JS/jQuery phụ thuộc vào tên này |
| JavaScript/jQuery code | Logic code không phải ngôn ngữ tự nhiên |
| HTML tag names & attributes | `div`, `span`, `onclick`, `class` — cú pháp HTML |
| CSS properties & values | `color`, `padding`, `border` — cú pháp CSS |
| EJS syntax | `<% %>`, `<%= %>` — cú pháp template |

### ✅ CÓ THỂ DỊCH:

| Thành phần | Ví dụ |
|---|---|
| Nội dung text hiển thị | `"Thông số nhân vật"` → `"Character Stats"` |
| Alert/console messages | `alert('Tấn công!')` → nội dung trong quotes |
| Placeholder text | `"Nội dung mẫu"` |
| Comment trong code | `// Cập nhật thanh HP` |
| Title attributes | `title="Bấm để mở"` |

---

## 10. Tóm Tắt Kiến Trúc

```mermaid
graph TD
    A[RegexScript JSON] --> B{findRegex}
    A --> C{replaceString}
    A --> D{trimStrings}
    
    B --> E[Regex Pattern<br/>/pattern/flags]
    
    C --> F[HTML Zones]
    C --> G[Style Blocks]
    C --> H[Script Blocks]
    C --> I[EJS Blocks]
    C --> J[Capture Groups<br/>$1, $2, $&]
    
    H --> K[Functions]
    H --> L[jQuery Ready]
    H --> M[Event Handlers]
    
    F --> N[Preview Iframe]
    G --> N
    H --> N
    J -->|Replace with<br/>"Nội dung mẫu"| N
    
    N --> O[renderSafeHtml<br/>Wrap in full HTML doc]
    O --> P[iframe sandbox=allow-scripts]
    
    style A fill:#1a1a2e,color:#e8e6f0
    style C fill:#16213e,color:#c7d2fe
    style N fill:#0f2027,color:#67e8f9
```

---

## Phụ Lục: Quick Reference

### Regex Capture Groups

| Pattern | Ý nghĩa |
|---|---|
| `$0` hoặc `$&` | Toàn bộ chuỗi khớp |
| `$1` | Group thứ 1 `(...)` |
| `$2` | Group thứ 2 |
| `$'` | Phần sau chuỗi khớp |
| `` $` `` | Phần trước chuỗi khớp |

### Common ST CSS Classes

| Class | Dùng cho |
|---|---|
| `.chinh_van` | Văn bản chính (narrative) |
| `.thoai` | Đối thoại (dialogue) |
| `.hanhdong` | Hành động (action) |
| `.suy_nghi` | Suy nghĩ nội tâm (thoughts) |
| `.section` | Container cho accordion |
| `.section-header` | Tiêu đề accordion (clickable) |
| `.section-content` | Nội dung accordion (toggleable) |
| `.hidden` | Ẩn element |
| `.badge` | Label/tag nhỏ |
| `.divider` | Đường phân cách |
