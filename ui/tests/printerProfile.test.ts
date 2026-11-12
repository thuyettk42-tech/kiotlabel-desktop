import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileOf, pickLabelDpi, resolveMode, alternativeMode, PrinterFacts } from '../src/utils/printerProfile.ts';
import { needsRaster } from '../src/utils/printerBitmap.ts';

// Danh sách máy in thật của máy phát triển (tên, driver, cổng, máy in ảo, DPI)
const REAL: Record<string, PrinterFacts> = {
  'A8 MiniPrinter': { name: 'A8 MiniPrinter', driver: 'A8 MiniPrinter', port: 'COM1:', dpi: [203] },
  'EPSON LQ-310 ESC/P2': { name: 'EPSON LQ-310 ESC/P2', driver: 'EPSON LQ-310 ESC/P2', port: 'LPT1:', dpi: [360, 180, 120] },
  'EPSON TM-T88IV Receipt': { name: 'EPSON TM-T88IV Receipt', driver: 'EPSON TM-T88IV ReceiptE4', port: 'COM3:', dpi: [180] },
  'Fax': { name: 'Fax', driver: 'Microsoft Shared Fax Driver', port: 'SHRFAX:', virtual: true, dpi: [200] },
  'LPQ80(ESC)': { name: 'LPQ80(ESC)', driver: 'LPQ80(ESC)', port: 'LPT1:', dpi: [203] },
  'Microsoft Print to PDF': { name: 'Microsoft Print to PDF', driver: 'Microsoft Print To PDF', port: 'PORTPROMPT:', virtual: true, dpi: [600] },
  'Microsoft XPS Document Writer': { name: 'Microsoft XPS Document Writer', driver: 'Microsoft XPS Document Writer v4', port: 'PORTPROMPT:', virtual: true, dpi: [600] },
  'OneNote (Desktop)': { name: 'OneNote (Desktop)', driver: 'Send to Microsoft OneNote 16 Driver', port: 'nul:', virtual: true, dpi: [600, 1200] },
  'POS-80C': { name: 'POS-80C', driver: 'POS-80C', port: 'LPT1:', dpi: [203] },
  'TSC TE200': { name: 'TSC TE200', driver: 'TSC TE200', port: 'FILE:', maxWidthMm: 112, dpi: [203] },
  'ZDesigner GT800 (EPL)': { name: 'ZDesigner GT800 (EPL)', driver: 'ZDesigner GT800 (EPL)', port: 'LPT1:', maxWidthMm: 108, dpi: [203] },
};

test('máy in thật của máy phát triển: TSC dùng TSPL, tất cả máy còn lại vẽ trang (kể cả ZDesigner EPL)', () => {
  const modes = Object.fromEntries(Object.entries(REAL).map(([k, v]) => [k, profileOf(v).mode]));
  assert.equal(modes['TSC TE200'], 'tspl');
  // ZDesigner GT800 (EPL) KHÔNG nhận ZPL: gửi ZPL sẽ ra chữ rác
  assert.equal(modes['ZDesigner GT800 (EPL)'], 'sheet');
  for (const n of ['A8 MiniPrinter', 'EPSON LQ-310 ESC/P2', 'EPSON TM-T88IV Receipt', 'Fax', 'LPQ80(ESC)', 'Microsoft Print to PDF', 'Microsoft XPS Document Writer', 'OneNote (Desktop)', 'POS-80C'])
    assert.equal(modes[n], 'sheet', n);
});

test('Zebra/ZDesigner không phải EPL dùng ZPL; TSC các dòng TE/TTP/DA dùng TSPL', () => {
  for (const n of ['ZDesigner ZD420-203dpi ZPL', 'ZDesigner GK420t', 'Zebra ZT230', 'ZDesigner GX430t']) assert.equal(profileOf({ name: n }).mode, 'zpl', n);
  for (const n of ['TSC TTP-244 Pro', 'TSC TE210', 'TSC DA220', 'TSC TX200', 'TSC ALPHA-3R']) assert.equal(profileOf({ name: n }).mode, 'tspl', n);
  assert.equal(profileOf({ name: 'ZDesigner GK420t' }).confidence, 'high');
});

test('Xprinter/Gprinter/HPRT nhãn dùng TSPL (độ tin cậy trung bình), máy in hóa đơn cùng hãng thì vẽ trang', () => {
  for (const n of ['Xprinter XP-420B', 'Xprinter XP-365B', 'Gprinter GP-1324D', 'HPRT HT300', 'Xprinter XP-D465B']) {
    const p = profileOf({ name: n });
    assert.equal(p.mode, 'tspl', n);
    assert.equal(p.confidence, 'medium');
    assert.equal(p.labelCapable, true);
  }
  for (const n of ['Xprinter XP-80C', 'Xprinter XP-58IIH', 'XP-80']) assert.equal(profileOf({ name: n }).mode, 'sheet', n);
});

test('Godex (EZPL) và hãng khác vẽ trang nhưng cho phép thử lệnh gốc; laser/phun vẽ trang', () => {
  const g = profileOf({ name: 'Godex G500' });
  assert.equal(g.mode, 'sheet');
  assert.equal(g.labelCapable, true);
  assert.equal(g.language, 'zpl');
  for (const n of ['HP LaserJet Pro M404', 'Canon LBP2900', 'Epson L3150 Series', 'Brother HL-L2321D', 'Argox OS-214', 'Brother QL-820NWB', 'Datamax E-4204']) assert.equal(profileOf({ name: n }).mode, 'sheet', n);
  assert.equal(profileOf({ name: 'Máy in lạ XYZ' }).mode, 'sheet');
});

test('độ phân giải: lấy 203/300/600 trong danh sách của driver, chuẩn hóa giá trị lạ', () => {
  assert.equal(pickLabelDpi([203]), 203);
  assert.equal(pickLabelDpi([300, 600]), 300);
  assert.equal(pickLabelDpi([360, 180, 120]), 300); // không có giá trị chuẩn: lấy chuẩn gần giá trị đầu
  assert.equal(pickLabelDpi([]), 203);
  assert.equal(pickLabelDpi(undefined), 203);
  assert.equal(profileOf({ name: 'TSC TE300', dpi: [300] }).dpi, 300);
});

test('cách in hiệu lực: giấy văn phòng luôn vẽ trang; ghi đè của người dùng thắng tự chọn; cách khác để thử khi in sai', () => {
  const tsc = profileOf(REAL['TSC TE200']);
  assert.equal(resolveMode(tsc, undefined, false), 'tspl');
  assert.equal(resolveMode(tsc, 'sheet', false), 'sheet');
  assert.equal(resolveMode(tsc, 'zpl', true), 'sheet');
  assert.equal(alternativeMode(tsc, 'tspl'), 'sheet');
  assert.equal(alternativeMode(tsc, 'sheet'), 'tspl');
  const god = profileOf({ name: 'Godex G500' });
  assert.equal(alternativeMode(god, 'sheet'), 'zpl');
});

test('chữ tiếng Việt có dấu được dựng thành ảnh khi in bằng lệnh gốc (không phụ thuộc font nạp trong máy in)', () => {
  assert.equal(needsRaster({ id: 'a', type: 'text', x: 0, y: 0, width: 20, height: 5, content: 'Áo thun nam' } as any), true);
  assert.equal(needsRaster({ id: 'b', type: 'text', x: 0, y: 0, width: 20, height: 5, content: 'ao thun', prefixText: 'Giá: ', suffixText: 'đ' } as any), true);
  assert.equal(needsRaster({ id: 'c', type: 'text', x: 0, y: 0, width: 20, height: 5, content: 'ABC 123 - OK' } as any), false);
  assert.equal(needsRaster({ id: 'd', type: 'barcode', x: 0, y: 0, width: 20, height: 8, content: '8930000000001' } as any), false);
});
