import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPages, sheetDimensions, totalLabelCount } from '../src/utils/vectorPdf/pages.ts';
import type { SheetLayoutConfig } from '../src/types.ts';

const base: SheetLayoutConfig = {
  mode: 'thermal', paperSize: 'A4', customWidth: 210, customHeight: 297, orientation: 'portrait',
  marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, rows: 1, cols: 1, rowGap: 0, colGap: 0,
  showBorder: false, borderWidth: 1, borderRadius: 0
};
const label = { width: 40, height: 30 };

test('cuộn tem 1 cột: mỗi tem một trang, rộng = tem + 2 lề (mặc định 1 mm)', () => {
  const pages = buildPages(label, base, 3);
  assert.equal(pages.length, 3);
  assert.deepEqual([pages[0].widthMm, pages[0].heightMm], [42, 30]);
  assert.deepEqual(pages[0].cells, [{ index: 0, x: 1, y: 0 }]);
  assert.equal(pages[2].cells[0].index, 2);
});

test('cuộn tem 3 cột: rộng gồm khoảng cách cột, hàng cuối có thể thiếu tem', () => {
  const pages = buildPages(label, { ...base, cols: 3, colGap: 2, rollSideMargin: 2 }, 7);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].widthMm, 3 * 40 + 2 * 2 + 2 * 2);
  assert.deepEqual(pages[0].cells.map((c) => c.x), [2, 44, 86]);
  assert.equal(pages[2].cells.length, 1);
  assert.equal(pages[2].cells[0].index, 6);
});

test('tờ A4: lưới hàng x cột từ lề trên/trái; sang tờ mới khi hết ô', () => {
  const sheet: SheetLayoutConfig = { ...base, mode: 'office', rows: 2, cols: 2, marginTop: 10, marginLeft: 5, rowGap: 3, colGap: 4 };
  const pages = buildPages(label, sheet, 5);
  assert.equal(pages.length, 2);
  assert.deepEqual([pages[0].widthMm, pages[0].heightMm], [210, 297]);
  assert.deepEqual(pages[0].cells.map((c) => [c.x, c.y]), [[5, 10], [49, 10], [5, 43], [49, 43]]);
  assert.deepEqual(pages[1].cells, [{ index: 4, x: 5, y: 10 }]);
});

test('khổ giấy: A5, ngang, tùy chọn', () => {
  assert.deepEqual(sheetDimensions({ ...base, paperSize: 'A5' }), { width: 148, height: 210 });
  assert.deepEqual(sheetDimensions({ ...base, paperSize: 'A4', orientation: 'landscape' }), { width: 297, height: 210 });
  assert.deepEqual(sheetDimensions({ ...base, paperSize: 'custom', customWidth: 100, customHeight: 150 }), { width: 100, height: 150 });
});

test('totalLabelCount: Excel theo bảng kê, không Excel theo số bản hoặc đủ một hàng/tờ', () => {
  assert.equal(totalLabelCount({ hasExcel: true, manifestLength: 12, excelRows: 5, perPage: 6 }), 12);
  assert.equal(totalLabelCount({ hasExcel: true, excelRows: 5, perPage: 6 }), 5);
  assert.equal(totalLabelCount({ hasExcel: false, printCopies: 24, perPage: 6 }), 24);
  assert.equal(totalLabelCount({ hasExcel: false, perPage: 6 }), 6);
});
