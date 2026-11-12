using System.Text;

namespace KiotLabel;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // Chế độ dòng lệnh để chẩn đoán/kiểm thử (in JSON ra stdout, không hiện cửa sổ)
        if (args.Length > 0)
        {
            switch (args[0])
            {
                case "--version":
                    Out(AppInfo.Version + "\n");
                    return 0;
                case "--list-printers":
                    return PrinterApi.ListToStdout();
                case "--print-sheet-test":
                    // Chẩn đoán/kiểm thử: --print-sheet-test <máy in> <tệp-lệnh.json> <tệp-ra> (ví dụ in vào "Microsoft Print to PDF" mà không hiện hộp thoại)
                    return PrintSheetTest(args);
                case "--server-only":
                    // Chỉ chạy máy chủ cục bộ, không mở cửa sổ: dùng để kiểm thử API và trong CI
                    return Launcher.Run(serverOnly: true);
            }
        }
        return Launcher.Run(serverOnly: false);
    }


    private static int PrintSheetTest(string[] args)
    {
        if (args.Length < 4) { Out("{\"ok\":false,\"error\":\"Cần: --print-sheet-test <máy in> <tệp-lệnh.json> <tệp-ra>\"}\n"); return 2; }
        var r = GdiPrinter.Print(args[1], "KiotLabel kiểm thử", File.ReadAllBytes(args[2]), args[3]);
        var warn = string.Join(",", r.Warnings.Select(PrinterApi.Json));
        Out("{\"ok\":" + (r.Error == null ? "true" : "false") + ",\"pages\":" + r.Pages + ",\"warnings\":[" + warn + "]" + (r.Error != null ? ",\"error\":" + PrinterApi.Json(r.Error) : "") + "}\n");
        return r.Error == null ? 0 : 1;
    }
    // Ứng dụng GUI không có console: ghi thẳng vào handle stdout (đường ống do tiến trình cha cấp)
    internal static void Out(string text)
    {
        using var s = Console.OpenStandardOutput();
        var b = new UTF8Encoding(false).GetBytes(text);
        s.Write(b, 0, b.Length);
        s.Flush();
    }
}
