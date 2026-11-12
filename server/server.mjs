// Máy chủ cục bộ của KiotLabel bản desktop (portable). Không có phụ thuộc ngoài (chỉ module có sẵn của Node).
//  - Chỉ nghe ở 127.0.0.1 (cổng ngẫu nhiên), chỉ nhận Host là 127.0.0.1:<cổng>, mọi API cần mã xác thực ngẫu nhiên mỗi lần chạy
//    (mã được chèn vào trang HTML do chính máy chủ này phục vụ, trang web khác không đọc được).
//  - Phục vụ bản build tĩnh của KiotLabel và API máy in: liệt kê máy in, gửi lệnh ZPL/TSPL thẳng ra máy in.
//  - Windows: dùng KiotLabel.exe (--list-printers / --print-raw, spooler RAW). macOS/Linux: CUPS (lpstat / lp -o raw).
// Cách chạy: node server.mjs [--app-dir <thư-mục>] [--launcher <KiotLabel.exe>] [--open] [--port <n>] [--parent-pid <pid>]

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def; };
const flag = (name) => argv.includes(name);

const APP_DIR = path.resolve(opt('--app-dir', path.join(HERE, '..', 'app')));
const LAUNCHER = opt('--launcher', '');
const PORT = Number(opt('--port', '0')) || 0;
const PARENT_PID = Number(opt('--parent-pid', '0')) || 0;
const VERSION = '3.5.2';
const TOKEN = crypto.randomBytes(24).toString('hex');
const MAX_PRINT_BYTES = 64 * 1024 * 1024;
const IDLE_MS = 90_000; // không còn trang nào gửi "heartbeat" quá lâu thì tự thoát (tránh sót tiến trình)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json'
};

// ---------------------------------------------------------------------------
// Máy in
// ---------------------------------------------------------------------------
function run(cmd, args, { input, timeout = 15000 } = {}) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: stdout || '', stderr: stderr || (err && err.message) || '' });
    });
    if (input !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(input); }
  });
}

let printerCache = { at: 0, list: [] };
async function listPrinters(force = false) {
  if (!force && Date.now() - printerCache.at < 8000) return printerCache.list;
  let list = [];
  if (process.platform === 'win32') {
    if (LAUNCHER && fs.existsSync(LAUNCHER)) {
      const r = await run(LAUNCHER, ['--list-printers']);
      try { list = JSON.parse(r.stdout || '[]'); } catch { list = []; }
    }
  } else {
    const names = (await run('lpstat', ['-e'])).stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const def = ((await run('lpstat', ['-d'])).stdout.match(/:\s*(\S+)\s*$/m) || [])[1] || '';
    list = names.map((name) => ({ name, isDefault: name === def }));
  }
  list = list.filter((p) => p && typeof p.name === 'string' && p.name.length > 0 && p.name.length < 260);
  printerCache = { at: Date.now(), list };
  return list;
}

async function printRaw(printerName, bytes, docName) {
  const printers = await listPrinters(true);
  if (!printers.some((p) => p.name === printerName)) return { ok: false, status: 404, error: 'Không thấy máy in "' + printerName + '". Bấm làm mới danh sách máy in.' };
  const safeDoc = String(docName || 'KiotLabel').replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 80) || 'KiotLabel';
  if (process.platform === 'win32') {
    if (!LAUNCHER || !fs.existsSync(LAUNCHER)) return { ok: false, status: 500, error: 'Thiếu KiotLabel.exe để gửi lệnh ra máy in.' };
    const tmp = path.join(os.tmpdir(), 'kiotlabel-' + crypto.randomBytes(8).toString('hex') + '.prn');
    fs.writeFileSync(tmp, bytes, { mode: 0o600 });
    try {
      const r = await run(LAUNCHER, ['--print-raw', '--printer', printerName, '--file', tmp, '--doc', safeDoc], { timeout: 120000 });
      let info = {}; try { info = JSON.parse(r.stdout || '{}'); } catch { /* bỏ qua */ }
      if (r.code === 0 && info.ok) return { ok: true, bytes: info.bytes ?? bytes.length };
      return { ok: false, status: 502, error: info.error || r.stderr || 'Máy in từ chối lệnh (mã ' + r.code + ').' };
    } finally { fs.rm(tmp, { force: true }, () => {}); }
  }
  const r = await run('lp', ['-d', printerName, '-o', 'raw', '-t', safeDoc], { input: bytes, timeout: 120000 });
  return r.code === 0 ? { ok: true, bytes: bytes.length } : { ok: false, status: 502, error: r.stderr.trim() || 'lp lỗi (mã ' + r.code + ')' };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const STARTED = Date.now();
let lastBeat = Date.now();
let everBeat = false;
let server;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too-large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(APP_DIR, '.' + path.posix.normalize('/' + rel));
  if (!file.startsWith(APP_DIR + path.sep) && file !== APP_DIR) { res.writeHead(403); return res.end(); }
  let target = file;
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) target = path.join(APP_DIR, 'index.html');
  const ext = path.extname(target).toLowerCase();
  if (path.basename(target) === 'index.html') {
    // Chèn mã xác thực vào trang để giao diện gọi API máy in; không bao giờ ghi mã ra tệp hay URL
    const html = fs.readFileSync(target, 'utf8').replace('</head>', `<meta name="kiotlabel-desktop-token" content="${TOKEN}"><meta name="kiotlabel-desktop-version" content="${VERSION}"></head>`);
    res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    return res.end(html);
  }
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(target).pipe(res);
}

async function handle(req, res) {
  const addr = server.address();
  const host = String(req.headers.host || '');
  // Chống DNS rebinding: chỉ nhận đúng Host của máy chủ này
  if (host !== `127.0.0.1:${addr.port}` && host !== `localhost:${addr.port}`) { res.writeHead(421); return res.end('Misdirected'); }
  const url = new URL(req.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/desktop/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url.pathname);
  }
  if (req.headers['x-kiotlabel-token'] !== TOKEN) return sendJson(res, 401, { ok: false, error: 'Sai mã xác thực.' });
  const route = url.pathname.slice('/api/desktop/'.length);
  try {
    if (route === 'info' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, version: VERSION, platform: process.platform, arch: process.arch, node: process.version, rawPrint: process.platform !== 'win32' || !!LAUNCHER });
    }
    if (route === 'heartbeat' && req.method === 'POST') { lastBeat = Date.now(); everBeat = true; return sendJson(res, 200, { ok: true }); }
    if (route === 'printers' && req.method === 'GET') {
      const list = await listPrinters(url.searchParams.get('refresh') === '1');
      return sendJson(res, 200, { ok: true, printers: list });
    }
    if (route === 'print-raw' && req.method === 'POST') {
      const printer = url.searchParams.get('printer') || '';
      let bytes;
      try { bytes = await readBody(req, MAX_PRINT_BYTES); } catch { return sendJson(res, 413, { ok: false, error: 'Dữ liệu in quá lớn.' }); }
      if (bytes.length === 0) return sendJson(res, 400, { ok: false, error: 'Không có dữ liệu để in.' });
      const r = await printRaw(printer, bytes, url.searchParams.get('doc'));
      return sendJson(res, r.ok ? 200 : r.status || 500, r);
    }
    return sendJson(res, 404, { ok: false, error: 'Không có API này.' });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: String(e && e.message || e) });
  }
}

server = http.createServer((req, res) => { handle(req, res); });
server.on('clientError', (_e, socket) => socket.destroy());
server.listen(PORT, '127.0.0.1', () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/`;
  // Dòng đầu tiên trên stdout cho KiotLabel.exe đọc
  process.stdout.write(JSON.stringify({ ready: true, port, url, version: VERSION }) + '\n');
  if (flag('--open')) openInBrowser(url);
});

function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch { /* người dùng tự mở URL */ }
}

// Tự thoát khi tiến trình cha (KiotLabel.exe) đã tắt hoặc không còn trang nào gọi heartbeat
setInterval(() => {
  if (PARENT_PID) { try { process.kill(PARENT_PID, 0); } catch { process.exit(0); } }
  if (everBeat && Date.now() - lastBeat > IDLE_MS) process.exit(0);
  // Chạy tay (không có tiến trình cha) mà chưa có trang nào kết nối sau 10 phút thì tự thoát
  if (!everBeat && !PARENT_PID && Date.now() - STARTED > 10 * 60_000) process.exit(0);
}, 3000).unref();
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
