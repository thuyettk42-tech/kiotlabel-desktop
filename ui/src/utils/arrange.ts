/**
 * Căn chỉnh, phân bố, thứ tự lớp và nhân đôi đối tượng trên tem.
 * Các hàm thuần (không phụ thuộc React) để dễ kiểm thử.
 *
 * Quy ước: thứ tự trong mảng `objects` chính là thứ tự lớp. Phần tử đứng SAU nằm TRÊN.
 */
import type { LabelObject } from '../types';
import { getBoxOrigin } from '../utils';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';
export type OrderAction = 'front' | 'forward' | 'backward' | 'back';

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Khung bao nhìn thấy (tính cả góc xoay), tọa độ mm từ góc trên-trái của tem. */
export function getVisualBounds(obj: LabelObject, labelW: number, labelH: number): Bounds {
  const { left, top } = getBoxOrigin(obj, labelW, labelH);
  const cx = left + obj.width / 2;
  const cy = top + obj.height / 2;
  let w = obj.width;
  let h = obj.height;
  if (obj.angle) {
    const rad = (obj.angle * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    w = obj.width * c + obj.height * s;
    h = obj.width * s + obj.height * c;
  }
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
}

function unionBounds(list: Bounds[]): Bounds {
  return {
    left: Math.min(...list.map(b => b.left)),
    top: Math.min(...list.map(b => b.top)),
    right: Math.max(...list.map(b => b.right)),
    bottom: Math.max(...list.map(b => b.bottom))
  };
}

/**
 * Căn các đối tượng đã chọn.
 * - 1 đối tượng: căn vào phôi tem.
 * - Từ 2 đối tượng: căn theo khung bao của cả nhóm được chọn.
 */
export function alignObjects(
  objects: LabelObject[],
  ids: string[],
  mode: AlignMode,
  labelW: number,
  labelH: number
): LabelObject[] {
  const selected = objects.filter(o => ids.includes(o.id));
  if (selected.length === 0) return objects;

  const boundsById = new Map(selected.map(o => [o.id, getVisualBounds(o, labelW, labelH)]));
  const target: Bounds =
    selected.length === 1
      ? { left: 0, top: 0, right: labelW, bottom: labelH }
      : unionBounds([...boundsById.values()]);

  return objects.map(o => {
    const b = boundsById.get(o.id);
    if (!b) return o;
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case 'left': dx = target.left - b.left; break;
      case 'right': dx = target.right - b.right; break;
      case 'hcenter': dx = (target.left + target.right) / 2 - (b.left + b.right) / 2; break;
      case 'top': dy = target.top - b.top; break;
      case 'bottom': dy = target.bottom - b.bottom; break;
      case 'vmiddle': dy = (target.top + target.bottom) / 2 - (b.top + b.bottom) / 2; break;
    }
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return o;
    return { ...o, x: round1(o.x + dx), y: round1(o.y + dy) };
  });
}

/**
 * Phân bố đều khoảng cách giữa các đối tượng (cần từ 3 đối tượng).
 * Hai đối tượng ngoài cùng giữ nguyên, các đối tượng ở giữa được dàn đều khoảng hở.
 */
export function distributeObjects(
  objects: LabelObject[],
  ids: string[],
  axis: DistributeAxis,
  labelW: number,
  labelH: number
): LabelObject[] {
  const selected = objects.filter(o => ids.includes(o.id));
  if (selected.length < 3) return objects;

  const horizontal = axis === 'horizontal';
  const items = selected
    .map(o => {
      const b = getVisualBounds(o, labelW, labelH);
      return { id: o.id, b, start: horizontal ? b.left : b.top, size: horizontal ? b.right - b.left : b.bottom - b.top };
    })
    .sort((a, c) => a.start - c.start);

  const first = items[0];
  const last = items[items.length - 1];
  const totalSize = items.reduce((sum, it) => sum + it.size, 0);
  const span = last.start + last.size - first.start;
  const gap = (span - totalSize) / (items.length - 1);

  const delta = new Map<string, number>();
  let cursor = first.start + first.size + gap;
  for (let i = 1; i < items.length - 1; i++) {
    delta.set(items[i].id, cursor - items[i].start);
    cursor += items[i].size + gap;
  }

  return objects.map(o => {
    const d = delta.get(o.id);
    if (d === undefined || Math.abs(d) < 1e-6) return o;
    return horizontal ? { ...o, x: round1(o.x + d) } : { ...o, y: round1(o.y + d) };
  });
}

/** Đổi thứ tự lớp của các đối tượng đã chọn. */
export function reorderObjects(objects: LabelObject[], ids: string[], action: OrderAction): LabelObject[] {
  const sel = new Set(ids);
  if (!objects.some(o => sel.has(o.id))) return objects;

  if (action === 'front') {
    return [...objects.filter(o => !sel.has(o.id)), ...objects.filter(o => sel.has(o.id))];
  }
  if (action === 'back') {
    return [...objects.filter(o => sel.has(o.id)), ...objects.filter(o => !sel.has(o.id))];
  }

  const arr = [...objects];
  if (action === 'forward') {
    // Duyệt từ trên xuống: mỗi đối tượng chọn đổi chỗ với đối tượng KHÔNG chọn ngay phía trên nó
    for (let i = arr.length - 2; i >= 0; i--) {
      if (sel.has(arr[i].id) && !sel.has(arr[i + 1].id)) {
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
    }
  } else {
    for (let i = 1; i < arr.length; i++) {
      if (sel.has(arr[i].id) && !sel.has(arr[i - 1].id)) {
        [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      }
    }
  }
  return arr;
}

/** Nhân đôi các đối tượng đã chọn (lệch 2 mm), đặt ngay phía trên chúng trong thứ tự lớp. */
export function duplicateObjects(
  objects: LabelObject[],
  ids: string[],
  makeId: (original: LabelObject, index: number) => string,
  offsetMm = 2
): { objects: LabelObject[]; newIds: string[] } {
  const sel = new Set(ids);
  const copies: LabelObject[] = [];
  objects.forEach(o => {
    if (!sel.has(o.id)) return;
    copies.push({
      ...JSON.parse(JSON.stringify(o)),
      id: makeId(o, copies.length),
      x: round1(o.x + offsetMm),
      y: round1(o.y + offsetMm)
    });
  });
  if (copies.length === 0) return { objects, newIds: [] };
  return { objects: [...objects, ...copies], newIds: copies.map(c => c.id) };
}
