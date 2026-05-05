# Kiến trúc Hệ thống: App Dịch Character Card (Tavern)
*Tài liệu này được thiết kế để cung cấp ngữ cảnh (context) cho các AI model khác hiểu về cấu trúc, luồng dữ liệu và các cơ chế cốt lõi của ứng dụng.*

## 1. Tổng quan (Overview)
Đây là một ứng dụng dịch Character Card (Tavern / V2 / V3) sử dụng LLM. Ứng dụng không chỉ dịch văn bản thuần túy (narrative) mà còn phải xử lý các thành phần phức tạp như logic code (EJS/JavaScript), Regex, JSON schemas, và cấu trúc thẻ (HTML/XML).

Mục tiêu tối thượng của app: **Bảo toàn tuyệt đối cấu trúc kỹ thuật (Code Preservation) trong khi dịch mượt mà ngôn ngữ tự nhiên sang tiếng Việt/Anh.**

---

## 2. Các Thành phần Cốt lõi (Core Components)

### A. Parser & Extractor (`src/workers/cardParser.worker.ts`)
- Chạy trên Web Worker để không block UI.
- Có nhiệm vụ phân tách file Character Card (PNG, JSON, CardV2) thành các trường (fields) riêng biệt.
- **Phân loại Field (Field Types):**
  - `narrative`: Văn bản tự nhiên thuần túy (VD: description, personality).
  - `lorebook` / `mixed`: Văn bản trộn lẫn cấu trúc YAML, JSON, hoặc mã giả (pseudocode).
  - `regex`: Các mẫu Regular Expression của regex extension.
  - `ejs_code`: Mã EJS hoặc JavaScript thuần (VD: macro, script TavernHelper).
  - `json_state`: JSON schemas được dùng cho Multi-Variable Update (MVU).

### B. Master Prompt Engine (`src/utils/masterPrompt.ts`)
- Đây là "trái tim" của hệ thống dịch. Thay vì dùng 1 prompt chung, app sử dụng cơ chế prompt theo lớp (layered prompts) dựa trên `FieldType`.
- **Expert Mode**: Yêu cầu AI "suy nghĩ" trong thẻ `<thought_process>` trước khi xuất bản dịch cuối cùng trong thẻ `<translation>`.
- Các quy tắc (Rules): C1 (Không dịch macro `{{char}}`), C2 (Đồng bộ Key JSON/MVU), C3 (Bảo toàn EJS), C11 (Không sót chữ Hán/Nhật).

### C. Translation Orchestrator (`src/utils/apiClient.ts`)
- Quản lý việc gọi API tới các LLM providers (Google Gemini, Anthropic Claude, OpenAI, OpenRouter...).
- Xử lý cơ chế **Dịch theo Chunk (Chunk-based Translation)** và ghép nối (giải thích chi tiết ở phần 3).
- **Post-Translation Residual Check:** Tự động quét bản dịch. Nếu phát hiện còn sót ký tự chữ Hán (CJK ideographs), nó sẽ trích xuất đoạn lỗi và tự động gọi AI một lần nữa với prompt "cleanup" để dịch triệt để.

### D. AI Verification & Validation (`src/utils/aiVerify.ts`)
- Lớp kiểm tra hậu kiểm sau khi dịch.
- **Các tiêu chí kiểm tra:**
  - *Bracket/Tag Balance:* Đếm số lượng ngoặc `[`, `{`, `<` xem bản dịch có làm gãy cấu trúc không.
  - *Macro Integrity:* Đảm bảo các macro hệ thống (`{{user}}`, `{{char}}`) không bị dịch bậy.
  - *Residual CJK:* Kiểm tra tỷ lệ chữ Hán còn sót lại (>5% hoặc >3 ký tự sẽ báo cảnh báo/lỗi).

---

## 3. Cơ chế Dịch theo Chunk (Chunk-based Translation)

Vì một số trường (như `mes_example` hoặc Lorebook lớn) có thể vượt quá giới hạn token đầu ra của LLM, ứng dụng sử dụng cơ chế chia nhỏ và ghép nối rất tinh vi:

1. **Chunking (`chunkText`):**
   - Tự động nhận diện ngôn ngữ nguồn (nếu là CJK, text sẽ được cắt nhỏ hơn vì mỗi ký tự CJK tốn nhiều token hơn).
   - Chia văn bản lớn thành mảng các chuỗi nhỏ (chunks).

2. **Parallel Translation (Dịch song song):**
   - Các chunk được đẩy lên LLM song song để tiết kiệm thời gian (giới hạn `MAX_CONCURRENT` để tránh lỗi 429 Rate Limit).
   - Truyền kèm cờ báo vị trí chunk (VD: `[part 1/3]`) và một phần ngữ cảnh (context) để AI hiểu mạch truyện.

3. **Seam Verification (Xác minh mối nối):**
   - Khi ghép các chunk lại, đôi khi câu bị cắt đứt giữa chừng, dẫn đến việc AI tự chế thêm chữ hoặc dịch lặp ở điểm nối (seam).
   - Ứng dụng quét các "mối nối" này. Nếu phát hiện văn bản bị gãy mạch hoặc lặp từ, hệ thống sẽ dùng một prompt nhỏ gọi là *Seam Smoothing* để LLM viết lại đoạn nối cho tự nhiên.

---

## 4. RAG và Cơ chế Đồng bộ MVU/Zod (MVU Synchronization)

Dù không phải là RAG truyền thống (tìm kiếm vector), ứng dụng có một cơ chế "Context Injection" tương tự RAG để duy trì tính nhất quán của các biến trạng thái kỹ thuật (Multi-Variable Update - MVU).

### Vấn đề:
Card thường chứa các JSON schema định nghĩa biến (VD: `{"Mức độ tức giận": 0}`) và các đoạn code EJS để gọi biến đó (VD: `<% getvar("Mức độ tức giận") %>`).
Nếu dịch JSON key thành `"Anger Level"` nhưng code EJS vẫn gọi `"Mức độ tức giận"`, Card sẽ bị crash (EJS Desync).

### Cách giải quyết (MVU Dictionary Injection):
1. **Trích xuất:** Khi parse card, hệ thống quét và lập một "Từ điển MVU" (MVU Dictionary) chứa ánh xạ các key gốc và key đã dịch.
2. **Context Injection:** Khi dịch các field chứa mã EJS (như Lorebook hoặc regex), hệ thống sẽ tiêm (inject) cái `mvuDictionary` này vào System Prompt.
3. **Thực thi:** AI buộc phải dò trong code EJS, hễ thấy `getvar('key_cũ')` hoặc `setvar('key_cũ')` thì phải tự động thay thế thành `getvar('key_mới_đã_dịch')` dựa vào từ điển RAG được cấp.

---

## 5. Các Chế độ Dịch (Translation Modes)

- **Standard Mode:** Dịch thẳng, nhanh, ít tốn token. Rủi ro cao làm hỏng code EJS/HTML.
- **Expert Mode (Khuyên dùng):** AI phải viết chuỗi suy nghĩ (Chain of Thought - CoT) vào thẻ `<thought_process>` trước. Nó tự phân tích cấu trúc kỹ thuật cần giữ lại, sau đó mới in ra `<translation>`. Chậm hơn nhưng cực kỳ an toàn cho Card phức tạp.
