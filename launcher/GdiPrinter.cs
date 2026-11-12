using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace KiotLabel;

/// <summary>
/// In thẳng ra máy in THƯỜNG (laser/phun, giấy A4/A5...) bằng GDI của Windows, không qua PDF và không chuyển trang thành ảnh:
/// giao diện gửi danh sách lệnh vẽ (ngữ nghĩa giống luồng nội dung PDF: q Q cm m l c h re f S B W n rg RG w d J, cộng T = chữ, I = ảnh);
/// ở đây chạy các lệnh đó lên máy in ở độ phân giải gốc của nó, nên chữ, mã vạch, QR, đường nét là nét vẽ thật (rất nét, dữ liệu rất nhỏ).
/// Chữ dùng font hệ thống Arial/Times New Roman/Courier New (cùng độ rộng chữ với Arimo/Tinos/Cousine mà PDF vector nhúng).
/// Chỉ dùng P/Invoke (gdi32, winspool), không thêm thư viện nào.
/// </summary>
internal static class GdiPrinter
{
    private const int K = 1000; // toạ độ logic = đơn vị người dùng x 1000 để dùng số nguyên mà vẫn chính xác tới 1/1000 đơn vị

    // ---- gdi32 / winspool ----------------------------------------------------------------------------------------------
    [StructLayout(LayoutKind.Sequential)] private struct XFORM { public float eM11, eM12, eM21, eM22, eDx, eDy; }
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] private struct LOGBRUSH { public uint lbStyle; public uint lbColor; public IntPtr lbHatch; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DOCINFO { public int cbSize; public string lpszDocName; public string? lpszOutput; public string? lpszDatatype; public int fwType; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct LOGFONT
    {
        public int lfHeight, lfWidth, lfEscapement, lfOrientation, lfWeight;
        public byte lfItalic, lfUnderline, lfStrikeOut, lfCharSet, lfOutPrecision, lfClipPrecision, lfQuality, lfPitchAndFamily;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string lfFaceName;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BITMAPINFOHEADER
    {
        public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant;
    }

    [StructLayout(LayoutKind.Sequential)] private struct BITMAPINFO { public BITMAPINFOHEADER bmiHeader; public uint bmiColors; }

    [DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateDCW(string driver, string device, string? output, IntPtr initData);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int StartDocW(IntPtr hdc, ref DOCINFO di);
    [DllImport("gdi32.dll")] private static extern int EndDoc(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern int AbortDoc(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern int StartPage(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern int EndPage(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern int GetDeviceCaps(IntPtr hdc, int index);
    [DllImport("gdi32.dll")] private static extern int SetGraphicsMode(IntPtr hdc, int mode);
    [DllImport("gdi32.dll")] private static extern bool SetWorldTransform(IntPtr hdc, ref XFORM xf);
    [DllImport("gdi32.dll")] private static extern int SaveDC(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern bool RestoreDC(IntPtr hdc, int saved);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateSolidBrush(uint color);
    [DllImport("gdi32.dll")] private static extern IntPtr ExtCreatePen(uint style, uint width, ref LOGBRUSH brush, uint styleCount, uint[]? styles);
    [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] private static extern bool BeginPath(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern bool EndPath(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern bool AbortPath(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern bool CloseFigure(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern bool MoveToEx(IntPtr hdc, int x, int y, IntPtr prev);
    [DllImport("gdi32.dll")] private static extern bool LineTo(IntPtr hdc, int x, int y);
    [DllImport("gdi32.dll")] private static extern bool PolyBezierTo(IntPtr hdc, POINT[] pts, uint count);
    [DllImport("gdi32.dll")] private static extern bool FillPath(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern bool StrokePath(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern bool StrokeAndFillPath(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern int SelectClipPath(IntPtr hdc, int mode);
    [DllImport("gdi32.dll")] private static extern int SetPolyFillMode(IntPtr hdc, int mode);
    [DllImport("gdi32.dll")] private static extern int SetBkMode(IntPtr hdc, int mode);
    [DllImport("gdi32.dll")] private static extern uint SetTextColor(IntPtr hdc, uint color);
    [DllImport("gdi32.dll")] private static extern uint SetTextAlign(IntPtr hdc, uint align);
    [DllImport("gdi32.dll")] private static extern int SetStretchBltMode(IntPtr hdc, int mode);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateFontIndirectW(ref LOGFONT lf);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] private static extern bool ExtTextOutW(IntPtr hdc, int x, int y, uint options, IntPtr rect, string text, uint count, IntPtr dx);
    [DllImport("gdi32.dll")] private static extern int StretchDIBits(IntPtr hdc, int xd, int yd, int wd, int hd, int xs, int ys, int ws, int hs, byte[] bits, ref BITMAPINFO bmi, uint usage, uint rop);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateDIBSection(IntPtr hdc, ref BITMAPINFO bmi, uint usage, out IntPtr bits, IntPtr section, uint offset);
    [DllImport("gdi32.dll")] private static extern bool PlgBlt(IntPtr hdcDest, POINT[] pts, IntPtr hdcSrc, int xs, int ys, int ws, int hs, IntPtr mask, int xm, int ym);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool OpenPrinterW(string name, out IntPtr h, IntPtr def);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int DocumentPropertiesW(IntPtr hwnd, IntPtr hPrinter, string name, IntPtr devOut, IntPtr devIn, int mode);

    // ---- kết quả -------------------------------------------------------------------------------------------------------
    public sealed class Result
    {
        public string? Error;
        public int Pages;
        public List<string> Warnings = new();
    }

    // ---- ma trận (hàng-vector: p' = p x M, như XFORM của GDI và `cm` của PDF) ---------------------------------------------
    private static double[] Mul(double[] A, double[] B) => new[]
    {
        A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3],
        A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3],
        A[4] * B[0] + A[5] * B[2] + B[4], A[4] * B[1] + A[5] * B[3] + B[5],
    };
    private static readonly double[] Identity = { 1, 0, 0, 1, 0, 0 };

    private static uint Rgb(double r, double g, double b) =>
        (uint)(Math.Clamp((int)Math.Round(r * 255), 0, 255) | (Math.Clamp((int)Math.Round(g * 255), 0, 255) << 8) | (Math.Clamp((int)Math.Round(b * 255), 0, 255) << 16));

    private sealed class GState
    {
        public double[] Ctm = Identity;
        public uint Fill = 0, Stroke = 0;
        public double LineWidth = 1;
        public double[] Dash = Array.Empty<double>();
        public int Cap = 0, Join = 0;
        public GState Clone() => new() { Ctm = Ctm, Fill = Fill, Stroke = Stroke, LineWidth = LineWidth, Dash = Dash, Cap = Cap, Join = Join };
    }

    private sealed class Img { public int W, H; public byte[] Dib = Array.Empty<byte>(); }

    // ---- khổ giấy ------------------------------------------------------------------------------------------------------
    private const short DMPAPER_A4 = 9, DMPAPER_A5 = 11, DMPAPER_A3 = 8, DMPAPER_LETTER = 1, DMPAPER_USER = 256;
    private const uint DM_ORIENTATION = 0x1, DM_PAPERSIZE = 0x2, DM_PAPERLENGTH = 0x4, DM_PAPERWIDTH = 0x8;

    private static bool Near(double a, double b) => Math.Abs(a - b) < 1.5;

    /// <summary>Tạo DC máy in với khổ giấy/hướng giấy khớp trang đầu của lệnh in.</summary>
    private static IntPtr CreateDeviceContext(string printer, double wMm, double hMm, Result res)
    {
        bool landscape = wMm > hMm;
        double shortSide = Math.Min(wMm, hMm), longSide = Math.Max(wMm, hMm);
        if (!OpenPrinterW(printer, out IntPtr hp, IntPtr.Zero)) { res.Error = "Không mở được máy in \"" + printer + "\" (mã " + Marshal.GetLastWin32Error() + ")."; return IntPtr.Zero; }
        IntPtr dm = IntPtr.Zero;
        try
        {
            int size = DocumentPropertiesW(IntPtr.Zero, hp, printer, IntPtr.Zero, IntPtr.Zero, 0);
            if (size <= 0) { res.Error = "Máy in không cung cấp được cấu hình trang."; return IntPtr.Zero; }
            dm = Marshal.AllocHGlobal(size + 64);
            for (int i = 0; i < size + 64; i++) Marshal.WriteByte(dm, i, 0);
            if (DocumentPropertiesW(IntPtr.Zero, hp, printer, dm, IntPtr.Zero, 2 /*DM_OUT_BUFFER*/) < 0) { res.Error = "Không đọc được cấu hình trang của máy in."; return IntPtr.Zero; }
            // DEVMODE: dmFields @72 (DWORD), dmOrientation @76, dmPaperSize @78, dmPaperLength @80, dmPaperWidth @82 (đơn vị 0,1 mm)
            uint fields = (uint)Marshal.ReadInt32(dm, 72);
            short paper = Near(shortSide, 210) && Near(longSide, 297) ? DMPAPER_A4
                        : Near(shortSide, 148) && Near(longSide, 210) ? DMPAPER_A5
                        : Near(shortSide, 297) && Near(longSide, 420) ? DMPAPER_A3
                        : Near(shortSide, 215.9) && Near(longSide, 279.4) ? DMPAPER_LETTER : DMPAPER_USER;
            fields |= DM_ORIENTATION | DM_PAPERSIZE;
            Marshal.WriteInt16(dm, 76, (short)(landscape ? 2 : 1));
            Marshal.WriteInt16(dm, 78, paper);
            if (paper == DMPAPER_USER)
            {
                fields |= DM_PAPERLENGTH | DM_PAPERWIDTH;
                Marshal.WriteInt16(dm, 80, (short)Math.Round(longSide * 10));
                Marshal.WriteInt16(dm, 82, (short)Math.Round(shortSide * 10));
            }
            Marshal.WriteInt32(dm, 72, (int)fields);
            // Cho trình điều khiển hợp lệ hóa và ghép các thiết lập
            if (DocumentPropertiesW(IntPtr.Zero, hp, printer, dm, dm, 8 | 2 /*DM_IN_BUFFER | DM_OUT_BUFFER*/) < 0) res.Warnings.Add("Trình điều khiển máy in không xác nhận khổ giấy, dùng thiết lập mặc định của máy in.");
            IntPtr hdc = CreateDCW("WINSPOOL", printer, null, dm);
            if (hdc == IntPtr.Zero) res.Error = "Không tạo được ngữ cảnh in cho máy in \"" + printer + "\" (mã " + Marshal.GetLastWin32Error() + ").";
            return hdc;
        }
        finally
        {
            if (dm != IntPtr.Zero) Marshal.FreeHGlobal(dm);
            ClosePrinter(hp);
        }
    }

    // ---- in -----------------------------------------------------------------------------------------------------------
    /// <param name="outputFile">Chỉ dùng khi kiểm thử bằng dòng lệnh (in vào "Microsoft Print to PDF" mà không hiện hộp thoại); API HTTP không bao giờ truyền giá trị này.</param>
    public static Result Print(string printer, string docName, byte[] jobJson, string? outputFile = null)
    {
        var res = new Result();
        JsonDocument json;
        try { json = JsonDocument.Parse(jobJson, new JsonDocumentOptions { MaxDepth = 16 }); }
        catch (Exception e) { res.Error = "Lệnh in không hợp lệ: " + e.Message; return res; }
        using var _ = json;
        var root = json.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("pages", out var pages) || pages.ValueKind != JsonValueKind.Array || pages.GetArrayLength() == 0)
        { res.Error = "Lệnh in không có trang nào."; return res; }
        if (pages.GetArrayLength() > 2000) { res.Error = "Quá nhiều trang trong một lần in (tối đa 2000)."; return res; }

        var images = new Dictionary<string, Img>();
        if (root.TryGetProperty("images", out var imgs) && imgs.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in imgs.EnumerateObject())
            {
                int w = p.Value.GetProperty("w").GetInt32(), h = p.Value.GetProperty("h").GetInt32();
                if (w <= 0 || h <= 0 || w > 8000 || h > 8000) continue;
                byte[] rgb = Convert.FromBase64String(p.Value.GetProperty("rgb").GetString() ?? "");
                if (rgb.Length < w * h * 3) continue;
                int row = (w * 3 + 3) & ~3;
                var dib = new byte[row * h];
                for (int y = 0; y < h; y++)
                    for (int x = 0; x < w; x++)
                    {
                        int s = (y * w + x) * 3, d = y * row + x * 3;
                        dib[d] = rgb[s + 2]; dib[d + 1] = rgb[s + 1]; dib[d + 2] = rgb[s];
                    }
                images[p.Name] = new Img { W = w, H = h, Dib = dib };
            }
        }

        var first = pages[0];
        double firstW = first.GetProperty("wMm").GetDouble(), firstH = first.GetProperty("hMm").GetDouble();
        IntPtr hdc = CreateDeviceContext(printer, firstW, firstH, res);
        if (hdc == IntPtr.Zero) return res;

        bool docStarted = false;
        var fonts = new Dictionary<string, IntPtr>();
        try
        {
            int dpiX = GetDeviceCaps(hdc, 88), dpiY = GetDeviceCaps(hdc, 90);
            int offX = GetDeviceCaps(hdc, 112), offY = GetDeviceCaps(hdc, 113);
            double physWmm = GetDeviceCaps(hdc, 110) * 25.4 / dpiX, physHmm = GetDeviceCaps(hdc, 111) * 25.4 / dpiY;
            if (!(Math.Abs(physWmm - firstW) < 3 && Math.Abs(physHmm - firstH) < 3))
                res.Warnings.Add($"Máy in dùng khổ giấy {physWmm:0}x{physHmm:0} mm khác với khổ thiết kế {firstW:0}x{firstH:0} mm: hãy kiểm tra khổ giấy trong thiết lập máy in; nội dung được đặt theo góc trên-trái.");

            var di = new DOCINFO { cbSize = Marshal.SizeOf<DOCINFO>(), lpszDocName = docName, lpszOutput = outputFile, lpszDatatype = null, fwType = 0 };
            if (StartDocW(hdc, ref di) <= 0) { res.Error = "Máy in từ chối bắt đầu tác vụ in (mã " + Marshal.GetLastWin32Error() + ")."; return res; }
            docStarted = true;

            foreach (var page in pages.EnumerateArray())
            {
                double hMm = page.GetProperty("hMm").GetDouble();
                double pageHpt = hMm * 72 / 25.4;
                // Toạ độ trang PDF (điểm, gốc dưới-trái, y lên) -> điểm ảnh của máy in (gốc trên-trái của vùng in được)
                double sx = dpiX / 72.0, sy = dpiY / 72.0;
                var baseM = new[] { sx, 0, 0, -sy, -(double)offX, pageHpt * sy - offY };
                if (StartPage(hdc) <= 0) throw new InvalidOperationException("StartPage lỗi");
                RunPage(hdc, page.GetProperty("ops"), baseM, images, fonts);
                if (EndPage(hdc) <= 0) throw new InvalidOperationException("EndPage lỗi");
                res.Pages++;
            }
            EndDoc(hdc);
            docStarted = false;
        }
        catch (Exception e)
        {
            res.Error = "Lỗi khi in: " + e.Message;
            if (docStarted) AbortDoc(hdc);
        }
        finally
        {
            foreach (var f in fonts.Values) DeleteObject(f);
            DeleteDC(hdc);
        }
        return res;
    }

    private static void SetWorld(IntPtr hdc, double[] m)
    {
        var x = new XFORM { eM11 = (float)m[0], eM12 = (float)m[1], eM21 = (float)m[2], eM22 = (float)m[3], eDx = (float)m[4], eDy = (float)m[5] };
        SetWorldTransform(hdc, ref x);
    }

    private static double Num(JsonElement e) => e.ValueKind == JsonValueKind.Number ? e.GetDouble() : 0;

    private static void RunPage(IntPtr hdc, JsonElement ops, double[] baseM, Dictionary<string, Img> images, Dictionary<string, IntPtr> fonts)
    {
        SetGraphicsMode(hdc, 2 /*GM_ADVANCED*/);
        SetBkMode(hdc, 1 /*TRANSPARENT*/);
        SetStretchBltMode(hdc, 4 /*HALFTONE*/);
        SetTextAlign(hdc, 24 /*TA_BASELINE*/);
        var gs = new GState();
        var stack = new Stack<GState>();
        var scaleK = new[] { 1.0 / K, 0, 0, 1.0 / K, 0, 0 };
        var scaleKFlip = new[] { 1.0 / K, 0, 0, -1.0 / K, 0, 0 };
        bool pathOpen = false, clipPending = false, evenOdd = false;
        // pdf-lib bọc đường dẫn trong q ... Q rồi tô/viền SAU Q (đường dẫn vẫn còn hiệu lực theo PDF); GDI hủy đường dẫn nếu RestoreDC giữa chừng,
        // nên hoãn RestoreDC cho tới khi đường dẫn được tô/viền/cắt xong
        int deferredRestores = 0;
        void FlushRestores() { while (deferredRestores > 0) { RestoreDC(hdc, -1); deferredRestores--; } }

        // Toạ độ logic = đơn vị người dùng x K: ma trận thế giới = (1/K) x CTM x Base
        void World() => SetWorld(hdc, Mul(scaleK, Mul(gs.Ctm, baseM)));
        void BeginIfNeeded() { if (!pathOpen) { World(); BeginPath(hdc); pathOpen = true; } }
        int L(double v) => (int)Math.Round(v * K);

        IntPtr MakePen(out IntPtr oldPen)
        {
            var lb = new LOGBRUSH { lbStyle = 0 /*BS_SOLID*/, lbColor = gs.Stroke, lbHatch = IntPtr.Zero };
            var full = Mul(gs.Ctm, baseM);
            double scale = Math.Sqrt(Math.Abs(full[0] * full[3] - full[1] * full[2]));
            double minW = scale > 0 ? 1.0 / scale : gs.LineWidth; // tối thiểu 1 điểm ảnh máy in
            uint width = (uint)Math.Max(1, L(Math.Max(gs.LineWidth, minW)));
            // PDF J: 0 cụt, 1 tròn, 2 vuông; j: 0 nhọn, 1 tròn, 2 vát. GDI: ENDCAP_ROUND 0, SQUARE 0x100, FLAT 0x200; JOIN_ROUND 0, BEVEL 0x1000, MITER 0x2000
            uint capBits = gs.Cap == 1 ? 0u : gs.Cap == 2 ? 0x100u : 0x200u;
            uint joinBits = gs.Join == 1 ? 0u : gs.Join == 2 ? 0x1000u : 0x2000u;
            uint style = 0x00010000u /*PS_GEOMETRIC*/ | capBits | joinBits;
            uint[]? dash = null;
            if (gs.Dash.Length > 0)
            {
                style |= 7 /*PS_USERSTYLE*/;
                var list = gs.Dash.Select(d => (uint)Math.Max(1, L(d))).ToList();
                if (list.Count % 2 == 1) list.AddRange(list.ToArray());
                dash = list.ToArray();
            }
            IntPtr pen = ExtCreatePen(style, width, ref lb, dash == null ? 0u : (uint)dash.Length, dash);
            oldPen = SelectObject(hdc, pen);
            return pen;
        }

        void Paint(bool fill, bool stroke, bool close)
        {
            if (!pathOpen) return;
            if (close) CloseFigure(hdc);
            EndPath(hdc);
            pathOpen = false;
            IntPtr brush = IntPtr.Zero, oldBrush = IntPtr.Zero, pen = IntPtr.Zero, oldPen = IntPtr.Zero;
            if (fill) { brush = CreateSolidBrush(gs.Fill); oldBrush = SelectObject(hdc, brush); SetPolyFillMode(hdc, evenOdd ? 1 : 2); }
            if (stroke) { World(); pen = MakePen(out oldPen); }
            if (fill && stroke) StrokeAndFillPath(hdc);
            else if (fill) FillPath(hdc);
            else if (stroke) StrokePath(hdc);
            if (oldBrush != IntPtr.Zero) SelectObject(hdc, oldBrush);
            if (oldPen != IntPtr.Zero) SelectObject(hdc, oldPen);
            if (brush != IntPtr.Zero) DeleteObject(brush);
            if (pen != IntPtr.Zero) DeleteObject(pen);
            FlushRestores();
        }

        double cx = 0, cy = 0; // điểm hiện tại (cho lệnh c/v/y)

        foreach (var op in ops.EnumerateArray())
        {
            string name = op[0].GetString() ?? "";
            int n = op.GetArrayLength();
            switch (name)
            {
                case "q": SaveDC(hdc); stack.Push(gs.Clone()); break;
                case "Q": if (stack.Count > 0) { gs = stack.Pop(); if (pathOpen) deferredRestores++; else RestoreDC(hdc, -1); } break;
                case "cm":
                    gs.Ctm = Mul(new[] { Num(op[1]), Num(op[2]), Num(op[3]), Num(op[4]), Num(op[5]), Num(op[6]) }, gs.Ctm);
                    break;
                case "rg": gs.Fill = Rgb(Num(op[1]), Num(op[2]), Num(op[3])); break;
                case "RG": gs.Stroke = Rgb(Num(op[1]), Num(op[2]), Num(op[3])); break;
                case "g": gs.Fill = Rgb(Num(op[1]), Num(op[1]), Num(op[1])); break;
                case "G": gs.Stroke = Rgb(Num(op[1]), Num(op[1]), Num(op[1])); break;
                case "w": gs.LineWidth = Num(op[1]); break;
                case "J": gs.Cap = (int)Num(op[1]); break;
                case "j": gs.Join = (int)Num(op[1]); break;
                case "d":
                    gs.Dash = n > 1 && op[1].ValueKind == JsonValueKind.Array ? op[1].EnumerateArray().Select(Num).Where(v => v > 0).ToArray() : Array.Empty<double>();
                    break;
                case "m": BeginIfNeeded(); cx = Num(op[1]); cy = Num(op[2]); MoveToEx(hdc, L(cx), L(cy), IntPtr.Zero); break;
                case "l": BeginIfNeeded(); cx = Num(op[1]); cy = Num(op[2]); LineTo(hdc, L(cx), L(cy)); break;
                case "c":
                {
                    BeginIfNeeded();
                    var pts = new POINT[3];
                    for (int i = 0; i < 3; i++) pts[i] = new POINT { x = L(Num(op[1 + i * 2])), y = L(Num(op[2 + i * 2])) };
                    PolyBezierTo(hdc, pts, 3);
                    cx = Num(op[5]); cy = Num(op[6]);
                    break;
                }
                case "v": { BeginIfNeeded(); var pts = new[] { new POINT { x = L(cx), y = L(cy) }, new POINT { x = L(Num(op[1])), y = L(Num(op[2])) }, new POINT { x = L(Num(op[3])), y = L(Num(op[4])) } }; PolyBezierTo(hdc, pts, 3); cx = Num(op[3]); cy = Num(op[4]); break; }
                case "y": { BeginIfNeeded(); var pts = new[] { new POINT { x = L(Num(op[1])), y = L(Num(op[2])) }, new POINT { x = L(Num(op[3])), y = L(Num(op[4])) }, new POINT { x = L(Num(op[3])), y = L(Num(op[4])) } }; PolyBezierTo(hdc, pts, 3); cx = Num(op[3]); cy = Num(op[4]); break; }
                case "h": if (pathOpen) CloseFigure(hdc); break;
                case "re":
                {
                    BeginIfNeeded();
                    double x = Num(op[1]), y = Num(op[2]), w = Num(op[3]), h = Num(op[4]);
                    MoveToEx(hdc, L(x), L(y), IntPtr.Zero); LineTo(hdc, L(x + w), L(y)); LineTo(hdc, L(x + w), L(y + h)); LineTo(hdc, L(x), L(y + h)); CloseFigure(hdc);
                    break;
                }
                case "f": case "F": evenOdd = false; Paint(true, false, false); break;
                case "f*": evenOdd = true; Paint(true, false, false); evenOdd = false; break;
                case "S": Paint(false, true, false); break;
                case "s": Paint(false, true, true); break;
                case "B": evenOdd = false; Paint(true, true, false); break;
                case "B*": evenOdd = true; Paint(true, true, false); evenOdd = false; break;
                case "b": evenOdd = false; Paint(true, true, true); break;
                case "b*": evenOdd = true; Paint(true, true, true); evenOdd = false; break;
                case "W": clipPending = true; break;
                case "W*": clipPending = true; break;
                case "n":
                    if (pathOpen)
                    {
                        EndPath(hdc); pathOpen = false;
                        if (clipPending) SelectClipPath(hdc, 1 /*RGN_AND*/);
                        else AbortPath(hdc);
                        FlushRestores();
                    }
                    clipPending = false;
                    break;
                case "T": DrawText(hdc, op, gs, baseM, scaleKFlip, fonts); break;
                case "I": DrawImage(hdc, op, gs, baseM, images); break;
            }
        }
        if (pathOpen) { EndPath(hdc); AbortPath(hdc); }
        FlushRestores();
        // Dọn phần còn lại của ngăn xếp (nếu lệnh q/Q không cân)
        while (stack.Count > 0) { RestoreDC(hdc, -1); stack.Pop(); }
    }

    private static readonly string[] Faces = { "Arial", "Times New Roman", "Courier New" };

    private static void DrawText(IntPtr hdc, JsonElement op, GState gs, double[] baseM, double[] scaleKFlip, Dictionary<string, IntPtr> fonts)
    {
        int fam = (int)Num(op[1]), flags = (int)Num(op[2]);
        double size = Num(op[3]), x = Num(op[4]), y = Num(op[5]);
        string text = op[6].GetString() ?? "";
        if (text.Length == 0 || size <= 0) return;
        int height = (int)Math.Round(size * K);
        string key = fam + "|" + flags + "|" + height;
        if (!fonts.TryGetValue(key, out IntPtr font))
        {
            var lf = new LOGFONT
            {
                lfHeight = -height, lfWeight = (flags & 1) != 0 ? 700 : 400, lfItalic = (byte)((flags & 2) != 0 ? 1 : 0),
                lfCharSet = 1 /*DEFAULT_CHARSET*/, lfOutPrecision = 7 /*OUT_TT_ONLY_PRECIS*/, lfClipPrecision = 0, lfQuality = 4 /*ANTIALIASED*/,
                lfPitchAndFamily = (byte)(fam == 1 ? 0x12 : fam == 2 ? 0x31 : 0x22),
                lfFaceName = Faces[Math.Clamp(fam, 0, 2)],
            };
            font = CreateFontIndirectW(ref lf);
            fonts[key] = font;
        }
        // Chữ phải đứng thẳng: lật trục y của hệ logic (PDF có y hướng lên, GDI hướng xuống)
        SetWorld(hdc, Mul(scaleKFlip, Mul(gs.Ctm, baseM)));
        IntPtr old = SelectObject(hdc, font);
        uint oldColor = SetTextColor(hdc, Rgb(Num(op[7]), Num(op[8]), Num(op[9])));
        ExtTextOutW(hdc, (int)Math.Round(x * K), (int)Math.Round(-y * K), 0, IntPtr.Zero, text, (uint)text.Length, IntPtr.Zero);
        SetTextColor(hdc, oldColor);
        SelectObject(hdc, old);
    }

    private static void DrawImage(IntPtr hdc, JsonElement op, GState gs, double[] baseM, Dictionary<string, Img> images)
    {
        string? key = op[1].GetString();
        if (key == null || !images.TryGetValue(key, out Img? img)) return;
        double x = Num(op[2]), y = Num(op[3]), w = Num(op[4]), h = Num(op[5]);
        var full = Mul(gs.Ctm, baseM);
        (double X, double Y) P(double px, double py) => (px * full[0] + py * full[2] + full[4], px * full[1] + py * full[3] + full[5]);
        var ul = P(x, y + h); var ur = P(x + w, y + h); var ll = P(x, y);
        // Vẽ ảnh ở không gian thiết bị (ma trận thế giới = đơn vị)
        SetWorld(hdc, Identity);
        var bmi = new BITMAPINFO { bmiHeader = new BITMAPINFOHEADER { biSize = 40, biWidth = img.W, biHeight = -img.H, biPlanes = 1, biBitCount = 24, biCompression = 0 } };
        bool axisAligned = Math.Abs(ur.Y - ul.Y) < 0.5 && Math.Abs(ll.X - ul.X) < 0.5 && ur.X > ul.X && ll.Y > ul.Y;
        if (axisAligned)
        {
            int dx = (int)Math.Round(ul.X), dy = (int)Math.Round(ul.Y);
            int dw = Math.Max(1, (int)Math.Round(ur.X) - dx), dh = Math.Max(1, (int)Math.Round(ll.Y) - dy);
            StretchDIBits(hdc, dx, dy, dw, dh, 0, 0, img.W, img.H, img.Dib, ref bmi, 0, 0x00CC0020 /*SRCCOPY*/);
            return;
        }
        // Ảnh xoay: dựng DIB trong bộ nhớ rồi PlgBlt theo hình bình hành
        IntPtr mem = CreateCompatibleDC(IntPtr.Zero);
        IntPtr dib = CreateDIBSection(mem, ref bmi, 0, out IntPtr bits, IntPtr.Zero, 0);
        if (dib == IntPtr.Zero || bits == IntPtr.Zero) { DeleteDC(mem); return; }
        Marshal.Copy(img.Dib, 0, bits, img.Dib.Length);
        IntPtr old = SelectObject(mem, dib);
        var pts = new[] { new POINT { x = (int)Math.Round(ul.X), y = (int)Math.Round(ul.Y) }, new POINT { x = (int)Math.Round(ur.X), y = (int)Math.Round(ur.Y) }, new POINT { x = (int)Math.Round(ll.X), y = (int)Math.Round(ll.Y) } };
        PlgBlt(hdc, pts, mem, 0, 0, img.W, img.H, IntPtr.Zero, 0, 0);
        SelectObject(mem, old);
        DeleteObject(dib);
        DeleteDC(mem);
    }
}
