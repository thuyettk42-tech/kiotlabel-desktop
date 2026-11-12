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
                case "--server-only":
                    // Chỉ chạy máy chủ cục bộ, không mở cửa sổ: dùng để kiểm thử API và trong CI
                    return Launcher.Run(serverOnly: true);
            }
        }
        return Launcher.Run(serverOnly: false);
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
