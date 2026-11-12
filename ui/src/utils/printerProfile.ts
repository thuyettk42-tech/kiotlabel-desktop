/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Nhận diện máy in để bản desktop TỰ CHỌN cách in tốt nhất, người dùng chỉ cần chọn máy in rồi bấm In:
//  - máy in tem nhận ZPL/TSPL (nhận diện chắc chắn qua tên máy in/driver): gửi lệnh gốc (nét, nhanh, mã vạch/QR quét chắc);
//  - mọi máy in còn lại (laser, phun, in kim, máy in hóa đơn, máy in ảo, máy in tem dùng ngôn ngữ khác như EPL/EZPL): VẼ TRANG trực tiếp qua driver Windows,
//    cách này chạy được với mọi driver.
// Dữ kiện lấy từ Windows (EnumPrinters + DeviceCapabilities): tên, driver, cổng, máy in ảo, khổ giấy tối đa, độ phân giải. Chỉ dựa vào tên là chính; sai thì
// người dùng đổi một lần và ứng dụng nhớ theo từng máy in.

export interface PrinterFacts {
  name: string;
  driver?: string;
  port?: string;
  virtual?: boolean;
  maxWidthMm?: number;
  dpi?: number[];
}

/** Cách in cụ thể: lệnh ZPL, lệnh TSPL, hoặc vẽ trang qua driver. */
export type PrintMode = 'zpl' | 'tspl' | 'sheet';

export interface PrinterProfile {
  /** Cách in nên dùng khi người dùng chưa đổi. */
  mode: PrintMode;
  /** Độ phân giải máy in (chỉ có ý nghĩa với lệnh ZPL/TSPL): 203, 300 hoặc 600. */
  dpi: number;
  /** high: tên/driver khớp rõ; medium: khớp một họ máy in nhưng ngôn ngữ có thể phải đổi; low: đoán. */
  confidence: 'high' | 'medium' | 'low';
  /** Giải thích ngắn (tiếng Việt) để hiện cho người dùng và để kiểm thử. */
  reason: string;
  /** Máy in tem nhận lệnh gốc (có thể thử cách ZPL/TSPL). */
  labelCapable: boolean;
  /** Ngôn ngữ lệnh nên thử nếu người dùng chuyển từ "vẽ trang" sang lệnh gốc. */
  language?: 'zpl' | 'tspl';
}

const has = (s: string, re: RegExp) => re.test(s);

/** Chọn độ phân giải chuẩn gần nhất trong 203/300/600 từ danh sách của driver (ưu tiên giá trị đầu tiên là chuẩn). */
export function pickLabelDpi(dpi: number[] | undefined): number {
  const std = [203, 300, 600];
  const list = (dpi || []).filter((n) => n > 0);
  for (const n of list) if (std.includes(n)) return n;
  if (list.length === 0) return 203;
  const n = list[0];
  return std.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), 203);
}

export function profileOf(p: PrinterFacts): PrinterProfile {
  const text = `${p.name} ${p.driver || ''}`.toLowerCase();
  const dpi = pickLabelDpi(p.dpi);
  const sheet = (reason: string, labelCapable = false, language?: 'zpl' | 'tspl'): PrinterProfile =>
    ({ mode: 'sheet', dpi, confidence: labelCapable ? 'medium' : 'high', reason, labelCapable, language });

  // 1. Máy in ảo (PDF, XPS, OneNote, Fax): không có lệnh gốc
  if (p.virtual || has(text, /microsoft print to pdf|xps document writer|onenote|\bfax\b|pdf (printer|creator)|cutepdf|foxit reader pdf/)) {
    return sheet('Máy in ảo: vẽ trang trực tiếp (hoặc dùng Lưu thành PDF).');
  }

  // 2. Máy in tem dùng ngôn ngữ KHÁC (EPL, EZPL, DPL, PPLA/B, SBPL...): không gửi ZPL/TSPL, vẽ trang qua driver
  if (has(text, /\(epl\)|\bepl2?\b/)) return sheet('Máy in tem dùng ngôn ngữ EPL (không phải ZPL/TSPL): vẽ trang qua driver.');
  if (has(text, /godex|\bez-?\d|\bg500|\bg530|\brt\d{3}|\bdt\d{3}|\bze\d{3}/)) return sheet('Máy in tem Godex (ngôn ngữ EZPL): vẽ trang qua driver; nếu máy đã bật chế độ ZPL thì chọn "Lệnh ZPL" một lần.', true, 'zpl');
  if (has(text, /argox|datamax|\bsato\b|honeywell|intermec|brother ql|brother pt|\bdymo\b|labelwriter|\bcab\b|primera|epson tm-c|epson colorworks/)) return sheet('Máy in tem hãng khác (ngôn ngữ riêng): vẽ trang qua driver.');

  // 3. Máy in hóa đơn (ESC/POS), máy in kim (ESC/P): vẽ trang qua driver
  if (has(text, /esc\/?pos|\btm-[a-z]?\d|\btm-t|\btm-m|pos-?\d{2}|pos ?(58|80)|receipt|hóa đơn|\ba8 mini|lpq|\brp-?\d{2,3}\b|\bsrp-|\btsp\d|xp-?(58|80|76)|\bct-?s\d{3}\b|thermal receipt/)) return sheet('Máy in hóa đơn (ESC/POS): vẽ trang qua driver.');
  if (has(text, /esc\/?p2?\b|\blq-?\d|\blx-?\d|\bfx-?\d|dot ?matrix|\bkim\b|\bpr\d{3}|\bdfx-?\d/)) return sheet('Máy in kim: vẽ trang qua driver.');

  // 4. Máy in tem NHẬN LỆNH GỐC: ZPL (Zebra) và TSPL (TSC, Xprinter, Gprinter, HPRT...)
  if (has(text, /zebra|zdesigner|\bzpl\b|\bzt\d{3}|\bzd\d{3}|\bgk\d{3}|\bgx\d{3}|\bgt\d{3}|\bzq\d{3}|\bzm\d{3}|\bzp\d{3}|\bzt\d{2}\b/)) {
    return { mode: 'zpl', dpi, confidence: 'high', reason: 'Máy in tem Zebra/ZPL: gửi lệnh ZPL.', labelCapable: true, language: 'zpl' };
  }
  if (has(text, /\btsc\b|\bttp-?\d|\bte\d{3}\b|\bde\d{3}\b|\bda\d{3}\b|\bdh\d{3}\b|\bmh\d{3}\b|\bmb\d{3}\b|\balpha-?\d|\bttp\b|\btdp-?\d|\btc\d{3}\b|\bt\d{3}\b.*tsc/)) {
    return { mode: 'tspl', dpi, confidence: 'high', reason: 'Máy in tem TSC/TSPL: gửi lệnh TSPL.', labelCapable: true, language: 'tspl' };
  }
  if (has(text, /xprinter|\bxp-?(\d{3}b|3\d{2}|4\d{2}|d\d{3}|t\d{3})|gprinter|\bgp-?(1\d{3}|2\d{3}|3\d{3})|hprt|\bht\d{3}|idprt|\bsp-?[a-z]\d{3}|munbyn|\bnetum|\bdeli ?(dl|label)|\bhoin|\bsnbc|\bposcom|\bzjiang|\bjadens|\bshiny|label printer|máy in tem|may in tem|barcode printer|bar ?code/)) {
    return { mode: 'tspl', dpi, confidence: 'medium', reason: 'Máy in tem phổ biến (thường nhận TSPL): gửi lệnh TSPL; nếu tem in sai, đổi sang ZPL hoặc vẽ trang một lần.', labelCapable: true, language: 'tspl' };
  }

  // 5. Mặc định: máy in thường (laser/phun/...) hoặc không rõ: vẽ trang trực tiếp (chạy với mọi driver)
  return sheet('Máy in thường hoặc chưa nhận diện được: vẽ trang trực tiếp qua driver.');
}

/** Cách in hiệu lực: ghi đè của người dùng (nếu có) hoặc tự chọn theo máy in; giấy văn phòng luôn vẽ trang. */
export function resolveMode(profile: PrinterProfile, override: PrintMode | undefined, officeSheet: boolean): PrintMode {
  if (officeSheet) return 'sheet';
  return override || profile.mode;
}

/** Cách in "khác" để người dùng thử khi bản in chưa đúng: lệnh gốc <-> vẽ trang. */
export function alternativeMode(profile: PrinterProfile, current: PrintMode): PrintMode {
  if (current === 'sheet') return profile.language || 'tspl';
  return 'sheet';
}

export const MODE_LABEL: Record<PrintMode, string> = {
  zpl: 'Lệnh ZPL (máy in tem)',
  tspl: 'Lệnh TSPL (máy in tem)',
  sheet: 'Vẽ trang trực tiếp',
};
