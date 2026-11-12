using System.Runtime.InteropServices;
using System.Text;

namespace KiotLabel;

/// <summary>Liệt kê máy in và gửi dữ liệu thô (ZPL/TSPL) thẳng tới hàng đợi in Windows (winspool, kiểu dữ liệu RAW).</summary>
internal static class PrinterApi
{
    private const int PRINTER_ENUM_LOCAL = 0x2;
    private const int PRINTER_ENUM_CONNECTIONS = 0x4;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct PRINTER_INFO_4
    {
        public string pPrinterName;
        public string pServerName;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DOC_INFO_1
    {
        public string pDocName;
        public string? pOutputFile;
        public string pDatatype;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool EnumPrinters(int flags, string? name, int level, IntPtr pPrinterEnum, int cbBuf, out int pcbNeeded, out int pcReturned);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetDefaultPrinter(StringBuilder? pszBuffer, ref int pcchBuffer);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOC_INFO_1 di);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct PRINTER_INFO_2
    {
        public string pServerName, pPrinterName, pShareName, pPortName, pDriverName, pComment, pLocation;
        public IntPtr pDevMode;
        public string pSepFile, pPrintProcessor, pDatatype, pParameters;
        public IntPtr pSecurityDescriptor;
        public uint Attributes, Priority, DefaultPriority, StartTime, UntilTime, Status, cJobs, AveragePPM;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int DeviceCapabilitiesW(string device, string? port, ushort capability, IntPtr output, IntPtr devMode);

    private const ushort DC_MAXEXTENT = 5, DC_ENUMRESOLUTIONS = 13;

    /// <summary>Thông tin một máy in để giao diện tự chọn cách in: tên driver, cổng, khổ giấy tối đa (mm), các độ phân giải (DPI).</summary>
    public sealed record PrinterDetail(string Name, string Driver, string Port, bool IsVirtual, int MaxWidthMm, int MaxHeightMm, int[] Dpi);

    private static bool LooksVirtual(string driver, string port)
    {
        string d = driver.ToLowerInvariant(), p = port.ToUpperInvariant();
        return p.StartsWith("PORTPROMPT") || p.StartsWith("SHRFAX") || p == "NUL:" || p.StartsWith("MICROSOFT.") || p.EndsWith("_MICROSOFT.ONENOTEIM_S-1-5-21") ||
               d.Contains("microsoft print to pdf") || d.Contains("xps document writer") || d.Contains("onenote") || d.Contains("fax") || d.Contains("software printer");
    }

    /// <summary>Danh sách máy in kèm thông tin phân loại (không giao tiếp với máy in thật, chỉ hỏi driver).</summary>
    public static List<PrinterDetail> DetailedPrinters()
    {
        var list = new List<PrinterDetail>();
        int flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        EnumPrinters(flags, null, 2, IntPtr.Zero, 0, out int needed, out _);
        if (needed <= 0) return list;
        IntPtr buf = Marshal.AllocHGlobal(needed);
        try
        {
            if (!EnumPrinters(flags, null, 2, buf, needed, out _, out int count)) return list;
            int size = Marshal.SizeOf<PRINTER_INFO_2>();
            for (int i = 0; i < count; i++)
            {
                var info = Marshal.PtrToStructure<PRINTER_INFO_2>(IntPtr.Add(buf, i * size));
                if (string.IsNullOrEmpty(info.pPrinterName)) continue;
                string driver = info.pDriverName ?? "", port = info.pPortName ?? "";
                int maxW = 0, maxH = 0;
                var dpi = new List<int>();
                try
                {
                    int ext = DeviceCapabilitiesW(info.pPrinterName, port, DC_MAXEXTENT, IntPtr.Zero, IntPtr.Zero);
                    if (ext > 0) { maxW = (ext & 0xFFFF) / 10; maxH = ((ext >> 16) & 0xFFFF) / 10; }
                    int n = DeviceCapabilitiesW(info.pPrinterName, port, DC_ENUMRESOLUTIONS, IntPtr.Zero, IntPtr.Zero);
                    if (n > 0 && n < 64)
                    {
                        IntPtr res = Marshal.AllocHGlobal(n * 8);
                        try
                        {
                            if (DeviceCapabilitiesW(info.pPrinterName, port, DC_ENUMRESOLUTIONS, res, IntPtr.Zero) > 0)
                                for (int k = 0; k < n; k++) { int x = Marshal.ReadInt32(res, k * 8); if (x > 0 && !dpi.Contains(x)) dpi.Add(x); }
                        }
                        finally { Marshal.FreeHGlobal(res); }
                    }
                }
                catch { /* driver không trả thông tin: để trống */ }
                list.Add(new PrinterDetail(info.pPrinterName, driver, port, LooksVirtual(driver, port), maxW, maxH, dpi.ToArray()));
            }
        }
        finally { Marshal.FreeHGlobal(buf); }
        list.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.CurrentCultureIgnoreCase));
        return list;
    }

    /// <summary>JSON một máy in cho API: tên, mặc định, driver, cổng, máy in ảo, khổ giấy tối đa, DPI.</summary>
    public static string DetailJson(PrinterDetail d, bool isDefault)
    {
        return "{\"name\":" + Json(d.Name) + ",\"isDefault\":" + (isDefault ? "true" : "false") + ",\"driver\":" + Json(d.Driver) + ",\"port\":" + Json(d.Port) +
               ",\"virtual\":" + (d.IsVirtual ? "true" : "false") + ",\"maxWidthMm\":" + d.MaxWidthMm + ",\"maxHeightMm\":" + d.MaxHeightMm + ",\"dpi\":[" + string.Join(",", d.Dpi) + "]}";
    }
    public static string DefaultPrinter()
    {
        int len = 0;
        GetDefaultPrinter(null, ref len);
        if (len <= 0) return "";
        var sb = new StringBuilder(len);
        return GetDefaultPrinter(sb, ref len) ? sb.ToString() : "";
    }

    public static List<string> InstalledPrinters()
    {
        var names = new List<string>();
        int flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        EnumPrinters(flags, null, 4, IntPtr.Zero, 0, out int needed, out _);
        if (needed <= 0) return names;
        IntPtr buf = Marshal.AllocHGlobal(needed);
        try
        {
            if (!EnumPrinters(flags, null, 4, buf, needed, out _, out int count)) return names;
            int size = Marshal.SizeOf<PRINTER_INFO_4>();
            for (int i = 0; i < count; i++)
            {
                var info = Marshal.PtrToStructure<PRINTER_INFO_4>(IntPtr.Add(buf, i * size));
                if (!string.IsNullOrEmpty(info.pPrinterName)) names.Add(info.pPrinterName);
            }
        }
        finally { Marshal.FreeHGlobal(buf); }
        names.Sort(StringComparer.CurrentCultureIgnoreCase);
        return names;
    }

    public static int ListToStdout()
    {
        string def = DefaultPrinter();
        Program.Out("[" + string.Join(",", DetailedPrinters().Select(d => DetailJson(d, d.Name == def))) + "]\n");
        return 0;
    }
    /// <summary>Trả về null nếu thành công, ngược lại là thông báo lỗi tiếng Việt.</summary>
    public static string? PrintRaw(string printer, string doc, byte[] data, out int totalWritten)
    {
        totalWritten = 0;
        if (!OpenPrinter(printer, out IntPtr h, IntPtr.Zero))
            return "Không mở được máy in \"" + printer + "\" (mã " + Marshal.GetLastWin32Error() + ").";
        try
        {
            var di = new DOC_INFO_1 { pDocName = doc, pOutputFile = null, pDatatype = "RAW" };
            if (StartDocPrinter(h, 1, ref di) == 0)
            {
                int code = Marshal.GetLastWin32Error();
                return code == 1804
                    ? "Máy in \"" + printer + "\" không nhận lệnh thô (RAW). Đây có thể là máy in ảo hoặc máy in thường (không phải máy in tem), hãy chọn \"Lưu thành PDF\"."
                    : "Máy in từ chối bắt đầu tác vụ in (mã " + code + ").";
            }
            try
            {
                if (!StartPagePrinter(h)) return "Máy in từ chối bắt đầu trang (mã " + Marshal.GetLastWin32Error() + ").";
                const int chunk = 64 * 1024;
                for (int offset = 0; offset < data.Length; offset += chunk)
                {
                    int n = Math.Min(chunk, data.Length - offset);
                    byte[] part = offset == 0 && n == data.Length ? data : data.AsSpan(offset, n).ToArray();
                    if (!WritePrinter(h, part, n, out int w) || w != n)
                        return "Ghi dữ liệu ra máy in bị lỗi (mã " + Marshal.GetLastWin32Error() + ").";
                    totalWritten += w;
                }
                EndPagePrinter(h);
            }
            finally { EndDocPrinter(h); }
            return null;
        }
        finally { ClosePrinter(h); }
    }

    internal static string Json(string s)
    {
        var sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.Append('"').ToString();
    }
}
