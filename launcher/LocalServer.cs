using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace KiotLabel;

/// <summary>
/// Máy chủ cục bộ nằm ngay trong KiotLabel.exe: phục vụ giao diện (nhúng sẵn trong tệp exe) và API máy in.
/// - Chỉ nghe ở 127.0.0.1 (cổng ngẫu nhiên). Mọi /api/desktop/* cần mã xác thực ngẫu nhiên mỗi lần chạy, mã chỉ có trong HTML do máy chủ này phục vụ.
/// - Chỉ nhận Host đúng 127.0.0.1:cổng hoặc localhost:cổng (chống DNS rebinding).
/// - Tệp tĩnh chỉ lấy từ danh sách tài nguyên nhúng (không đọc đĩa), nên không thể thoát khỏi thư mục.
/// - Không có phụ thuộc ngoài: tự phân tích HTTP/1.1 tối giản (Connection: close).
/// </summary>
internal sealed class LocalServer : IDisposable
{
    private const int MaxHeaderBytes = 32 * 1024;
    private const int MaxBodyBytes = 64 * 1024 * 1024;
    private static readonly TimeSpan IdleAfterLastBeat = TimeSpan.FromSeconds(90);
    private static readonly TimeSpan NeverConnectedAfter = TimeSpan.FromMinutes(10);

    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly string _token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
    private readonly Dictionary<string, string> _resources = new(StringComparer.Ordinal); // "/assets/x.js" -> tên tài nguyên nhúng
    private readonly Assembly _asm = typeof(LocalServer).Assembly;
    private readonly DateTime _started = DateTime.UtcNow;
    private readonly CancellationTokenSource _cts = new();
    private long _lastBeatTicks;
    private volatile bool _everBeat;

    public int Port { get; private set; }
    public string Url => $"http://127.0.0.1:{Port}/";
    /// <summary>Được đặt khi không còn trang nào kết nối (đóng cửa sổ) hoặc chưa ai kết nối sau 10 phút.</summary>
    public ManualResetEventSlim Idle { get; } = new(false);

    public LocalServer()
    {
        foreach (string name in _asm.GetManifestResourceNames())
        {
            if (!name.StartsWith("app/", StringComparison.Ordinal)) continue;
            _resources["/" + name.Substring(4).Replace('\\', '/')] = name;
        }
    }

    public int ResourceCount => _resources.Count;

    public void Start()
    {
        _listener.Start();
        Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
        Interlocked.Exchange(ref _lastBeatTicks, DateTime.UtcNow.Ticks);
        _ = Task.Run(AcceptLoop);
        _ = Task.Run(IdleWatch);
    }

    private async Task AcceptLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            TcpClient client;
            try { client = await _listener.AcceptTcpClientAsync(_cts.Token); }
            catch { break; }
            _ = Task.Run(() => HandleClient(client));
        }
    }

    private async Task IdleWatch()
    {
        while (!_cts.IsCancellationRequested)
        {
            try { await Task.Delay(3000, _cts.Token); } catch { break; }
            var last = new DateTime(Interlocked.Read(ref _lastBeatTicks), DateTimeKind.Utc);
            if (_everBeat && DateTime.UtcNow - last > IdleAfterLastBeat) Idle.Set();
            else if (!_everBeat && DateTime.UtcNow - _started > NeverConnectedAfter) Idle.Set();
        }
    }

    // ------------------------------------------------------------------------------------------------------------------
    // HTTP tối giản
    // ------------------------------------------------------------------------------------------------------------------
    private sealed class Req
    {
        public string Method = "";
        public string Target = "";
        public Dictionary<string, string> Headers = new(StringComparer.OrdinalIgnoreCase);
        public byte[] Body = Array.Empty<byte>();
    }

    private async Task HandleClient(TcpClient client)
    {
        using (client)
        {
            client.NoDelay = true;
            client.ReceiveTimeout = 20000;
            client.SendTimeout = 60000;
            try
            {
                using var stream = client.GetStream();
                using var readCts = new CancellationTokenSource(TimeSpan.FromSeconds(120));
                Req? req = await ReadRequest(stream, readCts.Token);
                if (req == null) return;
                await Route(stream, req);
            }
            catch
            {
                // Kết nối đứt giữa chừng: bỏ qua
            }
        }
    }

    private static async Task<Req?> ReadRequest(NetworkStream s, CancellationToken ct)
    {
        var buf = new byte[MaxHeaderBytes];
        int len = 0, headEnd = -1;
        while (headEnd < 0)
        {
            if (len >= buf.Length) { await Respond(s, 431, "Request Header Fields Too Large", "text/plain", Array.Empty<byte>()); return null; }
            int n = await s.ReadAsync(buf.AsMemory(len, buf.Length - len), ct);
            if (n <= 0) return null;
            len += n;
            headEnd = IndexOfHeaderEnd(buf, len);
        }
        string head = Encoding.Latin1.GetString(buf, 0, headEnd);
        string[] lines = head.Split("\r\n");
        string[] first = lines[0].Split(' ');
        if (first.Length < 3 || !first[2].StartsWith("HTTP/1.", StringComparison.Ordinal)) { await Respond(s, 400, "Bad Request", "text/plain", Array.Empty<byte>()); return null; }
        var req = new Req { Method = first[0], Target = first[1] };
        for (int i = 1; i < lines.Length; i++)
        {
            int c = lines[i].IndexOf(':');
            if (c > 0) req.Headers[lines[i].Substring(0, c).Trim()] = lines[i].Substring(c + 1).Trim();
        }
        if (req.Headers.ContainsKey("Transfer-Encoding")) { await Respond(s, 411, "Length Required", "text/plain", Array.Empty<byte>()); return null; }
        long contentLength = 0;
        if (req.Headers.TryGetValue("Content-Length", out string? cl) && !long.TryParse(cl, out contentLength)) { await Respond(s, 400, "Bad Request", "text/plain", Array.Empty<byte>()); return null; }
        if (contentLength < 0 || contentLength > MaxBodyBytes)
        {
            await Respond(s, 413, "Payload Too Large", "application/json; charset=utf-8", Json(false, "Dữ liệu in quá lớn."));
            return null;
        }
        if (contentLength > 0)
        {
            var body = new byte[contentLength];
            int have = Math.Min(len - (headEnd + 4), (int)contentLength);
            if (have > 0) Buffer.BlockCopy(buf, headEnd + 4, body, 0, have);
            while (have < contentLength)
            {
                int n = await s.ReadAsync(body.AsMemory(have, (int)contentLength - have), ct);
                if (n <= 0) return null;
                have += n;
            }
            req.Body = body;
        }
        return req;
    }

    private static int IndexOfHeaderEnd(byte[] b, int len)
    {
        for (int i = 3; i < len; i++)
            if (b[i - 3] == '\r' && b[i - 2] == '\n' && b[i - 1] == '\r' && b[i] == '\n') return i - 3;
        return -1;
    }

    private static async Task Respond(NetworkStream s, int status, string reason, string contentType, byte[] body, bool head = false, string cache = "no-store")
    {
        var sb = new StringBuilder();
        sb.Append("HTTP/1.1 ").Append(status).Append(' ').Append(reason).Append("\r\n");
        sb.Append("Content-Type: ").Append(contentType).Append("\r\n");
        sb.Append("Content-Length: ").Append(body.Length).Append("\r\n");
        sb.Append("Cache-Control: ").Append(cache).Append("\r\n");
        sb.Append("X-Content-Type-Options: nosniff\r\n");
        sb.Append("Connection: close\r\n\r\n");
        byte[] headBytes = Encoding.Latin1.GetBytes(sb.ToString());
        await s.WriteAsync(headBytes);
        if (!head && body.Length > 0) await s.WriteAsync(body);
        await s.FlushAsync();
    }

    private static byte[] Json(bool ok, string? error = null, string? extra = null)
    {
        var sb = new StringBuilder("{\"ok\":").Append(ok ? "true" : "false");
        if (error != null) sb.Append(",\"error\":").Append(PrinterApi.Json(error));
        if (extra != null) sb.Append(',').Append(extra);
        return Encoding.UTF8.GetBytes(sb.Append('}').ToString());
    }

    // ------------------------------------------------------------------------------------------------------------------
    // Định tuyến
    // ------------------------------------------------------------------------------------------------------------------
    private async Task Route(NetworkStream s, Req req)
    {
        string host = req.Headers.GetValueOrDefault("Host", "");
        if (host != $"127.0.0.1:{Port}" && host != $"localhost:{Port}")
        {
            await Respond(s, 421, "Misdirected Request", "text/plain", Array.Empty<byte>());
            return;
        }

        string path = req.Target;
        int q = path.IndexOfAny(new[] { '?', '#' });
        string query = q >= 0 && path[q] == '?' ? path.Substring(q + 1) : "";
        if (q >= 0) path = path.Substring(0, q);

        if (path.StartsWith("/api/desktop/", StringComparison.Ordinal))
        {
            await Api(s, req, path.Substring("/api/desktop/".Length), query);
            return;
        }
        if (req.Method != "GET" && req.Method != "HEAD")
        {
            await Respond(s, 405, "Method Not Allowed", "text/plain", Array.Empty<byte>());
            return;
        }
        await Static(s, req, path);
    }

    private async Task Static(NetworkStream s, Req req, string rawPath)
    {
        string path;
        try { path = Uri.UnescapeDataString(rawPath); } catch { await Respond(s, 400, "Bad Request", "text/plain", Array.Empty<byte>()); return; }
        if (path.Contains('\\') || path.Contains('\0')) { await Respond(s, 400, "Bad Request", "text/plain", Array.Empty<byte>()); return; }
        if (path.EndsWith('/')) path += "index.html";
        bool head = req.Method == "HEAD";

        if (!_resources.TryGetValue(path, out string? resource))
        {
            // Giao diện một trang: đường dẫn lạ trả về index.html (như bản web)
            if (!_resources.TryGetValue("/index.html", out resource)) { await Respond(s, 404, "Not Found", "text/plain", Array.Empty<byte>(), head); return; }
            path = "/index.html";
        }

        using Stream? rs = _asm.GetManifestResourceStream(resource);
        if (rs == null) { await Respond(s, 404, "Not Found", "text/plain", Array.Empty<byte>(), head); return; }
        byte[] data;
        using (var ms = new MemoryStream()) { rs.CopyTo(ms); data = ms.ToArray(); }

        if (path == "/index.html")
        {
            // Chèn mã xác thực để giao diện nhận ra bản desktop và gọi API máy in; không bao giờ ghi mã ra tệp hay URL
            string html = Encoding.UTF8.GetString(data).Replace("</head>",
                $"<meta name=\"kiotlabel-desktop-token\" content=\"{_token}\"><meta name=\"kiotlabel-desktop-version\" content=\"{AppInfo.Version}\"></head>");
            await Respond(s, 200, "OK", "text/html; charset=utf-8", Encoding.UTF8.GetBytes(html), head);
            return;
        }
        await Respond(s, 200, "OK", MimeOf(path), data, head, "no-cache");
    }

    private static string MimeOf(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" or ".mjs" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".json" => "application/json; charset=utf-8",
        ".svg" => "image/svg+xml",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".ico" => "image/x-icon",
        ".ttf" => "font/ttf",
        ".woff2" => "font/woff2",
        ".txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    };

    // ------------------------------------------------------------------------------------------------------------------
    // API máy in
    // ------------------------------------------------------------------------------------------------------------------
    private bool TokenOk(Req req)
    {
        if (!req.Headers.TryGetValue("X-Kiotlabel-Token", out string? given)) return false;
        byte[] a = Encoding.UTF8.GetBytes(given), b = Encoding.UTF8.GetBytes(_token);
        return CryptographicOperations.FixedTimeEquals(a, b);
    }

    private async Task Api(NetworkStream s, Req req, string route, string query)
    {
        const string Json8 = "application/json; charset=utf-8";
        if (!TokenOk(req)) { await Respond(s, 401, "Unauthorized", Json8, Json(false, "Sai mã xác thực.")); return; }

        if (route == "info" && req.Method == "GET")
        {
            await Respond(s, 200, "OK", Json8, Json(true, null, $"\"version\":{PrinterApi.Json(AppInfo.Version)},\"platform\":\"win32\",\"arch\":\"x64\",\"rawPrint\":true"));
            return;
        }
        if (route == "heartbeat" && req.Method == "POST")
        {
            Interlocked.Exchange(ref _lastBeatTicks, DateTime.UtcNow.Ticks);
            _everBeat = true;
            await Respond(s, 200, "OK", Json8, Json(true));
            return;
        }
        if (route == "printers" && req.Method == "GET")
        {
            string def = PrinterApi.DefaultPrinter();
            var sb = new StringBuilder("\"printers\":[");
            bool firstItem = true;
            foreach (string name in PrinterApi.InstalledPrinters())
            {
                if (!firstItem) sb.Append(',');
                firstItem = false;
                sb.Append("{\"name\":").Append(PrinterApi.Json(name)).Append(",\"isDefault\":").Append(name == def ? "true" : "false").Append('}');
            }
            sb.Append(']');
            await Respond(s, 200, "OK", Json8, Json(true, null, sb.ToString()));
            return;
        }
        if (route == "print-raw" && req.Method == "POST")
        {
            string printer = QueryValue(query, "printer");
            string doc = Regex.Replace(QueryValue(query, "doc"), @"[^\p{L}\p{N} ._()\-]", "");
            if (doc.Length > 80) doc = doc.Substring(0, 80);
            if (doc.Length == 0) doc = "KiotLabel";
            if (req.Body.Length == 0) { await Respond(s, 400, "Bad Request", Json8, Json(false, "Không có dữ liệu để in.")); return; }
            // Tên máy in phải nằm trong danh sách máy in thật của Windows
            if (!PrinterApi.InstalledPrinters().Contains(printer, StringComparer.Ordinal))
            {
                await Respond(s, 404, "Not Found", Json8, Json(false, "Không thấy máy in \"" + printer + "\". Bấm làm mới danh sách máy in."));
                return;
            }
            string? error = PrinterApi.PrintRaw(printer, doc, req.Body, out int written);
            if (error != null) await Respond(s, 502, "Bad Gateway", Json8, Json(false, error));
            else await Respond(s, 200, "OK", Json8, Json(true, null, "\"bytes\":" + written));
            return;
        }
        await Respond(s, 404, "Not Found", Json8, Json(false, "Không có API này."));
    }

    private static string QueryValue(string query, string key)
    {
        foreach (string pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            int eq = pair.IndexOf('=');
            string k = eq >= 0 ? pair.Substring(0, eq) : pair;
            if (k != key) continue;
            string v = eq >= 0 ? pair.Substring(eq + 1) : "";
            try { return Uri.UnescapeDataString(v.Replace('+', ' ')); } catch { return ""; }
        }
        return "";
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _listener.Stop(); } catch { }
        Idle.Dispose();
        _cts.Dispose();
    }
}
