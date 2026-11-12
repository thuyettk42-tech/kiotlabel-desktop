/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Cầu nối tới máy chủ cục bộ của KiotLabel bản desktop (portable). Bản web thường không có máy chủ này:
// khi trang không có thẻ meta mã xác thực (do máy chủ desktop chèn vào HTML), mọi hàm ở đây trả về "không phải desktop"
// mà không gọi mạng.

export interface DesktopInfo {
  version: string;
  platform: string;
  rawPrint: boolean;
}

export interface DesktopPrinter {
  name: string;
  isDefault: boolean;
  /** Dữ kiện từ Windows để tự chọn cách in (có thể thiếu ở máy chủ macOS/Linux). */
  driver?: string;
  port?: string;
  virtual?: boolean;
  maxWidthMm?: number;
  maxHeightMm?: number;
  dpi?: number[];
}

// (không dùng union phân biệt vì dự án tắt strict nên TypeScript không thu hẹp kiểu theo ok)
export interface DesktopResult<T> { ok: boolean; data?: T; error?: string }

function token(): string | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('meta[name="kiotlabel-desktop-token"]');
  const t = el && el.getAttribute('content');
  return t && t.length >= 16 ? t : null;
}

async function api(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<any> {
  const t = token();
  if (!t) throw new Error('Không phải bản desktop.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), init?.timeoutMs ?? 20000);
  try {
    const res = await fetch('/api/desktop/' + path, {
      ...init,
      signal: ctl.signal,
      headers: { 'x-kiotlabel-token': t, ...(init?.headers || {}) },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.error || `Lỗi ${res.status}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** Trả về thông tin bản desktop, hoặc null nếu đang chạy như trang web thường. */
export async function detectDesktop(): Promise<DesktopInfo | null> {
  if (!token()) return null;
  try {
    const j = await api('info');
    return { version: String(j.version || ''), platform: String(j.platform || ''), rawPrint: !!j.rawPrint };
  } catch {
    return null;
  }
}

export async function listDesktopPrinters(refresh = false): Promise<DesktopResult<DesktopPrinter[]>> {
  try {
    const j = await api('printers' + (refresh ? '?refresh=1' : ''));
    return { ok: true, data: Array.isArray(j.printers) ? j.printers : [] };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Gửi dữ liệu thô (ZPL/TSPL) thẳng tới máy in. */
export async function printRawDesktop(printer: string, bytes: Uint8Array, docName: string): Promise<DesktopResult<{ bytes: number }>> {
  try {
    const q = new URLSearchParams({ printer, doc: docName });
    const j = await api('print-raw?' + q.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes as unknown as BodyInit,
      timeoutMs: 180000,
    });
    return { ok: true, data: { bytes: Number(j.bytes) || bytes.length } };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Gửi trang vẽ (danh sách lệnh vẽ từ buildVectorOps) để KiotLabel.exe vẽ thẳng ra máy in thường (A4/A5) bằng GDI, không qua PDF.
 * Chỉ có ở bản desktop Windows.
 */
export async function printSheetDesktop(printer: string, job: unknown, docName: string): Promise<DesktopResult<{ pages: number; warnings: string[] }>> {
  try {
    const q = new URLSearchParams({ printer, doc: docName });
    const j = await api('print-sheet?' + q.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(job),
      timeoutMs: 600000,
    });
    return { ok: true, data: { pages: Number(j.pages) || 0, warnings: Array.isArray(j.warnings) ? j.warnings.map(String) : [] } };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Báo cho máy chủ biết trang còn mở (máy chủ tự thoát khi không còn trang nào). Trả về hàm dừng. */
export function startDesktopHeartbeat(): () => void {
  const beat = () => { api('heartbeat', { method: 'POST', timeoutMs: 5000 }).catch(() => {}); };
  beat();
  const id = setInterval(beat, 8000);
  return () => clearInterval(id);
}
