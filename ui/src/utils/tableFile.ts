/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Đọc tệp bảng tính do người dùng chọn. Tệp nhị phân (.xlsx/.xls) đọc thẳng bằng SheetJS; tệp văn bản
// (.csv/.tsv/.txt) phải được GIẢI MÃ đúng bảng mã trước: nếu đưa cả mảng byte cho SheetJS thì CSV UTF-8
// không có BOM bị đọc như Latin-1 và hỏng dấu tiếng Việt.

/** Tệp nhị phân của Excel: zip (.xlsx/.xlsm/.xlsb) hoặc OLE2 (.xls). */
export function isBinaryWorkbook(bytes: Uint8Array): boolean {
  const zip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const ole = bytes.length > 7 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return zip || ole;
}

/** Coi là tệp văn bản dạng bảng khi không phải tệp nhị phân của Excel và có đuôi .csv/.tsv/.txt (hoặc không có đuôi bảng tính). */
export function isTextTable(bytes: Uint8Array, fileName: string): boolean {
  if (isBinaryWorkbook(bytes)) return false;
  if (/\.(csv|tsv|txt)$/i.test(fileName)) return true;
  return !/\.(xlsx|xlsm|xlsb|xls|ods)$/i.test(fileName);
}

/**
 * Giải mã văn bản: tôn trọng BOM (UTF-8, UTF-16 LE/BE); không có BOM thì thử UTF-8 nghiêm ngặt,
 * không hợp lệ thì coi là Windows-1258 (bảng mã "ANSI" của Excel tiếng Việt).
 */
export function decodeTableText(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('windows-1258').decode(bytes);
    } catch {
      return new TextDecoder('latin1').decode(bytes);
    }
  }
}

/** Đoán dấu phân cách cột từ vài dòng đầu (bỏ qua nội dung trong dấu nháy kép): ',' ';' tab hoặc '|'. */
export function detectSeparator(text: string): string {
  const candidates = [',', ';', '\t', '|'];
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQuotes = false;
  let lines = 0;
  for (let i = 0; i < text.length && lines < 5; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === '\n') lines++;
      else if (ch in counts) counts[ch]++;
    }
  }
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    if (counts[c] > bestCount) { best = c; bestCount = counts[c]; }
  }
  return best;
}

/**
 * Đọc tệp bảng tính thành workbook của SheetJS (`xlsx` truyền vào để chỉ tải thư viện này khi cần).
 * Tệp văn bản được giải mã đúng bảng mã và đọc với `raw: true` nên mã vạch có số 0 đứng đầu (0012345)
 * hay số có dấu chấm (1.000) được giữ nguyên như trong tệp.
 */
export function readTableFile(XLSX: any, bytes: Uint8Array, fileName: string) {
  if (isTextTable(bytes, fileName)) {
    const text = decodeTableText(bytes);
    return XLSX.read(text, { type: 'string', raw: true, cellDates: true, cellNF: true, FS: detectSeparator(text) });
  }
  return XLSX.read(bytes, { type: 'array', cellDates: true, cellNF: true });
}
