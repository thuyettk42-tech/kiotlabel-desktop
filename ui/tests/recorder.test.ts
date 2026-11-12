import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVectorOps } from '../src/utils/vectorPdf/render.ts';
import { LABEL_TEMPLATES } from '../src/templates.ts';

// Máy chủ phục vụ font Arimo/Tinos/Cousine thay cho trình duyệt (buildVectorOps nạp font qua fetch)
const FONTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const server = http.createServer((req, res) => {
  const f = path.join(FONTS, decodeURIComponent(req.url || ''));
  if (!f.startsWith(FONTS) || !fs.existsSync(f)) { res.statusCode = 404; res.end(); return; }
  res.end(fs.readFileSync(f));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const port = (server.address() as any).port;
const fontBaseUrl = `http://127.0.0.1:${port}/fonts/`;

const tpl = LABEL_TEMPLATES[0];
const baseSheet = {
  mode: 'office', paperSize: 'A4', customWidth: 210, customHeight: 297, orientation: 'portrait',
  marginTop: 10, marginBottom: 10, marginLeft: 10, marginRight: 10, rows: 3, cols: 2, rowGap: 4, colGap: 6,
  showBorder: true, borderWidth: 1, borderRadius: 0, borderColor: '#9ca3af',
} as any;
const job = async (n: number, sheet = baseSheet, objects: any[] = tpl.objects) => buildVectorOps({
  labelConfig: tpl.config, sheetConfig: sheet, totalItems: n,
  getObjects: (i: number) => objects.map((o: any) => (o.excelColumn ? { ...o, content: `${o.content}-${i + 1}` } : o)),
  templateObjects: objects, includeBackground: true, title: 't', fontBaseUrl,
});

test.after(() => server.close());

test('in thẳng A4: 8 tem lưới 2x3 thành 2 trang đúng khổ và có đủ loại lệnh vẽ', async () => {
  const j = await job(8);
  assert.equal(j.version, 1);
  assert.equal(j.pages.length, 2);
  assert.ok(Math.abs(j.pages[0].wMm - 210) < 0.01 && Math.abs(j.pages[0].hMm - 297) < 0.01, `khổ ${j.pages[0].wMm}x${j.pages[0].hMm}`);
  const names = new Set(j.pages[0].ops.map((o) => String(o[0])));
  for (const need of ['q', 'Q', 'cm', 'm', 'l', 'h', 'f', 'rg', 'T', 'W', 'n']) assert.ok(names.has(need), `thiếu lệnh ${need}`);
  assert.deepEqual(j.warnings, []);
});

test('chỉ giữ các lệnh đồ họa PDF cho phép; không còn lệnh gs, Do, BT, Tf và không có cm đơn vị', async () => {
  const j = await job(6);
  const allowed = new Set(['q', 'Q', 'cm', 'm', 'l', 'c', 'v', 'y', 'h', 're', 'f', 'F', 'f*', 'S', 's', 'B', 'B*', 'b', 'b*', 'n', 'W', 'W*', 'w', 'J', 'j', 'M', 'd', 'rg', 'RG', 'g', 'G', 'T', 'I']);
  for (const p of j.pages) for (const o of p.ops) {
    assert.ok(allowed.has(String(o[0])), `lệnh lạ: ${o[0]}`);
    if (o[0] === 'cm') assert.ok(!(o[1] === 1 && o[2] === 0 && o[3] === 0 && o[4] === 1 && o[5] === 0 && o[6] === 0), 'còn cm đơn vị');
  }
});

test('lệnh chữ T: họ font, cờ đậm/nghiêng, cỡ, toạ độ, nội dung và màu hợp lệ', async () => {
  const j = await job(2);
  const texts = j.pages[0].ops.filter((o) => o[0] === 'T');
  assert.ok(texts.length > 20, `${texts.length} lệnh chữ`);
  for (const t of texts) {
    assert.equal(t.length, 10);
    assert.ok([0, 1, 2].includes(t[1] as number), 'họ font');
    assert.ok([0, 1, 2, 3].includes(t[2] as number), 'cờ font');
    assert.ok((t[3] as number) > 0 && (t[3] as number) < 100, 'cỡ chữ');
    assert.equal(typeof t[6], 'string');
    for (const c of [t[7], t[8], t[9]] as number[]) assert.ok(c >= 0 && c <= 1, 'màu 0..1');
  }
  assert.ok(texts.some((t) => String(t[6]).includes('MÁ')), 'thiếu chữ tiếng Việt có dấu');
  assert.ok(texts.some((t) => t[2] === 1), 'thiếu chữ đậm');
});

test('nét đứt của hình khối được ghi thành mẫu d dạng mảng số', async () => {
  const objs: any[] = [{ id: 'r', type: 'shape', shapeType: 'rect', x: -10, y: 0, width: 24, height: 12, shapeFillColor: 'transparent', shapeStrokeColor: '#1F4E79', shapeStrokeWidth: 0.5, shapeStrokeStyle: 'dashed', isCenterRelative: true }];
  const j = await job(1, baseSheet, objs);
  const dashes = j.pages[0].ops.filter((o) => o[0] === 'd' && Array.isArray(o[1]) && (o[1] as number[]).length > 0);
  assert.ok(dashes.length > 0, 'không thấy mẫu nét đứt');
  assert.ok((dashes[0][1] as number[]).every((n) => n > 0));
});

test('độ mờ được trộn với nền trắng (không còn trạng thái đồ họa mở rộng)', async () => {
  const objs: any[] = [{ id: 'r', type: 'shape', shapeType: 'rect', x: 0, y: 0, width: 20, height: 10, shapeFillColor: 'rgba(255,0,0,0.5)', shapeStrokeWidth: 0, isCenterRelative: true }];
  const j = await job(1, baseSheet, objs);
  const reds = j.pages[0].ops.filter((o) => o[0] === 'rg' && o[1] === 1 && (o[2] as number) > 0.45 && (o[2] as number) < 0.55);
  assert.ok(reds.length > 0, 'không thấy màu đỏ nhạt (đỏ 50% trên nền trắng)');
});

test('khổ A5 ngang và tổng số tem được tính theo lưới', async () => {
  const sheet = { ...baseSheet, paperSize: 'A5', orientation: 'landscape', rows: 2, cols: 2 };
  const j = await job(9, sheet);
  assert.equal(j.pages.length, 3); // 4 tem mỗi trang, 9 tem
  assert.ok(Math.abs(j.pages[0].wMm - 210) < 0.5 && Math.abs(j.pages[0].hMm - 148) < 0.5, `khổ ${j.pages[0].wMm}x${j.pages[0].hMm}`);
});

test('danh sách lệnh nhỏ gọn và chuyển được sang JSON (khoảng 10 KB mỗi tem)', async () => {
  const j = await job(8);
  const json = JSON.stringify(j);
  assert.ok(json.length < 8 * 16 * 1024, `${(json.length / 1024).toFixed(1)} KB cho 8 tem`);
  const back = JSON.parse(json);
  assert.equal(back.pages.length, j.pages.length);
});
