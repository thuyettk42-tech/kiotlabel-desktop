/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Chuyển hình ảnh / hình khối sang dạng điểm ảnh đơn sắc để xuất lệnh máy in nhiệt (ZPL/TSPL).
// Phần "thuần" (không cần trình duyệt) nằm ở đầu file để test bằng node; phần dùng canvas nằm ở cuối.

import { LabelObject } from '../types';

/** Ảnh đơn sắc: mỗi phần tử của `data` là 1 điểm ảnh (1 = đen, 0 = trắng), theo từng hàng. */
export interface MonoBitmap {
  width: number;
  height: number;
  data: Uint8Array;
  /**
   * Vị trí góc trên-trái của ảnh tính bằng điểm (dot) từ góc trên-trái của tem. Có khi đối tượng đã được
   * dựng sẵn ở đúng chỗ (đối tượng xoay, hình nét đứt/chấm); không có thì đặt tại góc trên-trái khung đối tượng.
   */
  x?: number;
  y?: number;
}

export interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Số hình chữ nhật tối đa cho một ảnh/hình khi xuất TSPL (TSPL không có lệnh ảnh dạng văn bản an toàn). */
export const MAX_TSPL_BARS = 6000;

/** RGBA (canvas) -> đơn sắc. Điểm trong suốt coi là trắng; độ sáng dưới `threshold` là đen. */
export function monoFromRgba(rgba: ArrayLike<number>, width: number, height: number, threshold = 160): MonoBitmap {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3] / 255;
    // Trộn với nền trắng theo độ trong suốt
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
    data[i] = lum < threshold ? 1 : 0;
  }
  return { width, height, data };
}

/** Cách chuyển ảnh nhiều mức xám sang đen/trắng: tự chọn, chỉ dùng ngưỡng, hoặc khuếch tán sai số (dither). */
export type MonoMode = 'auto' | 'threshold' | 'dither';

/** Độ sáng 0..255 của từng điểm (điểm trong suốt coi là trắng). */
export function grayFromRgba(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const lum = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    gray[i] = lum * a + 255 * (1 - a);
  }
  return gray;
}

/**
 * Ảnh giống ảnh chụp (nhiều mức xám) hay hình nét/logo (chủ yếu đen và trắng)? Trong các điểm không phải nền
 * trắng, nếu hơn 30% ở vùng xám giữa thì coi là ảnh chụp. Hình nét chỉ có xám ở viền khử răng cưa nên tỉ lệ thấp.
 */
export function isPhotoLike(gray: ArrayLike<number>): boolean {
  let ink = 0;
  let mid = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i];
    if (v < 245) {
      ink++;
      if (v > 50 && v < 205) mid++;
    }
  }
  return ink > 0 && mid / ink > 0.3;
}

/** Khuếch tán sai số Floyd–Steinberg: giữ được sắc độ của ảnh chụp bằng mật độ chấm đen. */
export function monoFromGrayDither(gray: ArrayLike<number>, width: number, height: number): MonoBitmap {
  const buf = Float32Array.from(gray as ArrayLike<number>);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = buf[i];
      const black = old < 128;
      data[i] = black ? 1 : 0;
      const err = old - (black ? 0 : 255);
      if (x + 1 < width) buf[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) buf[i + width - 1] += (err * 3) / 16;
        buf[i + width] += (err * 5) / 16;
        if (x + 1 < width) buf[i + width + 1] += err / 16;
      }
    }
  }
  return { width, height, data };
}

/** Chuyển RGBA sang đen/trắng theo chế độ: `auto` dùng dither cho ảnh chụp, ngưỡng cho hình nét. */
export function monoFromRgbaMode(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  mode: MonoMode = 'auto',
  threshold = 160
): MonoBitmap {
  if (mode === 'threshold') return monoFromRgba(rgba, width, height, threshold);
  const gray = grayFromRgba(rgba, width, height);
  if (mode === 'dither' || isPhotoLike(gray)) return monoFromGrayDither(gray, width, height);
  return monoFromRgba(rgba, width, height, threshold);
}

/** Lệnh ZPL ^GFA (ASCII hex, không nén): ^GFA,tổng-byte,tổng-byte,byte-mỗi-hàng,dữ-liệu. */
export function bitmapToZplGfa(bmp: MonoBitmap): string {
  const bytesPerRow = Math.ceil(bmp.width / 8);
  const total = bytesPerRow * bmp.height;
  const lines: string[] = [];
  for (let y = 0; y < bmp.height; y++) {
    let row = '';
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < bmp.width && bmp.data[y * bmp.width + x]) byte |= 0x80 >> bit;
      }
      row += byte.toString(16).toUpperCase().padStart(2, '0');
    }
    lines.push(row);
  }
  return `^GFA,${total},${total},${bytesPerRow},${lines.join('')}`;
}

/**
 * Gộp các điểm đen thành ít hình chữ nhật nhất có thể: mỗi hàng tách thành các đoạn ngang liên tục,
 * các đoạn giống hệt nhau ở các hàng liền kề được gộp thành một hình chữ nhật cao hơn.
 */
export function bitmapToBars(bmp: MonoBitmap, offsetX = 0, offsetY = 0): Bar[] {
  const bars: Bar[] = [];
  let open = new Map<string, Bar>(); // khoá "x:w" của các hình chữ nhật còn đang kéo dài xuống hàng dưới
  for (let y = 0; y < bmp.height; y++) {
    const next = new Map<string, Bar>();
    let x = 0;
    while (x < bmp.width) {
      if (!bmp.data[y * bmp.width + x]) { x++; continue; }
      const start = x;
      while (x < bmp.width && bmp.data[y * bmp.width + x]) x++;
      const key = `${start}:${x - start}`;
      const prev = open.get(key);
      if (prev) {
        prev.h += 1;
        next.set(key, prev);
        open.delete(key);
      } else {
        const bar = { x: offsetX + start, y: offsetY + y, w: x - start, h: 1 };
        bars.push(bar);
        next.set(key, bar);
      }
    }
    open = next;
  }
  return bars;
}

/**
 * Dựng ảnh đơn sắc của hình elip (viền hoặc đặc) rộng w x h điểm, viền dày `stroke` điểm.
 * Dùng cho TSPL (không phụ thuộc lệnh CIRCLE/ELLIPSE vốn không có trên mọi dòng máy).
 */
export function ellipseBitmap(w: number, h: number, stroke: number, filled: boolean): MonoBitmap {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const data = new Uint8Array(width * height);
  const a = width / 2;
  const b = height / 2;
  const t = Math.max(1, stroke);
  const ai = Math.max(0, a - t);
  const bi = Math.max(0, b - t);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x + 0.5 - a) / a;
      const dy = (y + 0.5 - b) / b;
      if (dx * dx + dy * dy > 1) continue; // ngoài elip
      if (filled || ai <= 0 || bi <= 0) { data[y * width + x] = 1; continue; }
      const ex = (x + 0.5 - a) / ai;
      const ey = (y + 0.5 - b) / bi;
      if (ex * ex + ey * ey >= 1) data[y * width + x] = 1; // nằm ngoài elip trong => thuộc viền
    }
  }
  return { width, height, data };
}

/** Màu tô "đen" (tối, không trong suốt) thì in đặc; màu sáng/trong suốt thì bỏ qua. */
export function isDarkColor(color?: string): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (c === 'transparent' || c === 'none' || c === '') return false;
  const named: Record<string, [number, number, number]> = { black: [0, 0, 0], white: [255, 255, 255] };
  let rgb = named[c];
  if (!rgb) {
    const m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (m) {
      const h = m[1].length === 3 ? m[1].split('').map((ch) => ch + ch).join('') : m[1];
      rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    } else {
      const f = c.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\)/);
      if (!f) return false;
      if (f[4] !== undefined && parseFloat(f[4]) < 0.5) return false;
      rgb = [+f[1], +f[2], +f[3]];
    }
  }
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] < 128;
}

/** Góc xoay chuẩn hoá về [0, 360). */
export function normalizeAngle(angle?: number): number {
  const a = Number.isFinite(angle as number) ? (angle as number) : 0;
  return ((a % 360) + 360) % 360;
}

/** Đối tượng này phải được dựng thành ảnh (không có lệnh máy in gốc): xoay hoặc hình có nét đứt/chấm. */
export function needsRaster(obj: LabelObject): boolean {
  // Chữ có dấu tiếng Việt (hay mọi ký tự ngoài ASCII): dựng thành ảnh ở độ phân giải máy in để không phụ thuộc font nạp sẵn trong máy in
  if (obj.type === 'text' && /[^\x00-\x7F]/.test(`${obj.prefixText || ''}${obj.content || ''}${obj.suffixText || ''}`)) return true;
  const a = normalizeAngle(obj.angle);
  if (a > 0.01 && a < 359.99) return true;
  if (obj.type === 'shape') {
    const style = obj.shapeStrokeStyle;
    const width = obj.shapeStrokeWidth !== undefined ? obj.shapeStrokeWidth : 1;
    if ((style === 'dashed' || style === 'dotted') && width > 0) return true;
  }
  return false;
}

/** Cắt ảnh về khung chữ nhật nhỏ nhất chứa mọi điểm đen; ảnh trắng hoàn toàn thì trả về null. */
export function cropToInk(bmp: MonoBitmap, offsetX = 0, offsetY = 0): MonoBitmap | null {
  let minX = bmp.width, minY = bmp.height, maxX = -1, maxY = -1;
  for (let y = 0; y < bmp.height; y++) {
    for (let x = 0; x < bmp.width; x++) {
      if (bmp.data[y * bmp.width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = bmp.data[(minY + y) * bmp.width + (minX + x)];
  }
  return { width, height, data, x: offsetX + minX, y: offsetY + minY };
}

// ---------------------------------------------------------------------------
// Phần dùng trình duyệt (canvas): chuyển đối tượng hình ảnh thành MonoBitmap
// ---------------------------------------------------------------------------

const bitmapCache = new Map<string, MonoBitmap | null>();
const BITMAP_CACHE_LIMIT = 50;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không tải được hình ảnh'));
    img.src = src;
  });
}

/**
 * Dựng ảnh đơn sắc cho một đối tượng hình ảnh ở độ phân giải máy in (dpi).
 * Trả về null nếu không đọc được ảnh (ví dụ ảnh từ địa chỉ web chặn CORS): máy in sẽ bỏ qua đối tượng đó.
 */
export async function rasterizeImageObject(obj: LabelObject, dpi: number): Promise<MonoBitmap | null> {
  const mmToDots = dpi / 25.4;
  const w = Math.max(1, Math.round(obj.width * mmToDots));
  const h = Math.max(1, Math.round(obj.height * mmToDots));
  const fit = obj.imageFit || 'contain';
  const opacity = obj.imageOpacity !== undefined ? obj.imageOpacity : 1;
  // Khoá ngắn (độ dài + đầu + cuối) để không giữ nguyên chuỗi base64 rất dài làm khoá
  const c = obj.content;
  const mode = obj.imageMono || 'auto';
  const key = `${dpi}|${w}x${h}|${fit}|${opacity}|${mode}|${c.length}|${c.slice(0, 80)}|${c.slice(-80)}`;
  if (bitmapCache.has(key)) return bitmapCache.get(key) ?? null;

  let result: MonoBitmap | null = null;
  try {
    const img = await loadImage(obj.content);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không có canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = opacity;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (fit === 'fill') {
      ctx.drawImage(img, 0, 0, w, h);
    } else {
      const scale = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    const pixels = ctx.getImageData(0, 0, w, h).data;
    result = monoFromRgbaMode(pixels, w, h, mode);
  } catch (err) {
    console.warn('Không dựng được ảnh đơn sắc cho máy in:', err);
    result = null;
  }

  if (bitmapCache.size >= BITMAP_CACHE_LIMIT) bitmapCache.delete(bitmapCache.keys().next().value as string);
  bitmapCache.set(key, result);
  return result;
}
