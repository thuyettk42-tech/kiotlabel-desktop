import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutSegments, LINE_HEIGHT, type Measurer, type TextSeg, type FontKey } from '../src/utils/vectorPdf/textLayout.ts';

const font: FontKey = { family: 'sans', bold: false, italic: false };
// Mỗi ký tự rộng đúng 0,5 lần cỡ chữ; ascent 0,8 và descent 0,2
const m: Measurer = {
  width: (text, _f, size) => Array.from(text).length * size * 0.5,
  ascent: () => 0.8,
  descent: () => 0.2
};
const seg = (text: string, size = 2, extra: Partial<TextSeg> = {}): TextSeg => ({ text, size, font, color: '#000', ...extra });
const text = (lines: ReturnType<typeof layoutSegments>) => lines.map((l) => l.runs.map((r) => r.text).join(''));

test('một dòng vừa khung: bề rộng và chiều cao dòng = 1,25 lần cỡ chữ', () => {
  const lines = layoutSegments([seg('Hello')], 100, m);
  assert.deepEqual(text(lines), ['Hello']);
  assert.ok(Math.abs(lines[0].width - 5) < 1e-9); // 5 ký tự x 2 x 0,5
  assert.ok(Math.abs(lines[0].height - 2 * LINE_HEIGHT) < 1e-9);
  // đường cơ sở = nửa khoảng cách + ascent = (2,5 - 2)/2 + 1,6 = 1,85
  assert.ok(Math.abs(lines[0].baseline - 1.85) < 1e-9);
});

test('ngắt dòng ở khoảng trắng; khoảng trắng cuối dòng không tính vào bề rộng', () => {
  // mỗi ký tự rộng 1mm; khung 11mm
  const lines = layoutSegments([seg('aaaa bbbb cccc')], 11, m);
  assert.deepEqual(text(lines), ['aaaa bbbb ', 'cccc']);
  assert.ok(Math.abs(lines[0].width - 9) < 1e-9);
});

test('xuống dòng cứng và dòng trống giữ chiều cao', () => {
  const lines = layoutSegments([seg('ab\n\ncd')], 100, m);
  assert.deepEqual(text(lines), ['ab', '', 'cd']);
  assert.ok(Math.abs(lines[1].height - 2 * LINE_HEIGHT) < 1e-9);
});

test('từ dài hơn khung bị bẻ theo ký tự', () => {
  const lines = layoutSegments([seg('abcdefghij')], 4, m);
  assert.deepEqual(text(lines), ['abcd', 'efgh', 'ij']);
});

test('nhiều đoạn trên một dòng: tiền tố nhỏ + nội dung lớn; dòng cao theo đoạn lớn nhất', () => {
  const lines = layoutSegments([seg('Gia: ', 1), seg('120', 3)], 100, m);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].runs.map((r) => r.text).join(''), 'Gia: 120');
  assert.equal(lines[0].runs[lines[0].runs.length - 1].seg.size, 3);
  assert.ok(Math.abs(lines[0].height - 3 * LINE_HEIGHT) < 1e-9);
});

test('chỉ số trên: chữ nhỏ 70% và dịch lên', () => {
  const lines = layoutSegments([seg('x'), seg('2', 2, { shift: 'superscript' })], 100, m);
  const sup = lines[0].runs[1];
  assert.ok(Math.abs(sup.size - 1.4) < 1e-9);
  assert.ok(sup.lift > 0);
});

test('giới hạn số dòng: dòng cuối bị cắt và thêm "..."', () => {
  const lines = layoutSegments([seg('aaaa bbbb cccc dddd eeee')], 9, m, 2);
  assert.equal(lines.length, 2);
  const last = text(lines)[1];
  assert.ok(last.endsWith('...'), last);
  assert.ok(lines[1].width <= 9 + 1e-9);
});

test('đủ chỗ thì không thêm "..."', () => {
  const lines = layoutSegments([seg('aaaa bbbb')], 8, m, 2);
  assert.deepEqual(text(lines), ['aaaa ', 'bbbb']);
});
