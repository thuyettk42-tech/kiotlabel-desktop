// Kiểm tra trước khi phát hành KiotLabel bản desktop portable:
//   node scripts/check-release.mjs [--zip <đường-dẫn.zip>] [--web <thư-mục-build>] [--strict]
// Báo lỗi (thoát mã 1) nếu: phiên bản lệch nhau giữa web và desktop, bản build web có tham chiếu mạng ngoài (không chạy được offline),
// cấu hình đóng gói có cờ dễ bị trình diệt virus báo nhầm, hoặc tệp zip không khớp mã SHA-256 / thiếu tệp / là bản cũ.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const DESKTOP = REPO;
const KL = path.join(REPO, 'ui');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ZIP = path.resolve(opt('--zip', path.join(REPO, 'dist-desktop', 'KiotLabel-portable-win-x64.zip')));
const WEB = path.resolve(opt('--web', path.join(KL, 'dist')));

const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'); // bsdtar (đọc được zip)
let failures = 0, warnings = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { failures++; console.log('  LỖI   ' + m); };
const warn = (m) => { warnings++; console.log('  lưu ý ' + m); };
const read = (f) => fs.readFileSync(f, 'utf8');
const mm = (v) => (String(v).match(/^(\d+)\.(\d+)/) || []).slice(1, 3).join('.');

// 1. Phiên bản: lấy từ tiêu đề của KiotLabel, so với bản desktop
console.log('1. Phiên bản');
const title = (read(path.join(KL, 'index.html')).match(/<title>\s*KiotLabel V(\d+\.\d+)/) || [])[1];
if (!title) bad('Không đọc được phiên bản từ ui/index.html (<title>KiotLabel Vx.y ...)');
else {
  ok('KiotLabel (giao diện) V' + title);
  const places = [
    ['server/server.mjs', /const VERSION = '([\d.]+)'/],
    ['launcher/KiotLabel.csproj', /<Version>([\d.]+)<\/Version>/],
    ['launcher/KiotLabel.csproj', /<FileVersion>([\d.]+)<\/FileVersion>/],
    ['launcher/app.manifest', /assemblyIdentity version="([\d.]+)"/],
    ['launcher/Program.cs', /Out\("([\d.]+)\\n"\)/],
  ];
  for (const [rel, re] of places) {
    const v = (read(path.join(REPO, rel)).match(re) || [])[1];
    if (!v) bad(`${rel}: không tìm thấy số phiên bản`);
    else if (mm(v) !== title) bad(`${rel}: ${v} lệch với giao diện V${title}`);
    else ok(`${rel}: ${v}`);
  }
  const labels = ['src/App.tsx', 'index.html', 'src/components/views/KiotLabelView.tsx'];
  void labels;
}

// 2. Bản build giao diện phải chạy được khi không có Internet
console.log('2. Bản build giao diện chạy offline: ' + path.relative(REPO, WEB));
if (!fs.existsSync(path.join(WEB, 'index.html'))) warn('Chưa có bản build web ở đây (chạy npm run build trong ui/)');
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
for (const [flag, want] of [['IncludeNativeLibrariesForSelfExtract', 'false'], ['EnableCompressionInSingleFile', 'false']]) {
  const v = (csproj.match(new RegExp(`<${flag}>(\\w+)</${flag}>`)) || [])[1];
  if (v === 'true') bad(`${flag}=true (exe tự giải nén/nén: dễ bị báo nhầm)`); else ok(`${flag} = ${v ?? '(mặc định: tắt)'}`);
}
if (/IncludeAllContentForSelfExtract/.test(csproj)) bad('Không dùng IncludeAllContentForSelfExtract'); else ok('Không tự giải nén toàn bộ nội dung');
if (/PackageReference/.test(csproj)) warn('KiotLabel.csproj có PackageReference: mỗi gói thêm vào làm tăng diện tích quét, cân nhắc kỹ');
else ok('Không có gói NuGet');

// 4. Gói zip
console.log('4. Gói phát hành: ' + path.relative(REPO, ZIP));
if (!fs.existsSync(ZIP)) warn('Chưa có tệp zip (chạy node scripts/build-desktop.mjs)');
else {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(ZIP)).digest('hex');
  const shaFile = ZIP + '.sha256';
  if (!fs.existsSync(shaFile)) bad('Thiếu tệp ' + path.basename(shaFile));
  else if (read(shaFile).trim().split(/\s+/)[0] !== sha) bad('SHA-256 của zip không khớp tệp .sha256 (zip hoặc .sha256 là bản cũ)');
  else ok('SHA-256 khớp: ' + sha.slice(0, 16) + '...');
  const list = execFileSync(TAR, ['-tf', ZIP], { encoding: 'utf8' }).split(/\r?\n/);
  for (const need of ['KiotLabel/KiotLabel.exe', 'KiotLabel/runtime/node.exe', 'KiotLabel/server/server.mjs', 'KiotLabel/app/index.html', 'KiotLabel/SHA256SUMS.txt', 'KiotLabel/HUONG-DAN.txt']) {
    if (list.includes(need)) ok(need); else bad('Thiếu trong zip: ' + need);
  }
  const zipHtml = execFileSync(TAR, ['-xOf', ZIP, 'KiotLabel/app/index.html'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const zipVer = (zipHtml.match(/<title>\s*KiotLabel V(\d+\.\d+)/) || [])[1];
  if (zipVer !== title) bad(`Giao diện trong zip là V${zipVer}, mã nguồn hiện tại là V${title}: đóng gói lại`); else ok('Giao diện trong zip cùng phiên bản với mã nguồn');
  const srvZip = execFileSync(TAR, ['-xOf', ZIP, 'KiotLabel/server/server.mjs'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(srvZip) !== norm(read(path.join(REPO, 'server', 'server.mjs')))) bad('server.mjs trong zip khác mã nguồn hiện tại: đóng gói lại'); else ok('server.mjs trong zip khớp mã nguồn');
  const MAX_MB = 80;
  const mb = fs.statSync(ZIP).size / 1048576;
  if (mb > MAX_MB) warn(`Zip ${mb.toFixed(1)} MB (> ${MAX_MB} MB)`); else ok(`Dung lượng ${mb.toFixed(1)} MB`);
}

console.log(`\nKết quả: ${failures} lỗi, ${warnings} lưu ý`);
process.exit(failures > 0 || (argv.includes('--strict') && warnings > 0) ? 1 : 0);
