# 📖 HƯỚNG DẪN TẠO CARD SILLYTAVERN VỚI ZOD + MVU (TOÀN DIỆN)

> **File tham khảo chuẩn** — Mỗi khi cần tạo card, đọc file này.  
> Dựa trên phân tích card **Huyết Lệ Cuối Nguyên** (working, public, có battle system).  
> Cập nhật: 2026-04-08

---

## MỤC LỤC

1. [Kiến Trúc Tổng Quan](#1-kiến-trúc-tổng-quan)
2. [Cấu Trúc JSON V3 Chuẩn](#2-cấu-trúc-json-v3-chuẩn)
3. [Character Info](#3-character-info)
4. [First Message & Khởi Tạo](#4-first-message--khởi-tạo)
5. [Lorebook / World Info](#5-lorebook--world-info)
6. [MVU Entries Hệ Thống](#6-mvu-entries-hệ-thống)
7. [TavernHelper Scripts](#7-tavernhelper-scripts)
8. [Zod Schema Chi Tiết](#8-zod-schema-chi-tiết)
9. [Regex Scripts](#9-regex-scripts)
10. [Build Script](#10-build-script)
11. [Checklist & Troubleshooting](#11-checklist--troubleshooting)

---

## 1. KIẾN TRÚC TỔNG QUAN

Một character card SillyTavern hoàn chỉnh với MVU + Zod gồm **5 thành phần**:

```
Card JSON
├── 1. Character Info ──── name, description, personality, scenario, system_prompt
├── 2. First Message ───── first_mes (text "[khởi tạo]" → Regex thay bằng HTML)
├── 3. Lorebook ─────────── character_book → entries[] (worldbuilding + MVU rules)
│   ├── World Entries ──── Lore, nhân vật, bối cảnh, timeline...
│   └── MVU Entries ────── initvar, update rules, format rules, stat display, văn phong
├── 4. TavernHelper ────── MVU runtime + Zod Schema (2 scripts)
└── 5. Regex Scripts ───── 6 regex (ẩn biến, xóa update, làm đẹp, dashboard, khởi tạo)
```

### Luồng hoạt động khi chơi:

```
User start chat
  → first_mes = "...nội dung...\n[khởi tạo]\n<StatusPlaceHolderImpl/>"
  → Regex "Khởi đầu" thay "[khởi tạo]" bằng HTML form nhập thông tin
  → Regex "Dashboard" thay <StatusPlaceHolderImpl/> bằng HTML bảng trạng thái
  → User điền form → gửi
  → MVU Zod Schema parse biến → lưu state
  → AI phản hồi kèm <UpdateVariable>...</UpdateVariable> + <StatusPlaceHolderImpl/>
  → Regex "Làm đẹp" biến HTML collapsible đẹp
  → Regex "Ẩn" biến khỏi prompt gửi AI
  → Entry "Danh sách biến" inject {{format_message_variable::stat_data}}
  → Regex "Dashboard" thay <StatusPlaceHolderImpl/> bằng HTML dashboard (cập nhật mỗi tin)
  → Hiển thị UI cho user
```

> 🔴 **QUAN TRỌNG:** `<StatusPlaceHolderImpl/>` **BẮT BUỘC** phải có trong `first_mes` VÀ trong mọi tin nhắn AI (do Lorebook entry "Nhấn mạnh định dạng xuất biến" ép AI xuất). Nếu thiếu tag này, Regex 4 không có gì để tìm → bảng trạng thái không hiện.

---

## 2. CẤU TRÚC JSON V3 CHUẨN

### 2.1 Mapping từ card Huyết Lệ (WORKING)

Card Huyết Lệ có cấu trúc **lồng 3 lớp** (`data` → `data.data`).  
Tuy nhiên format an toàn nhất cho import là:

```json
{
  "spec": "chara_card_v3",
  "spec_version": "3.0",
  "data": {
    // ═══ Character fields ═══
    "name": "Tên card",
    "description": "",
    "personality": "",
    "scenario": "",
    "first_mes": "...nội dung greeting...\n\n[khởi tạo]\n\n<StatusPlaceHolderImpl/>",
    "mes_example": "",
    "creatorcomment": "",
    "creator_notes": "",
    "system_prompt": "",
    "post_history_instructions": "",
    "tags": [],
    "creator": "",
    "character_version": "1.0",
    "alternate_greetings": [],
    "avatar": "none",
    "talkativeness": "0.5",
    "fav": false,
    "group_only": false,
    "create_date": "2026-01-01T00:00:00.000Z",

    // ═══ Lorebook (V3 native) ═══
    "character_book": {
      "name": "Tên World",
      "entries": [ ... ]       // ← PHẢI là Array []
    },

    // ═══ Extensions ═══
    "extensions": {
      "talkativeness": 0.5,
      "fav": false,
      "depth_prompt": { "prompt": "", "depth": 4, "role": "system" },
      "world": "",

      // TH Scripts
      "tavern_helper": {
        "scripts": [ ... ],    // ← MVU + Zod
        "variables": {}
      },

      // Hoặc (tùy bản ST)
      "TavernHelper_scripts": [ ... ],

      // Regex
      "regex_scripts": [ ... ],

      // Backup lorebook
      "character_book": {
        "name": "...",
        "entries": [ ... ]
      }
    }
  }
}
```

### 2.2 Vị Trí Đặt Từng Thành Phần (Bảng Tham Chiếu)

| Thành phần | Vị trí trong JSON | Format | Bắt buộc |
|-----------|-------------------|--------|----------|
| Character Book | `data.character_book` | `{ name, entries: [] }` | ✅ |
| Character Book (backup) | `data.extensions.character_book` | Giống trên | ⚠️ Nên có |
| TH Scripts (cách 1) | `data.extensions.tavern_helper.scripts` | `[{type,name,content,...}]` | ✅ |
| TH Scripts (cách 2) | `data.extensions.TavernHelper_scripts` | `[{type,name,content,...}]` | ✅ |
| Regex Scripts | `data.extensions.regex_scripts` | `[{scriptName,findRegex,...}]` | ✅ |
| Depth Prompt | `data.extensions.depth_prompt` | `{prompt,depth,role}` | ❌ |

> ⚠️ **ĐẶT LOREBOOK Ở CẢ HAI VỊ TRÍ** để tương thích mọi phiên bản SillyTavern.

---

## 3. CHARACTER INFO

| Field | Vai trò | Trong card Huyết Lệ |
|-------|---------|-------------------|
| `name` | Tên hiển thị | "Huyết Lệ Cuối Nguyên" |
| `description` | Mô tả AI vai trò gì | (trống — dùng lorebook thay) |
| `personality` | Tính cách AI | (trống) |
| `scenario` | Bối cảnh thế giới | (trống) |
| `system_prompt` | Prompt hệ thống | (trống — dùng lorebook thay) |
| `first_mes` | Tin nhắn đầu tiên | `"...\n[khởi tạo]\n<StatusPlaceHolderImpl/>"` |

> **Lưu ý:** Card Huyết Lệ để TRỐNG hầu hết fields ở top level. Toàn bộ logic được đặt trong **lorebook entries** (constant=true). Đây là pattern phổ biến cho card MVU phức tạp.

---

## 4. FIRST MESSAGE & KHỞI TẠO

### 4.1 Pattern chuẩn

```
first_mes = "...nội dung chào mừng, lore mở đầu...\n\n[khởi tạo]\n\n<StatusPlaceHolderImpl/>"
```

**Giải thích 2 tag bắt buộc:**

| Tag | Mục đích | Regex xử lý |
|-----|----------|-------------|
| `[khởi tạo]` | Được Regex 5 tìm và **thay thế** bằng HTML form nhập thông tin nhân vật | Regex 5 |
| `<StatusPlaceHolderImpl/>` | Được Regex 4 tìm và **thay thế** bằng HTML bảng trạng thái | Regex 4 |

> 🔴 **BẮT BUỘC:** `<StatusPlaceHolderImpl/>` **PHẢI** có trong `first_mes`. Nếu thiếu, bảng trạng thái sẽ KHÔNG hiện ở tin nhắn đầu tiên.
>
> Với các tin nhắn AI tiếp theo, Lorebook entry "Nhấn mạnh định dạng xuất biến" sẽ ép AI tự thêm `<StatusPlaceHolderImpl/>` vào cuối mỗi phản hồi → Regex 4 sẽ tìm thấy và render bảng.

Regex script "Khởi đầu" sẽ tìm `\[khởi tạo\]` và thay bằng **HTML form** cho user nhập thông tin nhân vật.

### 4.2 Cấu trúc HTML form khởi tạo (ví dụ thực tế)

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        /* Dark theme form styling */
        .form-container { background: #1a1a2e; border-radius: 12px; padding: 24px; }
        .form-field { margin: 12px 0; }
        .form-field label { color: #a0a0c0; font-size: 14px; }
        .form-field input, .form-field select {
            width: 100%; padding: 8px; background: #16213e;
            border: 1px solid #0f3460; color: #e0e0e0; border-radius: 6px;
        }
        .submit-btn {
            background: linear-gradient(135deg, #e94560, #533483);
            color: white; padding: 12px 24px; border: none;
            border-radius: 8px; cursor: pointer; font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="form-container">
        <h2>⚔️ Tạo Nhân Vật</h2>
        <div class="form-field">
            <label>Tên:</label>
            <input type="text" id="player-name" placeholder="Nhập tên...">
        </div>
        <div class="form-field">
            <label>Giai cấp:</label>
            <select id="player-class">
                <option>Nam Nhân</option>
                <option>Hán Nhân</option>
                <option>Sắc Mục</option>
                <option>Mông Cổ</option>
            </select>
        </div>
        <!-- ...thêm fields... -->
        <button class="submit-btn" onclick="submitForm()">Bắt đầu hành trình</button>
    </div>
    <script>
    function submitForm() {
        const name = document.getElementById('player-name').value;
        const cls = document.getElementById('player-class').value;
        // Gửi message chứa thông tin để AI bắt đầu
        // MVU sẽ tự parse từ tin nhắn qua Update Rules
    }
    </script>
</body>
</html>
```

---

## 5. LOREBOOK / WORLD INFO

### 5.1 Entry Format CHUẨN (phải dùng chính xác)

```json
{
  "id": 1,
  "keys": ["từ khóa 1", "từ khóa 2", "từ khóa 3"],
  "secondary_keys": [],
  "comment": "Tên hiển thị của entry",
  "content": "Nội dung worldbuilding chi tiết...",
  "constant": false,
  "selective": true,
  "insertion_order": 50,
  "enabled": true,
  "position": "after_char",
  "use_regex": false,
  "extensions": {
    "position": 1,
    "exclude_recursion": false,
    "display_index": 1,
    "probability": 100,
    "useProbability": true,
    "depth": 4,
    "selectiveLogic": 0,
    "outlet_name": "",
    "group": "",
    "group_override": false,
    "group_weight": 100,
    "prevent_recursion": false,
    "delay_until_recursion": false,
    "scan_depth": null,
    "match_whole_words": null,
    "use_group_scoring": false,
    "case_sensitive": null,
    "automation_id": "",
    "role": 0,
    "vectorized": false,
    "sticky": 0,
    "cooldown": 0,
    "delay": 0,
    "match_persona_description": false,
    "match_character_description": false,
    "match_character_personality": false,
    "match_character_depth_prompt": false,
    "match_scenario": false,
    "match_creator_notes": false,
    "triggers": [],
    "ignore_budget": false
  }
}
```

### 5.2 Bảng lỗi phổ biến

| ❌ SAI | ✅ ĐÚNG | Hậu quả |
|--------|---------|---------|
| `"key": [...]` | `"keys": [...]` | ST không nhận keywords |
| `"disable": false` | `"enabled": true` | Entries bị tắt hết |
| `entries: { "1": {...} }` | `entries: [ {...} ]` | Import báo lỗi |
| `"order": 50` | `"insertion_order": 50` | Thứ tự inject sai |
| `"position": 1` (number) | `"position": "after_char"` (string) | Vị trí sai |
| Lorebook chỉ ở 1 chỗ | Đặt ở CẢ HAI vị trí | Một số bản ST ko thấy |

### 5.3 Position values

| Giá trị | Ý nghĩa | Khi nào dùng |
|---------|---------|-------------|
| `"before_char"` | Trước tin nhắn AI | Lore, rules, context |
| `"after_char"` | Sau tin nhắn AI | Stat display, update rules |

### 5.4 Các loại entry theo mục đích

| Loại | constant | enabled | keys | position | insertion_order |
|------|----------|---------|------|----------|----------------|
| **World lore** | false | true | [keywords] | "before_char" hoặc "after_char" | 50-145 |
| **Timeline wrapper** | true | true | [] | "before_char" | 140 / 150 |
| **initvar** | true | **false** | [] | "before_char" | 155 |
| **Stat display** | true | true | [] | "after_char" | 999 |
| **MVU update rules** | true | true | [] | "after_char" | 999 |
| **MVU format rules** | true | true | [] | "after_char" | 999 |
| **Văn phong** | true | true | [] | "after_char" | 100 |

---

## 6. MVU ENTRIES HỆ THỐNG (5-6 entries đặc biệt)

Đây là các lorebook entries **bắt buộc** để MVU engine hoạt động:

### 6.1 Entry: `[initvar]Khởi tạo biến` (enabled: FALSE)

```json
{
  "comment": "[initvar]Khởi tạo biến",
  "constant": true,
  "enabled": false,
  "position": "before_char",
  "insertion_order": 155,
  "keys": [],
  "use_regex": true,
  "content": "JSON object phản ánh cấu trúc Zod Schema với giá trị mặc định"
}
```

**Content mẫu (khớp với Zod Schema):**
```json
{
  "Thiên_Hạ": {
    "Thời_Gian": { "Giờ": "", "Ngày": "", "Tháng": "", "Năm": "" },
    "Thời_Tiết": "",
    "Thiên_Tai_Dịch_Bệnh": "Bình thường",
    "Biến_Động_Thiên_Hạ": []
  },
  "Người_Chơi": {
    "Tên": "", "Tuổi": 0, "Giới_Tính": "",
    "Vị_Trí": "", "Trạng_Thái": "",
    "Kỹ_Năng_Sở_Trường": [],
    "Tài_Sản_Chính": { "Bạc_Vụn": 0, "Muối_Trắng": 0 },
    "Túi_Đồ": {}
  },
  "Danh_Tiếng": { "Danh_Hiệu": [], "Uy_Tín_Tổng_Quát": 0, "Quan_Hệ_Thế_Lực": {} },
  "Mạng_Lưới_Nhân_Vật": {},
  "Thế_Lực": {
    "Tên_Thế_Lực": "", "Thủ_Lĩnh": "",
    "Căn_Cứ_Địa": "", "Quy_Mô_Quân_Số": 0,
    "Sĩ_Khí": "", "Lòng_Dân": 50,
    "Chức_Vụ_Của_Bạn": ""
  }
}
```

> ⚠️ **ENABLED: FALSE** — Entry này chỉ là template cho MVU engine đọc khi init. Không được bật!

### 6.2 Entry: `Danh sách biến số` (Stat Display)

```json
{
  "comment": "Danh sách biến số",
  "constant": true,
  "enabled": true,
  "position": "after_char",
  "insertion_order": 999,
  "keys": [],
  "use_regex": true,
  "content": "---\n<status_current_variables>\n{{format_message_variable::stat_data}}\n</status_current_variables>\n"
}
```

> **Cực kỳ quan trọng!** Entry này inject biến MVU hiện tại vào context. Regex "Dashboard" sẽ tìm `<StatusPlaceHolderImpl/>` hoặc `<status_current_variables>` để hiển thị UI.

### 6.3 Entry: `[mvu_update] Quy tắc cập nhật biến` (Update Rules)

Entry lớn nhất (~15.000 chars). Chứa toàn bộ rules cho AI biết cách cập nhật biến.

**Cấu trúc content:**

```xml
<Variable_rules>
# ĐẠI ĐIỂN QUY TẮC MVU & LOGIC SINH TỒN

  core_principles:
    syntax_compliance:
      check:
        - "BẮT BUỘC sử dụng tên biến chính xác tuyệt đối theo Zod Schema"
        - "Đường dẫn JSON Patch phải là tuyệt đối"
        - "Các thuộc tính nằm trong biến lớn phải ghi đúng cấu trúc phân tầng"
    
    mathematical_and_operation_laws:
      check:
        - "[CẤM TOÁN HỌC TRONG VALUE]: Trường `value` chỉ chứa kết quả cuối cùng"
        - "Dùng `delta` thay vì `replace` cho thay đổi số"

  # ...rules chi tiết theo game logic...
  
  # Ví dụ: rules cho chiến đấu, sinh tồn, kinh tế, danh tiếng...
</Variable_rules>
```

> **Mẹo:** Entry này nên viết bằng **tiếng Anh** cho phần cú pháp kỹ thuật, tiếng Việt cho phần context game. AI hiểu cú pháp tiếng Anh chính xác hơn.

### 6.4 Entry: `[mvu_update] Định dạng xuất biến` (Format Rules)

Chứa format AI phải tuân theo khi xuất biến cập nhật:

```yaml
rule:
   - you must output the update analysis and the actual update commands at once in the end of the next reply
   - the update commands works like the **JSON Patch (RFC 6902)** standard
   - supports operations: replace, delta, insert, remove
   - don't update field names starts with `_` (readonly)

format: |-
   <UpdateVariable>
   <Analysis>
   english_checklist:
     step0_IDENTITY_INITIALIZATION:
       - extract_profile: "CRITICAL: If values are empty, extract from user's prompt"
     step1_MANDATORY_FULL_SYNC:
       - rule: "MUST output 'replace' for ALL paths in EVERY TURN"
     step2_time_and_environment:
       - update_time: "Advance time logically"
     step3_player_status:
       - check_health: "Update based on events"
     step4_npc_reactions:
       - update_relationships: "NPCs react to player actions"
   </Analysis>
   [
     {"op":"replace","path":"/Thiên_Hạ/Thời_Gian/Giờ","value":"Giờ Ngọ"},
     {"op":"delta","path":"/Người_Chơi/Tài_Sản_Chính/Bạc_Vụn","value":-5},
     {"op":"insert","path":"/Mạng_Lưới_Nhân_Vật/Lão Trương","value":{"Tuổi":45}},
     {"op":"remove","path":"/Người_Chơi/Túi_Đồ/Lương khô"}
   ]
   </UpdateVariable>
```

### 6.5 Entry: `[mvu_plot] Văn phong` (Writing Style)

Entry tùy chọn, định nghĩa phong cách viết cho AI:

```xml
<writing_style style="Bạch miêu quần tướng thời Minh">
  <narrative_system>
    <structure type="Thị tỉnh bách thái">
      <!-- Rules văn phong chi tiết -->
    </structure>
  </narrative_system>
</writing_style>
```

---

## 7. TAVERNHELPER SCRIPTS (2 scripts bắt buộc)

### 7.1 Script MVU Runtime

```json
{
  "type": "script",
  "enabled": true,
  "name": "MVU",
  "id": "unique-uuid-here",
  "content": "import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js'",
  "info": "",
  "button": {
    "enabled": true,
    "buttons": [
      { "name": "重新处理变量", "visible": true },
      { "name": "重新读取初始变量", "visible": true },
      { "name": "快照楼层", "visible": false },
      { "name": "重演楼层", "visible": false },
      { "name": "重试额外模型解析", "visible": true },
      { "name": "清除旧楼层变量", "visible": false }
    ]
  },
  "data": {}
}
```

**CDN URLs:**
| Kênh | URL |
|------|-----|
| Stable | `MagicalAstrogy/MagVarUpdate/artifact/bundle.js` |
| Beta | `MagicalAstrogy/MagVarUpdate@beta/artifact/bundle.js` |

**Buttons tiếng Trung (giải nghĩa):**
| Tên TQ | Nghĩa | Visible |
|--------|-------|---------|
| 重新处理变量 | Xử lý lại biến | ✅ |
| 重新读取初始变量 | Đọc lại biến khởi tạo | ✅ |
| 快照楼层 | Snapshot tầng | ❌ |
| 重演楼层 | Replay tầng | ❌ |
| 重试额外模型解析 | Retry model parsing | ✅ |
| 清除旧楼层变量 | Xóa biến tầng cũ | ❌ |

### 7.2 Script MVU Zod Schema

```json
{
  "type": "script",
  "enabled": true,
  "name": "MVU Zod Schema",
  "id": "another-unique-uuid",
  "content": "NỘI DUNG ZOD (xem mục 8)",
  "info": "",
  "button": { "enabled": true, "buttons": [] },
  "data": {}
}
```

---

## 8. ZOD SCHEMA CHI TIẾT

### 8.1 Template cơ bản

```javascript
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

export const Schema = z.object({

  // ═══ Nhóm biến 1 ═══
  Tên_Nhóm: z.object({
    Biến_String: z.string().prefault("Giá trị mặc định"),
    Biến_Số: z.coerce.number().prefault(0),
    Biến_Enum: z.enum(["A", "B", "C"]).prefault("A"),
  }).prefault({}),

  // ═══ Record (dictionary động) ═══
  Tên_Record: z.record(
    z.string().describe("Key description"),
    z.object({
      Field_1: z.string().prefault("..."),
    }).prefault({})
  ).prefault({}),

}).prefault({});

$(() => {
  registerMvuSchema(Schema);
});
```

### 8.2 Tất cả kiểu dữ liệu Zod

| Kiểu | Cú pháp | Ví dụ | Ghi chú |
|------|---------|-------|---------|
| String | `z.string().prefault("...")` | `z.string().prefault("Khỏe mạnh")` | Text tự do |
| Number | `z.coerce.number().prefault(0)` | `z.coerce.number().prefault(20)` | `.coerce` tự convert từ string |
| Enum | `z.enum([...]).prefault("X")` | `z.enum(["Sống","Chết"]).prefault("Sống")` | Giá trị cố định |
| Clamped Number | `.transform(v => _.clamp(v, min, max))` | `.transform(v => _.clamp(v, -100, 100))` | Giới hạn min-max |
| Array of strings | `z.array(z.string()).prefault([])` | Danh sách kỹ năng | Mảng text |
| Record/Dict | `z.record(z.string(), z.object({...}))` | Túi đồ, NPC network | Key-value động |
| Nested Object | `z.object({ ... }).prefault({})` | Nhóm thuộc tính con | |
| Nested Time | `z.object({Giờ:..., Ngày:..., })` | Hệ thống thời gian | |

### 8.3 Quy tắc không thể vi phạm

| # | Quy tắc | Hậu quả nếu sai |
|---|---------|-----------------|
| 1 | **MỌI field phải có `.prefault()`** | Runtime crash, variables không init |
| 2 | **Object → `.prefault({})`** | Undefined errors |
| 3 | **Array → `.prefault([])`** | Iteration fails |
| 4 | **Tên biến dùng `_` (underscore)** | JSON Patch path lỗi |
| 5 | **Dòng cuối PHẢI có `$(() => { registerMvuSchema(Schema); });`** | Schema không đăng ký |
| 6 | **Import registerMvuSchema từ StageDog CDN** | Zod validator không load |
| 7 | **Enum values phải chính xác tuyệt đối** | Zod validation crash ở runtime |

### 8.4 Ví dụ HOÀN CHỈNH (Card Huyết Lệ)

```javascript
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

export const Schema = z.object({

  // ==================== BIẾN LỚN 1: THIÊN HẠ ====================
  Thiên_Hạ: z.object({
    Thời_Gian: z.object({
      Giờ: z.string().prefault("Giờ Thìn (7h-9h)"),
      Ngày: z.string().prefault("Mùng một"),
      Tháng: z.string().prefault("Tháng Năm"),
      Năm: z.string().prefault("Chí Chính năm thứ mười một (1351)"),
    }).prefault({}),
    Thời_Tiết: z.string().prefault("Nóng bức oi ả"),
    Thiên_Tai_Dịch_Bệnh: z.enum([
      "Bình thường", "Nạn đói", "Dịch hạch", "Dịch tả", "Lũ lụt Hoàng Hà", "Bão tuyết"
    ]).describe("Tình trạng thảm họa tại khu vực").prefault("Bình thường"),
    Biến_Động_Thiên_Hạ: z.array(
      z.string().describe("Các sự kiện lớn đang diễn ra trên bản đồ")
    ).prefault([]),
  }).prefault({}),

  // ==================== BIẾN LỚN 2: NGƯỜI CHƠI ====================
  Người_Chơi: z.object({
    Tên: z.string().prefault("Chờ cập nhật"),
    Tuổi: z.coerce.number().prefault(20),
    Giới_Tính: z.string().prefault("Nam"),
    Vị_Trí: z.string().prefault("Hào Châu"),
    Giai_Cấp_Nguyên_Triều: z.enum([
      "Mông Cổ", "Sắc Mục", "Hán Nhân", "Nam Nhân", "Chưa rõ"
    ]).prefault("Nam Nhân"),
    Tôn_Giáo: z.enum([
      "Không", "Bạch Liên Giáo", "Minh Giáo", "Mật Tông Tạng Truyền", "Nho Giáo"
    ]).prefault("Không"),
    Trạng_Thái: z.string()
      .describe("Mô tả sức khỏe, độ đói khát, thương tích")
      .prefault("Khỏe mạnh, bụng hơi đói"),
    Kỹ_Năng_Sở_Trường: z.array(z.string())
      .describe("VD: Chữ Hán, Y thuật, Rèn sắt, Cưỡi ngựa...")
      .prefault([]),
    Tài_Sản_Chính: z.object({
      Bạc_Vụn: z.coerce.number().describe("Đơn vị: Lượng").prefault(0),
      Muối_Trắng: z.coerce.number().describe("Đơn vị: Cân").prefault(0),
    }).prefault({}),
    Túi_Đồ: z.record(
      z.string().describe("Tên vật phẩm"),
      z.object({
        Mô_Tả: z.string().prefault("Chờ cập nhật"),
        Số_Lượng: z.coerce.number().prefault(1),
      }).prefault({})
    ).prefault({}),
  }).prefault({}),

  // ==================== BIẾN LỚN 3: DANH TIẾNG ====================
  Danh_Tiếng: z.object({
    Danh_Hiệu: z.array(z.string()).prefault([]),
    Uy_Tín_Tổng_Quát: z.coerce.number()
      .transform(v => _.clamp(v, -100, 100))
      .describe("Điểm uy tín từ -100 đến 100")
      .prefault(0),
    Quan_Hệ_Thế_Lực: z.record(
      z.string().describe("Tên phe phái"),
      z.string().describe("Thái độ: Thù địch, Bằng hữu...")
    ).prefault({}),
  }).prefault({}),

  // ==================== BIẾN LỚN 4: MẠNG LƯỚI NPC ====================
  Mạng_Lưới_Nhân_Vật: z.record(
    z.string().describe("Tên NPC"),
    z.object({
      Tuổi: z.coerce.number().prefault(20),
      Giới_Tính: z.string().prefault("Chưa rõ"),
      Thân_Phận: z.string().prefault("Chưa rõ"),
      Tình_Trạng_Sống_Chết: z.enum(["Còn sống", "Đã chết", "Mất tích"]).prefault("Còn sống"),
      Suy_Nghĩ_Hiện_Tại: z.string().prefault("Chưa rõ"),
      Độ_Hảo_Cảm: z.coerce.number()
        .transform(v => _.clamp(v, -100, 100))
        .describe("Từ -100 (Căm thù) đến 100 (Tử sinh)")
        .prefault(0),
      Độ_Trung_Thành: z.coerce.number()
        .transform(v => _.clamp(v, 0, 100))
        .describe("0=Phản trắc, 100=Tử trung. Chỉ ý nghĩa với thuộc hạ.")
        .prefault(50),
    }).prefault({})
  ).prefault({}),

  // ==================== BIẾN LỚN 5: THẾ LỰC ====================
  Thế_Lực: z.object({
    Tên_Thế_Lực: z.string().prefault("Chưa gia nhập (Lưu dân)"),
    Thủ_Lĩnh: z.string().prefault("Không có"),
    Căn_Cứ_Địa: z.string().prefault("Không có"),
    Quy_Mô_Quân_Số: z.coerce.number().prefault(0),
    Tình_Trạng_Lương_Thảo: z.string().prefault("Thiếu thốn"),
    Cấp_Độ_Trang_Bị: z.string()
      .describe("VD: Vũ khí thô sơ, Giáp da, Thiết kỵ, Hỏa khí...")
      .prefault("Thô sơ (Nông cụ, Gậy tre)"),
    Sĩ_Khí: z.string().prefault("Rệu rã"),
    Lòng_Dân: z.coerce.number()
      .transform(v => _.clamp(v, 0, 100))
      .describe("0=Oán hận, 100=Quy tâm")
      .prefault(50),
    Chức_Vụ_Của_Bạn: z.string().prefault("Không có"),
  }).prefault({}),

}).prefault({});

$(() => {
  registerMvuSchema(Schema);
});
```

---

## 9. REGEX SCRIPTS (6 scripts chuẩn)

### 9.1 Bảng tổng quan 6 Regex Scripts

| # | Tên | Mục đích | promptOnly | markdownOnly | Regex |
|---|-----|---------|-----------|-------------|-------|
| 0 | Ẩn thanh trạng thái | Xóa placeholder khỏi prompt→AI | ✅ | ❌ | `<StatusPlaceHolderImpl/>` |
| 1 | [Không gửi] Xóa cập nhật biến | Xóa `<update>` khỏi prompt | ✅ | ❌ | `/<update(?:variable)?>(?:(?!.*<\\/update(?:variable)?>).*$|.*<\\/update(?:variable)?>)/gsi` |
| 2 | [Làm đẹp] Đang cập nhật | Loading UI khi AI đang viết | ❌ | ✅ | `/<update(?:variable)?>(?!.*<\\/update(?:variable)?>)\\s*(.*)\\s*$/gsi` |
| 3 | [Làm đẹp] Cập nhật xong | Done UI khi AI viết xong | ❌ | ✅ | `/<update(?:variable)?>\\s*(.*)\\s*<\\/update(?:variable)?>/gsi` |
| 4 | Làm đẹp thanh trạng thái | Dashboard HTML chính | ❌ | ✅ | `<StatusPlaceHolderImpl/>` |
| 5 | Khởi đầu | Form nhập nhân vật | ❌ | ✅ | `\[khởi tạo\]` |

### 9.2 Chi tiết từng Regex

#### Regex 0: Ẩn thanh trạng thái (khỏi prompt)
```json
{
  "id": "uuid",
  "scriptName": "Ẩn thanh trạng thái",
  "findRegex": "<StatusPlaceHolderImpl/>",
  "replaceString": "",
  "trimStrings": [],
  "placement": [2],
  "disabled": false,
  "markdownOnly": false,
  "promptOnly": true,
  "runOnEdit": true,
  "substituteRegex": 0,
  "minDepth": 3,
  "maxDepth": null
}
```

> **Giải thích:** Khi gửi prompt cho AI, xóa tag `<StatusPlaceHolderImpl/>` để AI không thấy HTML dashboard. `minDepth: 3` = chỉ áp dụng từ tin nhắn thứ 3 trở lên.

#### Regex 1: Xóa UpdateVariable khỏi prompt
```json
{
  "scriptName": "[Không gửi] Xóa cập nhật biến",
  "findRegex": "/<update(?:variable)?>(?:(?!.*<\\/update(?:variable)?>).*$|.*<\\/update(?:variable)?>)/gsi",
  "replaceString": "",
  "placement": [2],
  "disabled": false,
  "markdownOnly": false,
  "promptOnly": true,
  "runOnEdit": false,
  "minDepth": null,
  "maxDepth": null
}
```

> **Giải thích:** Xóa toàn bộ `<UpdateVariable>...</UpdateVariable>` hoặc `<update>...</update>` khỏi prompt. AI không cần thấy lại block cập nhật cũ.

#### Regex 2: Làm đẹp (đang cập nhật — loading state)
```json
{
  "scriptName": "[Làm đẹp] Các biến đang được cập nhật",
  "findRegex": "/<update(?:variable)?>(?!.*<\\/update(?:variable)?>)\\s*(.*)\\s*$/gsi",
  "replaceString": "<div style=\"width:80%;margin:20px auto\">\n  <details class=\"loading-details\" style=\"background:#2d2d2d;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);overflow:hidden\">\n    <summary style=\"padding:12px 16px;cursor:pointer;color:#9ca3af;font-size:13px\">⏳ Đang cập nhật biến...</summary>\n    <div style=\"padding:8px 16px;color:#6b7280;font-family:monospace;font-size:11px;white-space:pre-wrap\">$1</div>\n  </details>\n</div>",
  "placement": [2],
  "markdownOnly": true,
  "promptOnly": false,
  "runOnEdit": false
}
```

> **Giải thích:** Khi AI đang streaming và chưa đóng tag `</update>`, hiện UI loading.

#### Regex 3: Làm đẹp (cập nhật xong — completed)
```json
{
  "scriptName": "[Làm đẹp] Cập nhật đầy đủ các biến",
  "findRegex": "/<update(?:variable)?>\\s*(.*)\\s*<\\/update(?:variable)?>/ gsi",
  "replaceString": "<div style=\"width:80%;margin:20px auto\">\n  <details style=\"background:#2d2d2d;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);overflow:hidden\">\n    <summary style=\"padding:12px 16px;cursor:pointer;color:#22c55e;font-size:13px\">✅ Biến đã cập nhật</summary>\n    <div style=\"padding:8px 16px;color:#6b7280;font-family:monospace;font-size:11px;white-space:pre-wrap\">$1</div>\n  </details>\n</div>",
  "placement": [2],
  "markdownOnly": true,
  "promptOnly": false,
  "runOnEdit": false
}
```

#### Regex 4: Dashboard HTML (thanh trạng thái) — 32KB+ HTML
```json
{
  "scriptName": "Làm đẹp thanh trạng thái",
  "findRegex": "<StatusPlaceHolderImpl/>",
  "replaceString": "```html\\n<!DOCTYPE html>...FULL DASHBOARD HTML...\\n```",
  "placement": [1, 2],
  "markdownOnly": true,
  "promptOnly": false,
  "runOnEdit": true
}
```

> ⚠️ **QUAN TRỌNG:** Giá trị `findRegex` của Regex 4 PHẢI LÀ `<StatusPlaceHolderImpl/>` — đây là một keyword hệ thống mà *MagVarUpdate* bundle sẽ tự động sinh ra và gắn vào chat khi cập nhật xong. KHÔNG DÙNG `<status_current_variables>` ở đây.

#### Regex 5: Form khởi tạo (~15KB HTML)
```json
{
  "scriptName": "Khởi đầu",
  "findRegex": "\\[khởi tạo\\]",
  "replaceString": "```html\\n<!DOCTYPE html>...FORM HTML...\\n```",
  "placement": [1, 2],
  "markdownOnly": true,
  "promptOnly": false,
  "runOnEdit": true,
  "maxDepth": 1
}
```

> 🔴 **BẮT BUỘC: `placement` PHẢI LÀ `[1, 2]`** — `first_mes` (greeting) hiển thị ở vị trí `1` (phía user). Nếu chỉ để `[2]` (AI only), Regex sẽ không chạy trên greeting → Form nhập nhân vật sẽ KHÔNG hiện!
>
> 💡 **`maxDepth: 1`** — Giới hạn form chỉ xuất hiện ở tin nhắn đầu tiên, giống card Huyết Lệ.

> ⚠️ **CẢNH BÁO ESCAPE LỖI (Double Escape):** 
> Regex 5 cần tìm chính xác chuỗi `[khởi tạo]`. Trong Regex, dấu móc vuông cần escape thành `\[khởi tạo\]`.  
> Tuy nhiên khi cấu trúc thành JSON, nó CẦN PHẢI lưu thành chuỗi `"findRegex": "\\[khởi tạo\\]"`. Nếu bạn copy nhầm hoặc phần mềm xuất json lỗi thêm dấu backslash thành `"\\\\[khởi tạo\\\\]"`, regex sẽ hoạt động sai và Form Khởi Tạo sẽ không bao giờ xuất hiện!
>
> 💡 **Best Practice cho First Message:** Không đưa toàn bộ HTML Form vào `first_mes`. Thay vào đó, trong `first_mes` chỉ viết đúng tag `[khởi tạo]`. Regex số 5 sẽ tự động Render HTML cực đẹp cho user xem mà AI không bao giờ nhìn thấy mã HTML thừa thải, giúp sạch Token.

### 9.3 Regex Field Reference

| Field | Type | Mô tả |
|-------|------|-------|
| `id` | string | UUID duy nhất |
| `scriptName` | string | Tên hiển thị |
| `findRegex` | string | Pattern tìm. Nếu bắt đầu bằng `/` = regex thực, không thì literal |
| `replaceString` | string | Nội dung thay. `$1` = capture group đầu tiên |
| `trimStrings` | string[] | Strings cần trim |
| `placement` | number[] | `[1]`=user/greeting side, `[2]`=AI side. Dùng `[1,2]` cho cả hai. |
| `disabled` | boolean | Tắt/bật |
| `markdownOnly` | boolean | `true` = chỉ áp dụng khi render UI (user nhìn thấy) |
| `promptOnly` | boolean | `true` = chỉ áp dụng trên prompt gửi AI (user không thấy) |
| `runOnEdit` | boolean | Chạy khi edit/regenerate message |
| `substituteRegex` | number | 0 = không substitute regex |
| `minDepth` | number/null | Áp dụng từ tin nhắn thứ N |
| `maxDepth` | number/null | Áp dụng đến tin nhắn thứ N |

### 9.4 markdownOnly vs promptOnly — Bảng logic

| markdownOnly | promptOnly | Kết quả |
|-------------|-----------|---------|
| false | true | Chỉ áp dụng trên prompt gửi AI. User KHÔNG thấy thay đổi. |
| true | false | Chỉ áp dụng trên UI render. AI KHÔNG thấy thay đổi. |
| false | false | Áp dụng cả hai. |
| true | true | ⚠️ Xung đột — tránh dùng. |

---

## 10. BUILD SCRIPT

### 10.1 Quy trình build

```
[lorebook.md] ──parse──→ entries[]
[zod_schema.js] ──read──→ TH script content
[regex_ui.html] ──read──→ regex replaceString
                              ↓
                    [Build Script (Node.js)]
                              ↓
                    [FINAL_CARD.json] ──import──→ SillyTavern
```

### 10.2 Template build script

```javascript
const fs = require('fs');
const path = require('path');
const rootDir = __dirname;

// ═══ 1. Parse lorebook entries từ markdown ═══
let md = fs.readFileSync(path.join(rootDir, 'lorebook.md'), 'utf8');
md = md.replace(/\r\n/g, '\n');

const lorebookEntries = [];
let idCounter = 1;
const blocks = md.split('\n## [');

for (let i = 1; i < blocks.length; i++) {
    // Parse tên, keys, content từ mỗi block...
    lorebookEntries.push({
        id: idCounter,
        keys: parsedKeys,        // ← PHẢI là "keys" (số nhiều)
        secondary_keys: [],
        comment: parsedName,
        content: parsedContent,
        constant: false,
        selective: true,
        insertion_order: 50,
        enabled: true,           // ← PHẢI là "enabled: true"
        position: "after_char",  // ← PHẢI là string
        use_regex: false,
        extensions: { /* full extensions object */ }
    });
    idCounter++;
}

// ═══ 2. Thêm MVU system entries ═══
// initvar, stat display, update rules, format rules, writing style

// ═══ 3. Build TavernHelper scripts ═══
const zodContent = fs.readFileSync('zod_schema.js', 'utf8');
const tavernHelperScripts = [
    { type:"script", enabled:true, name:"MVU", content:"import '...bundle.js'", ... },
    { type:"script", enabled:true, name:"MVU Zod Schema", content:zodContent, ... }
];

// ═══ 4. Build Regex scripts ═══
const regexScripts = [ /* 6 regex objects */ ];

// ═══ 5. Assemble card ═══
const card = {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
        name: "...",
        first_mes: "[khởi tạo]",
        character_book: { name: "...", entries: allEntries },
        extensions: {
            regex_scripts: regexScripts,
            TavernHelper_scripts: tavernHelperScripts,
            character_book: { name: "...", entries: allEntries }  // backup
        }
    }
};

fs.writeFileSync('FINAL_CARD.json', JSON.stringify(card, null, 2));
```

---

## 11. CHECKLIST & TROUBLESHOOTING

### 11.1 Checklist trước import

```
□ JSON hợp lệ (không lỗi parse)
□ spec = "chara_card_v3", spec_version = "3.0"
□ character_book.entries là ARRAY []
□ Mỗi entry dùng: keys (array), enabled (true), insertion_order, position (string)
□ KHÔNG dùng: key (singular), disable, order (number)
□ character_book ở CẢ HAI vị trí (data. + data.extensions.)
□ MVU script enabled: true
□ Zod Schema script enabled: true  
□ Zod Schema kết thúc bằng registerMvuSchema(Schema)
□ Mỗi Zod field có .prefault()
□ initvar entry có enabled: false
□ Stat display entry có {{format_message_variable::stat_data}}
□ 6 regex scripts đầy đủ
□ File size < 5MB
```

### 11.2 Troubleshooting

| Triệu chứng | Nguyên nhân | Cách sửa |
|-------------|-------------|----------|
| Import thành công nhưng Lorebook trống | `character_book` ở sai vị trí hoặc entries là Object `{}` | Đặt ở `data.character_book`, entries phải là `[]` |
| Lorebook entries bị tắt hết | Dùng `disable: false` thay `enabled: true` | Đổi thành `enabled: true` |
| TavernHelper chỉ hiện MVU, không có Zod | Script Zod bị `enabled: false` hoặc thiếu | Kiểm tra cả 2 scripts đều `enabled: true` |
| Biến không cập nhật | Thiếu Update Rules entry hoặc Format Rules | Thêm MVU entries #6.3 và #6.4 |
| Dashboard không hiện | Thiếu Stat Display entry (#6.2) hoặc Regex #4 | Đảm bảo entry có `{{format_message_variable::stat_data}}` |
| AI gửi biến lộn xộn | Zod Schema field thiếu `.prefault()` | Thêm `.prefault()` cho mọi field |
| `[khởi tạo]` hiện nguyên text | Regex "Khởi đầu" bị disabled hoặc findRegex sai | Check regex disabled=false, pattern khớp |
| Enum crash | Giá trị AI gửi không nằm trong enum list | Thêm fallback hoặc mở rộng enum |
| JSON Patch path lỗi | Tên biến có space thay underscore | Dùng `_` trong tên Zod field |

### 11.3 Thứ tự kiểm tra sau import

1. **Lorebook:** Mở World Info → đếm entries → đều enabled
2. **TavernHelper:** Extensions → thấy 2 scripts MVU + Zod, đều bật
3. **Regex:** Extensions → thấy 6 regex scripts
4. **Start Chat:** Gửi tin nhắn đầu → form khởi tạo hiện lên
5. **Gõ thử:** AI phản hồi kèm `<UpdateVariable>` → biến cập nhật → dashboard refresh

---

## PHỤ LỤC A: JSON PATCH OPERATIONS (RFC 6902 mở rộng)

MVU sử dụng JSON Patch với 4 operations:

```json
[
  // replace — thay giá trị
  {"op": "replace", "path": "/Người_Chơi/Vị_Trí", "value": "Hào Châu"},
  
  // delta — thay đổi số (+ hoặc -)
  {"op": "delta", "path": "/Người_Chơi/Tài_Sản_Chính/Bạc_Vụn", "value": -5},
  
  // insert — thêm item mới vào object/array
  {"op": "insert", "path": "/Mạng_Lưới_Nhân_Vật/Lão Trương", "value": {
    "Tuổi": 45,
    "Thân_Phận": "Nông dân",
    "Độ_Hảo_Cảm": 10
  }},
  
  // remove — xóa key hoặc phần tử array
  {"op": "remove", "path": "/Người_Chơi/Túi_Đồ/Lương khô"}
]
```

---

## PHỤ LỤC B: CẤU TRÚC THỰC TẾ CARD HUYẾT LỆ (HOÀN CHỈNH)

```
Root: { spec, spec_version, data }
  └── data (layer 1 — V3 outer wrapper)
      ├── name: "Huyết Lệ Cuối Nguyên"
      ├── description: "" (trống)
      ├── personality: "" (trống)
      ├── scenario: "" (trống)
      ├── first_mes: "[khởi tạo]"
      ├── mes_example: "" (trống)
      ├── creatorcomment: ""
      ├── avatar: "none"
      ├── talkativeness: "0.5"
      ├── fav: false
      ├── tags: []
      ├── create_date: "2025-..."
      ├── extensions (layer 1)
      │   ├── regex_scripts: [1 entry — battle trigger iframe]
      │   └── character_book: { entries: [1 entry — battle extra] }
      └── data (layer 2 — V2-in-V3 nesting)
          ├── name: "Huyết Lệ Cuối Nguyên"
          ├── description: "" (trống — tất cả logic ở lorebook)
          ├── system_prompt: "" (trống)
          ├── first_mes: "[khởi tạo]"
          ├── extensions (layer 2 — ĐÂY LÀ NƠI CHÍNH)
          │   ├── talkativeness: 0.5
          │   ├── fav: false
          │   ├── world: ""
          │   ├── depth_prompt: { prompt:"", depth:4, role:"system" }
          │   ├── tavern_helper:
          │   │   ├── scripts: [
          │   │   │   { name:"MVU", content:"import ...bundle.js", enabled:true },
          │   │   │   { name:"MVU Zod Schema", content:"import {register...}", enabled:true }
          │   │   │ ]
          │   │   └── variables: {}
          │   └── regex_scripts: [
          │       { "Ẩn thanh trạng thái" — promptOnly },
          │       { "[Không gửi] Xóa cập nhật biến" — promptOnly },
          │       { "[Làm đẹp] Đang cập nhật" — markdownOnly },
          │       { "[Làm đẹp] Cập nhật xong" — markdownOnly },
          │       { "Dashboard HTML" — markdownOnly, 32KB },
          │       { "Khởi đầu form" — markdownOnly, 15KB }
          │   ]
          └── character_book: { name:"...", entries: [68 entries] }
              ├── entries[0-52]: World lore (constant=false, selective, keys=[...])
              ├── entries[53]: Timeline wrapper mở (<timeline>)
              ├── entries[54-61]: Timeline entries theo năm
              ├── entries[62]: Timeline wrapper đóng (</timeline>)
              ├── entries[63]: [initvar] Khởi tạo biến (enabled:FALSE)
              ├── entries[64]: Danh sách biến {{format_message_variable::stat_data}}
              ├── entries[65]: [mvu_update] Quy tắc cập nhật (~15K chars)
              ├── entries[66]: [mvu_update] Định dạng xuất biến (~5.7K chars)
              └── entries[67]: [mvu_plot] Văn phong (~2.5K chars)
```
