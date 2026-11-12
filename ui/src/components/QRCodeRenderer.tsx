/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, memo } from "react";
import QRCode from "qrcode";

interface QRCodeRendererProps {
  content: string;
  size?: number; // in pt/px
  textFlowOrigin?: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  color?: string;
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
}

// Bộ nhớ đệm ảnh QR: in từ Excel có hàng trăm tem dùng chung vài chục nội dung QR; mỗi ảnh QR
// (800-1500 px) tốn hàng chục ms để sinh nên chỉ sinh một lần cho mỗi bộ tham số.
const QR_CACHE_LIMIT = 300;
const qrCache = new Map<string, string>();
const qrPending = new Map<string, Promise<string>>();

function qrKey(content: string, renderSize: number, color: string | undefined, ec: string) {
  return `${renderSize}|${color || ""}|${ec}|${content}`;
}

function getQrDataUrl(content: string, renderSize: number, color: string | undefined, ec: 'L' | 'M' | 'Q' | 'H'): Promise<string> {
  const key = qrKey(content, renderSize, color, ec);
  const hit = qrCache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = qrPending.get(key);
  if (pending) return pending;
  const task = QRCode.toDataURL(content, {
    width: renderSize,
    margin: 0,
    color: { dark: color || "#000000", light: "#ffffff" },
    errorCorrectionLevel: ec
  }).then((url) => {
    if (qrCache.size >= QR_CACHE_LIMIT) qrCache.delete(qrCache.keys().next().value as string);
    qrCache.set(key, url);
    return url;
  }).finally(() => { qrPending.delete(key); });
  qrPending.set(key, task);
  return task;
}

function qrRenderSize(size: number) {
  return Math.max(800, Math.min(1500, Math.round(size * 6)));
}

export const QRCodeRenderer = memo(function QRCodeRenderer({ 
  content, 
  size = 120, 
  textFlowOrigin = "center", 
  color,
  errorCorrection = 'H'
}: QRCodeRendererProps) {
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>(
    () => qrCache.get(qrKey(content.trim(), qrRenderSize(size), color, errorCorrection)) || ""
  );

  useEffect(() => {
    const cleanContent = content.trim();
    if (!cleanContent) {
      setError("Nội dung trống");
      return;
    }

    setError(null);

    // Make sure we have high definition rendering for print. High DPI printing requires a large source image
    // to prevent pixelation, distortion, or blurred lines in the print output/PDF export.
    // Any size from 600px to 1200px provides ultra-high resolution without slowing down the DOM.
    const renderSize = qrRenderSize(size);

    let cancelled = false;
    getQrDataUrl(cleanContent, renderSize, color, errorCorrection)
    .then((url) => {
      if (!cancelled) setQrDataUrl(url);
    })
    .catch((err) => {
      if (cancelled) return;
      const msg = String(err?.message || err || "");
      if (/too big|too long|amount of data/i.test(msg)) {
        // Thông báo dễ hiểu thay cho lỗi chung chung của thư viện
        const hint = errorCorrection === "L" ? "Hãy rút ngắn nội dung." : "Hãy rút ngắn nội dung hoặc chọn mức sửa lỗi thấp hơn (L).";
        setError(`Dữ liệu quá dài cho QR (${cleanContent.length} ký tự, mức ${errorCorrection}). ${hint}`);
      } else {
        console.error("QR Code execution failed:", err);
        setError("Lỗi render QR Code");
      }
    });
    return () => { cancelled = true; };
  }, [content, size, color, errorCorrection]);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-1 border border-dashed border-red-300 bg-red-50 text-red-500 rounded text-center select-none overflow-hidden">
        <span className="font-bold text-[10px] select-none">⚠️ {error}</span>
      </div>
    );
  }

  if (!qrDataUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center p-0.5 bg-transparent overflow-hidden">
        <div className="w-4/5 h-4/5 bg-gray-100/50 border border-gray-200 animate-pulse rounded" />
      </div>
    );
  }

  const origin = textFlowOrigin || "center";
  
  let justifyClass = "justify-start";
  if (origin.startsWith("top")) {
    justifyClass = "justify-start";
  } else if (origin.startsWith("center") || origin === "center") {
    justifyClass = "justify-center";
  } else if (origin.startsWith("bottom")) {
    justifyClass = "justify-end";
  }

  let alignClass = "items-start";
  if (origin.endsWith("left")) {
    alignClass = "items-start";
  } else if (origin === "center" || origin.endsWith("center")) {
    alignClass = "items-center";
  } else if (origin.endsWith("right")) {
    alignClass = "items-end";
  }

  return (
    <div className={`w-full h-full flex ${justifyClass === "justify-start" ? "items-start" : justifyClass === "justify-end" ? "items-end" : "items-center"} ${alignClass === "items-start" ? "justify-start" : alignClass === "items-end" ? "justify-end" : "justify-center"} p-0.5 bg-transparent overflow-hidden`}>
      <img
        src={qrDataUrl}
        alt="QR Code"
        className="w-full h-full pointer-events-none select-none max-w-full max-h-full"
        style={{
          boxSizing: 'border-box',
          objectFit: 'contain',
          display: 'block',
          imageRendering: 'auto',
        }}
        referrerPolicy="no-referrer"
      />
    </div>
  );
});
