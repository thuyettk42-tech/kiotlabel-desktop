// Đóng gói KiotLabel bản desktop Windows: MỘT tệp KiotLabel.exe duy nhất (giao diện nhúng sẵn, không Node, không tự giải nén).
//   node scripts/build-desktop.mjs [--out <thư-mục>] [--skip-web]
// Kết quả: <out>/KiotLabel.exe và <out>/KiotLabel.exe.sha256 (mặc định <out> = dist-desktop).
// Cần: Node (để build giao diện) và .NET 8 SDK (dotnet), chạy trên Windows.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const UI = path.join(ROOT, 'ui');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = path.resolve(opt('--out', path.join(ROOT, 'dist-desktop')));
const run = (cmd, args, cwd) => { console.log('> ' + [cmd, ...args].join(' ')); execFileSync(cmd === 'npm' ? 'npm.cmd' : cmd, args, { cwd, stdio: 'inherit', shell: cmd === 'npm' }); };
const dotnet = fs.existsSync('C:\\Program Files\\dotnet\\dotnet.exe') ? 'C:\\Program Files\\dotnet\\dotnet.exe' : 'dotnet';

if (process.platform !== 'win32') throw new Error('Script đóng gói này dành cho Windows.');

// 1. Giao diện (bản build tĩnh của KiotLabel, thư mục ui/): sẽ được nhúng vào KiotLabel.exe
if (!argv.includes('--skip-web')) {
  run('npm', ['ci'], UI);
  run('npm', ['run', 'build'], UI);
}
const WEB = path.join(UI, 'dist');
if (!fs.existsSync(path.join(WEB, 'index.html'))) throw new Error('Chưa có ' + WEB + '\\index.html (chạy npm run build trong ui/)');

// 2. KiotLabel.exe (C#, .NET 8 tự chứa, một tệp, không nén, không tự giải nén; giao diện nhúng qua EmbeddedResource)
const pub = path.join(OUT, '_publish');
fs.rmSync(pub, { recursive: true, force: true });
run(dotnet, ['publish', path.join(ROOT, 'launcher', 'KiotLabel.csproj'), '-c', 'Release', '-o', pub, '/p:CI=true'], ROOT);
const built = path.join(pub, 'KiotLabel.exe');
if (!fs.existsSync(built)) throw new Error('dotnet publish không tạo ra KiotLabel.exe');

// 3. Chép ra, ghi SHA-256
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(OUT, 'KiotLabel.exe');
fs.copyFileSync(built, exe);
fs.rmSync(pub, { recursive: true, force: true });
const sha = crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
fs.writeFileSync(exe + '.sha256', `${sha}  KiotLabel.exe\n`);
console.log(`\nXong: ${exe} (${(fs.statSync(exe).size / 1048576).toFixed(1)} MB)\nSHA-256: ${sha}`);

// 4. Kiểm tra trước khi phát hành (phiên bản, offline, cờ đóng gói, SHA-256, giao diện nhúng đúng phiên bản); lỗi thì dừng
run('node', [path.join(HERE, 'check-release.mjs'), '--exe', exe, '--web', WEB], ROOT);
