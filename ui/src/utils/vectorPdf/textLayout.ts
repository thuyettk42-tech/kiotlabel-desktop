/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Dàn trang văn bản cho PDF vector (hàm thuần, không phụ thuộc trình duyệt nên test được bằng node).
// Mô phỏng cách bàn thiết kế hiển thị: `white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.25`,
// nhiều đoạn (tiền tố, nội dung, hậu tố) nằm trên cùng một dòng, mỗi đoạn có cỡ chữ/kiểu chữ riêng.

/** Khoá font: họ chữ rút gọn + đậm/nghiêng. Việc nạp tệp font nằm ở nơi khác. */
export interface FontKey {
  family: 'sans' | 'serif' | 'mono';
  bold: boolean;
  italic: boolean;
}

export interface TextSeg {
  text: string;
  /** Cỡ chữ tính bằng mm. */
  size: number;
  font: FontKey;
  color: string;
  underline?: boolean;
  strike?: boolean;
  /** Chỉ số trên/dưới: chữ nhỏ 70% và dịch lên/xuống. */
  shift?: 'normal' | 'subscript' | 'superscript';
}

export interface Measurer {
  /** Bề rộng (mm) của chuỗi với font và cỡ chữ (mm). */
  width(text: string, font: FontKey, size: number): number;
  /** Ascent và descent của font theo tỉ lệ cỡ chữ (ví dụ 0.905 và 0.212 với Arial). */
  ascent(font: FontKey): number;
  descent(font: FontKey): number;
}

export interface LaidRun {
  text: string;
  seg: TextSeg;
  /** Cỡ chữ thực dùng (đã nhân 70% nếu là chỉ số trên/dưới). */
  size: number;
  width: number;
  /** Độ dịch đường cơ sở so với đường cơ sở của dòng (dương = lên trên), mm. */
  lift: number;
}

export interface LaidLine {
  runs: LaidRun[];
  /** Bề rộng nội dung, không tính khoảng trắng cuối dòng. */
  width: number;
  /** Chiều cao hộp dòng (mm). */
  height: number;
  /** Khoảng cách từ mép trên hộp dòng tới đường cơ sở (mm). */
  baseline: number;
}

export const LINE_HEIGHT = 1.25;

type Token = { text: string; seg: TextSeg; space: boolean; hardBreak?: boolean };

function tokenize(segs: TextSeg[]): Token[] {
  const tokens: Token[] = [];
  for (const seg of segs) {
    const parts = seg.text.split('\n');
    parts.forEach((part, pi) => {
      if (pi > 0) tokens.push({ text: '', seg, space: false, hardBreak: true });
      const re = /(\s+|\S+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(part))) tokens.push({ text: m[1], seg, space: /^\s/.test(m[1]) });
    });
  }
  return tokens;
}

function runMetrics(run: { seg: TextSeg; size: number; lift: number }, m: Measurer) {
  const asc = m.ascent(run.seg.font) * run.size;
  const desc = m.descent(run.seg.font) * run.size;
  const lineH = LINE_HEIGHT * run.size;
  const halfLeading = (lineH - (asc + desc)) / 2;
  const above = halfLeading + asc + run.lift; // từ mép trên hộp dòng tới đường cơ sở của run
  const below = lineH - halfLeading - asc - run.lift;
  return { above, below };
}

function finishLine(runs: LaidRun[], m: Measurer, minSize: number, font: FontKey): LaidLine {
  // Dòng rỗng vẫn có chiều cao theo cỡ chữ của đoạn đầu tiên
  let above = 0;
  let below = 0;
  for (const r of runs) {
    const k = runMetrics(r, m);
    above = Math.max(above, k.above);
    below = Math.max(below, k.below);
  }
  if (!runs.length) {
    const k = runMetrics({ seg: { text: '', size: minSize, font, color: '#000' }, size: minSize, lift: 0 }, m);
    above = k.above;
    below = k.below;
  }
  // Bề rộng nội dung: bỏ khoảng trắng cuối dòng (treo ra ngoài như pre-wrap)
  let width = runs.reduce((n, r) => n + r.width, 0);
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    const trailing = r.text.length - r.text.trimEnd().length;
    if (trailing === 0) break;
    width -= m.width(r.text.slice(r.text.length - trailing), r.seg.font, r.size);
    if (trailing < r.text.length) break; // run này còn chữ: dừng
  }
  return { runs, width: Math.max(0, width), height: above + below, baseline: above };
}

/**
 * Xếp các đoạn chữ thành các dòng trong bề rộng `maxWidth` (mm). Tối đa `maxLines` dòng: dòng cuối bị cắt
 * và thêm "..." nếu còn chữ dư (giống cách bàn thiết kế rút gọn chữ tràn).
 */
export function layoutSegments(segs: TextSeg[], maxWidth: number, m: Measurer, maxLines = Infinity): LaidLine[] {
  const base = segs[0];
  const minSize = base ? base.size : 3;
  const baseFont: FontKey = base ? base.font : { family: 'sans', bold: false, italic: false };
  const tokens = tokenize(segs);
  const lines: LaidLine[] = [];
  let runs: LaidRun[] = [];
  let used = 0;
  let truncated = false;

  const push = () => {
    lines.push(finishLine(runs, m, minSize, baseFont));
    runs = [];
    used = 0;
  };
  const sizeOf = (seg: TextSeg) => (seg.shift && seg.shift !== 'normal' ? seg.size * 0.7 : seg.size);
  const liftOf = (seg: TextSeg) => (seg.shift === 'superscript' ? seg.size * 0.34 : seg.shift === 'subscript' ? -seg.size * 0.2 : 0);
  const addRun = (text: string, seg: TextSeg) => {
    const size = sizeOf(seg);
    const width = m.width(text, seg.font, size);
    runs.push({ text, seg, size, width, lift: liftOf(seg) });
    used += width;
  };

  for (const t of tokens) {
    if (lines.length >= maxLines) { truncated = true; break; }
    if (t.hardBreak) { push(); continue; }
    const size = sizeOf(t.seg);
    const w = m.width(t.text, t.seg.font, size);
    if (t.space) {
      // Khoảng trắng luôn nằm lại cuối dòng hiện tại (treo), không đẩy xuống dòng mới
      addRun(t.text, t.seg);
      continue;
    }
    if (used + w <= maxWidth + 1e-6 || (runs.length === 0 && w <= maxWidth)) {
      addRun(t.text, t.seg);
      continue;
    }
    if (runs.length > 0) {
      push();
      if (lines.length >= maxLines) { truncated = true; break; }
    }
    if (w <= maxWidth) {
      addRun(t.text, t.seg);
      continue;
    }
    // Từ dài hơn cả dòng: bẻ theo ký tự (overflow-wrap: anywhere)
    let rest = t.text;
    while (rest.length > 0) {
      let cut = rest.length;
      while (cut > 1 && m.width(rest.slice(0, cut), t.seg.font, size) > maxWidth - used) cut--;
      addRun(rest.slice(0, cut), t.seg);
      rest = rest.slice(cut);
      if (rest.length > 0) {
        push();
        if (lines.length >= maxLines) { truncated = true; break; }
      }
    }
    if (truncated) break;
  }
  if (runs.length > 0 || lines.length === 0) {
    if (lines.length < maxLines) push();
    else if (runs.length > 0) truncated = true;
  }

  if (truncated && lines.length > 0) {
    // Dòng cuối: bớt ký tự cho vừa chỗ của "..."
    const last = lines[lines.length - 1];
    const lastRunSeg = last.runs.length ? last.runs[last.runs.length - 1].seg : base;
    const dotsW = m.width('...', lastRunSeg.font, sizeOf(lastRunSeg));
    const rebuilt: LaidRun[] = last.runs.map((r) => ({ ...r }));
    let total = rebuilt.reduce((n, r) => n + r.width, 0);
    while (rebuilt.length && total + dotsW > maxWidth) {
      const r = rebuilt[rebuilt.length - 1];
      const chars = Array.from(r.text);
      chars.pop();
      if (chars.length === 0) { rebuilt.pop(); total = rebuilt.reduce((n, x) => n + x.width, 0); continue; }
      r.text = chars.join('');
      r.width = m.width(r.text, r.seg.font, r.size);
      total = rebuilt.reduce((n, x) => n + x.width, 0);
    }
    const dotSeg = rebuilt.length ? rebuilt[rebuilt.length - 1].seg : lastRunSeg;
    rebuilt.push({ text: '...', seg: dotSeg, size: sizeOf(dotSeg), width: dotsW, lift: liftOf(dotSeg) });
    lines[lines.length - 1] = finishLine(rebuilt, m, minSize, baseFont);
  }
  return lines;
}
