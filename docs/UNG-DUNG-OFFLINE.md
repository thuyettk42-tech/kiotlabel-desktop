# KiotLabel bản Offline (Desktop Portable)

Tài liệu mô tả ứng dụng **KiotLabel chạy offline trên Windows**: thiết kế và in tem mã vạch, in thẳng ra máy in tem, không cần cài đặt và
không cần Internet. Đây là tài liệu riêng của bản offline; bản trực tuyến có tài liệu riêng ở website.

## 1. Ứng dụng này là gì

- Cùng giao diện thiết kế tem với bản web KiotLabel (khổ tem, mã vạch CODE128/EAN-13/CODE39, QR, chữ, hình, nhập Excel/CSV, sắp xếp, hoàn tác...).
- Đóng gói thành thư mục **portable**: giải nén là chạy, xóa thư mục là gỡ, không ghi registry, không cài dịch vụ, không cần quyền quản trị.
- **In thẳng ra máy in tem** bằng lệnh ZPL/TSPL, không phải xuất PDF rồi mở và in như bản web. Chỉ khi chọn "Lưu thành PDF" mới có tệp PDF.

## 2. Yêu cầu và cài đặt

| Mục | Yêu cầu |
|---|---|
| Hệ điều hành | Windows 10/11 64-bit |
| Trình duyệt | Microsoft Edge (có sẵn trong Windows) hoặc Google Chrome; ứng dụng mở cửa sổ ở chế độ ứng dụng |
| Máy in tem | Đã cài driver bình thường (TSC, Zebra, Xprinter, Gprinter, Godex...); nhận lệnh ZPL hoặc TSPL |
| Mạng | Không cần |

Cách dùng: tải `KiotLabel-portable-win-x64.zip` ở trang Releases → giải nén **đầy đủ** ra một thư mục (không chạy trong tệp nén) → bấm đúp `KiotLabel.exe`.
Đóng cửa sổ KiotLabel là ứng dụng tắt hoàn toàn. Chạy lần hai khi đang mở chỉ báo "KiotLabel đang chạy".

## 3. Khác với bản web

| | Bản web | Bản offline (ứng dụng này) |
|---|---|---|
| In | Xuất PDF (vector hoặc ảnh) rồi mở/in; hoặc tải tệp ZPL/TSPL | **Chọn máy in rồi in thẳng**; "Lưu thành PDF" khi cần tệp |
| Mạng | Cần để tải trang | **Không cần** |
| Dữ liệu (mẫu tem đã lưu, cài đặt) | Trong trình duyệt của người dùng | Trong thư mục `Data` cạnh `KiotLabel.exe` (mang đi được) |
| Nhận diện tem bằng AI (Gemini) | Có | **Đã gỡ** (cần Internet và khóa API) |
| Chèn ảnh từ Google Drive hoặc đường dẫn web | Có | **Đã gỡ** (cần Internet); vẫn chèn ảnh từ máy tính |
| Nút "Tải bản offline" | Có | Không hiện |
| Nút PDF riêng | Có | Gộp vào danh sách máy in ("Lưu thành PDF") |

Các tính năng cần Internet được gỡ để ứng dụng hoạt động đúng nghĩa offline và không có lỗi khó hiểu khi mất mạng.

## 4. In ấn

1. Mở tab **Thiết kế tem** → **Bước 4: In tem** (hoặc bảng "Cấu hình in nhanh" bên phải màn hình).
2. Ở mục **In trực tiếp ra máy in** chọn **máy in** (danh sách lấy từ Windows; "Làm mới" để quét lại), hoặc **Lưu thành PDF**.
3. Chọn ngôn ngữ **ZPL** (Zebra) hay **TSPL** (TSC, Xprinter, Gprinter...) và độ phân giải máy in (203/300/600 DPI) ở mục "Xuất lệnh máy in nhiệt".
4. Bấm **In ngay** hoặc **Ctrl+P**. Một lô tem (theo Excel và số lượng) được gửi thành một tác vụ; các dòng giống nhau liên tiếp gom thành một lệnh có số bản.

Cách hoạt động: giao diện dựng lệnh ZPL/TSPL (kể cả ảnh, chữ xoay, nét đứt được chuyển thành ảnh đơn sắc ở độ phân giải máy in), máy chủ cục bộ chuyển cho
`KiotLabel.exe`, rồi gửi thẳng vào hàng đợi in Windows (kiểu dữ liệu RAW). Chất lượng do máy in vẽ nên nét ở độ phân giải thật của máy in.

Giới hạn hiện tại:
- Chỉ in thẳng cho **máy in tem** nhận ZPL/TSPL. Máy in thường (laser/phun) và chế độ giấy văn phòng A4/A5: chọn "Lưu thành PDF" rồi in tệp PDF.
- Máy in ảo (Microsoft Print to PDF, XPS...) không nhận lệnh thô; ứng dụng báo lỗi rõ. Dùng "Lưu thành PDF" của KiotLabel.
- Chữ tiếng Việt có dấu cần máy in đã nạp font TrueType (hoặc dùng đối tượng xoay/nét đứt, được in dạng ảnh). Tối đa 5.000 tem mỗi lần in.

## 5. Dữ liệu và quyền riêng tư

- `Data\profile` (cạnh exe) chứa hồ sơ trình duyệt riêng của ứng dụng: mẫu tem đã lưu, bản nháp, cài đặt (máy in đã chọn, ngôn ngữ, DPI...).
  Sao chép cả thư mục để chuyển sang máy khác. Không ghi được cạnh exe (ví dụ đặt trong Program Files) thì dùng `%LOCALAPPDATA%\KiotLabel`.
- Mẫu lưu ở bản web không tự sang đây: dùng **Lưu tệp .kvl** ở bản web rồi **Mở tệp** ở bản offline (và ngược lại).
- Ứng dụng không gửi dữ liệu đi đâu, không thu thập thông tin, không kết nối Internet.

## 6. An toàn và minh bạch

- Máy chủ cục bộ chỉ nghe ở `127.0.0.1` (không ra mạng), mỗi lần chạy có **mã xác thực ngẫu nhiên**; kiểm tra `Host` chống DNS rebinding; tên máy in phải nằm trong danh sách máy in thật.
- Không ghi registry, không dịch vụ, không tự khởi động cùng Windows, không tải gì từ mạng, không cần quyền quản trị.
- `KiotLabel.exe` (C#, .NET 8, tự chứa) **không nén và không tự giải nén**, không dùng trình đóng gói/làm rối mã. `runtime\node.exe` là bản chính thức của Node.js
  với chữ ký số của OpenJS Foundation (xem Properties → Digital Signatures).
- Mã nguồn công khai trong repo này; gói phát hành do GitHub Actions dựng từ chính mã đó, có SHA-256 và chứng thực nguồn gốc (xem mục 7).
- Chưa có chữ ký số cho `KiotLabel.exe`, nên Windows SmartScreen có thể hiện cảnh báo "ứng dụng không xác định" ở lần chạy đầu: chọn **More info → Run anyway** sau khi đã kiểm tra SHA-256.

## 7. Kiểm tra tệp tải về

```powershell
Get-FileHash .\KiotLabel-portable-win-x64.zip -Algorithm SHA256   # so với tệp .sha256 cùng trang Releases
gh attestation verify .\KiotLabel-portable-win-x64.zip --repo thuyettk42-tech/kiotlabel-desktop   # (tùy chọn) xác nhận do workflow của repo này dựng
```
Từng tệp trong gói có mã băm ở `SHA256SUMS.txt`. Nếu trình diệt virus báo nhầm, hãy gửi tệp cho hãng để họ xác nhận (Microsoft Defender: trang Submit a file for malware analysis).

## 8. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Báo "Thiếu tệp của ứng dụng" | Giải nén đầy đủ tệp .zip rồi chạy lại, không chạy trong tệp nén |
| Không thấy máy in trong danh sách | Bấm "Làm mới"; kiểm tra máy in đã cài driver và hiện trong Windows (Settings → Printers) |
| "Máy in không nhận lệnh thô (RAW)" | Đây là máy in ảo/máy in thường: chọn máy in tem thật hoặc "Lưu thành PDF" |
| Tem ra sai kích thước, lệch | Kiểm tra khổ tem, ngôn ngữ (ZPL/TSPL), DPI và khoảng hở tem (TSPL) khớp với máy in |
| Cửa sổ không mở | Cần Microsoft Edge hoặc Chrome; nếu không có, ứng dụng mở trình duyệt mặc định |
| Xóa sạch dữ liệu | Đóng ứng dụng, xóa thư mục `Data` |

## 9. Cấu trúc gói

```
KiotLabel/
  KiotLabel.exe        trình khởi chạy và gửi lệnh in (C#)
  runtime/node.exe     Node.js chính thức
  server/server.mjs    máy chủ cục bộ (phục vụ giao diện + API máy in)
  app/                 giao diện KiotLabel (bản build)
  Data/                tạo khi chạy
  SHA256SUMS.txt, HUONG-DAN.txt
```
Chi tiết kỹ thuật và quy trình phát hành: `docs/PHAT-HANH.md`.
