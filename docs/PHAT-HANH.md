# Phát hành và cập nhật KiotLabel bản Offline

Dành cho người phát triển. Mô tả cấu trúc mã, cách đóng gói thành **một tệp `KiotLabel.exe`**, phát hành lên GitHub Releases, và **luồng đồng bộ khi bản web có phiên bản mới**.

## 1. Cấu trúc repo

```
launcher/    C# (.NET 8): KiotLabel.exe = máy chủ cục bộ + trình khởi chạy + gửi lệnh in thô (winspool) + giao diện nhúng sẵn. Không WPF/WinForms, không gói NuGet, không Node
  LocalServer.cs  máy chủ HTTP tối giản trong tiến trình (127.0.0.1, mã xác thực, phục vụ giao diện nhúng, API máy in)
  Launcher.cs     khởi động máy chủ, mở Edge/Chrome ở chế độ --app, tắt khi đóng cửa sổ, chọn thư mục dữ liệu
  PrinterApi.cs   liệt kê máy in, ghi dữ liệu RAW (winspool) cho máy in tem (ZPL/TSPL)
  GdiPrinter.cs   in trang vẽ trực tiếp ra máy in thường (A4/A5) bằng GDI: chạy danh sách lệnh vẽ do ui/src/utils/vectorPdf/recorder.ts ghi (cú pháp như luồng nội dung PDF + lệnh T chữ, I ảnh)
  AppInfo.cs      số phiên bản (nguồn của phiên bản desktop)
ui/          mã nguồn giao diện KiotLabel (React + Vite); là bản sao đồng bộ từ bản web (mục 4). Bản build (ui/dist) được NHÚNG vào KiotLabel.exe
server/      server.mjs: máy chủ Node tương đương cho macOS/Linux (in qua CUPS). Chưa kiểm thử, chưa phát hành, KHÔNG nằm trong KiotLabel.exe
scripts/     build-desktop.mjs (đóng gói), check-release.mjs (kiểm tra trước khi phát hành)
docs/        UNG-DUNG-OFFLINE.md (mô tả ứng dụng), PHAT-HANH.md (tài liệu này)
.github/workflows/  ci.yml (kiểm tra mỗi lần push), release.yml (phát hành lên Releases)
```

## 2. Đóng gói trên máy (Windows)

Cần Node (để build giao diện) và .NET 8 SDK.
```bash
node scripts/build-desktop.mjs            # kết quả ở dist-desktop/: KiotLabel.exe và KiotLabel.exe.sha256
node scripts/check-release.mjs            # chạy lại riêng phần kiểm tra
```
Script build giao diện (`ui/`), rồi `dotnet publish` (giao diện nhúng bằng `EmbeddedResource`, một tệp, không nén, không tự giải nén), ghi SHA-256 và chạy `check-release.mjs`,
báo lỗi (và dừng) nếu: phiên bản giao diện lệch phiên bản desktop (`AppInfo.cs`, `KiotLabel.csproj`, `app.manifest`, `server.mjs`, hoặc `x.y.z` không đồng nhất);
bản build giao diện có tham chiếu CDN/font từ mạng; cấu hình đóng gói có cờ dễ bị trình diệt virus báo nhầm (`IncludeNativeLibrariesForSelfExtract`, nén tệp đơn...);
`KiotLabel.exe` không khớp SHA-256, không chạy được `--version`, hoặc không chứa đúng phiên bản giao diện.

In trang vẽ: `KiotLabel.exe --print-sheet-test "Microsoft Print to PDF" <lệnh.json> <ra.pdf>` in danh sách lệnh vẽ vào tệp PDF (không hiện hộp thoại, không tốn giấy), rồi so với PDF vector chuẩn bằng pdf.js (đã khớp 97–98% ở 144 DPI). Khi sửa `GdiPrinter.cs` hoặc `recorder.ts` hãy chạy lại phép so này.

Kiểm thử tự động nên chạy thêm khi sửa máy chủ: `KiotLabel.exe --server-only` chạy máy chủ không mở cửa sổ (in cổng ra stdout) để gửi các yêu cầu thử
(mã xác thực, Host lạ, tên máy in lạ, dữ liệu rỗng/quá lớn, thoát thư mục, chunked, đầu quá lớn...).

Thử thủ công trước mỗi lần phát hành (bắt buộc, máy tự động không in được ra máy in thật):
- [ ] chạy `KiotLabel.exe` ở thư mục mới: cửa sổ mở, đúng số phiên bản, mẫu mặc định hiển thị
- [ ] chọn máy in tem thật, in 1–2 tem: nội dung, kích thước, mã vạch/QR đúng
- [ ] "Lưu thành PDF" tạo được PDF
- [ ] lưu mẫu, đóng cửa sổ, mở lại: mẫu còn
- [ ] đóng cửa sổ: `KiotLabel.exe` thoát (Task Manager); mở lần hai khi đang chạy chỉ báo "đang chạy"
- [ ] không còn mục cần Internet (AI, ảnh Google Drive/đường dẫn web)
- [ ] quét Defender: `MpCmdRun.exe -Scan -ScanType 3 -File KiotLabel.exe` không phát hiện gì

## 3. Phát hành lên GitHub Releases

1. Cập nhật số phiên bản nếu cần (mục 5), commit, push lên `main`, chờ `ci.yml` xanh.
2. Gắn nhãn và đẩy: `git tag v3.5.4 && git push origin v3.5.4` (nhãn dạng `vX.Y.Z`, phải trùng `Version` trong `launcher/AppInfo.cs`; `X.Y` trùng giao diện).
3. `release.yml` dựng `KiotLabel.exe` trên máy chủ GitHub (windows-latest), chạy `check-release`, tạo **chứng thực nguồn gốc** (attestation), rồi tạo Release kèm
   `KiotLabel.exe` và `KiotLabel.exe.sha256`. Có thể chạy thủ công ở Actions → Release → Run workflow (chỉ dựng, không tạo Release nếu không có nhãn).
4. Website trỏ tới `https://github.com/thuyettk42-tech/kiotlabel-desktop/releases/latest/download/KiotLabel.exe`: luôn là bản mới nhất,
   không phải sửa website mỗi lần phát hành.
5. Tải tệp từ Release về chạy thử một lần nữa (mục 2).

Quy ước phiên bản: `X.Y.Z`; `X.Y` luôn bằng phiên bản giao diện KiotLabel; `Z` tăng khi chỉ sửa phần desktop (máy chủ, trình khởi chạy, đóng gói).

Bài học khi dựng trên GitHub Actions (đã gặp ở v3.5.0 và v3.5.1, phát hành thành công ở v3.5.2):
- `tar` trong PATH của máy chủ Windows có thể là GNU tar của Git, không tạo/đọc được zip (không còn dùng zip từ v3.5.3).
- Gọi `powershell.exe` từ `pwsh` thừa kế `PSModulePath` của bản 7 nên `Get-AuthenticodeSignature` trả về rỗng (không còn kiểm tra chữ ký Node từ v3.5.3 vì Node không còn trong gói).
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
5. Nâng phiên bản desktop cho khớp (mục 5), `node scripts/build-desktop.mjs`, thử thủ công, commit, gắn nhãn, phát hành (mục 3).

Bản desktop **không tự cập nhật**: người dùng phải tải bản mới. Hệ quả: sau mỗi lần web đổi giao diện/tính năng in, nên phát hành lại bản desktop.

## 5. Chỗ chứa số phiên bản

`ui/index.html` (tiêu đề và màn chờ; nguồn của phiên bản giao diện), `launcher/AppInfo.cs` (`Version`, nguồn của phiên bản desktop và của `--version`),
`launcher/KiotLabel.csproj` (`Version`, `AssemblyVersion`, `FileVersion`), `launcher/app.manifest`, `server/server.mjs` (`VERSION`).
`check-release.mjs` báo nếu `X.Y` lệch giao diện hoặc `x.y.z` không đồng nhất giữa các tệp desktop.

## 6. Quy tắc offline khi đồng bộ hoặc thêm tính năng

1. **Không gọi mạng**: không tải font/CDN/script từ Internet. Tính năng cần Internet (hiện: nhận diện tem bằng AI Gemini, chèn ảnh từ Google Drive hoặc đường dẫn web)
   phải **ẩn ở bản desktop** (dùng biến `desktop`, ví dụ `className={desktop ? "hidden" : ...}`), không để người dùng bấm vào rồi gặp lỗi mạng.
2. **API chỉ qua `/api/desktop/*`** của máy chủ cục bộ (có mã xác thực; thêm API mới ở `launcher/LocalServer.cs` và, nếu cần cho macOS/Linux, ở `server/server.mjs`)
   hoặc chạy hoàn toàn trong trình duyệt. Không thêm cổng hay dịch vụ mới, không nghe ngoài `127.0.0.1`.
3. **Dữ liệu** dùng `localStorage` như bản web; không đổi khóa `barcode_designer_*`, `kiotlabel_*`.
4. **Nhận diện máy in**: cách in tự chọn theo `ui/src/utils/printerProfile.ts` (tên/driver -> ZPL, TSPL hoặc vẽ trang). Khi gặp dòng máy in mới, thêm quy tắc và thêm ca kiểm thử vào `ui/tests/printerProfile.test.ts`; chỉ xếp vào lệnh gốc khi chắc chắn máy nhận ZPL/TSPL (nhầm sẽ ra chữ rác), còn lại để vẽ trang. Dữ kiện từ `GET /api/desktop/printers` (driver, cổng, máy in ảo, khổ giấy tối đa, DPI); `server.mjs` cho macOS/Linux chỉ trả tên nên mọi máy được xếp vẽ trang/tên.
5. **In**: mọi tính năng in mới đi qua `buildPrinterPayload` (máy in tem) / `buildVectorOps` (máy in thường) và `handleDirectPrint` trong `ui/src/App.tsx`; bố cục chỉ tính một lần trong `vectorPdf/render.ts` (dùng chung cho PDF vector và bản in trang vẽ). Nếu `render.ts` thêm lệnh vẽ mới (ví dụ hiệu ứng), phải bổ sung vào `recorder.ts` (danh sách lệnh cho phép) và `GdiPrinter.cs`.
6. **Quyền hệ thống**: không ghi registry, không dịch vụ, không tự khởi động, không tải về. Thay đổi liên quan quyền phải được ghi lại và cân nhắc ảnh hưởng tới trình diệt virus.
7. Không thêm packer/obfuscator, không đổi `IncludeNativeLibrariesForSelfExtract`/nén tệp đơn, không thêm gói NuGet vô cớ, không nhét thêm chương trình (Node, v.v.) vào tệp exe
   (mỗi thứ làm tăng diện tích bị quét nhầm).

## 7. Việc còn lại / ý tưởng

- In thẳng A4/A5 trên máy in thật (laser/phun): đã kiểm thử qua tệp PDF của Windows, cần thử ra giấy; thêm tuỳ chọn lề không in được, in hai mặt, chọn khay giấy.
- Chữ ký số cho `KiotLabel.exe` (cần chứng chỉ code signing OV/EV): ký sau bước build, trước khi tính SHA-256.
- Thông báo có bản mới (chỉ nhắc, người dùng tự tải; không tự tải/tự chạy).
- Kiểm thử và phát hành bản macOS/Linux dựa trên `server/server.mjs` (đã có đường in qua CUPS `lp -o raw`, chưa thử); cần cách khởi chạy riêng cho các hệ điều hành đó.
- Chưa chọn giấy phép mã nguồn: khi chưa có tệp LICENSE, mặc định mọi quyền thuộc tác giả (người ngoài xem được nhưng chưa được phép sao chép/phân phối lại).
