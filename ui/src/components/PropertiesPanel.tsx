/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, ChangeEvent } from "react";
import { LabelObject, LabelConfig } from "../types";
import { getBoxOrigin, setBoxOrigin, usesAnchor, isOutsideLabel, clampNumber } from "../utils";
import {
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Move,
  Settings,
  ChevronDown,
  ChevronRight,
  Database,
  Link2,
  Unlink,
  ArrowUp,
  Minus,
  Square,
  Circle,
} from "lucide-react";

interface PropertiesPanelProps {
  selectedObject: LabelObject | null;
  labelConfig: LabelConfig;
  onChangeObject: (updated: LabelObject) => void;
  onDeleteObject: (id: string) => void;
  excelColumns?: string[];
  onSwitchToExcelTab?: () => void;
}

export function PropertiesPanel({
  selectedObject,
  labelConfig,
  onChangeObject,
  onDeleteObject,
  excelColumns = [],
  onSwitchToExcelTab,
}: PropertiesPanelProps) {
  const [isPositionExpanded, setIsPositionExpanded] = useState(false);
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  const getNumericInputProps = (
    key: string,
    originalValue: number | undefined,
    updateFn: (v: number) => void,
    fallback = 0,
  ) => {
    const stringVal =
      localValues[key] !== undefined
        ? localValues[key]
        : originalValue !== undefined && !isNaN(Number(originalValue))
          ? String(originalValue)
          : "";
    return {
      type: "text",
      value: stringVal,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setLocalValues((prev) => ({ ...prev, [key]: raw }));
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) {
          updateFn(parsed);
        }
      },
      onBlur: () => {
        setLocalValues((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        // Nhập chữ/ô trống không hợp lệ: giữ nguyên giá trị cũ, không ghi đè bằng 0
        const parsed = parseFloat(stringVal);
        if (!isNaN(parsed)) {
          updateFn(parsed);
        }
      },
    };
  };

  if (!selectedObject) {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-3 text-center border border-dashed border-gray-250 rounded-lg bg-slate-50/50 my-1">
        <Settings className="w-8 h-8 text-slate-450 animate-pulse mb-2" />
        <p className="text-xs font-black text-kiot-navy">
          Chưa chọn đối tượng nào
        </p>
        <p className="text-[11px] text-slate-650 mt-1.5 max-w-[240px] leading-relaxed font-semibold">
          Vui lòng click chọn trực tiếp một đối tượng (văn bản, mã vạch hoặc mã
          QR) trên khung nhãn thiết kế bên phải để tùy chỉnh các thuộc tính chi
          tiết.
        </p>
      </div>
    );
  }

  // Giới hạn hợp lý (mm) để tránh giá trị vô nghĩa làm hỏng bố cục
  const MAX_SIZE_MM = 500;
  const MAX_COORD_MM = 1000;

  // X, Y: khoảng cách từ góc trên-trái tem tới góc trên-trái khung đối tượng (mm).
  // Rộng, Cao: kích thước khung (mm).
  const handlePositionChange = (
    key: "x" | "y" | "width" | "height",
    val: number,
  ) => {
    if (!Number.isFinite(val)) return;

    if (key === "width" || key === "height") {
      const cleanVal = Math.round(clampNumber(val, 0.5, MAX_SIZE_MM, 0.5) * 10) / 10;
      const updated: LabelObject = { ...selectedObject, [key]: cleanVal };
      // Mã QR luôn là hình vuông
      if (selectedObject.type === "qrcode") {
        updated.width = cleanVal;
        updated.height = cleanVal;
      }
      onChangeObject(updated);
      return;
    }

    const box = getBoxOrigin(selectedObject, labelConfig.width, labelConfig.height);
    const left = key === "x" ? clampNumber(val, -MAX_COORD_MM, MAX_COORD_MM, box.left) : box.left;
    const top = key === "y" ? clampNumber(val, -MAX_COORD_MM, MAX_COORD_MM, box.top) : box.top;
    const pos = setBoxOrigin(selectedObject, left, top, labelConfig.width, labelConfig.height);
    onChangeObject({ ...selectedObject, x: pos.x, y: pos.y });
  };

  const handleAttributeChange = (key: keyof LabelObject, val: any) => {
    onChangeObject({
      ...selectedObject,
      [key]: val,
    });
  };

  // Alignment Helper Triggers (Center-relative coordinate origin 0,0 at center of label)
  const origin = selectedObject.textFlowOrigin || "center";

  const alignLeft = () => handlePositionChange("x", 0);
  const alignRight = () =>
    handlePositionChange("x", labelConfig.width - selectedObject.width);
  const alignCenterHoriz = () =>
    handlePositionChange("x", (labelConfig.width - selectedObject.width) / 2);
  const alignTop = () => handlePositionChange("y", 0);
  const alignBottom = () =>
    handlePositionChange("y", labelConfig.height - selectedObject.height);
  const alignCenterVerti = () =>
    handlePositionChange("y", (labelConfig.height - selectedObject.height) / 2);

  // Modular component for linking elements to Excel data columns
  const renderExcelLinker = () => {
    if (excelColumns.length > 0) {
      return (
        <div id="excel-linker-module" className="space-y-1 w-full">
          <div className="flex items-center space-x-1">
            <span className="text-[11.5px] font-black text-blue-700 uppercase tracking-wide">
              Chọn:
            </span>
            <span className="text-[10.5px] text-blue-500 font-bold select-none italic">
              (Liên kết dữ liệu Excel)
            </span>
          </div>

          <div className="bg-blue-50/50 border border-blue-100 rounded-md p-2 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-black text-blue-900 select-none">
              <span className="flex items-center space-x-1">
                <Database className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                <span>Nối dữ liệu từ file Excel đã tải</span>
              </span>
              {selectedObject.excelColumn && (
                <span className="text-[9.5px] bg-green-100 text-green-800 border border-green-200/55 font-mono font-black px-1.5 py-0.5 rounded uppercase">
                  ✓ Đã nối
                </span>
              )}
            </div>

            <div className="space-y-1">
              {selectedObject.excelColumn ? (
                <div className="flex items-center justify-between bg-white px-2 py-1 border border-blue-200 rounded-md text-xs">
                  <span className="font-extrabold text-blue-800 font-mono truncate max-w-[170px]">
                    ✓ Cột:{" "}
                    <span className="text-blue-650">
                      {selectedObject.excelColumn}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleAttributeChange("excelColumn", undefined)
                    }
                    className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-650 hover:text-red-700 rounded-md transition cursor-pointer flex items-center space-x-0.5 font-black text-[10px]"
                    title="Gỡ liên kết"
                  >
                    <Unlink className="w-3 h-3" />
                    <span>Hủy</span>
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedObject.excelColumn || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleAttributeChange(
                        "excelColumn",
                        val === "" ? undefined : val,
                      );
                    }}
                    className="w-full pl-2 pr-7 py-1 text-xs border border-gray-300 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white cursor-pointer text-slate-800 font-bold"
                  >
                    <option value="">-- Chọn cột nhận giá trị --</option>
                    {excelColumns.map((col) => (
                      <option key={col} value={col}>
                        📄 Cột: {col}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Default: not linked yet with Up Arrow to scroll/redirect
    return (
      <div id="excel-linker-module" className="space-y-1 w-full">
        <div className="flex items-center space-x-1.5">
          <span className="text-[11.5px] font-black text-slate-500 uppercase tracking-wide">
            Chọn:
          </span>
          <span className="text-[10.5px] text-slate-400 font-bold select-none italic">
            (Chọn từ cột Excel)
          </span>
        </div>

        <div className="flex items-center justify-between bg-slate-50 border border-gray-200 rounded-md p-2 shadow-xs">
          <span className="text-[11.5px] text-slate-500 font-bold select-none italic flex items-center space-x-1">
            <Database className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <span>Chưa liên kết dữ liệu excel</span>
          </span>
        </div>
      </div>
    );
  };

  // Collapsible Component for Positioning and Coordinates (Drag-and-drop handles this visual design already)
  const renderPositionPanel = () => {
    const boxOrigin = getBoxOrigin(selectedObject, labelConfig.width, labelConfig.height);
    const round1 = (n: number) => Math.round(n * 10) / 10;
    boxOrigin.left = round1(boxOrigin.left);
    boxOrigin.top = round1(boxOrigin.top);
    return (
      <div className="border border-slate-200 rounded-md overflow-hidden bg-slate-50/80 mt-2">
        <button
          type="button"
          onClick={() => setIsPositionExpanded(!isPositionExpanded)}
          className="w-full flex items-center justify-between p-2 select-none text-left font-sans cursor-pointer hover:bg-slate-100/80 transition-colors"
        >
          <div className="flex items-center space-x-1.5 text-kiot-navy">
            <Move className="w-3.5 h-3.5 text-kiot-cyan shrink-0" />
            <span className="font-extrabold text-[11.5px]">
              Vị Trí &amp; Kích Thước (mm)
            </span>
          </div>
          <div className="text-slate-400 shrink-0">
            {isPositionExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
          </div>
        </button>

        {isPositionExpanded && (
          <div className="p-2 border-t border-slate-200 bg-white space-y-2.5 animate-fadeIn">
            {isOutsideLabel(selectedObject, labelConfig.width, labelConfig.height) && (
              <div className="text-[10.5px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                ⚠️ Đối tượng đang nằm ngoài phôi tem, phần thừa sẽ bị cắt khi in.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  className="block text-[11px] text-slate-600 font-bold mb-0.5"
                  title="Khoảng cách từ mép trái của tem tới mép trái của đối tượng"
                >
                  X - cách mép trái (mm)
                </label>
                <div className="relative">
                  <input
                    {...getNumericInputProps(
                      "x",
                      boxOrigin.left,
                      (val) => handlePositionChange("x", val),
                      0,
                    )}
                    className="w-full pl-2 pr-7 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                  />
                  <span className="absolute right-2 top-1 text-[10px] text-gray-400 font-mono">
                    mm
                  </span>
                </div>
              </div>
              <div>
                <label
                  className="block text-[11px] text-slate-600 font-bold mb-0.5"
                  title="Khoảng cách từ mép trên của tem tới mép trên của đối tượng"
                >
                  Y - cách mép trên (mm)
                </label>
                <div className="relative">
                  <input
                    {...getNumericInputProps(
                      "y",
                      boxOrigin.top,
                      (val) => handlePositionChange("y", val),
                      0,
                    )}
                    className="w-full pl-2 pr-7 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                  />
                  <span className="absolute right-2 top-1 text-[10px] text-gray-400 font-mono">
                    mm
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 font-bold mb-0.5">
                  Rộng (mm)
                </label>
                <div className="relative">
                  <input
                    disabled={selectedObject.type === "qrcode"} // Square proportion constraint
                    {...getNumericInputProps(
                      "width",
                      selectedObject.width,
                      (val) => handlePositionChange("width", val),
                      10,
                    )}
                    className="w-full pl-2 pr-7 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800 disabled:bg-gray-100 disabled:text-gray-400"
                  />
                  <span className="absolute right-2 top-1 text-[10px] text-gray-400 font-mono">
                    mm
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 font-bold mb-0.5">
                  Cao (mm)
                </label>
                <div className="relative">
                  <input
                    {...getNumericInputProps(
                      "height",
                      selectedObject.height,
                      (val) => handlePositionChange("height", val),
                      10,
                    )}
                    className="w-full pl-2 pr-7 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                  />
                  <span className="absolute right-2 top-1 text-[10px] text-gray-400 font-mono">
                    mm
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Rotate Buttons Panel */}
            <div className="pt-2 border-t border-slate-200 bg-slate-50/50 p-1.5 rounded-sm">
              <div className="flex items-center justify-between mb-1.5 px-0.5">
                <span className="text-[11px] text-slate-600 font-extrabold flex items-center space-x-1">
                  <span>Góc Xoay Nhanh:</span>
                </span>
                <div className="relative w-20">
                  <input
                    {...getNumericInputProps(
                      "angle",
                      selectedObject.angle !== undefined ? selectedObject.angle : 0,
                      (val) => {
                        let aVal = Math.round(val % 360);
                        if (aVal < 0) aVal += 360;
                        handleAttributeChange("angle", aVal);
                      },
                      0,
                    )}
                    className="w-full pl-2 pr-5 py-0.5 text-xs text-center border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                  />
                  <span className="absolute right-1.5 top-0.5 text-[10px] text-gray-400 font-mono">
                    °
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => handleAttributeChange("angle", deg)}
                    className={`py-1 px-px text-[10px] border rounded transition font-black focus:outline-none cursor-pointer text-center ${
                      (selectedObject.angle || 0) === deg
                        ? "border-kiot-cyan bg-kiot-cyan/10 text-kiot-navy"
                        : "border-gray-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>

            {/* Alignment Controls Mapping inside expanded details */}
            <div className="pt-2 border-t border-gray-200/60">
              <span className="block text-[10px] text-slate-400 font-black mb-1.5 text-center uppercase tracking-wide">
                Căn nhanh vào phôi nhãn
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={alignLeft}
                  className="py-1 px-1 text-[11px] border border-gray-200 bg-white hover:bg-sky-50 hover:border-kiot-cyan text-slate-700 hover:text-kiot-navy rounded-sm font-bold transition focus:outline-none cursor-pointer"
                  title="Căn trái"
                >
                  Căn Trái
                </button>
                <button
                  type="button"
                  onClick={alignCenterHoriz}
                  className="py-1 px-1 text-[11px] border border-gray-200 bg-white hover:bg-sky-50 hover:border-kiot-cyan text-slate-700 hover:text-kiot-navy rounded-sm font-bold transition focus:outline-none cursor-pointer"
                  title="Căn giữa ngang"
                >
                  Giữa Ngang
                </button>
                <button
                  type="button"
                  onClick={alignRight}
                  className="py-1 px-1 text-[11px] border border-gray-200 bg-white hover:bg-sky-50 hover:border-kiot-cyan text-slate-700 hover:text-kiot-navy rounded-sm font-bold transition focus:outline-none cursor-pointer"
                  title="Căn phải"
                >
                  Căn Phải
                </button>
                <button
                  type="button"
                  onClick={alignTop}
                  className="py-1 px-1 text-[11px] border border-gray-200 bg-white hover:bg-sky-50 hover:border-kiot-cyan text-slate-700 hover:text-kiot-navy rounded-sm font-bold transition focus:outline-none cursor-pointer"
                  title="Căn trên cùng"
                >
                  Căn Trên
                </button>
                <button
                  type="button"
                  onClick={alignCenterVerti}
                  className="py-1 px-1 text-[11px] border border-gray-200 bg-white hover:bg-sky-50 hover:border-kiot-cyan text-slate-700 hover:text-kiot-navy rounded-sm font-bold transition focus:outline-none cursor-pointer"
                  title="Căn giữa dọc"
                >
                  Giữa Dọc
                </button>
                <button
                  type="button"
                  onClick={alignBottom}
                  className="py-1 px-1 text-[11px] border border-gray-200 bg-white hover:bg-sky-50 hover:border-kiot-cyan text-slate-700 hover:text-kiot-navy rounded-sm font-bold transition focus:outline-none cursor-pointer"
                  title="Căn dưới cùng"
                >
                  Căn Dưới
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      );
    };

    return (
      <div id="properties-panel" className="space-y-3.5 pb-8 font-sans animate-fadeIn">
        <main className="p-3.5 bg-white border border-slate-150 rounded-xl space-y-4 shadow-3xs text-kiot-slate">
          {/* TEXT EXCLUSIVE ATTRIBUTES */}
        {selectedObject.type === "text" && (
          <div className="space-y-2.5 animate-fadeIn">
            {/* Nội dung văn bản */}
            <div className="space-y-1.5">
              <label className="block text-[11.5px] font-black text-slate-705 uppercase tracking-wider mb-0.5">
                Nội dung văn bản
              </label>

              {/* Way 1: Nhập thủ công */}
              <div className="space-y-1">
                <div className="flex items-center space-x-1">
                  <span className="text-[11px] font-black text-slate-550 uppercase tracking-wide">
                    Nhập:
                  </span>
                  <span className="text-[10.5px] text-slate-450 font-bold select-none italic">
                    (Điền chữ hiển thị)
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={selectedObject.content}
                  disabled={excelColumns.length > 0 && !!selectedObject.excelColumn}
                  onChange={(e) =>
                    handleAttributeChange("content", e.target.value)
                  }
                  className={`w-full p-2 text-xs border border-gray-200 rounded-md font-sans focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none ${
                    (excelColumns.length > 0 && selectedObject.excelColumn)
                      ? "bg-gray-100 text-gray-500 select-none cursor-not-allowed font-bold italic"
                      : "bg-white text-slate-800 font-extrabold"
                  }`}
                  placeholder={
                    (excelColumns.length > 0 && selectedObject.excelColumn)
                      ? `Lấy cột động: [${selectedObject.excelColumn}]`
                      : "Nhập chữ hiển thị..."
                  }
                />
                {(excelColumns.length > 0 && selectedObject.excelColumn) && (
                  <p className="text-[10.5px] text-amber-600 font-bold mt-0.5">
                    ⚠️ Đang nối Excel. Chữ cố định bị tắt.
                  </p>
                )}
              </div>

              {/* Separator: Hoặc */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-1.5 text-[10px] font-black text-gray-400 bg-white uppercase tracking-widest select-none px-1">
                  Hoặc
                </span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>

              {/* Way 2: renderExcelLinker */}
              {renderExcelLinker()}
            </div>

            {/* ĐỊNH DẠNG DƯ LIỆU */}
            <div className="pt-2.5 border-t border-gray-250/60 pb-1 font-sans">
              <span className="block text-[11.5px] uppercase tracking-wider font-extrabold text-kiot-navy mb-1.5">
                Định dạng dữ liệu
              </span>
              <div className="space-y-2 text-xs">
                {/* Select Format Type */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">Loại định dạng:</span>
                  <div className="relative">
                    <select
                      value={selectedObject.dataFormatType || "general"}
                      onChange={(e) =>
                        handleAttributeChange("dataFormatType", e.target.value)
                      }
                      className="w-40 pl-2 pr-6 py-1 text-xs border border-gray-200 rounded focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white text-slate-705 font-bold cursor-pointer appearance-none"
                    >
                      <option value="general">Mặc định (General)</option>
                      <option value="number">Số (Number)</option>
                      <option value="datetime">Ngày / Giờ (Date/Time)</option>
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1.5 w-3.5 h-3.5 text-gray-450 pointer-events-none" />
                  </div>
                </div>

                {/* If Number format chosen */}
                {selectedObject.dataFormatType === "number" && (
                  <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-md space-y-2 transition duration-205 animate-fadeIn">
                    {/* Decimal Separator */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Ngăn thập phân:</span>
                      <div className="flex items-center bg-gray-150 p-0.5 rounded gap-1">
                        {[
                          { value: ",", label: "Dấu phẩy (,)" },
                          { value: ".", label: "Dấu chấm (.)" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              handleAttributeChange("numberDecimalSeparator", opt.value)
                            }
                            className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${
                              (selectedObject.numberDecimalSeparator || ".") === opt.value
                                ? "bg-white text-kiot-navy shadow-sm ring-1 ring-kiot-cyan/20 font-extrabold"
                                : "text-gray-500 hover:text-gray-800"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Thousands Separator checkbox */}
                    <div className="flex items-center">
                      <input
                        id="numberThousandsSeparator"
                        type="checkbox"
                        checked={selectedObject.numberThousandsSeparator ?? false}
                        onChange={(e) =>
                          handleAttributeChange("numberThousandsSeparator", e.target.checked)
                        }
                        className="rounded border-gray-350 text-kiot-cyan focus:ring-kiot-cyan h-3 w-3 mr-2"
                      />
                      <label htmlFor="numberThousandsSeparator" className="text-[11px] text-slate-650 cursor-pointer select-none font-bold">
                        Phân cách hàng ngàn, triệu...
                      </label>
                    </div>

                    {/* Decimal Places */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Chữ số thập phân:</span>
                      <select
                        value={selectedObject.numberDecimalPlaces === undefined ? "auto" : selectedObject.numberDecimalPlaces.toString()}
                        onChange={(e) =>
                          handleAttributeChange(
                            "numberDecimalPlaces",
                            e.target.value === "auto" ? undefined : parseInt(e.target.value, 10)
                          )
                        }
                        className="w-24 px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white font-bold text-slate-705 cursor-pointer"
                      >
                        <option value="auto">Tự động</option>
                        <option value="0">0 chữ số</option>
                        <option value="1">1 chữ số</option>
                        <option value="2">2 chữ số</option>
                        <option value="3">3 chữ số</option>
                        <option value="4">4 chữ số</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* If DateTime format chosen */}
                {selectedObject.dataFormatType === "datetime" && (
                  <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-md space-y-2 transition duration-205 animate-fadeIn">
                    {/* Format presets select */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Định dạng mẫu:</span>
                      <div className="relative">
                        <select
                          value={
                            ["DD/MM/YYYY", "DD/MM/YYYY HH:mm", "HH:mm", "DD-MM-YYYY", "YYYY-MM-DD"].includes(selectedObject.datetimeFormat || "")
                              ? selectedObject.datetimeFormat || "DD/MM/YYYY HH:mm"
                              : "custom"
                          }
                          onChange={(e) => {
                            if (e.target.value !== "custom") {
                              handleAttributeChange("datetimeFormat", e.target.value);
                            } else {
                              if (!selectedObject.datetimeFormat) {
                                handleAttributeChange("datetimeFormat", "DD/MM/YYYY HH:mm");
                              }
                            }
                          }}
                          className="w-40 pl-1.5 pr-6 py-0.5 text-[11px] border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white text-slate-750 font-bold cursor-pointer appearance-none"
                        >
                          <option value="DD/MM/YYYY">Ngày/Tháng/Năm (DD/MM/YYYY)</option>
                          <option value="DD/MM/YYYY HH:mm">Ngày/Tháng/Năm Giờ:Phút (DD/MM/YYYY HH:mm)</option>
                          <option value="HH:mm">Giờ:Phút (HH:mm)</option>
                          <option value="DD-MM-YYYY">Ngày-Tháng-Năm (DD-MM-YYYY)</option>
                          <option value="YYYY-MM-DD">Năm-Tháng-Ngày (YYYY-MM-DD)</option>
                          <option value="custom">Tùy chọn tự nhập</option>
                        </select>
                        <ChevronDown className="absolute right-1 top-1.5 w-3 h-3 text-gray-450 pointer-events-none" />
                      </div>
                    </div>

                    {/* Custom DateTime Format text input */}
                    {(!["DD/MM/YYYY", "DD/MM/YYYY HH:mm", "HH:mm", "DD-MM-YYYY", "YYYY-MM-DD"].includes(selectedObject.datetimeFormat || "") ||
                      selectedObject.datetimeFormat === "") && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">Chuỗi định dạng:</span>
                        <input
                          type="text"
                          value={selectedObject.datetimeFormat || "DD/MM/YYYY HH:mm"}
                          onChange={(e) => handleAttributeChange("datetimeFormat", e.target.value)}
                          placeholder="Ví dụ: DD/MM/YYYY HH:mm"
                          className="w-40 px-2 py-0.5 text-[11px] border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white text-slate-700 font-mono font-bold"
                        />
                      </div>
                    )}

                    {/* Choose System Time Checkbox */}
                    <div className="flex items-center pt-1">
                      <input
                        id="useSystemTime"
                        type="checkbox"
                        checked={selectedObject.useSystemTime ?? false}
                        onChange={(e) =>
                          handleAttributeChange("useSystemTime", e.target.checked)
                        }
                        className="rounded border-gray-300 text-kiot-cyan focus:ring-kiot-cyan h-3 w-3 mr-2 font-bold cursor-pointer"
                      />
                      <label htmlFor="useSystemTime" className="text-[11px] text-slate-650 cursor-pointer select-none font-bold flex items-center gap-1">
                        <span>Chọn giờ hệ thống</span>
                        <span className="text-[9px] text-slate-400 font-normal italic">(Lấy giờ computer)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ĐỊNH DẠNG CHỮ & TRỰC QUAN */}
            <div className="pt-2.5 border-t border-gray-250/60 pb-1 font-sans space-y-2.5">
              <span className="block text-[11.5px] uppercase tracking-wider font-extrabold text-kiot-navy">
                Định dạng chữ &amp; Trực quan
              </span>

              {/* Bold, Italic, Underline, Strikethrough buttons / Định dạng chữ */}
              <div className="space-y-1">
                <span className="block text-[11px] text-slate-600 font-bold">
                  Kiểu dáng chữ
                </span>
                <div className="flex bg-gray-100 p-0.5 rounded-md gap-1">
                  {/* Bold Button */}
                  <button
                    type="button"
                    onClick={() =>
                      handleAttributeChange(
                        "fontWeight",
                        selectedObject.fontWeight === "bold"
                          ? "normal"
                          : "bold",
                      )
                    }
                    className={`flex-1 py-1 flex items-center justify-center rounded transition cursor-pointer ${
                      selectedObject.fontWeight === "bold"
                        ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/40"
                        : "text-gray-400 hover:text-gray-700"
                    }`}
                    title="Chữ đậm"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>

                  {/* Italic Button */}
                  <button
                    type="button"
                    onClick={() =>
                      handleAttributeChange(
                        "fontStyle",
                        selectedObject.fontStyle === "italic"
                          ? "normal"
                          : "italic",
                      )
                    }
                    className={`flex-1 py-1 flex items-center justify-center rounded transition cursor-pointer ${
                      selectedObject.fontStyle === "italic"
                        ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/40"
                        : "text-gray-400 hover:text-gray-700"
                    }`}
                    title="Chữ nghiêng"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>

                  {/* Underline Button */}
                  <button
                    type="button"
                    onClick={() =>
                      handleAttributeChange(
                        "textDecorationUnderline",
                        !selectedObject.textDecorationUnderline,
                      )
                    }
                    className={`flex-1 py-1 flex items-center justify-center rounded transition cursor-pointer ${
                      selectedObject.textDecorationUnderline
                        ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/40"
                        : "text-gray-400 hover:text-gray-700"
                    }`}
                    title="Gạch chân"
                  >
                    <Underline className="w-3.5 h-3.5" />
                  </button>

                  {/* Strikethrough Button */}
                  <button
                    type="button"
                    onClick={() =>
                      handleAttributeChange(
                        "textDecorationLineThrough",
                        !selectedObject.textDecorationLineThrough,
                      )
                    }
                    className={`flex-1 py-1 flex items-center justify-center rounded transition cursor-pointer ${
                      selectedObject.textDecorationLineThrough
                        ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/40"
                        : "text-gray-400 hover:text-gray-700"
                    }`}
                    title="Gạch ngang chữ"
                  >
                    <Strikethrough className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Font & Cỡ chữ (grouped directly under style) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-650 font-bold mb-0.5">
                    Font chữ
                  </label>
                  <div className="relative">
                    <select
                      value={selectedObject.fontFamily || "sans-serif"}
                      onChange={(e) =>
                        handleAttributeChange("fontFamily", e.target.value)
                      }
                      className="w-full pl-2 pr-6 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white appearance-none text-slate-800 font-bold cursor-pointer"
                    >
                      <option value="sans-serif">Chữ thường (Sans)</option>
                      <option value="Arial">Arial</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Tahoma">Tahoma</option>
                      <option value="monospace">Mã máy (Mono)</option>
                      <option value="serif">Chữ Serif (Times)</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-2 a w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-650 font-bold mb-0.5">
                    Cỡ chữ (pt)
                  </label>
                  <input
                    {...getNumericInputProps(
                      "fontSize",
                      selectedObject.fontSize || 10,
                      (val) => handleAttributeChange("fontSize", val),
                      10,
                    )}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Màu sắc chữ (grouped directly under font size/family) */}
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-650 font-bold">
                  Màu sắc chữ
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={selectedObject.color || "#000000"}
                    onChange={(e) =>
                      handleAttributeChange("color", e.target.value)
                    }
                    className="w-8 h-8 p-0 border border-gray-350 cursor-pointer rounded-md outline-none bg-transparent shrink-0"
                  />
                  <input
                    type="text"
                    value={selectedObject.color || "#000000"}
                    onChange={(e) =>
                      handleAttributeChange("color", e.target.value)
                    }
                    className="w-20 px-1.5 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono text-slate-800 font-bold shrink-0"
                    placeholder="#000000"
                  />
                  <div className="flex space-x-1 overflow-x-auto py-0.5 scrollbar-none">
                    {[
                      "#000000",
                      "#FF0000",
                      "#0000FF",
                      "#008000",
                      "#FFA500",
                    ].map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => handleAttributeChange("color", hex)}
                        className="w-4.5 h-4.5 rounded-full border border-gray-350 cursor-pointer transition-transform hover:scale-110 shadow-sm shrink-0"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Alignment and Super/Sub indexes (lower priority layout) */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200/45">
                <div className="flex-1">
                  <span className="block text-[11px] text-slate-650 font-bold mb-0.5">
                    Căn lề chữ
                  </span>
                  <div className="flex bg-gray-100 p-0.5 rounded-md">
                    {(["left", "center", "right"] as const).map((align) => {
                      return (
                        <button
                          key={align}
                          type="button"
                          onClick={() =>
                            handleAttributeChange("textAlign", align)
                          }
                          className={`flex-1 py-1 flex items-center justify-center rounded transition cursor-pointer ${
                            (selectedObject.textAlign || "left") === align
                              ? "bg-white text-kiot-navy font-bold shadow-sm"
                              : "text-gray-450 hover:text-gray-700"
                          }`}
                        >
                          {align === "left" && (
                            <AlignLeft className="w-3.5 h-3.5" />
                          )}
                          {align === "center" && (
                            <AlignCenter className="w-3.5 h-3.5" />
                          )}
                          {align === "right" && (
                            <AlignRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] text-slate-650 font-bold mb-0.5">
                    Chỉnh chỉ số
                  </span>
                  <div className="flex bg-gray-100 p-0.5 rounded-md text-[11px] font-bold">
                    {(["normal", "superscript", "subscript"] as const).map((subSuper) => {
                      return (
                        <button
                          key={subSuper}
                          type="button"
                          onClick={() =>
                            handleAttributeChange("textSuperSub", subSuper)
                          }
                          className={`flex-1 py-1 flex items-center justify-center rounded transition cursor-pointer text-[10.5px] ${
                            (selectedObject.textSuperSub || "normal") ===
                            subSuper
                              ? "bg-white text-kiot-navy font-black shadow-sm"
                              : "text-gray-500 hover:text-gray-800 font-bold"
                          }`}
                          title={
                            subSuper === "normal"
                              ? "Chữ bình thường"
                              : subSuper === "superscript"
                                ? "Chỉ số trên"
                                : "Chỉ số dưới"
                          }
                        >
                          {subSuper === "normal" && "Thường"}
                          {subSuper === "superscript" && "A²"}
                          {subSuper === "subscript" && "A₂"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

              {/* PHẦN TIỀN TỐ VÀ HẬU TỐ */}
              <div className="pt-2 border-t border-gray-250/60 pb-1.5 space-y-2.5">
                <span className="block text-[11px] uppercase tracking-wider font-extrabold text-kiot-navy">
                  Tiền tố &amp; Hậu tố
                </span>

                {/* 1. TIỀN TỐ (PREFIX) */}
                <div className="p-2 border border-sky-100 rounded-lg bg-sky-50/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-650">
                      Tiền tố (Prefix)
                    </label>
                    <span className="text-[9px] bg-sky-100 text-sky-800 px-1 py-0.2 rounded font-mono">
                      Trước content
                    </span>
                  </div>
                  <input
                    type="text"
                    value={selectedObject.prefixText || ""}
                    placeholder="Mặc định thêm vào trước..."
                    onChange={(e) =>
                      handleAttributeChange("prefixText", e.target.value)
                    }
                    className="w-full px-2 py-1 text-xs border border-gray-250 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-semibold text-slate-800"
                  />
                  {selectedObject.prefixText && (
                    <div className="space-y-1.5 animate-fadeIn">
                      <div className="grid grid-cols-2 gap-2">
                        {/* Font Size */}
                        <div>
                          <label className="block text-[9.5px] text-slate-500 font-bold mb-0.5">
                            Cỡ chữ (pt)
                          </label>
                          <input
                            {...getNumericInputProps(
                              "prefixFontSize",
                              selectedObject.prefixFontSize ||
                                selectedObject.fontSize ||
                                11,
                              (val) =>
                                handleAttributeChange("prefixFontSize", val),
                              11,
                            )}
                            className="w-full px-1.5 py-0.5 text-[11px] border border-gray-200 rounded-md focus:border-kiot-cyan focus:outline-none bg-white font-mono font-semibold"
                          />
                        </div>
                        {/* Font Family */}
                        <div>
                          <label className="block text-[9.5px] text-slate-500 font-bold mb-0.5">
                            Font chữ
                          </label>
                          <select
                            value={
                              selectedObject.prefixFontFamily || "sans-serif"
                            }
                            onChange={(e) =>
                              handleAttributeChange(
                                "prefixFontFamily",
                                e.target.value,
                              )
                            }
                            className="w-full pl-1.5 pr-4 py-0.5 text-[11px] border border-gray-200 rounded-md focus:border-kiot-cyan focus:outline-none bg-white font-bold text-slate-800 cursor-pointer"
                          >
                            <option value="sans-serif">Sans-serif</option>
                            <option value="Arial">Arial</option>
                            <option value="Times New Roman">Times Roman</option>
                            <option value="Tahoma">Tahoma</option>
                            <option value="monospace">Mono</option>
                          </select>
                        </div>
                      </div>

                      {/* Màu đặc biệt cho Prefix */}
                      <div className="flex items-center justify-between gap-2 border-t border-sky-100/45 pt-1.5 pb-0.5">
                        <label className="text-[9.5px] text-slate-500 font-bold">
                          Màu tiền tố:
                        </label>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="color"
                            value={selectedObject.prefixColor || selectedObject.color || "#000000"}
                            onChange={(e) =>
                              handleAttributeChange("prefixColor", e.target.value)
                            }
                            className="w-5 h-5 p-0 border border-gray-250 cursor-pointer rounded outline-none bg-transparent shrink-0"
                          />
                          <input
                            type="text"
                            value={selectedObject.prefixColor || selectedObject.color || "#000000"}
                            onChange={(e) =>
                              handleAttributeChange("prefixColor", e.target.value)
                            }
                            className="w-16 px-1.5 py-0.5 text-[10px] border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white font-mono text-slate-800 font-bold"
                            placeholder="#000000"
                          />
                        </div>
                      </div>

                      {/* Formatting bar: Bold, Italic, Underline, Strikethrough, Sub/Sup */}
                      <div className="flex gap-1 items-center bg-gray-50 border border-gray-200 p-0.5 rounded-md">
                        {/* Bold */}
                        <button
                          type="button"
                          onClick={() =>
                            handleAttributeChange(
                              "prefixFontWeight",
                              selectedObject.prefixFontWeight === "bold"
                                ? "normal"
                                : "bold",
                            )
                          }
                          className={`flex-1 py-0.5 flex items-center justify-center rounded text-xs ${selectedObject.prefixFontWeight === "bold" ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/20" : "text-gray-400 hover:text-gray-700"}`}
                        >
                          <Bold className="w-3 h-3" />
                        </button>
                        {/* Italic */}
                        <button
                          type="button"
                          onClick={() =>
                            handleAttributeChange(
                              "prefixFontStyle",
                              selectedObject.prefixFontStyle === "italic"
                                ? "normal"
                                : "italic",
                            )
                          }
                          className={`flex-1 py-0.5 flex items-center justify-center rounded text-xs ${selectedObject.prefixFontStyle === "italic" ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/20" : "text-gray-400 hover:text-gray-700"}`}
                        >
                          <Italic className="w-3 h-3" />
                        </button>
                        {/* Underline */}
                        <button
                          type="button"
                          onClick={() =>
                            handleAttributeChange(
                              "prefixTextDecorationUnderline",
                              !selectedObject.prefixTextDecorationUnderline,
                            )
                          }
                          className={`flex-1 py-0.5 flex items-center justify-center rounded text-xs ${selectedObject.prefixTextDecorationUnderline ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/20" : "text-gray-400 hover:text-gray-700"}`}
                        >
                          <Underline className="w-3 h-3" />
                        </button>
                        {/* Strikethrough */}
                        <button
                          type="button"
                          onClick={() =>
                            handleAttributeChange(
                              "prefixTextDecorationLineThrough",
                              !selectedObject.prefixTextDecorationLineThrough,
                            )
                          }
                          className={`flex-1 py-0.5 flex items-center justify-center rounded text-xs ${selectedObject.prefixTextDecorationLineThrough ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/20" : "text-gray-400 hover:text-gray-700"}`}
                        >
                          <Strikethrough className="w-3 h-3" />
                        </button>
                        <div className="w-px h-4 bg-gray-200 inline-block" />
                        {/* Sub/Sup indicator */}
                        <select
                          value={selectedObject.prefixTextSuperSub || "normal"}
                          onChange={(e) =>
                            handleAttributeChange(
                              "prefixTextSuperSub",
                              e.target.value,
                            )
                          }
                          className="text-[10px] bg-transparent border-none outline-none font-bold text-slate-700 cursor-pointer p-0 shrink-0"
                        >
                          <option value="normal">Thường</option>
                          <option value="superscript">A²</option>
                          <option value="subscript">A₂</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. HẬU TỐ (SUFFIX) */}
                <div className="p-2 border border-purple-100 rounded-lg bg-purple-50/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-650">
                      Hậu tố (Suffix)
                    </label>
                    <span className="text-[9px] bg-purple-100 text-purple-800 px-1 py-0.2 rounded font-mono">
                      Sau content
                    </span>
                  </div>
                  <input
                    type="text"
                    value={selectedObject.suffixText || ""}
                    placeholder="Mặc định thêm vào sau..."
                    onChange={(e) =>
                      handleAttributeChange("suffixText", e.target.value)
                    }
                    className="w-full px-2 py-1 text-xs border border-gray-250 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-semibold text-slate-800"
                  />
                  {selectedObject.suffixText && (
                    <div className="space-y-1.5 animate-fadeIn">
                      <div className="grid grid-cols-2 gap-2">
                        {/* Font Size */}
                        <div>
                          <label className="block text-[9.5px] text-slate-500 font-bold mb-0.5">
                            Cỡ chữ (pt)
                          </label>
                          <input
                            {...getNumericInputProps(
                              "suffixFontSize",
                              selectedObject.suffixFontSize ||
                                selectedObject.fontSize ||
                                11,
                              (val) =>
                                handleAttributeChange("suffixFontSize", val),
                              11,
                            )}
                            className="w-full px-1.5 py-0.5 text-[11px] border border-gray-200 rounded-md focus:border-kiot-cyan focus:outline-none bg-white font-mono font-semibold"
                          />
                        </div>
                        {/* Font Family */}
                        <div>
                          <label className="block text-[9.5px] text-slate-500 font-bold mb-0.5">
                            Font chữ
                          </label>
                          <select
                            value={
                              selectedObject.suffixFontFamily || "sans-serif"
                            }
                            onChange={(e) =>
                              handleAttributeChange(
                                "suffixFontFamily",
                                e.target.value,
                              )
                            }
                            className="w-full pl-1.5 pr-4 py-0.5 text-[11px] border border-gray-200 rounded-md focus:border-kiot-cyan focus:outline-none bg-white font-bold text-slate-800 cursor-pointer"
                          >
                            <option value="sans-serif">Sans-serif</option>
                            <option value="Arial">Arial</option>
                            <option value="Times New Roman">Times Roman</option>
                            <option value="Tahoma">Tahoma</option>
                            <option value="monospace">Mono</option>
                          </select>
                        </div>
                      </div>

                      {/* Màu đặc biệt cho Suffix */}
                      <div className="flex items-center justify-between gap-2 border-t border-purple-100/45 pt-1.5 pb-0.5">
                        <label className="text-[9.5px] text-slate-500 font-bold">
                          Màu hậu tố:
                        </label>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="color"
                            value={selectedObject.suffixColor || selectedObject.color || "#000000"}
                            onChange={(e) =>
                              handleAttributeChange("suffixColor", e.target.value)
                            }
                            className="w-5 h-5 p-0 border border-gray-250 cursor-pointer rounded outline-none bg-transparent shrink-0"
                          />
                          <input
                            type="text"
                            value={selectedObject.suffixColor || selectedObject.color || "#000000"}
                            onChange={(e) =>
                              handleAttributeChange("suffixColor", e.target.value)
                            }
                            className="w-16 px-1.5 py-0.5 text-[10px] border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white font-mono text-slate-800 font-bold"
                            placeholder="#000000"
                          />
                        </div>
                      </div>

                      {/* Formatting bar: Bold, Italic, Underline, Strikethrough, Sub/Sup */}
                      <div className="flex gap-1 items-center bg-gray-50 border border-gray-200 p-0.5 rounded-md">
                        {/* Bold */}
                        <button
                          type="button"
                          onClick={() =>
                            handleAttributeChange(
                              "suffixFontWeight",
                              selectedObject.suffixFontWeight === "bold"
                                ? "normal"
                                : "bold",
                            )
                          }
                          className={`flex-1 py-0.5 flex items-center justify-center rounded text-xs ${selectedObject.suffixFontWeight === "bold" ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/20" : "text-gray-400 hover:text-gray-700"}`}
                        >
                          <Bold className="w-3 h-3" />
                        </button>
                        {/* Italic */}
                        <button
                          type="button"
                          onClick={() =>
                            handleAttributeChange(
                              "suffixFontStyle",
                              selectedObject.suffixFontStyle === "italic"
                                ? "normal"
                                : "italic",
                            )
                          }
                          className={`flex-1 py-0.5 flex items-center justify-center rounded text-xs ${selectedObject.suffixFontStyle === "italic" ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/20" : "text-gray-400 hover:text-gray-700"}`}
                        >
                          <Italic className="w-3 h-3" />
                        </button>
                        {/* Underline */}
                        <button
                          type="button"
                          onClick={() =>
                            handleAttributeChange(
                              "suffixTextDecorationUnderline",
                              !selectedObject.suffixTextDecorationUnderline,
                            )
                          }
                          className={`flex-1 py-0.5 flex items-center justify-center rounded text-xs ${selectedObject.suffixTextDecorationUnderline ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/20" : "text-gray-400 hover:text-gray-700"}`}
                        >
                          <Underline className="w-3 h-3" />
                        </button>
                        {/* Strikethrough */}
                        <button
                          type="button"
                          onClick={() =>
                            handleAttributeChange(
                              "suffixTextDecorationLineThrough",
                              !selectedObject.suffixTextDecorationLineThrough,
                            )
                          }
                          className={`flex-1 py-0.5 flex items-center justify-center rounded text-xs ${selectedObject.suffixTextDecorationLineThrough ? "bg-white text-kiot-navy font-bold shadow-sm ring-1 ring-kiot-cyan/20" : "text-gray-400 hover:text-gray-700"}`}
                        >
                          <Strikethrough className="w-3 h-3" />
                        </button>
                        <div className="w-px h-4 bg-gray-200 inline-block" />
                        {/* Sub/Sup indicator */}
                        <select
                          value={selectedObject.suffixTextSuperSub || "normal"}
                          onChange={(e) =>
                            handleAttributeChange(
                              "suffixTextSuperSub",
                              e.target.value,
                            )
                          }
                          className="text-[10px] bg-transparent border-none outline-none font-bold text-slate-700 cursor-pointer p-0 shrink-0"
                        >
                          <option value="normal">Thường</option>
                          <option value="superscript">A²</option>
                          <option value="subscript">A₂</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Hướng căn chỉnh và dòng chảy khi nhiều dòng */}
              <div className="pt-1.5 border-t border-gray-250/60 pb-0.5">
                <label className="block text-[11px] text-slate-650 font-bold mb-1 flex items-center space-x-1">
                  <span>Điểm neo / Dòng chảy văn bản</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedObject.textFlowOrigin || "center"}
                    onChange={(e) => {
                      const origin = e.target.value as any;
                      let align: "left" | "center" | "right" = "left";
                      if (origin.endsWith("center") || origin === "center")
                        align = "center";
                      if (origin.endsWith("right")) align = "right";

                      const getAnchorMultipliers = (o: string) => {
                        let mx = 0, my = 0;
                        if (o.includes("center") || o === "center") mx = 0.5;
                        if (o.endsWith("right")) mx = 1;
                        if (o.startsWith("center") || o === "center") my = 0.5;
                        if (o.startsWith("bottom")) my = 1;
                        return { mx, my };
                      };

                      const currentOrigin = selectedObject.textFlowOrigin || "center";
                      const oldMultipliers = getAnchorMultipliers(currentOrigin);
                      const newMultipliers = getAnchorMultipliers(origin);

                      const visualLeft = selectedObject.x - oldMultipliers.mx * selectedObject.width;
                      const visualTop = selectedObject.y - oldMultipliers.my * selectedObject.height;

                      const newX = visualLeft + newMultipliers.mx * selectedObject.width;
                      const newY = visualTop + newMultipliers.my * selectedObject.height;

                      const roundedX = Math.round(newX * 10) / 10;
                      const roundedY = Math.round(newY * 10) / 10;

                      onChangeObject({
                        ...selectedObject,
                        textFlowOrigin: origin,
                        textAlign: align,
                        x: roundedX,
                        y: roundedY
                      });
                    }}
                    className="w-full pl-2 pr-6 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-bold text-slate-800 cursor-pointer appearance-none"
                  >
                    <option value="top-left">
                      Trên - Trái (góc trên bên trái)
                    </option>
                    <option value="top-center">
                      Trên - Giữa
                    </option>
                    <option value="top-right">
                      Trên - Phải (góc trên bên phải)
                    </option>
                    <option value="center-left">
                      Giữa - Trái
                    </option>
                    <option value="center">
                      Chính giữa (tâm)
                    </option>
                    <option value="center-right">
                      Giữa - Phải
                    </option>
                    <option value="bottom-left">
                      Dưới - Trái (góc dưới bên trái)
                    </option>
                    <option value="bottom-center">
                      Dưới - Giữa
                    </option>
                    <option value="bottom-right">
                      Dưới - Phải (góc dưới bên phải)
                    </option>
                  </select>
                  <ChevronDown className="absolute right-2 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>

            {/* Vị trí & Kích thước (Collapsible) */}
            {renderPositionPanel()}
          </div>
        )}

        {/* BARCODE EXCLUSIVE ATTRIBUTES - STRICT USER INSTRUCTIONS SPECIFIED ORDER */}
        {selectedObject.type === "barcode" && (
          <div className="space-y-2.5">
            {/* 1. Phần Mã vạch (giá trị) */}
            <div className="space-y-1.5">
              <label className="block text-[11.5px] font-black text-slate-705 uppercase tracking-wider mb-0.5">
                Mã vạch (Giá trị)
              </label>

              {/* Way 1: Nhập thủ công */}
              <div className="space-y-1">
                <div className="flex items-center space-x-1">
                  <span className="text-[11px] font-black text-slate-550 uppercase tracking-wide">
                    Nhập:
                  </span>
                  <span className="text-[10.5px] text-slate-450 font-bold select-none italic">
                    (Điền giá trị cố định)
                  </span>
                </div>
                <input
                  type="text"
                  value={selectedObject.content}
                  disabled={excelColumns.length > 0 && !!selectedObject.excelColumn}
                  onChange={(e) =>
                    handleAttributeChange("content", e.target.value)
                  }
                  className={`w-full p-2 text-xs border border-gray-200 rounded-md font-mono focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none ${
                    (excelColumns.length > 0 && selectedObject.excelColumn)
                      ? "bg-gray-100 text-gray-450 select-none cursor-not-allowed font-bold italic"
                      : "bg-white text-slate-800 font-bold"
                  }`}
                  placeholder={
                    (excelColumns.length > 0 && selectedObject.excelColumn)
                      ? `Lấy mã vạch từ cột [${selectedObject.excelColumn}]`
                      : "Ví dụ: CODE128, EAN13..."
                  }
                />
                {(excelColumns.length > 0 && selectedObject.excelColumn) && (
                  <p className="text-[10.5px] text-amber-600 font-bold mt-0.5">
                    ⚠️ Đang nối Excel. Giá trị mã vạch bị ẩn.
                  </p>
                )}
              </div>

              {/* Separator: Hoặc */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-1.5 text-[10px] font-black text-gray-400 bg-white uppercase tracking-widest select-none px-1">
                  Hoặc
                </span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>

              {/* Way 2: renderExcelLinker */}
              {renderExcelLinker()}
            </div>

            {/* 3. Chuẩn mã vạch, Độ rộng, Chiều cao mã */}
            <div className="pt-1.5 border-t border-gray-100/50 space-y-2 font-sans">
              <div>
                <label className="block text-[11px] text-slate-650 font-bold mb-0.5 uppercase tracking-wider">
                  Chuẩn mã vạch
                </label>
                <div className="relative">
                  <select
                    value={selectedObject.barcodeFormat || "CODE128"}
                    onChange={(e) =>
                      handleAttributeChange("barcodeFormat", e.target.value)
                    }
                    className="w-full pl-2 pr-6 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white appearance-none text-slate-800 font-bold"
                  >
                    <option value="CODE128">
                      CODE128 (Chữ &amp; số - Khuyên dùng)
                    </option>
                    <option value="EAN13">
                      EAN-13 (13 chữ số - Châu Âu/VN)
                    </option>
                    <option value="CODE39">CODE39 (Chữ &amp; số cơ bản)</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-2  w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-650 font-bold mb-0.5">
                    Độ rộng vạch (0.5 - 6)
                  </label>
                  <input
                    {...getNumericInputProps(
                      "barcodeWidth",
                      selectedObject.barcodeWidth || 2,
                      (val) => handleAttributeChange("barcodeWidth", clampNumber(val, 0.5, 6, 2)),
                      2,
                    )}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-650 font-bold mb-0.5">
                    Cao mã (mm)
                  </label>
                  <input
                    {...getNumericInputProps(
                      "barcodeHeight",
                      selectedObject.barcodeHeight || 15,
                      (val) => handleAttributeChange("barcodeHeight", clampNumber(val, 5, 200, 15)),
                      15,
                    )}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Màu sắc mã vạch */}
            <div className="pt-2 border-t border-gray-200/50">
              <label className="block text-[11px] text-slate-650 font-bold mb-1">
                Màu mã vạch (đối tượng)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={selectedObject.color || "#000000"}
                  onChange={(e) =>
                    handleAttributeChange("color", e.target.value)
                  }
                  className="w-10 h-8 p-0 border border-gray-300 cursor-pointer rounded-md outline-none bg-transparent"
                />
                <input
                  type="text"
                  value={selectedObject.color || "#000000"}
                  onChange={(e) =>
                    handleAttributeChange("color", e.target.value)
                  }
                  className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono text-slate-800 font-bold"
                  placeholder="#000000"
                />
                <div className="flex space-x-1">
                  {["#000000", "#FF0000", "#0000FF", "#008000", "#FFA500"].map(
                    (hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => handleAttributeChange("color", hex)}
                        className="w-5 h-5 rounded-full border border-gray-350 cursor-pointer transition-transform hover:scale-110 shadow-sm"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>

            {/* 4. Cấu hình chữ nhãn */}
            <div className="pt-1.5 border-t border-gray-200/65 space-y-1 font-sans">
              <label className="block text-[11px] text-slate-705 font-black uppercase tracking-wider mb-0.5">
                Cấu hình chữ nhãn:
              </label>

              <div className="flex items-center space-x-2">
                <input
                  id="barcode-show-above-chk"
                  type="checkbox"
                  checked={!!selectedObject.barcodeShowTextAbove}
                  onChange={(e) =>
                    handleAttributeChange(
                      "barcodeShowTextAbove",
                      e.target.checked,
                    )
                  }
                  className="w-3.5 h-3.5 text-kiot-cyan border-gray-300 rounded focus:ring-kiot-cyan/50 cursor-pointer"
                />
                <label
                  htmlFor="barcode-show-above-chk"
                  className="text-[11.5px] text-slate-700 font-semibold select-none cursor-pointer"
                >
                  Hiển thị số/chữ bên trên mã vạch
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  id="barcode-show-below-chk"
                  type="checkbox"
                  checked={
                    selectedObject.barcodeShowTextBelow !== false &&
                    selectedObject.displayValue !== false
                  }
                  onChange={(e) => {
                    handleAttributeChange(
                      "barcodeShowTextBelow",
                      e.target.checked,
                    );
                    handleAttributeChange("displayValue", e.target.checked);
                  }}
                  className="w-3.5 h-3.5 text-kiot-cyan border-gray-300 rounded focus:ring-kiot-cyan/50 cursor-pointer"
                />
                <label
                  htmlFor="barcode-show-below-chk"
                  className="text-[11.5px] text-slate-700 font-semibold select-none cursor-pointer"
                >
                  Hiển thị số/chữ bên dưới mã vạch
                </label>
              </div>
            </div>

            {/* BARCODE TEXT FORMATTING */}
            {(selectedObject.barcodeShowTextAbove ||
              (selectedObject.barcodeShowTextBelow !== false &&
                selectedObject.displayValue !== false)) && (
              <div className="pt-2 border-t border-gray-150 space-y-2 bg-slate-50/50 p-2 rounded-md border border-gray-150 font-sans">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-650 font-bold mb-0.5">
                      Cỡ chữ (pt)
                    </label>
                    <input
                      {...getNumericInputProps(
                        "barcodeFontSize",
                        selectedObject.barcodeFontSize || 6,
                        (val) => handleAttributeChange("barcodeFontSize", val),
                        6,
                      )}
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-650 font-bold mb-0.5">
                      Font Chữ
                    </label>
                    <div className="relative">
                      <select
                        value={selectedObject.barcodeFontFamily || "sans-serif"}
                        onChange={(e) =>
                          handleAttributeChange(
                            "barcodeFontFamily",
                            e.target.value,
                          )
                        }
                        className="w-full pl-2 pr-6 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white appearance-none text-slate-800 font-bold"
                      >
                        <option value="sans-serif">Chữ thường (Sans)</option>
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Tahoma">Tahoma</option>
                        <option value="monospace">Mã máy (Mono)</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-2  w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-650 font-bold mb-0.5">
                    Khoảng cách tới mã vạch (mm)
                  </label>
                  <input
                    {...getNumericInputProps(
                      "barcodeTextMargin",
                      selectedObject.barcodeTextMargin !== undefined
                        ? selectedObject.barcodeTextMargin
                        : 0.5,
                      (val) => handleAttributeChange("barcodeTextMargin", val),
                      0.5,
                    )}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <div className="flex-1">
                    <span className="block text-[10.5px] text-slate-550 font-bold mb-0.5">
                      Độ đậm
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleAttributeChange(
                          "barcodeFontWeight",
                          selectedObject.barcodeFontWeight === "bold"
                            ? "normal"
                            : "bold",
                        )
                      }
                      className={`w-full py-1.5 flex items-center justify-center border rounded-md transition cursor-pointer ${
                        selectedObject.barcodeFontWeight === "bold"
                          ? "bg-sky-50/50 border-kiot-cyan text-kiot-navy font-bold ring-1 ring-kiot-cyan shadow-sm"
                          : "bg-white border-gray-250 text-gray-550 hover:text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <Bold className="w-3.5 h-3.5 mr-0.5 text-kiot-navy" />
                      <span className="text-[11px] font-bold">Tô đậm</span>
                    </button>
                  </div>

                  <div className="flex-1">
                    <span className="block text-[10.5px] text-slate-550 font-bold mb-0.5">
                      In nghiêng
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleAttributeChange(
                          "barcodeFontStyle",
                          selectedObject.barcodeFontStyle === "italic"
                            ? "normal"
                            : "italic",
                        )
                      }
                      className={`w-full py-1.5 flex items-center justify-center border rounded-md transition cursor-pointer ${
                        selectedObject.barcodeFontStyle === "italic"
                          ? "bg-sky-50/50 border-kiot-cyan text-kiot-navy italic font-bold ring-1 ring-kiot-cyan shadow-sm"
                          : "bg-white border-gray-250 text-gray-550 hover:text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <Italic className="w-3.5 h-3.5 mr-0.5 text-kiot-navy" />
                      <span className="text-[11px] font-bold">Nghiêng</span>
                    </button>
                  </div>
                </div>

                {/* Màu sắc chữ nhãn mã vạch */}
                <div className="pt-2 border-t border-gray-200/50">
                  <label className="block text-[11px] text-slate-650 font-bold mb-1">
                    Màu sắc chữ nhãn
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={selectedObject.barcodeTextColor || "#000000"}
                      onChange={(e) =>
                        handleAttributeChange(
                          "barcodeTextColor",
                          e.target.value,
                        )
                      }
                      className="w-10 h-8 p-0 border border-gray-300 cursor-pointer rounded-md outline-none bg-transparent"
                    />
                    <input
                      type="text"
                      value={selectedObject.barcodeTextColor || "#000000"}
                      onChange={(e) =>
                        handleAttributeChange(
                          "barcodeTextColor",
                          e.target.value,
                        )
                      }
                      className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono text-slate-800 font-bold"
                      placeholder="#000000"
                    />
                    <div className="flex space-x-1">
                      {[
                        "#000000",
                        "#FF0000",
                        "#0000FF",
                        "#008000",
                        "#FFA500",
                      ].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() =>
                            handleAttributeChange("barcodeTextColor", hex)
                          }
                          className="w-5 h-5 rounded-full border border-gray-350 cursor-pointer transition-transform hover:scale-110 shadow-sm"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Vị trí & Kích thước (Collapsible) at the end */}
            {renderPositionPanel()}
          </div>
        )}

        {/* QR CODE EXCLUSIVE ATTRIBUTES */}
        {selectedObject.type === "qrcode" && (
          <div className="space-y-2.5">
            {/* Nội dung QR Code */}
            <div className="space-y-1.5">
              <label className="block text-[11.5px] font-black text-slate-705 uppercase tracking-wider mb-0.5">
                Nội dung QR Code
              </label>

              {/* Way 1: Nhập thủ công */}
              <div className="space-y-1">
                <div className="flex items-center space-x-1">
                  <span className="text-[11px] font-black text-slate-550 uppercase tracking-wide">
                    Nhập:
                  </span>
                  <span className="text-[10.5px] text-slate-450 font-bold select-none italic">
                    (Điền nội dung cố định)
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={selectedObject.content}
                  disabled={excelColumns.length > 0 && !!selectedObject.excelColumn}
                  onChange={(e) =>
                    handleAttributeChange("content", e.target.value)
                  }
                  className={`w-full p-2 text-xs border border-gray-200 rounded-md font-mono focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none ${
                    (excelColumns.length > 0 && selectedObject.excelColumn)
                      ? "bg-gray-100 text-gray-450 select-none cursor-not-allowed font-semibold italic"
                      : "bg-white text-slate-800 font-bold"
                  }`}
                  placeholder={
                    (excelColumns.length > 0 && selectedObject.excelColumn)
                      ? `Lấy dữ liệu QR từ cột [${selectedObject.excelColumn}]`
                      : "Ví dụ: URL, số tài khoản, chuỗi mã hóa..."
                  }
                />
                {(excelColumns.length > 0 && selectedObject.excelColumn) && (
                  <p className="text-[10.5px] text-amber-600 font-bold mt-0.5">
                    ⚠️ Đang nối Excel. Nội dung QR bị ẩn.
                  </p>
                )}
              </div>

              {/* Separator: Hoặc */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-1.5 text-[10px] font-black text-gray-400 bg-white uppercase tracking-widest select-none px-1">
                  Hoặc
                </span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>

              {/* Way 2: renderExcelLinker */}
              {renderExcelLinker()}
            </div>

            <div className="text-[11px] text-gray-600 font-bold leading-relaxed bg-slate-50 p-2 rounded-md border border-gray-200">
              💡 <strong>Mẹo:</strong> QR Code sẽ tự động tăng mật độ nén dựa
              trên độ dài dữ liệu để máy quét/camera nhận dạng nhanh nhất.
            </div>

            {/* Mức sửa lỗi QR */}
            <div className="pt-2 border-t border-gray-200/50">
              <label className="block text-[11px] text-slate-650 font-bold mb-1">
                Mức sửa lỗi (Error correction)
              </label>
              <select
                value={selectedObject.qrErrorCorrection || "H"}
                onChange={(e) =>
                  handleAttributeChange("qrErrorCorrection", e.target.value as any)
                }
                className="w-full pl-2 pr-6 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-bold text-slate-800 cursor-pointer"
              >
                <option value="L">L - Thấp (chứa được nhiều dữ liệu nhất)</option>
                <option value="M">M - Trung bình</option>
                <option value="Q">Q - Khá cao</option>
                <option value="H">H - Cao nhất (mặc định, chịu bẩn/rách tốt)</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                Nội dung dài (trên ~1.000 ký tự) nên chọn mức L hoặc M.
              </p>
            </div>

            {/* Màu QR Code */}
            <div className="pt-2 border-t border-gray-200/50">
              <label className="block text-[11px] text-slate-650 font-bold mb-1">
                Màu sắc mã QR (đối tượng)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={selectedObject.color || "#000000"}
                  onChange={(e) =>
                    handleAttributeChange("color", e.target.value)
                  }
                  className="w-10 h-8 p-0 border border-gray-300 cursor-pointer rounded-md outline-none bg-transparent"
                />
                <input
                  type="text"
                  value={selectedObject.color || "#000000"}
                  onChange={(e) =>
                    handleAttributeChange("color", e.target.value)
                  }
                  className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono text-slate-800 font-bold"
                  placeholder="#000000"
                />
                <div className="flex space-x-1">
                  {["#000000", "#FF0000", "#0000FF", "#008000", "#FFA500"].map(
                    (hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => handleAttributeChange("color", hex)}
                        className="w-5 h-5 rounded-full border border-gray-350 cursor-pointer transition-transform hover:scale-110 shadow-sm"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>

            {/* Vị trí & Kích thước (Collapsible) */}
            {renderPositionPanel()}
          </div>
        )}

        {/* IMAGE EXCLUSIVE ATTRIBUTES */}
        {selectedObject.type === "image" && (
          <div className="space-y-2.5">
            {/* Nguồn hình ảnh */}
            <div className="space-y-1.5">
              <label className="block text-[11.5px] font-black text-slate-705 mb-0.5">
                Nguồn hình ảnh (URL hoặc Base64)
              </label>
              <textarea
                rows={2}
                value={
                  selectedObject.content.startsWith("data:")
                    ? "[Dữ liệu ảnh tải lên]"
                    : selectedObject.content
                }
                disabled={
                  selectedObject.content.startsWith("data:") ||
                  !!selectedObject.excelColumn
                }
                onChange={(e) =>
                  handleAttributeChange("content", e.target.value)
                }
                className={`w-full p-2 text-xs border border-gray-200 rounded-md font-mono focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white text-slate-800 disabled:bg-gray-100 disabled:text-gray-500`}
                placeholder="Dán đường dẫn ảnh hoặc kéo thả ảnh mới vào..."
              />
              {selectedObject.content.startsWith("data:") && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] text-green-600 font-bold">
                    ✓ Ảnh đã tải lên (Offline)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (re) => {
                            if (re.target?.result) {
                              handleAttributeChange(
                                "content",
                                re.target.result as string,
                              );
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                    className="text-[11px] text-kiot-cyan hover:underline font-black cursor-pointer"
                  >
                    Thay đổi ảnh...
                  </button>
                </div>
              )}
            </div>

            {/* Configurations & Scaling controls */}
            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-gray-100/50">
              <div>
                <label className="block text-[11px] text-slate-650 font-bold mb-0.5">
                  Tỷ lệ (Fit)
                </label>
                <div className="relative">
                  <select
                    value={selectedObject.imageFit || "contain"}
                    onChange={(e) =>
                      handleAttributeChange("imageFit", e.target.value as any)
                    }
                    className="w-full pl-2 pr-6 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white appearance-none text-slate-800 font-bold"
                  >
                    <option value="contain">Thu vừa (Contain)</option>
                    <option value="cover">Phủ kín (Cover)</option>
                    <option value="fill">Kéo giãn (Fill)</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-2  w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-650 font-bold mb-0.5">
                  Độ mờ (Opacity)
                </label>
                <input
                  {...getNumericInputProps(
                    "imageOpacity",
                    selectedObject.imageOpacity !== undefined
                      ? selectedObject.imageOpacity
                      : 1,
                    (val) => handleAttributeChange("imageOpacity", val),
                    1,
                  )}
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-650 font-bold mb-0.5">
                Đơn sắc khi xuất lệnh máy in nhiệt (ZPL/TSPL)
              </label>
              <div className="relative">
                <select
                  value={selectedObject.imageMono || "auto"}
                  onChange={(e) =>
                    handleAttributeChange("imageMono", e.target.value as any)
                  }
                  className="w-full pl-2 pr-6 py-1 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white appearance-none text-slate-800 font-bold"
                >
                  <option value="auto">Tự động (logo: ngưỡng, ảnh chụp: dither)</option>
                  <option value="threshold">Ngưỡng đen/trắng (nét sắc, cho logo)</option>
                  <option value="dither">Dither (giữ sắc độ ảnh chụp)</option>
                </select>
                <ChevronDown className="absolute right-2 top-2  w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="text-[11px] text-gray-600 font-bold leading-relaxed bg-slate-50 p-2 rounded-md border border-gray-200">
              💡 <strong>Mẹo:</strong> Có thể trực tiếp kéo và thả một file hình
              ảnh (.png, .jpg...) từ máy tính thả vào khung thiết kế để làm logo
              nhãn động.
            </div>

            {/* Vị trí & Kích thước (Collapsible) */}
            {renderPositionPanel()}
          </div>
        )}

        {/* SHAPE EXCLUSIVE ATTRIBUTES */}
        {selectedObject.type === "shape" && (
          <div className="space-y-4 font-sans">
            
            {/* Shape Type Selection */}
            <div className="space-y-2 pb-3 border-b border-gray-100">
              <label className="block text-[11.5px] font-black text-slate-700">
                Loại hình khối (Shape)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: "line",
                    name: "Đường kẻ (Line)",
                    icon: <Minus className="w-4 h-4 text-indigo-500" />
                  },
                  {
                    id: "rect",
                    name: "H.chữ nhật (Rect)",
                    icon: <Square className="w-4 h-4 text-amber-500" />
                  },
                  {
                    id: "circle",
                    name: "Hình tròn (Circle)",
                    icon: <Circle className="w-4 h-4 text-emerald-500" />
                  },
                  {
                    id: "oval",
                    name: "Hình oval (Oval)",
                    icon: (
                      <div className="w-4 h-2 bg-transparent border-[1.5px] border-pink-500 rounded-full inline-block shrink-0" />
                    )
                  },
                ].map((item) => {
                  const isSelected = (selectedObject.shapeType || "rect") === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const newType = item.id as any;
                        let nm = "Hình chữ nhật";
                        if (newType === "line") nm = "Đường kẻ";
                        else if (newType === "circle") nm = "Hình tròn";
                        else if (newType === "oval") nm = "Hình oval";
                        
                        onChangeObject({
                          ...selectedObject,
                          shapeType: newType,
                          content: nm
                        });
                      }}
                      className={`flex items-center space-x-1.5 p-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                        isSelected
                          ? "border-kiot-cyan bg-sky-50 text-kiot-cyan ring-1 ring-kiot-cyan/25 shadow-2xs"
                          : "border-gray-200 hover:bg-slate-50 text-slate-700 bg-white"
                      }`}
                    >
                      {item.icon}
                      <span className="truncate">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stroke Thickness and Style */}
            <div className="grid grid-cols-2 gap-2 pb-1">
              <div>
                <label className="block text-[10.5px] text-slate-500 font-bold mb-0.5">
                  Độ dày viền (mm)
                </label>
                <input
                  {...getNumericInputProps(
                    "shapeStrokeWidth",
                    selectedObject.shapeStrokeWidth !== undefined ? selectedObject.shapeStrokeWidth : 1,
                    (val) => handleAttributeChange("shapeStrokeWidth", val),
                    0.5,
                  )}
                  className="w-full px-2 py-0.5 text-xs border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10.5px] text-slate-500 font-bold mb-0.5">
                  Kiểu viền
                </label>
                <div className="relative">
                  <select
                    value={selectedObject.shapeStrokeStyle || "solid"}
                    onChange={(e) => handleAttributeChange("shapeStrokeStyle", e.target.value)}
                    className="w-full pl-1.5 pr-4 py-0.5 text-xs border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white text-slate-800 font-bold cursor-pointer"
                  >
                    <option value="solid">─── Liền viền (Solid)</option>
                    <option value="dashed">- - - Đứt nét (Dashed)</option>
                    <option value="dotted">• • • Chấm bi (Dotted)</option>
                  </select>
                  <ChevronDown className="absolute right-1 top-1.5 w-3 h-3 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Border Stroke Color */}
            <div className="space-y-1">
              <label className="block text-[10.5px] text-slate-505 font-bold">
                Màu sắc viền
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={selectedObject.shapeStrokeColor || "#000000"}
                  onChange={(e) => handleAttributeChange("shapeStrokeColor", e.target.value)}
                  className="w-8 h-7 p-0 border border-gray-300 cursor-pointer rounded outline-none bg-transparent shrink-0"
                />
                <input
                  type="text"
                  value={selectedObject.shapeStrokeColor || "#000000"}
                  onChange={(e) => handleAttributeChange("shapeStrokeColor", e.target.value)}
                  className="flex-1 px-1.5 py-0.5 text-xs border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white font-mono text-slate-800 font-bold"
                  placeholder="#000000"
                />
              </div>
            </div>

            {/* Shading / Background Fill Color */}
            {selectedObject.shapeType !== "line" && (
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10.5px] text-slate-550 font-bold">
                    Màu nền (Shading)
                  </label>
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedObject.shapeFillColor === "transparent"}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleAttributeChange("shapeFillColor", "transparent");
                        } else {
                          handleAttributeChange("shapeFillColor", "#ffffff");
                        }
                      }}
                      className="rounded border-gray-300 text-kiot-cyan focus:ring-kiot-cyan w-3 h-3 cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-505 font-bold select-none">
                      Trong suốt
                    </span>
                  </label>
                </div>

                {selectedObject.shapeFillColor !== "transparent" && (
                  <div className="flex items-center space-x-2 animate-fadeIn">
                    <input
                      type="color"
                      value={selectedObject.shapeFillColor || "#ffffff"}
                      onChange={(e) => handleAttributeChange("shapeFillColor", e.target.value)}
                      className="w-8 h-7 p-0 border border-gray-300 cursor-pointer rounded outline-none bg-transparent shrink-0"
                    />
                    <input
                      type="text"
                      value={selectedObject.shapeFillColor || "#ffffff"}
                      onChange={(e) => handleAttributeChange("shapeFillColor", e.target.value)}
                      className="flex-1 px-1.5 py-0.5 text-xs border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white font-mono text-slate-800 font-bold"
                      placeholder="#ffffff"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Corner Radius (Rectangle only) */}
            {selectedObject.shapeType === "rect" && (
              <div className="space-y-1.5 border-t border-gray-100 pt-3">
                <label className="block text-[10.5px] text-slate-505 font-bold mb-0.5">
                  Độ bo góc (Corner Radius - mm)
                </label>
                <input
                  {...getNumericInputProps(
                    "shapeCornerRadius",
                    selectedObject.shapeCornerRadius !== undefined ? selectedObject.shapeCornerRadius : 1.5,
                    (val) => handleAttributeChange("shapeCornerRadius", val),
                    0.5,
                  )}
                  className="w-full px-2 py-0.5 text-xs border border-gray-200 rounded focus:border-kiot-cyan focus:outline-none bg-white font-mono font-bold text-slate-800"
                />
              </div>
            )}

            {/* Vị trí & Kích thước (Collapsible) */}
            {renderPositionPanel()}
          </div>
        )}
      </main>

      {/* DELETE OBJECT BUTTON */}
      <div className="pt-3 border-t border-gray-200">
        <button
          type="button"
          onClick={() => onDeleteObject(selectedObject.id)}
          className="w-full py-1.5 px-3 border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 rounded-md flex items-center justify-center space-x-1.5 text-[11.5px] font-black uppercase transition duration-150 cursor-pointer shadow-sm animate-pulse-subtle"
        >
          <Trash2 className="w-4 h-4 text-red-500 hover:text-red-700" />
          <span>Xoá Đối Tượng</span>
        </button>
      </div>
    </div>
  );
}
