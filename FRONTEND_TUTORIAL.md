# Hướng Dẫn Thực Hành: Xếp Hạng & Thiết Kế Giao Diện Frontend (Thẻ SillyTavern)

Tài liệu này tập trung vào làm thế nào để hiển thị UI đẹp, mượt mà và nhúng an toàn HTML/CSS/JS phức tạp vào bên trong cửa sổ Chat của SillyTavern mà không làm ảnh hưởng tính năng sinh văn bản của AI.

---

## 1. Cơ Chế Nhúng Giao Diện (Bypass DOMPurify)

SillyTavern chặn (sanitize) JavaScript và một số thẻ HTML lạ bằng thư viện DOMPurify. Nếu thẻ UI của bạn có JS, việc đầu tiên là lừa thư viện này lờ đoạn code của bạn đi.

### Cấu Hình Regex
1. Chuyển sang thẻ **Khác -> Regex** hoặc chỉnh sửa trong mảng `extensions.regex_scripts`.
2. Bật cờ `markdownOnly: true` (Chỉ hiện UI ra mắt người chơi, tuyệt đối **không gửi HTML này vào AI Prompt**).
3. `placement`: Chọn mức độ 2 (Chỉ kích hoạt regex trên câu trả lời của AI).

### Kỹ Thuật "Bọc Bằng Markdown Code Block"
Phải lồng toàn bộ `<!DOCTYPE html>...` vào giữa codeblock Markdown của trường `replaceString`.

```html
// Nội dung thay thế của Regex Sẽ Trông Như Thế Này:

Nhấn vào nút bên dưới để mở giao diện:
```html
<!DOCTYPE html>
<html lang="vi-VN">
<head>
    <style>
       .btn-red { color: white; background: red; }
    </style>
</head>
<body>
    <button class="btn-red" onclick="alert('Yay!')">Test API</button>
    <script>
      console.log("Iframe JS Load thành công do đã được bypass DOMPurify.");
    </script>
</body>
</html>
```
(Ở cuối có bọc đóng ``` markdown)
```

---

## 2. Layout Chuẩn Cho Frontend Thẻ (Self-Contained SPA)

Nhìn từ thiết kế của các hệ thống đồ sộ như SlimeV5.42, chúng ta dùng nguyên lý **3-Pane Flex Layout** (Trái - Giữa - Phải) gắn cố định để cấu thành Game Dashboard.

```html
<style>
/* Reset nhẹ Iframe */
.st-card-game-panel {
    display: flex;
    width: 100%;
    /* 100dvh để phù hợp cho mobile thanh trình duyệt cuộn lên xuống */
    height: 100dvh; 
    overflow: hidden;
    color: #e5e9f0;
    background-color: #2e3440; /* Nền bóng tối Bắc Âu Polar Night */
}

/* Panel Trái - Nơi chứa Hình Dáng / Tên nhân vật / Inventory */
.pane-left {
    width: 300px;
    flex-shrink: 0;
    padding: 15px;
    overflow-y: auto;
    border-right: 1px solid #4c566a;
}

/* Panel Giữa - Nơi chứa Hội Thoại Chính / Combat Log */
.pane-center {
    flex-grow: 1;
    padding: 15px;
    overflow-y: auto;
}

/* Panel Phải - Nơi chứa Bảng Chỉ Số Tình Trạng (Status) / Nút Cài Đặt */
.pane-right {
    width: 250px;
    flex-shrink: 0;
    padding: 15px;
    border-left: 1px solid #4c566a;
}

/* Làm Giao Diện Tương Thích Điện Thoại (Responsive) */
@media (max-width: 900px) {
    .st-card-game-panel {
        flex-direction: column; /* Vuốt dọc */
    }
    .pane-left, .pane-right {
        width: 100%;
        height: auto;
        border: none;
        border-bottom: 1px solid #4c566a;
    }
}
</style>

<div class="st-card-game-panel">
    <div class="pane-left">
       <h3><i class="fa fa-user"></i> Túi Đồ</h3>
       <ul><li>Kiếm Bạc</li><li>Bình Máu đỏ</li></ul>
    </div>
    
    <div class="pane-center">
       <!-- Khu Vực Log Của Trò Chơi -->
       <h2>Trung Tâm Tương Tác</h2>
       <p>Một cơn gió thổi nhẹ qua cánh rừng...</p>
    </div>
    
    <div class="pane-right">
       <h3>Chỉ Số</h3>
       <label>HP:</label> <progress value="80" max="100"></progress>
    </div>
</div>
```

---

## 3. Hệ Thống Pop-up / Overlay (Z-index Hierarchy)

Một Frontend Card chuyên nghiệp có rất nhiều Popup (Màn hình xác nhận, Thống Kê, Mở Rương...). Hãy kiểm soát **z-index** cẩn thận! Nằm trong Iframe nên đừng gọi `parent.document`, chỉ làm mờ khu vực của bạn:

```html
<style>
/* Overlay làm mờ background màn hình */
.modal-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background-color: rgba(0,0,0,0.8); /* Tối màu */
    z-index: 1000; /* Quan trọng */
    
    /* Căn giữa popup bên trong */
    display: none; 
    justify-content: center;
    align-items: center;
}

/* Popup chính thức */
.modal-box {
    background: #3b4252;
    padding: 20px;
    border-radius: 12px;
    border: 2px solid #88c0d0;
    width: 400px;
    max-width: 90%;
    
    /* Animation nảy lên */
    transform: scale(0.8);
    transition: transform 0.2s;
}

/* Đổi state để popup nảy lên khi show */
.modal-overlay.active { display: flex; }
.modal-overlay.active .modal-box { transform: scale(1); }
</style>

<!-- Mã HTML -->
<div class="modal-overlay" id="chest-modal">
    <div class="modal-box">
       <h3>Bạn đã tìm thấy Rương Bạc!</h3>
       <p id="chest-loot">Bên trong có 50 Vàng.</p>
       <button onclick="document.getElementById('chest-modal').classList.remove('active')">Thu thập</button>
    </div>
</div>
```

---

## 4. First Mes - Splash Screen Chào Mừng Lần Đầu
Trong field `first_mes` của Card JSON. Không nên để quá dài dòng, hãy làm thành một "Splash Screen".
Ví dụ dán đoạn này vào tin nhắn mở đầu:
```html
<div style="text-align: center; border: 1px dashed white; padding: 20px;">
    <h1>🔥 Chào Mừng Đến Với Sử Thi Card 🔥</h1>
    <i>(Nhấn Mũi Tên Sang Trái/Phải Để Update Load Map)</i>
    <p>Hãy gõ "Xin chào" hoặc [khởi_tạo] để bắt đầu.</p>
</div>
```
Người dùng gõ khởi tạo -> AI sinh ra câu chứa Keyword "youyujun233" (Trigger) -> Regex chộp lấy -> Xóa câu AI + Trưng ra toàn bộ giao diện HTML đã làm ở Buớc 2 và 3.

---

## 5. Dùng LocalStorage Lưu Trữ Dữ Liệu Tách Biệt (Self-Contained)

Nếu bạn thiết kế **không dựa vào MVU** mà muốn tự xử lý game engine ngay trong Frontend CSS/JS (mô hình như SlimeV5.42):
- Không dùng API MVU.
- Lưu bằng: `localStorage.setItem('my_rpg_hero', JSON.stringify(heroObj));`
- Lưu ý: Dữ liệu bị phụ thuộc vào trình duyệt của user. Nếu user clear cookies, họ mất save game. Khuyên dùng **Dexie.js / IndexedDB** nếu lưu hình ảnh hoặc map data lớn.
