# TÀI LIỆU TOÀN DIỆN: KIOTLABEL (PHIÊN BẢN WEB V3.2, ĐÃ BỔ SUNG ĐẾN V3.5)

Tài liệu này là cẩm nang chi tiết nhất mô tả toàn bộ giao diện, các tính năng, mục đích sử dụng, kiến trúc phát triển kỹ thuật và hướng dẫn sử dụng từng bước của ứng dụng **KiotLabel (Web V3.2)**.


> **Thay đổi từ V3.2 đến nay** (các chương bên dưới vẫn mô tả V3.2, chưa viết lại từng chương; xem `README.md` cùng thư mục và `docs/DECISIONS.md` ở gốc repo):
> - Đổi tên sản phẩm từ "KiotLabel Designer" thành **KiotLabel** (khóa localStorage `barcode_designer_*` giữ nguyên để không mất mẫu đã lưu).
> - Hệ tọa độ: ô X/Y hiển thị khoảng cách từ góc trên-trái tem; mã vạch, QR, ảnh, hình khối neo góc trên-trái, chỉ văn bản dùng điểm neo.
> - Thao tác thiết kế mới: chọn nhiều, sao chép/dán (Ctrl+C/V), nhân đôi (Ctrl+D), thanh "Sắp xếp" (căn chỉnh, phân bố đều, thứ tự lớp), chọn tất cả (Ctrl+A).
> - In ấn: xuất lệnh ZPL (Zebra) và TSPL (TSC/Xprinter/Gprinter) cho cả lô; ô chọn DPI cho PDF/PNG (150/203/288/300/600); xuất PDF nhanh hơn nhiều với lô Excel; cảnh báo lưới tem vượt khổ giấy.
> - Kiểm tra giá trị nhập, cảnh báo mã vạch/QR không hợp lệ, sửa lỗi hoàn tác.
> - Giao diện điện thoại (<768 px) chia hai tab "Thiết lập" / "Tem & in".
> - Tải lười các thư viện nặng (Excel, chụp trang, PDF); gói chính khoảng 0,86 MB.
> - ZPL/TSPL: hỗ trợ hình ảnh (đổi sang ảnh đơn sắc), hình tròn/oval, góc xoay và nét đứt/chấm (dựng thành ảnh); hình tô đặc khi màu nền tối.
> - ZPL/TSPL cũng in ảnh nền tem, ảnh chụp được dither tự động; đọc được CSV UTF-8/UTF-16/ANSI.
> - PDF vector là kiểu PDF mặc định (PDF ảnh là dự phòng); ô "In ảnh nền" quyết định có in ảnh nền hay không.
> - Giới hạn: chữ xoay trong ZPL/TSPL không dùng font máy in; font mặc định và Tahoma trong PDF vector chỉ gần đúng; chỉ hỗ trợ mã vạch CODE128, EAN-13, CODE39.

---

## MỤC LỤC
1. [TỔNG QUAN HỆ THỐNG](#1-tổng-quan-hệ-thống)
2. [KHU VỰC TRÌNH THIẾT KẾ (LABEL CANVAS WORKSPACE)](#2-khu-vực-trình-thiết-kế-label-canvas-workspace)
3. [THANH CÔNG CỤ THAO TÁC NHANH (TOP TOOLBAR)](#3-thanh-công-cụ-thao-tác-nhanh-top-toolbar)
4. [BẢNG CẤU HÌNH TRÁI (LEFT SIDEBAR TABS)](#4-bảng-cấu-hình-trái-left-sidebar-tabs)
   * [Tab 1: Khổ Tem & Giấy (Label & Sheet Configuration)](#tab-1-khổ-tem--giấy-label--sheet-configuration)
   * [Tab 2: Thiết Kế Tem (Add & Setup Objects)](#tab-2-thiết-kế-tem-add--setup-objects)
5. [BẢNG THUỘC TÍNH CHI TIẾT PHẢI (PROPERTIES PANEL)](#5-bảng-thuộc-tính-chi-tiết-phải-properties-panel)
   * [Đối tượng Văn Bản (Chữ Nhãn - Text Object)](#đối-tượng-văn-bản-chữ-nhãn---text-object)
   * [Đối tượng Mã Vạch (Barcode Object)](#đối-tượng-mã-vạch-barcode-object)
   * [Đối tượng Mã QR (QRCode Object)](#đối-tượng-mã-qr-qrcode-object)
   * [Đối tượng Hình Ảnh (Image Object)](#đối-tượng-hình-ảnh-image-object)
   * [Đối tượng Hình Khối (Shape Object)](#đối-tượng-hình-khối-shape-object)
6. [HỆ THỐNG LIÊN KẾT EXCEL (EXCEL BINDING ENGINE)](#6-hệ-thống-liên-kết-excel-excel-binding-engine)
7. [HỆ THỐNG IN ẤN & KẾT XUẤT (PRINT ENGINE)](#7-hệ-thống-in-án--kết-xuất-print-engine)

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Khái niệm & Mục tiêu
**KiotLabel** là phần mềm thiết kế nhãn in mã vạch và thông tin hàng hóa chuyên nghiệp, chạy trực tiếp trên nền tảng Web hoặc Desktop (Offline). Mục tiêu cốt lõi là giải quyết bài toán in ấn tem nhãn chính xác từng milimet cho các cửa hàng bán lẻ, siêu thị, kính mắt, trang sức và kho vận mà không cần cài đặt các phần mềm thiết kế cồng kềnh.

### 1.2 Triết lý Hoạt động Offline
Ứng dụng hoạt động **100% Client-side (Offline)**. Toàn bộ quá trình xử lý dữ liệu Excel, sinh mã vạch dạng vector (SVG), dựng mã QR, lưu cấu hình mẫu tem nhãn đều diễn ra ngay trên trình duyệt của người dùng. Không có bất kỳ dữ liệu nhạy cảm nào bị tải lên máy chủ, đảm bảo tốc độ phản hồi tức thì và tính bảo mật thông tin tuyệt đối.

---

## 2. KHU VỰC TRÌNH THIẾT KẾ (LABEL CANVAS WORKSPACE)

Vùng trung tâm hiển thị con tem đơn lẻ hoặc cuộn tem thực tế khi xem trước in.

### 2.1 Thước đo Vật lý (Physical Rulers)
*   **Mô tả**: Hai thanh thước đo nằm ở phía trên (Ruler ngang) và bên trái (Ruler dọc) của Canvas thiết kế. Trên thước hiển thị các vạch chia đơn vị milimet (`mm`) và các con số tương ứng kích thước thực tế.
*   **Mục đích**: Giúp người thiết kế định vị trực giác xem các đối tượng nằm ở milimet thứ bao nhiêu của con tem, đối chiếu trực tiếp với con tem giấy đo bằng thước kẻ vật lý.
*   **Mô tả kỹ thuật**:
    *   Trục tọa độ sử dụng gốc tọa độ $0,0$ tại tâm của con tem (Center-Relative) hoặc góc trên bên trái, tùy cấu hình thiết kế. Thước tự động sinh số lượng vạch chia dựa trên chiều rộng (`labelConfig.width`) và chiều cao (`labelConfig.height`) nhân với hệ số tỉ lệ hiển thị `pixelScale`.
    *   Các vạch dài hiển thị ở khoảng cách mỗi $5\text{mm}$ và $10\text{mm}$, vạch ngắn hiển thị ở khoảng cách $1\text{mm}$.
*   **Hướng dẫn sử dụng**: Người dùng nhìn vào các đường dóng mờ màu xanh lá/xanh dương xuất hiện khi di chuyển đối tượng để biết vị trí tương đối của đối tượng so với các mốc milimet trên thước đo.

### 2.2 Tọa độ Tuyệt đối & Tỷ lệ DPI (DPI Scale Engine)
*   **Mô tả**: Toàn bộ kích thước trong cơ sở dữ liệu lưu dưới dạng đơn vị milimet (`mm`). Tuy nhiên, màn hình máy tính hiển thị bằng điểm ảnh (`pixel`).
*   **Mục đích**: Đảm bảo hiển thị mượt mà trên màn hình độ phân giải thấp nhưng khi xuất bản in PDF hoặc file ảnh PNG thì đạt độ phân giải siêu sắc nét **300 DPI**, không bị mờ vỡ chữ hay răng cưa mã vạch.
*   **Mô tả kỹ thuật**:
    *   **Khi hiển thị thông thường**: Áp dụng hệ số tỉ lệ `pixelScale = 3.7795` (tương đương 96 DPI tiêu chuẩn, tức $1\text{mm} = 3.7795\text{px}$). Hệ số này giúp giao diện hiển thị vừa vặn với kích thước cửa sổ trình duyệt.
    *   **Khi lưu file ảnh / in ấn chất lượng cao**: Hệ thống tự động nâng tỉ lệ lên `pixelScale = 11.811` (tương đương 300 DPI siêu nét, tức $1\text{mm} = 11.811\text{px}$). Bằng cách này, mọi đối tượng vector (SVG, Canvas QR, Font chữ) được phóng to lên gấp khoảng 3 lần khi vẽ nền rồi nén lại thành file PDF/PNG, triệt tiêu hoàn toàn lỗi font chữ tối thiểu của trình duyệt (trình duyệt thường giới hạn font chữ tối thiểu là $9\text{px}$ hoặc $12\text{px}$ làm méo thiết kế khi tem quá nhỏ).

### 2.3 Cơ chế Tương tác Chuột (Drag, Resize, Rotate)
*   **Mô tả**: Cho phép nhấp trực tiếp vào bất kỳ phần tử nào trên Canvas để thực hiện các thao tác căn chỉnh bằng tay.
*   **Mục đích**: Tối giản hóa việc thiết kế, người sử dụng không cần nhập số thủ công vẫn có thể tạo được bố cục mong muốn.
*   **Mô tả kỹ thuật**:
    *   **Kéo di chuyển (Drag)**: Khi nhấn giữ chuột trái trên đối tượng, hệ thống ghi nhận tọa độ chuột bắt đầu (`clientX`, `clientY`) và tính khoảng cách chênh lệch dX, dY (quy đổi ra mm bằng cách chia cho `pixelScale`) để cập nhật thuộc tính `x` và `y` của đối tượng.
    *   **Co giãn kích thước (Resize)**: 8 điểm neo vuông nhỏ màu xanh xung quanh đối tượng cho phép co giãn theo các góc và cạnh tương ứng. Hệ thống sử dụng phép quay lượng giác đảo ngược để tính toán kích thước thực tế mới khi co giãn đối tượng đang bị xoay góc.
    *   **Xoay tự do (Rotate)**: Nút tròn nhô lên ở phía trên cùng đối tượng. Khi kéo nút này, hệ thống tính góc lượng giác giữa điểm tâm đối tượng và vị trí con trỏ chuột bằng hàm `Math.atan2(dy, dx) * 180 / Math.PI`, chuyển đổi góc xoay từ $0^\circ$ đến $360^\circ$ thời gian thực.
    *   **Bắt dính lưới (Grid Snapping)**: Nếu bật chế độ lưới, các tọa độ `x, y, width, height` sau khi kéo thả sẽ được làm tròn về bội số gần nhất của bước lưới (Ví dụ bước lưới $1\text{mm}$ thì tọa độ $12.34\text{mm}$ tự động nhảy về $12.0\text{mm}$).
*   **Hướng dẫn sử dụng**: Nhấp chọn đối tượng -> Kéo các góc để chỉnh kích thước -> Nhấp giữ tâm để di chuyển -> Kéo nút tròn đỉnh để xoay góc tùy ý.

### 2.4 Quét chọn nhiều đối tượng (Multi-select Box)
*   **Mô tả**: Cho phép gom nhiều đối tượng cùng lúc để di chuyển đồng thời hoặc xóa hàng loạt.
*   **Mục đích**: Tiết kiệm thời gian khi cần di chuyển cả cụm nhãn (Ví dụ dịch chuyển cả cụm Tên hàng + Đơn giá xuống dưới).
*   **Mô tả kỹ thuật**:
    *   Người dùng có thể giữ phím `Ctrl` hoặc phím `Shift` và click chọn từng đối tượng để thêm vào mảng `selectedIds`.
    *   Hoặc click vào vùng trống trên Canvas và kéo rê chuột để vẽ một khung chọn hình chữ nhật nét đứt màu xanh. Khi nhả chuột, hệ thống quét tọa độ biên của tất cả đối tượng trong nhãn, đối tượng nào nằm hoàn toàn hoặc một phần bên trong khung chữ nhật nét đứt sẽ tự động được thêm vào trạng thái chọn.
*   **Hướng dẫn sử dụng**: Giữ chuột trái ở vùng trống ngoài tem -> Kéo phủ qua các đối tượng muốn chọn -> Thả chuột. Sau đó có thể dùng phím mũi tên hoặc kéo chuột để di chuyển cả nhóm.

### 2.5 Cơ chế Tự động Thu nhỏ Bản xem trước (Auto-Fit Preview Scaling)
*   **Mô tả**: Khi người dùng chọn chế độ xem "Xem Cuộn Tem" (cuộn 3 tem hoặc cuộn kích thước siêu lớn), cuộn giấy in có thể rộng tới $110\text{mm}$ ($415\text{px}$) hoặc cao hơn chiều rộng màn hình hiển thị.
*   **Mục đích**: Ngăn chặn tình trạng cuộn tem hiển thị quá to làm tràn màn hình, che mất Properties Panel (bảng thuộc tính phải) hoặc tràn xuống dưới làm mất các nút thao tác nhanh.
*   **Mô tả kỹ thuật**:
    *   Sử dụng một `ResizeObserver` theo dõi liên tục chiều rộng thực tế của vùng làm việc chính (`containerRef.current`).
    *   Tính toán tỷ số: `scaleFactor = (containerWidth - 32) / pxSheetWidth` (với 32px là khoảng đệm an toàn).
    *   Nếu tỷ số này nhỏ hơn 1 (nghĩa là cuộn tem bị tràn biên), hệ thống sẽ tự động gán style:
      ```css
      transform: scale(scaleFactor);
      transform-origin: top center;
      width: pxSheetWidth px;
      height: pxSheetHeight px;
      margin-bottom: -(pxSheetHeight * (1 - scaleFactor)) px;
      ```
    *   Việc giảm `margin-bottom` tương ứng giúp triệt tiêu khoảng trống thừa do hiệu ứng `scale` của CSS gây ra, giữ cho bố cục chân trang không bị đẩy ra xa.
*   **Hướng dẫn sử dụng**: Hoàn toàn tự động. Người dùng không cần cấu hình, tem to sẽ tự thu nhỏ vừa mắt, tem nhỏ giữ nguyên tỷ lệ gốc 100% để hiển thị trung thực nhất.

---

## 3. THANH CÔNG CỤ THAO TÁC NHANH (TOP TOOLBAR)

Nằm ở đỉnh ứng dụng, cung cấp các thao tác quản lý tệp tin và lịch sử thiết kế.

### 3.1 Nút "Chọn Mẫu có sẵn (Preset)"
*   **Mục đích**: Cung cấp các phôi nhãn chuẩn thương mại điện tử và bán lẻ được thiết kế sẵn để người dùng sử dụng ngay lập tức mà không cần tự vẽ từ đầu.
*   **Mô tả kỹ thuật**: Khi click vào nút, một hộp thoại (Modal) mở ra, nạp danh sách template từ `src/templates.ts` (bao gồm Tem kệ siêu thị, cuộn 2 tem, cuộn 3 tem, tem kính mắt chữ T, tem trang sức râu treo...). Khi người dùng chọn một mẫu, hệ thống sẽ ghi đè cấu hình `labelConfig`, `sheetConfig` và danh sách đối tượng `objects` vào trạng thái chính (State).
*   **Hướng dẫn sử dụng**: Click **Chọn Mẫu có sẵn** -> Duyệt tìm mẫu phù hợp (ví dụ: *Tem mắt kính chữ T*) -> Click **Áp dụng mẫu này**.

### 3.2 Nút "Open File" (Nhập file `.kvl`)
*   **Mục đích**: Tải lên các file thiết kế đuôi `.kvl` hoặc `.json` đã xuất ra từ trước hoặc từ máy tính khác để tiếp tục chỉnh sửa.
*   **Mô tả kỹ thuật**: Kích hoạt một thẻ `<input type="file" accept=".kvl,.json" />` ẩn. Khi chọn file, ứng dụng dùng `FileReader` để đọc nội dung văn bản JSON, tiến hành kiểm tra cấu trúc (Validation) để đảm bảo có đầy đủ các trường bắt buộc của nhãn rồi ghi đè vào State.
*   **Hướng dẫn sử dụng**: Click **Open File** -> Chọn tệp tin `.kvl` trên máy tính -> Giao diện thiết kế tự động khôi phục đúng trạng thái đã lưu.

### 3.3 Nút "SAVE AS..." (Lưu tệp tin cấu hình)
*   **Mục đích**: Xuất bản thiết kế hiện tại ra ổ cứng máy tính thành file định dạng `.kvl` để lưu trữ lâu dài hoặc gửi cho khách hàng, đồng thời lưu tạm vào bộ nhớ trình duyệt.
*   **Mô tả kỹ thuật**:
    *   Hệ thống đóng gói toàn bộ thông tin gồm: `labelConfig`, `sheetConfig`, danh sách các đối tượng thiết kế `objects`, ảnh nền watermark Base64, và phiên bản ứng dụng (`version: "3.2"`) thành chuỗi JSON.
    *   Tạo một đối tượng `Blob` với kiểu nội dung `application/json`.
    *   Tạo đường link tải xuống ảo (`URL.createObjectURL(blob)`), tự đặt tên tệp dựa trên tên mẫu tem nhãn và tự động click để tải xuống máy tính của người dùng.
*   **Hướng dẫn sử dụng**: Click **SAVE AS...** -> Nhập tên file muốn lưu -> File sẽ được tải về thư mục Download của máy tính dưới dạng `ten_file.kvl`.

### 3.4 Nút "Xoá hết" (Clear Canvas)
*   **Mục đích**: Dọn sạch toàn bộ đối tượng trên Canvas để bắt đầu thiết kế một nhãn hoàn toàn mới từ tờ giấy trắng.
*   **Mô tả kỹ thuật**: Gọi hàm reset để đưa mảng `objects` về rỗng `[]`, gỡ bỏ ảnh nền watermark và hủy bỏ chọn đối tượng. Thao tác này có thể hoàn tác được qua hệ thống Undo.
*   **Hướng dẫn sử dụng**: Click **Xoá hết** -> Xác nhận đồng ý xóa ở hộp thoại hiện ra.

### 3.5 Cặp nút "Quay lại" (Undo) & "Tiếp tục" (Redo)
*   **Mục đích**: Khôi phục lại trạng thái thiết kế trước đó nếu lỡ tay xóa nhầm hoặc di chuyển lệch đối tượng.
*   **Mô tả kỹ thuật**:
    *   Hệ thống duy trì một danh sách lịch sử (History Stack) gồm `past` (danh sách các trạng thái cũ) và `future` (danh sách các trạng thái sau khi bấm Undo).
    *   Mỗi khi có hành động thay đổi đối tượng (di chuyển, đổi cỡ chữ, thêm/bớt đối tượng), trạng thái nhãn hiện tại được đẩy vào stack `past`.
    *   Nút **Undo** sẽ rút trạng thái cuối cùng trong `past` ra làm trạng thái hiện tại, đồng thời đẩy trạng thái vừa bị thay thế vào `future`.
    *   Nút **Redo** làm ngược lại.
*   **Hướng dẫn sử dụng**: Click nút mũi tên xoay trái để **Quay lại** bước trước đó, hoặc click mũi tên xoay phải để **Đi tiếp**. Có thể nhấn tổ hợp phím tắt nhanh `Ctrl + Z` (Undo) và `Ctrl + Y` (Redo).

---

## 4. BẢNG CẤU HÌNH TRÁI (LEFT SIDEBAR TABS)

Nơi người dùng thiết lập gốc cho khổ giấy in và thêm các đối tượng mới vào tem nhãn.

### Tab 1: Khổ Tem & Giấy (Label & Sheet Configuration)
Thiết lập kích thước vật lý của một con tem và cách sắp xếp chúng trên khổ in.

#### A. Cấu hình con tem riêng lẻ (Label Config)
*   **Chiều rộng nhãn (mm)**: Nhập chiều ngang vật lý của một con tem đơn (Ví dụ: $35\text{mm}$ cho tem siêu thị, $50\text{mm}$ cho tem trà sữa).
*   **Chiều cao nhãn (mm)**: Nhập chiều cao vật lý đứng của một con tem đơn (Ví dụ: $22\text{mm}$ cho tem siêu thị, $30\text{mm}$ cho tem trà sữa).
*   **Độ bo góc (Corner Radius - px)**: Nhập độ bo tròn của 4 góc con tem. Giá trị bằng 0 nghĩa là tem vuông góc sắc cạnh. Giá trị lớn hơn giúp hiển thị các dòng tem bo góc thời trang (như tem trang sức).

#### B. Chế độ xem & Khổ giấy sắp xếp (Sheet Config)
*   **Nút chuyển đổi "Bản Thiết Kế (1 Tem)" vs "Xem Cuộn Tem"**:
    *   *Mục đích*: Chuyển đổi giữa chế độ tập trung căn chỉnh chi tiết cho 1 con tem mẫu duy nhất và chế độ hiển thị toàn bộ hàng loạt các con tem nằm sát nhau trên cuộn giấy thực tế để xem trước khi bấm in.
*   **Loại giấy/Sơ đồ sắp xếp**:
    *   **Cuộn in nhiệt liên tục (Thermal Roll)**: Cấu hình cho máy in mã vạch chuyên dụng (như Xprinter, TSC, Zebra). Cuộn giấy chạy liên tiếp, chỉ giới hạn số tem trên 1 hàng ngang (Số cột).
        *   *Thông số đi kèm*:
            *   **Số nhãn trên 1 hàng (Số cột)**: Nhập số tem nằm trên một dòng ngang của cuộn giấy (Ví dụ: cuộn 2 tem thì nhập `2`, cuộn 3 tem siêu thị nhập `3`).
            *   **Khoảng cách hàng - Gap sensor (mm)**: Khoảng trống đứt quãng giữa các hàng tem dọc trên cuộn giấy (mặc định phổ biến của các cuộn tem nhiệt là $3.0\text{mm}$).
            *   **Khoảng cách cột - Column Gap (mm)**: Khoảng cách trống giữa các con tem nằm cạnh nhau trên cùng một hàng (Ví dụ: cuộn 3 tem thường có khoảng trống cột $1\text{mm}$ hoặc sát nhau bằng $0\text{mm}$).
            *   **Lề biên cuộn - Roll Side Margin (mm)**: Khoảng trống biên từ mép ngoài của cuộn giấy đến mép ngoài của con tem đầu tiên/cuối cùng (thường là $1\text{mm}$).
    *   **Giấy văn phòng cắt sẵn (Khổ A4, A5, Letter...)**: Cấu hình sắp xếp nhãn lên các trang giấy văn phòng tiêu chuẩn để in bằng máy in laser/inkjet thông thường (ví dụ: Giấy Tomy 135, Tomy 145...).
        *   *Thông số đi kèm*:
            *   **Chọn cỡ giấy**: Danh sách thả xuống gồm A4, A5, A3, Letter hoặc Tự nhập kích thước (Custom).
            *   **Hướng giấy**: Dọc (Portrait) hoặc Ngang (Landscape).
            *   **Căn lề trang in (mm)**: Nhập khoảng cách lề Trên (Top), Dưới (Bottom), Trái (Left), Phải (Right) của cả trang giấy A4.
            *   **Số nhãn thiết lập**: Số hàng (`rows`) và số cột (`cols`) nhãn phân bố trên một trang giấy (Ví dụ giấy Tomy 145 có 5 hàng, 4 cột nhãn trên một trang A4).
*   **Đường viền chia nhãn (Show Border/Gridlines)**:
    *   *Mục đích*: Hiển thị hoặc ẩn các nét đứt mờ phân định ranh giới giữa các con tem khi xem trước trên màn hình.
    *   *Thông số đi kèm*: Bật/Tắt hiển thị viền nhãn, chọn màu viền nhãn (Ví dụ màu xám mờ `#9ca3af`) để dễ dàng căn lề biên của con tem khi in thử.

---

### Tab 2: Thiết Kế Tem (Add & Setup Objects)
Chứa các nút bấm để thêm nhanh đối tượng vào tâm của con tem và thiết lập ảnh nền định vị.

#### A. Các nút thêm đối tượng nhanh (Nút bấm dấu `+`)
1.  **Nút `+ Văn bản`**:
    *   *Chức năng*: Tạo một đối tượng chữ mới tại tâm nhãn với nội dung mặc định là `"Văn bản mới"`.
    *   *Mục đích*: Ghi tên sản phẩm, đơn giá, nguồn gốc xuất xứ, hạn sử dụng...
2.  **Nút `+ Mã vạch`**:
    *   *Chức năng*: Tạo một mã vạch 1D tại tâm nhãn với dữ liệu mặc định là `"SP000001"`, chuẩn mã vạch mặc định là `CODE128`.
    *   *Mục đích*: Quét tính tiền nhanh qua máy đọc mã vạch.
3.  **Nút `+ Mã QR`**:
    *   *Chức năng*: Tạo một mã vuông QR Code 2D tại tâm nhãn với dữ liệu mặc định là `"https://kiotviet.vn"`.
    *   *Mục đích*: Quét thanh toán chuyển khoản ngân hàng (VietQR), quét truy xuất nguồn gốc sản phẩm hoặc dẫn tới link trang web.
4.  **Nút `+ Hình ảnh`**:
    *   *Chức năng*: Tạo một khung chứa ảnh trống hoặc tải ảnh trực tiếp từ máy tính làm logo đại diện cho thương hiệu cửa hàng.
5.  **Nút `+ Hình khối`**:
    *   *Chức năng*: Tạo một đối tượng hình học cơ bản (mặc định là hình chữ nhật nét liền màu đen). Có thể cấu hình thành đường thẳng phân cách, hình vuông bao quanh, hình tròn trang trí, hoặc hình oval ôm lấy giá tiền.

#### B. Chế độ ảnh nền & Định vị (Watermark / Background Tracing)
*   **Mục đích**: Tải một bức ảnh chụp thực tế hoặc ảnh scan của con tem mẫu (ví dụ: phôi tem của hãng hàng không, phôi tem kiểm định của nhà nước hoặc mẫu nhãn gốc của hãng sản xuất) đè mờ ở dưới Canvas. Giúp người thiết kế chỉ cần kéo thả các ô chữ, mã vạch đè đúng lên các ô trống trên ảnh chụp là có thiết kế khớp 100% với tem gốc mà không cần đo đạc phức tạp.
*   **Thông số chi tiết**:
    *   **Nút "Tải ảnh nền/Watermark"**: Kích hoạt bộ chọn tệp tin ảnh từ máy tính (`.png`, `.jpg`, `.jpeg`, `.svg`). Ảnh tải lên được chuyển đổi thành chuỗi Base64 DataURL để lưu trực tiếp vào cấu hình tệp tin `.kvl`.
    *   **Thanh trượt Độ mờ ảnh nền (Opacity - %)**: Cho phép điều chỉnh độ đậm nhạt của ảnh nền từ 0% (ẩn hoàn toàn) đến 100% (hiển thị rõ nét) để không bị lóa mắt khi kéo thả đối tượng thiết kế ở lớp trên.
    *   **Lưu ý kỹ thuật quan trọng (đã sửa so với V3.2)**: có ô "In ảnh nền" (mặc định bật): bật thì ảnh nền được in cùng tem ở PDF và ZPL/TSPL (mô phỏng độ mờ bằng lớp chấm thưa); tắt thì ảnh nền chỉ hiện khi thiết kế để định vị.

---

## 5. BẢNG THUỘC TÍNH CHI TIẾT PHẢI (PROPERTIES PANEL)

Đây là bảng điều khiển thông minh tự động thay đổi giao diện và các trường nhập liệu tùy thuộc vào loại đối tượng mà người dùng đang click chọn trên Canvas.

---

### Đối tượng Văn Bản (Chữ Nhãn - Text Object)
Được sử dụng cho mọi trường thông tin hiển thị chữ hoặc số trên con tem.

#### 5.1 Nội dung văn bản (Text Content)
*   **Nhập thủ công (Text Area)**: Ô nhập văn bản nhiều dòng. Người dùng có thể nhập chữ cố định (Ví dụ: `Cửa hàng sữa tươi`, `Hạn sử dụng:`).
    *   *Đặc biệt*: Nếu đối tượng đang được liên kết động với cột Excel (xem mục tiếp theo), ô nhập thủ công này sẽ tự động bị khóa (Disabled) và hiển thị thông báo mờ *"Đang nối Excel. Chữ cố định bị tắt"* kèm tên cột đang liên kết, tránh người dùng bị nhầm lẫn giữa dữ liệu tĩnh và dữ liệu động.

#### 5.2 Liên kết dữ liệu Excel (Excel Linker Module)
*   **Mục đích**: Biến ô chữ tĩnh thành ô chữ động tự động thay đổi giá trị theo từng dòng của bảng Excel khi in hàng loạt.
*   **Mô tả kỹ thuật**:
    *   Hiển thị một danh sách thả xuống (Select Dropdown) chứa toàn bộ các tên cột tiêu đề trích xuất từ file Excel đã tải lên (ví dụ: `Tên hàng`, `Mã hàng`, `Giá bán`, `Nhà sản xuất`...).
    *   Khi chọn một cột, thuộc tính `excelColumn` của đối tượng được gán bằng tên cột đó.
    *   *Nút hủy liên kết (Unlink - Màu đỏ)*: Xuất hiện khi đối tượng đã được gán cột. Nhấp vào đây để gỡ liên kết Excel, đưa đối tượng quay lại chế độ nhập chữ tĩnh thủ công.

#### 5.3 Định dạng dữ liệu (Data Formatting)
*   **Mục đích**: Chuẩn hóa cách hiển thị của số liệu và ngày tháng lấy từ Excel (Ví dụ: giá tiền từ Excel là số thô `150000` nhưng hiển thị trên tem phải là `150.000` hoặc ngày tháng từ Excel bị lệch định dạng sẽ được chuẩn hóa lại gọn gàng).
*   **Loại định dạng**:
    1.  **Mặc định (General)**: Giữ nguyên văn bản gốc từ file Excel hoặc ô nhập liệu, không xử lý thêm.
    2.  **Định dạng Số (Number)**:
        *   **Ngăn thập phân**: Chọn kiểu ngăn cách phần thập phân lẻ bằng **Dấu phẩy (,)** theo chuẩn Việt Nam hoặc **Dấu chấm (.)** theo chuẩn quốc tế.
        *   **Phân cách hàng ngàn (Checkbox)**: Tự động thêm dấu phân cách hàng ngàn, hàng triệu (Ví dụ biến số `1250000` thành `1.250.000` hoặc `1,250,000` giúp cực kỳ dễ đọc giá tiền).
        *   **Chữ số thập phân**: Chọn số chữ số hiển thị sau dấu phẩy lẻ: *Tự động*, *0 chữ số* (làm tròn thành số nguyên), *1 chữ số*, *2 chữ số*, *3 chữ số*, *4 chữ số*.
    3.  **Định dạng Ngày / Giờ (Date/Time)**:
        *   **Định dạng mẫu (Presets)**: Chọn các mẫu ngày giờ phổ biến:
            *   `DD/MM/YYYY` (Ngày/Tháng/Năm - Ví dụ: `25/12/2026`)
            *   `DD/MM/YYYY HH:mm` (Ngày/Tháng/Năm Giờ:Phút - Ví dụ: `25/12/2026 14:30`)
            *   `HH:mm` (Chỉ lấy Giờ:Phút - Ví dụ: `14:30`)
            *   `DD-MM-YYYY` (Định dạng gạch ngang - Ví dụ: `25-12-2026`)
            *   `YYYY-MM-DD` (Định dạng chuẩn quốc tế - Ví dụ: `2026-12-25`)
            *   *Tùy chọn tự nhập*: Ô chữ cho phép tự gõ chuỗi định dạng tùy chỉnh theo quy ước của thư viện format ngày tháng.
        *   **Chọn giờ hệ thống (Checkbox)**:
            *   *Mục đích*: Tự động lấy ngày giờ thực tế hiện tại của đồng hồ máy tính lúc in để điền vào tem nhãn (Ví dụ tem đóng gói thịt nguội, bánh mì cần in chính xác ngày giờ đóng gói lúc chạy máy in).
            *   *Kỹ thuật*: Khi tích chọn, thuộc tính `useSystemTime` bằng `true`. Hệ thống bỏ qua dữ liệu Excel ở ô này và liên tục cập nhật thời gian thực vào Canvas.

#### 5.4 Định dạng chữ & Trực quan (Typography & Visuals)
*   **Kiểu dáng chữ**: Bộ 4 nút bấm thao tác nhanh cho phép bật/tắt kết hợp:
    *   `B` (Bold): Tô chữ đậm (`fontWeight: "bold"`).
    *   `I` (Italic): Nghiêng chữ (`fontStyle: "italic"`).
    *   `U` (Underline): Gạch chân chữ (`textDecoration: "underline"`).
    *   `S` (Strikethrough): Gạch ngang thân chữ (`textDecoration: "line-through"` - Thường dùng cho giá niêm yết cũ để làm nổi bật giá khuyến mãi mới ở dưới).
*   **Font chữ**: Menu thả xuống chọn họ Font hiển thị:
    *   *Chữ thường (Sans-serif)*: Font Inter hiện đại, dễ đọc trên mọi thiết bị.
    *   *Arial*: Font quốc dân siêu tương thích.
    *   *Times New Roman*: Chữ có chân (Serif) trang trọng, cổ điển.
    *   *Tahoma*: Font hẹp đứng tiết kiệm diện tích.
    *   *Mã máy (Monospace)*: Font JetBrains Mono có độ rộng các ký tự bằng nhau tuyệt đối, khuyên dùng cho các chuỗi mã sản phẩm hoặc bảng số tiền để xếp thẳng hàng dọc tăm tắp.
*   **Cỡ chữ (pt)**: Ô nhập số trực tiếp cỡ font chữ (Point). Hệ thống hỗ trợ cỡ chữ cực nhỏ lẻ (ví dụ: `5.5pt` hoặc `6.8pt`) giúp căn chỉnh chữ vừa khít các khe hẹp của tem kính mắt hoặc trang sức.
*   **Màu sắc chữ**:
    *   Hộp chọn màu hệ thống (Color Picker) cho phép chọn bất kỳ gam màu nào trong bảng màu RGB.
    *   Ô nhập mã Hex trực tiếp (Ví dụ: gõ `#DC2626` cho màu đỏ thương hiệu KiotViet).
    *   Bảng 5 nút màu định nghĩa sẵn thông dụng nhất: Đen (`#000000`), Đỏ (`#FF0000`), Xanh dương (`#0000FF`), Xanh lá (`#008000`), Cam (`#FFA500`). Nhấp để đổi màu ngay lập tức.
*   **Căn lề chữ (Text Align)**: Bộ 3 nút bấm căn lề khối chữ bên trong khung bao của nó:
    *   *Căn Trái (Left)*: Chữ dạt về bên trái.
    *   *Căn Giữa (Center)*: Toàn bộ các dòng chữ căn đều về trục tâm giữa.
    *   *Căn Phải (Right)*: Chữ dạt về biên phải.
*   **Chỉ số trên/dưới (Superscript / Subscript)**:
    *   *Nút $X^2$*: Biến văn bản thành chỉ số trên (Superscript), hữu ích cho đơn vị tính mét vuông ($m^2$), mét khối ($m^3$) hoặc ký hiệu thương hiệu đăng ký ($^TM$).
    *   *Nút $X_2$*: Biến văn bản thành chỉ số dưới (Subscript), hữu ích cho các công thức hóa học, ký hiệu khoa học ($H_2O$).

#### 5.5 Điểm neo & Dòng chảy chữ (Text Flow Origin / Anchor)
*   **Ý nghĩa**: Đây là tính năng nâng cao vô cùng quan trọng khi liên kết Excel. Khi in hàng loạt, tên các mặt hàng có độ dài ngắn khác nhau (Ví dụ dòng 1 tên là `"Táo"` - 3 ký tự, dòng 2 tên là `"Nước xả vải Downy hương nắng mai túi 1.6L"` - 42 ký tự). Điểm neo quyết định khối chữ sẽ "phình" ra hoặc "co" lại từ vị trí nào để không bị tràn lệch ra ngoài rìa tem nhãn.
*   **Danh sách điểm neo gồm 9 vị trí biên**:
    *   `Top Left`, `Top Center`, `Top Right`
    *   `Center Left`, `Center` (Trung tâm), `Center Right`
    *   `Bottom Left`, `Bottom Center`, `Bottom Right`
*   **Cơ chế kỹ thuật**:
    *   Khi người dùng thay đổi điểm neo trong Properties Panel, hệ thống lập tức tính toán lại tọa độ hiển thị vật lý trên màn hình:
    *   Mục tiêu là giữ nguyên vị trí trực quan hiện tại của khối chữ trên Canvas, nhưng thay đổi gốc tọa độ gốc tham chiếu toán học.
    *   Phép tính toán học chuyển đổi tọa độ điểm neo:
      $$\text{multipliers} = \begin{cases} 
      (0.5, 0.5) & \text{nếu neo là Center} \\
      (0, 0) & \text{nếu neo là Top-Left} \\
      (1, 0) & \text{nếu neo là Top-Right} \\
      \dots & \dots
      \end{cases}$$
      $$\text{newX} = \text{visualLeft} + \text{newMultiplierX} \times \text{width}$$
      $$\text{newY} = \text{visualTop} + \text{newMultiplierY} \times \text{height}$$
    *   Khi in thực tế từ Excel, nếu tên sản phẩm quá dài, chữ sẽ tự động tràn đều về hai bên nếu chọn neo `Center`, hoặc chỉ tràn sang phải nếu chọn neo `Top Left`, giữ nguyên vị trí lề đã căn chỉnh tuyệt đối.
*   **Hướng dẫn sử dụng**: Nếu bạn muốn căn chữ thẳng hàng mép trái của tem, hãy chọn neo `Top Left` hoặc `Center Left`. Nếu muốn chữ luôn nằm chính giữa tâm con tem cho dù ngắn hay dài, hãy chọn neo `Center`.

#### 5.6 Bảng vị trí & kích thước thu gọn (Collapsible Position Panel)
Mục này bị ẩn theo mặc định để thu gọn giao diện, nhấp vào thanh tiêu đề để mở rộng.
*   **X (mm)**: Tọa độ ngang của đối tượng tính từ tâm nhãn (hoặc góc trái tùy chế độ). Cho phép nhập số lẻ chính xác tới $0.1\text{mm}$.
*   **Y (mm)**: Tọa độ đứng dọc của đối tượng tính từ tâm nhãn.
*   **Rộng (mm)**: Chiều rộng vật lý của khung chứa chữ. Nếu văn bản dài vượt quá chiều rộng này, chữ sẽ tự động xuống dòng.
*   **Cao (mm)**: Chiều cao vật lý của khung chứa chữ.
*   **Góc xoay (Degrees - °)**:
    *   *Ô gõ số*: Cho phép gõ góc xoay chính xác từ $0$ đến $359$ độ.
    *   *Hệ thống 8 nút góc xoay nhanh*: $0^\circ, 45^\circ, 90^\circ, 135^\circ, 180^\circ, 215^\circ, 270^\circ, 305^\circ$. Nhấp nút để xoay ngược xoay xuôi đối tượng tức thì. Vô cùng tiện lợi khi làm các loại tem đứng hoặc tem mắt kính cần xoay chữ đứng góc $90^\circ$ hoặc $270^\circ$ chạy dọc theo gọng kính.

#### 5.7 Bộ công cụ căn nhanh vào phôi nhãn (Alignment Helper)
Chứa 6 nút bấm to trực quan giúp căn chỉnh vị trí đối tượng so với mép biên con tem nhãn cực tốc độ:
1.  **Căn Trái**: Đẩy sát biên trái đối tượng chạm mép trái của con tem ($X = 0 + \text{offset_neo}$).
2.  **Giữa Ngang**: Đưa đối tượng vào chính giữa tâm trục dọc của con tem nhãn.
3.  **Căn Phải**: Đẩy sát biên phải đối tượng chạm mép phải con tem.
4.  **Căn Trên**: Đẩy đối tượng lên sát mép đỉnh trên cùng của con tem.
5.  **Giữa Dọc**: Đưa đối tượng vào chính giữa tâm trục ngang của con tem nhãn.
6.  **Căn Dưới**: Đẩy đối tượng xuống sát mép đáy dưới cùng của con tem.

---

### Đối tượng Mã Vạch (Barcode Object)
Dùng để tạo các mã sọc quét bằng máy đọc tia laser.

#### 5.8 Các thuộc tính độc quyền của Mã vạch:
1.  **Dữ liệu mã vạch (Barcode Data)**: Chuỗi ký tự thô để mã hóa thành vạch (Ví dụ: `8934563123457`). Cho phép liên kết động với cột mã vạch của file Excel.
2.  **Định dạng mã (Format)**: Danh sách thả xuống chọn tiêu chuẩn mã hóa:
    *   `CODE128`: Chuẩn mã vạch phổ biến nhất thế giới hiện nay, mã hóa được cả chữ cái và chữ số, độ nén cực tốt. Khuyên dùng cho tất cả nhãn hàng hóa nội bộ.
    *   `CODE39`: Chuẩn mã vạch cổ điển, độ an toàn cao nhưng vạch in ra khá dài, tốn diện tích tem.
    *   `EAN-13`: Chuẩn mã vạch thương mại quốc gia bắt buộc phải có đúng 12 hoặc 13 chữ số đầu vào (máy quét siêu thị). Nếu dữ liệu Excel không đủ số, mã vạch sẽ hiển thị lỗi cảnh báo đỏ chứ không vẽ sai chuẩn.
    *   `EAN-8`: Phiên bản thu gọn của EAN-13 dành cho bao bì siêu nhỏ, yêu cầu đúng 7-8 chữ số đầu vào.
    *   `ITF`: Thường dùng trong đóng gói thùng carton lớn.
    *   `UPC-A`: Chuẩn mã vạch thương mại thông dụng tại thị trường Mỹ và Canada.
3.  **Chiều rộng vạch đơn (Bar Width)**: Độ rộng của từng sọc vạch nhỏ nhất. Tùy chỉnh từ `1.0` đến `3.0` để điều chỉnh mã vạch giãn nở chiều ngang vừa khít tem nhãn.
4.  **Chiều cao mã vạch (Bar Height)**: Chiều cao đứng của các sọc vạch mã (mm). Điều chỉnh mã vạch lùn đi hoặc cao lên tùy ý.
5.  **Màu sắc mã vạch**: Chọn màu sắc cho các sọc vạch in (Mặc định bắt buộc phải là màu Đen `#000000` để đảm bảo máy đọc mã vạch quét nhạy nhất. Chỉ đổi màu khác nếu máy in của bạn có chất lượng in nhiệt cực cao và máy quét hỗ trợ quét màu tương phản).
6.  **Cấu hình hiển thị chữ nhãn đi kèm (Barcode Text Config)**:
    *   *Hiển thị số/chữ bên trên mã vạch (Checkbox)*: Đẩy chuỗi văn bản giá trị hiển thị lên nằm trên các sọc vạch.
    *   *Hiển thị số/chữ bên dưới mã vạch (Checkbox)*: Đưa chuỗi văn bản giá trị hiển thị xuống nằm dưới các sọc vạch (Đặc điểm truyền thống của mã vạch siêu thị).
    *   *Cỡ chữ nhãn (pt)*: Điều chỉnh độ to nhỏ của các con số dưới mã vạch.
    *   *Font chữ nhãn*: Chọn font hiển thị số (khuyên dùng Sans-serif hoặc Monospace để số in ra vuông vắn, máy in không bị lỗi dính số vào nhau).
    *   *Khoảng cách tới mã vạch (mm)*: Khoảng hở an toàn (Margin) từ sọc vạch đến dòng chữ số để tránh máy in phun lem mực làm máy quét đọc nhầm chữ thành vạch.
    *   *Độ đậm (Bold checkbox) & In nghiêng (Italic checkbox)*: Làm đậm dòng mã số ở dưới để người dùng dễ đọc bằng mắt thường khi máy quét bị hỏng.
    *   *Màu sắc chữ nhãn*: Đổi màu riêng biệt cho phần chữ số đi kèm mã vạch.

---

### Đối tượng Mã QR (QRCode Object)
Dùng để tạo mã phản hồi nhanh dạng ô vuông ma trận hai chiều.

#### 5.9 Các thuộc tính độc quyền của QR Code:
1.  **Dữ liệu mã QR**: Ô nhập thông tin mã hóa (Ví dụ: thông tin chuyển khoản `Banking VietQR`, đường link Fanpage cửa hàng, mã định danh sản phẩm). Hoạt động hoàn hảo với liên kết cột Excel động.
2.  **Mức độ sửa lỗi (Error Correction Level)**: Menu chọn mức độ tự sửa sai của thuật toán QR Code:
    *   `L` (Low - 7%): Độ sửa lỗi thấp nhất, đổi lại mã QR vẽ ra cực kỳ thưa, các ô vuông rất to dễ quét bằng điện thoại cũ, phù hợp với tem nhãn siêu nhỏ.
    *   `M` (Medium - 15%): Mức độ cân bằng mặc định khuyến nghị.
    *   `Q` (Quarter - 25%): Mức độ sửa lỗi cao.
    *   `H` (High - 30%): Mức độ sửa lỗi cao nhất. Cho phép mã QR bị rách, xước, mờ hoặc dán bẩn tới 30% diện tích bề mặt con tem mà điện thoại quét vẫn đọc ra thông tin chính xác 100%. Rất phù hợp với nhãn dán thiết bị công nghiệp hoặc nhãn vận chuyển ngoài trời chịu mưa nắng.
3.  **Màu sắc mã QR**: Cho phép đổi màu các ô vuông ma trận (Mặc định là Đen `#000000` trên nền trắng).
4.  **Tự động khóa tỉ lệ vuông 1:1**: Trong bảng vị trí kích thước, thuộc tính chiều rộng và chiều cao của mã QR luôn luôn tự động khóa bằng nhau tuyệt đối để đảm bảo quy chuẩn mã QR quốc tế, người dùng không thể kéo méo mã QR thành hình chữ nhật dẹt.

---

### Đối tượng Hình Ảnh (Image Object)
Dùng để chèn biểu tượng logo cửa hàng, nhãn chứng nhận chất lượng (ISO, Organic...) hoặc hình vẽ minh họa.

#### 5.10 Các thuộc tính độc quyền của Hình ảnh:
1.  **Nguồn hình ảnh (Image Source)**:
    *   *Đường dẫn URL*: Nhập link ảnh trực tiếp từ internet (Ví dụ: `https://ten_mien.com/logo.png`).
    *   *Dữ liệu Base64*: Hệ thống hiển thị dòng trạng thái *"✓ Ảnh đã tải lên (Offline)"* nếu người dùng đã tải ảnh trực tiếp từ máy tính lên.
2.  **Nút "Thay đổi ảnh..."**: Cho phép mở cửa sổ duyệt file trên máy tính để chọn ảnh mới thay thế ảnh cũ. Ảnh được nén tự động và chuyển đổi sang chuỗi Base64 lưu trực tiếp vào ứng dụng để hoạt động offline vĩnh viễn không phụ thuộc internet.
3.  **Tỷ lệ hiển thị (Image Fit Mode)**:
    *   `Contain (Thu vừa)`: Giữ nguyên tỷ lệ khung hình gốc của bức ảnh, thu nhỏ ảnh lại nằm trọn vẹn và an toàn bên trong khung bao thiết kế mà không bị bóp méo hay cắt góc.
    *   `Cover (Phủ kín)`: Phóng to bức ảnh lấp đầy toàn bộ diện tích khung bao, chấp nhận cắt bớt các phần thừa ở rìa ảnh nếu tỷ lệ khung bao không khớp tỷ lệ ảnh gốc.
    *   `Fill (Kéo giãn)`: Kéo bóp méo bức ảnh dẹt đi hoặc cao lên cho vừa khít tuyệt đối với chiều rộng và chiều cao của khung bao mà người dùng kéo trên màn hình.
4.  **Độ mờ ảnh (Image Opacity)**: Giá trị từ `0` (vô hình hoàn toàn) đến `1` (hiển thị rõ nét 100%). Thường dùng để làm mờ logo thương hiệu chìm dưới các dòng văn bản.

---

### Đối tượng Hình Khối (Shape Object)
Sử dụng để tạo khung phân tách thông tin, đường phân chia giữa tên sản phẩm và giá bán, hoặc tạo nền nhấn màu cho mã vạch.

#### 5.11 Các thuộc tính độc quyền của Hình khối:
1.  **Loại hình khối (Shape Type)**: Bộ 4 nút bấm chọn hình học:
    *   `Đường kẻ (Line)`: Vẽ một nét thẳng nằm ngang hoặc đứng tùy góc xoay.
    *   `Hình chữ nhật (Rect)`: Vẽ hình vuông hoặc hình chữ nhật.
    *   `Hình tròn (Circle)`: Vẽ hình tròn đồng tâm đều.
    *   `Hình oval (Oval)`: Vẽ hình elip bầu dục co giãn tùy chỉnh.
2.  **Độ dày viền (Shape Stroke Width)**: Độ dày nét vẽ tính bằng milimet (mm), từ cực mảnh `0.1mm` đến siêu dày `10.0mm`.
3.  **Kiểu nét vẽ (Shape Stroke Style)**:
    *   `Solid` (───): Nét vẽ liền mạch liên tục.
    *   `Dashed` (- - -): Nét vẽ đứt quãng nét đứt đứng.
    *   `Dotted` (• • •): Nét vẽ chấm bi tròn liên tiếp.
4.  **Màu sắc viền (Stroke Color)**: Thay đổi màu cho các nét vẽ của hình khối.
5.  **Màu nền của khối (Shape Fill Color / Shading)**:
    *   *Checkbox "Trong suốt"*: Nếu tích chọn, hình khối sẽ rỗng ruột hoàn toàn, chỉ hiển thị khung viền ngoài, cho phép nhìn xuyên qua thấy các văn bản ở lớp dưới.
    *   *Hộp chọn màu nền*: Nếu bỏ chọn trong suốt, người dùng có thể đổ bất kỳ màu nền nào để làm khối nổi bật (Ví dụ: tạo một hình chữ nhật bo góc đổ nền màu đen rực rỡ và đặt chữ màu trắng nổi lên trên).
6.  **Độ bo góc (Corner Radius - mm)**:
    *   *Độc quyền cho Hình chữ nhật*: Cho phép bo tròn 4 góc của hình chữ nhật từ mút nhọn hoắt `0mm` đến bo tròn xoe như viên thuốc nhộng `15mm`.

---

### Nút "Xoá đối tượng" màu đỏ
*   **Vị trí**: Nằm dưới cùng của Properties Panel ở bên phải.
*   **Chức năng**: Xóa vĩnh viễn đối tượng đang được chọn ra khỏi danh sách thiết kế nhãn.
*   **Mẹo nhanh**: Người dùng có thể click chọn đối tượng trên Canvas và nhấn phím `Delete` hoặc `Backspace` trên bàn phím máy tính để xóa cực nhanh mà không cần rê chuột click vào nút này.

---

## 6. HỆ THỐNG LIÊN KẾT EXCEL (EXCEL BINDING ENGINE)

Bảng quản lý dữ liệu nằm ở sát chân trang ứng dụng, là trái tim điều khiển luồng in tem hàng loạt.

### 6.1 Nhập tệp dữ liệu Excel
*   **Mô tả**: Người dùng có thể kéo một file bảng tính Excel (`.xlsx`, `.xls`) hoặc tệp văn bản CSV (`.csv`) thả trực tiếp vào vùng nét đứt dưới chân trang, hoặc nhấp vào vùng đó để duyệt tệp từ ổ cứng.
*   **Kiến trúc kỹ thuật**:
    *   Hệ thống tích hợp thư viện parser bảng tính mạnh mẽ `xlsx` (SheetJS) chạy ngầm hoàn toàn offline.
    *   Hàm phân tích sẽ đọc luồng binary của file, lấy trang tính (Worksheet) đầu tiên, quét dòng đầu tiên để lấy danh sách các tiêu đề cột (`excelColumns`), sau đó chuyển toàn bộ dữ liệu các dòng tiếp theo thành một mảng đối tượng JSON (`excelData`).
    *   Hệ thống tự lọc bỏ các dòng trống rỗng không có giá trị để tránh in nhầm tem trắng.

### 6.2 Bảng xem trước dữ liệu (Data Grid Table)
*   **Mô tả**: Hiển thị danh sách các dòng dữ liệu Excel đã nạp lên dưới dạng bảng lưới thân thiện giống Microsoft Excel thu nhỏ.
*   **Mục đích**: Người sử dụng trực tiếp quan sát xem dữ liệu nạp lên đã chuẩn chưa, xem thứ tự dòng in và gán nhanh trường dữ liệu.
*   **Nút "Ghim gán nhanh" (Nút mũi tên ngược/icon liên kết bên cạnh tiêu đề cột)**:
    *   Khi người dùng đang chọn một đối tượng văn bản trên Canvas và click nút liên kết này ở bảng Excel, hệ thống lập tức tự động điền cú pháp biến số `{TÊN_CỘT}` vào văn bản của đối tượng đó. Giúp liên kết Excel cực kỳ trực quan mà không cần gõ bàn phím.

### 6.3 Thanh điều hướng dòng in hoạt động (Row Navigation Toolbar)
*   Nằm phía trên bảng Excel, bao gồm:
    *   **Nút đầu tiên/cuối cùng (`<<` và `>>`)**: Nhảy nhanh về dòng số 1 hoặc dòng cuối cùng của bảng Excel.
    *   **Nút lùi/tiến (`<` và `>`)**: Chuyển đổi xem dòng tiếp theo hoặc dòng trước đó.
    *   **Ô nhập số dòng trực tiếp**: Cho phép gõ số dòng bất kỳ (Ví dụ gõ dòng `15` để xem trước con tem số 15 hiển thị thông tin gì trên Canvas thiết kế).

---

## 7. HỆ THỐNG IN ẤN & KẾT XUẤT (PRINT ENGINE)

Cung cấp các giải pháp xuất xưởng tem nhãn thiết kế ra các thiết bị in ấn vật lý. Nhấp vào nút **BƯỚC 4: IN TEM** màu xanh lá cây rực rỡ để mở bảng in.

---

### Tab 1: In trực tiếp từ Trình duyệt (High-DPI PDF Print)
Giải pháp tối ưu cho văn phòng sử dụng máy in thông thường (Laser/Inkjet) in trên giấy A4 chia sẵn nhãn hoặc cuộn in nhiệt chạy driver đồ họa của Windows/macOS.

#### 7.1 Cơ chế kết xuất siêu nét (High-Precision Printing Mechanism)
*   **Vấn đề của Trình duyệt**: Khi gọi lệnh in trực tiếp từ trình duyệt, nếu in các văn bản quá nhỏ lẻ trên tem nhãn $35\text{mm} \times 22\text{mm}$, cơ chế tối ưu hiển thị font chữ tối thiểu của trình duyệt (thường là $9\text{px}$) sẽ ép cỡ chữ to lên, làm vỡ bố cục thiết kế, chữ đè lên mã vạch làm máy quét không đọc được.
*   **Giải pháp kỹ thuật của KiotLabel**:
    *   Khi người dùng nhấn nút in, hệ thống không gọi lệnh in trang web hiện tại. Thay vào đó, ứng dụng tạo ra một cửa sổ in ảo chạy song song hoặc mở một luồng in tối ưu riêng biệt.
    *   Hệ thống tự động nâng tỷ lệ DPI của Canvas từ màn hình ($3.7795$) lên độ chính xác cao của in ấn chuyên nghiệp là **300 DPI** ($11.811\text{px/mm}$).
    *   Toàn bộ tọa độ, cỡ chữ, vạch sọc mã vạch đều được nhân với tỷ lệ 300 DPI này. Sau đó, hệ thống sử dụng các bộ lọc CSS in ấn chuyên dụng để thu gom lại vừa khít kích thước milimet gốc:
      ```css
      @media print {
        body {
          margin: 0;
          padding: 0;
          background: #ffffff;
        }
        .print-page {
          page-break-after: always;
          width: 100mm;
          height: 100mm;
        }
        /* Ẩn hoàn toàn các thanh công cụ thiết kế của KiotLabel */
        #left-sidebar, #properties-panel, #top-toolbar, #excel-footer {
          display: none !important;
        }
      }
      ```
    *   Điều này đảm bảo từng trang in xuất ra máy in là một trang giấy độc lập tuyệt đối, nét vẽ mảnh mai và tinh xảo, chất lượng tiệm cận các phần mềm thiết kế vector chuyên sâu như Bartender hay CorelDRAW.

#### 7.2 Hướng dẫn sử dụng in PDF từng bước:
1.  Thiết kế xong tem nhãn và liên kết dữ liệu Excel hoàn chỉnh.
2.  Click nút **IN TEM** -> Chọn Tab **In trực tiếp từ Trình duyệt (PDF)**.
3.  Click nút **[THIẾT LẬP IN HỆ THỐNG] (Bấm phím Ctrl + P)**.
4.  Cửa sổ in của Trình duyệt (Chrome/Edge/Firefox) hiện ra, cấu hình bắt buộc:
    *   **Máy in (Destination)**: Chọn đúng tên máy in nhiệt hoặc máy in văn phòng đang kết nối.
    *   **Khổ giấy (Paper size)**: Chọn đúng khổ giấy của cuộn tem nhãn vật lý đã đo ở Bước 1 (Ví dụ: `100mm x 150mm` hoặc `35mm x 22mm`). Nếu máy in nhiệt chuyên dụng, hãy bấm nút nâng cao để khai báo khổ giấy tùy chỉnh đúng kích thước tem.
    *   **Lề (Margins)**: Chọn bắt buộc là **Không có (None)** hoặc **Tối thiểu (Minimum)** để tránh trình duyệt tự ý chèn thêm khoảng trắng lề ngoài làm lệch tem.
    *   **Tỷ lệ (Scale)**: Chọn bắt buộc là **100% (Mặc định)** hoặc **Vừa khít khổ giấy (Fit to page)**.
    *   **Tùy chọn nền (Background graphics)**: Tích chọn bật lên để hiển thị đầy đủ màu sắc hình khối trang trí và logo nhãn hiệu.
5.  Xem trước bản in trên màn hình hiển thị hoàn hảo -> Click **Print (In)**.

---

### Tab 2: Mã lệnh máy in chuyên dụng (Direct Command TSPL & ZPL)
Giải pháp in công nghiệp siêu tốc cho máy in nhiệt TSC, Xprinter, Gprinter (chuẩn mã lệnh TSPL) và máy in Zebra (chuẩn mã lệnh ZPL). Bỏ qua toàn bộ Driver đồ họa chậm chạp của Windows, truyền thẳng mã nhị phân văn bản qua cổng kết nối giúp tốc độ in đạt tới hàng ngàn nhãn mỗi phút, không trễ, không lỗi lệch trang.

#### 7.3 Giải thuật sinh mã lệnh máy in nhiệt TSPL
*   **Mô tả**: TSPL (TSC Printer Language) là bộ lệnh điều khiển máy in nhiệt cực kỳ thông dụng của hãng TSC và hầu hết các dòng máy in nhiệt giá rẻ trên thị trường Việt Nam hiện nay như Xprinter (XP-350B, XP-420B...).
*   **Giải thuật kỹ thuật trong `tsplGenerator.ts`**:
    1.  Khai báo kích thước giấy in bằng câu lệnh: `SIZE [width] mm, [height] mm` dựa trên `labelConfig.width` và `labelConfig.height`.
    2.  Khai báo khoảng cách giữa các hàng tem: `GAP [rowGap] mm, 0`.
    3.  Lệnh xóa bộ đệm máy in: `CLS`.
    4.  Duyệt qua mảng đối tượng `objects` để sinh các lệnh vẽ tương ứng:
        *   *Vẽ chữ*: Sinh lệnh `TEXT x, y, "font", rotation, x_multiplication, y_multiplication, "content"`. Hệ thống tự quy đổi tọa độ mm sang pixel của máy in nhiệt (thường là máy in độ phân giải 203 DPI thì $1\text{mm} = 8$ dot/pixel). Góc xoay vật lý được khớp với hằng số xoay của TSPL ($0^\circ \to 0, 90^\circ \to 90, 180^\circ \to 180, 270^\circ \to 270$).
        *   *Vẽ mã vạch*: Sinh lệnh `BARCODE x, y, "code_type", height, readable_option, rotation, narrow_bar_width, wide_bar_width, "content"`.
        *   *Vẽ mã QR*: Sinh lệnh `QRCODE x, y, error_correction_level, cell_width, mode, rotation, "content"`.
        *   *Vẽ hình khối*: Sinh lệnh `BOX x, y, x_end, y_end, line_thickness` cho hình chữ nhật hoặc đường thẳng.
    5.  Khai báo số lượng bản in cho từng dòng sản phẩm từ dữ liệu Excel: `PRINT [soluong]`.
    6.  Ghép nối các trang in lại thành một chuỗi văn bản liên tục duy nhất.

#### 7.4 Giải thuật sinh mã lệnh máy in Zebra ZPL
*   **Mô tả**: ZPL (Zebra Programming Language) là chuẩn ngôn ngữ điều khiển dòng máy in nhiệt cao cấp của hãng Zebra.
*   **Giải thuật kỹ thuật trong `zplGenerator.ts`**:
    1.  Khởi tạo khối trang in bằng lệnh khởi động: `^XA`.
    2.  Khai báo chiều rộng nhãn bằng dot: `^PW [width_in_dots]`.
    3.  Khai báo chiều cao nhãn bằng dot: `^LL [height_in_dots]`.
    4.  Duyệt qua mảng đối tượng `objects` để sinh mã:
        *   *Tọa độ thực thi*: Luôn bắt đầu bằng lệnh `^FO [x_dots], [y_dots]`.
        *   *Vẽ chữ*: Sinh lệnh font chữ `^A0 [rotation_constant], [height_dots], [width_dots]` kết hợp gán dữ liệu `^FD [content] ^FS`.
        *   *Vẽ mã vạch*: Sinh lệnh `^BC [rotation], [height], [show_text_below], [show_text_above]` cho Code 128, nạp dữ liệu bằng lệnh `^FD [content] ^FS`.
        *   *Vẽ mã QR*: Sinh lệnh `^BQN, 2, [magnification_factor]` (mức sửa lỗi mặc định M), nạp dữ liệu bắt đầu bằng ký tự chuẩn `^FDQA,[content]^FS`.
        *   *Vẽ hình khối*: Sinh lệnh `^GB [width_dots], [height_dots], [thickness_dots], [color], [corner_radius]` (vẽ khối hộp bo góc hoặc đường kẻ).
    5.  Kết thúc trang in bằng lệnh đóng: `^XZ`.

#### 7.5 Bộ lọc loại bỏ dấu tiếng Việt động (Unicode Vietnamese Normalizer)
*   **Mục đích**: Hầu hết các máy in nhiệt chuyên dụng trên thị trường khi mua về đều chưa được nạp (flash) bộ font tiếng Việt Unicode đầy đủ vào bộ nhớ cơ sở (ROM). Nếu truyền trực tiếp chữ tiếng Việt có dấu xuống máy in, máy sẽ in ra các ô vuông lỗi `???` hoặc ký tự rác kì dị.
*   **Mô tả kỹ thuật**:
    *   Hệ thống tích hợp một bộ chuẩn hóa chuỗi tiếng Việt động cực kỳ thông minh trước khi kết xuất mã máy in chuyên dụng:
      ```typescript
      export function removeVietnameseTones(str: string): string {
        return str
          .normalize("NFD")
          .replace(/[\u0300-\u0301-\u0303-\u0309-\u0323]/g, "") // Xóa dấu thanh tiếng Việt
          .replace(/đ/g, "d")
          .replace(/Đ/g, "D")
          .replace(/[^a-zA-Z0-9\s]/g, ""); // Giữ ký tự an toàn
      }
      ```
    *   Chuỗi ký tự sau khi lọc sạch dấu tiếng Việt trở thành không dấu hoàn toàn (Ví dụ: `BÁNH MÌ THỊT NGUỘI` -> `BANH MI THIT NGUOI`), máy in nội bộ xử lý in siêu tốc mà không lo lỗi font chữ hiển thị.

#### 7.6 Hướng dẫn sử dụng in mã lệnh chuyên dụng:
1.  Sau khi hoàn tất thiết kế nhãn, click nút **IN TEM** -> Chọn Tab **Mã lệnh máy in chuyên dụng (TSPL/ZPL)**.
2.  Chọn ngôn ngữ điều khiển tương thích với dòng máy in nhiệt bạn đang sở hữu:
    *   *Chọn TSPL*: Cho các dòng máy phổ thông như Xprinter, TSC, Gprinter...
    *   *Chọn ZPL*: Cho các dòng máy in Zebra.
3.  Click nút **Sao chép mã lệnh** (Màu xanh lá).
4.  Dán mã lệnh vừa sao chép vào phần mềm trung gian truyền cổng (Ví dụ: ứng dụng đẩy cổng COM, công cụ in Raw của Windows hoặc phần mềm điều khiển máy in chuyên biệt) để máy in phun ra hàng trăm tem nhãn cực sắc nét tức thì.
