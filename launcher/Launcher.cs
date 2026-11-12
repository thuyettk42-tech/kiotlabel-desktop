using System.Diagnostics;
using System.Runtime.InteropServices;

namespace KiotLabel;

/// <summary>
/// Chạy KiotLabel.exe (một tệp duy nhất): khởi động máy chủ cục bộ nằm trong chính tiến trình này (giao diện nhúng sẵn trong tệp exe),
/// mở cửa sổ ứng dụng (Microsoft Edge/Chrome ở chế độ --app, hồ sơ riêng) và tắt khi đóng cửa sổ.
/// Không cài đặt, không giải nén ra đâu cả, không ghi registry, không mở cổng ra mạng.
/// </summary>
internal static class Launcher
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);

    private static void Info(string text) => MessageBoxW(IntPtr.Zero, text, "KiotLabel", 0x40);
    private static int Error(string text) { MessageBoxW(IntPtr.Zero, text, "KiotLabel", 0x10); return 1; }

    public static int Run(bool serverOnly)
    {
        string self = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "KiotLabel.exe");
        string baseDir = Path.GetDirectoryName(self) ?? AppContext.BaseDirectory;

        // Một bản chạy duy nhất (không áp dụng cho chế độ kiểm thử --server-only)
        using var mutex = serverOnly ? null : new Mutex(true, @"Local\KiotLabelPortable", out _);
        if (mutex != null && !mutex.WaitOne(0))
        {
            Info("KiotLabel đang chạy. Hãy dùng cửa sổ KiotLabel đã mở.");
            return 0;
        }

        using var server = new LocalServer();
        if (server.ResourceCount == 0)
            return Error("Tệp KiotLabel.exe bị thiếu phần giao diện (không có dữ liệu nhúng). Hãy tải lại bản phát hành chính thức.");
        try { server.Start(); }
        catch (Exception e) { return Error("Không khởi động được máy chủ cục bộ.\n" + e.Message); }

        if (serverOnly)
        {
            Program.Out("{\"ready\":true,\"port\":" + server.Port + ",\"url\":" + PrinterApi.Json(server.Url) + ",\"version\":" + PrinterApi.Json(AppInfo.Version) + "}\n");
            server.Idle.Wait();
            return 0;
        }

        string dataDir = ResolveDataDir(baseDir);
        string? browser = FindBrowser();
        if (browser == null)
        {
            // Không có Edge/Chrome: mở trình duyệt mặc định, tự tắt khi trang đóng (heartbeat)
            Process.Start(new ProcessStartInfo(server.Url) { UseShellExecute = true });
            server.Idle.Wait();
            return 0;
        }

        var psi = new ProcessStartInfo(browser) { UseShellExecute = false };
        psi.ArgumentList.Add("--app=" + server.Url);
        psi.ArgumentList.Add("--user-data-dir=" + Path.Combine(dataDir, "profile"));
        psi.ArgumentList.Add("--no-first-run");
        psi.ArgumentList.Add("--no-default-browser-check");
        psi.ArgumentList.Add("--disable-features=Translate");
        // Không để Chromium ép cỡ chữ tối thiểu (tem nhỏ dùng chữ 3-5 pt)
        psi.ArgumentList.Add("--minimum-font-size=1");
        psi.ArgumentList.Add("--minimum-logical-font-size=1");
        psi.ArgumentList.Add("--window-size=1440,900");
        var started = DateTime.UtcNow;
        using var win = Process.Start(psi);
        // Chờ: cửa sổ đóng HOẶC không còn trang nào kết nối (heartbeat). Nếu trình duyệt thoát ngay (bàn giao cho tiến trình có sẵn),
        // chờ máy chủ tự xác định đã đóng.
        if (win != null)
        {
            while (!server.Idle.IsSet)
            {
                if (win.WaitForExit(1000)) break;
            }
            if (!server.Idle.IsSet && (DateTime.UtcNow - started).TotalSeconds < 5) server.Idle.Wait();
        }
        return 0;
    }

    /// <summary>
    /// Dữ liệu (hồ sơ trình duyệt, mẫu tem đã lưu): chế độ portable nếu có thư mục "Data" hoặc tệp "portable.txt" cạnh KiotLabel.exe
    /// (mang cả thư mục đi được); mặc định để ở %LOCALAPPDATA%\KiotLabel để không rải dữ liệu vào thư mục Downloads.
    /// </summary>
    private static string ResolveDataDir(string baseDir)
    {
        string portable = Path.Combine(baseDir, "Data");
        bool wantPortable = Directory.Exists(portable) || File.Exists(Path.Combine(baseDir, "portable.txt"));
        if (wantPortable)
        {
            try
            {
                Directory.CreateDirectory(portable);
                string probe = Path.Combine(portable, ".w");
                File.WriteAllText(probe, "1");
                File.Delete(probe);
                return portable;
            }
            catch { /* không ghi được cạnh exe: dùng LocalAppData */ }
        }
        string local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KiotLabel");
        Directory.CreateDirectory(local);
        return local;
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
