# ST Card Translator — Dịch thẻ nhân vật SillyTavern

Ứng dụng web dịch file JSON character card của SillyTavern sang bất kỳ ngôn ngữ nào.  
Hỗ trợ OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, Qwen, và mọi API tương thích OpenAI.

![preview](https://img.shields.io/badge/Vite-React_TS-blueviolet?style=flat-square)

---

## ✨ Tính năng

- **Đa nhà cung cấp AI** — OpenAI, Claude, Gemini, DeepSeek, Qwen, proxy tùy chỉnh
- **Dịch thông minh** — Bảo toàn HTML/markdown, `{{char}}`, `{{user}}`, cấu trúc JSON
- **Giao diện song ngữ** — Chuyển đổi EN ↔ VI ngay trong app
- **Chọn ngôn ngữ đích** — Tiếng Việt, English, 日本語, 한국어, 中文, và nhiều hơn
- **Pause / Resume / Cancel** — Kiểm soát hoàn toàn quá trình dịch
- **Chỉnh sửa trực tiếp** — Xem và sửa bản dịch trước khi xuất
- **Auto-retry thông minh** — Retry với exponential backoff, timeout cấu hình được
- **Kiểm tra độ dài bản dịch** — Tự động retry nếu bản dịch quá ngắn
- **Log console với filter** — Lọc log theo loại: Success, Error, Retry, Warning…
- **Xuất JSON** — Download file JSON đã dịch, sẵn sàng dùng trong SillyTavern

---

## 🚀 Cài đặt & Chạy

### Yêu cầu
- [Node.js](https://nodejs.org/) phiên bản **18+** (khuyến nghị 20+)
- npm (đi kèm Node.js)

### Bước 1: Clone repo

```bash
git clone https://github.com/ceh51453-alt/d-ch-card-sillytarven.git
cd d-ch-card-sillytarven
```

### Bước 2: Cài dependencies

```bash
npm install
```

### Bước 3: Chạy app

```bash
npm run dev
```

Mở trình duyệt tại **http://localhost:5173** — xong!

---

## 📖 Hướng dẫn sử dụng

### 1. Cấu hình API
- Chọn **AI Provider** (OpenAI, Claude, Gemini, Custom…)
- Nhập **API Base URL** và **API Key**
- Chọn **Model** từ danh sách gợi ý hoặc tự nhập
- Bấm **Test Connection** để kiểm tra

### 2. Chọn ngôn ngữ đích
- Ở mục **Translation Settings**, chọn ngôn ngữ muốn dịch sang
- Mặc định là **Tiếng Việt**

### 3. Upload Character Card
- Kéo thả file `.json` character card vào ô upload
- Hoặc click để chọn file

### 4. Dịch
- Bấm **Start Translation** để bắt đầu
- Xem tiến trình real-time trong log panel
- Có thể **Pause**, **Resume**, hoặc **Cancel**

### 5. Chỉnh sửa & Xuất
- Xem lại bản dịch trong **Field Editor**
- Sửa trực tiếp nếu cần
- Bấm **Download JSON** để tải file đã dịch

---

## ⚙️ Cài đặt nâng cao

| Tùy chọn | Mặc định | Mô tả |
|-----------|----------|-------|
| Request Timeout | 60000ms | Thời gian chờ tối đa cho mỗi request |
| Retry Delay | 1000ms | Độ trễ cơ bản khi retry (tăng dần) |
| Max Retries | 3 | Số lần thử lại tối đa khi lỗi |
| Min Response Ratio | 15% | Tự động retry nếu bản dịch ngắn hơn % này |
| Request Delay | 500ms | Thời gian chờ giữa các request |

---

## 🛠 Tech Stack

- **Vite** + **React 19** + **TypeScript**
- **Zustand** — State management
- **Lucide React** — Icons
- **react-dropzone** — File upload
- **TailwindCSS v4** — Styling

---

## 📝 License

MIT
