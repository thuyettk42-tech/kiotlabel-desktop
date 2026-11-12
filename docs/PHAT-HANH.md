# Phát hành và cập nhật KiotLabel bản Offline

Dành cho người phát triển. Mô tả cấu trúc mã, cách đóng gói, phát hành lên GitHub Releases, và **luồng đồng bộ khi bản web có phiên bản mới**.

## 1. Cấu trúc repo

```
launcher/    C# (.NET 8): KiotLabel.exe = trình khởi chạy + gửi lệnh in thô (winspool). Không WPF/WinForms, không gói NuGet
server/      server.mjs: máy chủ Node cục bộ, không phụ thuộc npm (phục vụ giao diện + /api/desktop/*)
ui/          mã nguồn giao diện KiotLabel (React + Vite); là bản sao đồng bộ từ bản web (mục 4)
scripts/     build-desktop.mjs (đóng gói), check-release.mjs (kiểm tra trước khi phát hành)
packaging/   HUONG-DAN.txt (đi kèm trong gói)
docs/        UNG-DUNG-OFFLINE.md (mô tả ứng dụng), PHAT-HANH.md (tài liệu này)
.github/workflows/  ci.yml (kiểm tra mỗi lần push), release.yml (phát hành lên Releases)
```

## 2. Đóng gói trên máy (Windows)

Cần Node, .NET 8 SDK. `node.exe` đang chạy script phải là bản chính thức (có chữ ký OpenJS Foundation); script kiểm tra.
```bash
node scripts/build-desktop.mjs            # kết quả ở dist-desktop/: thư mục KiotLabel/, zip, .sha256
node scripts/check-release.mjs            # chạy lại riêng phần kiểm tra
```
`check-release.mjs` báo lỗi (và `build-desktop.mjs` dừng) nếu: phiên bản giao diện lệch phiên bản desktop (`server.mjs`, `KiotLabel.csproj`, `app.manifest`, `Program.cs`);
bản build có tham chiếu CDN/font từ mạng; cấu hình đóng gói có cờ dễ bị trình diệt virus báo nhầm (`IncludeNativeLibrariesForSelfExtract`, nén tệp đơn...);
zip không khớp SHA-256, thiếu tệp, hoặc không khớp mã nguồn hiện tại.

Thử thủ công trước mỗi lần phát hành (bắt buộc, máy tự động không in được ra máy in thật):
- [ ] giải nén zip ở thư mục mới, chạy `KiotLabel.exe`: cửa sổ mở, đúng số phiên bản, mẫu mặc định hiển thị
- [ ] chọn máy in tem thật, in 1–2 tem: nội dung, kích thước, mã vạch/QR đúng
- [ ] "Lưu thành PDF" tạo được PDF
- [ ] lưu mẫu, đóng cửa sổ, mở lại: mẫu còn
- [ ] đóng cửa sổ: `KiotLabel.exe` và `node.exe` đều thoát (Task Manager)
- [ ] không còn mục cần Internet (AI, ảnh Google Drive/đường dẫn web)
- [ ] quét Defender: `MpCmdRun.exe -Scan -ScanType 3 -File <zip>` không phát hiện gì

## 3. Phát hành lên GitHub Releases

1. Cập nhật số phiên bản nếu cần (mục 5), commit, push lên `main`, chờ `ci.yml` xanh.
2. Gắn nhãn và đẩy: `git tag v3.5.2 && git push origin v3.5.2` (nhãn dạng `vX.Y.Z`, `X.Y` trùng phiên bản giao diện).
3. `release.yml` dựng gói trên máy chủ GitHub (windows-latest), chạy `check-release`, tạo **chứng thực nguồn gốc** (attestation), rồi tạo Release kèm
   zip và `.sha256`. Có thể chạy thủ công ở Actions → Release → Run workflow (chỉ dựng, không tạo Release nếu không có nhãn).
4. Website trỏ tới `https://github.com/thuyettk42-tech/kiotlabel-desktop/releases/latest/download/KiotLabel-portable-win-x64.zip`: luôn là bản mới nhất,
   không phải sửa website mỗi lần phát hành.
5. Mở Release, đọc ghi chú, tự tải tệp về chạy thử một lần nữa (mục 2).

Quy ước phiên bản: `X.Y.Z`; `X.Y` luôn bằng phiên bản giao diện KiotLabel; `Z` tăng khi chỉ sửa phần desktop (máy chủ, trình khởi chạy, đóng gói).

Bài học khi dựng trên GitHub Actions (đã gặp ở v3.5.0 và v3.5.1, phát hành thành công ở v3.5.2):
- `tar` trong PATH của máy chủ Windows có thể là GNU tar của Git, không tạo/đọc được zip: luôn gọi `System32\tar.exe` (đã làm trong script).
- Gọi `powershell.exe` từ `pwsh` thừa kế `PSModulePath` của bản 7 nên `Get-AuthenticodeSignature` trả về rỗng: script bỏ biến này.
- Log chi tiết của Actions cần quyền admin repo; bước đóng gói in phần cuối log thành chú thích lỗi để xem được từ ngoài.
- Một nhãn đã chạy thất bại không nên xóa/gắn lại: nâng số cuối (`Z`) rồi gắn nhãn mới.

## 4. Đồng bộ khi bản web có phiên bản mới

Bản web (repo website HUB DRIVER, thư mục `tools/kiotlabel`) là nơi phát triển giao diện. `ui/` ở repo này là bản sao, chỉ nhận **phần thay đổi**:

1. Ở repo website, tạo patch những commit mới của giao diện:
   `git diff <commit-trước> <commit-sau> --binary -- tools/kiotlabel/src tools/kiotlabel/tests tools/kiotlabel/index.html tools/kiotlabel/package.json tools/kiotlabel/package-lock.json > ui.patch`
2. Ở repo này (đã git pull): `git apply --check -p3 --directory=ui --ignore-whitespace ui.patch` rồi bỏ `--check` để áp
   (`-p3` bỏ `a/tools/kiotlabel/`, `--directory=ui` đặt vào thư mục `ui/`).
3. Chạy `cd ui && npm ci && npm run lint && npm test`.
4. **Rà soát theo quy tắc offline (mục 6)**, nhất là tính năng mới có gọi mạng hay không.
5. Nâng phiên bản desktop cho khớp (mục 5 của tài liệu này), `node scripts/build-desktop.mjs`, thử thủ công, commit, gắn nhãn, phát hành (mục 3).

Bản desktop **không tự cập nhật**: người dùng phải tải bản mới. Hệ quả: sau mỗi lần web đổi giao diện/tính năng in, nên phát hành lại bản desktop.

## 5. Chỗ chứa số phiên bản

`ui/index.html` (tiêu đề và màn chờ; nguồn của phiên bản giao diện), `server/server.mjs` (`VERSION`), `launcher/KiotLabel.csproj`
(`Version`, `AssemblyVersion`, `FileVersion`), `launcher/app.manifest`, `launcher/Program.cs` (chuỗi `--version`). `check-release.mjs` báo nếu `X.Y` lệch nhau.

## 6. Quy tắc offline khi đồng bộ hoặc thêm tính năng

1. **Không gọi mạng**: không tải font/CDN/script từ Internet. Tính năng cần Internet (hiện: nhận diện tem bằng AI Gemini, chèn ảnh từ Google Drive hoặc đường dẫn web)
   phải **ẩn ở bản desktop** (dùng biến `desktop`, ví dụ `className={desktop ? "hidden" : ...}`), không để người dùng bấm vào rồi gặp lỗi mạng.
2. **API chỉ qua `/api/desktop/*`** của máy chủ cục bộ (có mã xác thực) hoặc chạy hoàn toàn trong trình duyệt. Không thêm cổng hay dịch vụ mới, không nghe ngoài `127.0.0.1`.
3. **Dữ liệu** dùng `localStorage` như bản web; không đổi khóa `barcode_designer_*`, `kiotlabel_*`.
4. **In**: mọi tính năng in mới đi qua `buildPrinterPayload` / `handleDirectPrint` trong `ui/src/App.tsx` để web và desktop dùng chung một nơi dựng lệnh.
5. **Quyền hệ thống**: không ghi registry, không dịch vụ, không tự khởi động, không tải về. Thay đổi liên quan quyền phải được ghi lại và cân nhắc ảnh hưởng tới trình diệt virus.
6. Không thêm packer/obfuscator, không đổi `IncludeNativeLibrariesForSelfExtract`/nén tệp đơn, không thêm gói NuGet vô cớ (mỗi thứ làm tăng diện tích bị quét nhầm).

## 7. Việc còn lại / ý tưởng

- In thẳng giấy A4/A5 và máy in thường (dựng ảnh từng trang rồi in bằng GDI).
- Chữ ký số cho `KiotLabel.exe` (cần chứng chỉ code signing OV/EV): ký trước bước tạo zip.
- Thông báo có bản mới (chỉ nhắc, người dùng tự tải; không tự tải/tự chạy).
- Kiểm thử macOS/Linux: `server.mjs` đã có đường in qua CUPS (`lp -o raw`) nhưng chưa thử; cần script khởi chạy riêng cho các hệ điều hành đó.
- Chưa chọn giấy phép mã nguồn: khi chưa có tệp LICENSE, mặc định mọi quyền thuộc tác giả (người ngoài xem được nhưng chưa được phép sao chép/phân phối lại).
