# KiotLabel bản Offline (một tệp .exe)

Tài liệu mô tả ứng dụng **KiotLabel chạy offline trên Windows**: thiết kế và in tem mã vạch, in thẳng ra máy in tem, chỉ cần **một tệp `KiotLabel.exe`**:
không cài đặt, không giải nén, không cần Internet. Đây là tài liệu riêng của bản offline; bản trực tuyến có tài liệu riêng ở website.

## 1. Ứng dụng này là gì

- Cùng giao diện thiết kế tem với bản web KiotLabel (khổ tem, mã vạch CODE128/EAN-13/CODE39, QR, chữ, hình, nhập Excel/CSV, sắp xếp, hoàn tác...).
- **Một tệp duy nhất**: tải `KiotLabel.exe` về rồi bấm đúp. Không có thư mục đi kèm, không cần giải nén, không ghi registry, không cài dịch vụ, không cần quyền quản trị.
- **In thẳng ra máy in** (máy in tem bằng lệnh ZPL/TSPL; máy in thường A4/A5 bằng vẽ trực tiếp), không phải xuất PDF rồi mở và in như bản web. Chỉ khi chọn "Lưu thành PDF" mới có tệp PDF.

## 2. Yêu cầu và cách dùng

| Mục | Yêu cầu |
|---|---|
| Hệ điều hành | Windows 10/11 64-bit |
| Trình duyệt | Microsoft Edge (có sẵn trong Windows) hoặc Google Chrome; ứng dụng mở một cửa sổ ở chế độ ứng dụng |
| Máy in tem | Đã cài driver bình thường (TSC, Zebra, Xprinter, Gprinter, Godex...); nhận lệnh ZPL hoặc TSPL |
| Mạng | Không cần |

1. Tải `KiotLabel.exe` ở trang **Releases** của repo này (hoặc nút "Tải bản offline" trong phần hướng dẫn của KiotLabel trên website).
2. Bấm đúp `KiotLabel.exe`. Nếu Windows hiện "Windows protected your PC": chọn **More info → Run anyway** (xem mục 6, tệp chưa có chữ ký số).
3. Đóng cửa sổ KiotLabel là ứng dụng tắt hoàn toàn. Mở lần hai khi đang chạy chỉ báo "KiotLabel đang chạy".

Bạn có thể để tệp ở bất kỳ đâu (Desktop, thư mục riêng, USB). Nên đặt vào một thư mục riêng thay vì để trong Downloads.

## 3. Khác với bản web

| | Bản web | Bản offline (ứng dụng này) |
|---|---|---|
| In | Xuất PDF (vector hoặc ảnh) rồi mở hộp thoại in của trình duyệt | **Chọn máy in rồi in thẳng**, tự chọn cách in tốt nhất theo máy in (lệnh gốc cho máy in tem, vẽ trang cho máy khác); "Lưu thành PDF" khi cần tệp |
| Mạng | Cần để tải trang | **Không cần** |
| Dữ liệu (mẫu tem đã lưu, cài đặt) | Trong trình duyệt của người dùng | Trên máy, trong thư mục riêng của ứng dụng (mục 5) |
| Nhận diện tem bằng AI (Gemini) | Có | **Đã gỡ** (cần Internet và khóa API) |
| Chèn ảnh từ Google Drive hoặc đường dẫn web | Có | **Đã gỡ** (cần Internet); vẫn chèn ảnh từ máy tính |
| Nút "Tải bản offline" | Có | Không hiện |
| Nút PDF riêng | Có | Gộp vào danh sách máy in ("Lưu thành PDF") |

Các tính năng cần Internet được gỡ để ứng dụng hoạt động đúng nghĩa offline và không có lỗi khó hiểu khi mất mạng.

## 4. In ấn

**Cách dùng (chỉ ba bước):** mở **Bước 4: In tem** → chọn **máy in** → bấm **In ngay** (hoặc **Ctrl+P**).
Ứng dụng **tự chọn cách in tốt nhất theo từng máy in**, người dùng không phải biết ZPL, TSPL hay GDI là gì. Chọn **Lưu thành PDF** nếu muốn tệp PDF thay vì in.

**Cách tự chọn:** ứng dụng hỏi Windows tên, driver, cổng, khổ giấy tối đa và độ phân giải của máy in, rồi quyết định:

| Máy in | Cách in tự chọn | Lý do |
|---|---|---|
| Máy in tem **TSC** (TE, TTP, DA, DE, Alpha...) | Lệnh **TSPL** | Nét nhất, nhanh, mã vạch/QR quét chắc |
| Máy in tem **Zebra/ZDesigner** (ZPL) | Lệnh **ZPL** | Như trên |
| **Xprinter, Gprinter, HPRT** loại in tem | Lệnh **TSPL** (độ tin cậy trung bình) | Phần lớn nhận TSPL; sai thì đổi một lần (xem dưới) |
| Zebra **EPL**, Godex (EZPL), Argox, Datamax, SATO, Brother QL, Dymo... | **Vẽ trang trực tiếp** | Ngôn ngữ riêng, không nhận ZPL/TSPL (gửi nhầm sẽ ra chữ rác) |
| Máy in **hóa đơn** (ESC/POS), máy in **kim**, **laser/phun**, máy in **ảo**, máy lạ | **Vẽ trang trực tiếp** | Chạy được với mọi driver Windows |
| Giấy văn phòng **A4/A5** | **Vẽ trang trực tiếp** (luôn) | Khổ giấy và hướng giấy theo thiết lập |

**Độ phân giải** (203/300/600 DPI) cũng lấy từ driver. Muốn xem hoặc đổi, bấm **Đổi cách in** ngay dưới ô chọn máy in: chọn **Tự động**, **Lệnh ZPL**, **Lệnh TSPL** hoặc **Vẽ trang**.
Lựa chọn của bạn được **nhớ riêng cho từng máy in**.

**Nếu tem in chưa đúng** (máy lạ nhận diện sai): sau khi in, bấm **"Tem in chưa đúng? Thử cách khác"**. Ứng dụng đổi sang cách còn lại (lệnh gốc ↔ vẽ trang), nhớ cho máy in đó, rồi bạn bấm In ngay lần nữa.

Cách hoạt động:
- **Lệnh gốc (máy in tem):** giao diện dựng lệnh ZPL/TSPL rồi máy chủ cục bộ nằm ngay trong `KiotLabel.exe` gửi vào hàng đợi in Windows (dữ liệu RAW). Chữ **tiếng Việt có dấu được dựng thành ảnh** ở đúng độ phân giải máy in nên không phụ thuộc font nạp sẵn trong máy in; mã vạch và QR vẫn dùng lệnh gốc nên nét và quét chắc. Một lô tem (theo Excel và số lượng) gửi thành một tác vụ, các dòng giống nhau liên tiếp gom thành một lệnh có số bản.
- **Vẽ trang trực tiếp (GDI):** giao diện dùng **cùng bộ bố cục với PDF vector** (bản in khớp bản PDF) nhưng ghi ra một **danh sách lệnh vẽ** (chữ, hình, mã vạch, QR, ảnh) thay vì tệp PDF;
  `KiotLabel.exe` vẽ danh sách đó lên máy in bằng GDI ở **độ phân giải gốc của máy in** (300/600/1200 DPI). Chữ, mã vạch và QR là nét vẽ vector nên rất nét; dữ liệu chỉ vài KB mỗi tem
  (không phải ảnh cả trang) nên nhanh và nhẹ. Chữ dùng font Arial/Times New Roman/Courier New của Windows (cùng độ rộng chữ với font nhúng trong PDF).

**Nâng cao (kỹ thuật viên):** mục gập "Nâng cao: tệp lệnh máy in nhiệt" cho phép chọn ngôn ngữ/độ phân giải/khoảng hở tem (TSPL) và **xuất tệp ZPL/TSPL** để gửi bằng công cụ khác. Người dùng thường không cần mục này.

Giới hạn:
- Máy in ảo (Microsoft Print to PDF, XPS...) vẽ trang sẽ hỏi nơi lưu tệp; dùng "Lưu thành PDF" của KiotLabel cho tiện.
- Máy in thường có **lề không in được** (thường 3–5 mm): nội dung sát mép tờ bị cắt; chừa lề giấy trong thiết lập khổ giấy.
- Driver có thể đổi khổ giấy: nếu khổ giấy thực tế khác khổ thiết kế, ứng dụng báo "Lưu ý" sau khi in.
- Nhận diện theo **tên máy in/driver**: tên lạ có thể bị xếp vào "vẽ trang" dù máy nhận lệnh gốc (vẫn in được, chỉ kém nét hơn lệnh gốc): đổi bằng "Đổi cách in". Tối đa 5.000 tem mỗi lần in.
- Chưa kiểm chứng in ra giấy thật trên máy in laser/phun (đã kiểm thử bằng cách in vào tệp PDF qua Windows và so từng điểm ảnh với PDF vector: khớp khoảng 88–98% tùy mẫu, phần lệch chủ yếu là khử răng cưa của chữ giữa Arial và Arimo).
## 5. Dữ liệu và quyền riêng tư

- Mặc định dữ liệu (hồ sơ trình duyệt riêng của ứng dụng: mẫu tem đã lưu, bản nháp, máy in đã chọn, cài đặt) nằm ở `%LOCALAPPDATA%\KiotLabel`,
  nên bấm tệp ở đâu cũng không rải dữ liệu ra thư mục đó.
- **Chế độ portable** (mang cả dữ liệu theo USB): tạo một thư mục tên `Data` hoặc một tệp trống `portable.txt` **cạnh** `KiotLabel.exe`; lần sau ứng dụng dùng `Data\` cạnh tệp.
- Mẫu lưu ở bản web không tự sang đây: dùng **Lưu tệp .kvl** ở bản web rồi **Mở tệp** ở bản offline (và ngược lại).
- Xóa sạch dữ liệu: đóng ứng dụng, xóa thư mục dữ liệu ở trên.
- Ứng dụng không gửi dữ liệu đi đâu, không thu thập thông tin, không kết nối Internet.

## 6. An toàn và minh bạch

- Máy chủ cục bộ chỉ nghe ở `127.0.0.1` (không ra mạng), mỗi lần chạy có **mã xác thực ngẫu nhiên**; kiểm tra `Host` chống DNS rebinding; tên máy in phải nằm trong danh sách máy in thật;
  tệp tĩnh chỉ lấy từ giao diện nhúng sẵn (không đọc đĩa nên không thể thoát khỏi thư mục).
- Không ghi registry, không dịch vụ, không tự khởi động cùng Windows, không tải gì từ mạng, không cần quyền quản trị.
- `KiotLabel.exe` (C#, .NET 8, tự chứa) **không nén, không tự giải nén ra thư mục tạm**, không dùng trình đóng gói/làm rối mã, không kèm Node hay thư viện ngoài.
  Giao diện nằm nguyên vẹn bên trong tệp.
- Mã nguồn công khai trong repo này; tệp phát hành do GitHub Actions dựng từ chính mã đó, có SHA-256 và chứng thực nguồn gốc (mục 7).
- **Chưa có chữ ký số** cho `KiotLabel.exe`, nên Windows SmartScreen có thể hiện cảnh báo "ứng dụng không xác định" ở lần chạy đầu: chọn **More info → Run anyway** sau khi kiểm tra SHA-256.

## 7. Kiểm tra tệp tải về

```powershell
Get-FileHash .\KiotLabel.exe -Algorithm SHA256   # so với tệp KiotLabel.exe.sha256 cùng trang Releases
gh attestation verify .\KiotLabel.exe --repo thuyettk42-tech/kiotlabel-desktop   # (tùy chọn) xác nhận do workflow của repo này dựng
```
Nếu trình diệt virus báo nhầm, hãy gửi tệp cho hãng để họ xác nhận (Microsoft Defender: trang Submit a file for malware analysis).

## 8. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Windows báo "protected your PC" | Tệp chưa có chữ ký số: More info → Run anyway (sau khi kiểm tra SHA-256) |
| Không thấy máy in trong danh sách | Bấm "Làm mới"; kiểm tra máy in đã cài driver và hiện trong Windows (Settings → Printers) |
| "Máy in không nhận lệnh thô (RAW)" | Đây là máy in ảo/máy in thường: chọn máy in tem thật hoặc "Lưu thành PDF" |
| Tem in ra chữ rác hoặc sai | Bấm "Tem in chưa đúng? Thử cách khác"; hoặc "Đổi cách in" và chọn Vẽ trang |
| Tem ra sai kích thước, lệch | Kiểm tra khổ tem trong thiết lập; với lệnh TSPL kiểm tra khoảng hở tem ở mục Nâng cao |
| Tờ A4 in ra lệch hoặc mất chữ sát mép | Máy in thường không in được sát mép: chừa lề giấy 5 mm trở lên trong thiết lập; kiểm tra khổ giấy trong driver |
| Cửa sổ không mở | Cần Microsoft Edge hoặc Chrome; nếu không có, ứng dụng mở trình duyệt mặc định |
| Báo "KiotLabel đang chạy" nhưng không thấy cửa sổ | Mở Task Manager, kết thúc tiến trình KiotLabel.exe rồi mở lại |

## 9. Dành cho macOS/Linux

Bản `.exe` chỉ dành cho Windows. Thư mục `server/` chứa máy chủ Node tương đương (cùng API) cho macOS/Linux (in qua CUPS), **chưa được kiểm thử và chưa phát hành**.
Chi tiết kỹ thuật và quy trình phát hành: `docs/PHAT-HANH.md`.
