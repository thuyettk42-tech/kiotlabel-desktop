/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Dựng các đối tượng KHÔNG có lệnh máy in tương ứng thành ảnh đơn sắc bằng canvas:
// đối tượng xoay (góc bất kỳ) và hình khối có nét đứt/chấm. Chỉ chạy trong trình duyệt.
// Phép biến đổi mô phỏng đúng bàn thiết kế (LabelCanvas): quay quanh TÂM khung đối tượng,
// với văn bản thì dịch theo điểm neo (textFlowOrigin) trước khi quay.

import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { LabelObject } from '../types';
import { formatLabelText } from '../components/LabelCanvas';
import { anchorMultipliers, usesAnchor, barcodeModuleDots, qrCellDots } from '../utils';
import {
  MonoBitmap, monoFromRgba, monoFromRgbaMode, cropToInk, needsRaster, normalizeAngle, loadImage, rasterizeImageObject
} from './printerBitmap';

const fontFamilyFor = (family?: string) => {
  if (family === 'Arial') return 'Arial, Helvetica, sans-serif';
  if (family === 'Times New Roman') return "'Times New Roman', Times, serif";
  if (family === 'Tahoma') return 'Tahoma, Geneva, sans-serif';
  if (family === 'monospace' || family === 'var(--font-mono)') return "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";
  return "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
};

// Ngắt dòng giống CSS `white-space: pre-wrap; word-break: break-word`
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') { lines.push(''); continue; }
    let current = '';
    for (const word of paragraph.split(' ')) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !current) {
        current = test;
      } else {
        lines.push(current);
        current = word;
      }
      // Từ dài hơn khung: bẻ theo ký tự
      while (ctx.measureText(current).width > maxWidth && current.length > 1) {
        let cut = current.length - 1;
        while (cut > 1 && ctx.measureText(current.slice(0, cut)).width > maxWidth) cut--;
        lines.push(current.slice(0, cut));
        current = current.slice(cut);
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawText(ctx: CanvasRenderingContext2D, obj: LabelObject, w: number, dpi: number) {
  const fullText = `${obj.prefixText || ''}${formatLabelText(obj)}${obj.suffixText || ''}`;
  const fontPx = Math.max(4, (obj.fontSize || 10) * (dpi / 72));
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  ctx.font = `${obj.fontStyle === 'italic' ? 'italic ' : ''}${obj.fontWeight === 'bold' ? 'bold ' : ''}${fontPx}px ${fontFamilyFor(obj.fontFamily)}`;
  if (obj.letterSpacing) (ctx as any).letterSpacing = `${(obj.letterSpacing * dpi) / 25.4}px`;
  const lineH = fontPx * 1.25;
  const lines = wrapText(ctx, fullText, w);
  const align = obj.textAlign || 'left';
  lines.forEach((line, i) => {
    const lw = ctx.measureText(line).width;
    const x = align === 'center' ? (w - lw) / 2 : align === 'right' ? w - lw : 0;
    const y = i * lineH + (lineH - fontPx) / 2;
    ctx.fillText(line, x, y);
    const deco = obj.textDecorationUnderline ? y + fontPx * 1.02 : obj.textDecorationLineThrough ? y + fontPx * 0.55 : null;
    if (deco !== null) ctx.fillRect(x, deco, lw, Math.max(1, fontPx / 14));
  });
}

function drawBarcode(ctx: CanvasRenderingContext2D, obj: LabelObject, w: number, h: number) {
  const showText = obj.displayValue ?? true;
  const format = obj.barcodeFormat === 'EAN13' ? 'EAN13' : obj.barcodeFormat === 'CODE39' ? 'CODE39' : 'CODE128';
  const tmp = document.createElement('canvas');
  JsBarcode(tmp, obj.content, {
    format,
    width: barcodeModuleDots(obj, w),
    height: Math.max(4, Math.round(showText ? h * 0.8 : h)),
    displayValue: showText,
    fontSize: Math.max(6, Math.round(h * 0.17)),
    textMargin: 0,
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
    font: 'Arial'
  });
  ctx.drawImage(tmp, 0, 0);
}

function drawQr(ctx: CanvasRenderingContext2D, obj: LabelObject, w: number) {
  const level = (obj.qrErrorCorrection || 'H') as 'L' | 'M' | 'Q' | 'H';
  const qr = (QRCode as any).create(obj.content || ' ', { errorCorrectionLevel: level });
  const size = qr.modules.size as number;
  const cell = qrCellDots(obj, w);
  ctx.fillStyle = '#000';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.modules.get(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
}

async function drawImageObject(ctx: CanvasRenderingContext2D, obj: LabelObject, w: number, h: number) {
  const img = await loadImage(obj.content);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const fit = obj.imageFit || 'contain';
  ctx.globalAlpha = obj.imageOpacity !== undefined ? obj.imageOpacity : 1;
  if (fit === 'fill') {
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    const scale = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.drawImage(img, (w - iw * scale) / 2, (h - ih * scale) / 2, iw * scale, ih * scale);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawShape(ctx: CanvasRenderingContext2D, obj: LabelObject, w: number, h: number, dpi: number) {
  const mm = dpi / 25.4;
  const type = obj.shapeType || 'rect';
  const t = Math.max(1, (obj.shapeStrokeWidth !== undefined ? obj.shapeStrokeWidth : 1) * mm);
  const dashed = obj.shapeStrokeStyle === 'dashed';
  const dotted = obj.shapeStrokeStyle === 'dotted';
  const fillDark = obj.shapeFillColor && !/^(transparent|none)$/i.test(obj.shapeFillColor.trim()) && darkEnough(obj.shapeFillColor);
  const strokeDark = darkEnough(obj.shapeStrokeColor || '#000000');

  ctx.lineWidth = t;
  ctx.lineCap = 'butt';
  if (dashed) ctx.setLineDash([Math.max(2, t * 3), Math.max(2, t * 2)]);
  else if (dotted) ctx.setLineDash([Math.max(1, t), Math.max(2, t * 1.5)]);

  // Đường viền nằm TRONG khung (border-box) nên đi qua nửa độ dày
  const inset = t / 2;
  ctx.beginPath();
  if (type === 'line') {
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
  } else if (type === 'circle' || type === 'oval') {
    ctx.ellipse(w / 2, h / 2, Math.max(0.5, w / 2 - inset), Math.max(0.5, h / 2 - inset), 0, 0, Math.PI * 2);
  } else {
    const r = Math.max(0, Math.min((obj.shapeCornerRadius || 0) * mm, Math.min(w, h) / 2));
    const x = inset, y = inset, rw = Math.max(1, w - t), rh = Math.max(1, h - t);
    if (r > 0 && (ctx as any).roundRect) (ctx as any).roundRect(x, y, rw, rh, r);
    else ctx.rect(x, y, rw, rh);
  }
  if (type !== 'line' && fillDark) {
    ctx.fillStyle = '#000';
    ctx.setLineDash([]);
    ctx.fill();
    if (dashed) ctx.setLineDash([Math.max(2, t * 3), Math.max(2, t * 2)]);
    else if (dotted) ctx.setLineDash([Math.max(1, t), Math.max(2, t * 1.5)]);
  }
  if (strokeDark || type === 'line') {
    ctx.strokeStyle = '#000';
    ctx.stroke();
  }
}

function darkEnough(color: string): boolean {
  const c = color.trim().toLowerCase();
  if (c === 'transparent' || c === 'none') return false;
  const m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const hex = m[1].length === 3 ? m[1].split('').map((ch) => ch + ch).join('') : m[1];
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  }
  return c !== 'white';
}

/**
 * Dựng một đối tượng (kể cả khi xoay) thành ảnh đơn sắc đặt đúng vị trí trên tem (`x`, `y` tính bằng dot).
 * Trả về null nếu không dựng được (ví dụ ảnh chặn CORS, nội dung mã vạch không hợp lệ) hoặc đối tượng trống.
 */
export async function rasterizeObject(
  obj: LabelObject,
  dpi: number,
  labelWidthMm: number,
  labelHeightMm: number
): Promise<MonoBitmap | null> {
  const mm = dpi / 25.4;
  const LW = Math.max(1, Math.round(labelWidthMm * mm));
  const LH = Math.max(1, Math.round(labelHeightMm * mm));
  const w = Math.max(1, obj.width * mm);
  const h = Math.max(1, obj.height * mm);
  const canvas = document.createElement('canvas');
  canvas.width = LW;
  canvas.height = LH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LW, LH);

  // Vị trí lưu là tọa độ từ tâm tem; văn bản dịch theo điểm neo trước khi quay quanh tâm khung
  const anchorX = (labelWidthMm / 2 + obj.x) * mm;
  const anchorY = (labelHeightMm / 2 + obj.y) * mm;
  const { mx, my } = usesAnchor(obj) ? anchorMultipliers(obj.textFlowOrigin) : { mx: 0, my: 0 };
  ctx.save();
  ctx.translate(anchorX + w / 2, anchorY + h / 2);
  ctx.rotate((normalizeAngle(obj.angle) * Math.PI) / 180);
  ctx.translate(-w / 2 - mx * w, -h / 2 - my * h);

  try {
    switch (obj.type) {
      case 'text': drawText(ctx, obj, w, dpi); break;
      case 'barcode': drawBarcode(ctx, obj, w, h); break;
      case 'qrcode': drawQr(ctx, obj, w); break;
      case 'image': await drawImageObject(ctx, obj, w, h); break;
      case 'shape': drawShape(ctx, obj, w, h, dpi); break;
      default: return null;
    }
  } catch (err) {
    console.warn('Không dựng được đối tượng cho máy in:', obj.type, err);
    return null;
  } finally {
    ctx.restore();
  }

  const pixels = ctx.getImageData(0, 0, LW, LH).data;
  // Đối tượng không có điểm đen nào (ví dụ chữ rỗng): ảnh rỗng, bộ sinh lệnh sẽ không in gì
  // Hình ảnh theo chế độ chuyển đơn sắc của đối tượng (tự chọn/ngưỡng/dither); các loại khác là nét đen trên nền trắng nên dùng ngưỡng
  const mono = obj.type === 'image' ? monoFromRgbaMode(pixels, LW, LH, obj.imageMono || 'auto') : monoFromRgba(pixels, LW, LH);
  return cropToInk(mono, 0, 0) ?? { width: 0, height: 0, data: new Uint8Array(0), x: 0, y: 0 };
}

/** Thông số ảnh nền tem (lấy từ cấu hình tem). */
export interface BackgroundSpec {
  image?: string;
  opacity?: number;
  size?: 'contain' | 'cover' | 'repeat' | 'auto';
}

/**
 * Dựng ảnh nền tem thành ảnh đơn sắc cho máy in, mô phỏng đúng bàn thiết kế: nằm giữa tem, độ mờ mặc định 0.3,
 * `contain`/`cover`/`auto` (kích thước tự nhiên, 1 px = 1/96 inch)/`repeat`. Ảnh mờ nhạt được dither nên in ra
 * là lớp chấm thưa tương ứng độ mờ. Trả về null nếu không đọc được ảnh, ảnh rỗng nếu không có điểm đen nào.
 */
export async function rasterizeBackground(
  spec: BackgroundSpec,
  dpi: number,
  labelWidthMm: number,
  labelHeightMm: number
): Promise<MonoBitmap | null> {
  if (!spec.image) return null;
  const mm = dpi / 25.4;
  const LW = Math.max(1, Math.round(labelWidthMm * mm));
  const LH = Math.max(1, Math.round(labelHeightMm * mm));
  try {
    const img = await loadImage(spec.image);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const canvas = document.createElement('canvas');
    canvas.width = LW;
    canvas.height = LH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LW, LH);
    ctx.globalAlpha = spec.opacity !== undefined ? spec.opacity : 0.3;
    const size = spec.size || 'contain';
    if (size === 'contain' || size === 'cover') {
      const scale = size === 'cover' ? Math.max(LW / iw, LH / ih) : Math.min(LW / iw, LH / ih);
      ctx.drawImage(img, (LW - iw * scale) / 2, (LH - ih * scale) / 2, iw * scale, ih * scale);
    } else {
      // Kích thước tự nhiên: 1 px CSS = 1/96 inch
      const tw = (iw * dpi) / 96;
      const th = (ih * dpi) / 96;
      if (size === 'auto') {
        ctx.drawImage(img, (LW - tw) / 2, (LH - th) / 2, tw, th);
      } else {
        const startX = (((LW - tw) / 2) % tw + tw) % tw - tw;
        const startY = (((LH - th) / 2) % th + th) % th - th;
        for (let y = startY; y < LH; y += th) for (let x = startX; x < LW; x += tw) ctx.drawImage(img, x, y, tw, th);
      }
    }
    const pixels = ctx.getImageData(0, 0, LW, LH).data;
    return cropToInk(monoFromRgbaMode(pixels, LW, LH, 'auto'), 0, 0) ?? { width: 0, height: 0, data: new Uint8Array(0), x: 0, y: 0 };
  } catch (err) {
    console.warn('Không dựng được ảnh nền tem cho máy in:', err);
    return null;
  }
}

/**
 * Chuẩn bị ảnh đơn sắc cho mọi đối tượng cần dựng sẵn: hình ảnh, đối tượng xoay, hình nét đứt/chấm.
 * Đối tượng dựng lỗi nằm trong `failedIds`: ảnh bị bỏ qua, các loại khác quay về lệnh máy in gốc (không xoay/không đứt nét).
 */
export async function prepareObjectBitmaps(
  objects: LabelObject[],
  dpi: number,
  labelWidthMm: number,
  labelHeightMm: number,
  background?: BackgroundSpec
): Promise<{ bitmaps: Record<string, MonoBitmap>; failedIds: string[]; background?: MonoBitmap }> {
  const bitmaps: Record<string, MonoBitmap> = {};
  const failedIds: string[] = [];
  let bg: MonoBitmap | undefined;
  if (background && background.image) {
    const b = await rasterizeBackground(background, dpi, labelWidthMm, labelHeightMm);
    if (b) bg = b;
    else failedIds.push('label-background');
  }
  for (const obj of objects) {
    if (needsRaster(obj)) {
      const bmp = await rasterizeObject(obj, dpi, labelWidthMm, labelHeightMm);
      if (bmp) bitmaps[obj.id] = bmp;
      else failedIds.push(obj.id);
    } else if (obj.type === 'image' && obj.content) {
      const bmp = await rasterizeImageObject(obj, dpi);
      if (bmp) bitmaps[obj.id] = bmp;
      else failedIds.push(obj.id);
    }
  }
  return { bitmaps, failedIds, background: bg };
}
