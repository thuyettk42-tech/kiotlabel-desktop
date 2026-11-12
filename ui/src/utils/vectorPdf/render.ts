/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Dựng PDF VECTOR cho tem: chữ là chữ thật (font nhúng), mã vạch/QR/hình khối là nét vẽ, ảnh nhúng nguyên bản.
// Không chụp DOM nên không bị ảnh hưởng bởi cỡ chữ tối thiểu của trình trình duyệt, nhanh và nét ở mọi độ phân giải.
// Bố cục mô phỏng LabelCanvas: toạ độ lưu theo mm từ TÂM tem; đối tượng quay quanh tâm khung (văn bản dịch theo điểm neo
// trước khi quay); chữ cao dòng 1,25; mã vạch kéo giãn kín bề rộng khung; QR vuông nằm trong khung với lề 2 px.

import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import {
  PDFDocument, PDFFont, PDFImage, PDFPage, rgb, Color,
  pushGraphicsState, popGraphicsState, translate, rotateDegrees, scale, moveTo, lineTo, closePath, clip, endPath
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { LabelConfig, LabelObject, SheetLayoutConfig } from '../../types';
import { formatLabelText } from '../../components/LabelCanvas';
import { processBarcodeContent } from '../../components/BarcodeRenderer';
import { anchorMultipliers, usesAnchor } from '../../utils';
import { buildPages, PageSpec } from './pages';
import { layoutSegments, TextSeg, FontKey, Measurer, LINE_HEIGHT } from './textLayout';
import { fontKeyOf, fontKeyId, loadFontBytes } from './fonts';
import { Recorder, RecImagePool, SheetJob } from './recorder';

const MM = 72 / 25.4; // điểm PDF trên mỗi mm
const PT_TO_MM = 0.3528; // 1 pt = 0,3528 mm (giống bàn thiết kế)
// Các kích thước tính bằng px trong giao diện (lề ảnh QR, lề chữ mã vạch, độ dày viền tem) quy ra mm theo tỉ lệ thiết kế mặc định
// của bàn thiết kế (8,4915 px/mm); bản chụp ảnh dùng 11,811 px/mm nên các lề này chênh khoảng 0,07 mm.
const CSS_PX_MM = 1 / 8.4915;

// Độ trong suốt chỉ truyền cho pdf-lib khi < 1: mỗi giá trị truyền vào tạo thêm một ExtGState và một lệnh `gs` cho từng nét vẽ
// (làm trang nặng gấp đôi), trong khi 1 là mặc định.
const op = (a: number): number | undefined => (a < 1 ? a : undefined);

export interface VectorPdfInput {
  labelConfig: LabelConfig;
  sheetConfig: SheetLayoutConfig;
  totalItems: number;
  /** Các đối tượng của tem thứ `index` (đã thay dữ liệu Excel). */
  getObjects: (index: number) => LabelObject[];
  /** Đối tượng mẫu (để biết cần nạp font nào trước). */
  templateObjects: LabelObject[];
  includeBackground: boolean;
  title: string;
  subject?: string;
  keywords?: string;
  fontBaseUrl?: string;
  onProgress?: (done: number, total: number) => void;
}

export interface VectorPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Màu
// ---------------------------------------------------------------------------
const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128]
};

export function parseColor(css: string | undefined, fallback = '#000000'): { color: Color; alpha: number; none: boolean } {
  const c = (css || fallback).trim().toLowerCase();
  if (c === 'transparent' || c === 'none') return { color: rgb(0, 0, 0), alpha: 0, none: true };
  let r = 0, g = 0, b = 0, a = 1;
  let m: RegExpMatchArray | null;
  if (NAMED[c]) [r, g, b] = NAMED[c];
  else if ((m = c.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/))) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((ch) => ch + ch).join('');
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else if ((m = c.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)/))) {
    r = +m[1]; g = +m[2]; b = +m[3];
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  } else if (fallback !== c) {
    return parseColor(fallback, '#000000');
  }
  return { color: rgb(r / 255, g / 255, b / 255), alpha: a, none: false };
}

// ---------------------------------------------------------------------------
// Font
// ---------------------------------------------------------------------------
class FontPool {
  private fonts = new Map<string, PDFFont>();
  private keys = new Map<PDFFont, FontKey>();
  constructor(private doc: PDFDocument, private baseUrl?: string) {}

  async need(keys: FontKey[]) {
    const wanted = new Map<string, FontKey>();
    const all = keys.length ? keys : [{ family: 'sans', bold: false, italic: false } as FontKey];
    for (const k of all) wanted.set(fontKeyId(k), k);
    await Promise.all([...wanted.entries()].map(async ([id, k]) => {
      if (this.fonts.has(id)) return;
      const bytes = await loadFontBytes(k, this.baseUrl);
      // Nhúng nguyên font (không subset): tuỳ chọn subset của pdf-lib làm mất chữ trên nhiều trình xem PDF.
      // Font đã được cắt sẵn còn Latin + tiếng Việt nên mỗi font chỉ khoảng 75-125 KB.
      const font = await this.doc.embedFont(bytes, { subset: false });
      this.fonts.set(id, font);
      this.keys.set(font, k);
    }));
  }

  keyOfFont(font: PDFFont): FontKey {
    return this.keys.get(font) || { family: 'sans', bold: false, italic: false };
  }

  get(k: FontKey): PDFFont {
    return this.fonts.get(fontKeyId(k)) || (this.fonts.values().next().value as PDFFont);
  }

  measurer(): Measurer {
    const metric = (k: FontKey) => (this.get(k) as any).embedder.font as { ascent: number; descent: number; unitsPerEm: number };
    return {
      width: (text, k, size) => this.get(k).widthOfTextAtSize(text, size),
      ascent: (k) => { const f = metric(k); return f.ascent / f.unitsPerEm; },
      descent: (k) => { const f = metric(k); return -f.descent / f.unitsPerEm; }
    };
  }
}

// ---------------------------------------------------------------------------
// Ảnh
// ---------------------------------------------------------------------------
function dataUrlBytes(url: string): { bytes: Uint8Array; mime: string } | null {
  const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) return null;
  const mime = m[1] || '';
  if (m[2]) {
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime };
}

async function canvasToPng(src: string, maxSide: number): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Không tải được hình ảnh'));
    el.src = src;
  });
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const k = Math.min(1, maxSide / Math.max(iw, ih));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(iw * k));
  canvas.height = Math.max(1, Math.round(ih * k));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không mã hoá được ảnh'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

class ImagePool {
  private cache = new Map<string, Promise<PDFImage | null>>();
  constructor(private doc: PDFDocument) {}

  get(content: string): Promise<PDFImage | null> {
    const key = `${content.length}|${content.slice(0, 60)}|${content.slice(-60)}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this.load(content).catch((e) => { console.warn('PDF vector: bỏ qua hình ảnh', e); return null; });
      this.cache.set(key, p);
    }
    return p;
  }

  private async load(content: string): Promise<PDFImage> {
    const data = dataUrlBytes(content);
    if (data) {
      const b = data.bytes;
      const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
      const isJpg = b[0] === 0xff && b[1] === 0xd8;
      // Ảnh rất lớn thì thu nhỏ để PDF không phình to
      if (isPng && b.length < 3_000_000) return this.doc.embedPng(b);
      if (isJpg && b.length < 3_000_000) return this.doc.embedJpg(b);
    }
    return this.doc.embedPng(await canvasToPng(content, 2400));
  }
}

// ---------------------------------------------------------------------------
// Vẽ
// ---------------------------------------------------------------------------
interface Ctx {
  doc: PDFDocument;
  fonts: FontPool;
  images: { get(content: string): Promise<any | null> };
  measure: Measurer;
  warnings: Set<string>;
}

/** Khung toạ độ cục bộ: gốc ở TÂM khung đối tượng, đơn vị mm, trục y hướng LÊN. */
function withFrame(page: PDFPage, cxPt: number, cyPt: number, angleDeg: number, shiftXmm: number, shiftYmm: number, fn: () => void | Promise<void>) {
  page.pushOperators(
    pushGraphicsState(),
    translate(cxPt, cyPt),
    rotateDegrees(-angleDeg),
    translate(shiftXmm * MM, shiftYmm * MM),
    scale(MM, MM)
  );
  const r = fn();
  const finish = () => page.pushOperators(popGraphicsState());
  if (r && typeof (r as Promise<void>).then === 'function') return (r as Promise<void>).then(finish);
  finish();
  return undefined;
}

function clipRect(page: PDFPage, x: number, y: number, w: number, h: number) {
  page.pushOperators(moveTo(x, y), lineTo(x + w, y), lineTo(x + w, y + h), lineTo(x, y + h), closePath(), clip(), endPath());
}

function roundedRectPath(w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) return `M0,0 H${w} V${h} H0 Z`;
  return `M${rr},0 H${w - rr} A${rr},${rr} 0 0 1 ${w},${rr} V${h - rr} A${rr},${rr} 0 0 1 ${w - rr},${h} H${rr} A${rr},${rr} 0 0 1 0,${h - rr} V${rr} A${rr},${rr} 0 0 1 ${rr},0 Z`;
}

/** Hình chữ nhật (có thể bo góc) với đỉnh trên-trái tại (x, yTop), tô và/hoặc viền nằm TRONG khung (border-box). */
function drawBox(
  page: PDFPage, x: number, yTop: number, w: number, h: number,
  opts: { radius?: number; fill?: string; stroke?: string; strokeW?: number; dash?: number[]; ellipse?: boolean }
) {
  const fill = opts.fill ? parseColor(opts.fill) : null;
  const strokeW = opts.strokeW || 0;
  const stroke = strokeW > 0 && opts.stroke ? parseColor(opts.stroke) : null;
  if (opts.ellipse) {
    if (fill && !fill.none) page.drawEllipse({ x: x + w / 2, y: yTop - h / 2, xScale: w / 2, yScale: h / 2, color: fill.color, opacity: op(fill.alpha) });
    if (stroke && !stroke.none) {
      page.drawEllipse({
        x: x + w / 2, y: yTop - h / 2, xScale: Math.max(0.01, w / 2 - strokeW / 2), yScale: Math.max(0.01, h / 2 - strokeW / 2),
        borderColor: stroke.color, borderWidth: strokeW, borderOpacity: op(stroke.alpha), borderDashArray: opts.dash
      });
    }
    return;
  }
  const r = opts.radius || 0;
  if (fill && !fill.none) {
    if (r > 0) page.drawSvgPath(roundedRectPath(w, h, r), { x, y: yTop, color: fill.color, opacity: op(fill.alpha) });
    else page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: fill.color, opacity: op(fill.alpha) });
  }
  if (stroke && !stroke.none) {
    const half = strokeW / 2;
    if (r > 0) {
      page.drawSvgPath(roundedRectPath(Math.max(0.01, w - strokeW), Math.max(0.01, h - strokeW), Math.max(0, r - half)), {
        x: x + half, y: yTop - half, borderColor: stroke.color, borderWidth: strokeW, borderOpacity: op(stroke.alpha), borderDashArray: opts.dash
      });
    } else {
      page.drawRectangle({
        x: x + half, y: yTop - h + half, width: Math.max(0.01, w - strokeW), height: Math.max(0.01, h - strokeW),
        borderColor: stroke.color, borderWidth: strokeW, borderOpacity: op(stroke.alpha), borderDashArray: opts.dash
      });
    }
  }
}

/** Nét đứt/chấm của trình duyệt (Chromium): đứt: dài 3 lần, hở 2 lần độ dày (nét dưới 3 px); chấm: dài = hở = độ dày. */
function dashFor(style: string | undefined, t: number): number[] | undefined {
  if (style === 'dashed') return t >= 3 * CSS_PX_MM ? [t * 2, t] : [t * 3, t * 2];
  if (style === 'dotted') return [t, t];
  return undefined;
}

// pdf-lib tạo một mục tài nguyên font MỚI trên trang cho mỗi lần gọi drawText có truyền `font` (khoảng 50 mục mỗi tem).
// Ở đây mỗi (trang, font) chỉ đăng ký một lần rồi dùng lại khóa đó.
const pageFontKeys = new WeakMap<PDFPage, Map<PDFFont, unknown>>();
function drawTextRun(page: PDFPage, font: PDFFont, text: string, opts: { x: number; y: number; size: number; color: Color; opacity?: number }) {
  let keys = pageFontKeys.get(page);
  if (!keys) { keys = new Map(); pageFontKeys.set(page, keys); }
  const p = page as any;
  const known = keys.get(font);
  if (known) {
    p.font = font;
    p.fontKey = known;
  } else {
    page.setFont(font);
    keys.set(font, p.fontKey);
  }
  page.drawText(text, opts);
}

// --- văn bản ---------------------------------------------------------------
function drawTextObject(page: PDFPage, obj: LabelObject, ctx: Ctx) {
  const W = obj.width;
  const H = obj.height;
  const origin = obj.textFlowOrigin || 'center';
  const align = obj.textAlign || 'left';
  const mkSeg = (
    text: string, size?: number, family?: string, weight?: string, style?: string,
    underline?: boolean, strike?: boolean, shift?: TextSeg['shift'], color?: string
  ): TextSeg => ({
    text,
    size: (size || obj.fontSize || 10) * PT_TO_MM,
    font: fontKeyOf(family || obj.fontFamily, weight, style),
    color: color || obj.color || '#000000',
    underline, strike, shift
  });
  const segs: TextSeg[] = [];
  if (obj.prefixText) segs.push(mkSeg(obj.prefixText, obj.prefixFontSize, obj.prefixFontFamily, obj.prefixFontWeight, obj.prefixFontStyle, obj.prefixTextDecorationUnderline, obj.prefixTextDecorationLineThrough, obj.prefixTextSuperSub, obj.prefixColor));
  segs.push(mkSeg(formatLabelText(obj), obj.fontSize, obj.fontFamily, obj.fontWeight, obj.fontStyle, obj.textDecorationUnderline, obj.textDecorationLineThrough, obj.textSuperSub, obj.color));
  if (obj.suffixText) segs.push(mkSeg(obj.suffixText, obj.suffixFontSize, obj.suffixFontFamily, obj.suffixFontWeight, obj.suffixFontStyle, obj.suffixTextDecorationUnderline, obj.suffixTextDecorationLineThrough, obj.suffixTextSuperSub, obj.suffixColor));

  const mainLine = (obj.fontSize || 10) * PT_TO_MM * LINE_HEIGHT;
  const maxLines = Math.max(1, Math.floor(H / mainLine));
  const lines = layoutSegments(segs, W, ctx.measure, maxLines);
  const blockH = lines.reduce((n, l) => n + l.height, 0);
  const vStart = origin.startsWith('top') ? 0 : origin.startsWith('bottom') ? H - blockH : (H - blockH) / 2;

  clipRect(page, -W / 2, -H / 2, W, H);
  let top = vStart;
  for (const line of lines) {
    let x = align === 'center' ? -line.width / 2 : align === 'right' ? W / 2 - line.width : -W / 2;
    const baselineW = H / 2 - (top + line.baseline); // trục y hướng lên, gốc ở tâm khung
    for (const run of line.runs) {
      if (run.text.trim() === '' && run.text.length === 0) continue;
      const col = parseColor(run.seg.color);
      const y = baselineW + run.lift;
      if (!col.none && run.text.length > 0) {
        drawTextRun(page, ctx.fonts.get(run.seg.font), run.text, { x, y, size: run.size, color: col.color, opacity: op(col.alpha) });
        const t = Math.max(0.05, run.size * 0.06);
        if (run.seg.underline) page.drawRectangle({ x, y: y - run.size * 0.12 - t, width: run.width, height: t, color: col.color, opacity: op(col.alpha) });
        if (run.seg.strike) page.drawRectangle({ x, y: y + run.size * 0.28, width: run.width, height: t, color: col.color, opacity: op(col.alpha) });
      }
      x += run.width;
    }
    top += line.height;
  }
}

// --- mã vạch ---------------------------------------------------------------
function drawBarcodeObject(page: PDFPage, obj: LabelObject, ctx: Ctx) {
  const W = obj.width;
  const H = obj.height;
  const format = obj.barcodeFormat === 'EAN13' ? 'EAN13' : obj.barcodeFormat === 'CODE39' ? 'CODE39' : 'CODE128';
  const validation = processBarcodeContent(obj.content || '', format);
  if (!validation.valid || !validation.encodedContent) {
    ctx.warnings.add(`Mã vạch "${obj.content}" không hợp lệ (${validation.error || 'dữ liệu trống'}), bị bỏ qua trong PDF.`);
    return;
  }
  const holder: any = {};
  try {
    JsBarcode(holder, validation.encodedContent, { format, margin: 0, displayValue: false });
  } catch {
    ctx.warnings.add(`Không mã hoá được mã vạch "${obj.content}" theo chuẩn ${format}, bị bỏ qua trong PDF.`);
    return;
  }
  const bits: string = (holder.encodings as Array<{ data: string }>).map((e) => e.data).join('');
  const color = parseColor(obj.color || '#000000');
  const showAbove = !!obj.barcodeShowTextAbove;
  const showBelow = obj.barcodeShowTextBelow ?? obj.displayValue ?? true;
  const fontPt = obj.barcodeFontSize ?? obj.fontSize ?? 7;
  const textSize = fontPt * PT_TO_MM;
  const margin = obj.barcodeTextMargin !== undefined ? obj.barcodeTextMargin : 0.5;
  const textBlock = textSize * LINE_HEIGHT + margin;
  const textTotal = (showAbove ? textBlock : 0) + (showBelow ? textBlock : 0);
  const barsH = Math.max(0.5, H - textTotal - 1 * CSS_PX_MM);
  const origin = obj.textFlowOrigin || 'center';
  const textAlign = origin.endsWith('left') ? 'left' : origin.endsWith('right') ? 'right' : 'center';
  const font: FontKey = fontKeyOf(obj.barcodeFontFamily === 'sans' ? undefined : obj.barcodeFontFamily, obj.barcodeFontWeight, obj.barcodeFontStyle);
  const textColor = parseColor(obj.barcodeTextColor || obj.color || '#000000');

  const drawLabel = (vTop: number) => {
    const text = validation.encodedContent || obj.content;
    const asc = ctx.measure.ascent(font) * textSize;
    const desc = ctx.measure.descent(font) * textSize;
    const lineH = textSize * LINE_HEIGHT;
    const baseline = (lineH - (asc + desc)) / 2 + asc;
    const w = ctx.measure.width(text, font, textSize);
    const pad = 2 * CSS_PX_MM; // px-0.5
    const x = textAlign === 'center' ? -w / 2 : textAlign === 'right' ? W / 2 - pad - w : -W / 2 + pad;
    if (!textColor.none) drawTextRun(page, ctx.fonts.get(font), text, { x, y: H / 2 - (vTop + baseline), size: textSize, color: textColor.color, opacity: op(textColor.alpha) });
  };

  let v = 0;
  if (showAbove) { drawLabel(v); v += textSize * LINE_HEIGHT + margin; }
  // Vạch: kéo giãn kín bề rộng khung (preserveAspectRatio="none")
  const n = bits.length;
  const mod = W / n;
  const yTop = H / 2 - v;
  if (!color.none) {
    // Gộp mọi vạch thành MỘT đường dẫn (nhẹ hơn nhiều so với một hình chữ nhật cho mỗi vạch và không hở khe giữa các vạch)
    let d = '';
    let i = 0;
    while (i < n) {
      if (bits[i] !== '1') { i++; continue; }
      let j = i;
      while (j < n && bits[j] === '1') j++;
      const bw = ((j - i) * mod).toFixed(4);
      d += `M${(i * mod).toFixed(4)},0h${bw}v${barsH.toFixed(4)}h-${bw}z`;
      i = j;
    }
    if (d) page.drawSvgPath(d, { x: -W / 2, y: yTop, color: color.color, opacity: op(color.alpha) });
  }
  v += barsH;
  if (showBelow) { v += margin; drawLabel(v); }
}

// --- QR --------------------------------------------------------------------
function drawQrObject(page: PDFPage, obj: LabelObject, ctx: Ctx) {
  const W = obj.width;
  const H = obj.height;
  const content = (obj.content || '').trim();
  if (!content) return;
  const level = (obj.qrErrorCorrection || 'H') as 'L' | 'M' | 'Q' | 'H';
  let qr: any;
  try {
    qr = (QRCode as any).create(content, { errorCorrectionLevel: level });
  } catch {
    ctx.warnings.add(`Nội dung QR quá dài (${content.length} ký tự), bị bỏ qua trong PDF.`);
    return;
  }
  const size = qr.modules.size as number;
  const pad = 2 * CSS_PX_MM; // p-0.5
  const side = Math.max(0.1, Math.min(W - 2 * pad, H - 2 * pad));
  const origin = obj.textFlowOrigin || 'center';
  const left = origin.endsWith('left') ? -W / 2 + pad : origin.endsWith('right') ? W / 2 - pad - side : -side / 2;
  const top = origin.startsWith('top') ? H / 2 - pad : origin.startsWith('bottom') ? -H / 2 + pad + side : side / 2;
  const color = parseColor(obj.color || '#000000');
  // Ảnh QR của bàn thiết kế có nền trắng đặc
  page.drawRectangle({ x: left, y: top - side, width: side, height: side, color: rgb(1, 1, 1) });
  if (color.none) return;
  const cell = side / size;
  // Gộp toàn bộ ô đen thành MỘT đường dẫn để không bị khe trắng giữa các ô khi trình xem PDF khử răng cưa
  let d = '';
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!qr.modules.get(r, c)) { c++; continue; }
      let e = c;
      while (e < size && qr.modules.get(r, e)) e++;
      d += `M${(c * cell).toFixed(4)},${(r * cell).toFixed(4)}h${((e - c) * cell).toFixed(4)}v${cell.toFixed(4)}h-${((e - c) * cell).toFixed(4)}z`;
      c = e;
    }
  }
  if (d) page.drawSvgPath(d, { x: left, y: top, color: color.color, opacity: op(color.alpha) });
}

// --- hình ảnh --------------------------------------------------------------
async function drawImageInBox(page: PDFPage, img: PDFImage, x: number, yTop: number, w: number, h: number, fit: string, opacity: number) {
  const iw = img.width;
  const ih = img.height;
  clipRect(page, x, yTop - h, w, h);
  if (fit === 'fill') {
    page.drawImage(img, { x, y: yTop - h, width: w, height: h, opacity: op(opacity) });
    return;
  }
  const k = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * k;
  const dh = ih * k;
  page.drawImage(img, { x: x + (w - dw) / 2, y: yTop - h + (h - dh) / 2, width: dw, height: dh, opacity: op(opacity) });
}

async function drawImageObject(page: PDFPage, obj: LabelObject, ctx: Ctx) {
  if (!obj.content) return;
  const img = await ctx.images.get(obj.content);
  if (!img) { ctx.warnings.add('Có hình ảnh không đọc được (ví dụ ảnh từ địa chỉ web chặn truy cập), bị bỏ qua trong PDF.'); return; }
  await drawImageInBox(page, img, -obj.width / 2, obj.height / 2, obj.width, obj.height, obj.imageFit || 'contain', obj.imageOpacity !== undefined ? obj.imageOpacity : 1);
}

// --- hình khối -------------------------------------------------------------
function drawShapeObject(page: PDFPage, obj: LabelObject) {
  const W = obj.width;
  const H = obj.height;
  const type = obj.shapeType || 'rect';
  const t = Math.max(0, obj.shapeStrokeWidth !== undefined ? obj.shapeStrokeWidth : 1);
  const stroke = obj.shapeStrokeColor || '#000000';
  const dash = dashFor(obj.shapeStrokeStyle, t);
  if (type === 'line') {
    const c = parseColor(stroke);
    if (t > 0 && !c.none) page.drawLine({ start: { x: -W / 2, y: 0 }, end: { x: W / 2, y: 0 }, thickness: t, color: c.color, opacity: op(c.alpha), dashArray: dash });
    return;
  }
  drawBox(page, -W / 2, H / 2, W, H, {
    fill: obj.shapeFillColor || 'transparent', stroke, strokeW: t, dash,
    radius: (obj.shapeCornerRadius || 0), ellipse: type === 'circle' || type === 'oval'
  });
}

// --- ảnh nền ---------------------------------------------------------------
async function drawBackground(page: PDFPage, x: number, yTop: number, w: number, h: number, cfg: LabelConfig, ctx: Ctx) {
  if (!cfg.bgImage) return;
  const img = await ctx.images.get(cfg.bgImage);
  if (!img) { ctx.warnings.add('Ảnh nền tem không đọc được, bị bỏ qua trong PDF.'); return; }
  const opacity = cfg.bgImageOpacity !== undefined ? cfg.bgImageOpacity : 0.3;
  const size = cfg.bgImageSize || 'contain';
  page.pushOperators(pushGraphicsState());
  clipRect(page, x, yTop - h, w, h);
  if (size === 'contain' || size === 'cover') {
    await drawImageInBox(page, img, x, yTop, w, h, size, opacity);
  } else {
    // Kích thước tự nhiên: 1 px CSS = 1/96 inch; căn giữa; "repeat" lát gạch bắt đầu từ ô ở giữa
    const tw = img.width * CSS_PX_MM;
    const th = img.height * CSS_PX_MM;
    if (size === 'auto') {
      page.drawImage(img, { x: x + (w - tw) / 2, y: yTop - h + (h - th) / 2, width: tw, height: th, opacity: op(opacity) });
    } else {
      const sx = ((((w - tw) / 2) % tw) + tw) % tw - tw;
      const sy = ((((h - th) / 2) % th) + th) % th - th;
      for (let yy = sy; yy < h; yy += th) for (let xx = sx; xx < w; xx += tw) page.drawImage(img, { x: x + xx, y: yTop - yy - th, width: tw, height: th, opacity: op(opacity) });
    }
  }
  page.pushOperators(popGraphicsState());
}

// ---------------------------------------------------------------------------
// Tem và trang
// ---------------------------------------------------------------------------
async function drawLabelCell(
  page: PDFPage, pageHeightPt: number, cellX: number, cellY: number,
  objs: LabelObject[], cfg: LabelConfig, sheet: SheetLayoutConfig, includeBg: boolean, ctx: Ctx
) {
  const LW = cfg.width;
  const LH = cfg.height;
  const x0Pt = cellX * MM;
  const yTopPt = pageHeightPt - cellY * MM;
  const borderW = sheet.showBorder ? Math.max(0, sheet.borderWidth || 0) * CSS_PX_MM : 0;
  const radius = Math.max(0, sheet.borderRadius || 0);

  // Nền tem + ảnh nền + viền, vẽ trong khung toạ độ mm (gốc ở góc trên-trái tem, y lên)
  page.pushOperators(pushGraphicsState(), translate(x0Pt, yTopPt), scale(MM, MM));
  drawBox(page, 0, 0, LW, LH, { radius, fill: cfg.bgColor || '#ffffff' });
  if (includeBg && cfg.bgImage && cfg.bgImagePrint !== false) {
    await drawBackground(page, borderW, -borderW, LW - 2 * borderW, LH - 2 * borderW, { ...cfg }, ctx);
  }
  page.pushOperators(popGraphicsState());

  for (const obj of objs) {
    const W = obj.width;
    const H = obj.height;
    const angle = obj.angle || 0;
    const anchorX = LW / 2 + obj.x;
    const anchorY = LH / 2 + obj.y;
    const cx = x0Pt + (anchorX + W / 2) * MM;
    const cy = yTopPt - (anchorY + H / 2) * MM;
    const { mx, my } = usesAnchor(obj) ? anchorMultipliers(obj.textFlowOrigin) : { mx: 0, my: 0 };
    const draw = async () => {
      switch (obj.type) {
        case 'text': drawTextObject(page, obj, ctx); break;
        case 'barcode': drawBarcodeObject(page, obj, ctx); break;
        case 'qrcode': drawQrObject(page, obj, ctx); break;
        case 'image': await drawImageObject(page, obj, ctx); break;
        case 'shape': drawShapeObject(page, obj); break;
      }
    };
    await withFrame(page, cx, cy, angle, -mx * W, my * H, draw);
  }

  // Viền tem vẽ sau cùng (nằm trên ảnh nền, dưới các đối tượng không đáng kể)
  if (borderW > 0) {
    page.pushOperators(pushGraphicsState(), translate(x0Pt, yTopPt), scale(MM, MM));
    drawBox(page, 0, 0, LW, LH, { radius, stroke: sheet.borderColor || '#9ca3af', strokeW: borderW });
    page.pushOperators(popGraphicsState());
  }
}

function collectFontKeys(objs: LabelObject[]): FontKey[] {
  const keys: FontKey[] = [];
  for (const o of objs) {
    if (o.type === 'text') {
      keys.push(fontKeyOf(o.fontFamily, o.fontWeight, o.fontStyle));
      if (o.prefixText) keys.push(fontKeyOf(o.prefixFontFamily || o.fontFamily, o.prefixFontWeight, o.prefixFontStyle));
      if (o.suffixText) keys.push(fontKeyOf(o.suffixFontFamily || o.fontFamily, o.suffixFontWeight, o.suffixFontStyle));
    } else if (o.type === 'barcode') {
      keys.push(fontKeyOf(o.barcodeFontFamily === 'sans' ? undefined : o.barcodeFontFamily, o.barcodeFontWeight, o.barcodeFontStyle));
    }
  }
  return keys;
}

export async function buildVectorPdf(input: VectorPdfInput): Promise<VectorPdfResult> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = new FontPool(doc, input.fontBaseUrl);
  await fonts.need(collectFontKeys(input.templateObjects));
  const ctx: Ctx = { doc, fonts, images: new ImagePool(doc), measure: fonts.measurer(), warnings: new Set() };

  const pages: PageSpec[] = buildPages(input.labelConfig, input.sheetConfig, input.totalItems);
  let done = 0;
  let lastYield = performance.now();
  for (const spec of pages) {
    const page = doc.addPage([spec.widthMm * MM, spec.heightMm * MM]);
    const pageHeightPt = spec.heightMm * MM;
    for (const cell of spec.cells) {
      await drawLabelCell(page, pageHeightPt, cell.x, cell.y, input.getObjects(cell.index), input.labelConfig, input.sheetConfig, input.includeBackground, ctx);
    }
    done++;
    // Nhường luồng cho giao diện (cập nhật tiến độ) khoảng mỗi 100 ms
    if (performance.now() - lastYield > 100) {
      input.onProgress?.(done, pages.length);
      await new Promise((r) => setTimeout(r, 0));
      lastYield = performance.now();
    }
  }
  doc.setTitle(input.title);
  doc.setCreator('KiotViet Print Bridge');
  doc.setProducer('KiotLabel (PDF vector)');
  if (input.subject) doc.setSubject(input.subject);
  if (input.keywords) doc.setKeywords([input.keywords]);
  const bytes = await doc.save();
  return { bytes, pageCount: pages.length, warnings: [...ctx.warnings] };
}

/**
 * Danh sách lệnh vẽ cho bản in thẳng ra máy in thường (A4/A5) trên bản desktop. Dùng chung toàn bộ bộ dựng bố cục với PDF vector
 * (cùng hàm drawLabelCell), chỉ khác nơi ghi: thay vì ghi PDF thì ghi danh sách lệnh để KiotLabel.exe vẽ bằng GDI ở độ phân giải gốc của máy in.
 */
export async function buildVectorOps(input: VectorPdfInput): Promise<SheetJob> {
  // Tài liệu pdf-lib chỉ dùng để đo chữ bằng font nhúng (Arimo/Tinos/Cousine) và để pdf-lib sinh hình học; không được lưu ra tệp
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = new FontPool(doc, input.fontBaseUrl);
  await fonts.need(collectFontKeys(input.templateObjects));
  const images = new RecImagePool();
  const rec = new Recorder(doc, images, (f) => fonts.keyOfFont(f));
  const ctx: Ctx = { doc, fonts, images, measure: fonts.measurer(), warnings: new Set() };

  const specs: PageSpec[] = buildPages(input.labelConfig, input.sheetConfig, input.totalItems);
  const out: SheetJob['pages'] = [];
  let done = 0;
  let lastYield = performance.now();
  for (const spec of specs) {
    const page = rec.newPage();
    const pageHeightPt = spec.heightMm * MM;
    for (const cell of spec.cells) {
      await drawLabelCell(page as unknown as PDFPage, pageHeightPt, cell.x, cell.y, input.getObjects(cell.index), input.labelConfig, input.sheetConfig, input.includeBackground, ctx);
    }
    out.push({ wMm: spec.widthMm, hMm: spec.heightMm, ops: page.ops });
    done++;
    if (performance.now() - lastYield > 100) {
      input.onProgress?.(done, specs.length);
      await new Promise((r) => setTimeout(r, 0));
      lastYield = performance.now();
    }
  }
  return { version: 1, pages: out, images: images.export(), warnings: [...ctx.warnings] };
}
