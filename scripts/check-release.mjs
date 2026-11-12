// Kiểm tra trước khi phát hành KiotLabel bản desktop (một tệp KiotLabel.exe):
//   node scripts/check-release.mjs [--exe <KiotLabel.exe>] [--web <thư-mục-build-giao-diện>] [--strict]
// Báo lỗi (thoát mã 1) nếu: phiên bản lệch nhau giữa giao diện và desktop, bản build giao diện có tham chiếu mạng ngoài (không chạy được offline),
// cấu hình đóng gói có cờ dễ bị trình diệt virus báo nhầm, hoặc KiotLabel.exe không khớp SHA-256 / không chạy / nhúng giao diện sai phiên bản.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const UI = path.join(REPO, 'ui');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const EXE = path.resolve(opt('--exe', path.join(REPO, 'dist-desktop', 'KiotLabel.exe')));
const WEB = path.resolve(opt('--web', path.join(UI, 'dist')));

let failures = 0, warnings = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { failures++; console.log('  LỖI   ' + m); };
const warn = (m) => { warnings++; console.log('  lưu ý ' + m); };
const read = (f) => fs.readFileSync(f, 'utf8');
const mm = (v) => (String(v).match(/^(\d+)\.(\d+)/) || []).slice(1, 3).join('.');

// 1. Phiên bản: lấy từ tiêu đề của KiotLabel (giao diện), so với bản desktop
console.log('1. Phiên bản');
const title = (read(path.join(UI, 'index.html')).match(/<title>\s*KiotLabel V(\d+\.\d+)/) || [])[1];
let appVersion = '';
if (!title) bad('Không đọc được phiên bản từ ui/index.html (<title>KiotLabel Vx.y ...)');
else {
  ok('KiotLabel (giao diện) V' + title);
  const places = [
    ['launcher/AppInfo.cs', /Version = "([\d.]+)"/],
    ['launcher/KiotLabel.csproj', /<Version>([\d.]+)<\/Version>/],
    ['launcher/KiotLabel.csproj', /<FileVersion>([\d.]+)<\/FileVersion>/],
    ['launcher/app.manifest', /assemblyIdentity version="([\d.]+)"/],
    ['server/server.mjs', /const VERSION = '([\d.]+)'/],
  ];
  for (const [rel, re] of places) {
    const v = (read(path.join(REPO, rel)).match(re) || [])[1];
    if (!v) bad(`${rel}: không tìm thấy số phiên bản`);
    else if (mm(v) !== title) bad(`${rel}: ${v} lệch với giao diện V${title}`);
    else ok(`${rel}: ${v}`);
    if (rel === 'launcher/AppInfo.cs') appVersion = v || '';
  }
  const triples = places.map(([rel, re]) => (read(path.join(REPO, rel)).match(re) || [])[1]).filter(Boolean).map((v) => v.split('.').slice(0, 3).join('.'));
  if (new Set(triples).size > 1) bad('Số phiên bản x.y.z không đồng nhất giữa các tệp: ' + [...new Set(triples)].join(' / '));
}

// 2. Bản build giao diện chạy được khi không có Internet
console.log('2. Bản build giao diện chạy offline: ' + path.relative(REPO, WEB));
if (!fs.existsSync(path.join(WEB, 'index.html'))) warn('Chưa có bản build giao diện (chạy npm run build trong ui/)');
else {
  const html = read(path.join(WEB, 'index.html'));
  const ext = [...html.matchAll(/<(?:script|link|img|iframe)[^>]+(?:src|href)=["'](https?:\/\/[^"']+)/gi)].map((m) => m[1]);
  if (ext.length) bad('index.html tải tài nguyên từ mạng: ' + ext.join(', ')); else ok('index.html không tải tài nguyên ngoài');
  const FORBIDDEN = /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|cdn\.tailwindcss\.com|esm\.sh/;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  // Ngoại lệ đã xác minh: jsPDF chỉ tải pdfobject từ cdnjs khi gọi output('pdfobjectnewwindow'), KiotLabel không dùng kiểu xuất này
  const ALLOWED = /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdfobject\/[\d.]+\/pdfobject\.min\.js/g;
  const hits = walk(WEB).filter((f) => /\.(js|css|html)$/.test(f)).filter((f) => FORBIDDEN.test(read(f).replace(ALLOWED, ''))).map((f) => path.relative(WEB, f));
  if (hits.length) bad('Có tham chiếu CDN/font ngoài trong: ' + hits.join(', ')); else ok('Không có CDN hay font tải từ mạng trong JS/CSS');
  for (const need of ['fonts/Arimo-400Regular.ttf', 'fonts/Tinos-400Regular.ttf', 'fonts/Cousine-400Regular.ttf']) {
    if (fs.existsSync(path.join(WEB, need))) ok(need); else bad('Thiếu ' + need + ' (PDF vector cần font nhúng)');
  }
}

// 3. Cấu hình đóng gói: không dùng cờ làm tăng cảnh báo nhầm
console.log('3. Cấu hình KiotLabel.exe');
const csproj = read(path.join(REPO, 'launcher', 'KiotLabel.csproj')).replace(/<!--[\s\S]*?-->/g, '');
for (const flag of ['IncludeNativeLibrariesForSelfExtract', 'EnableCompressionInSingleFile']) {
  const v = (csproj.match(new RegExp(`<${flag}>(\\w+)</${flag}>`)) || [])[1];
  if (v === 'true') bad(`${flag}=true (exe tự giải nén/nén: dễ bị báo nhầm)`); else ok(`${flag} = ${v ?? '(mặc định: tắt)'}`);
}
if (/IncludeAllContentForSelfExtract/.test(csproj)) bad('Không dùng IncludeAllContentForSelfExtract'); else ok('Không tự giải nén toàn bộ nội dung');
if (/PackageReference/.test(csproj)) warn('KiotLabel.csproj có PackageReference: mỗi gói thêm vào làm tăng diện tích quét, cân nhắc kỹ'); else ok('Không có gói NuGet');
if (/<EmbeddedResource\b/.test(csproj)) ok('Giao diện nhúng bằng EmbeddedResource'); else bad('Thiếu EmbeddedResource: KiotLabel.exe sẽ không có giao diện');

// 4. Tệp KiotLabel.exe
console.log('4. Tệp phát hành: ' + path.relative(REPO, EXE));
if (!fs.existsSync(EXE)) warn('Chưa có KiotLabel.exe (chạy node scripts/build-desktop.mjs)');
else {
  const data = fs.readFileSync(EXE);
  const sha = crypto.createHash('sha256').update(data).digest('hex');
  const shaFile = EXE + '.sha256';
  if (!fs.existsSync(shaFile)) bad('Thiếu tệp ' + path.basename(shaFile));
  else if (read(shaFile).trim().split(/\s+/)[0] !== sha) bad('SHA-256 của KiotLabel.exe không khớp tệp .sha256 (một trong hai là bản cũ)');
  else ok('SHA-256 khớp: ' + sha.slice(0, 16) + '...');
  const mb = data.length / 1048576;
  if (mb > 60) warn(`KiotLabel.exe ${mb.toFixed(1)} MB (> 60 MB)`); else ok(`Dung lượng ${mb.toFixed(1)} MB`);
  // Giao diện nhúng đúng phiên bản (tài nguyên nhúng không nén nên tìm thấy tiêu đề trong tệp)
  const needle = Buffer.from(`<title>KiotLabel V${title}`, 'utf8');
  if (data.includes(needle)) ok(`Giao diện nhúng trong exe là V${title}`); else bad(`Không thấy giao diện V${title} trong KiotLabel.exe (đóng gói lại sau khi build giao diện)`);
  if (data.includes(Buffer.from('kiotlabel-desktop-token', 'utf8'))) ok('Có thành phần nhận diện bản desktop'); else bad('Thiếu mã máy chủ cục bộ trong exe');
  // Chạy thử: --version phải khớp AppInfo.cs
  try {
    const out = execFileSync(EXE, ['--version'], { encoding: 'utf8', timeout: 20000 }).trim();
    if (out === appVersion) ok('KiotLabel.exe --version = ' + out); else bad(`KiotLabel.exe --version = "${out}" nhưng AppInfo.cs là "${appVersion}"`);
  } catch (e) { bad('Không chạy được KiotLabel.exe --version: ' + String(e.message).slice(0, 120)); }
}

console.log(`\nKết quả: ${failures} lỗi, ${warnings} lưu ý`);
process.exit(failures > 0 || (argv.includes('--strict') && warnings > 0) ? 1 : 0);
