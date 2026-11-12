using System.Text;

namespace KiotLabel;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // Chế độ dòng lệnh (do máy chủ Node gọi): in JSON ra stdout, không hiện cửa sổ
        if (args.Length > 0)
        {
            switch (args[0])
            {
                case "--list-printers":
                    return PrinterApi.ListToStdout();
                case "--print-raw":
                    return PrinterApi.PrintRawCli(args);
                case "--version":
                    Out("3.5.1\n");
                    return 0;
            }
        }
        return Launcher.Run();
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
