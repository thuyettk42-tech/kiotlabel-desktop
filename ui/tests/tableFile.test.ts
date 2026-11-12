import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { isBinaryWorkbook, isTextTable, decodeTableText, detectSeparator, readTableFile } from '../src/utils/tableFile.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const rows = (wb: any) => XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
const SAMPLE = 'Mã vạch,Tên sản phẩm,Giá\n0012345,"Áo thun, Đẹp",1.000\n8930000000002,Quần ặ ố ữ,250000\n';

test('isBinaryWorkbook / isTextTable', () => {
  assert.equal(isBinaryWorkbook(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0])), true);
  assert.equal(isBinaryWorkbook(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])), true);
  assert.equal(isBinaryWorkbook(enc('a,b')), false);
  assert.equal(isTextTable(enc('a,b'), 'x.csv'), true);
  assert.equal(isTextTable(enc('a,b'), 'x.xlsx'), false);
  assert.equal(isTextTable(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), 'x.csv'), false);
});

test('decodeTableText: UTF-8 không BOM, UTF-8 có BOM, UTF-16 LE, Windows-1258', () => {
  assert.equal(decodeTableText(enc(SAMPLE)), SAMPLE);
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc(SAMPLE)]);
  assert.equal(decodeTableText(bom), SAMPLE);
  const u16 = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...SAMPLE].map((c) => c.charCodeAt(0))).buffer)]);
  assert.equal(decodeTableText(u16), SAMPLE);
  // Windows-1258: "Á" = 0xC1, "ê" = 0xEA (byte lẻ không hợp lệ trong UTF-8)
  assert.equal(decodeTableText(Uint8Array.from([0xc1, 0x6f, 0xea])), 'Áoê');
});

test('detectSeparator bỏ qua nội dung trong dấu nháy kép', () => {
  assert.equal(detectSeparator('a,b,c\n1,2,3'), ',');
  assert.equal(detectSeparator('a;b;c\n1;2;3'), ';');
  assert.equal(detectSeparator('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(detectSeparator('"a,b,c,d";x;y\n1;2;3'), ';');
});

test('readTableFile: CSV UTF-8 không BOM giữ đúng dấu và số 0 đứng đầu', () => {
  const wb = readTableFile(XLSX, enc(SAMPLE), 'san-pham.csv');
  assert.deepEqual(rows(wb), [
    ['Mã vạch', 'Tên sản phẩm', 'Giá'],
    ['0012345', 'Áo thun, Đẹp', '1.000'],
    ['8930000000002', 'Quần ặ ố ữ', '250000']
  ]);
});

test('readTableFile: CSV dùng dấu ; và tệp có BOM', () => {
  const semi = SAMPLE.replace(/,(?=[^"]*(?:"[^"]*"[^"]*)*$)/g, ';').replace('"Áo thun; Đẹp"', '"Áo thun, Đẹp"');
  const wb = readTableFile(XLSX, new Uint8Array([0xef, 0xbb, 0xbf, ...enc(semi)]), 'a.csv');
  assert.equal(rows(wb)[1][1], 'Áo thun, Đẹp');
  assert.equal(rows(wb)[0].length, 3);
});

test('readTableFile: xlsx vẫn đọc như cũ', () => {
  const ws = XLSX.utils.aoa_to_sheet([['Mã', 'Tên'], ['0012345', 'Áo']]);
  const wb0 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb0, ws, 'S');
  const buf = XLSX.write(wb0, { bookType: 'xlsx', type: 'buffer' }) as Uint8Array;
  assert.deepEqual(rows(readTableFile(XLSX, new Uint8Array(buf), 'x.xlsx')), [['Mã', 'Tên'], ['0012345', 'Áo']]);
});
