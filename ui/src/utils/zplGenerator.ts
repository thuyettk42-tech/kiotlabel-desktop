/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LabelObject, LabelConfig } from '../types';
import { formatLabelText } from '../components/LabelCanvas';
import { getBoxOrigin, barcodeModuleDots, qrCellDots } from '../utils';
import { MonoBitmap, bitmapToZplGfa, isDarkColor } from './printerBitmap';

// Với ^FH, các ký tự điều khiển của ZPL (^ ~ _) phải đổi sang dạng _XX để dữ liệu không làm hỏng lệnh in
const zplEscape = (v: string) =>
  String(v ?? '').replace(/_/g, '_5F').replace(/\^/g, '_5E').replace(/~/g, '_7E');

interface ZPLConfig {
  dpi: number;         // Usually 203 or 300
  labelWidthMm: number;
  labelHeightMm: number;
  /** Ảnh đơn sắc đã dựng sẵn cho các đối tượng hình ảnh, theo id (xem prepareImageBitmaps). */
  bitmaps?: Record<string, MonoBitmap>;
  /** Ảnh nền tem đã dựng đơn sắc (in trước mọi đối tượng); toạ độ x, y tính từ góc trên-trái tem. */
  background?: MonoBitmap;
}

/**
 * High-fidelity ZPL compiler from standard label design objects
 * Matches physical dimensions exactly using DPI-to-Dots conversion.
 */
export function convertToZPL(objects: LabelObject[], config: ZPLConfig, copies = 1): string {
  const { dpi, labelWidthMm, labelHeightMm } = config;
  
  // Calculate mm to dots scale
  const mmToDots = dpi / 25.4;
  
  const widthDots = Math.round(labelWidthMm * mmToDots);
  const heightDots = Math.round(labelHeightMm * mmToDots);
  
  let zpl = "";
  
  // 1. Initialize label, print width, label length, and UTF-8 encoding
  zpl += "^XA\n";
  zpl += `^PW${widthDots}\n`;
  zpl += `^LL${heightDots}\n`;
  zpl += "^CI28\n"; // Enable UTF-8 encoding for Vietnamese characters

  // Ảnh nền tem in trước để các đối tượng nằm đè lên
  const bg = config.background;
  if (bg && bg.width > 0 && bg.height > 0) {
    zpl += `^FO${bg.x ?? 0},${bg.y ?? 0}\n${bitmapToZplGfa(bg)}^FS\n`;
  }

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
    // Có x, y thì ảnh đã nằm đúng chỗ trên tem; không có thì đặt tại góc trên-trái khung đối tượng.
    const preBmp = obj.id ? config.bitmaps?.[obj.id] : undefined;
    if (preBmp) {
      if (preBmp.width > 0 && preBmp.height > 0) {
        zpl += `^FO${preBmp.x ?? posX},${preBmp.y ?? posY}\n${bitmapToZplGfa(preBmp)}^FS\n`;
      }
      continue;
    }

    switch (obj.type) {
      case 'text': {
        // Calculate font size in dots (ZPL scalable font ^A0)
        const fontSizeDots = Math.round((obj.fontSize || 10) * (dpi / 72) * 1.3);
        
        let alignChar = "L"; // Left
        if (obj.textAlign === "center") alignChar = "C";
        if (obj.textAlign === "right") alignChar = "R";
        
        // FO (Field Origin) or FT (Field Typeset)
        zpl += `^FO${posX},${posY}\n`;
        zpl += `^A0N,${fontSizeDots},${fontSizeDots}\n`;
        
        // Define block size and wrapping ^FB
        zpl += `^FB${w},5,0,${alignChar},0\n`;
        
        const textVal = formatLabelText(obj);
        const fullText = `${obj.prefixText || ""}${textVal}${obj.suffixText || ""}`;
        
        zpl += `^FH\n^FD${zplEscape(fullText)}^FS\n`;
        break;
      }

      case 'barcode': {
        // Chọn độ rộng vạch theo bề rộng khung đối tượng (giống bản xem trước) thay vì làm tròn số cố định
        const barWidth = barcodeModuleDots(obj, w);
        const barHeight = h;
        const showText = obj.displayValue ?? true ? "Y" : "N";
        
        zpl += `^FO${posX},${posY}\n`;
        zpl += `^BY${barWidth}\n`;
        
        if (obj.barcodeFormat === "EAN13") {
          zpl += `^BEN,${barHeight},${showText},N\n`;
        } else if (obj.barcodeFormat === "CODE39") {
          zpl += `^B3N,N,${barHeight},${showText},N\n`;
        } else {
          // CODE128 (Default)
          zpl += `^BCN,${barHeight},${showText},N,N\n`;
        }
        
        zpl += `^FH\n^FD${zplEscape(obj.content)}^FS\n`;
        break;
      }

      case 'qrcode': {
        // Calculate module size (scale) for QR code (1 to 10)
        const qrSize = qrCellDots(obj, w);
        
        zpl += `^FO${posX},${posY}\n`;
        zpl += `^BQN,2,${qrSize}\n`;
        zpl += `^FH\n^FD${obj.qrErrorCorrection || 'Q'}A,${zplEscape(obj.content)}^FS\n`;
        break;
      }

      case 'shape': {
        const shapeType = obj.shapeType || "rect";
        const strokeWidth = Math.max(1, Math.round((obj.shapeStrokeWidth || 1) * mmToDots));
        // Tô đặc khi màu nền tối; màu sáng/trong suốt thì chỉ in viền (in nhiệt chỉ có đen/trắng)
        const filled = isDarkColor(obj.shapeFillColor);
        const color = isDarkColor(obj.shapeStrokeColor || '#000000') || filled ? 'B' : 'W';

        zpl += `^FO${posX},${posY}\n`;

        if (shapeType === "line") {
          zpl += `^GB${w},0,${strokeWidth},${color}^FS\n`;
        } else if (shapeType === "circle" || shapeType === "oval") {
          // ^GE: elip rộng w x h (hình tròn là trường hợp w = h); độ dày >= nửa cạnh ngắn thì thành hình đặc
          const thick = filled ? Math.max(1, Math.min(w, h)) : Math.min(strokeWidth, Math.max(1, Math.floor(Math.min(w, h) / 2)));
          zpl += `^GE${Math.max(1, w)},${Math.max(1, h)},${thick},${color}^FS\n`;
        } else {
          // Hình chữ nhật: ^GB có bo góc (^GB w,h,độ dày,màu,độ bo 0-8); độ dày bằng cạnh ngắn thì thành hình đặc
          const thick = filled ? Math.max(1, Math.min(w, h)) : strokeWidth;
          const rx = obj.shapeCornerRadius ? Math.min(8, Math.round((obj.shapeCornerRadius / Math.max(1, Math.min(obj.width, obj.height))) * 16)) : 0;
          zpl += `^GB${w},${h},${thick},${color},${rx}^FS\n`;
        }
        break;
      }

      case 'image': {
        // Ảnh đã dựng sẵn được in ở đầu vòng lặp; tới đây nghĩa là không dựng được
        zpl += `^FX Hinh anh bi bo qua (chua dung duoc anh don sac) ^FS\n`;
        break;
      }

      default:
        zpl += `^FX Skipped unsupported object type: ${obj.type} ^FS\n`;
        break;
    }
  }

  // Số bản in của nhãn này (^PQ: tổng số, tạm dừng, số nhãn giữa các lần tạm dừng, ghi đè)
  const qty = Math.max(1, Math.min(9999, Math.round(copies) || 1));
  if (qty > 1) zpl += `^PQ${qty},0,1,N\n`;
  zpl += "^XZ";
  return zpl;
}
