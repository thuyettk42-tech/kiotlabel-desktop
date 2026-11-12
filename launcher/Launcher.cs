using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace KiotLabel;

/// <summary>
/// Chạy KiotLabel.exe: khởi động máy chủ Node cục bộ (runtime\node.exe + server\server.mjs), mở cửa sổ ứng dụng
/// (Microsoft Edge/Chrome ở chế độ --app, hồ sơ riêng nằm cạnh tệp exe) và tắt máy chủ khi đóng cửa sổ.
/// Không cài đặt, không ghi registry, không ghi ra ngoài thư mục Data, không mở cổng ra mạng.
/// </summary>
internal static class Launcher
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);

    private static void Info(string text) => MessageBoxW(IntPtr.Zero, text, "KiotLabel", 0x40);
    private static int Error(string text) { MessageBoxW(IntPtr.Zero, text, "KiotLabel", 0x10); return 1; }

    public static int Run()
    {
        string baseDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        string node = Path.Combine(baseDir, "runtime", "node.exe");
        string server = Path.Combine(baseDir, "server", "server.mjs");
        string appDir = Path.Combine(baseDir, "app");
        string self = Environment.ProcessPath ?? Path.Combine(baseDir, "KiotLabel.exe");

        if (!File.Exists(node) || !File.Exists(server) || !File.Exists(Path.Combine(appDir, "index.html")))
            return Error("Thiếu tệp của ứng dụng (runtime\\node.exe, server\\server.mjs hoặc app\\index.html).\nHãy giải nén ĐẦY ĐỦ tệp .zip rồi chạy lại KiotLabel.exe, không chạy trực tiếp trong tệp nén.");

        using var mutex = new Mutex(true, @"Local\KiotLabelPortable", out bool createdNew);
        if (!createdNew)
        {
            Info("KiotLabel đang chạy. Hãy dùng cửa sổ KiotLabel đã mở.");
            return 0;
        }

        string dataDir = ResolveDataDir(baseDir);
        Process? nodeProc = null;
        try
        {
            nodeProc = StartNode(node, server, appDir, self, out string? url, out string? err);
            if (nodeProc == null || url == null) return Error("Không khởi động được máy chủ cục bộ.\n" + err);

            string? browser = FindBrowser();
            if (browser == null)
            {
                // Không có Edge/Chrome: mở trình duyệt mặc định, máy chủ tự tắt khi trang đóng (heartbeat)
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                nodeProc.WaitForExit();
                return 0;
            }

            var psi = new ProcessStartInfo(browser) { UseShellExecute = false };
            psi.ArgumentList.Add("--app=" + url);
            psi.ArgumentList.Add("--user-data-dir=" + Path.Combine(dataDir, "profile"));
            psi.ArgumentList.Add("--no-first-run");
            psi.ArgumentList.Add("--no-default-browser-check");
            psi.ArgumentList.Add("--disable-features=Translate");
            // Không để Chromium ép cỡ chữ tối thiểu (tem nhỏ dùng chữ 3-5 pt): cùng cách bản đóng gói WPF trước đây đã dùng
            psi.ArgumentList.Add("--minimum-font-size=1");
            psi.ArgumentList.Add("--minimum-logical-font-size=1");
            psi.ArgumentList.Add("--window-size=1440,900");
            var started = DateTime.UtcNow;
            using var win = Process.Start(psi);
            // Chờ: cửa sổ đóng HOẶC máy chủ thoát. Nếu trình duyệt thoát ngay (bàn giao cho tiến trình có sẵn), chờ máy chủ tự tắt
            // theo heartbeat (không còn trang nào gọi trong ~90 giây).
            if (win != null)
            {
                while (!nodeProc.HasExited)
                {
                    if (win.WaitForExit(1000)) break;
                }
                if (!nodeProc.HasExited && (DateTime.UtcNow - started).TotalSeconds < 5) nodeProc.WaitForExit();
            }
            return 0;
        }
        finally
        {
            try { if (nodeProc is { HasExited: false }) nodeProc.Kill(true); } catch { /* đã thoát */ }
            nodeProc?.Dispose();
        }
    }

    private static Process? StartNode(string node, string server, string appDir, string self, out string? url, out string? error)
    {
        url = null; error = null;
        var psi = new ProcessStartInfo(node)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(server)!,
        };
        psi.ArgumentList.Add(server);
        psi.ArgumentList.Add("--app-dir"); psi.ArgumentList.Add(appDir);
        psi.ArgumentList.Add("--launcher"); psi.ArgumentList.Add(self);
        psi.ArgumentList.Add("--parent-pid"); psi.ArgumentList.Add(Environment.ProcessId.ToString());
        var proc = Process.Start(psi);
        if (proc == null) { error = "Process.Start trả về rỗng."; return null; }
        proc.ErrorDataReceived += (_, _) => { };
        proc.BeginErrorReadLine();

        var line = proc.StandardOutput.ReadLineAsync();
        if (!line.Wait(TimeSpan.FromSeconds(20)) || line.Result == null)
        {
            error = "Máy chủ không phản hồi trong 20 giây.";
            try { proc.Kill(true); } catch { }
            return null;
        }
        var m = Regex.Match(line.Result, "\"url\"\\s*:\\s*\"(http://127\\.0\\.0\\.1:\\d+/)\"");
        if (!m.Success) { error = "Phản hồi không hợp lệ: " + line.Result; try { proc.Kill(true); } catch { } return null; }
        url = m.Groups[1].Value;
        // Đọc tiếp stdout để đường ống không bị đầy
        _ = Task.Run(() => { try { while (proc.StandardOutput.ReadLine() != null) { } } catch { } });
        return proc;
    }

    /// <summary>Dữ liệu (hồ sơ trình duyệt, mẫu tem đã lưu) nằm cạnh tệp exe để mang đi được; không ghi được thì dùng LocalAppData.</summary>
    private static string ResolveDataDir(string baseDir)
    {
        string portable = Path.Combine(baseDir, "Data");
        try
        {
            Directory.CreateDirectory(portable);
            string probe = Path.Combine(portable, ".w");
            File.WriteAllText(probe, "1");
            File.Delete(probe);
            return portable;
        }
        catch
        {
            string fallback = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KiotLabel");
            Directory.CreateDirectory(fallback);
            return fallback;
        }
    }

    private static string? FindBrowser()
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] candidates =
        {
            Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
        };
        foreach (var c in candidates) if (File.Exists(c)) return c;
        return null;
    }
}
