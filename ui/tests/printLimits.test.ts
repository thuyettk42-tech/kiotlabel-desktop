import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrintManifest, MAX_LABELS, MAX_LABELS_RASTER } from '../src/utils/printLimits.ts';

const rows = (n: number, extra: Record<string, unknown> = {}) => Array.from({ length: n }, (_, i) => ({ ten: `SP${i}`, ...extra }));

test('giới hạn: PDF vector/máy in cao hơn PDF ảnh', () => {
  assert.equal(MAX_LABELS_RASTER, 1000);
  assert.ok(MAX_LABELS > MAX_LABELS_RASTER);
});

test('không có Excel thì danh sách rỗng, không cảnh báo', () => {
  const r = buildPrintManifest({ excelData: [], mode: 'constant', copies: 3 });
  assert.deepEqual(r, { manifest: [], warning: null, hasExceeded: false });
});

test('mỗi dòng 1 bản khi không chọn cột số lượng', () => {
  const r = buildPrintManifest({ excelData: rows(4), mode: 'excel_column', column: null, copies: 1 });
  assert.deepEqual(r.manifest, [0, 1, 2, 3]);
  assert.equal(r.hasExceeded, false);
});

test('số bản cố định lặp mỗi dòng', () => {
  const r = buildPrintManifest({ excelData: rows(2), mode: 'constant', copies: 3 });
  assert.deepEqual(r.manifest, [0, 0, 0, 1, 1, 1]);
});

test('cột số lượng: đọc số, bỏ dấu phẩy nghìn, rỗng/chữ/âm thành 1, phần thập phân bị cắt', () => {
  const data = [{ sl: '2' }, { sl: '1,000' }, { sl: '' }, { sl: 'abc' }, { sl: '-5' }, { sl: 2.9 }];
  const r = buildPrintManifest({ excelData: data, mode: 'excel_column', column: 'sl', copies: 1, limit: 5000 });
  assert.equal(r.manifest.filter((x) => x === 0).length, 2);
  assert.equal(r.manifest.filter((x) => x === 1).length, 1000);
  assert.equal(r.manifest.filter((x) => x === 2).length, 1);
  assert.equal(r.manifest.filter((x) => x === 3).length, 1);
  assert.equal(r.manifest.filter((x) => x === 4).length, 1);
  assert.equal(r.manifest.filter((x) => x === 5).length, 2);
  assert.equal(r.hasExceeded, false);
});

test('vượt giới hạn: dừng ở dòng vừa trọn vẹn và nêu rõ dòng Excel', () => {
  const r = buildPrintManifest({ excelData: rows(10), mode: 'constant', copies: 3, limit: 10 });
  assert.equal(r.manifest.length, 9); // 3 dòng x 3 bản; dòng thứ 4 (idx 3) sẽ vượt
  assert.equal(r.hasExceeded, true);
  assert.match(r.warning ?? '', /hàng thứ 3 \(dòng 4 trong tệp Excel\)/);
  assert.match(r.warning ?? '', /10 bản/);
});

test('2000 dòng: cao hơn 1000 vẫn in đủ với giới hạn mặc định', () => {
  const r = buildPrintManifest({ excelData: rows(2000), mode: 'excel_column', column: null, copies: 1 });
  assert.equal(r.manifest.length, 2000);
  assert.equal(r.hasExceeded, false);
  const raster = buildPrintManifest({ excelData: rows(2000), mode: 'excel_column', column: null, copies: 1, limit: MAX_LABELS_RASTER });
  assert.equal(raster.manifest.length, 1000);
  assert.equal(raster.hasExceeded, true);
});

test('6000 dòng: dừng ở 5000 tem', () => {
  const r = buildPrintManifest({ excelData: rows(6000), mode: 'excel_column', column: null, copies: 1 });
  assert.equal(r.manifest.length, MAX_LABELS);
  assert.equal(r.hasExceeded, true);
  assert.match(r.warning ?? '', /5\.000/);
});

test('một dòng có số lượng lớn hơn giới hạn bị cắt bằng giới hạn, không treo', () => {
  const r = buildPrintManifest({ excelData: [{ sl: 999999 }], mode: 'excel_column', column: 'sl', copies: 1 });
  assert.equal(r.manifest.length, MAX_LABELS);
  assert.equal(r.hasExceeded, false);
});
