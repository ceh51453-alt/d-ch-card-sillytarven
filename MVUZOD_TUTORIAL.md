# Hướng Dẫn Thực Hành: Tích Hợp Hệ Thống MVU/Zod

Tài liệu này tập trung **hoàn toàn** vào phần định nghĩa trạng thái (State Management) với kiến trúc MVU (Magic Variable Update) và Zod Schema trong SillyTavern.

---

## 1. Khái Niệm Cơ Bản
- **Zod Schema**: Cấu trúc dữ liệu "ruột" để hệ thống SillyTavern biết thẻ của bạn đang quản lý những thông số nào (Vàng, HP, Danh tiếng...).
- **MVU (Magic Variable Update)**: Cơ chế của SillyTavern giúp tự động bóc tách trạng thái từ câu văn của AI để cập nhật vào Zod mà không cần Regex quá đà.

---

## 2. Thiết Lập Zod Schema Đậm Tính Sống Còn

Khi chỉnh sửa file cấu hình hoặc JSON của thẻ, phần gốc để cấu hình Zod thường nằm trong `extensions.mvu` (hoặc block MVU Zod trong UI).

### ⚠️ QUY TẮC TỬ HUYỆT SỐ 1
Đừng bao giờ để SillyTavern sinh ra mảng rác ở biến khởi tạo.
**`initvar` LUÔN PHẢI ĐƯỢC CHỈ ĐỊNH LÀ `[]`**

Ví dụ JSON cấu hình chuẩn:
```json
{
  "initvar": [],
  "schema": {
    "hp": {
      "type": "number",
      "default": 100,
      "description": "Máu hiện tại của nhân vật."
    },
    "location": {
      "type": "string",
      "default": "Làng Khởi Nguyên",
      "description": "Vị trí địa lý hiện tại."
    }
  }
}
```
**Tại sao?** Nếu không để `[]`, cơ chế load character của SillyTavern có thể parse sai định dạng state cũ, gây ra lỗi reset dữ liệu hiển thị hoặc crash phần MVU.

---

## 3. Lằng Nghe Sự Kiện Lên UI (Đồng Bộ Hóa)

MVU quản lý state ngầm. Việc của bạn là lấy state đó ra ngoài mỗi khi nó thay đổi để vẽ lên Frontend.

### ⚠️ QUY TẮC TỬ HUYỆT SỐ 2
**Tên biến Data Attribute trong HTML bắt buộc phải KHỚP 100% với tên Key của Zod.**

*Sai:* (Zod ghi là `hp`, thẻ HTML ghi `data-var="HP"`) -> Biến không bao giờ load được.
*Đúng:* `data-var="hp"`

### Lấy dữ liệu toàn cục
SillyTavern lộ ra một object dưới Window. Dùng đoạn mã Javascript sau tiêm vào Regex của thẻ:

```javascript
function loadMvuState() {
    if (typeof window.getAllVariables !== 'function') return;
    
    // API Lấy Object toàn bộ biến Zod
    const vars = window.getAllVariables();
    if (!vars) return;

    // Quét thẻ để chèn dữ liệu
    document.querySelectorAll('.mvu-variable').forEach(el => {
        const key = el.getAttribute('data-var');
        if (vars[key] !== undefined) {
             el.innerText = vars[key];
        }
    });
}
```

### Lắng nghe sự kiện cập nhật thời gian thực
SillyTavern bắn ra sự kiện `variablesUpdated` khi AI phản hồi hoặc lệnh slash`/mvu` chạy thành công:

```javascript
if (typeof window.eventOn === 'function') {
    // 1. Chờ module MVU load xong
    if (typeof window.waitGlobalInitialized === 'function') {
        window.waitGlobalInitialized('Mvu').then(() => {
            loadMvuState(); // Lấy data lần đầu
        });
    }
    
    // 2. Chờ sự kiện để update real-time
    window.eventOn('variablesUpdated', loadMvuState);
} else {
    // Fallback nếu API load trễ
    setTimeout(loadMvuState, 500);
}
```

---

## 4. Tương Tác: Thao Tác Biến MVU Từ Nút Bấm

Vì UI thẻ của bạn nằm trong `Iframe`, bạn **không thể** (và không nên) thay đổi DOM gốc của trình duyệt (ví dụ can thiệp `textarea` gốc của window).
Hãy gọi API `triggerSlash`.

```javascript
function attackGoblin() {
    // Để gạch bớt HP bằng `/mvu set hp {hp-10}` hoặc các biểu thức toán học
    triggerSlash('/mvu math hp - 10'); // Giả sử tính năng lệnh /mvu hỗ trợ
    
    // Hoặc gửi một lệnh roleplay hệ thống lên AI
    triggerSlash('/sys Bạn vừa bị Goblin tấn công và trừ 10 HP.');
    
    // Tự động bảo AI sinh hội thoại tiếp theo
    setTimeout(() => {
         triggerSlash('/trigger');
    }, 300);
}
```
Lúc bạn cập nhật bằng Slash, hệ thống MVU sẽ tự trích cập nhật -> Bắn event `variablesUpdated` -> Hàm `loadMvuState()` ở Bước 3 tự chạy. Luồng hoàn hảo và không bị rác (buggy state).
