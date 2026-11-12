/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { LABEL_TEMPLATES } from "../templates";
import { LabelConfig, LabelObject, SheetLayoutConfig } from "../types";
import { Layers, FileText, Barcode, QrCode, Tag, ShoppingCart, Eye, Sparkles, Inbox, ChevronRight, X } from "lucide-react";

interface TemplateSelectorProps {
  onSelectTemplate: (
    config: LabelConfig,
    objects: LabelObject[],
    sheetConfig?: Partial<SheetLayoutConfig>
  ) => void;
}

export function TemplateSelector({ onSelectTemplate }: TemplateSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Helper to categorize template names
  const getCategoryOfTemplate = (name: string): string => {
    const norm = name.toLowerCase();
    if (norm.includes("kệ") || norm.includes("siêu thị")) {
      return "supermarket";
    }
    if (norm.includes("mắt kính") || norm.includes("kính")) {
      return "glasses";
    }
    if (norm.includes("trang sức") || norm.includes("vàng") || norm.includes("bạc")) {
      return "jewelry";
    }
    return "common"; // Default or common tag price
  };

  const getCountForCategory = (catId: string): number => {
    return LABEL_TEMPLATES.filter((t) => getCategoryOfTemplate(t.name) === catId).length;
  };

  const categories = [
    { id: "common", name: "Tem giá phổ biến", icon: Tag, colorClass: "text-emerald-500 bg-emerald-50" },
    { id: "supermarket", name: "Tem kệ siêu thị", icon: ShoppingCart, colorClass: "text-amber-500 bg-amber-50" },
    { id: "glasses", name: "Tem mắt kính", icon: Eye, colorClass: "text-indigo-500 bg-indigo-50" },
    { id: "jewelry", name: "Tem trang sức", icon: Sparkles, colorClass: "text-pink-500 bg-pink-50" },
  ];

  const filteredTemplates = activeCategory
    ? LABEL_TEMPLATES.filter((t) => getCategoryOfTemplate(t.name) === activeCategory)
    : [];

  const handleCategoryClick = (catId: string) => {
    if (activeCategory === catId) {
      setActiveCategory(null);
    } else {
      setActiveCategory(catId);
    }
  };

  const activeCategoryObj = categories.find((c) => c.id === activeCategory);

  return (
    <div
      id="template-selector"
      className="flex transition-all duration-300 ease-in-out gap-4 p-4"
      style={{ width: activeCategory ? "610px" : "270px" }}
    >
      {/* COLUMN 1: CATEGORIES LIST */}
      <div className="w-[238px] shrink-0 space-y-4 pr-1">
        {/* Selector Header */}
        <div className="flex items-center space-x-2 text-gray-750 pb-1 border-b border-gray-100">
          <Layers className="w-5 h-5 text-kiot-cyan" />
          <h3 className="font-semibold text-sm text-kiot-navy">Mẫu Thiết Kế Sẵn Có</h3>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-col gap-1.5 no-print" id="template-category-tabs">
          {categories.map((cat) => {
            const IconComponent = cat.icon;
            const isActive = activeCategory === cat.id;
            const count = getCountForCategory(cat.id);

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryClick(cat.id)}
                className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "border-kiot-cyan bg-sky-50/50 text-kiot-navy shadow-xs font-bold ring-1 ring-kiot-cyan/20"
                    : "border-slate-200 hover:border-slate-350 bg-white text-slate-600 hover:bg-slate-50 font-medium"
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div className={`p-1.5 rounded-md shrink-0 ${cat.colorClass}`}>
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <span className="text-[12.5px]">{cat.name}</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isActive
                        ? "bg-kiot-cyan text-white shadow-2xs"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                  <ChevronRight
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                      isActive ? "rotate-180 text-kiot-cyan" : ""
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* COLUMN 2: EXPANDED LIST */}
      {activeCategory && (
        <div className="w-[310px] shrink-0 border-l border-slate-100 pl-4 space-y-3 flex flex-col justify-start animate-fadeIn">
          {/* Sub Header */}
          <div className="flex items-center justify-between pb-1 border-b border-gray-105">
            <div className="flex items-center space-x-1.5 text-kiot-navy">
              {activeCategoryObj && (
                <div className={`p-1 rounded-md shrink-0 ${activeCategoryObj.colorClass} scale-90`}>
                  <activeCategoryObj.icon className="w-3.5 h-3.5" />
                </div>
              )}
              <span className="font-extrabold text-[11px] tracking-wide uppercase">
                {activeCategoryObj?.name}
              </span>
            </div>
            
            <button
              onClick={() => setActiveCategory(null)}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition cursor-pointer"
              title="Đóng bảng xem mẫu"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 border border-dashed border-slate-200 bg-slate-50/50 rounded-xl text-center space-y-2">
              <div className="p-2 bg-slate-100 rounded-full text-slate-400">
                <Inbox className="w-5 h-5" />
              </div>
              <p className="text-[11.5px] text-slate-650 font-semibold">Chưa có thiết kế mẫu</p>
              <p className="text-[10px] text-slate-450 leading-normal max-w-[210px] font-medium">
                Hãy gửi hình ảnh/mô tả mẫu qua chat để trợ lý thiết kế bổ sung cho bạn!
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 max-h-[350px]">
              {filteredTemplates.map((template, idx) => {
                const textCount = template.objects.filter((o) => o.type === "text").length;
                const barcodeCount = template.objects.filter((o) => o.type === "barcode").length;
                const qrCount = template.objects.filter((o) => o.type === "qrcode").length;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSelectTemplate(template.config, template.objects, template.sheetConfig);
                      setActiveCategory(null); // Auto-collapse on selection
                    }}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-kiot-cyan hover:bg-sky-50/30 active:bg-sky-100/50 transition-all duration-200 group relative block cursor-pointer"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-xs text-slate-800 group-hover:text-kiot-navy transition-colors">
                        {template.name}
                      </span>
                      <span className="text-[9.5px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 shrink-0 font-bold">
                        {template.config.width}x{template.config.height}mm
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed mb-2 font-medium">
                      {template.description}
                    </p>
                    
                    <div className="flex items-center space-x-3 text-[10px] text-gray-400 font-semibold">
                      {textCount > 0 && (
                        <span className="flex items-center space-x-1">
                          <FileText className="w-3 h-3 text-sky-400" />
                          <span>{textCount} Chữ</span>
                        </span>
                      )}
                      {barcodeCount > 0 && (
                        <span className="flex items-center space-x-1">
                          <Barcode className="w-3 h-3 text-emerald-400" />
                          <span>{barcodeCount} Mã vạch</span>
                        </span>
                      )}
                      {qrCount > 0 && (
                        <span className="flex items-center space-x-1">
                          <QrCode className="w-3 h-3 text-blue-400" />
                          <span>{qrCount} QR</span>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
