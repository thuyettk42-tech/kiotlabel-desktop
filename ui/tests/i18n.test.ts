// Kiểm tra từ điển EN (D70 kiểu KiotLabel): mọi t("...") / tk("...") trong src/ phải có bản dịch,
// biến {tên} khớp, không có chuỗi EN còn dư chữ Việt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { EN } from '../src/i18n/en.ts';
import { translate } from '../src/i18n/index.ts';

const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

function collect(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'i18n') continue;
      collect(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function usedKeys(): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of collect('src')) {
    const src = fs.readFileSync(f, 'utf8');
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 't' || n.expression.text === 'tk')) {
        const a = n.arguments[0];
        if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) map.set(a.text, f);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return map;
}

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('i18n: mọi khóa dùng trong mã đều có bản dịch EN', () => {
  const used = usedKeys();
  assert.ok(used.size > 500, 'quét được quá ít khóa: ' + used.size);
  const missing = [...used].filter(([k]) => !(k in EN)).map(([k, f]) => `${f}: ${JSON.stringify(k.slice(0, 80))}`);
  assert.deepEqual(missing, [], 'thiếu bản dịch EN:\n' + missing.join('\n'));
});

test('i18n: biến {tên} của EN khớp chuỗi gốc', () => {
  const bad = Object.entries(EN).filter(([k, v]) => vars(k) !== vars(v)).map(([k]) => k.slice(0, 80));
  assert.deepEqual(bad, []);
});

test('i18n: bản EN không còn dấu tiếng Việt và không rỗng', () => {
  const bad = Object.entries(EN).filter(([, v]) => !v.trim() || VI.test(v)).map(([k]) => k.slice(0, 80));
  assert.deepEqual(bad, []);
});

test('i18n: EN không có khóa thừa (không còn dùng trong mã)', () => {
  const used = usedKeys();
  const stale = Object.keys(EN).filter((k) => !used.has(k)).map((k) => k.slice(0, 80));
  assert.deepEqual(stale, []);
});

test('i18n: translate thay biến và rơi về tiếng Việt khi thiếu khóa', () => {
  assert.equal(translate('vi', 'Lưu'), 'Lưu');
  assert.equal(translate('en', 'Chưa có bản dịch này {n}', { n: 3 }), 'Chưa có bản dịch này 3');
  assert.equal(translate('en', 'Mẫu Thiết Kế {nextIndex}', { nextIndex: 2 }), 'Design 2');
});
