/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, memo } from "react";
import JsBarcode from "jsbarcode";
import { BASE_DPI_SCALE, PT_TO_MM_FACTOR } from "../utils";

interface BarcodeRendererProps {
  content: string;
  format?: "CODE128" | "EAN13" | "CODE39";
  displayValue?: boolean;
  fontSize?: number;
  barcodeWidth?: number;
  barcodeHeight?: number;
  pixelScale?: number;
  objectHeightMm?: number;
  objectWidthMm?: number;

  barcodeShowTextAbove?: boolean;
  barcodeShowTextBelow?: boolean;
  barcodeFontFamily?: string;
  barcodeFontSize?: number;
  barcodeFontWeight?: "normal" | "bold";
  barcodeFontStyle?: "normal" | "italic";
  barcodeTextMargin?: number;
  textFlowOrigin?:
    | "top-left"
    | "top-center"
    | "top-right"
    | "center-left"
    | "center"
    | "center-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";
  onUpdateContent?: (newVal: string) => void;
  color?: string;
  barcodeTextColor?: string;
}

interface ValidationResult {
  valid: boolean;
  error: string | null;
  encodedContent: string;
  notice?: string | null; // cảnh báo không chặn việc hiển thị
}

// EAN-13 checksum calculation (standard 12-digit base to find 13th digit)
function calculateEAN13Checksum(first12Digits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(first12Digits[i] || "0", 10);
    // Even idx (odd positions) weight is 1. Odd idx (even positions) weight is 3.
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

// Shared dynamic formatter & corrector to safely handle any raw user input gracefully
export function processBarcodeContent(
  content: string,
  format: string,
): ValidationResult {
  const raw = content.trim();
  if (!raw) {
    return { valid: false, error: "Dữ liệu trống", encodedContent: "" };
  }

  if (format === "EAN13") {
    // Keep only digits
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly.length < 12) {
      return {
        valid: false,
        error: "EAN13 yêu cầu ít nhất 12 chữ số",
        encodedContent: "",
      };
    }
    const first12 = digitsOnly.substring(0, 12);
    const checksum = calculateEAN13Checksum(first12);
    const corrected = first12 + checksum;

    // Báo rõ khi dữ liệu nhập bị thay đổi để tránh in ra mã khác với mã đã nhập
    let notice: string | null = null;
    if (digitsOnly.length >= 13 && digitsOnly[12] !== String(checksum)) {
      notice = `Số kiểm tra đã được tính lại: ${digitsOnly[12]} → ${checksum}`;
    } else if (digitsOnly.length > 13) {
      notice = "EAN-13 chỉ dùng 13 chữ số, phần thừa đã bị bỏ";
    } else if (digitsOnly.length !== raw.length) {
      notice = "Các ký tự không phải số đã bị bỏ";
    }
    return { valid: true, error: null, encodedContent: corrected, notice };
  }

  if (format === "CODE39") {
    // Convert to uppercase
    const upper = raw.toUpperCase();
    // Validate characters
    if (!/^[A-Z0-9\s\-\.\$\/\+\%]+$/.test(upper)) {
      return {
        valid: false,
        error:
          "CODE39 chỉ hỗ trợ ký tự chữ hoa, số và [-, ., $, /, +, %, khoảng trắng]",
        encodedContent: "",
      };
    }
    return { valid: true, error: null, encodedContent: upper };
  }

  // DEFAULT (CODE128)
  return { valid: true, error: null, encodedContent: raw };
}

export const BarcodeRenderer = memo(function BarcodeRenderer({
  content,
  format = "CODE128",
  displayValue = true,
  fontSize = 7,
  barcodeWidth = 2,
  barcodeHeight = 15,
  pixelScale,
  objectHeightMm,
  objectWidthMm,
  barcodeShowTextAbove = false,
  barcodeShowTextBelow,
  barcodeFontFamily = "sans",
  barcodeFontSize,
  barcodeFontWeight = "normal",
  barcodeFontStyle = "normal",
  barcodeTextMargin,
  textFlowOrigin = "center",
  onUpdateContent,
  color,
  barcodeTextColor,
}: BarcodeRendererProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [naturalDimensions, setNaturalDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(content);
  const contentBeforeEdit = useRef(content);

  // Synchronize temp value with actual prop updates
  useEffect(() => {
    setTempValue(content);
  }, [content]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    contentBeforeEdit.current = content;
    setIsEditing(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTempValue(val);
    if (onUpdateContent) {
      onUpdateContent(val);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setIsEditing(false);
    } else if (e.key === "Escape") {
      if (onUpdateContent) {
        onUpdateContent(contentBeforeEdit.current);
      }
      setIsEditing(false);
    }
    e.stopPropagation();
  };

  // Process input dynamically during the render cycle
  const validation = processBarcodeContent(content, format);
  const effectiveError = validation.error || renderError;

  // Vạch quá mảnh -> máy quét không đọc được (mã bị bóp nhỏ vừa khung). 1 vạch nhỏ nhất nên >= 0.2 mm.
  const barWidthPx = Math.min(6, Math.max(0.5, Number(barcodeWidth) || 2));
  const moduleCount = naturalDimensions ? naturalDimensions.width / barWidthPx : 0;
  const moduleMm = objectWidthMm && moduleCount > 0 ? objectWidthMm / moduleCount : null;
  const densityWarning =
    !effectiveError && moduleMm !== null && moduleMm < 0.2
      ? `Vạch quá mảnh (${moduleMm.toFixed(2)} mm), khó quét. Hãy rút ngắn dữ liệu hoặc tăng độ rộng khung.`
      : null;
  const warning = validation.notice || densityWarning;
  const effectiveContent = validation.valid ? validation.encodedContent : "";

  const showAbove = barcodeShowTextAbove;
  const showBelow = barcodeShowTextBelow ?? displayValue;
  const finalFontSizePt = barcodeFontSize ?? fontSize;

  useEffect(() => {
    // Clear any previous error before starting
    setRenderError(null);

    if (!svgRef.current) return;
    if (!validation.valid || !effectiveContent) return;

    if (!JsBarcode) {
      setRenderError("Thư viện JsBarcode chưa được tải.");
      return;
    }

    const baseScale = BASE_DPI_SCALE; // Standard system factor of layout reference limits
    const parsedBarcodeHeight = typeof barcodeHeight === "string" ? parseFloat(barcodeHeight) : barcodeHeight;
    const safeBarcodeHeight = (typeof parsedBarcodeHeight === "number" && !isNaN(parsedBarcodeHeight)) ? parsedBarcodeHeight : 15;
    const actualHeight = Math.min(800, Math.max(5, Math.round(safeBarcodeHeight * baseScale)));

    const parsedBarcodeWidth = typeof barcodeWidth === "string" ? parseFloat(barcodeWidth) : barcodeWidth;
    // Độ rộng vạch hợp lệ 0.5 - 6 (đơn vị điểm ảnh/module); giá trị lạ (0, âm, chữ) được đưa về khoảng này
    const safeBarcodeWidth = (typeof parsedBarcodeWidth === "number" && Number.isFinite(parsedBarcodeWidth))
      ? Math.min(6, Math.max(0.5, parsedBarcodeWidth))
      : 2;

    try {
      JsBarcode(svgRef.current, effectiveContent, {
        format: format,
        width: safeBarcodeWidth,
        height: actualHeight,
        displayValue: false, // We render custom SVGs/text elements manually for layout precision
        margin: 0,
        background: "transparent",
        lineColor: color || "#000000",
        valid: (valid: boolean) => {
          if (!valid) {
            setRenderError("Không thể mã hóa giá trị này theo chuẩn " + format);
          }
        },
      });

      // Transform the SVG to be scale-invariant and responsive with viewBox
      if (svgRef.current) {
        const rawWidth = svgRef.current.getAttribute("width");
        const rawHeight = svgRef.current.getAttribute("height");

        if (rawWidth && rawHeight) {
          const numWidth = parseFloat(rawWidth);
          const numHeight = parseFloat(rawHeight);

          if (!isNaN(numWidth) && !isNaN(numHeight)) {
            setNaturalDimensions({ width: numWidth, height: numHeight });
            svgRef.current.setAttribute(
              "viewBox",
              `0 0 ${numWidth} ${numHeight}`,
            );
            svgRef.current.removeAttribute("width");
            svgRef.current.removeAttribute("height");
            svgRef.current.style.width = "";
            svgRef.current.style.height = "";
          }
        }
      }
    } catch (err) {
      console.error("Barcode execution fail:", err);
      setRenderError("Lỗi hiển thị mã vạch");
    }
  }, [effectiveContent, format, barcodeWidth, barcodeHeight, color]);

  const finalPixelScale = pixelScale ?? BASE_DPI_SCALE;

  // Font styling resolution
  let resolvedFontFamily = "var(--font-sans)";
  if (barcodeFontFamily === "Arial") {
    resolvedFontFamily = "Arial, Helvetica, sans-serif";
  } else if (barcodeFontFamily === "Times New Roman") {
    resolvedFontFamily = "'Times New Roman', Times, serif";
  } else if (barcodeFontFamily === "Tahoma") {
    resolvedFontFamily = "Tahoma, Geneva, sans-serif";
  } else if (barcodeFontFamily === "monospace") {
    resolvedFontFamily = "var(--font-mono)";
  }

  const textHeight = finalFontSizePt * 0.3528 * finalPixelScale;
  const marginMm = barcodeTextMargin !== undefined ? barcodeTextMargin : 0.5;
  const marginPx = marginMm * finalPixelScale;

  const textStyle = {
    fontFamily: resolvedFontFamily,
    fontSize: `${textHeight}px`,
    fontWeight: barcodeFontWeight,
    fontStyle: barcodeFontStyle,
    color: barcodeTextColor || color || "#000000",
    lineHeight: "1.25",
  };

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
  let textalign = "left";
  if (origin.endsWith("left")) {
    alignClass = "items-start";
    textalign = "left";
  } else if (origin === "center" || origin.endsWith("center")) {
    alignClass = "items-center";
    textalign = "center";
  } else if (origin.endsWith("right")) {
    alignClass = "items-end";
    textalign = "right";
  }

  const scaleMultiplier = finalPixelScale / BASE_DPI_SCALE;
  const displayWidth = naturalDimensions
    ? naturalDimensions.width * scaleMultiplier
    : undefined;
  const displayHeight = naturalDimensions
    ? naturalDimensions.height * scaleMultiplier
    : undefined;

  // Precise layout geometry parsing for bulletproof print layout rendering
  let textTotalHeight = 0;
  if (showAbove) {
    textTotalHeight += textHeight * 1.25 + marginPx;
  }
  if (showBelow) {
    textTotalHeight += textHeight * 1.25 + marginPx;
  }

  // Safely parse and resolve the object height in millimeters to avoid NaN or undefined layout flattening
  const parsedObjectHeightMm = typeof objectHeightMm === "string"
    ? parseFloat(objectHeightMm)
    : objectHeightMm;
  const safeObjectHeightMm = (typeof parsedObjectHeightMm === "number" && !isNaN(parsedObjectHeightMm))
    ? parsedObjectHeightMm
    : (typeof barcodeHeight === "number" && !isNaN(barcodeHeight) ? barcodeHeight + 5 : 17);

  const totalContainerHeightPx = safeObjectHeightMm * finalPixelScale;

  const paddingSafetyPx = 1.0;
  const availableSvgHeight = Math.max(
    4,
    totalContainerHeightPx - textTotalHeight - paddingSafetyPx
  );

  return (
    <div className="relative w-full h-full flex flex-col justify-center items-stretch overflow-visible select-none">
      {/* Absolute overlay for error state so the actual <svg> tag is NEVER unmounted, preventing ref stuck behavior */}
      {effectiveError && !isEditing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-1 border-2 border-dashed border-red-300 bg-red-50 text-red-600 rounded text-center select-none overflow-hidden z-10">
          <span className="font-bold text-[10px] leading-tight select-none">
            ⚠️ {effectiveError}
          </span>
          <span className="text-[9px] text-red-500 truncate w-full select-none mt-0.5">
            {content}
          </span>
        </div>
      )}

      {warning && !isEditing && (
        <div
          data-no-print="true"
          className="no-print absolute -bottom-4 left-0 right-0 z-20 text-center text-[9px] font-bold leading-tight text-amber-700 bg-amber-50/95 border border-amber-200 rounded px-1 py-0.5 pointer-events-none"
          title={warning}
        >
          ⚠️ {warning}
        </div>
      )}

      <div
        className={`w-full h-full flex flex-col justify-center items-center overflow-visible ${effectiveError && !isEditing ? "invisible" : ""}`}
      >
        <div
          style={{
            height: `${totalContainerHeightPx}px`,
          }}
          className={`flex flex-col ${alignClass} justify-center items-center w-full overflow-visible`}
        >
          {showAbove &&
            (isEditing ? (
              <input
                type="text"
                autoFocus
                value={tempValue}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                style={{
                  fontFamily: resolvedFontFamily,
                  fontSize: `${finalFontSizePt * 0.3528 * finalPixelScale}px`,
                  fontWeight: barcodeFontWeight,
                  fontStyle: barcodeFontStyle,
                  marginBottom: `${marginPx}px`,
                  textAlign: textalign as any,
                  lineHeight: "1.25",
                }}
                className={`select-text outline-none px-1 py-0.5 w-full bg-white text-slate-900 border shrink-0 ${
                  effectiveError
                    ? "border-red-500 ring-2 ring-red-100"
                    : "border-kiot-cyan ring-2 ring-cyan-100"
                } rounded-sm shadow-sm z-50`}
              />
            ) : (
              <div
                style={{
                  ...textStyle,
                  marginBottom: `${marginPx}px`,
                  textAlign: textalign as any,
                }}
                className="select-none whitespace-nowrap overflow-visible max-w-full w-full shrink-0 cursor-text hover:bg-black/5 rounded px-0.5 transition-colors duration-150"
                onDoubleClick={handleStartEdit}
                title="Nhấp đúp để sửa nhãn"
              >
                {effectiveContent || content}
              </div>
            ))}
          <div 
            style={{
              height: `${availableSvgHeight}px`,
            }}
            className="flex items-center justify-center w-full overflow-hidden shrink-0"
          >
            <svg
              ref={svgRef}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
              }}
              preserveAspectRatio="none"
              className="block w-full h-full"
            />
          </div>
          {showBelow &&
            (isEditing ? (
              <input
                type="text"
                autoFocus
                value={tempValue}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                style={{
                  fontFamily: resolvedFontFamily,
                  fontSize: `${finalFontSizePt * 0.3528 * finalPixelScale}px`,
                  fontWeight: barcodeFontWeight,
                  fontStyle: barcodeFontStyle,
                  marginTop: `${marginPx}px`,
                  textAlign: textalign as any,
                  lineHeight: "1.25",
                }}
                className={`select-text outline-none px-1 py-0.5 w-full bg-white text-slate-900 border shrink-0 ${
                  effectiveError
                    ? "border-red-500 ring-2 ring-red-100"
                    : "border-kiot-cyan ring-2 ring-cyan-100"
                } rounded-sm shadow-sm z-50`}
              />
            ) : (
              <div
                style={{
                  ...textStyle,
                  marginTop: `${marginPx}px`,
                  textAlign: textalign as any,
                }}
                className="select-none whitespace-nowrap overflow-visible max-w-full w-full shrink-0 cursor-text hover:bg-black/5 rounded px-0.5 transition-colors duration-150"
                onDoubleClick={handleStartEdit}
                title="Nhấp đúp để sửa nhãn"
              >
                {effectiveContent || content}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
});
