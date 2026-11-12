/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LabelObject } from './types';
import QRCode from 'qrcode';

// Sizing conversion helpers
// 1 inch = 25.4 millimeters
// 1 px = 0.264583 mm => 1 mm = 1 / 0.264583 px = 3.779532169... px (3.779532 px)
export const BASE_DPI_SCALE = 3.779532;
export const PX_TO_MM_FACTOR = 0.264583;
export const PT_TO_MM_FACTOR = 0.3528;

/**
 * Convert millimeters to pixels with a adjustable zoom factor
 */
export function mmToPx(mm: number, scale: number): number {
  return mm * scale;
}

/**
 * Convert pixels to millimeters with adjustable scale, rounded to nearest 0.000001mm
 */
export function pxToMm(px: number, scale: number): number {
  return Math.round((px / scale) * 1000000) / 1000000;
}

/**
 * Guarantee the object stays within the physical label boundaries
 */
export function constrainCoordinates(
  x: number,
  y: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
  snapSize: number = 0, // 0 means no snapping
  angle: number = 0
): { x: number; y: number } {
  let finalX = x;
  let finalY = y;

  // Grid Snapping
  if (snapSize > 0) {
    finalX = Math.round(finalX / snapSize) * snapSize;
    finalY = Math.round(finalY / snapSize) * snapSize;
  }

  // Rotated Bounding Box support
  if (angle && angle !== 0) {
    const rad = (angle * Math.PI) / 180;
    const cosVal = Math.abs(Math.cos(rad));
    const sinVal = Math.abs(Math.sin(rad));

    // Dynamic dimensions of the rotated rectangle bounding box
    const rotatedW = width * cosVal + height * sinVal;
    const rotatedH = width * sinVal + height * cosVal;

    // Minimum and maximum allowable coordinates for the base unrotated origin
    // to keep the rotated box strictly inside the label canvas
    const minX = (rotatedW - width) / 2;
    const maxX = canvasWidth - (rotatedW + width) / 2;

    const minY = (rotatedH - height) / 2;
    const maxY = canvasHeight - (rotatedH + height) / 2;

    if (finalX < minX) finalX = minX;
    if (finalX > maxX) finalX = maxX;

    if (finalY < minY) finalY = minY;
    if (finalY > maxY) finalY = maxY;
  } else {
    // Bound limits for unrotated object
    if (finalX < 0) finalX = 0;
    if (finalX + width > canvasWidth) {
      finalX = canvasWidth - width;
    }
    if (finalX < 0) finalX = 0; // Check again in case width is wider than canvas

    if (finalY < 0) finalY = 0;
    if (finalY + height > canvasHeight) {
      finalY = canvasHeight - height;
    }
    if (finalY < 0) finalY = 0;
  }

  return { 
    x: Math.round(finalX * 10) / 10, 
    y: Math.round(finalY * 10) / 10 
  };
}

/**
 * Compresses and resizes a base64 image or image URL to have a maximum dimension,
 * returning a compressed JPEG base64 data URL.
 * This reduces payload size by 10x-100x and drastically speeds up Gemini API analysis.
 */
export function resizeImage(src: string, maxDimension: number = 1024): Promise<string> {
  return new Promise((resolve) => {
    // If the src is not a data URL and not a valid URL, resolve immediately
    if (!src || (!src.startsWith("data:") && !src.startsWith("http://") && !src.startsWith("https://"))) {
      resolve(src);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Only resize if one of the dimensions exceeds the maximum
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      } else {
        // If it's already smaller, but we want to compress it as a JPEG to reduce size anyway, we can proceed
      }

      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(src);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to JPEG with 0.8 quality (highly compressed but visually almost identical for text/labels)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve(dataUrl);
      } catch (err) {
        console.warn("Error scaling image on canvas, falling back to original", err);
        resolve(src);
      }
    };

    img.onerror = (err) => {
      console.warn("Failed to load image for resizing, falling back to original", err);
      resolve(src);
    };

    img.src = src;
  });
}

/**
 * Safely wraps localStorage to prevent crashing in sandboxed iframes or environments where localStorage is disabled
 */
export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return typeof window !== "undefined" && window.localStorage ? localStorage.getItem(key) : null;
    } catch (e) {
      console.warn(`[Storage] Failed to read key "${key}" from localStorage:`, e);
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn(`[Storage] Failed to write key "${key}" to localStorage:`, e);
    }
  },
  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn(`[Storage] Failed to remove key "${key}" from localStorage:`, e);
    }
  }
};



/**
 * HỆ TỌA ĐỘ CỦA ĐỐI TƯỢNG
 * - obj.x / obj.y (lưu trong mẫu, file .kvl, localStorage) tính bằng mm so với TÂM của tem.
 * - Văn bản: (x, y) là "điểm neo" theo textFlowOrigin (vd. center = tâm khung chữ).
 * - Mã vạch, QR, ảnh, hình khối: (x, y) luôn là GÓC TRÊN-TRÁI của khung (điểm neo không có tác dụng).
 * Các hàm dưới đây quy đổi sang tọa độ người dùng: mm tính từ GÓC TRÊN-TRÁI của tem
 * tới GÓC TRÊN-TRÁI của khung đối tượng (giống BarTender).
 */
export function anchorMultipliers(origin?: string): { mx: number; my: number } {
  const o = origin || 'center';
  let mx = 0;
  let my = 0;
  if (o === 'center' || o.endsWith('center')) mx = 0.5;
  if (o.endsWith('right')) mx = 1;
  if (o === 'center' || o.startsWith('center')) my = 0.5;
  if (o.startsWith('bottom')) my = 1;
  return { mx, my };
}

/** Chỉ văn bản dùng điểm neo; các loại khác luôn neo ở góc trên-trái. */
export function usesAnchor(obj: Pick<LabelObject, 'type'>): boolean {
  return obj.type === 'text';
}

export function getBoxOrigin(
  obj: LabelObject,
  labelW: number,
  labelH: number
): { left: number; top: number } {
  const { mx, my } = usesAnchor(obj) ? anchorMultipliers(obj.textFlowOrigin) : { mx: 0, my: 0 };
  return {
    left: labelW / 2 + obj.x - mx * obj.width,
    top: labelH / 2 + obj.y - my * obj.height
  };
}

/** Ngược lại: đặt góc trên-trái của khung tại (left, top) tính từ góc trên-trái tem. */
export function setBoxOrigin(
  obj: LabelObject,
  left: number,
  top: number,
  labelW: number,
  labelH: number
): { x: number; y: number } {
  const { mx, my } = usesAnchor(obj) ? anchorMultipliers(obj.textFlowOrigin) : { mx: 0, my: 0 };
  return {
    x: Math.round((left - labelW / 2 + mx * obj.width) * 10) / 10,
    y: Math.round((top - labelH / 2 + my * obj.height) * 10) / 10
  };
}

/** Khung đối tượng có chạm ra ngoài phôi tem không (bỏ qua góc xoay). */
export function isOutsideLabel(obj: LabelObject, labelW: number, labelH: number): boolean {
  const { left, top } = getBoxOrigin(obj, labelW, labelH);
  const eps = 0.05;
  return left < -eps || top < -eps || left + obj.width > labelW + eps || top + obj.height > labelH + eps;
}

/** Ép số về khoảng [min, max]; giá trị không hợp lệ trả về fallback. */
export function clampNumber(v: number, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/**
 * Ước lượng số "module" (vạch hẹp nhất) của mã vạch để chọn độ rộng vạch khi xuất lệnh máy in,
 * sao cho mã vừa khít với bề rộng khung đối tượng giống bản xem trước.
 */
export function estimateBarcodeModules(format: string | undefined, content: string): number {
  const len = Math.max(1, (content || '').length);
  if (format === 'EAN13') return 95;
  if (format === 'CODE39') return (len + 2) * 13 - 1; // mỗi ký tự 13 module (tỉ lệ rộng:hẹp 2:1) kể cả khoảng trống
  return (len + 2) * 11 + 13; // CODE128: start + dữ liệu + checksum + stop (ước lượng thận trọng, chưa tính nén bộ C)
}

/** Độ rộng 1 module (đơn vị chấm in) để mã vạch không vượt quá bề rộng khung. */
export function barcodeModuleDots(obj: LabelObject, widthDots: number): number {
  const modules = estimateBarcodeModules(obj.barcodeFormat, obj.content);
  return Math.max(1, Math.min(10, Math.floor(widthDots / modules)));
}

/** Kích thước 1 ô vuông QR (chấm in) để QR vừa khung; lấy số ô thật từ thư viện qrcode. */
export function qrCellDots(obj: LabelObject, widthDots: number): number {
  try {
    const level = (obj.qrErrorCorrection || 'H') as 'L' | 'M' | 'Q' | 'H';
    const size = (QRCode as any).create(obj.content || ' ', { errorCorrectionLevel: level }).modules.size as number;
    return Math.max(1, Math.min(10, Math.floor(widthDots / size)));
  } catch {
    return Math.max(2, Math.min(10, Math.round(widthDots / 40)));
  }
}
