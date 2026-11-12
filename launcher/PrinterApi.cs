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
        var sb = new StringBuilder("[");
        bool first = true;
        foreach (var name in InstalledPrinters())
        {
            if (!first) sb.Append(',');
            first = false;
            sb.Append("{\"name\":").Append(Json(name)).Append(",\"isDefault\":").Append(name == def ? "true" : "false").Append('}');
        }
        sb.Append("]\n");
        Program.Out(sb.ToString());
        return 0;
    }

    public static int PrintRawCli(string[] args)
    {
        string? printer = Arg(args, "--printer");
        string? file = Arg(args, "--file");
        string doc = Arg(args, "--doc") ?? "KiotLabel";
        if (string.IsNullOrEmpty(printer) || string.IsNullOrEmpty(file))
            return Fail("Thiếu tham số --printer hoặc --file.");
        byte[] data;
        try { data = File.ReadAllBytes(file); }
        catch (Exception e) { return Fail("Không đọc được dữ liệu in: " + e.Message); }
        if (data.Length == 0) return Fail("Không có dữ liệu để in.");

        string? error = PrintRaw(printer, doc, data, out int written);
        if (error != null) return Fail(error);
        Program.Out("{\"ok\":true,\"bytes\":" + written + "}\n");
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

    private static int Fail(string message)
    {
        Program.Out("{\"ok\":false,\"error\":" + Json(message) + "}\n");
        return 1;
    }

    private static string? Arg(string[] args, string name)
    {
        int i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
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
