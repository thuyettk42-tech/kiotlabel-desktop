/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LabelObject } from '../types';
import { formatLabelText } from '../components/LabelCanvas';
import { getBoxOrigin, barcodeModuleDots, qrCellDots } from '../utils';
import { MonoBitmap, Bar, MAX_TSPL_BARS, bitmapToBars, ellipseBitmap, isDarkColor } from './printerBitmap';

// TSPL: dấu nháy kép trong dữ liệu phải viết là \["]
const tsplEscape = (v: string) => String(v ?? '').replace(/"/g, '\\["]');


// Các hình chữ nhật BAR của một ảnh/hình; quá nhiều thì bỏ qua để tệp lệnh không phình to
function barsToTspl(bars: Bar[], label: string): string {
  if (bars.length > MAX_TSPL_BARS) {
    return `; Bo qua ${label}: qua nhieu chi tiet (${bars.length} khoi), hay dung PDF hoac ZPL\n`;
  }
  return bars.map((b) => `BAR ${b.x},${b.y},${b.w},${b.h}\n`).join('');
}

// Dữ liệu nhị phân của BITMAP được đặt giữa hai ký tự đánh dấu, mỗi byte là một ký tự U+E100..U+E1FF
// (vùng ký tự riêng, không trùng chữ thường gặp); tsplToBytes() đổi lại thành byte thật.
const BIN_START = '';
const BIN_END = '';
const BIN_BASE = 0xe100;

/** Lệnh TSPL BITMAP (mode 0 = ghi đè). Trong dữ liệu, bit 0 = điểm đen (in), bit 1 = trắng. */
export function bitmapToTsplBinary(bmp: MonoBitmap, x: number, y: number): string {
  const widthBytes = Math.ceil(bmp.width / 8);
  let data = '';
  for (let row = 0; row < bmp.height; row++) {
    for (let bx = 0; bx < widthBytes; bx++) {
      let byte = 0xff;
      for (let bit = 0; bit < 8; bit++) {
        const px = bx * 8 + bit;
        if (px < bmp.width && bmp.data[row * bmp.width + px]) byte &= ~(0x80 >> bit);
      }
      data += String.fromCharCode(BIN_BASE + (byte & 0xff));
    }
  }
  return `BITMAP ${x},${y},${widthBytes},${bmp.height},0,${BIN_START}${data}${BIN_END}\n`;
}

/** Đổi chuỗi lệnh TSPL (có thể chứa dữ liệu BITMAP nhị phân) thành byte: văn bản mã hoá UTF-8, dữ liệu ảnh giữ nguyên byte. */
export function tsplToBytes(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(BIN_START, i);
    if (start < 0) { chunks.push(encoder.encode(text.slice(i))); break; }
    if (start > i) chunks.push(encoder.encode(text.slice(i, start)));
    const end = text.indexOf(BIN_END, start + 1);
    const body = text.slice(start + 1, end < 0 ? text.length : end);
    const bytes = new Uint8Array(body.length);
    for (let k = 0; k < body.length; k++) bytes[k] = body.charCodeAt(k) - BIN_BASE;
    chunks.push(bytes);
    i = end < 0 ? text.length : end + 1;
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

interface TSPLConfig {
  dpi: number;         // Usually 203 or 300
  labelWidthMm: number;
  labelHeightMm: number;
  gapMm?: number;      // Distance between labels, default 3mm
  /** Ảnh đơn sắc đã dựng sẵn cho các đối tượng hình ảnh, theo id (xem prepareImageBitmaps). */
  bitmaps?: Record<string, MonoBitmap>;
  /** Ảnh nền tem đã dựng đơn sắc (in trước mọi đối tượng); toạ độ x, y tính từ góc trên-trái tem. */
  background?: MonoBitmap;
  /**
   * true: ảnh được xuất bằng lệnh BITMAP với dữ liệu nhị phân (gọn, hỗ trợ ảnh dither); khi đó chuỗi trả về chứa
   * ký hiệu đặc biệt và PHẢI đổi sang byte bằng tsplToBytes() trước khi gửi/lưu. false (mặc định): ảnh thành các khối BAR
   * (văn bản thuần, nhưng ảnh nhiều chi tiết sẽ bị bỏ qua khi quá 6000 khối).
   */
  binaryBitmaps?: boolean;
}

/**
 * High-fidelity TSPL compiler from standard label design objects
 * Matches physical dimensions exactly using DPI-to-Dots conversion.
 */
export function convertToTSPL(objects: LabelObject[], config: TSPLConfig, copies = 1): string {
  const { dpi, labelWidthMm, labelHeightMm, gapMm = 3 } = config;
  
  // Calculate mm to dots scale
  const mmToDots = dpi / 25.4;
  
  let tspl = "";
  
  // 1. Initialize label configuration, codepage UTF-8 and CLS
  tspl += `SIZE ${labelWidthMm} mm, ${labelHeightMm} mm\n`;
  tspl += `GAP ${gapMm} mm, 0 mm\n`;
  tspl += "DIRECTION 1\n";
  tspl += "OFFSET 0\n";
  tspl += "CODEPAGE UTF-8\n"; // Ensure correct Vietnamese rendering
  tspl += "CLS\n"; // Clear image buffer

  // In một ảnh đơn sắc: BITMAP nhị phân nếu được bật, nếu không thì các khối BAR
  const emitBitmap = (bmp: MonoBitmap, bx: number, by: number, label: string) =>
    config.binaryBitmaps ? bitmapToTsplBinary(bmp, bx, by) : barsToTspl(bitmapToBars(bmp, bx, by), label);

  // Ảnh nền tem in trước để các đối tượng nằm đè lên
  const bg = config.background;
  if (bg && bg.width > 0 && bg.height > 0) tspl += emitBitmap(bg, bg.x ?? 0, bg.y ?? 0, "background");

  // 2. Compile each object
  for (const obj of objects) {
    // Coordinates are stored relative to center in state (obj.x, obj.y are from center)
    // Convert them to absolute left-top coordinates
    // (x, y) là điểm neo (văn bản) hoặc góc trên-trái (các loại khác): quy đổi về góc trên-trái của khung
    const { left: stdX, top: stdY } = getBoxOrigin(obj, labelWidthMm, labelHeightMm);

    const x = Math.round(stdX * mmToDots);
    const y = Math.round(stdY * mmToDots);
    const w = Math.round(obj.width * mmToDots);
    const h = Math.round(obj.height * mmToDots);

    // Keep positions inside non-negative bounds
    const posX = Math.max(0, x);
    const posY = Math.max(0, y);

    // Đối tượng đã dựng sẵn thành ảnh đơn sắc (hình ảnh, đối tượng xoay, hình nét đứt/chấm): in ảnh đó.
    // TSPL BITMAP cần dữ liệu nhị phân nên ảnh được chuyển thành các khối BAR (đã gộp các hàng giống nhau).
    const preBmp = obj.id ? config.bitmaps?.[obj.id] : undefined;
    if (preBmp) {
      if (preBmp.width > 0 && preBmp.height > 0) {
        tspl += emitBitmap(preBmp, preBmp.x ?? posX, preBmp.y ?? posY, `${obj.type} ${obj.id}`);
      }
      continue;
    }

    switch (obj.type) {
      case 'text': {
        const textVal = formatLabelText(obj);
        const fullText = `${obj.prefixText || ""}${textVal}${obj.suffixText || ""}`;
        
        // Use auto scaling font metrics. In TSPL, "ROMAN.TTF" is a widely supported true type vector font.
        // Or "TSS24.BF2" for system bitmap.
        // We can use "ROMAN.TTF" and set appropriate size or use standard scalable TSPL text
        const fontSizePt = obj.fontSize || 10;
        
        // Since TSPL TEXT command uses either internal font or TrueType fonts,
        // we'll use "ROMAN.TTF" for high-fidelity rendering or "0" (auto) depending on availability.
        // For TrueType vector font: TEXT x, y, "ROMAN.TTF", rotation, x-multiplier, y-multiplier, "content"
        // Let's use "ROMAN.TTF" or "UTST.BF2" or font 3/4.
        // To be safe and compliant across various firmware, we can use "ROMAN.TTF" with x_multiplier and y_multiplier.
        // The multipliers can scale the base font size. Let's map fontSizePt appropriately.
        const scaleMultiplier = Math.max(1, Math.round(fontSizePt / 8)); 
        
        // Let's generate: TEXT x,y,"ROMAN.TTF",0,scaleMultiplier,scaleMultiplier,"text"
        // Wait! Let's escape quotes in fullText for TSPL syntax compliance
        const escapedText = tsplEscape(fullText);
        tspl += `TEXT ${posX},${posY},"ROMAN.TTF",0,${scaleMultiplier},${scaleMultiplier},"${escapedText}"\n`;
        break;
      }

      case 'barcode': {
        // Độ rộng vạch theo bề rộng khung đối tượng; CODE39 dùng tỉ lệ rộng:hẹp 3:1
        const barWidth = barcodeModuleDots(obj, w);
        const barHeight = h;
        const showText = obj.displayValue ?? true ? 1 : 0;
        
        let formatCode = "128";
        if (obj.barcodeFormat === "EAN13") {
          formatCode = "EAN13";
        } else if (obj.barcodeFormat === "CODE39") {
          formatCode = "39";
        }
        
        // BARCODE X, Y, "code type", height, human-readable, rotation, narrow, wide, "content"
        tspl += `BARCODE ${posX},${posY},"${formatCode}",${barHeight},${showText},0,${barWidth},${obj.barcodeFormat === 'CODE39' ? barWidth * 3 : barWidth * 2},"${tsplEscape(obj.content)}"\n`;
        break;
      }

      case 'qrcode': {
        // Module size (scale) for QR code (1 to 10)
        const qrSize = qrCellDots(obj, w);
        
        // QRCODE X, Y, ECC level, cell width, mode, rotation, "content"
        // ECC Level: M (Medium) is a safe and high contrast level
        tspl += `QRCODE ${posX},${posY},${obj.qrErrorCorrection || 'M'},${qrSize},A,0,"${tsplEscape(obj.content)}"\n`;
        break;
      }

      case 'shape': {
        const shapeType = obj.shapeType || "rect";
        const strokeWidth = Math.max(1, Math.round((obj.shapeStrokeWidth || 1) * mmToDots));
        // Tô đặc khi màu nền tối; màu sáng/trong suốt thì chỉ in viền (in nhiệt chỉ có đen/trắng)
        const filled = isDarkColor(obj.shapeFillColor);

        if (shapeType === "line") {
          // TSPL has a BAR command: BAR x, y, width, height
          tspl += `BAR ${posX},${posY},${w},${strokeWidth}\n`;
        } else if (shapeType === "circle" || shapeType === "oval") {
          // Hình tròn/elip: dựng thành các hình chữ nhật (BAR) để chạy được trên mọi dòng máy,
          // không phụ thuộc lệnh CIRCLE/ELLIPSE vốn chỉ có ở một số firmware
          tspl += barsToTspl(bitmapToBars(ellipseBitmap(w, h, strokeWidth, filled), posX, posY), `ellipse ${obj.id}`);
        } else if (filled) {
          tspl += `BAR ${posX},${posY},${Math.max(1, w)},${Math.max(1, h)}\n`;
        } else {
          // Rectangle
          const endX = posX + w;
          const endY = posY + h;
          // BOX x, y, x_end, y_end, line_thickness[, corner_radius]
          const rx = obj.shapeCornerRadius ? Math.round(obj.shapeCornerRadius * mmToDots) : 0;
          if (rx > 0) {
            tspl += `BOX ${posX},${posY},${endX},${endY},${strokeWidth},${rx}\n`;
          } else {
            tspl += `BOX ${posX},${posY},${endX},${endY},${strokeWidth}\n`;
          }
        }
        break;
      }

      case 'image': {
        // Ảnh đã dựng sẵn được in ở đầu vòng lặp; tới đây nghĩa là không dựng được
        tspl += `; Hinh anh bi bo qua (chua dung duoc anh don sac)\n`;
        break;
      }

      default:
        tspl += `; Skipped unsupported object type: ${obj.type}\n`;
        break;
    }
  }

  // 3. Print command
  const qty = Math.max(1, Math.min(9999, Math.round(copies) || 1));
  tspl += `PRINT ${qty},1\n`;
  return tspl;
}
