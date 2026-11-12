/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Font cho PDF vector. Font hệ thống không nhúng được vào PDF nên dùng bộ font mã nguồn mở có kích thước chữ
// tương đương (có đủ tiếng Việt), đặt trong thư mục `fonts/` cạnh ứng dụng:
//   Arimo   (tương đương Arial)            -> font mặc định, Arial, Tahoma
//   Tinos   (tương đương Times New Roman)  -> Times New Roman, serif
//   Cousine (tương đương Courier New)      -> monospace
// Arial và Times New Roman khớp bề rộng chữ với bản hiển thị; font mặc định (Inter/Segoe UI) và Tahoma chỉ gần đúng.

import type { FontKey } from './textLayout';

export function familyOf(fontFamily?: string): FontKey['family'] {
  if (fontFamily === 'Times New Roman' || fontFamily === 'serif') return 'serif';
  if (fontFamily === 'monospace' || fontFamily === 'var(--font-mono)') return 'mono';
  return 'sans';
}

const NAMES: Record<FontKey['family'], string> = { sans: 'Arimo', serif: 'Tinos', mono: 'Cousine' };

export function fontKeyOf(fontFamily?: string, weight?: string, style?: string): FontKey {
  return { family: familyOf(fontFamily), bold: weight === 'bold', italic: style === 'italic' };
}

export function fontKeyId(k: FontKey): string {
  return `${k.family}-${k.bold ? 'b' : 'r'}${k.italic ? 'i' : ''}`;
}

export function fontFileName(k: FontKey): string {
  return `${NAMES[k.family]}-${k.bold ? '700Bold' : '400Regular'}${k.italic ? '_Italic' : ''}.ttf`;
}

const bytesCache = new Map<string, Promise<ArrayBuffer>>();

/** Tải tệp font (có nhớ đệm trong phiên). `baseUrl` mặc định là thư mục `fonts/` cạnh trang đang chạy. */
export function loadFontBytes(k: FontKey, baseUrl?: string): Promise<ArrayBuffer> {
  const base = baseUrl ?? new URL('fonts/', document.baseURI).toString();
  const url = base + fontFileName(k);
  let p = bytesCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Không tải được font ${fontFileName(k)} (${r.status})`);
      return r.arrayBuffer();
    });
    p.catch(() => bytesCache.delete(url));
    bytesCache.set(url, p);
  }
  return p;
}
