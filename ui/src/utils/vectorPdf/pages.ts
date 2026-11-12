/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Hình học các trang của PDF (hàm thuần). Giống cách LabelCanvas dựng trang để xuất PDF:
// - cuộn tem nhiệt: mỗi hàng tem là một trang, rộng = lề hai bên + các cột + khoảng cách cột;
// - tờ giấy văn bản (A4/A5/tùy chọn): lưới hàng x cột bắt đầu từ lề trên/trái.

import type { LabelConfig, SheetLayoutConfig } from '../../types';

export interface PageCell {
  /** Chỉ số tem (theo thứ tự in, bắt đầu từ 0). */
  index: number;
  /** Góc trên-trái của tem so với góc trên-trái trang (mm). */
  x: number;
  y: number;
}

export interface PageSpec {
  widthMm: number;
  heightMm: number;
  cells: PageCell[];
}

export function sheetDimensions(sheet: Pick<SheetLayoutConfig, 'paperSize' | 'customWidth' | 'customHeight' | 'orientation'>) {
  let w = 210;
  let h = 297;
  if (sheet.paperSize === 'A5') { w = 148; h = 210; }
  else if (sheet.paperSize === 'custom') { w = sheet.customWidth || 210; h = sheet.customHeight || 297; }
  return sheet.orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h };
}

/** Số tem cần in: theo số dòng Excel (đã gồm số bản) nếu có, không thì số bản in cố định hoặc đủ một hàng/tờ. */
export function totalLabelCount(opts: {
  hasExcel: boolean;
  manifestLength?: number;
  excelRows?: number;
  printCopies?: number;
  perPage: number;
}): number {
  if (opts.hasExcel) return opts.manifestLength !== undefined ? opts.manifestLength : (opts.excelRows || 0);
  return opts.printCopies || opts.perPage;
}

export function buildPages(label: Pick<LabelConfig, 'width' | 'height'>, sheet: SheetLayoutConfig | undefined, totalItems: number): PageSpec[] {
  const pages: PageSpec[] = [];
  if (sheet && sheet.mode === 'office') {
    const { width, height } = sheetDimensions(sheet);
    const cols = Math.max(1, sheet.cols || 1);
    const rows = Math.max(1, sheet.rows || 1);
    const perSheet = cols * rows;
    const sheets = Math.max(1, Math.ceil(totalItems / perSheet));
    for (let s = 0; s < sheets; s++) {
      const cells: PageCell[] = [];
      for (let c = 0; c < perSheet; c++) {
        const index = s * perSheet + c;
        if (index >= totalItems) break;
        const col = c % cols;
        const row = Math.floor(c / cols);
        cells.push({
          index,
          x: (sheet.marginLeft || 0) + col * (label.width + (sheet.colGap || 0)),
          y: (sheet.marginTop || 0) + row * (label.height + (sheet.rowGap || 0))
        });
      }
      pages.push({ widthMm: width, heightMm: height, cells });
    }
    return pages;
  }
  // Cuộn tem nhiệt (mặc định khi không có cấu hình trang)
  const cols = Math.max(1, (sheet && sheet.cols) || 1);
  const colGap = (sheet && sheet.colGap) || 0;
  const side = sheet && sheet.rollSideMargin !== undefined ? sheet.rollSideMargin : 1;
  const widthMm = cols * label.width + (cols - 1) * colGap + side * 2;
  const rowsCount = Math.max(1, Math.ceil(totalItems / cols));
  for (let r = 0; r < rowsCount; r++) {
    const cells: PageCell[] = [];
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      if (index >= totalItems) break;
      cells.push({ index, x: side + c * (label.width + colGap), y: 0 });
    }
    pages.push({ widthMm, heightMm: label.height, cells });
  }
  return pages;
}
