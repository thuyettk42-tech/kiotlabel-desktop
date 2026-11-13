# KiotLabel bản Offline (Desktop Portable)

Thiết kế và in tem mã vạch **chạy offline trên Windows**, **in thẳng ra máy in** (tự chọn lệnh ZPL/TSPL cho máy in tem hoặc vẽ trang cho máy in thường A4/A5), không cần cài đặt, không cần Internet.
Cùng giao diện với bản web KiotLabel của [KiotViet DVKH KV HCM](https://www.dvkhkiotviet.com/cong-cu/in-tem).

## Tải về
**[Tải KiotLabel.exe (bản mới nhất)](https://github.com/thuyettk42-tech/kiotlabel-desktop/releases/latest/download/KiotLabel.exe)**
hoặc xem [trang Releases](https://github.com/thuyettk42-tech/kiotlabel-desktop/releases). **Một tệp duy nhất**: tải về rồi bấm đúp, không cần giải nén hay cài đặt.

Windows 10/11 64-bit, có Microsoft Edge (hoặc Chrome). Máy in tem cài driver bình thường.

## Tài liệu
- [Ứng dụng offline: tính năng, in ấn, dữ liệu, an toàn, xử lý sự cố](docs/UNG-DUNG-OFFLINE.md)
- [Phát hành và cập nhật (cho người phát triển)](docs/PHAT-HANH.md)

## Tin cậy và an toàn
Mã nguồn công khai tại đây; gói phát hành do GitHub Actions dựng từ chính mã này, có SHA-256 và chứng thực nguồn gốc. `KiotLabel.exe` (một tệp, giao diện nhúng sẵn) không nén, không tự giải nén,
không ghi registry, không kết nối Internet; máy chủ cục bộ chỉ nghe `127.0.0.1` với mã xác thực ngẫu nhiên. Chưa có chữ ký số nên SmartScreen có thể cảnh báo ở lần chạy đầu
(xem [mục An toàn](docs/UNG-DUNG-OFFLINE.md#6-an-toàn-và-minh-bạch)).

## Cấu trúc
`launcher/` (C#: KiotLabel.exe gồm máy chủ cục bộ, in thô, giao diện nhúng) · `ui/` (giao diện KiotLabel) · `server/` (Node, cho macOS/Linux, chưa phát hành) · `scripts/` (đóng gói và kiểm tra) · `docs/`.

## Tự đóng gói
```bash
node scripts/build-desktop.mjs   # cần Node, .NET 8 SDK, Windows; kết quả: dist-desktop/KiotLabel.exe
```
