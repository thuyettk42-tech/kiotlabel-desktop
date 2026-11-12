// Đóng gói KiotLabel bản desktop (portable, Windows x64):
//   node scripts/build-desktop.mjs [--node <đường-dẫn-node.exe>] [--out <thư-mục>] [--skip-web]
// Kết quả: <out>/KiotLabel/ (thư mục chạy được) và <out>/KiotLabel-portable-win-x64.zip + .sha256 (mặc định <out> = dist-desktop).
// Cần: Node (để build giao diện), .NET 8 SDK (dotnet), và node.exe CHÍNH THỨC có chữ ký số hợp lệ (mặc định node đang chạy script này).
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
const NODE_EXE = path.resolve(opt('--node', process.execPath));
const NAME = 'KiotLabel';
const run = (cmd, args, cwd) => { console.log('> ' + [cmd, ...args].join(' ')); execFileSync(cmd === 'npm' ? 'npm.cmd' : cmd, args, { cwd, stdio: 'inherit', shell: cmd === 'npm' }); };
// bsdtar của Windows (tạo và đọc zip); trên máy chủ GitHub, `tar` trong PATH có thể là GNU tar của Git, không làm được việc này
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const dotnet = fs.existsSync('C:\\Program Files\\dotnet\\dotnet.exe') ? 'C:\\Program Files\\dotnet\\dotnet.exe' : 'dotnet';

if (process.platform !== 'win32') throw new Error('Script đóng gói này dành cho Windows.');

// 1. node.exe phải là bản chính thức, nguyên vẹn (không đóng gói lại): kiểm tra chữ ký số
// Gọi PowerShell từ một PowerShell khác (ví dụ pwsh trên GitHub Actions) làm PowerShell 5.1 thừa kế PSModulePath của bản 7 và không nạp được
// module Security (kết quả rỗng): bỏ PSModulePath, và thử cả pwsh nếu vẫn không đọc được.
function signatureOf(file) {
  const cmd = `$s = Get-AuthenticodeSignature -LiteralPath '${file}'; "$($s.Status)|$($s.SignerCertificate.Subject)"`;
  const envClean = { ...process.env }; delete envClean.PSModulePath;
  const notes = [];
  for (const [exe, env] of [['powershell', envClean], ['pwsh', process.env]]) {
    try {
      const out = execFileSync(exe, ['-NoProfile', '-Command', cmd], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      if (out && out !== '|') return out;
      notes.push(`${exe}: kết quả rỗng`);
    } catch (e) {
      notes.push(`${exe}: ${String(e.stderr || e.message).trim().slice(0, 200)}`);
    }
  }
  return '|' + notes.join(' ; ');
}
const sig = signatureOf(NODE_EXE);
console.log('node.exe: ' + sig);
if (!sig.startsWith('Valid|') || !/OpenJS Foundation/.test(sig)) throw new Error('node.exe không có chữ ký hợp lệ của OpenJS Foundation (' + NODE_EXE + '): ' + sig);

// 2. Giao diện (bản build tĩnh của KiotLabel, thư mục ui/)
if (!argv.includes('--skip-web')) {
  run('npm', ['ci'], UI);
  run('npm', ['run', 'build'], UI);
}
const WEB = path.join(UI, 'dist');
if (!fs.existsSync(path.join(WEB, 'index.html'))) throw new Error('Chưa có ' + WEB + '\\index.html');

// 3. KiotLabel.exe (C#, một tệp, không tự giải nén, không nén)
const pub = path.join(OUT, '_launcher');
fs.rmSync(pub, { recursive: true, force: true });
run(dotnet, ['publish', path.join(ROOT, 'launcher', 'KiotLabel.csproj'), '-c', 'Release', '-o', pub, '/p:CI=true'], ROOT);

// 4. Lắp thư mục chạy
const root = path.join(OUT, NAME);
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'runtime'), { recursive: true });
fs.copyFileSync(path.join(pub, 'KiotLabel.exe'), path.join(root, 'KiotLabel.exe'));
fs.copyFileSync(NODE_EXE, path.join(root, 'runtime', 'node.exe'));
fs.cpSync(path.join(ROOT, 'server'), path.join(root, 'server'), { recursive: true });
fs.cpSync(WEB, path.join(root, 'app'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'packaging', 'HUONG-DAN.txt'), path.join(root, 'HUONG-DAN.txt'));
const nodeLicense = path.join(path.dirname(NODE_EXE), 'LICENSE');
if (fs.existsSync(nodeLicense)) fs.copyFileSync(nodeLicense, path.join(root, 'runtime', 'LICENSE-node.txt'));
fs.rmSync(pub, { recursive: true, force: true });

// 5. Mã băm từng tệp + zip + mã băm của zip
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const lines = walk(root).filter((f) => !f.endsWith('SHA256SUMS.txt')).sort().map((f) => `${sha(f)}  ${path.relative(root, f).replaceAll('\\', '/')}`);
fs.writeFileSync(path.join(root, 'SHA256SUMS.txt'), lines.join('\n') + '\n');

const zip = path.join(OUT, `${NAME}-portable-win-x64.zip`);
fs.rmSync(zip, { force: true });
run(TAR, ['-a', '-c', '-f', zip, '-C', OUT, NAME], OUT);
const zipSha = sha(zip);
fs.writeFileSync(zip + '.sha256', `${zipSha}  ${path.basename(zip)}\n`);
console.log(`\nXong: ${zip} (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)\nSHA-256: ${zipSha}`);

// 6. Kiểm tra trước khi phát hành (phiên bản, offline, cờ đóng gói, SHA-256, zip khớp mã nguồn); lỗi thì dừng
run('node', [path.join(HERE, 'check-release.mjs'), '--zip', zip, '--web', WEB], ROOT);
