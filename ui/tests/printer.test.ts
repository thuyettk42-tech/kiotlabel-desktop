import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monoFromRgba, bitmapToZplGfa, bitmapToBars, ellipseBitmap, isDarkColor, MonoBitmap,
  needsRaster, cropToInk, normalizeAngle
} from '../src/utils/printerBitmap.ts';
import { convertToZPL } from '../src/utils/zplGenerator.ts';
import { convertToTSPL } from '../src/utils/tsplGenerator.ts';
import type { LabelObject } from '../src/types.ts';

const bmp = (rows: string[]): MonoBitmap => ({
  width: rows[0].length,
  height: rows.length,
  data: Uint8Array.from(rows.join('').split('').map((c) => (c === '#' ? 1 : 0)))
});

test('monoFromRgba: đen -> 1, trắng -> 0, trong suốt coi là trắng', () => {
  const rgba = [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0, 200, 200, 200, 255];
  assert.deepEqual([...monoFromRgba(rgba, 4, 1).data], [1, 0, 0, 0]);
});

test('bitmapToZplGfa: 10 điểm rộng -> 2 byte mỗi hàng, bit cao nhất là điểm trái nhất', () => {
  const g = bitmapToZplGfa(bmp(['#.........', '##########']));
  assert.equal(g, '^GFA,4,4,2,8000FFC0');
});

test('bitmapToBars: gộp các hàng giống nhau thành một hình chữ nhật', () => {
  const bars = bitmapToBars(bmp(['.##.', '.##.', '####']), 10, 20);
  assert.deepEqual(bars, [
    { x: 11, y: 20, w: 2, h: 2 },
    { x: 10, y: 22, w: 4, h: 1 }
  ]);
});

test('ellipseBitmap: viền rỗng ở giữa, đặc thì kín; góc ngoài trống', () => {
  const ring = ellipseBitmap(20, 20, 2, false);
  const solid = ellipseBitmap(20, 20, 2, true);
  const at = (b: MonoBitmap, x: number, y: number) => b.data[y * b.width + x];
  assert.equal(at(ring, 10, 10), 0);
  assert.equal(at(ring, 10, 0), 1);
  assert.equal(at(solid, 10, 10), 1);
  assert.equal(at(ring, 0, 0), 0);
  assert.equal(at(solid, 0, 0), 0);
});

test('isDarkColor', () => {
  assert.equal(isDarkColor('#000000'), true);
  assert.equal(isDarkColor('#000'), true);
  assert.equal(isDarkColor('#ffffff'), false);
  assert.equal(isDarkColor('transparent'), false);
  assert.equal(isDarkColor(undefined), false);
  assert.equal(isDarkColor('rgb(10, 10, 10)'), true);
  assert.equal(isDarkColor('rgba(10, 10, 10, 0.2)'), false);
});

const base: LabelObject = { id: 'o1', type: 'shape', x: -20, y: -15, width: 10, height: 10, content: '' };
const cfg = { dpi: 203, labelWidthMm: 40, labelHeightMm: 30 };

test('ZPL: hình tròn/oval dùng ^GE, hình tô đặc có độ dày bằng cạnh ngắn', () => {
  const circle = convertToZPL([{ ...base, shapeType: 'circle', shapeStrokeWidth: 0.5 }], cfg);
  assert.match(circle, /\^GE80,80,\d+,B\^FS/);
  assert.doesNotMatch(circle, /\^GB/);
  const oval = convertToZPL([{ ...base, shapeType: 'oval', width: 20, height: 10 }], cfg);
  assert.match(oval, /\^GE160,80,/);
  const filled = convertToZPL([{ ...base, shapeType: 'rect', shapeFillColor: '#000000' }], cfg);
  assert.match(filled, /\^GB80,80,80,B,0\^FS/);
  const outline = convertToZPL([{ ...base, shapeType: 'rect', shapeFillColor: 'transparent', shapeStrokeWidth: 1 }], cfg);
  assert.match(outline, /\^GB80,80,8,B,0\^FS/);
});

test('ZPL: hình ảnh có ảnh đơn sắc -> ^GFA tại đúng vị trí; thiếu ảnh -> ghi chú', () => {
  const img: LabelObject = { ...base, type: 'image', content: 'data:image/png;base64,xx' };
  const withBmp = convertToZPL([img], { ...cfg, bitmaps: { o1: bmp(['#.', '.#']) } });
  assert.match(withBmp, /\^FO0,0\n\^GFA,2,2,1,80?40\^FS|\^FO0,0\n\^GFA,2,2,1,8040\^FS/);
  const without = convertToZPL([img], cfg);
  assert.match(without, /\^FX Hinh anh bi bo qua/);
  assert.doesNotMatch(without, /\^GFA/);
});

test('TSPL: hình tròn thành các BAR, hình tô đặc dùng BAR, viền dùng BOX', () => {
  const circle = convertToTSPL([{ ...base, shapeType: 'circle', shapeStrokeWidth: 0.5 }], cfg);
  assert.match(circle, /^BAR \d+,\d+,\d+,\d+$/m);
  assert.doesNotMatch(circle, /CIRCLE|ELLIPSE|BOX/);
  const filled = convertToTSPL([{ ...base, shapeType: 'rect', shapeFillColor: '#000' }], cfg);
  assert.match(filled, /^BAR 0,0,80,80$/m);
  const outline = convertToTSPL([{ ...base, shapeType: 'rect' }], cfg);
  assert.match(outline, /^BOX 0,0,80,80,/m);
});

test('TSPL: hình ảnh thành BAR, quá nhiều khối thì bỏ qua kèm ghi chú', () => {
  const img: LabelObject = { ...base, type: 'image', content: 'x' };
  const ok = convertToTSPL([img], { ...cfg, bitmaps: { o1: bmp(['##.', '##.']) } });
  assert.match(ok, /^BAR 0,0,2,2$/m);
  // Ảnh bàn cờ tạo rất nhiều khối
  const w = 200, h = 100;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = (x + y) % 2;
  const big = convertToTSPL([img], { ...cfg, bitmaps: { o1: { width: w, height: h, data } } });
  assert.match(big, /; Bo qua image o1/);
  assert.doesNotMatch(big, /^BAR /m);
});

test('normalizeAngle và needsRaster', () => {
  assert.equal(normalizeAngle(-90), 270);
  assert.equal(normalizeAngle(450), 90);
  assert.equal(normalizeAngle(undefined), 0);
  const o: LabelObject = { id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 5, content: 'x' };
  assert.equal(needsRaster(o), false);
  assert.equal(needsRaster({ ...o, angle: 0 }), false);
  assert.equal(needsRaster({ ...o, angle: 360 }), false);
  assert.equal(needsRaster({ ...o, angle: 90 }), true);
  assert.equal(needsRaster({ ...o, angle: 12.5 }), true);
  const sh: LabelObject = { ...o, type: 'shape', shapeType: 'rect' };
  assert.equal(needsRaster(sh), false);
  assert.equal(needsRaster({ ...sh, shapeStrokeStyle: 'solid' }), false);
  assert.equal(needsRaster({ ...sh, shapeStrokeStyle: 'dashed' }), true);
  assert.equal(needsRaster({ ...sh, shapeStrokeStyle: 'dotted', shapeStrokeWidth: 0 }), false);
  assert.equal(needsRaster({ ...sh, shapeStrokeStyle: 'dotted' }), true);
});

test('cropToInk: cắt về khung chứa điểm đen, cộng độ lệch; ảnh trắng -> null', () => {
  const c = cropToInk(bmp(['....', '.##.', '.#..', '....']), 100, 200)!;
  assert.deepEqual([c.x, c.y, c.width, c.height], [101, 201, 2, 2]);
  assert.deepEqual([...c.data], [1, 1, 1, 0]);
  assert.equal(cropToInk(bmp(['...', '...'])), null);
});

test('Bộ sinh lệnh: đối tượng dựng sẵn có x,y được in tại đúng vị trí tuyệt đối, ảnh rỗng thì không in gì', () => {
  const rotated: LabelObject = { ...base, id: 'r1', type: 'shape', shapeType: 'rect', angle: 45 };
  const placed = { ...bmp(['##', '##']), x: 37, y: 91 };
  const zpl = convertToZPL([rotated], { ...cfg, bitmaps: { r1: placed } });
  assert.match(zpl, /\^FO37,91\n\^GFA,2,2,1,C0C0\^FS/);
  assert.doesNotMatch(zpl, /\^GB/);
  const tspl = convertToTSPL([rotated], { ...cfg, bitmaps: { r1: placed } });
  assert.match(tspl, /^BAR 37,91,2,2$/m);
  assert.doesNotMatch(tspl, /BOX/);
  const blank = { width: 0, height: 0, data: new Uint8Array(0), x: 0, y: 0 };
  assert.doesNotMatch(convertToZPL([rotated], { ...cfg, bitmaps: { r1: blank } }), /\^GB|\^GFA|\^FO/);
  assert.doesNotMatch(convertToTSPL([rotated], { ...cfg, bitmaps: { r1: blank } }), /BAR|BOX/);
  // Không dựng được: quay về lệnh gốc (không xoay)
  assert.match(convertToZPL([rotated], cfg), /\^GB80,80,/);
});
