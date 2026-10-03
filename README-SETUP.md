# Chuyển sang bản web tĩnh — việc cần làm

## 1. Dán link Apps Script
Mở `dashboard.js`, dòng đầu tiên:
```js
const APPS_SCRIPT_URL = "DÁN_LINK_APPS_SCRIPT_VÀO_ĐÂY";
```
Thay bằng link Web App thật (dạng `https://script.google.com/macros/s/..../exec`) đã deploy.

## 2. Đưa 3 file này vào repo GitHub hiện có
Copy `index.html`, `dashboard.css`, `dashboard.js`, và thư mục `images/` vào **thư mục gốc** của repo KHKD (ngang hàng, không để trong `wwwroot/` hay `Pages/` nữa — không cần cấu trúc ASP.NET nữa).

Có thể xóa các file/thư mục cũ không dùng tới nữa: `Program.cs`, `Model/`, `Pages/`, `appsettings.json`, `KHKD.csproj`, `KHKD.sln`, `bin/`, `obj/`, `wwwroot/` (giữ lại phần `images/` bên trong `wwwroot` nếu có logo, copy ra ngoài gốc).

## 3. Bật GitHub Pages
Trên GitHub.com, vào repo → **Settings → Pages** → mục "Source", chọn nhánh `main`, thư mục `/ (root)` → **Save**.

Sau ~1 phút, GitHub cấp cho bạn 1 link dạng:
```
https://ten-tai-khoan.github.io/KHKD/
```
Đây chính là link mở trên TV (chế độ Kiosk trình duyệt), thay thế hoàn toàn cho file `.exe` cũ.

## 4. Từ nay sửa code thế nào
- Mở lại bằng Visual Studio (hoặc VS Code) như cũ, sửa `dashboard.js` / `dashboard.css` / `index.html` trực tiếp.
- Không cần F5, không cần Build, không cần Publish.
- Chỉ cần **Commit & Push** lên GitHub — khoảng 1 phút sau trang Pages tự cập nhật.

## Lưu ý quan trọng
- Mỗi khi đổi vị trí dòng/cột trong Google Sheet (ví dụ thêm/bớt chi nhánh ở vị trí khác hẳn), chỉ cần sửa 3 hằng số đầu `Code.gs` bên Apps Script (`DATA_START_ROW`, `DATA_END_ROW`, `QUARTERLY_START_ROW`) rồi Deploy lại version mới — không cần đụng gì ở phía web tĩnh.
- Muốn ẩn thêm đơn vị khác khỏi lưới hiển thị (giống PKH), sửa mảng `HIDDEN_BRANCHES` ở đầu `dashboard.js`.
