// Đa ngôn ngữ nhẹ cho KiotLabel: tiếng Việt là bản gốc, tiếng Anh (US) tra theo CHÍNH câu tiếng Việt.
// Không phụ thuộc website (cố ý: bản offline .exe dùng chung giao diện này).
// Ngôn ngữ đọc từ localStorage `kv_hub_lang` (cùng khóa với website, cùng origin /intem); không có khóa thì mặc định VI.
// Cách dùng: t("Lưu") -> "Save" khi ở EN; có biến: t("Đã chọn {n} mục", { n }).
import { useSyncExternalStore } from "react";
import { EN } from "./en";

export type Lang = "vi" | "en";
export const LANG_STORAGE_KEY = "kv_hub_lang";

function readStored(): Lang {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(LANG_STORAGE_KEY) : null;
    if (v === "en" || v === "vi") return v;
  } catch {
    /* chế độ riêng tư: bỏ qua */
  }
  return "vi";
}

let current: Lang = readStored();
const listeners = new Set<() => void>();

function applyDocument() {
  if (typeof document !== "undefined") document.documentElement.lang = current === "en" ? "en-US" : "vi";
}
applyDocument();

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, l);
  } catch {
    /* bỏ qua */
  }
  applyDocument();
  listeners.forEach((f) => f());
}

// Website đổi ngôn ngữ ở thẻ khác (cùng origin) thì KiotLabel đang mở cũng đổi theo.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => {
    if (e.key === LANG_STORAGE_KEY) setLang(e.newValue === "en" ? "en" : "vi");
  });
}

function subscribe(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** Gọi trong component để vẽ lại khi đổi ngôn ngữ; trả về ngôn ngữ hiện tại. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => "vi" as Lang);
}

export function translate(lang: Lang, vi: string, vars?: Record<string, string | number>): string {
  let s = lang === "en" ? EN[vi] ?? vi : vi;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/** Dịch theo ngôn ngữ hiện tại (gọi lúc hiển thị, KHÔNG gọi ở mức module vì không tự cập nhật khi đổi ngôn ngữ). */
export function t(vi: string, vars?: Record<string, string | number>): string {
  return translate(current, vi, vars);
}

/** Đánh dấu chuỗi gốc (tiếng Việt) khai báo ở mức module để dịch sau bằng t(biến) lúc hiển thị; trả về nguyên chuỗi. */
export const tk = (vi: string): string => vi;
