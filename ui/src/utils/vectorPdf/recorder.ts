/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Ghi lại các lệnh vẽ của bộ dựng PDF vector thành MỘT DANH SÁCH LỆNH để bản desktop vẽ thẳng ra máy in thường bằng GDI (in A4/A5).
//
// Bộ dựng PDF (render.ts) gọi các hàm của trang pdf-lib (pushOperators, drawRectangle, drawSvgPath, drawText...). `RecordingPage` có cùng
// các hàm đó nhưng thay vì ghi PDF thì ghi lại lệnh theo ngữ nghĩa của luồng nội dung PDF (q, Q, cm, m, l, c, h, re, f, S, B, W, n, rg, RG, w, d, J...)
// cộng hai lệnh riêng: chữ (T) và ảnh (I). Nhờ vậy bố cục, ngắt chữ, mã vạch, QR... chỉ tính MỘT lần (ở render.ts) và bản in giống bản PDF.
// Hình học của hình chữ nhật/elip/đường/đường dẫn do chính pdf-lib sinh ra (gọi trên một trang giả) nên không phải viết lại.

import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import type { FontKey } from './textLayout';

export type Op = Array<number | string | number[]>;

export interface SheetJobPage {
  /** Khổ trang (mm), kể cả hướng ngang/dọc đã áp dụng. */
  wMm: number;
  hMm: number;
  ops: Op[];
}

export interface SheetJob {
  version: 1;
  pages: SheetJobPage[];
  /** Ảnh đã trộn nền trắng, RGB 8 bit, mã hóa base64 (khóa là chuỗi trong lệnh I). */
  images: Record<string, { w: number; h: number; rgb: string }>;
  warnings: string[];
}

export interface RecImage {
  id: number;
  width: number;
  height: number;
  el: HTMLImageElement;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const FAMILY_CODE: Record<FontKey['family'], number> = { sans: 0, serif: 1, mono: 2 };
// Chỉ giữ các lệnh đồ họa/đường dẫn của PDF; bỏ lệnh trạng thái đồ họa mở rộng (gs: độ trong suốt đã được trộn sẵn với nền trắng)
const KEEP = new Set(['q', 'Q', 'cm', 'm', 'l', 'c', 'v', 'y', 'h', 're', 'f', 'F', 'f*', 'S', 's', 'B', 'B*', 'b', 'b*', 'n', 'W', 'W*', 'w', 'J', 'j', 'M', 'd', 'rg', 'RG', 'g', 'G']);

function argValue(a: any): number | string | number[] {
  if (a && typeof a.asNumber === 'function') return r4(a.asNumber());
  // PDFArray (mẫu nét đứt của lệnh d): size() và get(i)
  if (a && typeof a.size === 'function' && typeof a.get === 'function') return Array.from({ length: a.size() }, (_, i) => { const x = a.get(i); return x && typeof x.asNumber === 'function' ? r4(x.asNumber()) : 0; });
  // Mẫu nét đứt của lệnh d do pdf-lib sinh ra dạng chuỗi "[3 2]"
  if (typeof a === 'string' && /^\[[\d.\s-]*\]$/.test(a)) return a.slice(1, -1).trim().split(/\s+/).filter(Boolean).map((v) => r4(parseFloat(v)));
  return String(a);
}

/** Trộn một màu RGB của pdf-lib với nền trắng theo độ mờ (in lên giấy trắng nên không cần kênh alpha). */
function blendWhite(c: any, alpha: number): any {
  if (!c || c.type !== 'RGB' || alpha >= 1) return c;
  const mix = (v: number) => 1 - (1 - v) * alpha;
  return { ...c, red: mix(c.red), green: mix(c.green), blue: mix(c.blue) };
}

function flat<T extends Record<string, any>>(o: T): T {
  const out: Record<string, any> = { ...o };
  if (typeof out.opacity === 'number') { if ('color' in out) out.color = blendWhite(out.color, out.opacity); delete out.opacity; }
  if (typeof out.borderOpacity === 'number') { if ('borderColor' in out) out.borderColor = blendWhite(out.borderColor, out.borderOpacity); delete out.borderOpacity; }
  return out as T;
}

/** Kho ảnh cho chế độ ghi lệnh: tải ảnh bằng trình duyệt và xuất RGB đã trộn nền trắng, thu nhỏ nếu quá lớn. */
export class RecImagePool {
  private cache = new Map<string, Promise<RecImage | null>>();
  private nextId = 1;
  private rgbCache = new Map<string, { w: number; h: number; rgb: string }>();
  readonly maxSide: number;
  constructor(maxSide = 1600) { this.maxSide = maxSide; }

  get(content: string): Promise<RecImage | null> {
    const key = `${content.length}|${content.slice(0, 60)}|${content.slice(-60)}`;
    let p = this.cache.get(key);
    if (!p) {
      p = new Promise<RecImage | null>((resolve) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve({ id: this.nextId++, width: el.naturalWidth || el.width || 1, height: el.naturalHeight || el.height || 1, el });
        el.onerror = () => resolve(null);
        el.src = content;
      });
      this.cache.set(key, p);
    }
    return p;
  }

  /** Trả về khóa ảnh (đã trộn độ mờ vào nền trắng) và nhớ lại để không tính lại. */
  rgbKey(img: RecImage, opacity: number): string {
    const key = `i${img.id}_${Math.round(opacity * 100)}`;
    if (this.rgbCache.has(key)) return key;
    const k = Math.min(1, this.maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * k));
    const h = Math.max(1, Math.round(img.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
    ctx.drawImage(img.el, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2]; }
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < rgb.length; i += CH) bin += String.fromCharCode(...rgb.subarray(i, i + CH));
    this.rgbCache.set(key, { w, h, rgb: btoa(bin) });
    return key;
  }

  export(): SheetJob['images'] {
    return Object.fromEntries(this.rgbCache);
  }
}

/** Mục tiêu ghi chung: một trang pdf-lib giả để pdf-lib tự sinh lệnh cho hình chữ nhật/elip/đường/đường dẫn. */
export class Recorder {
  readonly dummy: PDFPage;
  target: Op[] = [];
  private readonly stream = { push: (...ops: any[]) => this.add(ops) };

  constructor(doc: PDFDocument, readonly images: RecImagePool, readonly keyOf: (font: PDFFont) => FontKey) {
    this.dummy = doc.addPage();
    (this.dummy as any).getContentStream = () => this.stream;
  }

  add(ops: any[]) {
    for (const op of ops) {
      const name: string = (op as any).name;
      if (!KEEP.has(name)) continue;
      const args: any[] = (op as any).args || [];
      const vals = args.map(argValue);
      // Bỏ phép biến đổi đơn vị (pdf-lib sinh nhiều lệnh cm 1 0 0 1 0 0): nhỏ gọn danh sách lệnh, không đổi kết quả vẽ
      if (name === 'cm' && vals.length === 6 && vals[0] === 1 && vals[1] === 0 && vals[2] === 0 && vals[3] === 1 && vals[4] === 0 && vals[5] === 0) continue;
      this.target.push([name, ...vals] as Op);
    }
  }

  newPage(): RecordingPage {
    return new RecordingPage(this);
  }
}

export class RecordingPage {
  readonly ops: Op[] = [];
  font: PDFFont | undefined;
  fontKey: unknown;

  constructor(private readonly rec: Recorder) {}

  private within<T>(fn: () => T): T {
    this.rec.target = this.ops;
    return fn();
  }

  pushOperators(...operators: any[]) { this.within(() => this.rec.add(operators)); }
  setFont(font: PDFFont) { this.font = font; this.fontKey = 'F'; }

  drawRectangle(o: any) { this.within(() => this.rec.dummy.drawRectangle(flat(o))); }
  drawEllipse(o: any) { this.within(() => this.rec.dummy.drawEllipse(flat(o))); }
  drawLine(o: any) { this.within(() => this.rec.dummy.drawLine(flat(o))); }
  drawSvgPath(path: string, o: any) { this.within(() => this.rec.dummy.drawSvgPath(path, flat(o))); }

  /** Chữ: lệnh T = [T, họ font (0 sans, 1 serif, 2 mono), cờ (1 đậm, 2 nghiêng), cỡ, x, y(đường cơ sở), chữ, r, g, b]. */
  drawText(text: string, o: { x: number; y: number; size: number; color?: any; opacity?: number }) {
    if (!this.font) return;
    const k = this.rec.keyOf(this.font);
    const c = blendWhite(o.color, o.opacity ?? 1) || { red: 0, green: 0, blue: 0 };
    this.ops.push(['T', FAMILY_CODE[k.family], (k.bold ? 1 : 0) | (k.italic ? 2 : 0), r4(o.size), r4(o.x), r4(o.y), text, r4(c.red ?? 0), r4(c.green ?? 0), r4(c.blue ?? 0)]);
  }

  /** Ảnh: lệnh I = [I, khóa ảnh, x, y, rộng, cao] trong hệ toạ độ hiện tại (góc dưới-trái, y lên). */
  drawImage(img: RecImage, o: { x: number; y: number; width: number; height: number; opacity?: number }) {
    const key = this.rec.images.rgbKey(img, o.opacity ?? 1);
    this.ops.push(['I', key, r4(o.x), r4(o.y), r4(o.width), r4(o.height)]);
  }
}

export type { PDFPage };
