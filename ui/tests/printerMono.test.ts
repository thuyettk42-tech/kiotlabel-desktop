import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  grayFromRgba, isPhotoLike, monoFromGrayDither, monoFromRgbaMode, MonoBitmap
} from '../src/utils/printerBitmap.ts';
import { convertToZPL } from '../src/utils/zplGenerator.ts';
import { convertToTSPL, bitmapToTsplBinary, tsplToBytes } from '../src/utils/tsplGenerator.ts';
import type { LabelObject } from '../src/types.ts';

const rgbaGray = (values: number[]) => values.flatMap((v) => [v, v, v, 255]);
const mono = (rows: string[]): MonoBitmap => ({
  width: rows[0].length,
  height: rows.length,
  data: Uint8Array.from(rows.join('').split('').map((c) => (c === '#' ? 1 : 0)))
});
const ones = (b: MonoBitmap) => b.data.reduce((n, v) => n + v, 0);

test('grayFromRgba: trong suốt thành trắng', () => {
  const g = grayFromRgba([0, 0, 0, 255, 0, 0, 0, 0], 2, 1);
  assert.deepEqual([...g].map(Math.round), [0, 255]);
});

test('isPhotoLike: hình nét (đen/trắng) khác ảnh chụp (nhiều mức xám)', () => {
  const lineArt = Float32Array.from({ length: 100 }, (_, i) => (i % 10 === 0 ? 0 : 255));
  assert.equal(isPhotoLike(lineArt), false);
  const photo = Float32Array.from({ length: 100 }, (_, i) => 60 + i); // dải xám liên tục
  assert.equal(isPhotoLike(photo), true);
  assert.equal(isPhotoLike(Float32Array.from({ length: 10 }, () => 255)), false); // trang trắng
});

test('dither: mật độ chấm đen tỉ lệ với độ tối', () => {
  const size = 40;
  const level = (v: number) => monoFromGrayDither(new Float32Array(size * size).fill(v), size, size);
  const white = ones(level(255)), light = ones(level(192)), mid = ones(level(128)), dark = ones(level(64)), black = ones(level(0));
  assert.equal(white, 0);
  assert.equal(black, size * size);
  assert.ok(light > 0 && light < mid && mid < dark && dark < black, `${light} < ${mid} < ${dark}`);
  // ~25% / ~50% / ~75% độ phủ
  assert.ok(Math.abs(light / (size * size) - 0.25) < 0.05);
  assert.ok(Math.abs(mid / (size * size) - 0.5) < 0.05);
  assert.ok(Math.abs(dark / (size * size) - 0.75) < 0.05);
});

test('monoFromRgbaMode: ngưỡng cho logo, dither cho ảnh chụp, cưỡng bức bằng chế độ', () => {
  const grayRamp = rgbaGray(Array.from({ length: 64 }, (_, i) => 40 + i * 3)); // 40..229: ảnh chụp
  const th = monoFromRgbaMode(grayRamp, 8, 8, 'threshold');
  const dith = monoFromRgbaMode(grayRamp, 8, 8, 'dither');
  const auto = monoFromRgbaMode(grayRamp, 8, 8, 'auto');
  assert.deepEqual([...auto.data], [...dith.data]); // ảnh chụp: auto = dither
  assert.notDeepEqual([...th.data], [...dith.data]);
  const logo = rgbaGray(Array.from({ length: 64 }, (_, i) => (i % 8 < 3 ? 0 : 255)));
  assert.deepEqual([...monoFromRgbaMode(logo, 8, 8, 'auto').data], [...monoFromRgbaMode(logo, 8, 8, 'threshold').data]);
});

test('bitmapToTsplBinary + tsplToBytes: bit 0 = đen, 1 = trắng; văn bản giữ UTF-8', () => {
  const cmd = bitmapToTsplBinary(mono(['#.......', '.#......']), 5, 7);
  const bytes = tsplToBytes(`TEXT 1,1,"Áo"\n${cmd}PRINT 1,1\n`);
  const text = Buffer.from(bytes).toString('latin1');
  const at = text.indexOf('BITMAP 5,7,1,2,0,');
  assert.ok(at > 0);
  const dataStart = at + 'BITMAP 5,7,1,2,0,'.length;
  assert.deepEqual([...bytes.slice(dataStart, dataStart + 2)], [0b01111111, 0b10111111]);
  assert.equal(String.fromCharCode(bytes[dataStart + 2]), '\n');
  assert.match(Buffer.from(bytes).toString('utf8'), /TEXT 1,1,"Áo"/); // dấu tiếng Việt vẫn là UTF-8
  assert.match(text, /PRINT 1,1\n$/);
});

const base: LabelObject = { id: 'o1', type: 'image', x: -20, y: -15, width: 10, height: 10, content: 'x' };
const cfg = { dpi: 203, labelWidthMm: 40, labelHeightMm: 30 };

test('Ảnh nền: ZPL/TSPL in ảnh nền trước các đối tượng; TSPL nhị phân dùng BITMAP', () => {
  const bg = { ...mono(['##', '#.']), x: 3, y: 4 };
  const zpl = convertToZPL([{ ...base, type: 'shape', shapeType: 'rect' }], { ...cfg, background: bg });
  assert.ok(zpl.indexOf('^FO3,4') > 0 && zpl.indexOf('^FO3,4') < zpl.indexOf('^GB'));
  assert.match(zpl, /\^GFA,2,2,1,C080\^FS/);
  const tsplBars = convertToTSPL([{ ...base, type: 'shape', shapeType: 'rect' }], { ...cfg, background: bg });
  assert.ok(tsplBars.indexOf('BAR 3,4,2,1') > 0 && tsplBars.indexOf('BAR 3,4,2,1') < tsplBars.indexOf('BOX'));
  const tsplBin = convertToTSPL([], { ...cfg, background: bg, binaryBitmaps: true });
  assert.match(tsplBin, /BITMAP 3,4,1,2,0,/);
  const none = convertToTSPL([], { ...cfg, background: { width: 0, height: 0, data: new Uint8Array(0), x: 0, y: 0 } });
  assert.doesNotMatch(none, /BAR|BITMAP/);
});

test('TSPL nhị phân: ảnh dither nhiều chi tiết vẫn xuất được (không bị bỏ qua như BAR)', () => {
  const w = 200, h = 100;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = (x + y) % 2;
  const out = convertToTSPL([base], { ...cfg, bitmaps: { o1: { width: w, height: h, data } }, binaryBitmaps: true });
  assert.match(out, /BITMAP 0,0,25,100,0,/);
  assert.doesNotMatch(out, /Bo qua/);
});
