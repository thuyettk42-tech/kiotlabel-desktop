/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Giới hạn số tem mỗi lần in và danh sách "tem thứ k lấy dòng Excel nào" (manifest).

/** PDF vector và lệnh máy in (ZPL/TSPL): không chụp màn hình nên chịu được lô lớn (600 tem chỉ vài giây). */
export const MAX_LABELS = 5000;
/** PDF ảnh (dự phòng) và PNG: chụp DOM từng trang, thời gian và bộ nhớ tăng nhanh theo số tem. */
export const MAX_LABELS_RASTER = 1000;

export interface PrintManifest {
  /** Chỉ số dòng Excel của từng tem sẽ in, theo thứ tự. */
  manifest: number[];
  warning: string | null;
  hasExceeded: boolean;
}

const fmt = (n: number) => n.toLocaleString('vi-VN');

/**
 * Tạo danh sách tem sẽ in từ dữ liệu Excel, dừng ở `limit` tem để không treo trình duyệt.
 * - `excel_column` + cột số lượng: mỗi dòng in đúng số bản trong cột (rỗng/không hợp lệ/<=0 thì 1 bản).
 * - `excel_column` không chọn cột: mỗi dòng 1 bản.
 * - `constant`: mỗi dòng in `copies` bản.
 * Vượt giới hạn: danh sách dừng ở dòng cuối còn vừa trọn vẹn và `warning` nói rõ dòng nào.
 */
export function buildPrintManifest(opts: {
  excelData: Array<Record<string, unknown>>;
  mode: 'constant' | 'excel_column';
  column?: string | null;
  copies: number;
  limit?: number;
}): PrintManifest {
  const limit = opts.limit ?? MAX_LABELS;
  const { excelData } = opts;
  if (!excelData || excelData.length === 0) return { manifest: [], warning: null, hasExceeded: false };

  const manifest: number[] = [];
  let firstRowOverLimit = false;
  let stopAt: number | null = null;
  let total = 0;

  const rowQty = (idx: number): number => {
    if (opts.mode === 'excel_column' && opts.column) {
      const rawVal = excelData[idx][opts.column];
      if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
        const parsed = parseFloat(String(rawVal).trim().replace(/,/g, ''));
        if (!isNaN(parsed)) {
          const whole = Math.floor(parsed);
          return whole <= 0 ? 1 : Math.min(whole, limit);
        }
      }
      return 1;
    }
    if (opts.mode === 'excel_column') return 1;
    return Math.min(Math.max(1, opts.copies), limit);
  };

  for (let idx = 0; idx < excelData.length; idx++) {
    const qty = rowQty(idx);
    if (total + qty > limit) {
      stopAt = idx;
      firstRowOverLimit = idx === 0;
      break;
    }
    for (let i = 0; i < qty; i++) manifest.push(idx);
    total += qty;
  }

  if (stopAt === null) return { manifest, warning: null, hasExceeded: false };

  const warning = firstRowOverLimit
    ? `Cảnh báo: Dòng đầu tiên trong Excel đã có số lượng vượt hạn mức ${fmt(limit)} bản in cho phép!`
    : `Vượt quá số lượng in cho phép (${fmt(limit)} bản), hệ thống chỉ có thể in tới hàng thứ ${stopAt} (dòng ${stopAt + 1} trong tệp Excel), vui lòng xóa các dòng đã in để tiếp tục phần còn lại.`;
  return { manifest, warning, hasExceeded: true };
}
