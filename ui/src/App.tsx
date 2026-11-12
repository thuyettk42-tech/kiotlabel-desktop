/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { LabelConfig, LabelObject, ObjectType, SheetLayoutConfig, DesignerTab } from "./types";
import { resizeImage, safeLocalStorage } from "./utils";
import { convertToZPL } from "./utils/zplGenerator";
import { convertToTSPL, tsplToBytes } from "./utils/tsplGenerator";
import { MAX_LABELS, MAX_LABELS_RASTER, buildPrintManifest } from "./utils/printLimits";
import { detectDesktop, listDesktopPrinters, printRawDesktop, startDesktopHeartbeat, DesktopInfo, DesktopPrinter } from "./utils/desktopBridge";

// Giá trị "máy in" nghĩa là xuất tệp PDF thay vì gửi lệnh ra máy in (bản desktop)
const PDF_TARGET = "__pdf__";

// Bản offline (portable, Windows) phát hành ở GitHub Releases của repo kiotlabel-desktop (công khai); liên kết "latest" luôn trỏ bản mới nhất
const OFFLINE_DOWNLOAD_URL = "https://github.com/thuyettk42-tech/kiotlabel-desktop/releases/latest/download/KiotLabel.exe";
import { prepareObjectBitmaps, rasterizeBackground } from "./utils/printerRaster";
import type { MonoBitmap } from "./utils/printerBitmap";
import { buildPages, totalLabelCount, type PageSpec } from "./utils/vectorPdf/pages";
import { readTableFile } from "./utils/tableFile";
import { LabelCanvas } from "./components/LabelCanvas";
import { callGeminiClientSide } from "./geminiClient";
import { isOutsideLabel } from "./utils";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ArrangeToolbar } from "./components/ArrangeToolbar";
import {
  alignObjects, distributeObjects, reorderObjects, duplicateObjects,
  type AlignMode, type DistributeAxis, type OrderAction,
} from "./utils/arrange";
import { TemplateSelector } from "./components/TemplateSelector";
// Thư viện nặng được tải khi cần (Excel, chụp trang, PDF) để trang mở nhanh hơn.
const loadXLSX = () => import("xlsx");
const loadHtml2canvas = () => import("html2canvas-pro").then((m) => m.default);
const loadJsPdf = () => import("jspdf").then((m) => m.jsPDF);
import { 
  Printer, 
  Plus, 
  Trash2, 
  FileText, 
  Barcode, 
  QrCode, 
  FolderHeart, 
  Save, 
  RefreshCw, 
  ZoomIn, 
  Maximize, 
  ZoomOut, 
  Compass, 
  Grid3X3,
  Undo2,
  Redo2,
  BookOpen,
  Info,
  ExternalLink,
  AlertCircle,
  Database,
  Upload,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  FileSpreadsheet,
  Image,
  Link,
  Cloud,
  CloudUpload,
  CloudDownload,
  LogOut,
  Lock,
  Settings,
  Laptop,
  Palette,
  CheckSquare,
  Minus,
  Square,
  Circle,
  Shapes,
  Terminal,
  Sparkles,
  Eye,
  EyeOff,
  Key,
  CheckCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface TomyTemplate {
  name: string;
  paperSize: 'A4' | 'A5';
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
  cols: number;
  rows: number;
  colGap: number;
  rowGap: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
}

const TOMY_TEMPLATES_DATA: TomyTemplate[] = [
  { name: "A5 - Tomy 99 - 96 tem 7 x 31 mm", paperSize: "A5", orientation: "portrait", width: 31, height: 7, cols: 4, rows: 24, colGap: 2, rowGap: 1.2, marginLeft: 9, marginRight: 9, marginTop: 7.2, marginBottom: 7.2 },
  { name: "A5 - Tomy 100 - 8 tem 37 x 96 mm", paperSize: "A5", orientation: "landscape", width: 96, height: 37, cols: 2, rows: 4, colGap: 2, rowGap: 0, marginLeft: 8, marginRight: 8, marginTop: 0, marginBottom: 0 },
  { name: "A5 - Tomy 101 - 6 tem 50 x 96 mm", paperSize: "A5", orientation: "landscape", width: 96, height: 50, cols: 2, rows: 3, colGap: 2, rowGap: 0, marginLeft: 8, marginRight: 8, marginTop: 0, marginBottom: 0 },
  { name: "A5 - Tomy 102 - 12 tem 52 x 47 mm", paperSize: "A5", orientation: "portrait", width: 47, height: 52, cols: 3, rows: 4, colGap: 2.5, rowGap: 2.5, marginLeft: 3, marginRight: 3, marginTop: 1, marginBottom: 1 },
  { name: "A5 - Tomy 103 - 12 tem 36 x 62 mm", paperSize: "A5", orientation: "portrait", width: 62, height: 36, cols: 2, rows: 6, colGap: 3, rowGap: 2, marginLeft: 10, marginRight: 10, marginTop: 1, marginBottom: 1 },
  { name: "A5 - Tomy 104 - 14 tem 25 x 78 mm", paperSize: "A5", orientation: "portrait", width: 78, height: 25, cols: 2, rows: 7, colGap: 3, rowGap: 2, marginLeft: 10, marginRight: 10, marginTop: 11, marginBottom: 11 },
  { name: "A5 - Tomy 105 - 30 tem 25 x 37 mm", paperSize: "A5", orientation: "portrait", width: 37, height: 25, cols: 3, rows: 10, colGap: 2, rowGap: 1.5, marginLeft: 10, marginRight: 10, marginTop: 2, marginBottom: 2 },
  { name: "A5 - Tomy 106 - 42 tem 25 x 25 mm", paperSize: "A5", orientation: "portrait", width: 25, height: 25, cols: 5, rows: 8, colGap: 2, rowGap: 1.5, marginLeft: 10, marginRight: 10, marginTop: 4, marginBottom: 4 },
  { name: "A5 - Tomy 107 - 30 tem 17 x 50 mm", paperSize: "A5", orientation: "portrait", width: 50, height: 17, cols: 2, rows: 15, colGap: 3, rowGap: 1.5, marginLeft: 10, marginRight: 10, marginTop: 3, marginBottom: 3 },
  { name: "A5 - Tomy 108 - 40 tem 19 x 36 mm", paperSize: "A5", orientation: "portrait", width: 36, height: 19, cols: 4, rows: 10, colGap: 2, rowGap: 1.5, marginLeft: 10, marginRight: 10, marginTop: 1, marginBottom: 1 },
  { name: "A5 - Tomy 109 - 55 tem 12 x 37 mm", paperSize: "A5", orientation: "portrait", width: 37, height: 12, cols: 3, rows: 18, colGap: 2, rowGap: 1.2, marginLeft: 10, marginRight: 10, marginTop: 1, marginBottom: 1 },
  { name: "A5 - Tomy 110 - 72 tem 16 x 22 mm", paperSize: "A5", orientation: "portrait", width: 22, height: 16, cols: 6, rows: 12, colGap: 1.5, rowGap: 1.2, marginLeft: 10, marginRight: 10, marginTop: 1, marginBottom: 1 },
  { name: "A5 - Tomy 112 - 144 tem 8 x 20 mm", paperSize: "A5", orientation: "portrait", width: 20, height: 8, cols: 6, rows: 24, colGap: 1.5, rowGap: 1.0, marginLeft: 10, marginRight: 10, marginTop: 1, marginBottom: 1 },
  { name: "A4 - Tomy 125 - 2 tem 206 x 145 mm", paperSize: "A4", orientation: "portrait", width: 206, height: 145, cols: 1, rows: 2, colGap: 0, rowGap: 3, marginLeft: 2, marginRight: 2, marginTop: 2, marginBottom: 2 },
  { name: "A4 - Tomy 126 - 4 tem 102 x 143 mm", paperSize: "A4", orientation: "portrait", width: 102, height: 143, cols: 2, rows: 2, colGap: 3, rowGap: 3, marginLeft: 2, marginRight: 2, marginTop: 4, marginBottom: 4 },
  { name: "A4 - Tomy 127 - 6 tem 100 x 94 mm", paperSize: "A4", orientation: "portrait", width: 100, height: 94, cols: 2, rows: 3, colGap: 3, rowGap: 3, marginLeft: 3, marginRight: 3, marginTop: 4.5, marginBottom: 4.5 },
  { name: "A4 - Tomy 128 - 8 tem 100 x 72 mm", paperSize: "A4", orientation: "portrait", width: 100, height: 72, cols: 2, rows: 4, colGap: 3, rowGap: 2.5, marginLeft: 3, marginRight: 3, marginTop: 1.5, marginBottom: 1.5 },
  { name: "A4 - Tomy 129 - 10 tem 98 x 56 mm", paperSize: "A4", orientation: "portrait", width: 98, height: 56, cols: 2, rows: 5, colGap: 3, rowGap: 2.5, marginLeft: 4, marginRight: 4, marginTop: 3.5, marginBottom: 3.5 },
  { name: "A4 - Tomy 130 - 12 tem 101 x 47 mm", paperSize: "A4", orientation: "portrait", width: 101, height: 47, cols: 2, rows: 6, colGap: 3, rowGap: 2, marginLeft: 2, marginRight: 2, marginTop: 2.5, marginBottom: 2.5 },
  { name: "A4 - Tomy 131 - 14 tem 98 x 40 mm", paperSize: "A4", orientation: "portrait", width: 98, height: 40, cols: 2, rows: 7, colGap: 3, rowGap: 2, marginLeft: 4, marginRight: 4, marginTop: 4, marginBottom: 4 },
  { name: "A4 - Tomy 132 - 48 tem 45.7 x 21.2 mm", paperSize: "A4", orientation: "portrait", width: 45.7, height: 21.2, cols: 4, rows: 12, colGap: 2.5, rowGap: 1.5, marginLeft: 9.8, marginRight: 9.8, marginTop: 13, marginBottom: 13 },
  { name: "A4 - Tomy 133 - 16 tem 101 x 36 mm", paperSize: "A4", orientation: "portrait", width: 101, height: 36, cols: 2, rows: 8, colGap: 3, rowGap: 1.5, marginLeft: 2, marginRight: 2, marginTop: 1, marginBottom: 1 },
  { name: "A4 - Tomy 134 - 18 tem 98 x 32 mm", paperSize: "A4", orientation: "portrait", width: 98, height: 32, cols: 2, rows: 9, colGap: 3, rowGap: 1.5, marginLeft: 4, marginRight: 4, marginTop: 0.5, marginBottom: 0.5 },
  { name: "A4 - Tomy 135 - 21 tem 66 x 40 mm", paperSize: "A4", orientation: "portrait", width: 66, height: 40, cols: 3, rows: 7, colGap: 2.5, rowGap: 1.5, marginLeft: 3, marginRight: 3, marginTop: 4, marginBottom: 4 },
  { name: "A4 - Tomy 136 - 24 tem 70 x 35 mm", paperSize: "A4", orientation: "portrait", width: 70, height: 35, cols: 3, rows: 8, colGap: 2.5, rowGap: 1.5, marginLeft: 2, marginRight: 2, marginTop: 4, marginBottom: 4 },
  { name: "A4 - Tomy 137 - 27 tem 50 x 37 mm", paperSize: "A4", orientation: "portrait", width: 50, height: 37, cols: 4, rows: 8, colGap: 2.5, rowGap: 1.5, marginLeft: 2, marginRight: 2, marginTop: 0.5, marginBottom: 0.5 },
  { name: "A4 - Tomy 138 - 30 tem 40 x 30 mm", paperSize: "A4", orientation: "portrait", width: 40, height: 30, cols: 5, rows: 6, colGap: 2, rowGap: 1.5, marginLeft: 1, marginRight: 1, marginTop: 53.5, marginBottom: 53.5 },
  { name: "A4 - Tomy 139 - 40 tem 70 x 20 mm", paperSize: "A4", orientation: "portrait", width: 70, height: 20, cols: 2, rows: 20, colGap: 3, rowGap: 1, marginLeft: 30, marginRight: 30, marginTop: 4.5, marginBottom: 4.5 },
  { name: "A4 - Tomy 140 - 80 tem 38 x 17 mm", paperSize: "A4", orientation: "portrait", width: 38, height: 17, cols: 5, rows: 16, colGap: 2, rowGap: 1, marginLeft: 5, marginRight: 5, marginTop: 5, marginBottom: 5 },
  { name: "A4 - Tomy 141 - 44 tem 46 x 25 mm", paperSize: "A4", orientation: "portrait", width: 46, height: 25, cols: 4, rows: 11, colGap: 2, rowGap: 1.5, marginLeft: 5, marginRight: 5, marginTop: 6, marginBottom: 6 },
  { name: "A4 - Tomy 143 - 45 tem 38 x 21 mm", paperSize: "A4", orientation: "portrait", width: 38, height: 21, cols: 5, rows: 9, colGap: 2, rowGap: 1.5, marginLeft: 5, marginRight: 5, marginTop: 46, marginBottom: 46 },
  { name: "A4 - Tomy 144 - 30 tem 67 x 47 mm", paperSize: "A4", orientation: "portrait", width: 67, height: 47, cols: 3, rows: 6, colGap: 2.5, rowGap: 2, marginLeft: 2, marginRight: 2, marginTop: 3.7, marginBottom: 3.8 },
  { name: "A4 - Tomy 145 - 65 tem 38 x 21 mm", paperSize: "A4", orientation: "portrait", width: 38, height: 21, cols: 5, rows: 13, colGap: 2, rowGap: 1.5, marginLeft: 5, marginRight: 5, marginTop: 6, marginBottom: 6 },
  { name: "A4 - Tomy 146 - 180 tem 20 x 15 mm", paperSize: "A4", orientation: "portrait", width: 20, height: 15, cols: 10, rows: 18, colGap: 1.5, rowGap: 1, marginLeft: 5, marginRight: 5, marginTop: 5, marginBottom: 5 },
  { name: "A4 - Tomy 147 - 32 tem 48 x 34 mm", paperSize: "A4", orientation: "portrait", width: 48, height: 34, cols: 4, rows: 8, colGap: 2.5, rowGap: 2, marginLeft: 4.5, marginRight: 4.5, marginTop: 7.2, marginBottom: 7.3 },
  { name: "A4 - Tomy 148 - 33 tem 66 x 25 mm", paperSize: "A4", orientation: "portrait", width: 66, height: 25, cols: 3, rows: 11, colGap: 2.5, rowGap: 1.5, marginLeft: 3, marginRight: 3, marginTop: 6, marginBottom: 6 },
  { name: "A4 - Tomy 149 - 18 tem 68 x 42 mm", paperSize: "A4", orientation: "portrait", width: 68, height: 42, cols: 3, rows: 6, colGap: 2.5, rowGap: 2, marginLeft: 2, marginRight: 2, marginTop: 17.5, marginBottom: 17.5 }
];

const InfoTooltip = ({ content }: { content: React.ReactNode }) => (
  <span className="group relative inline-flex items-center ml-1.5 cursor-help select-none align-middle">
    <Info className="w-3.5 h-3.5 text-sky-500 hover:text-sky-600 transition-colors duration-150" />
    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-900 p-2.5 text-[10.5px] font-normal leading-relaxed text-slate-100 opacity-0 shadow-xl transition-all duration-150 scale-95 origin-bottom group-hover:pointer-events-auto group-hover:opacity-100 group-hover:scale-100 font-sans normal-case tracking-normal text-left">
      {content}
      <span className="absolute top-full left-1/2 -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900" />
    </span>
  </span>
);

function binarizeCanvas(canvas: HTMLCanvasElement, threshold: number = 200) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  try {
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 128) {
        // Transparent is white
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      } else {
        const v = 0.299 * r + 0.587 * g + 0.114 * b;
        if (v < threshold) {
          // Dark pixel becomes solid black
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        } else {
          // Light pixel becomes solid white
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        }
        data[i + 3] = 255; // Solid opacity
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.error("Binarization failed:", e);
  }
}

export default function App() {
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const pasteInputRef = useRef<HTMLInputElement>(null);
  // 1. Core state for current active label
  const [labelConfig, setLabelConfig] = useState<LabelConfig>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.labelConfig) {
          return parsed.labelConfig;
        }
      }
    } catch (e) {
      console.error("Error reading draft labelConfig:", e);
    }
    return {
      width: 65,
      height: 45,
      name: "Tem Kệ Siêu Thị Mặc Định"
    };
  });

  // State to manage showing the quick instructions pop up
  const [showHowToUse, setShowHowToUse] = useState<boolean>(false);
  const [tabToDelete, setTabToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState<string>("");
  const [isPreparingPrint, setIsPreparingPrint] = useState<boolean>(false);
  // Đang dựng PDF vector: không cần dựng cả loạt tem trên màn hình như khi chụp ảnh (xem LabelCanvas, limitPreview)
  const [isVectorExporting, setIsVectorExporting] = useState<boolean>(false);

  // Bản desktop (portable): có máy chủ cục bộ để in thẳng ra máy in. Bản web: desktop = null và mọi thứ chạy như cũ.
  const [desktop, setDesktop] = useState<DesktopInfo | null>(null);
  const [desktopPrinters, setDesktopPrinters] = useState<DesktopPrinter[]>([]);
  const [printTarget, setPrintTarget] = useState<string>(() => safeLocalStorage.getItem("kiotlabel_print_target") || PDF_TARGET);
  const [isDirectPrinting, setIsDirectPrinting] = useState<boolean>(false);
  const [directPrintMsg, setDirectPrintMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Máy in đã lưu nhưng không còn trong danh sách thì quay về "Lưu thành PDF" (không bao giờ in nhầm máy khác)
  const effectivePrintTarget = printTarget !== PDF_TARGET && desktopPrinters.some((p) => p.name === printTarget) ? printTarget : PDF_TARGET;
  // Phím tắt Ctrl+P gọi hàm in mới nhất qua ref (bộ lắng nghe phím không đăng ký lại mỗi lần đổi máy in)
  const printActionRef = useRef<() => void>(() => {});
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    detectDesktop().then(async (info) => {
      if (cancelled || !info) return;
      setDesktop(info);
      stop = startDesktopHeartbeat();
      const r = await listDesktopPrinters();
      if (!cancelled && r.ok) setDesktopPrinters(r.data || []);
    });
    return () => { cancelled = true; stop(); };
  }, []);
  const [isSavingFile, setIsSavingFile] = useState<boolean>(false);
  const [saveFileProgress, setSaveFileProgress] = useState<string>("");
  const [optimizeThermalBinarization, setOptimizeThermalBinarization] = useState<boolean>(true);
  // Độ phân giải ảnh trong PDF/PNG (DPI). 288 = mức 3x như trước đây.
  const [pdfDpi, setPdfDpi] = useState<number>(() => {
    const v = parseInt(safeLocalStorage.getItem("kiotlabel_pdf_dpi") || "", 10);
    return [150, 203, 288, 300, 600].includes(v) ? v : 288;
  });
  // Kiểu PDF: vector (chữ/mã vạch là nét vẽ, nhẹ và nhanh) hoặc ảnh (chụp màn hình, dự phòng)
  const [pdfEngine, setPdfEngine] = useState<"vector" | "raster">(() =>
    safeLocalStorage.getItem("kiotlabel_pdf_engine") === "raster" ? "raster" : "vector"
  );
  const [cachedPagesCount, setCachedPagesCount] = useState<number>(0);
  const [autoReleaseRam, setAutoReleaseRam] = useState<boolean>(true);
  const [isExtendedSettingsOpen, setIsExtendedSettingsOpen] = useState<boolean>(false);
  // Điện thoại (<768px): chỉ hiện một khung mỗi lần, chuyển bằng thanh tab.
  const [mobilePane, setMobilePane] = useState<"panel" | "canvas">("panel");

  // Xuất lệnh máy in nhiệt (ZPL cho Zebra, TSPL cho TSC/Xprinter/Gprinter...)
  const [printerLang, setPrinterLang] = useState<"zpl" | "tspl">(() =>
    safeLocalStorage.getItem("kiotlabel_printer_lang") === "tspl" ? "tspl" : "zpl"
  );
  const [printerDpi, setPrinterDpi] = useState<number>(() => {
    const v = parseInt(safeLocalStorage.getItem("kiotlabel_printer_dpi") || "", 10);
    return [203, 300, 600].includes(v) ? v : 203;
  });
  const [tsplGapMm, setTsplGapMm] = useState<number>(() => {
    const v = parseFloat(safeLocalStorage.getItem("kiotlabel_printer_gap") || "");
    return Number.isFinite(v) && v >= 0 && v <= 20 ? v : 3;
  });
  const chooseLang = (v: "zpl" | "tspl") => { setPrinterLang(v); safeLocalStorage.setItem("kiotlabel_printer_lang", v); };
  const chooseDpi = (v: number) => { setPrinterDpi(v); safeLocalStorage.setItem("kiotlabel_printer_dpi", String(v)); };
  const chooseGap = (v: number) => { setTsplGapMm(v); safeLocalStorage.setItem("kiotlabel_printer_gap", String(v)); };

  // 2. Active list of objects placed on the label canvas
  const [objects, setObjects] = useState<LabelObject[]>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.objects) {
          return parsed.objects;
        }
      }
    } catch (e) {
      console.error("Error reading draft objects:", e);
    }
    return [
      {
        id: "init-text-1",
        type: "text",
        x: 0,
        y: -16.0,
        width: 59,
        height: 5,
        content: "CỬA HÀNG ĐIỆN TỬ VIỆT NAM",
        fontSize: 9,
        fontWeight: "bold",
        textFlowOrigin: "center",
        textAlign: "center"
      },
      {
        id: "init-barcode-1",
        type: "barcode",
        x: -29.5,
        y: -11.5,
        width: 38,
        height: 18,
        content: "VND-2026-06",
        barcodeFormat: "CODE128",
        displayValue: true,
        barcodeWidth: 1.4,
        barcodeHeight: 11,
        textFlowOrigin: "center"
      },
      {
        id: "init-text-2",
        type: "text",
        x: 0,
        y: 14.0,
        width: 59,
        height: 5,
        content: "Hotline: 1900 1234 - Địa chỉ: Hà Nội",
        fontSize: 7.5,
        textFlowOrigin: "center",
        textAlign: "center"
      },
      {
        id: "init-qrcode-1",
        type: "qrcode",
        x: 11.5,
        y: -11.5,
        width: 18,
        height: 18,
        content: "https://create-barcode-label.vercel.app/",
        textFlowOrigin: "center"
      }
    ];
  });

  // Undo/Redo action logs (max 10 previous operations)
  const [past, setPast] = useState<LabelObject[][]>([]);
  const [future, setFuture] = useState<LabelObject[][]>([]);

  // Wrapper function to update objects while recording historical actions
  // Số bước hoàn tác tối đa (trước đây chỉ 10 bước)
  const HISTORY_LIMIT = 100;
  // Luôn giữ bản sao mới nhất của danh sách đối tượng để ghi lịch sử mà không cần "side effect" trong hàm cập nhật state.
  // (Trước đây setPast được gọi bên trong setObjects(updater): ở chế độ dev, React chạy updater 2 lần nên mỗi thao tác
  // bị ghi 2 bước hoàn tác.)
  const objectsRef = useRef<LabelObject[]>(objects);
  objectsRef.current = objects;

  const setObjectsWithHistory = useCallback((newObjects: LabelObject[] | ((prev: LabelObject[]) => LabelObject[])) => {
    const current = objectsRef.current;
    const next = typeof newObjects === "function" ? newObjects(current) : newObjects;
    if (JSON.stringify(current) === JSON.stringify(next)) {
      return;
    }
    objectsRef.current = next; // các lệnh gọi liên tiếp trong cùng một sự kiện nối tiếp đúng
    setPast((prevPast) => [...prevPast, current].slice(-HISTORY_LIMIT));
    setFuture([]); // Xóa lịch sử làm lại khi có thay đổi mới
    setObjects(next);
  }, []);

  const handleUndo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, prev.length - 1));
    setFuture((prev) => [objects, ...prev]);
    setObjects(previous);
  }, [past, objects]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, objects].slice(-HISTORY_LIMIT));
    setObjects(next);
  }, [future, objects]);

  // 3. Selection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Clipboard state for copy & paste
  const [clipboard, setClipboard] = useState<LabelObject[]>([]);

  // Function to copy selected objects
  const handleCopy = useCallback(() => {
    if (selectedIds.length === 0) return;
    const itemsToCopy = objects.filter((obj) => selectedIds.includes(obj.id));
    if (itemsToCopy.length > 0) {
      // Deep clone the objects so they are independent
      setClipboard(JSON.parse(JSON.stringify(itemsToCopy)));
    }
  }, [objects, selectedIds]);

  // Function to paste copied objects
  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return;

    // Generate unique new IDs, shifting coordinates slightly
    const pastedItems: LabelObject[] = clipboard.map((original, index) => {
      const uniqueSuffix = Date.now() + "-" + Math.floor(Math.random() * 1000);
      const newId = `${original.type}-pasted-${uniqueSuffix}-${index}`;

      // Lệch 3 mm để thấy bản sao; nếu bản sao tràn ra ngoài tem thì giữ nguyên vị trí gốc
      const shifted: LabelObject = {
        ...original,
        id: newId,
        x: Math.round((original.x + 3) * 10) / 10,
        y: Math.round((original.y + 3) * 10) / 10,
      };
      return isOutsideLabel(shifted, labelConfig.width, labelConfig.height) && !isOutsideLabel(original, labelConfig.width, labelConfig.height)
        ? { ...original, id: newId }
        : shifted;
    });

    // Update canvas with new cloned objects
    setObjectsWithHistory((prev) => [...prev, ...pastedItems]);

    // Automatically select the new pasted items for a smooth UX
    if (pastedItems.length > 0) {
      const lastPastedId = pastedItems[pastedItems.length - 1].id;
      setSelectedId(lastPastedId);
      setSelectedIds(pastedItems.map(item => item.id));
    }

    // Update the clipboard coordinates so that if the user pastes again immediately, 
    // the next paste shifts from the newly pasted position!
    setClipboard(pastedItems);
  }, [clipboard, labelConfig.width, labelConfig.height, setObjectsWithHistory]);

  // ===== SẮP XẾP: căn chỉnh, phân bố, thứ tự lớp, nhân đôi, chọn tất cả =====
  const arrangeIds = useMemo(
    () => (selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : []),
    [selectedIds, selectedId]
  );

  const handleAlignObjects = useCallback(
    (mode: AlignMode) => {
      if (arrangeIds.length === 0) return;
      setObjectsWithHistory((prev) => alignObjects(prev, arrangeIds, mode, labelConfig.width, labelConfig.height));
    },
    [arrangeIds, labelConfig.width, labelConfig.height, setObjectsWithHistory]
  );

  const handleDistributeObjects = useCallback(
    (axis: DistributeAxis) => {
      if (arrangeIds.length < 3) return;
      setObjectsWithHistory((prev) => distributeObjects(prev, arrangeIds, axis, labelConfig.width, labelConfig.height));
    },
    [arrangeIds, labelConfig.width, labelConfig.height, setObjectsWithHistory]
  );

  const handleReorderObjects = useCallback(
    (action: OrderAction) => {
      if (arrangeIds.length === 0) return;
      setObjectsWithHistory((prev) => reorderObjects(prev, arrangeIds, action));
    },
    [arrangeIds, setObjectsWithHistory]
  );

  const handleDuplicateObjects = useCallback(() => {
    if (arrangeIds.length === 0) return;
    const stamp = Date.now();
    const result = duplicateObjects(
      objectsRef.current,
      arrangeIds,
      (original, index) => `${original.type}-dup-${stamp}-${index}`
    );
    if (result.newIds.length === 0) return;
    setObjectsWithHistory(result.objects);
    setSelectedId(result.newIds[result.newIds.length - 1]);
    setSelectedIds(result.newIds);
  }, [arrangeIds, setObjectsWithHistory]);

  const handleSelectAllObjects = useCallback(() => {
    const ids = objectsRef.current.map((o) => o.id);
    if (ids.length === 0) return;
    setSelectedId(ids[ids.length - 1]);
    setSelectedIds(ids);
  }, []);

  // Function to scale selected objects proportionally (e.g. for zoom/shortcut resize)
  const handleScaleSelectedObjects = useCallback((factor: number) => {
    if (selectedIds.length === 0) return;
    setObjectsWithHistory((prevObjects) =>
      prevObjects.map((obj) => {
        if (!selectedIds.includes(obj.id)) return obj;

        // Apply scale factor to coordinates if multiple, but scaling dimensions & content layout is essential
        let newWidth = Math.max(1, Math.round(obj.width * factor * 10) / 10);
        let newHeight = Math.max(1, Math.round(obj.height * factor * 10) / 10);

        // Constrain so they don't grow past the label's dimensions
        newWidth = Math.min(newWidth, labelConfig.width);
        newHeight = Math.min(newHeight, labelConfig.height);

        const updated: LabelObject = {
          ...obj,
          width: newWidth,
          height: newHeight,
        };

        if (obj.fontSize !== undefined) {
          updated.fontSize = Math.max(4, Math.round(obj.fontSize * factor * 10) / 10);
        }
        if (obj.prefixFontSize !== undefined) {
          updated.prefixFontSize = Math.max(4, Math.round(obj.prefixFontSize * factor * 10) / 10);
        }
        if (obj.suffixFontSize !== undefined) {
          updated.suffixFontSize = Math.max(4, Math.round(obj.suffixFontSize * factor * 10) / 10);
        }
        if (obj.letterSpacing !== undefined) {
          updated.letterSpacing = Math.round(obj.letterSpacing * factor * 100) / 100;
        }

        return updated;
      })
    );
  }, [selectedIds, labelConfig.width, labelConfig.height, setObjectsWithHistory]);

  // Function to toggle formatting properties on selected text objects
  const handleToggleTextFormat = useCallback((formatType: 'bold' | 'italic' | 'underline' | 'lineThrough') => {
    if (selectedIds.length === 0) return;
    setObjectsWithHistory((prevObjects) =>
      prevObjects.map((obj) => {
        if (!selectedIds.includes(obj.id) || obj.type !== "text") return obj;

        const updated = { ...obj };
        switch (formatType) {
          case 'bold':
            updated.fontWeight = obj.fontWeight === 'bold' ? 'normal' : 'bold';
            break;
          case 'italic':
            updated.fontStyle = obj.fontStyle === 'italic' ? 'normal' : 'italic';
            break;
          case 'underline':
            updated.textDecorationUnderline = !obj.textDecorationUnderline;
            break;
          case 'lineThrough':
            updated.textDecorationLineThrough = !obj.textDecorationLineThrough;
            break;
        }
        return updated;
      })
    );
  }, [selectedIds, setObjectsWithHistory]);

  const handleSelectObject = (id: string | null, isMultiSelect = false, skipTabSwitch = false) => {
    if (id === null) {
      setSelectedId(null);
      setSelectedIds([]);
      if (!skipTabSwitch) {
        setActiveSidebarTab('design');
      }
    } else {
      if (isMultiSelect) {
        setSelectedIds((prev) => {
          if (prev.includes(id)) {
            const filtered = prev.filter((item) => item !== id);
            const nextSelectedId = selectedId === id
              ? (filtered.length > 0 ? filtered[filtered.length - 1] : null)
              : selectedId;
            setSelectedId(nextSelectedId);
            return filtered;
          } else {
            setSelectedId(id);
            return [...prev, id];
          }
        });
      } else {
        setSelectedId(id);
        setSelectedIds([id]);
      }
    }
  };

  // 4. Utility display settings
  // The user requested that the old 120% zoom (1.2 * 7.07625 = 8.4915) be the new 100% default scale.
  // Standard pixels per mm is now 8.4915.
  const [pixelScale, setPixelScale] = useState<number>(8.4915);
  const [interfaceZoom, setInterfaceZoom] = useState<number>(() => {
    const saved = safeLocalStorage.getItem("kiotlabel_interface_zoom");
    return saved ? parseFloat(saved) : 0.85;
  });

  const [isZoomUserOverridden, setIsZoomUserOverridden] = useState<boolean>(() => {
    return safeLocalStorage.getItem("kiotlabel_interface_zoom_override") === "true";
  });

  const handleUpdateInterfaceZoom = (newZoom: number) => {
    setInterfaceZoom(newZoom);
    safeLocalStorage.setItem("kiotlabel_interface_zoom", String(newZoom));
  };

  // Automatically calculate ideal interface scale on resize for small screen resolutions if not overridden
  useEffect(() => {
    if (isZoomUserOverridden) return;

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      let idealZoom = 1.0;
      if (w < 1024) {
        idealZoom = 0.65;
      } else if (w < 1200) {
        idealZoom = 0.72;
      } else if (w < 1366) {
        idealZoom = 0.80;
      } else if (w < 1536) {
        idealZoom = 0.88;
      } else {
        idealZoom = 0.95;
      }

      // Also clamp by height
      if (h < 700 && idealZoom > 0.7) {
        idealZoom = 0.7;
      } else if (h < 800 && idealZoom > 0.82) {
        idealZoom = 0.80;
      }

      setInterfaceZoom(idealZoom);
    };

    handleResize(); // Initial check on mount
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isZoomUserOverridden]);

  const [gridSnapSize, setGridSnapSize] = useState<number>(1); // 1mm snapping by default
  const [customSaveName, setCustomSaveName] = useState<string>("");
  const [savedDesigns, setSavedDesigns] = useState<Array<{ name: string; timestamp: string; config: LabelConfig; sheetConfig?: SheetLayoutConfig; objects: LabelObject[] }>>([]);
  const [showSavedList, setShowSavedList] = useState<boolean>(false);
  const savedListContainerRef = useRef<HTMLDivElement>(null);
  const [showPresetDropdown, setShowPresetDropdown] = useState<boolean>(false);
  const [isPresetDropdownPinned, setIsPresetDropdownPinned] = useState<boolean>(false);
  const presetContainerRef = React.useRef<HTMLDivElement>(null);
  const [usePopularTomy, setUsePopularTomy] = useState<boolean>(false);
  const [tomySearchQuery, setTomySearchQuery] = useState<string>("");
  const [isTomyDropdownOpen, setIsTomyDropdownOpen] = useState<boolean>(false);
  const tomyContainerRef = React.useRef<HTMLDivElement>(null);

  // States for the custom Save Dialog Modal
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);
  const [saveLocation, setSaveLocation] = useState<'local' | 'device' | null>(null);
  const [saveTemplateName, setSaveTemplateName] = useState<string>("");
  const [saveFileFormat, setSaveFileFormat] = useState<'kvl' | 'json'>('kvl');
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [currentLocalStorageKey, setCurrentLocalStorageKey] = useState<string | null>(null);
  const [activeFileHandle, setActiveFileHandle] = useState<any>(null);
  const [saveLogs, setSaveLogs] = useState<Array<{ time: string; path: string; type: 'save' | 'import' | 'quick-save' }>>([]);

  // Printing Cache refs to prevent slow re-rendering when design hasn't changed
  const lastPdfStateRef = React.useRef<string>("");
  const lastPdfBlobUrlRef = React.useRef<string>("");
  const cachedCanvasesRef = React.useRef<HTMLCanvasElement[]>([]);
  const cachedCanvasesByContentKeyRef = React.useRef<Record<string, HTMLCanvasElement>>({});
  const cacheDesignKeyRef = React.useRef<string>("");

  const clearCanvasMemory = useCallback(() => {
    try {
      if (cachedCanvasesRef.current) {
        cachedCanvasesRef.current.forEach((canvas) => {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
        });
        cachedCanvasesRef.current = [];
      }
      if (cachedCanvasesByContentKeyRef.current) {
        Object.values(cachedCanvasesByContentKeyRef.current).forEach((canvas) => {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
        });
        cachedCanvasesByContentKeyRef.current = {};
      }
      cacheDesignKeyRef.current = "";
      setCachedPagesCount(0);
      console.log("Memory optimized: High-fidelity canvas elements purged & dereferenced successfully.");
    } catch (err) {
      console.error("Error during manual cache purge:", err);
    }
  }, []);

  // Google Drive integration states removed for lightweight offline operations
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [showPopupBlockedModal, setShowPopupBlockedModal] = useState<boolean>(false);
  const [popupBlobUrl, setPopupBlobUrl] = useState<string>("");
  const [isPopupBlocked, setIsPopupBlocked] = useState<boolean>(false);
  const [showImageImportModal, setShowImageImportModal] = useState<boolean>(false);
  const [driveUrlInput, setDriveUrlInput] = useState<string>("");
  const [webUrlInput, setWebUrlInput] = useState<string>("");
  const [importError, setImportError] = useState<string>("");

  // Escape đóng các hộp thoại chèn ảnh và lưu mẫu (trước đây chỉ đóng được bằng nút X nhỏ ở góc)
  useEffect(() => {
    if (!showImageImportModal && !showSaveDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showImageImportModal) { setShowImageImportModal(false); setImportError(""); }
      else if (showSaveDialog) setShowSaveDialog(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showImageImportModal, showSaveDialog]);


  // Excel Integration state
  const [excelData, setExcelData] = useState<any[]>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.excelData) return parsed.excelData;
      }
    } catch (e) {}
    return [];
  });
  const [excelColumns, setExcelColumns] = useState<string[]>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.excelColumns) return parsed.excelColumns;
      }
    } catch (e) {}
    return [];
  });
  const [currentExcelRowIndex, setCurrentExcelRowIndex] = useState<number>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.currentExcelRowIndex !== undefined) return parsed.currentExcelRowIndex;
      }
    } catch (e) {}
    return 0;
  });
  const [excelFileName, setExcelFileName] = useState<string>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.excelFileName) return parsed.excelFileName;
      }
    } catch (e) {}
    return "";
  });
  const [excelFileBase64, setExcelFileBase64] = useState<string>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.excelFileBase64) return parsed.excelFileBase64;
      }
    } catch (e) {}
    return "";
  });
  const [excelFilePath, setExcelFilePath] = useState<string | null>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.excelFilePath !== undefined) return parsed.excelFilePath;
      }
    } catch (e) {}
    return null;
  });
  const [excelFileHandle, setExcelFileHandle] = useState<any | null>(null);
  const [excelUploadMode, setExcelUploadMode] = useState<'sync' | 'new'>('new');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'layout' | 'design'>('layout');
  const [isExcelExpanded, setIsExcelExpanded] = useState<boolean>(false);
  const [sheetConfig, setSheetConfig] = useState<SheetLayoutConfig>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.sheetConfig) {
          return parsed.sheetConfig;
        }
      }
    } catch (e) {
      console.error("Error reading draft sheetConfig:", e);
    }
    return {
      mode: 'thermal',
      paperSize: 'A4',
      customWidth: 210,
      customHeight: 297,
      orientation: 'portrait',
      marginTop: 10,
      marginBottom: 10,
      marginLeft: 10,
      marginRight: 10,
      rows: 8,
      cols: 1,
      rowGap: 0,
      colGap: 0,
      showBorder: false,
      borderWidth: 1,
      borderRadius: 2,
      borderColor: '#9ca3af',
      rollSideMargin: 1
    };
  });
  const [officePreviewMode, setOfficePreviewMode] = useState<'design' | 'sheet'>('design');

  const [tabs, setTabs] = useState<DesignerTab[]>(() => {
    try {
      const savedTabs = safeLocalStorage.getItem("kiotlabel_tabs_v1");
      if (savedTabs) {
        const parsed = JSON.parse(savedTabs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Error reading saved tabs:", e);
    }

    const initObjects: LabelObject[] = [
      {
        id: "init-text-1",
        type: "text",
        x: 0,
        y: -16.0,
        width: 59,
        height: 5,
        content: "CỬA HÀNG ĐIỆN TỬ VIỆT NAM",
        fontSize: 9,
        fontWeight: "bold",
        textFlowOrigin: "center",
        textAlign: "center"
      },
      {
        id: "init-barcode-1",
        type: "barcode",
        x: -29.5,
        y: -11.5,
        width: 38,
        height: 18,
        content: "VND-2026-06",
        barcodeFormat: "CODE128",
        displayValue: true,
        barcodeWidth: 1.4,
        barcodeHeight: 11,
        textFlowOrigin: "center"
      },
      {
        id: "init-text-2",
        type: "text",
        x: 0,
        y: 14.0,
        width: 59,
        height: 5,
        content: "Hotline: 1900 1234 - Địa chỉ: Hà Nội",
        fontSize: 7.5,
        textFlowOrigin: "center",
        textAlign: "center"
      },
      {
        id: "init-qrcode-1",
        type: "qrcode",
        x: 11.5,
        y: -11.5,
        width: 18,
        height: 18,
        content: "https://create-barcode-label.vercel.app/",
        textFlowOrigin: "center"
      }
    ];

    try {
      const savedDraft = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed) {
          return [
            {
              id: "tab-default-1",
              name: parsed.labelConfig?.name || "Mẫu Thiết Kế 1",
              labelConfig: parsed.labelConfig || {
                width: 65,
                height: 45,
                name: "Tem Kệ Siêu Thị Mặc Định"
              },
              sheetConfig: parsed.sheetConfig || {
                mode: 'thermal',
                paperSize: 'A4',
                customWidth: 210,
                customHeight: 297,
                orientation: 'portrait',
                marginTop: 10,
                marginBottom: 10,
                marginLeft: 10,
                marginRight: 10,
                rows: 8,
                cols: 1,
                rowGap: 0,
                colGap: 0,
                showBorder: false,
                borderWidth: 1,
                borderRadius: 2,
                borderColor: '#9ca3af',
                rollSideMargin: 1
              },
              objects: parsed.objects || initObjects,
              excelData: parsed.excelData || [],
              excelColumns: parsed.excelColumns || [],
              excelFileName: parsed.excelFileName || "",
              excelFileBase64: parsed.excelFileBase64 || "",
              excelFilePath: parsed.excelFilePath || null,
              currentExcelRowIndex: parsed.currentExcelRowIndex !== undefined ? parsed.currentExcelRowIndex : 0,
              past: [],
              future: [],
              selectedId: null,
              selectedIds: [],
              officePreviewMode: 'design',
              printCopies: parsed.printCopies !== undefined ? parsed.printCopies : 24,
              printQuantityMode: parsed.printQuantityMode || 'constant',
              printQuantityColumn: parsed.printQuantityColumn || ""
            }
          ];
        }
      }
    } catch (e) {
      console.error("Error reading draft during migration:", e);
    }

    return [
      {
        id: "tab-default-1",
        name: "Mẫu Thiết Kế 1",
        labelConfig: {
          width: 65,
          height: 45,
          name: "Tem Kệ Siêu Thị Mặc Định"
        },
        sheetConfig: {
          mode: 'thermal',
          paperSize: 'A4',
          customWidth: 210,
          customHeight: 297,
          orientation: 'portrait',
          marginTop: 10,
          marginBottom: 10,
          marginLeft: 10,
          marginRight: 10,
          rows: 8,
          cols: 1,
          rowGap: 0,
          colGap: 0,
          showBorder: false,
          borderWidth: 1,
          borderRadius: 2,
          borderColor: '#9ca3af',
          rollSideMargin: 1
        },
        objects: initObjects,
        excelData: [],
        excelColumns: [],
        excelFileName: "",
        excelFileBase64: "",
        excelFilePath: null,
        currentExcelRowIndex: 0,
        past: [],
        future: [],
        selectedId: null,
        selectedIds: [],
        officePreviewMode: 'design',
        printCopies: 24,
        printQuantityMode: 'constant',
        printQuantityColumn: ''
      }
    ];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const savedActiveId = safeLocalStorage.getItem("kiotlabel_active_tab_id_v1");
      if (savedActiveId) return savedActiveId;
    } catch (e) {}
    return "tab-default-1";
  });

  const [printCopies, setPrintCopies] = useState<number>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.printCopies !== undefined) return parsed.printCopies;
      }
    } catch (e) {}
    return 24;
  });
  const [printCopiesInput, setPrintCopiesInput] = useState<string>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.printCopies !== undefined) return String(parsed.printCopies);
      }
    } catch (e) {}
    return "24";
  });
  const [printQuantityMode, setPrintQuantityMode] = useState<'constant' | 'excel_column'>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.printQuantityMode) return parsed.printQuantityMode;
      }
    } catch (e) {}
    return 'constant';
  });
  const [printQuantityColumn, setPrintQuantityColumn] = useState<string>(() => {
    try {
      const saved = safeLocalStorage.getItem("barcode_designer_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.printQuantityColumn !== undefined) return parsed.printQuantityColumn;
      }
    } catch (e) {}
    return "";
  });

  const handleSwitchTab = (targetTabId: string) => {
    if (targetTabId === activeTabId) return;
    const targetTab = tabs.find(t => t.id === targetTabId);
    if (targetTab) {
      setLabelConfig(targetTab.labelConfig);
      setSheetConfig(targetTab.sheetConfig);
      setObjects(targetTab.objects);
      setExcelData(targetTab.excelData);
      setExcelColumns(targetTab.excelColumns);
      setExcelFileName(targetTab.excelFileName);
      setExcelFileBase64(targetTab.excelFileBase64 || "");
      setExcelFilePath(targetTab.excelFilePath || null);
      setCurrentExcelRowIndex(targetTab.currentExcelRowIndex);
      setPast(targetTab.past || []);
      setFuture(targetTab.future || []);
      setSelectedId(targetTab.selectedId || null);
      setSelectedIds(targetTab.selectedIds || []);
      setOfficePreviewMode(targetTab.officePreviewMode || 'design');
      
      // Load print settings
      setPrintCopies(targetTab.printCopies !== undefined ? targetTab.printCopies : 24);
      setPrintCopiesInput(String(targetTab.printCopies !== undefined ? targetTab.printCopies : 24));
      setPrintQuantityMode(targetTab.printQuantityMode || 'constant');
      setPrintQuantityColumn(targetTab.printQuantityColumn || "");

      setActiveTabId(targetTabId);
      
      setWidthInput(String(targetTab.labelConfig.width));
      setHeightInput(String(targetTab.labelConfig.height));
      setColsInput(String(targetTab.sheetConfig.cols));
      setRowsInput(String(targetTab.sheetConfig.rows));
      setMarginLeftInput(String(targetTab.sheetConfig.marginLeft));
      setMarginRightInput(String(targetTab.sheetConfig.marginRight));
      setMarginTopInput(String(targetTab.sheetConfig.marginTop));
      setMarginBottomInput(String(targetTab.sheetConfig.marginBottom));
      setColGapOfficeInput(String(targetTab.sheetConfig.colGap));
      setRowGapOfficeInput(String(targetTab.sheetConfig.rowGap));
      setBorderRadiusInput(String(targetTab.sheetConfig.borderRadius));
      setRollSideMarginInput(String(targetTab.sheetConfig.rollSideMargin !== undefined ? targetTab.sheetConfig.rollSideMargin : 1));
    }
  };

  const handleAddTab = () => {
    const nextIndex = tabs.length + 1;
    const newTabId = `tab-custom-${Date.now()}`;
    const initObjects: LabelObject[] = [
      {
        id: "init-text-1",
        type: "text",
        x: 0,
        y: -16.0,
        width: 59,
        height: 5,
        content: "CỬA HÀNG ĐIỆN TỬ VIỆT NAM",
        fontSize: 9,
        fontWeight: "bold",
        textFlowOrigin: "center",
        textAlign: "center"
      },
      {
        id: "init-barcode-1",
        type: "barcode",
        x: -29.5,
        y: -11.5,
        width: 38,
        height: 18,
        content: "VND-2026-06",
        barcodeFormat: "CODE128",
        displayValue: true,
        barcodeWidth: 1.4,
        barcodeHeight: 11,
        textFlowOrigin: "center"
      },
      {
        id: "init-text-2",
        type: "text",
        x: 0,
        y: 14.0,
        width: 59,
        height: 5,
        content: "Hotline: 1900 1234 - Địa chỉ: Hà Nội",
        fontSize: 7.5,
        textFlowOrigin: "center",
        textAlign: "center"
      },
      {
        id: "init-qrcode-1",
        type: "qrcode",
        x: 11.5,
        y: -11.5,
        width: 18,
        height: 18,
        content: "https://create-barcode-label.vercel.app/",
        textFlowOrigin: "center"
      }
    ];

    const newTab: DesignerTab = {
      id: newTabId,
      name: `Mẫu Thiết Kế ${nextIndex}`,
      labelConfig: {
        width: 65,
        height: 45,
        name: `Mẫu Thiết Kế ${nextIndex}`
      },
      sheetConfig: {
        mode: 'thermal',
        paperSize: 'A4',
        customWidth: 210,
        customHeight: 297,
        orientation: 'portrait',
        marginTop: 10,
        marginBottom: 10,
        marginLeft: 10,
        marginRight: 10,
        rows: 8,
        cols: 1,
        rowGap: 0,
        colGap: 0,
        showBorder: false,
        borderWidth: 1,
        borderRadius: 2,
        borderColor: '#9ca3af',
        rollSideMargin: 1
      },
      objects: initObjects,
      excelData: [],
      excelColumns: [],
      excelFileName: "",
      excelFileBase64: "",
      excelFilePath: null,
      currentExcelRowIndex: 0,
      past: [],
      future: [],
      selectedId: null,
      selectedIds: [],
      officePreviewMode: 'design',
      printCopies: 24,
      printQuantityMode: 'constant',
      printQuantityColumn: ''
    };
    
    setTabs(prev => [...prev, newTab]);
    
    setLabelConfig(newTab.labelConfig);
    setSheetConfig(newTab.sheetConfig);
    setObjects(newTab.objects);
    setExcelData(newTab.excelData);
    setExcelColumns(newTab.excelColumns);
    setExcelFileName(newTab.excelFileName);
    setExcelFileBase64(newTab.excelFileBase64 || "");
    setExcelFilePath(newTab.excelFilePath || null);
    setCurrentExcelRowIndex(newTab.currentExcelRowIndex);
    setPast([]);
    setFuture([]);
    setSelectedId(null);
    setSelectedIds([]);
    setOfficePreviewMode('design');

    // Reset print settings for new tab
    setPrintCopies(24);
    setPrintCopiesInput("24");
    setPrintQuantityMode('constant');
    setPrintQuantityColumn('');

    setActiveTabId(newTabId);
    
    setWidthInput(String(newTab.labelConfig.width));
    setHeightInput(String(newTab.labelConfig.height));
    setColsInput(String(newTab.sheetConfig.cols));
    setRowsInput(String(newTab.sheetConfig.rows));
    setMarginLeftInput(String(newTab.sheetConfig.marginLeft));
    setMarginRightInput(String(newTab.sheetConfig.marginRight));
    setMarginTopInput(String(newTab.sheetConfig.marginTop));
    setMarginBottomInput(String(newTab.sheetConfig.marginBottom));
    setColGapOfficeInput(String(newTab.sheetConfig.colGap));
    setRowGapOfficeInput(String(newTab.sheetConfig.rowGap));
    setBorderRadiusInput(String(newTab.sheetConfig.borderRadius));
    setRollSideMarginInput(String(newTab.sheetConfig.rollSideMargin !== undefined ? newTab.sheetConfig.rollSideMargin : 1));
  };

  const handleDeleteTabClick = (tabIdToDelete: string, tabName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) {
      alert("Không thể xóa bản thiết kế cuối cùng!");
      return;
    }
    setTabToDelete({ id: tabIdToDelete, name: tabName });
  };

  const handleConfirmDeleteTab = () => {
    if (!tabToDelete) return;
    const tabIdToDelete = tabToDelete.id;
    const updatedTabs = tabs.filter(t => t.id !== tabIdToDelete);
    setTabs(updatedTabs);
    
    if (activeTabId === tabIdToDelete) {
      const remainingTab = updatedTabs[0];
      
      setLabelConfig(remainingTab.labelConfig);
      setSheetConfig(remainingTab.sheetConfig);
      setObjects(remainingTab.objects);
      setExcelData(remainingTab.excelData);
      setExcelColumns(remainingTab.excelColumns);
      setExcelFileName(remainingTab.excelFileName);
      setExcelFileBase64(remainingTab.excelFileBase64 || "");
      setExcelFilePath(remainingTab.excelFilePath || null);
      setCurrentExcelRowIndex(remainingTab.currentExcelRowIndex);
      setPast(remainingTab.past || []);
      setFuture(remainingTab.future || []);
      setSelectedId(remainingTab.selectedId || null);
      setSelectedIds(remainingTab.selectedIds || []);
      setOfficePreviewMode(remainingTab.officePreviewMode || 'design');
      setActiveTabId(remainingTab.id);
      
      setWidthInput(String(remainingTab.labelConfig.width));
      setHeightInput(String(remainingTab.labelConfig.height));
      setColsInput(String(remainingTab.sheetConfig.cols));
      setRowsInput(String(remainingTab.sheetConfig.rows));
      setMarginLeftInput(String(remainingTab.sheetConfig.marginLeft));
      setMarginRightInput(String(remainingTab.sheetConfig.marginRight));
      setMarginTopInput(String(remainingTab.sheetConfig.marginTop));
      setMarginBottomInput(String(remainingTab.sheetConfig.marginBottom));
      setColGapOfficeInput(String(remainingTab.sheetConfig.colGap));
      setRowGapOfficeInput(String(remainingTab.sheetConfig.rowGap));
      setBorderRadiusInput(String(remainingTab.sheetConfig.borderRadius));
      setRollSideMarginInput(String(remainingTab.sheetConfig.rollSideMargin !== undefined ? remainingTab.sheetConfig.rollSideMargin : 1));
    }
    setTabToDelete(null);
  };

  const handleRenameTab = (tabId: string) => {
    const tabToRename = tabs.find(t => t.id === tabId);
    if (!tabToRename) return;
    setEditingTabId(tabId);
    setEditingTabName(tabToRename.name);
  };

  const handleSaveTabName = (tabId: string) => {
    if (editingTabName && editingTabName.trim()) {
      const trimmed = editingTabName.trim();
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, name: trimmed } : t));
      if (tabId === activeTabId) {
        setLabelConfig(prev => ({ ...prev, name: trimmed }));
      }
    }
    setEditingTabId(null);
  };

  const [wasDesignModeForPrint, setWasDesignModeForPrint] = useState<boolean>(false);
  const [isSystemPrinting, setIsSystemPrinting] = useState<boolean>(false);
  // Google auth configurations removed for offline usage

  // Báo cáo ứng dụng đã tải đầy đủ thành công cho pywebview để xác nhận không lỗi khi khởi động
  useEffect(() => {
    // Ẩn màn hình khởi động (startup loader) khi React khởi chạy thành công
    const loader = document.getElementById("startup-loader");
    if (loader) {
      loader.style.opacity = "0";
      loader.style.transition = "opacity 0.3s ease-out";
      setTimeout(() => loader.remove(), 300);
    }

    let attempts = 0;
    const maxAttempts = 60; // 60 lần thử * 300ms = 18 giây dò tìm tối đa
    const interval = setInterval(() => {
      attempts++;
      const pw = (window as any).pywebview;
      if (pw && pw.api && typeof pw.api.mark_app_loaded === "function") {
        pw.api.mark_app_loaded()
          .then((res: any) => {
            console.log("[DESKTOP] Đã báo cáo tải ứng dụng React thành công.", res);
            clearInterval(interval);
          })
          .catch((err: any) => {
            console.error("[DESKTOP] Lỗi gọi API báo cáo tải:", err);
            clearInterval(interval);
          });
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 300);

    const reportReady = () => {
      const pw = (window as any).pywebview;
      if (pw && pw.api && typeof pw.api.mark_app_loaded === "function") {
        pw.api.mark_app_loaded()
          .then(() => clearInterval(interval))
          .catch(() => {});
      }
    };

    window.addEventListener("pywebviewready", reportReady);

    return () => {
      clearInterval(interval);
      window.removeEventListener("pywebviewready", reportReady);
    };
  }, []);

  // Temporary string states for numeric inputs to allow easy deletion/re-typing
  const [widthInput, setWidthInput] = useState<string>("65");
  const [heightInput, setHeightInput] = useState<string>("45");
  const [colsInput, setColsInput] = useState<string>("1");
  const [rowsInput, setRowsInput] = useState<string>("8");
  const [marginLeftInput, setMarginLeftInput] = useState<string>("10");
  const [marginRightInput, setMarginRightInput] = useState<string>("10");
  const [marginTopInput, setMarginTopInput] = useState<string>( "10");
  const [marginBottomInput, setMarginBottomInput] = useState<string>("10");
  const [colGapOfficeInput, setColGapOfficeInput] = useState<string>("0");
  const [rowGapOfficeInput, setRowGapOfficeInput] = useState<string>("3");
  const [desiredRollWidthInput, setDesiredRollWidthInput] = useState<string>("67");
  const [customWidthInput, setCustomWidthInput] = useState<string>("210");
  const [customHeightInput, setCustomHeightInput] = useState<string>("297");
  const [borderRadiusInput, setBorderRadiusInput] = useState<string>("2");
  const [rollSideMarginInput, setRollSideMarginInput] = useState<string>("1");

  // Keep temporary inputs synchronized with main configurations from external updates
  useEffect(() => {
    if (document.activeElement?.id !== "roll-side-margin-input") {
      setRollSideMarginInput(String(sheetConfig.rollSideMargin !== undefined ? sheetConfig.rollSideMargin : 1));
    }
  }, [sheetConfig.rollSideMargin]);

  useEffect(() => {
    if (document.activeElement?.id !== "custom-width-input") {
      setCustomWidthInput(String(sheetConfig.customWidth || 210));
    }
  }, [sheetConfig.customWidth]);

  useEffect(() => {
    if (document.activeElement?.id !== "custom-height-input") {
      setCustomHeightInput(String(sheetConfig.customHeight || 297));
    }
  }, [sheetConfig.customHeight]);

  useEffect(() => {
    if (document.activeElement?.id !== "border-radius-input") {
      setBorderRadiusInput(String(sheetConfig.borderRadius !== undefined ? sheetConfig.borderRadius : 2));
    }
  }, [sheetConfig.borderRadius]);
  useEffect(() => {
    if (document.activeElement?.id !== "width-input") {
      setWidthInput(String(labelConfig.width));
    }
  }, [labelConfig.width]);

  useEffect(() => {
    if (document.activeElement?.id !== "height-input") {
      setHeightInput(String(labelConfig.height));
    }
  }, [labelConfig.height]);

  useEffect(() => {
    if (document.activeElement?.id !== "cols-input" && document.activeElement?.id !== "cols-roll-input") {
      setColsInput(String(sheetConfig.cols));
    }
  }, [sheetConfig.cols]);

  useEffect(() => {
    if (document.activeElement?.id !== "rows-input") {
      setRowsInput(String(sheetConfig.rows));
    }
  }, [sheetConfig.rows]);

  useEffect(() => {
    if (document.activeElement?.id !== "margin-left-input") {
      setMarginLeftInput(String(sheetConfig.marginLeft));
    }
  }, [sheetConfig.marginLeft]);

  useEffect(() => {
    if (document.activeElement?.id !== "margin-right-input") {
      setMarginRightInput(String(sheetConfig.marginRight));
    }
  }, [sheetConfig.marginRight]);

  useEffect(() => {
    if (document.activeElement?.id !== "margin-top-input") {
      setMarginTopInput(String(sheetConfig.marginTop));
    }
  }, [sheetConfig.marginTop]);

  useEffect(() => {
    if (document.activeElement?.id !== "margin-bottom-input") {
      setMarginBottomInput(String(sheetConfig.marginBottom));
    }
  }, [sheetConfig.marginBottom]);

  useEffect(() => {
    if (document.activeElement?.id !== "col-gap-office-input") {
      setColGapOfficeInput(String(sheetConfig.colGap));
    }
  }, [sheetConfig.colGap]);

  useEffect(() => {
    if (document.activeElement?.id !== "row-gap-office-input") {
      setRowGapOfficeInput(String(sheetConfig.rowGap));
    }
  }, [sheetConfig.rowGap]);

  // Restore preview mode & print state after printing dialogues or window focusing
  useEffect(() => {
    if (!isSystemPrinting && !wasDesignModeForPrint) return;

    const handleRestore = () => {
      setTimeout(() => {
        setIsSystemPrinting(false);
        if (wasDesignModeForPrint) {
          setOfficePreviewMode('design');
          setWasDesignModeForPrint(false);
        }
      }, 600); // 600ms buffer to allow print threads to completely close
    };

    window.addEventListener('afterprint', handleRestore);
    window.addEventListener('focus', handleRestore);

    return () => {
      window.removeEventListener('afterprint', handleRestore);
      window.removeEventListener('focus', handleRestore);
    };
  }, [isSystemPrinting, wasDesignModeForPrint]);

  // Tự động lưu bản nháp thiết kế & Excel liên kết vào localStorage khi có thay đổi
  useEffect(() => {
    try {
      const draft = {
        labelConfig,
        objects,
        sheetConfig,
        excelFileName,
        excelColumns,
        excelData,
        excelFileBase64,
        excelFilePath,
        currentExcelRowIndex,
        printCopies,
        printQuantityMode,
        printQuantityColumn
      };
      safeLocalStorage.setItem("barcode_designer_draft_v1", JSON.stringify(draft));

      // Update the active tab's full design and excel integration state in the tabs array
      setTabs(prevTabs => {
        const updatedTabs = prevTabs.map(t => {
          if (t.id === activeTabId) {
            return {
              ...t,
              name: labelConfig.name || t.name,
              labelConfig,
              objects,
              sheetConfig,
              excelFileName,
              excelColumns,
              excelData,
              excelFileBase64,
              excelFilePath,
              currentExcelRowIndex,
              past,
              future,
              selectedId,
              selectedIds,
              officePreviewMode,
              printCopies,
              printQuantityMode,
              printQuantityColumn
            };
          }
          return t;
        });
        
        safeLocalStorage.setItem("kiotlabel_tabs_v1", JSON.stringify(updatedTabs));
        return updatedTabs;
      });

      safeLocalStorage.setItem("kiotlabel_active_tab_id_v1", activeTabId);
    } catch (err) {
      console.warn("Failed to auto-save workspace draft to localStorage:", err);
    }
  }, [
    labelConfig,
    objects,
    sheetConfig,
    excelFileName,
    excelColumns,
    excelData,
    excelFileBase64,
    excelFilePath,
    currentExcelRowIndex,
    activeTabId,
    past,
    future,
    selectedId,
    selectedIds,
    officePreviewMode,
    printCopies,
    printQuantityMode,
    printQuantityColumn
  ]);

  const [desiredRollWidth, setDesiredRollWidth] = useState<number>(67);
  const [isQuickSizeOpen, setIsQuickSizeOpen] = useState<boolean>(false);
  const [isBatchPrinting, setIsBatchPrinting] = useState<boolean>(false);
  const [isPrintExpanded, setIsPrintExpanded] = useState<boolean>(false);
  const [isStep1Expanded, setIsStep1Expanded] = useState<boolean>(true);
  const [isStep2Expanded, setIsStep2Expanded] = useState<boolean>(false);
  const [isStep3Expanded, setIsStep3Expanded] = useState<boolean>(true);
  const [isAiRecognizerExpanded, setIsAiRecognizerExpanded] = useState<boolean>(false);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiImageUrlInput, setAiImageUrlInput] = useState<string>("");
  const [isAiAnalyzing, setIsAiAnalyzing] = useState<boolean>(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<string>("");
  const [userCustomApiKey, setUserCustomApiKey] = useState<string>(() => safeLocalStorage.getItem("barcode_designer_gemini_key") || "");
  const [showCustomApiKey, setShowCustomApiKey] = useState<boolean>(false);
  const [isHoveringDropzone, setIsHoveringDropzone] = useState<boolean>(false);
  const [showSuccessBadge, setShowSuccessBadge] = useState<boolean>(false);
  const [colGapUnit, setColGapUnit] = useState<'mm' | 'inch'>('mm');
  const [rowGapUnit, setRowGapUnit] = useState<'mm' | 'inch'>('mm');
  const [colGapInput, setColGapInput] = useState<string>("");
  const [rowGapInput, setRowGapInput] = useState<string>("");

  useEffect(() => {
    if (document.activeElement?.id !== "roll-width-input") {
      setDesiredRollWidthInput(String(desiredRollWidth));
    }
  }, [desiredRollWidth]);

  // Global paste handler for smart clipboard image load and designer elements
  useEffect(() => {
    const handlePasteEvent = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      let hasImage = false;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              hasImage = true;
              const reader = new FileReader();
              reader.onload = (event) => {
                if (event.target?.result) {
                  setAiImage(event.target.result as string);
                  setIsAiRecognizerExpanded(true); // Auto-expand/open AI Recognizer sidebar!
                  setActiveSidebarTab('layout'); // Switch to Layout tab which contains the AI section so user can see it!
                  setShowSuccessBadge(true);
                  setTimeout(() => setShowSuccessBadge(false), 3500);
                }
              };
              reader.readAsDataURL(file);
              e.preventDefault();
              e.stopPropagation();
              break;
            }
          }
        }
      }

      // If an image was pasted, we stop here (already handled)
      if (hasImage) return;

      // If no image was found/pasted, check if user is typing in inputs.
      // If typing in input, we let the browser paste text normally (do NOT intercept).
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || activeEl.getAttribute("contenteditable") === "true") {
          return;
        }
      }

      // If no input is focused, and we have custom design elements copied in our designer clipboard, paste them!
      if (clipboard.length > 0) {
        handlePaste();
        e.preventDefault();
      }
    };

    // Auto focus window when mouse enters document body so shortcuts like Ctrl+V work immediately inside iFrame
    const handleMouseEnter = () => {
      if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        window.focus();
      }
    };

    window.addEventListener("paste", handlePasteEvent, true);
    document.body.addEventListener("mouseenter", handleMouseEnter);
    
    return () => {
      window.removeEventListener("paste", handlePasteEvent, true);
      document.body.removeEventListener("mouseenter", handleMouseEnter);
    };
  }, [clipboard, handlePaste]);

  // Forward computed roll width synchronization hook
  useEffect(() => {
    if (document.activeElement?.id !== "roll-width-input") {
      const colGaps = (sheetConfig.cols - 1) * (sheetConfig.colGap || 0);
      const sideMargin = sheetConfig.rollSideMargin !== undefined ? sheetConfig.rollSideMargin : 1;
      const computedW = (labelConfig.width * sheetConfig.cols) + colGaps + sideMargin * 2;
      const roundedW = Math.round(computedW * 10) / 10;
      if (desiredRollWidth !== roundedW) {
        setDesiredRollWidth(roundedW);
      }
    }
  }, [labelConfig.width, sheetConfig.cols, sheetConfig.colGap, sheetConfig.rollSideMargin]);

  useEffect(() => {
    if (document.activeElement?.id !== "col-gap-input") {
      const val = sheetConfig.colGap || 0;
      if (colGapUnit === 'inch') {
        setColGapInput(String(parseFloat((val / 25.4).toFixed(4))));
      } else {
        setColGapInput(String(val));
      }
    }
  }, [sheetConfig.colGap, colGapUnit]);

  useEffect(() => {
    if (document.activeElement?.id !== "row-gap-input") {
      const val = sheetConfig.rowGap !== undefined ? sheetConfig.rowGap : 3.0;
      if (rowGapUnit === 'inch') {
        setRowGapInput(String(parseFloat((val / 25.4).toFixed(4))));
      } else {
        setRowGapInput(String(val));
      }
    }
  }, [sheetConfig.rowGap, rowGapUnit]);

  // Synchronize printCopiesInput text field string whenever printCopies is updated from outside
  useEffect(() => {
    setPrintCopiesInput(String(printCopies));
  }, [printCopies]);

  // Debounce the actual printCopies state updates to prevent browser layout slowdowns when typing quantities
  useEffect(() => {
    const val = parseInt(printCopiesInput, 10);
    if (!isNaN(val) && val > 0) {
      const timer = setTimeout(() => {
        setPrintCopies(val);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [printCopiesInput]);

  // Keep isBatchPrinting in sync with excelData availability
  useEffect(() => {
    setIsBatchPrinting(excelData.length > 0);
  }, [excelData]);

  // Handle click outside for Preset dropdown and Tomy dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!target || !document.body.contains(target)) {
        return; // Ignore detached elements (e.g. elements removed or re-rendered instantly) to avoid closing on tab switches
      }
      if (presetContainerRef.current && !presetContainerRef.current.contains(target)) {
        setShowPresetDropdown(false);
        setIsPresetDropdownPinned(false);
      }
      if (tomyContainerRef.current && !tomyContainerRef.current.contains(target)) {
        setIsTomyDropdownOpen(false);
      }
      if (savedListContainerRef.current && !savedListContainerRef.current.contains(target)) {
        setShowSavedList(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowSavedList(false);
        setShowPresetDropdown(false);
        setIsPresetDropdownPinned(false);
        setIsTomyDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Helper to convert ArrayBuffer to Base64 using a memory-safe and performance-optimized chunked reader
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 0xffff; // 64k chunks to prevent call-stack overflows and massive memory allocations
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunkSize) as any
      );
    }
    return btoa(binary);
  };

  // Central processor to import & parse Excel data from binary array buffer
  const processExcelBinary = async (dataArrayBuffer: ArrayBuffer, fileName: string, isNewFile: boolean): Promise<boolean> => {
    try {
      const XLSX = await loadXLSX();
      const data = new Uint8Array(dataArrayBuffer);
      // Tệp .csv/.tsv/.txt được giải mã đúng bảng mã (UTF-8 không BOM, UTF-16, Windows-1258) trước khi đọc
      const workbook = readTableFile(XLSX, data, fileName);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false });
      
      if (rawData.length < 1) {
        alert("Tệp Excel rỗng hoặc không chứa bảng dữ liệu!");
        return false;
      }

      // Header row (first row of Excel file)
      const headers = (rawData[0] as any[]).map(h => String(h || "").trim()).filter(h => h !== "");
      
      if (headers.length === 0) {
        alert("Không tìm thấy tiêu đề cột hợp lệ nào ở dòng thứ nhất!");
        return false;
      }

      // Mappings items by header
      const items: any[] = [];
      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i] as any[];
        if (!row || row.length === 0 || row.every(cell => cell === null || cell === undefined || cell === "")) {
          continue; // Skip blank lines
        }
        const itemObj: any = {};
        headers.forEach((header, colIdx) => {
          itemObj[header] = row[colIdx] !== undefined ? String(row[colIdx]) : "";
        });
        items.push(itemObj);
      }

      if (items.length === 0) {
        alert("Nhập tệp Excel thành công nhưng không có các dòng dữ liệu từ dòng số 2 để liên kết.");
        return false;
      }

      setExcelFileName(fileName);
      setExcelColumns(headers);
      setExcelData(items);
      setPrintCopies(1);
      setCurrentExcelRowIndex(0);
      setIsExcelExpanded(true);

      if (isNewFile) {
        // If a new different file is selected, clear all associations/mappings
        setObjects(prevObjects => prevObjects.map(obj => {
          const copy = { ...obj };
          delete copy.excelColumn;
          return copy;
        }));
      }

      setTimeout(() => {
        document.getElementById("excel-section-header")?.scrollIntoView({ behavior: "smooth" });
      }, 100);

      return true;
    } catch (err: any) {
      console.error("XLSX parse error: ", err);
      alert("Nạp tệp Excel thất bại. Vui lòng kiểm tra lại định dạng tệp .xlsx, .xls hoặc .csv.");
      return false;
    }
  };

  // Standard manual <input type="file"> event handler (Fallback source)
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64 for design storage (.kvl mapping retention)
    const b64Reader = new FileReader();
    b64Reader.onload = (b64Evt) => {
      try {
        const b64Result = b64Evt.target?.result as string;
        const base64Content = b64Result.split(",")[1] || b64Result;
        setExcelFileBase64(base64Content);
      } catch (errB64) {
        console.error("FileReader base64 error:", errB64);
      }
    };
    b64Reader.readAsDataURL(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        processExcelBinary(evt.target.result as ArrayBuffer, file.name, excelUploadMode === 'new');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Combined trigger to launch native file selectors across all target runtime frames
  const triggerExcelLoadDialog = async (modeOverride?: 'new' | 'sync') => {
    const activeMode = modeOverride || excelUploadMode;
    // @ts-ignore
    if (window.pywebview && window.pywebview.api && window.pywebview.api.load_excel_native) {
      try {
        // @ts-ignore
        const response = await window.pywebview.api.load_excel_native();
        if (response && response.status === "success" && response.base64) {
          setExcelFilePath(response.file_path);
          
          // Match array bounds
          const binaryStr = atob(response.base64);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          
          const ok = await processExcelBinary(bytes.buffer, response.filename, activeMode === 'new');
          if (ok) {
            setExcelFileBase64(response.base64);
          }
        } else if (response && response.status === "error") {
          alert("Lỗi mở file thông qua hệ điều hành: " + response.message);
        }
      } catch (err: any) {
        alert("Lỗi khởi tạo hộp thoại chọn file hệ thống: " + err.message);
      }
    } else if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        // @ts-ignore
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'Tệp Excel/CSV (*.xlsx, *.xls, *.csv)',
              accept: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                'application/vnd.ms-excel': ['.xls'],
                'text/csv': ['.csv']
              }
            }
          ],
          multiple: false
        });
        
        const file = await handle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        const ok = await processExcelBinary(arrayBuffer, file.name, activeMode === 'new');
        if (ok) {
          setExcelFileHandle(handle);
          const base64Str = arrayBufferToBase64(arrayBuffer);
          setExcelFileBase64(base64Str);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          alert("Lỗi nạp Excel: " + err.message);
        }
      }
    } else {
      // Standard local <input> tag fallback
      setExcelUploadMode(activeMode);
      setTimeout(() => {
        document.getElementById("excel-file-uploader-direct")?.click();
      }, 50);
    }
  };

  // COMPLETELY SYSTEM-HIDDEN BACKGROUND EXCEL HOT UPDATE Worker
  const handleDirectExcelSync = async () => {
    // 1. Pywebview native background update path (completely silent!)
    // @ts-ignore
    if (window.pywebview && window.pywebview.api && window.pywebview.api.read_file_base64_direct && excelFilePath) {
      try {
        // @ts-ignore
        const response = await window.pywebview.api.read_file_base64_direct(excelFilePath);
        if (response && response.status === "success" && response.base64) {
          // Convert base64 back to ArrayBuffer
          const binaryStr = atob(response.base64);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const ok = await processExcelBinary(bytes.buffer, response.filename, false); // Always sync mode (preserve mappings)
          if (ok) {
            setExcelFileBase64(response.base64);
            alert(`[ĐỒNG BỘ CHẠY NGẦM THÀNH CÔNG]\nHệ thống đã tự động quét và làm mới dữ liệu từ đường dẫn:\n"${excelFilePath}"\n\n✓ Giữ nguyên 100% tất cả các liên kết trường dữ liệu.`);
          }
        } else if (response && response.status === "error") {
          // If the file was moved or is inaccessible, offer standard re-picking fallback
          alert(`Không thể tự động đồng bộ ẩn: ${response.message}\n\nHệ thống sẽ hiển thị hộp thoại chọn lại file để khôi phục.`);
          triggerExcelLoadDialog('sync');
        }
      } catch (err: any) {
        alert("Lỗi đồng bộ chạy ngầm: " + err.message);
        triggerExcelLoadDialog('sync');
      }
    }
    // 2. Modern browser File Access handle updates (completely silent if permission still granted!)
    else if (excelFileHandle) {
      try {
        const opt = { mode: 'read' as const };
        let permissionGranted = false;
        
        const currentPermission = await excelFileHandle.queryPermission(opt);
        if (currentPermission === 'granted') {
          permissionGranted = true;
        } else {
          const requestPermission = await excelFileHandle.requestPermission(opt);
          if (requestPermission === 'granted') {
            permissionGranted = true;
          }
        }
        
        if (permissionGranted) {
          const file = await excelFileHandle.getFile();
          const arrayBuffer = await file.arrayBuffer();
          const ok = await processExcelBinary(arrayBuffer, file.name, false); // Always sync mode (preserve mappings)
          if (ok) {
            const base64Str = arrayBufferToBase64(arrayBuffer);
            setExcelFileBase64(base64Str);
            alert(`[ĐỒNG BỘ CHẠY NGẦM THÀNH CÔNG]\nĐã cập nhật dữ liệu tự động từ file: "${file.name}"\n\n✓ Giữ nguyên 100% tất cả các liên kết trường dữ liệu.`);
          }
        } else {
          // If permission is denied, fall back transparently
          triggerExcelLoadDialog('sync');
        }
      } catch (err: any) {
        console.warn("Silent file handle refresh failed, promoting to dialog:", err);
        triggerExcelLoadDialog('sync');
      }
    }
    // 3. Fallback path: standard web upload dialog
    else {
      triggerExcelLoadDialog('sync');
    }
  };

  const handleClearExcel = () => {
    setExcelData([]);
    setExcelColumns([]);
    setCurrentExcelRowIndex(0);
    setExcelFileName("");
    setExcelFileBase64(""); // Clear base64 as well
    setExcelFilePath(null);
    setExcelFileHandle(null);
    setPrintQuantityMode('constant');
    setPrintQuantityColumn("");
    setPrintCopies(24);
    // Safely strip excelColumn linkage from active objects
    setObjects(objects.map(obj => {
      const copy = { ...obj };
      delete copy.excelColumn;
      return copy;
    }));
  };

  // Helper resolver that swaps object content dynamically based on Excel column linking and indices
  const resolveDynamicObjects = (objs: LabelObject[], rowIndex: number) => {
    if (excelData && excelData.length > 0) {
      const activeRow = excelData[rowIndex];
      if (activeRow) {
        return objs.map(obj => {
          if (obj.excelColumn && activeRow[obj.excelColumn] !== undefined) {
            return {
              ...obj,
              content: String(activeRow[obj.excelColumn] ?? "")
            };
          }
          return obj;
        });
      }
    }
    return objs;
  };

  // Danh sách tem sẽ in (dòng Excel nào, mấy bản), giới hạn MAX_LABELS để không treo trình duyệt (xem utils/printLimits.ts)
  const printManifestData = useMemo(() => buildPrintManifest({
    excelData,
    mode: printQuantityMode,
    column: printQuantityColumn,
    copies: printCopies,
  }), [excelData, printQuantityMode, printQuantityColumn, printCopies]);

  const printManifest = useMemo(() => printManifestData.manifest, [printManifestData]);
  const printLimitWarning = useMemo(() => printManifestData.warning, [printManifestData]);

  // Wrapper for cell level dynamic object resolver that respects the repeating print count
  const resolveDynamicObjectsForCell = (objs: LabelObject[], globalCellIndex: number) => {
    if (excelData && excelData.length > 0) {
      let rowIndex = globalCellIndex;
      if (printManifest.length > 0) {
        rowIndex = printManifest[globalCellIndex] !== undefined ? printManifest[globalCellIndex] : 0;
      }
      return resolveDynamicObjects(objs, rowIndex);
    }
    return objs;
  };

  // Identify headers in excelColumns matching 2 strict conditions:
  // 1. Header label matches keywords (SL, Số lượng, Tồn kho, Kho, v.v.)
  // 2. Values starting from row 2 downward (excelData entries) must be numeric
  const numericExcelColumns = useMemo(() => {
    if (!excelData || excelData.length === 0) return [];
    return excelColumns.filter((col) => {
      // Điều kiện 1: Kiểm tra tên tiêu đề cột hỗ trợ đa dạng từ khóa Việt/Anh và loại bỏ dấu tiếng Việt hoàn toàn để đối chiếu
      const title = String(col).toLowerCase().normalize("NFC").trim();
      
      const stripAccents = (str: string) => {
        return str
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/g, "d");
      };
      const titleCleaned = stripAccents(title);
      
      const isQuantityHeader = 
        title === "sl" ||
        title === "sl." ||
        title === "s.l" ||
        title.startsWith("sl ") ||
        title.endsWith(" sl") ||
        titleCleaned.includes("so luong") ||
        titleCleaned.includes("sl ton") ||
        titleCleaned.includes("ton kho") ||
        titleCleaned.includes("ton") ||
        titleCleaned.includes("kho") ||
        titleCleaned.includes("inventory") ||
        titleCleaned.includes("stock") ||
        titleCleaned.includes("qty") ||
        titleCleaned.includes("quantity");

      if (!isQuantityHeader) {
        return false;
      }

      // Điều kiện 2: Kiểm tra dữ liệu từ dòng 2 trở xuống (toàn bộ excelData) có là Number không
      let numericCount = 0;
      let totalChecked = 0;
      for (let i = 0; i < excelData.length; i++) {
        const val = excelData[i][col];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          totalChecked++;
          const cleaned = String(val).trim().replace(/,/g, '');
          const num = Number(cleaned);
          if (!isNaN(num) && isFinite(num)) {
            numericCount++;
          }
        }
      }
      // Đảm bảo tối thiểu 95% dòng dữ liệu không trống là số để tránh nhận diện sai
      return totalChecked > 0 && (numericCount / totalChecked) >= 0.95;
    });
  }, [excelData, excelColumns]);

  // Proactive column selector for numeric print count
  useEffect(() => {
    if (printQuantityMode === "excel_column" && numericExcelColumns.length > 0) {
      if (!printQuantityColumn || !numericExcelColumns.includes(printQuantityColumn)) {
        setPrintQuantityColumn(numericExcelColumns[0]);
      }
    }
  }, [printQuantityMode, numericExcelColumns, printQuantityColumn]);

  // Load saved designs on mount (100% Offline Local Storage)
  useEffect(() => {
    try {
      const loaded = safeLocalStorage.getItem("barcode_designer_saved_v1");
      if (loaded) {
        setSavedDesigns(JSON.parse(loaded));
      }
    } catch (err) {
      console.error("Failed to load local saved designs:", err);
    }
  }, []);

  const getSheetDimensions = (config: SheetLayoutConfig) => {
    let baseWidth = 210;
    let baseHeight = 297;
    if (config.paperSize === 'A5') {
      baseWidth = 148;
      baseHeight = 210;
    } else if (config.paperSize === 'custom') {
      baseWidth = config.customWidth || 210;
      baseHeight = config.customHeight || 297;
    }
    if (config.orientation === 'landscape') {
      return { width: baseHeight, height: baseWidth };
    }
    return { width: baseWidth, height: baseHeight };
  };

  // Sync variables to CSS before print dialog is prompted
  useEffect(() => {
    const root = document.documentElement;
    if (sheetConfig.mode === 'office') {
      const { width: sWidth, height: sHeight } = getSheetDimensions(sheetConfig);
      root.style.setProperty("--print-width", `${sWidth}mm`);
      root.style.setProperty("--print-height", `${sHeight}mm`);
      
      root.style.setProperty("--sheet-m-top", `${sheetConfig.marginTop}mm`);
      root.style.setProperty("--sheet-m-bottom", `${sheetConfig.marginBottom}mm`);
      root.style.setProperty("--sheet-m-left", `${sheetConfig.marginLeft}mm`);
      root.style.setProperty("--sheet-m-right", `${sheetConfig.marginRight}mm`);
      
      root.style.setProperty("--sheet-grid-cols", `repeat(${sheetConfig.cols}, ${labelConfig.width}mm)`);
      root.style.setProperty("--sheet-grid-rows", `repeat(${sheetConfig.rows}, ${labelConfig.height}mm)`);
      root.style.setProperty("--sheet-col-gap", `${sheetConfig.colGap}mm`);
      root.style.setProperty("--sheet-row-gap", `${sheetConfig.rowGap}mm`);
      
      root.style.setProperty("--cell-w", `${labelConfig.width}mm`);
      root.style.setProperty("--cell-h", `${labelConfig.height}mm`);
      
      if (sheetConfig.showBorder) {
        root.style.setProperty("--cell-border", `${sheetConfig.borderWidth}px solid ${sheetConfig.borderColor || '#9ca3af'}`);
      } else {
        root.style.setProperty("--cell-border", "none");
      }
      root.style.setProperty("--cell-radius", `${sheetConfig.borderRadius}mm`);
    } else if (sheetConfig.mode === 'thermal' && (officePreviewMode === 'sheet' || isBatchPrinting)) {
      const cols = sheetConfig.cols || 1;
      const colGap = sheetConfig.colGap || 0;
      const backingWidth = cols * labelConfig.width + (cols - 1) * colGap;
      root.style.setProperty("--print-width", `${backingWidth}mm`);
      root.style.setProperty("--print-height", `${labelConfig.height}mm`);
    } else {
      root.style.setProperty("--print-width", `${labelConfig.width}mm`);
      root.style.setProperty("--print-height", `${labelConfig.height}mm`);
    }
  }, [labelConfig.width, labelConfig.height, sheetConfig, officePreviewMode, isBatchPrinting]);

  // Apply dimensions presets
  // Kích thước tem hợp lệ: số từ 10 đến 300 mm (cho phép 1 chữ số thập phân, vd. 38.1)
  const SIZE_HINT = "Nhập kích thước từ 10 đến 300 mm (ví dụ 50 hoặc 38.1).";
  const [sizeError, setSizeError] = useState<string | null>(null);
  const parseSizeMm = (raw: string): number | null => {
    const n = Number(raw.trim().replace(",", "."));
    if (!raw.trim() || !Number.isFinite(n) || n < 10 || n > 300) return null;
    return Math.round(n * 10) / 10;
  };

  const applyPresetDimensions = (w: number, h: number, name: string) => {
    setLabelConfig({ width: w, height: h, name });
    handleSelectObject(null, false, true);
    
    // Bounds check elements during resizing so they never fall outside boundaries
    setObjects(objects.map(obj => {
      let finalX = obj.x;
      let finalY = obj.y;
      
      if (finalX + obj.width > w) {
        finalX = Math.max(0, w - obj.width);
      }
      if (finalY + obj.height > h) {
        finalY = Math.max(0, h - obj.height);
      }
      
      return {
        ...obj,
        x: Math.round(finalX * 10) / 10,
        y: Math.round(finalY * 10) / 10
      };
    }));
  };

  // Add a new element to the workspace, positioned smartly near the center of the active canvas width
  const handleAddObject = (type: ObjectType, customContent?: string) => {
    const timestampId = `${type}-${Date.now()}`;
    let newObject: LabelObject;

    // Approximate size in mm
    let w = 40;
    let h = 7.4; // 11pt font size + 5pt top padding + 5pt bottom padding (~ 7.4mm)
    if (type === "barcode") {
      w = 50;
      h = 19; // 15mm barcode height + 2mm padding top + 2mm padding bottom
    } else if (type === "qrcode") {
      w = 25;
      h = 25;
    } else if (type === "image") {
      w = 30;
      h = 30;
    }

    // Centering positions calculated relative to the label's center (0, 0 position)
    // - For elements with center anchors (barcode, qrcode, image, shapes): x = 0, y = 0
    if (type === "text") {
      newObject = {
        id: timestampId,
        type: "text",
        x: 0,
        y: 0,
        width: w,
        height: h,
        content: customContent || "NỘI DUNG VĂN BẢN MỚI",
        fontSize: 10, // Default font size is 10 pt
        fontWeight: "normal",
        textAlign: "center",
        textFlowOrigin: "center"
      };
    } else if (type === "barcode") {
      newObject = {
        id: timestampId,
        type: "barcode",
        x: 0,
        y: 0,
        width: w,
        height: h,
        content: customContent || "SP-2026-A1",
        barcodeFormat: "CODE128",
        displayValue: true,
        barcodeWidth: 1.5,
        barcodeHeight: 15,
        textFlowOrigin: "center",
        barcodeFontSize: 6
      };
    } else if (type === "qrcode") {
      newObject = {
        id: timestampId,
        type: "qrcode",
        x: 0,
        y: 0,
        width: w,
        height: h,
        content: customContent || "https://vi.wikipedia.org",
        textFlowOrigin: "center"
      };
    } else if (type === "image") {
      newObject = {
        id: timestampId,
        type: "image",
        x: 0,
        y: 0,
        width: w,
        height: h,
        content: customContent || `data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" fill="none" stroke="%234f46e5" stroke-dasharray="3 3" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
        imageFit: "contain",
        imageOpacity: 1,
        textFlowOrigin: "center"
      };
    } else {
      // type === "shape"
      const sType = (customContent as any) || "rect";
      let shapeW = 30;
      let shapeH = 15;
      if (sType === "line") {
        shapeW = 30;
        shapeH = 2; // thin box for line
      } else if (sType === "circle") {
        shapeW = 15;
        shapeH = 15;
      } else if (sType === "oval") {
        shapeW = 25;
        shapeH = 15;
      }

      newObject = {
        id: timestampId,
        type: "shape",
        x: 0,
        y: 0,
        width: shapeW,
        height: shapeH,
        content: sType === "line" ? "Đường kẻ" : sType === "rect" ? "Hình chữ nhật" : sType === "circle" ? "Hình tròn" : "Hình oval",
        shapeType: sType,
        shapeStrokeWidth: sType === "line" ? 0.8 : 0.8,
        shapeStrokeColor: "#000000",
        shapeFillColor: "transparent",
        shapeCornerRadius: sType === "rect" ? 1.5 : 0,
        shapeStrokeStyle: "solid",
        textFlowOrigin: "center"
      };
    }

    // Chỉ văn bản dùng điểm neo (đã đặt ở tâm). Mã vạch, QR, ảnh, hình khối neo ở góc trên-trái,
    // nên phải lùi nửa kích thước để đối tượng mới nằm CHÍNH GIỮA tem thay vì tràn ra phải/dưới.
    if (newObject.type !== "text") {
      newObject = {
        ...newObject,
        x: Math.round((-newObject.width / 2) * 10) / 10,
        y: Math.round((-newObject.height / 2) * 10) / 10,
        textFlowOrigin: "top-left"
      };
    }

    setObjectsWithHistory([...objects, newObject]);
    handleSelectObject(timestampId);
  };

  // Handle single object attribute updates in Properties Panel with batch propagation
  const handleUpdateObject = (updated: LabelObject) => {
    const original = objects.find((obj) => obj.id === updated.id);
    if (!original) {
      setObjectsWithHistory(objects.map((obj) => (obj.id === updated.id ? updated : obj)));
      return;
    }

    // Detect keys that changed
    const changedKeys: any = {};
    (Object.keys(updated) as Array<keyof LabelObject>).forEach((key) => {
      if (updated[key] !== original[key]) {
        changedKeys[key] = updated[key];
      }
    });

    // Keys deleted
    const deletedKeys: string[] = [];
    Object.keys(original).forEach((key) => {
      if (!(key in updated)) {
        deletedKeys.push(key);
      }
    });

    // Exclude position/coordinate attributes from bulk updates
    const excludedKeys = ["id", "x", "y"];
    excludedKeys.forEach((k) => {
      delete (changedKeys as any)[k];
    });

    if (selectedIds.length > 1 && selectedIds.includes(updated.id)) {
      setObjectsWithHistory(
        objects.map((obj) => {
          if (selectedIds.includes(obj.id)) {
            // Apply modifications
            const copy = { ...obj, ...changedKeys };
            deletedKeys.forEach((k) => {
              if (!excludedKeys.includes(k)) {
                delete (copy as any)[k];
              }
            });
            return copy;
          }
          return obj;
        })
      );
    } else {
      setObjectsWithHistory(objects.map((obj) => (obj.id === updated.id ? updated : obj)));
    }
  };

  // Drag and update coordinates
  const handleUpdateCoordinates = (id: string, x: number, y: number) => {
    setObjectsWithHistory(
      objects.map((obj) => (obj.id === id ? { ...obj, x, y } : obj))
    );
  };

  // Batch update coordinate positions (for multi-dragging)
  const handleUpdateMultipleObjectsCoordinates = (coordsList: Array<{ id: string; x: number; y: number }>) => {
    const coordsMap = new Map(coordsList.map((c) => [c.id, c]));
    setObjectsWithHistory(
      objects.map((obj) => {
        const match = coordsMap.get(obj.id);
        return match ? { ...obj, x: match.x, y: match.y } : obj;
      })
    );
  };

  // Update both position and dimensions (for resizing)
  const handleUpdateGeometry = (id: string, x: number, y: number, width: number, height: number) => {
    setObjectsWithHistory(
      objects.map((obj) => (obj.id === id ? { ...obj, x, y, width, height } : obj))
    );
  };

  // Delete specific object or multiple selected objects
  const handleDeleteObject = (id: string) => {
    const listToDelete = selectedIds.length > 1 && selectedIds.includes(id) ? selectedIds : [id];
    setObjectsWithHistory(objects.filter((obj) => !listToDelete.includes(obj.id)));
    if (listToDelete.includes(selectedId)) {
      setSelectedId(null);
    }
    setSelectedIds((prev) => prev.filter((prevId) => !listToDelete.includes(prevId)));
  };

  // Clear everything (Start from blank, blank label canvas)
  const handleClearCanvas = () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa tất cả các phần tử trên nhãn này?")) {
      setObjectsWithHistory([]);
      handleSelectObject(null);
      clearCanvasMemory();
    }
  };

  // Khôi phục về thiết kế mẫu mặc định ban đầu
  const handleResetToDefault = () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ thiết kế hiện tại và khôi phục về thiết kế mẫu mặc định của hệ thống?")) {
      setLabelConfig({
        width: 65,
        height: 45,
        name: "Tem Kệ Siêu Thị Mặc Định"
      });
      setObjectsWithHistory([
        {
          id: "init-text-1",
          type: "text",
          x: 0,
          y: -16.0,
          width: 59,
          height: 5,
          content: "CỬA HÀNG ĐIỆN TỬ VIỆT NAM",
          fontSize: 9,
          fontWeight: "bold",
          textFlowOrigin: "center",
          textAlign: "center"
        },
        {
          id: "init-barcode-1",
          type: "barcode",
          x: -29.5,
          y: -11.5,
          width: 38,
          height: 18,
          content: "VND-2026-06",
          barcodeFormat: "CODE128",
          displayValue: true,
          barcodeWidth: 1.4,
          barcodeHeight: 11,
          textFlowOrigin: "center"
        },
        {
          id: "init-text-2",
          type: "text",
          x: 0,
          y: 14.0,
          width: 59,
          height: 5,
          content: "Hotline: 1900 1234 - Địa chỉ: Hà Nội",
          fontSize: 7.5,
          textFlowOrigin: "center",
          textAlign: "center"
        },
        {
          id: "init-qrcode-1",
          type: "qrcode",
          x: 11.5,
          y: -11.5,
          width: 18,
          height: 18,
          content: "https://create-barcode-label.vercel.app/",
          textFlowOrigin: "center"
        }
      ]);
      setSheetConfig({
        mode: 'thermal',
        paperSize: 'A4',
        customWidth: 210,
        customHeight: 297,
        orientation: 'portrait',
        marginTop: 10,
        marginBottom: 10,
        marginLeft: 10,
        marginRight: 10,
        rows: 8,
        cols: 1,
        rowGap: 3,
        colGap: 0,
        showBorder: false,
        borderWidth: 1,
        borderRadius: 2,
        borderColor: '#9ca3af',
        rollSideMargin: 1
      });
      setExcelData([]);
      setExcelColumns([]);
      setExcelFileName("");
      setExcelFileBase64("");
      setExcelFilePath(null);
      setCurrentExcelRowIndex(0);
      handleSelectObject(null);
      clearCanvasMemory();
    }
  };

  // Co giãn và định vị lại tất cả các đối tượng thiết kế nằm vừa vặn với kích thước tem hiện tại
  const handleFitObjectsToLabel = () => {
    if (objects.length === 0) return;

    const centerX = labelConfig.width / 2;
    const centerY = labelConfig.height / 2;

    // 1. Calculate collective boundaries of all items in standard mm space
    let minX = 999999;
    let minY = 999999;
    let maxX = -999999;
    let maxY = -999999;

    objects.forEach((obj) => {
      const absX = centerX + obj.x;
      const absY = centerY + obj.y;
      if (absX < minX) minX = absX;
      if (absY < minY) minY = absY;
      if (absX + obj.width > maxX) maxX = absX + obj.width;
      if (absY + obj.height > maxY) maxY = absY + obj.height;
    });

    const gW = maxX - minX;
    const gH = maxY - minY;

    if (gW <= 0 || gH <= 0) return;

    // 2. Identify the target footprint size of current label configuration
    const targetW = labelConfig.width;
    const targetH = labelConfig.height;

    // Safe margin index (padding) around the label boundary
    const margin = 2; // mm padding from outer limits
    const fitW = targetW - margin * 2;
    const fitH = targetH - margin * 2;

    if (fitW <= 1 || fitH <= 1) return; // safety boundary

    // Unified scaling ratio using uniform scaling factor (maintains exact aspect ratio of whole collage)
    const scale = Math.min(fitW / gW, fitH / gH);

    // Calculate centering displacements within safe margin boundaries
    const newGroupW = gW * scale;
    const newGroupH = gH * scale;
    const newMinX = margin + (fitW - newGroupW) / 2;
    const newMinY = margin + (fitH - newGroupH) / 2;

    // Recompute dimension mapping of every individual item
    const scaledObjects = objects.map((obj) => {
      const absX = centerX + obj.x;
      const absY = centerY + obj.y;
      const relX = absX - minX;
      const relY = absY - minY;

      const newAbsX = parseFloat((newMinX + relX * scale).toFixed(1));
      const newAbsY = parseFloat((newMinY + relY * scale).toFixed(1));
      const newW = parseFloat((obj.width * scale).toFixed(1));
      const newH = parseFloat((obj.height * scale).toFixed(1));

      // Standard new positions converted back to center-relative positions
      const newCentX = parseFloat((newAbsX - centerX).toFixed(1));
      const newCentY = parseFloat((newAbsY - centerY).toFixed(1));

      // Construct scaled object
      const updatedObj: LabelObject = {
        ...obj,
        x: newCentX,
        y: newCentY,
        width: newW,
        height: newH,
      };

      // Proportionately rescale inner font sizes if applicable to keep matching balance
      if (obj.fontSize) {
        updatedObj.fontSize = parseFloat((obj.fontSize * scale).toFixed(1));
      }
      if (obj.barcodeFontSize) {
        updatedObj.barcodeFontSize = parseFloat((obj.barcodeFontSize * scale).toFixed(1));
      }

      return updatedObj;
    });

    setObjectsWithHistory(scaledObjects);
  };

  // Restores both label layout and packed compact spreadsheet rows securely
  const restoreDesignAndExcel = (parsedData: any) => {
    if (parsedData && parsedData.labelConfig && parsedData.objects) {
      setLabelConfig(parsedData.labelConfig);
      
      const converted = migrateObjectsToCenterRelative(
        parsedData.objects,
        parsedData.labelConfig.width,
        parsedData.labelConfig.height
      );
      setObjects(converted);

      if (parsedData.sheetConfig) {
        setSheetConfig(parsedData.sheetConfig);
      }
      
      // Restore linked Excel spreadsheet if exists
      if (parsedData.excelColumns && parsedData.excelColumns.length > 0) {
        const cols = parsedData.excelColumns;
        setExcelColumns(cols);
        
        let restoredData: any[] = [];
        if (parsedData.excelRowsCompact && Array.isArray(parsedData.excelRowsCompact)) {
          restoredData = parsedData.excelRowsCompact.map((rowArr: any[]) => {
            const itemObj: any = {};
            cols.forEach((colName: string, colIdx: number) => {
              itemObj[colName] = rowArr[colIdx] !== undefined ? String(rowArr[colIdx]) : "";
            });
            return itemObj;
          });
        } else if (parsedData.excelData && Array.isArray(parsedData.excelData)) {
          restoredData = parsedData.excelData;
        }
        
        setExcelData(restoredData);
        setExcelFileName(parsedData.excelFileName || "xlsx_linked_file.xlsx");
        setExcelFileBase64(parsedData.excelOriginalBase64 || "");
        setExcelFilePath(parsedData.excelFilePath || null);
        
        if (parsedData.printQuantityMode) {
          setPrintQuantityMode(parsedData.printQuantityMode);
        }
        if (parsedData.printQuantityColumn) {
          setPrintQuantityColumn(parsedData.printQuantityColumn);
        }
        setCurrentExcelRowIndex(0);
        setIsExcelExpanded(true);
      } else {
        setExcelData([]);
        setExcelColumns([]);
        setExcelFileName("");
        setExcelFileBase64("");
      }

      handleSelectObject(null);
      
      let alertMsg = `Đã nạp thành công thiết kế "${parsedData.name || "Mẫu nhập"}" gồm ${parsedData.objects.length} phần tử và toàn bộ cài đặt khổ giấy!`;
      if (parsedData.excelColumns && parsedData.excelColumns.length > 0) {
        const rowCount = parsedData.excelRowsCompact?.length || parsedData.excelData?.length || 0;
        alertMsg += `\n\n[Excel Linked] Đã tự động khôi phục dữ liệu Excel: "${parsedData.excelFileName || "xlsx_linked_file.xlsx"}" (${rowCount} dòng sản phẩm), sẵn sàng in hàng loạt ngay lập tức! Bạn có thể tải lại file này bất kỳ lúc nào để chỉnh sửa/làm mẫu.`;
      }
      alert(alertMsg);
      return true;
    }
    return false;
  };

  // Generates or downloads the original linked Excel sheet
  const handleDownloadExcelTemplate = async () => {
    try {
      // Scenario 1: Original spreadsheet base64 is present
      if (excelFileBase64) {
        const byteCharacters = atob(excelFileBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = excelFileName || "excel_mau_lien_ket.xlsx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      // Scenario 2/3: Fallback rebuilding or default sample file generation
      const exportCols = excelColumns.length > 0 ? excelColumns : ["Mã vạch", "Tên sản phẩm", "Giá bán", "Đơn vị tính", "Số lượng in"];
      let exportRows: any[] = [];
      
      if (excelData.length > 0) {
        exportRows = excelData;
      } else {
        exportRows = [
          {
            "Mã vạch": "VND-2026-06",
            "Tên sản phẩm": "Mẫu Sản Phẩm Điện Tử A",
            "Giá bán": "1500000",
            "Đơn vị tính": "Cái",
            "Số lượng in": "3"
          },
          {
            "Mã vạch": "893000111222",
            "Tên sản phẩm": "Mẫu Sản Phẩm Linh Kiện B",
            "Giá bán": "450000",
            "Đơn vị tính": "Hộp",
            "Số lượng in": "2"
          }
        ];
      }

      // Build spreadsheet workbook safely
      const XLSX = await loadXLSX();
      const ws = XLSX.utils.json_to_sheet(exportRows, { header: exportCols });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = excelFileName || "excel_mau_nhan_tem.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Lỗi khi tải tệp Excel: " + err.message);
    }
  };

  // Save layout template in user local storage
  const handleSaveToLocalStorage = (customName?: string) => {
    const nameToSave = (customName || customSaveName).trim() || `Bản vẽ ${new Date().toLocaleDateString("vi-VN")}`;
    
    // Compress spreadsheet rows using a compact index array rather than repeating column names
    const compactExcelRows = excelData.map((row) => {
      return excelColumns.map((col) => row[col] !== undefined ? row[col] : "");
    });

    const newRecord = {
      name: nameToSave,
      timestamp: new Date().toLocaleTimeString("vi-VN") + " " + new Date().toLocaleDateString("vi-VN"),
      config: labelConfig,
      sheetConfig,
      objects,
      // Lightweight optimized spreadsheet persistence block (no heavy base64 to protect 5MB local quota)
      excelFileName,
      excelFilePath,
      excelColumns,
      excelRowsCompact: compactExcelRows,
      printQuantityMode,
      printQuantityColumn,
    };

    const duplicateFiltered = savedDesigns.filter((d) => d.name !== nameToSave);
    const updated = [newRecord, ...duplicateFiltered].slice(0, 20); // Store up to 20 designs max

    safeLocalStorage.setItem("barcode_designer_saved_v1", JSON.stringify(updated));
    setSavedDesigns(updated);
    setCustomSaveName(nameToSave);
    setCurrentLocalStorageKey(nameToSave);
    setCurrentFilePath(null);
    setSaveLogs(prev => [
      { time: new Date().toLocaleTimeString("vi-VN"), path: `Local Storage: ${nameToSave}`, type: 'save' },
      ...prev
    ]);
    alert(`Đã lưu thiết kế "${nameToSave}" thành công vào bộ nhớ trình duyệt!`);
  };

  // Load previous design from local storage
  const handleLoadSavedDesign = (saved: any) => {
    restoreDesignAndExcel({
      name: saved.name,
      labelConfig: saved.config,
      sheetConfig: saved.sheetConfig,
      objects: saved.objects,
      excelFileName: saved.excelFileName,
      excelFilePath: saved.excelFilePath,
      excelColumns: saved.excelColumns,
      excelRowsCompact: saved.excelRowsCompact,
      excelData: saved.excelData, // Handle legacy format backward compatibility
      printQuantityMode: saved.printQuantityMode,
      printQuantityColumn: saved.printQuantityColumn,
      excelOriginalBase64: "", // Rebuilt on demand dynamically to save quota space
    });
    setCustomSaveName(saved.name);
    setCurrentLocalStorageKey(saved.name);
    setCurrentFilePath(null);
    setActiveFileHandle(null);
    setSaveLogs(prev => [
      { time: new Date().toLocaleTimeString("vi-VN"), path: `Loaded filter: ${saved.name}`, type: 'import' },
      ...prev
    ]);
    setShowSavedList(false);
  };

  // Tên tệp an toàn: bỏ dấu tiếng Việt thay vì biến mỗi chữ có dấu thành "_"
  const toSafeFileName = (name: string): string =>
    (name || "thiet_ke_tem")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9_\-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "thiet_ke_tem";

  // Export current design to a lightweight offline file (.kvl or .json)
  const handleExportToFile = (customName?: string, format: 'kvl' | 'json' = 'kvl', onSuccess?: () => void) => {
    const nameToSave = (customName || customSaveName).trim() || labelConfig.name || "tem_thiet_ke";
    
    // Strip redundant object names/keys to minimize plaintext weight dynamically matching spreadsheet rows
    // This reduces file size structure by compressing excelData using index arrays instead of repeating JSON keys.
    const compactExcelRows = excelData.map((row) => {
      return excelColumns.map((col) => row[col] !== undefined ? row[col] : "");
    });

    const exportData: any = {
      version: "2.5", // Upgraded version for complete nested excel linkage
      name: nameToSave,
      timestamp: new Date().toLocaleTimeString("vi-VN") + " " + new Date().toLocaleDateString("vi-VN"),
      labelConfig,
      sheetConfig,
      objects,
      // Lightweight, hyper-optimized spreadsheet persistence blocks 
      excelFileName,
      excelFilePath,
      excelColumns,
      excelRowsCompact: compactExcelRows,
      excelOriginalBase64: excelFileBase64 || "", // High-fidelity original binary excel fallback backing
      printQuantityMode,
      printQuantityColumn,
    };

    const triggerBlobDownload = (
      content: string, 
      fname: string, 
      mtype: string, 
      savedName: string, 
      callback?: () => void
    ) => {
      try {
        const blob = new Blob([content], { type: mtype });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fname;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setCurrentFilePath(fname);
        setCurrentLocalStorageKey(null);
        setCustomSaveName(savedName);
        setSaveLogs(prev => [
          { time: new Date().toLocaleTimeString("vi-VN"), path: `Browser Download: ${fname}`, type: 'save' },
          ...prev
        ]);
        callback?.();
      } catch (err: any) {
        alert("Lỗi kết xuất file tải xuống: " + err.message);
      }
    };

    try {
      const jsonStr = JSON.stringify(exportData);
      let fileContent = jsonStr;
      let filename = `${toSafeFileName(nameToSave)}.json`;
      let mimeType = "application/json;charset=utf-8";

      if (format === 'kvl') {
        fileContent = btoa(unescape(encodeURIComponent(jsonStr)));
        filename = `${toSafeFileName(nameToSave)}.kvl`;
        mimeType = "text/plain;charset=utf-8";
      }
      
      // Check if running in Python pywebview desktop container to prompt native saving
      // @ts-ignore
      if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file_native) {
        // @ts-ignore
        window.pywebview.api.save_file_native(filename, fileContent)
          .then((result: any) => {
            let success = false;
            let pathSaved: string | null = null;
            let filenameSaved: string | null = null;

            if (result === "success" || result === true) {
              success = true;
            } else if (result && typeof result === "object") {
              if (result.status === "success") {
                success = true;
                pathSaved = result.file_path || null;
                filenameSaved = result.filename || null;
              } else if (result.status === "error") {
                alert(`Lỗi lưu tệp tin thông qua ứng dụng offline: ${result.message}`);
                return;
              }
            }

            if (success) {
              if (pathSaved) {
                setCurrentFilePath(pathSaved);
                setCurrentLocalStorageKey(null);
                if (filenameSaved) {
                  setCustomSaveName(filenameSaved.replace(/\.(kvl|json)$/i, ""));
                }
                setSaveLogs(prev => [
                  { time: new Date().toLocaleTimeString("vi-VN"), path: pathSaved!, type: 'save' },
                  ...prev
                ]);
              }
              alert(`Đã lưu thành công tệp tin thiết kế (.kvl) vào máy tính của bạn!`);
              onSuccess?.();
            }
          })
          .catch((err: any) => {
            alert("Lỗi gọi API lưu tệp tin Python: " + err.message);
          });
        return;
      }
      
      // If running in browser and supports showSaveFilePicker, use it to get a real local file handle!
      // @ts-ignore
      else if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        // @ts-ignore
        const opts = {
          suggestedName: filename,
          types: [{
            description: format === 'kvl' ? 'Bộ mẫu KVL (*.kvl)' : 'Tệp cấu hình JSON (*.json)',
            accept: format === 'kvl' ? { 'text/plain': ['.kvl'] } : { 'application/json': ['.json'] }
          }]
        };
        
        let pickerPromise;
        try {
          // @ts-ignore
          pickerPromise = window.showSaveFilePicker(opts);
        } catch (syncErr: any) {
          console.warn("Synchronous error calling showSaveFilePicker, falling back to standard download:", syncErr);
          triggerBlobDownload(fileContent, filename, mimeType, nameToSave, onSuccess);
          return;
        }

        pickerPromise
          .then(async (handle: any) => {
            const writable = await handle.createWritable();
            await writable.write(fileContent);
            await writable.close();
            
            setActiveFileHandle(handle);
            setCurrentFilePath(handle.name);
            setCurrentLocalStorageKey(null);
            setCustomSaveName(handle.name.replace(/\.(kvl|json)$/i, ""));
            setSaveLogs(prev => [
              { time: new Date().toLocaleTimeString("vi-VN"), path: handle.name, type: 'save' },
              ...prev
            ]);
            alert(`Đã lưu thành công tệp thiết kế "${handle.name}" vào máy tính của bạn! Từ bây giờ bạn có thể sửa và bấm Ctrl + S để tự động cập nhật trực tiếp không cần chọn đường dẫn.`);
            onSuccess?.();
          })
          .catch((err: any) => {
            if (err.name === 'AbortError') {
              // User deliberate cancellation, let modal stay open so they can click Save again
              return;
            }
            console.warn("showSaveFilePicker promise rejected, falling back to standard download:", err);
            triggerBlobDownload(fileContent, filename, mimeType, nameToSave, onSuccess);
          });
        return;
      }
      
      triggerBlobDownload(fileContent, filename, mimeType, nameToSave, onSuccess);
    } catch (err: any) {
      alert("Lỗi khi kết xuất file: " + err.message);
    }
  };

  // Quick In-place save for offline mode
  const handleQuickSave = () => {
    // If we have an active file path in PyWebView offline mode, save directly
    // @ts-ignore
    if (currentFilePath && window.pywebview && window.pywebview.api && window.pywebview.api.save_file_direct) {
      const compactExcelRows = excelData.map((row) => {
        return excelColumns.map((col) => row[col] !== undefined ? row[col] : "");
      });

      const exportData: any = {
        version: "2.5",
        name: customSaveName || labelConfig.name || "tem_thiet_ke",
        timestamp: new Date().toLocaleTimeString("vi-VN") + " " + new Date().toLocaleDateString("vi-VN"),
        labelConfig,
        sheetConfig,
        objects,
        excelFileName,
        excelFilePath,
        excelColumns,
        excelRowsCompact: compactExcelRows,
        excelOriginalBase64: excelFileBase64 || "",
        printQuantityMode,
        printQuantityColumn,
      };

      try {
        const jsonStr = JSON.stringify(exportData);
        let fileContent = jsonStr;
        if (currentFilePath.endsWith('.kvl')) {
          fileContent = btoa(unescape(encodeURIComponent(jsonStr)));
        }

        // @ts-ignore
        window.pywebview.api.save_file_direct(currentFilePath, fileContent)
          .then((result: any) => {
            if (result && result.status === "success") {
              setSaveLogs(prev => [
                { time: new Date().toLocaleTimeString("vi-VN"), path: currentFilePath, type: 'quick-save' },
                ...prev
              ]);
              alert(`Đã tự động lưu đè và cập nhật thành công vào file:\n${result.filename}`);
            } else if (result && result.status === "error") {
              alert(`Lỗi khi lưu đè tệp tin: ${result.message}`);
            } else {
              alert("Lưu tệp tin thất bại!");
            }
          })
          .catch((err: any) => {
            alert("Lỗi kết nối lưu đè trực tiếp Python: " + err.message);
          });
      } catch (err: any) {
        alert("Lỗi mã hóa dữ liệu: " + err.message);
      }
    } 
    // If we have an active file handle in Web File System Access API (Google Chrome / Edge)
    else if (activeFileHandle) {
      const compactExcelRows = excelData.map((row) => {
        return excelColumns.map((col) => row[col] !== undefined ? row[col] : "");
      });

      const exportData: any = {
        version: "2.5",
        name: customSaveName || labelConfig.name || "tem_thiet_ke",
        timestamp: new Date().toLocaleTimeString("vi-VN") + " " + new Date().toLocaleDateString("vi-VN"),
        labelConfig,
        sheetConfig,
        objects,
        excelFileName,
        excelFilePath,
        excelColumns,
        excelRowsCompact: compactExcelRows,
        excelOriginalBase64: excelFileBase64 || "",
        printQuantityMode,
        printQuantityColumn,
      };

      try {
        const jsonStr = JSON.stringify(exportData);
        let fileContent = jsonStr;
        if (activeFileHandle.name.endsWith('.kvl')) {
          fileContent = btoa(unescape(encodeURIComponent(jsonStr)));
        }

        activeFileHandle.createWritable()
          .then(async (writable: any) => {
            await writable.write(fileContent);
            await writable.close();
            setSaveLogs(prev => [
              { time: new Date().toLocaleTimeString("vi-VN"), path: activeFileHandle.name, type: 'quick-save' },
              ...prev
            ]);
            alert(`Đã tự động lưu đè và cập nhật trực tiếp thành công vào file:\n"${activeFileHandle.name}"`);
          })
          .catch((err: any) => {
            alert("Lỗi khi ghi đè trực tiếp lên tệp: " + err.message);
          });
      } catch (err: any) {
        alert("Lỗi mã hóa dữ liệu: " + err.message);
      }
    }
    // If we have an active file in browser (currentFilePath is set but window.pywebview is not available), let's save directly by downloading!
    // @ts-ignore
    else if (currentFilePath && (!window.pywebview || !window.pywebview.api)) {
      handleExportToFile(customSaveName || labelConfig.name || "tem_thiet_ke", currentFilePath.endsWith('.json') ? 'json' : 'kvl');
    }
    // If we have a connected browser local storage design template, save directly to local storage
    else if (currentLocalStorageKey) {
      const compactExcelRows = excelData.map((row) => {
        return excelColumns.map((col) => row[col] !== undefined ? row[col] : "");
      });

      const newRecord = {
        name: currentLocalStorageKey,
        timestamp: new Date().toLocaleTimeString("vi-VN") + " " + new Date().toLocaleDateString("vi-VN"),
        config: labelConfig,
        sheetConfig,
        objects,
        excelFileName,
        excelColumns,
        excelRowsCompact: compactExcelRows,
        printQuantityMode,
        printQuantityColumn,
      };

      const duplicateFiltered = savedDesigns.filter((d) => d.name !== currentLocalStorageKey);
      const updated = [newRecord, ...duplicateFiltered].slice(0, 20);

      safeLocalStorage.setItem("barcode_designer_saved_v1", JSON.stringify(updated));
      setSavedDesigns(updated);
      setCustomSaveName(currentLocalStorageKey);
      setSaveLogs(prev => [
        { time: new Date().toLocaleTimeString("vi-VN"), path: `Local Storage: ${currentLocalStorageKey}`, type: 'quick-save' },
        ...prev
      ]);
      alert(`Đã tự động lưu đè và cập nhật trực tiếp thành công vào Bộ nhớ duyệt web:\n"${currentLocalStorageKey}"`);
    }
    // Standard unlinked state -> Open Save Dialog (Save As)
    else {
      // Prompt standard Save Dialog
      setSaveTemplateName(customSaveName || labelConfig.name || "");
      setSaveLocation(null);
      setShowSaveDialog(true);
    }
  };

  // Open native system file selector in PyWebView
  const triggerImportFile = () => {
    // @ts-ignore
    if (window.pywebview && window.pywebview.api && window.pywebview.api.load_file_native) {
      // @ts-ignore
      window.pywebview.api.load_file_native()
        .then((response: any) => {
          if (response && (response.status === "success" || response.status === "warning_locked") && response.content) {
            try {
              if (response.status === "warning_locked") {
                const confirmOpen = window.confirm(response.message);
                if (!confirmOpen) {
                  return;
                } else {
                  // User chose to "open anyway". Let's lock it explicitly under our session
                  // @ts-ignore
                  if (window.pywebview && window.pywebview.api && window.pywebview.api.create_lock_direct) {
                    // @ts-ignore
                    window.pywebview.api.create_lock_direct(response.file_path);
                  }
                }
              }

              let parsedData: any = null;
              try {
                parsedData = JSON.parse(response.content);
              } catch (jsonErr) {
                const decodedStr = decodeURIComponent(escape(atob(response.content.trim())));
                parsedData = JSON.parse(decodedStr);
              }
              
              const restored = restoreDesignAndExcel(parsedData);
              if (restored) {
                setCurrentFilePath(response.file_path);
                setCurrentLocalStorageKey(null);
                setActiveFileHandle(null);
                setCustomSaveName(response.filename.replace(/\.(kvl|json)$/i, ""));
                setSaveLogs(prev => [
                  { time: new Date().toLocaleTimeString("vi-VN"), path: response.file_path, type: 'import' },
                  ...prev
                ]);
              } else {
                alert("Nội dung tệp thiếu thông số cấu trúc (labelConfig/objects).");
              }
            } catch (err: any) {
              alert("Lỗi phân tích tệp KVL/JSON: " + err.message);
            }
          } else if (response && response.status === "error") {
            alert("Lỗi mở tệp tin: " + response.message);
          }
        })
        .catch((err: any) => {
          alert("Lỗi nạp tệp qua Python: " + err.message);
        });
    } else if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      // @ts-ignore
      window.showOpenFilePicker({
        types: [
          {
            description: 'Bộ mẫu KVL hoặc JSON (*.kvl, *.json)',
            accept: {
              'application/json': ['.json', '.kvl'],
              'text/plain': ['.kvl']
            }
          }
        ],
        multiple: false
      })
      .then(async ([handle]: any) => {
        try {
          const file = await handle.getFile();
          const rawContent = await file.text();
          let parsedData: any = null;

          try {
            parsedData = JSON.parse(rawContent);
          } catch (jsonErr) {
            try {
              const decodedStr = decodeURIComponent(escape(atob(rawContent.trim())));
              parsedData = JSON.parse(decodedStr);
            } catch (b64Err) {
              throw new Error("Định dạng file không hợp lệ. Vui lòng nạp file .kvl hoặc .json chính xác.");
            }
          }

          const restored = restoreDesignAndExcel(parsedData);
          if (restored) {
            setCustomSaveName(file.name.replace(/\.(kvl|json)$/i, ""));
            setCurrentFilePath(file.name);
            setCurrentLocalStorageKey(null);
            setActiveFileHandle(handle);
            setSaveLogs(prev => [
              { time: new Date().toLocaleTimeString("vi-VN"), path: file.name, type: 'import' },
              ...prev
            ]);
            alert(`Đã liên kết tệp "${file.name}" thành công! Từ bây giờ bạn có thể sửa và bấm Ctrl + S để tự động cập nhật trực tiếp lên tệp.`);
          } else {
            alert("Nội dung tệp thiếu các thông số cấu trúc (labelConfig/objects). Vui lòng kiểm tra lại.");
          }
        } catch (err: any) {
          alert("Lỗi khi đọc tệp tin: " + err.message);
        }
      })
      .catch((err: any) => {
        if (err.name !== 'AbortError') {
          document.getElementById("file-import-input")?.click();
        }
      });
    } else {
      document.getElementById("file-import-input")?.click();
    }
  };

  // Import design from file (.kvl or .json)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawContent = (event.target?.result as string) || "";
        let parsedData: any = null;

        // 1. Try parsing as Standard JSON text first (highly robust)
        try {
          parsedData = JSON.parse(rawContent);
        } catch (jsonErr) {
          // 2. If it is Base64 encoded, decode it
          try {
            const decodedStr = decodeURIComponent(escape(atob(rawContent.trim())));
            parsedData = JSON.parse(decodedStr);
          } catch (b64Err) {
            throw new Error("Định dạng file không hợp lệ. Vui lòng nạp file .kvl hoặc .json chính xác.");
          }
        }

        const restored = restoreDesignAndExcel(parsedData);
        if (restored) {
          setCustomSaveName(file.name.replace(/\.(kvl|json)$/i, ""));
          setCurrentFilePath(file.name);
          setCurrentLocalStorageKey(null);
          setActiveFileHandle(null);
        } else {
          alert("Nội dung tệp thiếu các thông số cấu trúc (labelConfig/objects). Vui lòng kiểm tra lại.");
        }
      } catch (err: any) {
        alert("Không thể đọc tệp này: " + err.message);
      }
      
      // Reset the file input value so same file can be selected again
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  // Delete saved design from database
  const handleDeleteSavedDesign = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (window.confirm("Bạn muốn xóa mẫu thiết kế đã lưu này?")) {
      const updated = savedDesigns.filter((_, idx) => idx !== index);
      safeLocalStorage.setItem("barcode_designer_saved_v1", JSON.stringify(updated));
      setSavedDesigns(updated);
    }
  };

  const migrateObjectsToCenterRelative = (objs: LabelObject[], labelW: number, labelH: number): LabelObject[] => {
    return objs.map(obj => {
      const alreadyCenterRelative = (obj as any).isCenterRelative;
      const centerX = labelW / 2;
      const centerY = labelH / 2;
      
      let updatedX = obj.x;
      let updatedY = obj.y;
      if (!alreadyCenterRelative) {
        updatedX = Math.round((obj.x - centerX) * 10) / 10;
        updatedY = Math.round((obj.y - centerY) * 10) / 10;
      }
      
      return {
        ...obj,
        x: updatedX,
        y: updatedY,
        isCenterRelative: true,
        textFlowOrigin: obj.textFlowOrigin || "center",
        textAlign: obj.type === "text" ? (obj.textAlign || "center") : obj.textAlign
      };
    });
  };

  // Load preset template
  const handleSelectTemplate = (
    config: LabelConfig, 
    templateObjects: LabelObject[],
    templateSheetConfig?: Partial<SheetLayoutConfig>
  ) => {
    setLabelConfig(config);
    const converted = migrateObjectsToCenterRelative(templateObjects, config.width, config.height);
    setObjects(converted);
    if (templateSheetConfig) {
      setSheetConfig((prev) => ({
        ...prev,
        ...templateSheetConfig,
      }));
    }
    handleSelectObject(null);
    setCurrentFilePath(null);
    setCurrentLocalStorageKey(null);
    setActiveFileHandle(null);
    setShowPresetDropdown(false);
    setIsPresetDropdownPinned(false);
  };
  
  // Load popular Tomy template with custom centered margins calculation
  const handleSelectTomyTemplate = (item: TomyTemplate) => {
    applyPresetDimensions(item.width, item.height, item.name);
    
    // Khi chọn mẫu Tomy, mặc định dọn sạch toàn bộ đối tượng để tạo tem trống không có dữ liệu mẫu
    setObjects([]);
    setSelectedId(null);
    setSelectedIds([]);
    
    setSheetConfig((prev) => ({
      ...prev,
      mode: 'office',
      paperSize: item.paperSize,
      orientation: item.orientation,
      cols: item.cols,
      rows: item.rows,
      colGap: item.colGap,
      rowGap: item.rowGap,
      marginLeft: item.marginLeft,
      marginRight: item.marginRight,
      marginTop: item.marginTop,
      marginBottom: item.marginBottom,
    }));
    
    setIsTomyDropdownOpen(false);
  };

  // Synchronise global hotkey intercept for Ctrl+P, Ctrl+S, Ctrl+O, etc.
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Bắt phím mở DevTools (F12 hoặc Ctrl+Shift+I) cho ứng dụng Desktop chạy Offline
      if (
        e.key === "F12" || 
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "i")
      ) {
        const pw = (window as any).pywebview;
        if (pw && pw.api && typeof pw.api.show_devtools === "function") {
          e.preventDefault();
          pw.api.show_devtools();
          return;
        }
      }

      const activeEl = document.activeElement;
      const isEditingInput = activeEl && (
        activeEl.tagName === "INPUT" || 
        activeEl.tagName === "TEXTAREA" || 
        activeEl.tagName === "SELECT"
      );

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        printActionRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleQuickSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        triggerImportFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (!isEditingInput) {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        if (!isEditingInput) {
          e.preventDefault();
          handleRedo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (!isEditingInput) {
          e.preventDefault();
          handleCopy();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
        if (!isEditingInput && selectedIds.length > 0) {
          e.preventDefault();
          handleScaleSelectedObjects(1.05);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        if (!isEditingInput && selectedIds.length > 0) {
          e.preventDefault();
          handleScaleSelectedObjects(0.95);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        if (!isEditingInput && selectedIds.length > 0) {
          e.preventDefault();
          handleToggleTextFormat("bold");
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
        if (!isEditingInput && selectedIds.length > 0) {
          e.preventDefault();
          handleToggleTextFormat("italic");
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
        if (!isEditingInput && selectedIds.length > 0) {
          e.preventDefault();
          handleToggleTextFormat("underline");
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (!isEditingInput && selectedIds.length > 0) {
          e.preventDefault();
          handleToggleTextFormat("lineThrough");
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        // Ctrl+D: nhân đôi (chặn phím tắt "thêm dấu trang" của trình duyệt)
        if (!isEditingInput) {
          e.preventDefault();
          handleDuplicateObjects();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        if (!isEditingInput) {
          e.preventDefault();
          handleSelectAllObjects();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.code === "BracketRight" || e.code === "BracketLeft")) {
        // Ctrl+] / Ctrl+[: lên/xuống một lớp. Thêm Shift: lên trên cùng / xuống dưới cùng
        if (!isEditingInput && arrangeIds.length > 0) {
          e.preventDefault();
          const up = e.code === "BracketRight";
          handleReorderObjects(e.shiftKey ? (up ? "front" : "back") : up ? "forward" : "backward");
        }
      }
    };

    // Global wheel listener for Ctrl + Scroll mouse wheel resize selected objects
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey && selectedIds.length > 0) {
        // Prevent browser viewport from zoom-in and zoom-out
        e.preventDefault();
        const isEnlarge = e.deltaY < 0; // scrolling up (deltaY < 0) means larger
        const factor = isEnlarge ? 1.05 : 0.95;
        handleScaleSelectedObjects(factor);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    // Use { passive: false } to allow e.preventDefault() in Chrome & other browsers for wheel event
    window.addEventListener("wheel", handleGlobalWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("wheel", handleGlobalWheel);
    };
  }, [
    objects,
    labelConfig,
    sheetConfig,
    excelFileName,
    excelColumns,
    excelData,
    excelFileBase64,
    printQuantityMode,
    printQuantityColumn,
    selectedId,
    selectedIds,
    customSaveName,
    currentFilePath,
    currentLocalStorageKey,
    savedDesigns,
    handleUndo,
    handleRedo,
    handleCopy,
    handlePaste,
    handleScaleSelectedObjects,
    handleToggleTextFormat,
    handleDuplicateObjects,
    handleSelectAllObjects,
    handleReorderObjects,
    arrangeIds,
    clipboard
  ]);

  // Xuất toàn bộ lô tem thành một tệp lệnh máy in (ZPL/TSPL). Dòng Excel liên tiếp giống nhau được gom
  // thành một lệnh có số bản (^PQ / PRINT n) nên tệp gọn và máy in chạy nhanh.
  const buildPrinterCommandJobs = () => {
    const jobs: Array<{ objs: LabelObject[]; copies: number; row: number | null }> = [];
    if (excelData.length > 0) {
      for (const rowIndex of printManifest) {
        const last = jobs[jobs.length - 1];
        if (last && last.row === rowIndex) last.copies += 1;
        else jobs.push({ objs: resolveDynamicObjects(objects, rowIndex), copies: 1, row: rowIndex });
      }
    } else if (objects.length > 0) {
      jobs.push({
        objs: objects,
        copies: printQuantityMode === "constant" ? Math.min(Math.max(1, printCopies), MAX_LABELS) : 1,
        row: null,
      });
    }
    return jobs;
  };

  // Dựng toàn bộ lệnh máy in (ZPL/TSPL) của lô tem hiện tại. Trả về null nếu chưa có nhãn nào.
  const buildPrinterPayload = async (): Promise<{ bytes: Uint8Array; total: number } | null> => {
    const jobs = buildPrinterCommandJobs();
    if (jobs.length === 0) {
      alert("Chưa có nhãn nào để xuất. Hãy thêm đối tượng lên tem (hoặc liên kết file Excel) trước.");
      return null;
    }
    const cfg = { dpi: printerDpi, labelWidthMm: labelConfig.width, labelHeightMm: labelConfig.height, gapMm: tsplGapMm };
    // Hình ảnh, đối tượng xoay và hình nét đứt/chấm được dựng thành ảnh đơn sắc ở độ phân giải máy in (ảnh gốc được lưu đệm nên lô Excel không dựng lại)
    const failedImages = new Set<string>();
    const parts: string[] = [];
    const bgSpec = { image: labelConfig.bgImagePrint === false ? undefined : labelConfig.bgImage, opacity: labelConfig.bgImageOpacity, size: labelConfig.bgImageSize };
    for (const j of jobs) {
      const { bitmaps, failedIds, background } = await prepareObjectBitmaps(j.objs, printerDpi, labelConfig.width, labelConfig.height, bgSpec);
      failedIds.forEach((id) => failedImages.add(id));
      // TSPL: ảnh xuất bằng BITMAP nhị phân (gọn, giữ được ảnh dither); ZPL dùng ^GFA dạng văn bản
      const jobCfg = { ...cfg, bitmaps, background, binaryBitmaps: true };
      parts.push(printerLang === "zpl" ? convertToZPL(j.objs, jobCfg, j.copies) : convertToTSPL(j.objs, jobCfg, j.copies));
    }
    const body = parts.join("\n");
    if (failedImages.size > 0) {
      alert(`Có ${failedImages.size} đối tượng không dựng được cho máy in: hình ảnh (kể cả ảnh nền tem) từ địa chỉ web chặn truy cập sẽ bị bỏ qua (hãy tải ảnh lên từ máy tính); đối tượng xoay hoặc nét đứt không dựng được sẽ in ở dạng không xoay/nét liền.`);
    }
    const total = jobs.reduce((sum, j) => sum + j.copies, 0);
    const bytes = printerLang === "tspl" ? tsplToBytes(body) : new TextEncoder().encode(body);
    return { bytes, total };
  };

  // Bản web: tải tệp lệnh về để gửi tới máy in bằng công cụ khác
  const handleExportPrinterCommands = async () => {
    const payload = await buildPrinterPayload();
    if (!payload) return;
    const blob = new Blob([payload.bytes as BlobPart], { type: printerLang === "tspl" ? "application/octet-stream" : "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${toSafeFileName(labelConfig.name)}_${labelConfig.width}x${labelConfig.height}mm_${payload.total}tem_${printerDpi}dpi.${printerLang}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Bản desktop: gửi lệnh ZPL/TSPL thẳng ra máy in đã chọn (không qua PDF). Chọn "Lưu thành PDF" thì xuất tệp PDF như bản web.
  const handleDirectPrint = async () => {
    if (!desktop || isDirectPrinting) return;
    if (effectivePrintTarget === PDF_TARGET) {
      setDirectPrintMsg(null);
      handleSavePrintFile("pdf");
      return;
    }
    if (sheetConfig && sheetConfig.mode === "office") {
      setDirectPrintMsg({ ok: false, text: "Chế độ in giấy văn phòng (A4/A5) chưa in thẳng được: hãy chọn \"Lưu thành PDF\" rồi in tệp PDF. In thẳng dùng cho máy in tem (cuộn tem)." });
      return;
    }
    setIsDirectPrinting(true);
    setDirectPrintMsg(null);
    try {
      const payload = await buildPrinterPayload();
      if (!payload) return;
      const r = await printRawDesktop(effectivePrintTarget, payload.bytes, `${labelConfig.name || "KiotLabel"}_${payload.total}tem`);
      setDirectPrintMsg(r.ok
        ? { ok: true, text: `Đã gửi ${payload.total} tem (${printerLang.toUpperCase()}, ${printerDpi} DPI) tới "${effectivePrintTarget}".` }
        : { ok: false, text: r.error || "Không gửi được lệnh in." });
    } finally {
      setIsDirectPrinting(false);
    }
  };

  // Print execution call triggers standard printer dialog
  const handlePrintLabel = () => {
    // Bản desktop: in thẳng ra máy in đã chọn (hoặc lưu PDF nếu chọn "Lưu thành PDF")
    if (desktop) { void handleDirectPrint(); return; }
    // Bản web: thay cho window.print() hay bị ảnh hưởng bởi zoom/cỡ chữ tối thiểu, xuất PDF rồi mở ra
    handleSavePrintFile('pdf', true);
  };
  printActionRef.current = handlePrintLabel;

  // High-fidelity file exporter for small thermal labels to bypass browser print resolution limits
  // Tổng số tem sẽ in (theo Excel/số bản/đủ một hàng hoặc tờ), dùng chung cho PDF vector và ghép ảnh nền của PDF ảnh
  const getTotalLabelCount = () => {
    const isOffice = !!sheetConfig && sheetConfig.mode === "office";
    const perPage = isOffice ? Math.max(1, (sheetConfig.rows || 1) * (sheetConfig.cols || 1)) : Math.max(1, (sheetConfig && sheetConfig.cols) || 1);
    return totalLabelCount({
      hasExcel: excelData.length > 0,
      manifestLength: printManifest.length,
      excelRows: excelData.length,
      printCopies,
      perPage,
    });
  };

  // Xuất PDF vector. Thành công: trả về true và mở/tải tệp. Thất bại: hỏi dự phòng bằng PDF ảnh (đổi kiểu PDF và thử lại).
  const exportVectorPdf = async (autoOpen: boolean) => {
    setIsSavingFile(true);
    setIsVectorExporting(true);
    if (autoOpen) setIsPreparingPrint(true);
    setSaveFileProgress("Đang dựng PDF vector...");
    handleSelectObject(null);
    let fallbackToRaster = false;
    try {
      const { buildVectorPdf } = await import("./utils/vectorPdf/render");
      const { totalLabelCount } = await import("./utils/vectorPdf/pages");
      const totalItems = getTotalLabelCount();
      const silentZpl = convertToZPL(displayObjects, { dpi: 203, labelWidthMm: labelConfig.width, labelHeightMm: labelConfig.height });
      const silentTspl = convertToTSPL(displayObjects, { dpi: 203, labelWidthMm: labelConfig.width, labelHeightMm: labelConfig.height });
      const result = await buildVectorPdf({
        labelConfig,
        sheetConfig,
        totalItems,
        getObjects: (index) => resolveDynamicObjectsForCell(objects, index),
        templateObjects: displayObjects,
        includeBackground: labelConfig.bgImagePrint !== false,
        title: labelConfig.name || "ThietKe_Tem",
        // Siêu dữ liệu chứa lệnh máy in để chương trình in tem (Print Bridge) đọc ra, như bản PDF ảnh
        subject: `TSPL:${silentTspl}`,
        keywords: `ZPL:${silentZpl}`,
        onProgress: (done, total) => {
          document.querySelectorAll("[data-live-progress]").forEach((el) => { el.textContent = ` (${done}/${total} trang)`; });
        },
      });
      const blob = new Blob([result.bytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      if (lastPdfBlobUrlRef.current) URL.revokeObjectURL(lastPdfBlobUrlRef.current);
      lastPdfBlobUrlRef.current = blobUrl;
      lastPdfStateRef.current = JSON.stringify({ displayObjects, labelConfig, sheetConfig, printCopies, excelData, pdfEngine });
      if (result.warnings.length > 0) alert("Lưu ý khi dựng PDF vector:\n- " + result.warnings.join("\n- "));
      if (autoOpen) {
        setPopupBlobUrl(blobUrl);
        const newWindow = window.open(blobUrl, "_blank");
        setIsPopupBlocked(!newWindow || newWindow.closed || typeof newWindow.closed === "undefined");
        setShowPopupBlockedModal(true);
      } else {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `${labelConfig.name || "ThietKe_Tem"}_${labelConfig.width}x${labelConfig.height}mm.pdf`;
        link.click();
      }
    } catch (err) {
      console.error("Xuất PDF vector lỗi:", err);
      // Tự chuyển sang PDF ảnh (dự phòng) để người dùng vẫn có bản in; thông báo lý do ở console và hộp thoại
      alert("Không dựng được PDF vector (" + String((err as Error)?.message || err) + "). Hệ thống chuyển sang PDF ảnh (dự phòng) cho lần này.");
      fallbackToRaster = true;
    } finally {
      document.querySelectorAll("[data-live-progress]").forEach((el) => { el.textContent = ""; });
      setIsSavingFile(false);
      setIsVectorExporting(false);
      setIsPreparingPrint(false);
      setSaveFileProgress("");
    }
    if (fallbackToRaster) handleSavePrintFile("pdf", autoOpen, true);
  };

  const handleSavePrintFile = (format: 'png' | 'pdf' | 'zpl' | 'tspl', autoOpen = false, forceRaster = false) => {
    if (isSavingFile || isPreparingPrint) return;

    if (format === 'pdf') {
      const currentPrintState = JSON.stringify({
        displayObjects,
        labelConfig,
        sheetConfig,
        printCopies,
        excelData,
        pdfEngine,
      });

      if (lastPdfStateRef.current === currentPrintState && lastPdfBlobUrlRef.current) {
        setPopupBlobUrl(lastPdfBlobUrlRef.current);
        if (autoOpen) {
          const newWindow = window.open(lastPdfBlobUrlRef.current, '_blank');
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            setIsPopupBlocked(true);
          } else {
            setIsPopupBlocked(false);
          }
          setShowPopupBlockedModal(true);
        } else {
          const link = document.createElement('a');
          link.href = lastPdfBlobUrlRef.current;
          link.download = `${labelConfig.name || 'ThietKe_Tem'}_${labelConfig.width}x${labelConfig.height}mm.pdf`;
          link.click();
        }
        return;
      }
    }

    // PDF vector: dựng thẳng từ dữ liệu thiết kế, không chụp màn hình. Lỗi thì tự chuyển sang PDF ảnh (dự phòng) bên dưới.
    if (format === 'pdf' && pdfEngine === 'vector' && !forceRaster) {
      void exportVectorPdf(autoOpen);
      return;
    }

    // PDF ảnh/PNG chụp từng trang nên giới hạn thấp hơn PDF vector và lệnh máy in
    if ((format === 'pdf' || format === 'png') && getTotalLabelCount() > MAX_LABELS_RASTER) {
      alert(`Lô này có ${getTotalLabelCount().toLocaleString("vi-VN")} tem, vượt giới hạn ${MAX_LABELS_RASTER.toLocaleString("vi-VN")} tem của PDF ảnh/PNG (chụp từng trang, rất chậm). Hãy chọn "Kiểu PDF: Vector" hoặc xuất lệnh máy in, hoặc chia lô nhỏ hơn.`);
      return;
    }
    // Trên điện thoại khung tem có thể đang ẩn: phải hiện ra thì mới chụp được.
    setMobilePane("canvas");
    const originalZoom = interfaceZoom;
    const originalPreviewMode = officePreviewMode;
    setIsSavingFile(true);
    if (autoOpen) {
      setIsPreparingPrint(true);
    }
    setSaveFileProgress(autoOpen ? "Đang xử lý và chuyển đổi tem sang PDF chất lượng cao..." : "Đang chuẩn bị và đồng bộ hóa chế bản thiết kế...");

    // Deselect currently selected items to clear design-focused helper boxes and sizing outlines
    handleSelectObject(null);

    // If exporting high-fidelity PNG or PDF, temporarily set state zoom to 1.0 
    // to bypass browser bounding box and coordinate calculation bugs.
    // Also temporarily force the view mode to 'sheet' so we export the complete set of printed labels.
    if (format === 'png' || format === 'pdf') {
      setInterfaceZoom(1.0);
      setOfficePreviewMode('sheet');
    }

    // Give a generous 1000ms timeout for the browser to completely reflow,
    // recalculate page boundaries, and finish rendering all barcodes and text templates beautifully.
    setTimeout(async () => {
      try {
        if (format === 'zpl') {
          setSaveFileProgress("Đang biên dịch mã máy ZPL...");
          const activeObjs = displayObjects;
          const zplPrep = await prepareObjectBitmaps(activeObjs, 203, labelConfig.width, labelConfig.height, { image: labelConfig.bgImagePrint === false ? undefined : labelConfig.bgImage, opacity: labelConfig.bgImageOpacity, size: labelConfig.bgImageSize });
          const zplContent = convertToZPL(activeObjs, {
            dpi: 203, // Máy in nhiệt phổ biến nhất
            labelWidthMm: labelConfig.width,
            labelHeightMm: labelConfig.height,
            bitmaps: zplPrep.bitmaps,
            background: zplPrep.background
          });

          const blob = new Blob([zplContent], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${labelConfig.name || 'ThietKe_Tem'}_${labelConfig.width}x${labelConfig.height}mm.zpl`;
          link.click();
          URL.revokeObjectURL(url);

          setIsSavingFile(false);
          setSaveFileProgress("");
          return;
        }

        if (format === 'tspl') {
          setSaveFileProgress("Đang biên dịch mã máy TSPL...");
          const activeObjs = displayObjects;
          const tsplPrep = await prepareObjectBitmaps(activeObjs, 203, labelConfig.width, labelConfig.height, { image: labelConfig.bgImagePrint === false ? undefined : labelConfig.bgImage, opacity: labelConfig.bgImageOpacity, size: labelConfig.bgImageSize });
          const tsplContent = convertToTSPL(activeObjs, {
            dpi: 203, // Máy in nhiệt phổ biến nhất
            labelWidthMm: labelConfig.width,
            labelHeightMm: labelConfig.height,
            bitmaps: tsplPrep.bitmaps,
            background: tsplPrep.background,
            binaryBitmaps: true
          });

          const blob = new Blob([tsplToBytes(tsplContent)], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${labelConfig.name || 'ThietKe_Tem'}_${labelConfig.width}x${labelConfig.height}mm.ts` + 'pl'; // Ensure clean .tspl extension
          link.click();
          URL.revokeObjectURL(url);

          setIsSavingFile(false);
          setSaveFileProgress("");
          return;
        }

        // For PNG & PDF: Target the active on-screen perfectly rendered elements directly
        setSaveFileProgress("Đang phân tích cấu trúc nhãn thiết kế...");
        
        let totalCount = 0;
        let isSingleCanvas = false;

        const thermalPages = document.querySelectorAll('.batch-print-page');
        const officePages = document.querySelectorAll('.office-print-page');
        totalCount = thermalPages.length > 0 ? thermalPages.length : officePages.length;

        if (totalCount === 0) {
          const canvasEl = document.getElementById('thermal-label-canvas');
          if (canvasEl) {
            totalCount = 1;
            isSingleCanvas = true;
          }
        }

        if (totalCount === 0) {
          alert("Không tìm thấy mẫu thiết kế nhãn để xuất file!");
          if (format === 'png' || format === 'pdf') {
            setInterfaceZoom(originalZoom);
            setOfficePreviewMode(originalPreviewMode);
          }
          setIsSavingFile(false);
          setSaveFileProgress("");
          return;
        }

        const designKey = JSON.stringify({
          displayObjects,
          labelConfig,
          sheetConfig,
          excelData,
          optimizeThermalBinarization,
          pdfDpi,
        });

        if (designKey !== cacheDesignKeyRef.current) {
          if (cachedCanvasesRef.current) {
            cachedCanvasesRef.current.forEach((canvas) => {
              if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
              }
            });
          }
          if (cachedCanvasesByContentKeyRef.current) {
            Object.values(cachedCanvasesByContentKeyRef.current).forEach((canvas) => {
              if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
              }
            });
          }
          cachedCanvasesRef.current = [];
          cachedCanvasesByContentKeyRef.current = {};
          cacheDesignKeyRef.current = designKey;
          setCachedPagesCount(0);
        }

        const getResolvedObjectsKeyForPage = (pageIdx: number) => {
          const isThermal = !sheetConfig || sheetConfig.mode === 'thermal';
          const cols = Math.max(1, (sheetConfig && sheetConfig.cols) || 1);
          const rows = Math.max(1, (sheetConfig && sheetConfig.rows) || 1);
          const labelsPerPage = isThermal ? cols : (cols * rows);
          
          const startCellIdx = pageIdx * labelsPerPage;
          const endCellIdx = startCellIdx + labelsPerPage;
          
          const pageContents = [];
          for (let c = startCellIdx; c < endCellIdx; c++) {
            const resolved = resolveDynamicObjectsForCell(objects, c);
            const slimResolved = resolved.map(o => ({
              type: o.type,
              x: o.x,
              y: o.y,
              width: o.width,
              height: o.height,
              content: o.content,
              fontSize: o.fontSize,
              fontWeight: o.fontWeight,
              fontStyle: o.fontStyle,
              textDecorationUnderline: o.textDecorationUnderline,
              textDecorationLineThrough: o.textDecorationLineThrough,
              textAlign: o.textAlign,
              color: o.color,
              fontFamily: o.fontFamily,
              barcodeFormat: o.barcodeFormat,
              qrErrorCorrection: o.qrErrorCorrection,
              excelColumn: o.excelColumn,
              shapeType: o.shapeType,
              shapeStrokeWidth: o.shapeStrokeWidth,
              shapeStrokeColor: o.shapeStrokeColor,
              shapeFillColor: o.shapeFillColor,
              shapeCornerRadius: o.shapeCornerRadius,
              shapeStrokeStyle: o.shapeStrokeStyle,
            }));
            pageContents.push(slimResolved);
          }
          return JSON.stringify(pageContents);
        };

        // Ảnh nền + "Tối ưu in nhiệt": ngưỡng hoá biến ảnh nền mờ (ví dụ 30%) thành khối đen che hết tem. Vì vậy chụp KHÔNG có
        // ảnh nền, ngưỡng hoá như thường (chữ, mã vạch giữ nét), rồi ghép ảnh nền đã dither (lớp chấm thưa theo độ mờ) vào
        // các ô tem bằng phép "đen thắng".
        const compositeBg = optimizeThermalBinarization && !!labelConfig.bgImage && labelConfig.bgImagePrint !== false;
        let pageSpecs: PageSpec[] = [];
        if (compositeBg) {
          pageSpecs = isSingleCanvas
            ? [{ widthMm: labelConfig.width, heightMm: labelConfig.height, cells: [{ index: 0, x: 0, y: 0 }] }]
            : buildPages(labelConfig, sheetConfig, getTotalLabelCount());
        }
        const bgBitmapCache = new Map<string, Promise<MonoBitmap | null>>();
        const overlayBackground = async (canvas: HTMLCanvasElement, pageIndex: number) => {
          const spec = pageSpecs[pageIndex];
          if (!spec || !spec.widthMm) return;
          const pxPerMm = canvas.width / spec.widthMm;
          const dpi = pxPerMm * 25.4;
          const key = dpi.toFixed(3);
          let pending = bgBitmapCache.get(key);
          if (!pending) {
            pending = rasterizeBackground(
              { image: labelConfig.bgImage, opacity: labelConfig.bgImageOpacity, size: labelConfig.bgImageSize },
              dpi, labelConfig.width, labelConfig.height
            );
            bgBitmapCache.set(key, pending);
          }
          const bg = await pending;
          const ctx2 = canvas.getContext("2d", { willReadFrequently: true });
          if (!bg || bg.width === 0 || !ctx2) return;
          for (const cell of spec.cells) {
            const x0 = Math.round(cell.x * pxPerMm) + (bg.x ?? 0);
            const y0 = Math.round(cell.y * pxPerMm) + (bg.y ?? 0);
            const cx = Math.max(0, x0), cy = Math.max(0, y0);
            const cw = Math.min(canvas.width, x0 + bg.width) - cx, ch = Math.min(canvas.height, y0 + bg.height) - cy;
            if (cw <= 0 || ch <= 0) continue;
            const img = ctx2.getImageData(cx, cy, cw, ch);
            for (let yy = 0; yy < ch; yy++) {
              for (let xx = 0; xx < cw; xx++) {
                if (bg.data[(cy - y0 + yy) * bg.width + (cx - x0 + xx)]) {
                  const o = (yy * cw + xx) * 4;
                  img.data[o] = 0; img.data[o + 1] = 0; img.data[o + 2] = 0; img.data[o + 3] = 255;
                }
              }
            }
            ctx2.putImageData(img, cx, cy);
          }
        };

        const tempCanvases: (HTMLCanvasElement | null)[] = new Array(totalCount).fill(null);

        try {
          // Chụp từng trang một: html2canvas chạy trên luồng chính nên chạy song song không nhanh hơn,
          // chỉ làm trình duyệt đứng lâu ("Not responding") và chụp trùng nhiều lần cùng một trang
          // trước khi có cache. Nhường luồng giữa các trang để giao diện còn phản hồi.
          const chunkSize = 1;
          // Tiến độ ghi thẳng vào phần tử [data-live-progress] (không qua state của React): mỗi lần
          // setState làm vẽ lại toàn bộ khung tem (hàng trăm trang khi in từ Excel, mỗi lần vài giây).
          const setLiveProgress = (text: string) => {
            document.querySelectorAll('[data-live-progress]').forEach((el) => { el.textContent = text; });
          };
          let lastYieldAt = performance.now();
          for (let i = 0; i < totalCount; i += chunkSize) {
            const chunkEnd = Math.min(i + chunkSize, totalCount);
            if (performance.now() - lastYieldAt > 50 || i === 0) {
              setLiveProgress(` (${chunkEnd}/${totalCount})`);
              // Nhường luồng để giao diện còn phản hồi và hiện được tiến độ
              await new Promise((resolve) => setTimeout(resolve, 0));
              lastYieldAt = performance.now();
            }
            if (i === 0) {
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }

            const chunkPromises = [];
            for (let j = i; j < chunkEnd; j++) {
              chunkPromises.push((async (index) => {
                // Determine if we can reuse a canvas from cache (Duplicate Matching)
                let cachedCanvas: HTMLCanvasElement | null = null;
                const pageContentKey = getResolvedObjectsKeyForPage(index);

                if (cachedCanvasesRef.current[index]) {
                  cachedCanvas = cachedCanvasesRef.current[index];
                } else if (cachedCanvasesByContentKeyRef.current[pageContentKey]) {
                  cachedCanvas = cachedCanvasesByContentKeyRef.current[pageContentKey];
                } else if (!excelData || excelData.length === 0) {
                  const isThermal = !sheetConfig || sheetConfig.mode === 'thermal';
                  if (isThermal) {
                    const cols = Math.max(1, (sheetConfig && sheetConfig.cols) || 1);
                    const totalItems = printCopies || cols;
                    const labelsOnThisRow = Math.min(cols, totalItems - index * cols);
                    if (labelsOnThisRow === cols && cachedCanvasesRef.current[0]) {
                      cachedCanvas = cachedCanvasesRef.current[0];
                    }
                  } else {
                    const cols = Math.max(1, (sheetConfig && sheetConfig.cols) || 1);
                    const rows = Math.max(1, (sheetConfig && sheetConfig.rows) || 1);
                    const labelsPerSheet = cols * rows;
                    const totalItems = printCopies || labelsPerSheet;
                    const labelsOnThisSheet = Math.min(labelsPerSheet, totalItems - index * labelsPerSheet);
                    if (labelsOnThisSheet === labelsPerSheet && cachedCanvasesRef.current[0]) {
                      cachedCanvas = cachedCanvasesRef.current[0];
                    }
                  }
                }

                if (cachedCanvas) {
                  if (!cachedCanvasesRef.current[index]) {
                    cachedCanvasesRef.current[index] = cachedCanvas;
                  }
                  if (!cachedCanvasesByContentKeyRef.current[pageContentKey]) {
                    cachedCanvasesByContentKeyRef.current[pageContentKey] = cachedCanvas;
                  }
                  return { index, canvas: cachedCanvas };
                }

                let currentEl: HTMLElement | null = null;
                if (!isSingleCanvas) {
                  const thermalPages = document.querySelectorAll('.batch-print-page');
                  const officePages = document.querySelectorAll('.office-print-page');
                  if (thermalPages.length > 0) {
                    currentEl = thermalPages[index] as HTMLElement;
                  } else if (officePages.length > 0) {
                    currentEl = officePages[index] as HTMLElement;
                  }
                } else {
                  currentEl = document.getElementById('thermal-label-canvas');
                }

                if (!currentEl || !document.body.contains(currentEl)) {
                  console.warn(`Element at index ${index} was unmounted or missing during render loop.`);
                  return { index, canvas: null };
                }

                // Get exact dimensions to restrict html2canvas rendering bounds.
                // This prevents html2canvas from scanning and rendering the whole page viewport,
                // which is extremely heavy and memory-intensive!
                const rect = currentEl.getBoundingClientRect();
                const width = rect.width || currentEl.offsetWidth || 1;
                const height = rect.height || currentEl.offsetHeight || 1;

                // Use html2canvas at 3.0 scale (equivalent to 900 DPI high-definition)
                // to eliminate pixelation ("vỡ nét"), ensuring smooth text and crisp curves
                // on retina/high-DPI screens and ultra-sharp thermal print quality.
                const html2canvas = await loadHtml2canvas();
                const canvas = await html2canvas(currentEl, {
                  scale: pdfDpi / 96, 
                  useCORS: true,
                  allowTaint: true,
                  backgroundColor: labelConfig.bgColor || "#ffffff",
                  logging: false,
                  width: width,
                  height: height,
                  scrollX: 0,
                  scrollY: 0,
                  x: 0,
                  y: 0,
                  // Cảnh báo chỉ để xem trên màn hình, không được in ra giấy/PDF
                  // Bỏ qua các trang khác khi sao chép DOM: html2canvas sao chép CẢ tài liệu cho mỗi lần chụp,
                  // nên với hàng trăm trang (in từ Excel) mỗi lần chụp tốn thời gian tỉ lệ với tổng số trang.
                  ignoreElements: (el: Element) =>
                    el.getAttribute?.("data-no-print") === "true" ||
                    (compositeBg && el.getAttribute?.("data-bg-overlay") === "true") ||
                    (el !== currentEl &&
                      (el.classList?.contains("batch-print-page") || el.classList?.contains("office-print-page"))),
                });

                if (optimizeThermalBinarization) {
                  binarizeCanvas(canvas);
                  if (compositeBg) await overlayBackground(canvas, index);
                }

                cachedCanvasesRef.current[index] = canvas;
                cachedCanvasesByContentKeyRef.current[pageContentKey] = canvas;
                return { index, canvas };
              })(j));
            }

            const results = await Promise.all(chunkPromises);
            for (const res of results) {
              if (res.canvas) {
                tempCanvases[res.index] = res.canvas;
                if (!cachedCanvasesRef.current[res.index]) {
                  cachedCanvasesRef.current[res.index] = res.canvas;
                }
              }
            }
          }
        } finally {
          document.querySelectorAll('[data-live-progress]').forEach((el) => { el.textContent = ''; });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }

        const canvases = tempCanvases.filter((c): c is HTMLCanvasElement => c !== null);

        setSaveFileProgress("Đang xuất tệp tin...");

        const activeObjs = displayObjects;
        const silentZpl = convertToZPL(activeObjs, {
          dpi: 203,
          labelWidthMm: labelConfig.width,
          labelHeightMm: labelConfig.height
        });
        const silentTspl = convertToTSPL(activeObjs, {
          dpi: 203,
          labelWidthMm: labelConfig.width,
          labelHeightMm: labelConfig.height
        });

        if (format === 'pdf') {
          let pdfW = labelConfig.width;
          let pdfH = labelConfig.height;

          if (!isSingleCanvas && sheetConfig) {
            if (sheetConfig.mode === 'office') {
              const isLandscape = sheetConfig.orientation === 'landscape';
              const paperW = sheetConfig.paperSize === 'A4' ? 210 : sheetConfig.paperSize === 'A5' ? 148 : (sheetConfig.customWidth || 210);
              const paperH = sheetConfig.paperSize === 'A4' ? 297 : sheetConfig.paperSize === 'A5' ? 210 : (sheetConfig.customHeight || 297);
              pdfW = isLandscape ? paperH : paperW;
              pdfH = isLandscape ? paperW : paperH;
            } else if (sheetConfig.mode === 'thermal') {
              const cols = Math.max(1, sheetConfig.cols || 1);
              const colGap = sheetConfig.colGap || 0;
              const rollSideMargin = sheetConfig.rollSideMargin !== undefined ? sheetConfig.rollSideMargin : 1;
              pdfW = cols * labelConfig.width + (cols - 1) * colGap + rollSideMargin * 2;
              pdfH = labelConfig.height;
            }
          }

          const orientation = pdfW > pdfH ? 'l' : 'p';
          const JsPDF = await loadJsPdf();
          const pdf = new JsPDF({
            orientation: orientation,
            unit: 'mm',
            format: [pdfW, pdfH]
          });

          // Set metadata properties containing the silent printer language commands
          pdf.setProperties({
            title: labelConfig.name || 'ThietKe_Tem',
            subject: `TSPL:${silentTspl}`,
            keywords: `ZPL:${silentZpl}`,
            creator: 'KiotViet Print Bridge'
          });

          const canvasAliases = new Map<HTMLCanvasElement, string>();
          for (let i = 0; i < canvases.length; i++) {
            if (i > 0) {
              pdf.addPage([pdfW, pdfH], orientation);
            }
            // Embed the canvas directly in jsPDF to completely avoid slow toDataURL string encoding overhead!
            // Cùng một canvas dùng lại nhiều trang: đặt bí danh để jsPDF chỉ mã hoá ảnh một lần.
            let alias = canvasAliases.get(canvases[i]);
            if (!alias) {
              alias = `page_${canvasAliases.size}`;
              canvasAliases.set(canvases[i], alias);
              // Mã hoá một ảnh mới (PNG) tốn cỡ nửa giây: nhường luồng trước mỗi ảnh để giao diện không bị treo
              document.querySelectorAll('[data-live-progress]').forEach((el) => { el.textContent = ` (ghi PDF ${i + 1}/${canvases.length})`; });
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
            pdf.addImage(canvases[i], 'PNG', 0, 0, pdfW, pdfH, alias, 'FAST');
          }
          document.querySelectorAll('[data-live-progress]').forEach((el) => { el.textContent = ''; });

          // Generate PDF blob
          const blob = pdf.output('blob');
          const blobUrl = URL.createObjectURL(blob);

          if (lastPdfBlobUrlRef.current) {
            URL.revokeObjectURL(lastPdfBlobUrlRef.current);
          }

          // Save to cache
          lastPdfBlobUrlRef.current = blobUrl;
          lastPdfStateRef.current = JSON.stringify({
            displayObjects,
            labelConfig,
            sheetConfig,
            printCopies,
            excelData,
            pdfEngine,
          });

          if (autoOpen) {
            try {
              setPopupBlobUrl(blobUrl);
              
              const newWindow = window.open(blobUrl, '_blank');
              if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                setIsPopupBlocked(true);
              } else {
                setIsPopupBlocked(false);
              }
              setShowPopupBlockedModal(true);
            } catch (e) {
              console.error("Auto-open PDF failed:", e);
              // Fallback to traditional download if something unexpected happens
              const link = document.createElement('a');
              link.href = blobUrl;
              link.download = `${labelConfig.name || 'ThietKe_Tem'}_${labelConfig.width}x${labelConfig.height}mm.pdf`;
              link.click();
            }
          } else {
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `${labelConfig.name || 'ThietKe_Tem'}_${labelConfig.width}x${labelConfig.height}mm.pdf`;
            link.click();
          }
        }

        if (format === 'png' || format === 'pdf') {
          setInterfaceZoom(originalZoom);
          setOfficePreviewMode(originalPreviewMode);
        }
        setIsSavingFile(false);
        setIsPreparingPrint(false);
        setSaveFileProgress("");
        
        // Auto-release heavy canvases to free RAM/GPU memory immediately
        if (autoReleaseRam) {
          clearCanvasMemory();
        } else {
          setCachedPagesCount(Object.keys(cachedCanvasesByContentKeyRef.current || {}).length);
        }
      } catch (err) {
        console.error("Save file error:", err);
        alert("Đã xảy ra lỗi khi tạo tệp: " + String(err));
        if (format === 'png' || format === 'pdf') {
          setInterfaceZoom(originalZoom);
          setOfficePreviewMode(originalPreviewMode);
        }
        setIsSavingFile(false);
        setIsPreparingPrint(false);
        setSaveFileProgress("");
        if (autoReleaseRam) {
          clearCanvasMemory();
        }
      }
    }, 1000);
  };

  const selectedObject = objects.find((obj) => obj.id === selectedId) || null;
  const displayObjects = excelData.length > 0 ? resolveDynamicObjects(objects, currentExcelRowIndex) : objects;
  const [excelSearchQuery, setExcelSearchQuery] = useState<string>("");

  const filteredExcelData = excelData.filter(row => {
    if (!excelSearchQuery.trim()) return true;
    const query = excelSearchQuery.toLowerCase();
    return Object.values(row).some(val => {
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(query);
    });
  });

  // Proxy gate router removed for offline performance

  return (
    <div 
      className="h-screen w-screen flex flex-col overflow-hidden font-sans select-none bg-kiot-bg text-kiot-slate app-scale-wrapper"
      style={{
        zoom: interfaceZoom,
        width: `${100 / interfaceZoom}vw`,
        height: `${100 / interfaceZoom}vh`
      }}
    >
      
      {/* 1. TOP APPLICATION NAVIGATION BAR */}
      <header id="app-header" className="min-h-16 py-2 bg-white border-b border-gray-200 flex flex-wrap gap-2 items-center justify-between px-4 shrink-0 z-40 no-print text-kiot-navy shadow-md">
        <div className="flex items-center space-x-4">
          <svg viewBox="0 0 326 92" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 md:h-11 w-auto shrink-0 select-none transition-transform hover:scale-105" id="kiotviet-svg-logo">
            {/* Background barcode pattern inside logo wrapper on header */}
            <g opacity="0.12">
              <rect x="2" y="8" width="3" height="76" fill="#000000"/>
              <rect x="8" y="8" width="5" height="76" fill="#000000"/>
              <rect x="16" y="8" width="2" height="76" fill="#000000"/>
              <rect x="21" y="8" width="4" height="76" fill="#000000"/>
              <rect x="28" y="8" width="2" height="76" fill="#000000"/>
              <rect x="33" y="8" width="5" height="76" fill="#000000"/>
              <rect x="41" y="8" width="2" height="76" fill="#000000"/>
              <rect x="46" y="8" width="4" height="76" fill="#000000"/>
              <rect x="53" y="8" width="3" height="76" fill="#000000"/>
              <rect x="59" y="8" width="5" height="76" fill="#000000"/>
              <rect x="67" y="8" width="2" height="76" fill="#000000"/>
              <rect x="72" y="8" width="4" height="76" fill="#000000"/>
              <rect x="79" y="8" width="3" height="76" fill="#000000"/>
              <rect x="85" y="8" width="5" height="76" fill="#000000"/>
            </g>
            <path fillRule="evenodd" clipRule="evenodd" d="M28.2727 2.98791C11.8294 10.3389 0.371094 26.8343 0.371094 46.003C0.371094 65.1691 11.8294 81.6619 28.2727 89.0142C32.3642 90.8114 34.8979 91.2578 37.0608 91.2578C45.2554 91.2578 49.0083 65.0212 49.0083 46.0017C49.0083 26.9797 45.2567 0.741699 37.0608 0.741699C34.8979 0.741699 32.3642 1.19068 28.2727 2.98533V2.98791Z" fill="url(#paint0_radial_1960_1122)"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M76.5424 20.3537L55.1653 41.7134C53.7733 43.1044 52.8599 44.462 52.8599 46.0564C52.8599 47.6523 53.7733 49.0068 55.1653 50.3978L76.5424 71.7576C77.8777 73.0962 79.0747 73.6689 80.698 73.6689C86.4346 73.6689 92.3952 59.4251 92.3952 46.0564C92.3952 32.6862 86.4361 18.4453 80.698 18.4453C79.0733 18.4453 77.8777 19.018 76.5424 20.3552V20.3537Z" fill="url(#paint1_radial_1960_1122)"/>
            
            {/* Elegant "KiotLabel" Text replaces original "KiotViet" text path */}
            <text x="106" y="62" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" fontWeight="900" fontSize="42" fill="#002248" letterSpacing="-1">KiotLabel</text>
            
            <defs>
              <radialGradient id="paint0_radial_1960_1122" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(-11.3026 46.014) scale(66.031 95.596)">
                <stop stopColor="#3AE3FF"/>
                <stop offset="1" stopColor="#0070F4"/>
              </radialGradient>
              <radialGradient id="paint1_radial_1960_1122" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(51.3029 45.7941) scale(41.2594 67.9409)">
                <stop stopColor="#5BE92A"/>
                <stop offset="0.39166" stopColor="#2DCF34"/>
                <stop offset="1" stopColor="#00B63E"/>
              </radialGradient>
            </defs>
          </svg>
          <div className="h-6 md:h-9 w-px bg-gray-200 hidden sm:block" />
          <div className="hidden sm:block">
            <h1 className="text-lg md:text-[26px] font-black tracking-tight text-kiot-navy flex items-center space-x-2 leading-none">
              <span className="text-kiot-cyan">KiotLabel</span>
              <span className="text-[11.5px] font-mono font-black text-white bg-kiot-green px-2 py-0.5 rounded-full shadow-md">Web V3.5</span>
            </h1>
          </div>
        </div>

        {/* TOP QUICK DESIGNS BUTTONS */}
        <div className="flex flex-wrap items-center gap-1.5 md:space-x-2 bg-slate-50/50 p-1 rounded-xl border border-slate-100/60 shadow-3xs">
          {/* Preset Template Selector */}
          <div 
            ref={presetContainerRef}
            className="relative"
            onMouseEnter={() => setShowPresetDropdown(true)}
            onMouseLeave={() => {
              if (!isPresetDropdownPinned) {
                setShowPresetDropdown(false);
              }
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isPresetDropdownPinned) {
                  setIsPresetDropdownPinned(false);
                  setShowPresetDropdown(false);
                } else {
                  setIsPresetDropdownPinned(true);
                  setShowPresetDropdown(true);
                }
              }}
              className={`h-7 px-2 rounded-lg text-[11px] font-black tracking-wide flex items-center space-x-1.5 border transition cursor-pointer shadow-xs active:scale-[0.98] ${
                isPresetDropdownPinned 
                  ? "bg-amber-100 text-amber-950 border-amber-500 ring-1 ring-amber-500/20" 
                  : "bg-white hover:bg-amber-50 text-amber-850 border-amber-300 hover:border-amber-500"
              }`}
              title="Chọn mẫu thiết kế ứng dụng có sẵn (Click để ghim hiển thị)"
            >
              <BookOpen className={`w-3.5 h-3.5 shrink-0 ${isPresetDropdownPinned ? "text-amber-800 animate-pulse" : "text-amber-600"}`} />
              <span>Chọn Mẫu có sẵn</span>
              <span className={`text-[8.5px] px-1 py-0.5 rounded font-mono font-black ${isPresetDropdownPinned ? "bg-amber-200 text-amber-950" : "bg-amber-100 text-amber-900"}`}>
                {isPresetDropdownPinned ? "Ghim" : "Preset"}
              </span>
            </button>
            {showPresetDropdown && (
              <div id="preset-selector-dropdown-wrapper" className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl text-slate-800 z-50 text-left transition-all duration-300 ease-in-out animate-fadeIn">
                <TemplateSelector onSelectTemplate={handleSelectTemplate} />
              </div>
            )}
          </div>

          {/* Load layouts storage */}
          <div ref={savedListContainerRef} className="relative border-r border-gray-150 pr-2">
            <button
              onClick={() => setShowSavedList(!showSavedList)}
              className="h-7 px-2 rounded-lg bg-white hover:bg-emerald-50 text-[11px] font-black text-emerald-850 tracking-wide flex items-center space-x-1.5 border border-emerald-300 hover:border-emerald-500 transition cursor-pointer shadow-xs active:scale-[0.98]"
              title="Danh sách thiết kế của bạn đã lưu"
            >
              <FolderHeart className="w-3.5 h-3.5 text-rose-500" />
              <span>Mẫu đã lưu ({savedDesigns.length})</span>
            </button>
            
            {showSavedList && (
              <div className="absolute right-0 mt-2 w-76 bg-white text-slate-800 rounded-lg shadow-2xl border border-gray-200/85 p-3 z-50 text-left max-h-[300px] overflow-y-auto animate-fadeIn">
                <h4 className="font-extrabold text-xs pb-2 border-b border-gray-150 text-kiot-navy uppercase tracking-wider flex items-center space-x-1.5">
                  <FolderHeart className="w-4 h-4 text-rose-500" />
                  <span>Bộ sưu tập mẫu đã lưu</span>
                </h4>
                {savedDesigns.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center italic">Chưa có bản ghi lưu nào trên máy này!</p>
                ) : (
                  <div className="divide-y divide-gray-100 mt-1.5">
                    {savedDesigns.map((sd, i) => (
                      <div
                        key={i}
                        onClick={() => handleLoadSavedDesign(sd)}
                        className="p-2 hover:bg-slate-50 rounded-md cursor-pointer transition flex items-center justify-between"
                      >
                        <div className="min-w-0 pr-2">
                           <p className="font-bold text-xs text-slate-800 truncate">{sd.name}</p>
                           <p className="text-[10px] text-gray-450 font-mono mt-0.5">{sd.config.width}x{sd.config.height}mm • {sd.timestamp}</p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteSavedDesign(e, i)}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition shrink-0"
                          title="Xóa mẫu lưu"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Simplified save trigger and file import */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSaveTemplateName(customSaveName || labelConfig.name || "");
                setSaveLocation(null);
                setShowSaveDialog(true);
              }}
              className="h-7 px-2 bg-indigo-600 hover:bg-indigo-700 text-white transition rounded-lg text-[11px] font-black uppercase flex items-center space-x-1 cursor-pointer shadow-md shadow-indigo-600/20 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
              title="Lưu bản thiết kế này sang loại khác hoặc tên mới hoàn toàn (Save As)"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu thành...</span>
            </button>
          </div>

          {/* Offline Import File Group (Export button removed per request) */}
          <div className="flex items-center space-x-1.5 border-l border-gray-150 pl-2">
            <label
              className="h-7 px-2 rounded-lg bg-white hover:bg-emerald-50 text-[11px] font-black text-emerald-900 tracking-wide flex items-center space-x-1.5 border border-emerald-300 hover:border-emerald-450 transition cursor-pointer shadow-sm shrink-0 hover:scale-[1.02] active:scale-[0.98]"
              title="Chọn file thiết kế .kvl để khôi phục lại mẫu tem, khổ tem, khổ giấy và dữ liệu Excel đã lưu"
              onClick={(e) => {
                // @ts-ignore
                if (window.pywebview && window.pywebview.api && window.pywebview.api.load_file_native) {
                  e.preventDefault();
                  triggerImportFile();
                }
              }}
            >
              <Upload className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Mở tệp</span>
              <input
                id="file-import-input"
                type="file"
                accept=".kvl,.json"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </header>

      {/* 2. MAIN SPLIT AREA (LEFT SIDEBAR & RIGHT WORKSPACE CANVAS) */}
      <div className="md:hidden flex shrink-0 no-print border-b border-gray-200 bg-white text-[12px] font-extrabold" role="tablist" id="mobile-pane-tabs">
        <button type="button" role="tab" aria-selected={mobilePane === "panel"} onClick={() => setMobilePane("panel")}
          className={`flex-1 py-2 ${mobilePane === "panel" ? "text-kiot-cyan border-b-2 border-kiot-cyan" : "text-slate-500"}`}>Thiết lập</button>
        <button type="button" role="tab" aria-selected={mobilePane === "canvas"} onClick={() => setMobilePane("canvas")}
          className={`flex-1 py-2 ${mobilePane === "canvas" ? "text-kiot-cyan border-b-2 border-kiot-cyan" : "text-slate-500"}`}>Tem &amp; in</button>
      </div>
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* SIDEBAR ON THE LEFT - SLIMMER DESIGN TAB HEIGHT & WIDTH (Optimized for small screens) */}
        <aside id="sidebar-ui" className={`${mobilePane === "panel" ? "flex" : "hidden"} md:flex w-full md:w-[25%] md:min-w-[330px] md:max-w-[420px] bg-white border-r border-gray-200 flex-col shrink-0 no-print text-kiot-slate shadow-sm z-10 font-sans`}>
          
          {selectedObject ? (
            <div className="flex-1 flex flex-col overflow-hidden animate-fadeIn">
              {/* Header Taskbar of the properties sidebar column */}
              <div className="h-[44px] border-b border-gray-200 bg-slate-50 px-3 flex items-center justify-between select-none shrink-0">
                <div className="flex items-center space-x-1.5 text-kiot-navy">
                  <span className="font-extrabold text-[11.5px] uppercase text-kiot-navy tracking-wider select-none shrink-0">
                    THUỘC TÍNH
                  </span>
                  {selectedIds.length > 1 ? (
                    <span className="text-[9.5px] bg-amber-50 text-amber-700 border border-amber-200 font-bold px-1.5 py-0.5 rounded-md uppercase shrink-0 animate-pulse">
                      Đã chọn {selectedIds.length} phần tử (Ctrl+Click)
                    </span>
                  ) : (
                    <span className="text-[9px] bg-sky-50 text-kiot-cyan border border-kiot-cyan/20 font-extrabold px-1.5 py-0.5 rounded-md uppercase shrink-0">
                      {selectedObject.type === 'text' ? 'Văn bản' : selectedObject.type === 'barcode' ? 'Mã vạch' : selectedObject.type === 'qrcode' ? 'QR Code' : 'Hình ảnh'}
                    </span>
                  )}
                </div>
                
                <button
                  type="button"
                  onClick={() => handleSelectObject(null)}
                  className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 hover:border-emerald-800 font-black text-[11px] rounded-lg transition-all duration-150 flex items-center justify-center space-x-1 cursor-pointer shadow-sm hover:shadow-md hover:scale-[1.04] active:scale-[0.96] focus:outline-none select-none"
                  title="Đóng thuộc tính & Hủy chọn (Trở về Menu công cụ)"
                >
                  <X className="w-3.5 h-3.5 stroke-[3]" />
                  <span>ĐÓNG (EXIT)</span>
                </button>
              </div>

              {/* Scrollable container for PropertiesPanel with zero-overlap padding */}
              <div className="flex-1 overflow-y-auto p-2.5 bg-white">
                <PropertiesPanel
                  selectedObject={selectedObject}
                  labelConfig={labelConfig}
                  onChangeObject={handleUpdateObject}
                  onDeleteObject={handleDeleteObject}
                  excelColumns={excelColumns}
                  onSwitchToExcelTab={() => {
                    setIsExcelExpanded(true);
                    setTimeout(() => {
                      document.getElementById("excel-section-header")?.scrollIntoView({ behavior: "smooth" });
                    }, 100);
                  }}
                />
              </div>

              {/* Sticky bottom guide inside Properties panel */}
              <footer className="p-2 bg-gray-50 border-t border-gray-200 text-[9.5px] text-gray-500 leading-normal flex items-start space-x-1 shrink-0">
                <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Thay đổi vị trí, kích thước, căn lề và thuộc tính liên kết Excel của đối tượng. Nhấp <strong>ĐÓNG</strong> hoặc click vùng trống để lưu &amp; quay lại Menu Công cụ.
                </p>
              </footer>
            </div>
          ) : (
            <>
              {/* TAB BAR HEADER */}
          <div className="flex select-none bg-slate-100 p-2 gap-2 shrink-0 tracking-wider border-b border-gray-200">
            <button
              onClick={() => setActiveSidebarTab('layout')}
              className={`flex-1 py-2.5 md:py-3.5 text-center transition-all duration-150 flex flex-col items-center justify-center space-y-1.5 rounded-xl cursor-pointer ${
                activeSidebarTab === 'layout'
                  ? 'text-white bg-[#0070F4] font-black shadow-md shadow-blue-500/20'
                  : 'text-slate-700 bg-[#ecf2fa]/90 hover:bg-[#dfeaf7] hover:text-[#0070F4]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-[11.5px] font-black transition-all ${
                  activeSidebarTab === 'layout'
                    ? 'bg-white text-[#0070F4] ring-4 ring-white/10 scale-105'
                    : 'bg-sky-200 text-sky-850 font-black'
                }`}>1</span>
                <span className={`text-[13.5px] md:text-[14.5px] font-black tracking-wide leading-none ${activeSidebarTab === 'layout' ? 'text-white' : 'text-slate-750 font-black'}`}>KHỔ TEM & GIẤY</span>
              </div>
              <span className={`text-[10.5px] font-extrabold normal-case leading-none mt-0.5 ${activeSidebarTab === 'layout' ? 'text-sky-100' : 'text-slate-500'}`}>Thiết lập khổ tem in</span>
            </button>
            <button
              onClick={() => setActiveSidebarTab('design')}
              className={`flex-1 py-2.5 md:py-3.5 text-center transition-all duration-150 flex flex-col items-center justify-center space-y-1.5 rounded-xl cursor-pointer ${
                activeSidebarTab === 'design'
                  ? 'text-white bg-[#00B63E] font-black shadow-md shadow-emerald-500/20'
                  : 'text-slate-700 bg-[#edf6ee]/90 hover:bg-[#e0efe2] hover:text-[#00B63E]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-[11.5px] font-black transition-all ${
                  activeSidebarTab === 'design'
                    ? 'bg-white text-[#00B63E] ring-4 ring-white/10 scale-105'
                    : 'bg-emerald-200 text-emerald-850 font-black'
                }`}>2</span>
                <span className={`text-[13.5px] md:text-[14.5px] font-black tracking-wide leading-none ${activeSidebarTab === 'design' ? 'text-white' : 'text-slate-750 font-black'}`}>THIẾT KẾ TEM</span>
              </div>
              <span className={`text-[10.5px] font-extrabold normal-case leading-none mt-0.5 ${activeSidebarTab === 'design' ? 'text-emerald-100' : 'text-slate-500'}`}>Vẽ &amp; chỉnh sửa chi tiết</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
            
            {/* TAB 1: PAPER & GRID LAYOUT */}
            {activeSidebarTab === 'layout' && (
              <div className="space-y-4 text-kiot-slate">
                
                {/* BƯỚC 1 ACCORDION */}
                <div className="space-y-1.5 animate-fadeIn">
                  <button
                    type="button"
                    onClick={() => setIsStep1Expanded(!isStep1Expanded)}
                    className={`w-full px-4 py-3 flex items-center justify-between cursor-pointer select-none group rounded-xl border transition-all duration-150 outline-none transform active:scale-[0.98] ${
                      isStep1Expanded
                        ? "bg-sky-100 text-sky-950 border-sky-300 shadow-sm"
                        : "bg-sky-50/90 text-sky-900 border-sky-200 hover:bg-sky-100/60 hover:border-sky-300 shadow-3xs"
                    }`}
                    title="Cấu hình kích thước của tem nhãn dán, độ bo góc, đường viền"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] tracking-wide shrink-0 transition-colors border ${
                        isStep1Expanded ? "bg-sky-600 text-white border-sky-700" : "bg-sky-100 text-sky-800 border-sky-200"
                      }`}>
                        BƯỚC 1
                      </span>
                      <span className={`font-extrabold text-[12.5px] uppercase tracking-wider transition-colors font-sans ${
                        isStep1Expanded ? "text-sky-950" : "text-sky-900 group-hover:text-sky-950"
                      }`}>
                        Xác định khổ tem
                      </span>
                    </div>
                    <div className={`transition-transform duration-150 ${isStep1Expanded ? "rotate-180 text-sky-600" : "text-sky-500 group-hover:text-sky-650"}`}>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </button>

                  {isStep1Expanded && (
                    <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-4 shadow-3xs">
                      {/* MODULE 1: CONTROL PANEL DIMENSIONS */}
                      <section className="pb-1 space-y-2.5">
                        <h2 className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider flex items-center space-x-2 select-none">
                          <Compass className="w-3.5 h-3.5 text-blue-500" />
                          <span>Kích thước tem nhãn ( 1 tem )</span>
                        </h2>

                      {/* POPULAR TOMY LABELS PICKER PANEL */}
                      <div ref={tomyContainerRef} className="space-y-2.5 pb-2.5 border-b border-gray-150/80 no-print">
                        <div className="flex items-center space-x-2 select-none no-print">
                          <label className="relative flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={usePopularTomy}
                              onChange={(e) => {
                                setUsePopularTomy(e.target.checked);
                                setIsTomyDropdownOpen(e.target.checked);
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-slate-200 hover:bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#00B63E]"></div>
                            <span className="ml-2.5 text-[12px] font-black text-slate-700">Sử dụng tem Tomy phổ biến</span>
                          </label>
                        </div>

                        {usePopularTomy && (
                          <div className="relative space-y-1 pt-0.5 select-none no-print">
                            <label className="block text-[11px] text-slate-500 font-bold mb-0.5">Chọn dòng tem Tomy:</label>
                            <div className="relative col-span-2">
                              <button
                                type="button"
                                onClick={() => setIsTomyDropdownOpen(!isTomyDropdownOpen)}
                                className="w-full flex items-center justify-between pl-3 pr-2 py-1.5 text-[12px] bg-slate-50 border border-slate-250 hover:border-[#00B63E] rounded-lg text-slate-800 font-bold transition shadow-3xs cursor-pointer focus:ring-1 focus:ring-[#00B63E] text-left"
                              >
                                <span className="truncate">
                                  {TOMY_TEMPLATES_DATA.find(item => item.name === labelConfig.name)?.name || "Bấm chọn dòng tem..."}
                                </span>
                                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1.5" />
                              </button>

                              {isTomyDropdownOpen && (
                                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-[290px] flex flex-col overflow-hidden animate-slideDown">
                                  {/* Search box container */}
                                  <div className="p-2 border-b border-slate-100 flex items-center space-x-2 bg-slate-50 shrink-0">
                                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <input
                                      type="text"
                                      placeholder="Nhập mã Tomy (ví dụ: 138, 105, A4...)"
                                      value={tomySearchQuery}
                                      onChange={(e) => setTomySearchQuery(e.target.value)}
                                      className="w-full bg-transparent border-0 text-xs focus:ring-0 focus:outline-none font-bold text-slate-700"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    {tomySearchQuery && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTomySearchQuery("");
                                        }}
                                        className="p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-md"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>

                                  {/* Item options */}
                                  <div className="overflow-y-auto flex-1 divide-y divide-slate-50/50">
                                    {(() => {
                                      const query = tomySearchQuery.trim().toLowerCase();
                                      const filtered = TOMY_TEMPLATES_DATA.filter(item => 
                                        item.name.toLowerCase().includes(query)
                                      );

                                      if (filtered.length === 0) {
                                        return (
                                          <div className="py-4 px-3 text-xs text-slate-450 font-semibold text-center italic">
                                            Không tìm thấy dòng tem nào
                                          </div>
                                        );
                                      }

                                      return filtered.map((item) => {
                                        const isSelected = labelConfig.name === item.name;
                                        return (
                                          <button
                                            key={item.name}
                                            type="button"
                                            onClick={() => handleSelectTomyTemplate(item)}
                                            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                              isSelected 
                                                ? "bg-slate-100 text-[#00B63E] font-black" 
                                                : "hover:bg-slate-50 text-slate-700 font-semibold"
                                            }`}
                                          >
                                            <div className="flex flex-col">
                                              <span className="font-extrabold">{item.name}</span>
                                              <span className="text-[10px] text-slate-400 font-medium">
                                                Giấy {item.paperSize} • {item.rows} hàng x {item.cols} cột ({item.width}x{item.height} mm)
                                              </span>
                                            </div>
                                            {isSelected && <span className="text-[10px] bg-[#00B63E] text-white px-1 py-0.5 rounded font-black shrink-0 ml-1.5">Đã chọn</span>}
                                          </button>
                                        );
                                      });
                                    })()}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Chiều rộng (mm)</label>
                      <div className="relative">
                        <input
                          id="width-input"
                          type="text"
                          inputMode="decimal"
                          value={widthInput}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setWidthInput(raw);
                            const w = parseSizeMm(raw);
                            if (w === null) {
                              setSizeError(SIZE_HINT);
                            } else {
                              setSizeError(null);
                              applyPresetDimensions(w, labelConfig.height, "Cấu hình tự chọn");
                            }
                          }}
                          onBlur={() => {
                            // Giá trị không hợp lệ: trả về kích thước hiện tại, không tự đổi thành 10mm
                            setSizeError(null);
                            setWidthInput(String(labelConfig.width));
                          }}
                          className="w-full pl-2 pr-7 py-1.5 text-sm bg-white border border-gray-300 rounded-lg text-slate-800 font-bold font-mono focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan outline-none"
                        />
                        <span className="absolute right-2 top-2 text-[11px] text-gray-400 font-extrabold select-none">mm</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Chiều cao (mm)</label>
                      <div className="relative">
                        <input
                          id="height-input"
                          type="text"
                          inputMode="decimal"
                          value={heightInput}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setHeightInput(raw);
                            const h = parseSizeMm(raw);
                            if (h === null) {
                              setSizeError(SIZE_HINT);
                            } else {
                              setSizeError(null);
                              applyPresetDimensions(labelConfig.width, h, "Cấu hình tự chọn");
                            }
                          }}
                          onBlur={() => {
                            setSizeError(null);
                            setHeightInput(String(labelConfig.height));
                          }}
                          className="w-full pl-2 pr-7 py-1.5 text-sm bg-white border border-gray-300 rounded-lg text-slate-800 font-bold font-mono focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan outline-none"
                        />
                        <span className="absolute right-2 top-2 text-[11px] text-gray-400 font-extrabold select-none">mm</span>
                      </div>
                    </div>
                  </div>

                  {sizeError && (
                    <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                      ⚠️ {sizeError}
                    </p>
                  )}

                  {/* Quick Preset Dropdown List with Checkmark indicators */}
                  <div className="space-y-1.5 pt-1 relative">
                    <span className="block text-[11.5px] text-gray-400 font-bold select-none">Thay đổi nhanh khổ tem</span>
                    
                    <button
                      type="button"
                      onClick={() => setIsQuickSizeOpen(!isQuickSizeOpen)}
                      className="w-full flex items-center justify-between bg-white border border-gray-300 hover:border-kiot-cyan rounded-lg px-2.5 py-2 text-sm font-bold text-slate-800 focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan outline-none text-left cursor-pointer transition shadow-xs"
                    >
                      <span className="truncate">
                        {labelConfig.width === 65 && labelConfig.height === 45 ? "65x45mm (Tem Kệ)" :
                         labelConfig.width === 75 && labelConfig.height === 100 ? "75x100mm (Shipping)" :
                         labelConfig.width === 100 && labelConfig.height === 150 ? "100x150mm (Shipping)" :
                         labelConfig.width === 40 && labelConfig.height === 30 ? "40x30mm (Nhãn Giá)" :
                         labelConfig.width === 50 && labelConfig.height === 30 ? "50x30mm (Tài Sản)" :
                         labelConfig.width === 50 && labelConfig.height === 50 ? "50x50mm (Mã QR)" :
                         `Khổ tự chọn (${labelConfig.width}x${labelConfig.height}mm)`}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
                    </button>

                    {/* Dropdown presets options block overlay */}
                    {isQuickSizeOpen && (
                      <>
                        {/* Backdrop overlay to dismiss dropdown */}
                        <div 
                          className="fixed inset-0 z-35 bg-transparent" 
                          onClick={() => setIsQuickSizeOpen(false)} 
                        />
                        
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-40 text-sm max-h-60 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              applyPresetDimensions(65, 45, "Tem Kệ Siêu Thị");
                              setIsQuickSizeOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-left font-semibold transition cursor-pointer ${
                              labelConfig.width === 65 && labelConfig.height === 45 ? "text-kiot-navy bg-sky-50/35" : "text-slate-700"
                            }`}
                          >
                            <span>65x45mm (Tem Kệ - Nhãn Siêu Thị)</span>
                            {labelConfig.width === 65 && labelConfig.height === 45 && (
                              <span className="text-kiot-cyan font-bold text-sm">✓</span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              applyPresetDimensions(75, 100, "Nhãn Giao hàng 75x100");
                              setIsQuickSizeOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-left font-semibold transition cursor-pointer ${
                              labelConfig.width === 75 && labelConfig.height === 100 ? "text-kiot-navy bg-sky-50/35" : "text-slate-700"
                            }`}
                          >
                            <span>75x100mm (Shipping Trung)</span>
                            {labelConfig.width === 75 && labelConfig.height === 100 && (
                              <span className="text-kiot-cyan font-bold text-sm">✓</span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              applyPresetDimensions(100, 150, "Nhãn Giao hàng 100x150");
                              setIsQuickSizeOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-left font-semibold transition cursor-pointer ${
                              labelConfig.width === 100 && labelConfig.height === 150 ? "text-kiot-navy bg-sky-50/35" : "text-slate-700"
                            }`}
                          >
                            <span>100x150mm (Shipping Lớn - TMĐT)</span>
                            {labelConfig.width === 100 && labelConfig.height === 150 && (
                              <span className="text-kiot-cyan font-bold text-sm">✓</span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              applyPresetDimensions(40, 30, "Mã giá lẻ");
                              setIsQuickSizeOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-left font-semibold transition cursor-pointer ${
                              labelConfig.width === 40 && labelConfig.height === 30 ? "text-kiot-navy bg-sky-50/35" : "text-slate-700"
                            }`}
                          >
                            <span>40x30mm (Nhãn Giá Bán)</span>
                            {labelConfig.width === 40 && labelConfig.height === 30 && (
                              <span className="text-kiot-cyan font-bold text-sm">✓</span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              applyPresetDimensions(50, 30, "Mẫu TSCĐ");
                              setIsQuickSizeOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-left font-semibold transition cursor-pointer ${
                              labelConfig.width === 50 && labelConfig.height === 30 ? "text-kiot-navy bg-sky-50/35" : "text-slate-700"
                            }`}
                          >
                            <span>50x30mm (Mã Tài Sản)</span>
                            {labelConfig.width === 50 && labelConfig.height === 30 && (
                              <span className="text-kiot-cyan font-bold text-sm">✓</span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              applyPresetDimensions(50, 50, "QR Thanh toán");
                              setIsQuickSizeOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-left font-semibold transition cursor-pointer ${
                              labelConfig.width === 50 && labelConfig.height === 50 ? "text-kiot-navy bg-sky-50/35" : "text-slate-700"
                            }`}
                          >
                            <span>50x50mm (Mã QR Thanh Toán)</span>
                            {labelConfig.width === 50 && labelConfig.height === 50 && (
                              <span className="text-kiot-cyan font-bold text-sm">✓</span>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </section>

                {/* VIỀN TEM & BO GÓC */}
                <section className="space-y-3.5">
                  <h2 className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider flex items-center space-x-2 select-none">
                    <CheckSquare className="w-3.5 h-3.5 text-kiot-cyan" />
                    <span>Viền tem &amp; Bo góc</span>
                  </h2>
                  
                  <div className="flex items-center space-x-2 text-xs">
                    <input
                      id="showBorderCheckbox"
                      type="checkbox"
                      checked={sheetConfig.showBorder}
                      onChange={(e) => setSheetConfig(prev => ({ ...prev, showBorder: e.target.checked }))}
                      className="w-4.5 h-4.5 text-kiot-cyan focus:ring-kiot-cyan/50 border-gray-300 rounded cursor-pointer"
                    />
                    <label htmlFor="showBorderCheckbox" className="font-bold text-[12.5px] text-slate-700 cursor-pointer select-none">
                      Viền tem nhãn
                    </label>
                  </div>

                  {sheetConfig.showBorder && (
                    <div className="grid grid-cols-2 gap-3 text-xs pl-6 transition-all duration-150">
                      <div>
                        <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Hình dáng viền</label>
                        <select
                          value={sheetConfig.borderRadius === 0 ? "square" : "rounded"}
                          onChange={(e) => setSheetConfig(prev => ({ ...prev, borderRadius: e.target.value === "square" ? 0 : 2 }))}
                          className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none cursor-pointer text-slate-800 font-bold focus:border-kiot-cyan"
                        >
                          <option value="square">Vuông góc</option>
                          <option value="rounded">Bo tròn</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Độ bo góc (Radius)</label>
                        <input
                          id="border-radius-input"
                          type="text"
                          disabled={sheetConfig.borderRadius === 0}
                          value={borderRadiusInput}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setBorderRadiusInput(raw);
                            const parsed = parseInt(raw, 10);
                            if (!isNaN(parsed) && parsed >= 0 && parsed <= 15) {
                              setSheetConfig(prev => ({ ...prev, borderRadius: parsed }));
                            }
                          }}
                          onBlur={() => {
                            const parsed = parseInt(borderRadiusInput, 10);
                            if (isNaN(parsed) || parsed < 0 || parsed > 15) {
                              setSheetConfig(prev => ({ ...prev, borderRadius: 0 }));
                              setBorderRadiusInput("0");
                            } else {
                              setSheetConfig(prev => ({ ...prev, borderRadius: parsed }));
                              setBorderRadiusInput(String(parsed));
                            }
                          }}
                          className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold disabled:opacity-50"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Màu đường viền</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={sheetConfig.borderColor || "#9ca3af"}
                            onChange={(e) => setSheetConfig(prev => ({ ...prev, borderColor: e.target.value }))}
                            className="w-10 h-8 p-0 border border-gray-300 cursor-pointer rounded-md outline-none bg-transparent"
                          />
                          <input
                            type="text"
                            value={sheetConfig.borderColor || "#9ca3af"}
                            onChange={(e) => setSheetConfig(prev => ({ ...prev, borderColor: e.target.value }))}
                            className="w-28 px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan focus:outline-none bg-white font-mono text-slate-800 font-bold"
                            placeholder="#9ca3af"
                          />
                          <div className="flex space-x-1">
                            {[
                              "#9ca3af",
                              "#000000",
                              "#ff0000",
                              "#008000",
                              "#0000ff"
                            ].map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => setSheetConfig(prev => ({ ...prev, borderColor: hex }))}
                                className="w-5 h-5 rounded-full border border-gray-350 cursor-pointer transition-transform hover:scale-110 shadow-sm"
                                style={{ backgroundColor: hex }}
                                title={hex}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Độ dày nét kẻ viền (px)</label>
                        <input
                          type="range"
                          min={1}
                          max={4}
                          step={1}
                          value={sheetConfig.borderWidth}
                          onChange={(e) => setSheetConfig(prev => ({ ...prev, borderWidth: parseInt(e.target.value) || 1 }))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-1"
                        />
                        <div className="flex justify-between text-[10.5px] text-gray-500 font-bold mt-1 select-none">
                          <span>Mỏng (1px)</span>
                          <span>Dày ({sheetConfig.borderWidth}px)</span>
                          <span>Dày nhất (4px)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
                
                    </div>
                  )}
                </div>

                {/* BƯỚC 2 ACCORDION */}
                <div className="space-y-1.5 animate-fadeIn">
                  <button
                    type="button"
                    onClick={() => setIsStep2Expanded(!isStep2Expanded)}
                    className={`w-full px-4 py-3 flex items-center justify-between cursor-pointer select-none group rounded-xl border transition-all duration-150 outline-none transform active:scale-[0.98] ${
                      isStep2Expanded
                        ? "bg-indigo-100 text-indigo-950 border-indigo-300 shadow-sm"
                        : "bg-indigo-50/90 text-indigo-900 border-indigo-200 hover:bg-indigo-100/60 hover:border-indigo-300 shadow-3xs"
                    }`}
                    title="Cấu hình kích thước khổ giấy văn phòng (A4/A5) hoặc thiết lập cuộn tem nhiệt"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] tracking-wide shrink-0 transition-colors border ${
                        isStep2Expanded ? "bg-indigo-600 text-white border-indigo-700" : "bg-indigo-100 text-indigo-800 border-indigo-200"
                      }`}>
                        BƯỚC 2
                      </span>
                      <span className={`font-extrabold text-[12.5px] uppercase tracking-wider transition-colors font-sans ${
                        isStep2Expanded ? "text-indigo-950" : "text-indigo-900 group-hover:text-indigo-950"
                      }`}>
                        Thiết lập khổ giấy và máy in
                      </span>
                    </div>
                    <div className={`transition-transform duration-150 ${isStep2Expanded ? "rotate-180 text-indigo-600" : "text-indigo-500 group-hover:text-indigo-600"}`}>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </button>

                   {isStep2Expanded && (
                    <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-4 shadow-3xs">
                      {labelConfig.name && labelConfig.name.includes("Tomy") && (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11.5px] rounded-lg font-semibold flex items-start space-x-1.5 shadow-3xs animate-fadeIn no-print">
                          <span className="text-sm mt-0.5">⚡</span>
                          <div className="flex-1">
                            <span className="text-emerald-950 font-extrabold block text-xs">Đã đồng bộ mẫu Tomy mặc định!</span>
                            <span className="text-emerald-700 text-[10.5px] leading-tight block mt-0.5">Hệ thống đã tự động áp dụng khổ giấy <strong>{TOMY_TEMPLATES_DATA.find(t => t.name === labelConfig.name)?.paperSize || "A4/A5"}</strong> ({TOMY_TEMPLATES_DATA.find(t => t.name === labelConfig.name)?.orientation === "landscape" ? "Khổ ngang" : "Khổ dọc"}), các lề giấy chuẩn, số ô lưới và khe hở chính xác cho <strong className="text-emerald-950 font-bold">{labelConfig.name}</strong>.</span>
                          </div>
                        </div>
                      )}
                      
                      {/* 1. PRINT MODE SELECTOR */}
                      <section className="space-y-2.5">
                        <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center space-x-1.5 select-none mb-1">
                          <Grid3X3 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Khổ giấy và máy in</span>
                        </h2>
                  <div className="grid grid-cols-2 gap-3 text-[12px]">
                    <button
                      type="button"
                      onClick={() => setSheetConfig(prev => ({ ...prev, mode: 'thermal', rowGap: 0 }))}
                      className={`p-3 border rounded-xl text-left transition flex items-center space-x-2 cursor-pointer focus:outline-none ${
                        sheetConfig.mode === 'thermal'
                          ? 'bg-sky-50/50 border-kiot-cyan text-kiot-navy ring-1 ring-kiot-cyan/50 shadow-xs'
                          : 'bg-white border-gray-200 hover:bg-slate-50 text-slate-550'
                      }`}
                      title="Sử dụng máy in nhãn chuyên dụng / máy in chuyển nhiệt in 1 nhãn liên tiếp trên cuộn giấy dán."
                    >
                      <span className="text-base shrink-0">📠</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-[12.5px] leading-tight text-slate-800">In nhãn cuộn</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate mt-1">Xprinter/Zebra...</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSheetConfig(prev => ({ ...prev, mode: 'office' }))}
                      className={`p-3 border rounded-xl text-left transition flex items-center space-x-2 cursor-pointer focus:outline-none ${
                        sheetConfig.mode === 'office'
                          ? 'bg-sky-50/50 border-kiot-cyan text-kiot-navy ring-1 ring-kiot-cyan/50 shadow-xs'
                          : 'bg-white border-gray-200 hover:bg-slate-50 text-slate-550'
                      }`}
                      title="Sử dụng máy in văn phòng tiêu chuẩn (A4/A5...). Nhãn được sắp xếp thành mạng lưới cột/hàng trên tờ giấy dán."
                    >
                      <span className="text-base shrink-0">🖨️</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-[12.5px] leading-tight text-slate-800">In văn phòng</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate mt-1">Giấy Decal A4/A5</p>
                      </div>
                    </button>
                  </div>
                </section>

                {sheetConfig.mode === 'office' ? (
                  <>
                    <section className="border-b border-gray-150 pb-4 space-y-3.5">
                      <h2 className="text-[12.5px] font-black text-[#475569] uppercase tracking-wider select-none">
                        Khổ giấy văn phòng
                      </h2>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Khổ giấy</label>
                          <select
                            value={sheetConfig.paperSize}
                            onChange={(e) => setSheetConfig(prev => ({ ...prev, paperSize: e.target.value as any }))}
                            className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none cursor-pointer text-slate-800 font-bold focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan"
                          >
                            <option value="A4">A4 (210x297mm)</option>
                            <option value="A5">A5 (148x210mm)</option>
                            <option value="custom">Kích thước riêng</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Chiều giấy</label>
                          <select
                            value={sheetConfig.orientation}
                            onChange={(e) => setSheetConfig(prev => ({ ...prev, orientation: e.target.value as any }))}
                            className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none cursor-pointer text-slate-800 font-bold focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan"
                          >
                            <option value="portrait">Khổ dọc</option>
                            <option value="landscape">Khổ ngang</option>
                          </select>
                        </div>
                      </div>

                      {sheetConfig.paperSize === 'custom' && (
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block text-[11px] text-slate-500 font-bold mb-1">Ch.rộng giấy (mm)</label>
                            <input
                              id="custom-width-input"
                              type="text"
                              value={customWidthInput}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setCustomWidthInput(raw);
                                const parsed = parseInt(raw, 10);
                                if (!isNaN(parsed) && parsed >= 50 && parsed <= 600) {
                                  setSheetConfig(prev => ({ ...prev, customWidth: parsed }));
                                }
                              }}
                              onBlur={() => {
                                const parsed = parseInt(customWidthInput, 10);
                                if (isNaN(parsed) || parsed < 50 || parsed > 600) {
                                  setSheetConfig(prev => ({ ...prev, customWidth: 210 }));
                                  setCustomWidthInput("210");
                                } else {
                                  setSheetConfig(prev => ({ ...prev, customWidth: parsed }));
                                  setCustomWidthInput(String(parsed));
                                }
                              }}
                              className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 font-bold mb-1">Ch.cao giấy (mm)</label>
                            <input
                              id="custom-height-input"
                              type="text"
                              value={customHeightInput}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setCustomHeightInput(raw);
                                const parsed = parseInt(raw, 10);
                                if (!isNaN(parsed) && parsed >= 50 && parsed <= 600) {
                                  setSheetConfig(prev => ({ ...prev, customHeight: parsed }));
                                }
                              }}
                              onBlur={() => {
                                const parsed = parseInt(customHeightInput, 10);
                                if (isNaN(parsed) || parsed < 50 || parsed > 600) {
                                  setSheetConfig(prev => ({ ...prev, customHeight: 297 }));
                                  setCustomHeightInput("297");
                                } else {
                                  setSheetConfig(prev => ({ ...prev, customHeight: parsed }));
                                  setCustomHeightInput(String(parsed));
                                }
                              }}
                              className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold"
                            />
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 3. BỐ CỤC LƯỚI */}
                    <section className="border-b border-gray-150 pb-4 space-y-3.5">
                      <h2 className="text-[12.5px] font-black text-[#475569] uppercase tracking-wider select-none">
                        Bố cục tem nhãn
                      </h2>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Số Cột (Cols)</label>
                          <input
                            id="cols-input"
                            type="text"
                            value={colsInput}
                            onChange={(e) => {
                              const s = e.target.value;
                              setColsInput(s);
                              const c = parseInt(s);
                              if (!isNaN(c) && c >= 1) {
                                setSheetConfig(prev => ({ ...prev, cols: Math.min(c, 15) }));
                              }
                            }}
                            onBlur={() => {
                              const c = parseInt(colsInput);
                              if (isNaN(c) || c < 1) {
                                setSheetConfig(prev => ({ ...prev, cols: 1 }));
                                setColsInput("1");
                              } else if (c > 15) {
                                setSheetConfig(prev => ({ ...prev, cols: 15 }));
                                setColsInput("15");
                              }
                            }}
                            className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Số Hàng (Rows)</label>
                          <input
                            id="rows-input"
                            type="text"
                            value={rowsInput}
                            onChange={(e) => {
                              const s = e.target.value;
                              setRowsInput(s);
                              const r = parseInt(s);
                              if (!isNaN(r) && r >= 1) {
                                setSheetConfig(prev => ({ ...prev, rows: Math.min(r, 30) }));
                              }
                            }}
                            onBlur={() => {
                              const r = parseInt(rowsInput);
                              if (isNaN(r) || r < 1) {
                                setSheetConfig(prev => ({ ...prev, rows: 1 }));
                                setRowsInput("1");
                              } else if (r > 30) {
                                setSheetConfig(prev => ({ ...prev, rows: 30 }));
                                setRowsInput("30");
                              }
                            }}
                            className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold"
                          />
                        </div>
                      </div>

                      <div className="p-3 border border-blue-100 bg-blue-50/25 text-[12px] text-blue-900 rounded-lg font-bold flex items-center justify-between shadow-2xs">
                        <span>Số lượng tem tối đa trên trang: <strong className="text-blue-600 font-black">{sheetConfig.cols * sheetConfig.rows} tem</strong></span>
                      </div>

                      {/* Cảnh báo lưới tem vượt khổ giấy */}
                      {(() => {
                        const { width: sW, height: sH } = getSheetDimensions(sheetConfig);
                        const netW = sW - sheetConfig.marginLeft - sheetConfig.marginRight;
                        const netH = sH - sheetConfig.marginTop - sheetConfig.marginBottom;
                        const needW = sheetConfig.cols * labelConfig.width + (sheetConfig.cols - 1) * sheetConfig.colGap;
                        const needH = sheetConfig.rows * labelConfig.height + (sheetConfig.rows - 1) * sheetConfig.rowGap;
                        const overW = needW - netW > 0.05;
                        const overH = needH - netH > 0.05;
                        if (!overW && !overH) return null;
                        const maxCols = Math.max(0, Math.floor((netW + sheetConfig.colGap) / (labelConfig.width + sheetConfig.colGap)));
                        const maxRows = Math.max(0, Math.floor((netH + sheetConfig.rowGap) / (labelConfig.height + sheetConfig.rowGap)));
                        return (
                          <div className="p-2.5 border border-amber-200 bg-amber-50 text-[11.5px] text-amber-900 rounded-lg font-bold leading-snug" role="alert">
                            ⚠️ Lưới {sheetConfig.cols} cột × {sheetConfig.rows} hàng cần {needW.toFixed(1)} × {needH.toFixed(1)} mm nhưng vùng in chỉ có {netW.toFixed(1)} × {netH.toFixed(1)} mm
                            {maxCols === 0 || maxRows === 0
                              ? ` — tem ${labelConfig.width} × ${labelConfig.height} mm lớn hơn vùng in, hãy đổi khổ giấy, hướng giấy hoặc giảm lề.`
                              : ` — khổ giấy này chỉ đủ tối đa ${maxCols} cột × ${maxRows} hàng (${maxCols * maxRows} tem).`}
                          </div>
                        );
                      })()}

                      {/* NÚT TỐI ƯU HÓA HOÀN HẢO */}
                      <button
                        type="button"
                        onClick={() => {
                          const { width: sW, height: sH } = getSheetDimensions(sheetConfig);
                          const netW = sW - sheetConfig.marginLeft - sheetConfig.marginRight;
                          const netH = sH - sheetConfig.marginTop - sheetConfig.marginBottom;
                          const totalColGaps = (sheetConfig.cols - 1) * sheetConfig.colGap;
                          const totalRowGaps = (sheetConfig.rows - 1) * sheetConfig.rowGap;
                          const optW = (netW - totalColGaps) / sheetConfig.cols;
                          const optH = (netH - totalRowGaps) / sheetConfig.rows;
                          
                          applyPresetDimensions(
                            Math.max(10, Math.floor(optW * 10) / 10),
                            Math.max(10, Math.floor(optH * 10) / 10),
                            `Khớp Lưới ${sheetConfig.cols}x${sheetConfig.rows}`
                          );
                        }}
                        className="w-full py-2 bg-kiot-cyan hover:bg-sky-600 text-white rounded-lg text-[11.5px] font-black text-center select-none cursor-pointer transition border border-kiot-cyan flex items-center justify-center space-x-1.5 shadow-sm"
                        title="Tính toán kích thước Chiều rộng và Chiều cao của tem nhãn dán tối ưu nhất dựa theo lề giấy và khe hở, giúp nhãn khít khịt với tờ đề can in ấn sẵn."
                      >
                        ⚡ <span>Khớp vừa nhãn vào lưới giấy</span>
                      </button>
                    </section>

                    {/* 4. KHOẢNG CÁCH LỀ GIẤY */}
                    <section className="border-b border-gray-150 pb-4 space-y-3">
                      <h2 className="text-[12.5px] font-black text-[#475569] uppercase tracking-wider select-none">
                        Lề trang
                      </h2>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Lề trái (mm)</label>
                          <input
                            id="margin-left-input"
                            type="text"
                            value={marginLeftInput}
                            onChange={(e) => {
                              const s = e.target.value;
                              setMarginLeftInput(s);
                              const m = parseInt(s);
                              if (!isNaN(m) && m >= 0) {
                                setSheetConfig(prev => ({ ...prev, marginLeft: Math.min(m, 50) }));
                              }
                            }}
                            onBlur={() => {
                              const m = parseInt(marginLeftInput);
                              if (isNaN(m) || m < 0) {
                                setSheetConfig(prev => ({ ...prev, marginLeft: 0 }));
                                setMarginLeftInput("0");
                              } else if (m > 50) {
                                setSheetConfig(prev => ({ ...prev, marginLeft: 50 }));
                                setMarginLeftInput("50");
                              }
                            }}
                            className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Lề phải (mm)</label>
                          <input
                            id="margin-right-input"
                            type="text"
                            value={marginRightInput}
                            onChange={(e) => {
                              const s = e.target.value;
                              setMarginRightInput(s);
                              const m = parseInt(s);
                              if (!isNaN(m) && m >= 0) {
                                setSheetConfig(prev => ({ ...prev, marginRight: Math.min(m, 50) }));
                              }
                            }}
                            onBlur={() => {
                              const m = parseInt(marginRightInput);
                              if (isNaN(m) || m < 0) {
                                setSheetConfig(prev => ({ ...prev, marginRight: 0 }));
                                setMarginRightInput("0");
                              } else if (m > 50) {
                                setSheetConfig(prev => ({ ...prev, marginRight: 50 }));
                                setMarginRightInput("50");
                              }
                            }}
                            className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Lề trên (mm)</label>
                          <input
                            id="margin-top-input"
                            type="text"
                            value={marginTopInput}
                            onChange={(e) => {
                              const s = e.target.value;
                              setMarginTopInput(s);
                              const m = parseInt(s);
                              if (!isNaN(m) && m >= 0) {
                                setSheetConfig(prev => ({ ...prev, marginTop: Math.min(m, 50) }));
                              }
                            }}
                            onBlur={() => {
                              const m = parseInt(marginTopInput);
                              if (isNaN(m) || m < 0) {
                                setSheetConfig(prev => ({ ...prev, marginTop: 0 }));
                                setMarginTopInput("0");
                              } else if (m > 50) {
                                setSheetConfig(prev => ({ ...prev, marginTop: 50 }));
                                setMarginTopInput("50");
                              }
                            }}
                            className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Lề dưới (mm)</label>
                          <input
                            id="margin-bottom-input"
                            type="text"
                            value={marginBottomInput}
                            onChange={(e) => {
                              const s = e.target.value;
                              setMarginBottomInput(s);
                              const m = parseInt(s);
                              if (!isNaN(m) && m >= 0) {
                                setSheetConfig(prev => ({ ...prev, marginBottom: Math.min(m, 55) }));
                              }
                            }}
                            onBlur={() => {
                              const m = parseInt(marginBottomInput);
                              if (isNaN(m) || m < 0) {
                                setSheetConfig(prev => ({ ...prev, marginBottom: 0 }));
                                setMarginBottomInput("0");
                              } else if (m > 55) {
                                setSheetConfig(prev => ({ ...prev, marginBottom: 55 }));
                                setMarginBottomInput("55");
                              }
                            }}
                            className="w-full bg-white border border-gray-300 rounded-lg p-1.5 text-sm outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold"
                          />
                        </div>
                      </div>
                    </section>

                    {/* 5. KHE HỞ GIỮA CÁC Ô */}
                    <section className="space-y-3">
                      <h2 className="text-[12.5px] font-black text-[#475569] uppercase tracking-wider select-none">
                        Khoảng cách giữa các tem
                      </h2>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Khoảng cách cột (mm)</label>
                          <input
                            id="col-gap-office-input"
                            type="text"
                            value={colGapOfficeInput}
                            onChange={(e) => {
                              const s = e.target.value;
                              setColGapOfficeInput(s);
                              const g = parseInt(s);
                              if (!isNaN(g) && g >= 0) {
                                setSheetConfig(prev => ({ ...prev, colGap: Math.min(g, 20) }));
                              }
                            }}
                            onBlur={() => {
                              const g = parseInt(colGapOfficeInput);
                              if (isNaN(g) || g < 0) {
                                setSheetConfig(prev => ({ ...prev, colGap: 0 }));
                                setColGapOfficeInput("0");
                              } else if (g > 20) {
                                setSheetConfig(prev => ({ ...prev, colGap: 20 }));
                                setColGapOfficeInput("20");
                              }
                            }}
                            className="w-full bg-white border border-gray-300 rounded mb-1 text-sm p-1.5 outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11.5px] text-slate-500 font-bold mb-1">Khoảng cách hàng (mm)</label>
                          <input
                            id="row-gap-office-input"
                            type="text"
                            value={rowGapOfficeInput}
                            onChange={(e) => {
                              const s = e.target.value;
                              setRowGapOfficeInput(s);
                              const g = parseInt(s);
                              if (!isNaN(g) && g >= 0) {
                                setSheetConfig(prev => ({ ...prev, rowGap: Math.min(g, 20) }));
                              }
                            }}
                            onBlur={() => {
                              const g = parseInt(rowGapOfficeInput);
                              if (isNaN(g) || g < 0) {
                                setSheetConfig(prev => ({ ...prev, rowGap: 0 }));
                                setRowGapOfficeInput("0");
                              } else if (g > 20) {
                                setSheetConfig(prev => ({ ...prev, rowGap: 20 }));
                                setRowGapOfficeInput("20");
                              }
                            }}
                            className="w-full bg-white border border-gray-300 rounded mb-1 text-sm p-1.5 outline-none font-mono focus:border-kiot-cyan text-slate-800 font-bold"
                          />
                        </div>
                      </div>
                    </section>

                  </>
                ) : (
                  <div className="space-y-4">
                    {/* INFO BOX */}
                    <div className="p-3 bg-sky-50/50 border border-kiot-cyan/25 rounded-lg text-kiot-navy text-[12px] leading-relaxed shadow-xs">
                      <p className="font-bold text-kiot-navy flex items-center mb-1 text-[12.5px]">
                        <span className="mr-1.5 text-base">📠</span> Thiết lập khổ tem nhãn cuộn
                      </p>
                      <p className="text-[10.5px]">
                        Dùng cho máy in mã vạch chuyên dụng in cuộn chuyển nhiệt. Hỗ trợ chia cột tem tự do và khoảng trống gap đứt dòng.
                      </p>
                    </div>

                    {/* SET COLS */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] text-slate-900 font-black uppercase tracking-wider select-none">
                        Thiết lập số tem 1 hàng
                      </label>
                      <div className="relative">
                        <input
                          id="cols-roll-input"
                          type="text"
                          value={colsInput}
                          onChange={(e) => {
                            const s = e.target.value;
                            setColsInput(s);
                            const c = parseInt(s);
                            if (!isNaN(c) && c >= 1) {
                              setSheetConfig(prev => ({ ...prev, cols: Math.min(c, 20) }));
                            }
                          }}
                          onBlur={() => {
                            const c = parseInt(colsInput);
                            if (isNaN(c) || c < 1) {
                              setSheetConfig(prev => ({ ...prev, cols: 1 }));
                              setColsInput("1");
                            } else if (c > 20) {
                              setSheetConfig(prev => ({ ...prev, cols: 20 }));
                              setColsInput("20");
                            }
                          }}
                          className="w-full pl-2 pr-7 py-1.5 text-sm bg-white border border-gray-300 rounded-lg text-slate-800 font-bold font-mono focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan outline-none"
                          placeholder="Nhập số tem ví dụ: 1, 2, 3, 4..."
                        />
                        <span className="absolute right-2 top-2 text-[11px] text-gray-400 font-extrabold select-none">tem</span>
                      </div>
                    </div>

                    {/* SEPARATOR */}
                    <div className="border-t border-slate-900 my-3"></div>

                    {/* SET TARGET ROLL WIDTH */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider select-none flex justify-between items-center">
                        <span className="flex items-center gap-1">
                          Bề rộng cuộn tem (mm)
                          <InfoTooltip content="Tổng chiều rộng của cuộn giấy. Khi nhập số này, lề 2 bên sẽ tự động tính toán ngược lại." />
                        </span>
                        <span className="text-kiot-cyan select-none capitalize">Tính ngược lề</span>
                      </label>
                      <div className="relative">
                        <input
                          id="roll-width-input"
                          type="text"
                          value={desiredRollWidthInput}
                          onChange={(e) => {
                            const s = e.target.value;
                            setDesiredRollWidthInput(s);
                            const w = parseFloat(s);
                            if (!isNaN(w) && w >= 10) {
                              const val = Math.min(w, 500);
                              setDesiredRollWidth(val);
                              // Reverse calculation: Lề 2 bên = (Bề rộng cuộn - dán tem - khoảng hở) / 2
                              const colGaps = (sheetConfig.cols - 1) * (sheetConfig.colGap || 0);
                              let computedSideMargin = (val - (labelConfig.width * sheetConfig.cols) - colGaps) / 2;
                              computedSideMargin = Math.max(0, Math.round(computedSideMargin * 10) / 10);
                              setSheetConfig(prev => ({ ...prev, rollSideMargin: computedSideMargin }));
                            }
                          }}
                          onBlur={() => {
                            let w = parseFloat(desiredRollWidthInput);
                            if (isNaN(w) || w < 10) {
                              w = 10;
                            } else if (w > 500) {
                              w = 500;
                            }
                             setDesiredRollWidth(w);
                             setDesiredRollWidthInput(String(w));
                             const colGaps = (sheetConfig.cols - 1) * (sheetConfig.colGap || 0);
                             let computedSideMargin = (w - (labelConfig.width * sheetConfig.cols) - colGaps) / 2;
                             computedSideMargin = Math.max(0, Math.round(computedSideMargin * 10) / 10);
                             setSheetConfig(prev => ({ ...prev, rollSideMargin: computedSideMargin }));
                          }}
                          className="w-full pl-2 pr-7 py-1.5 text-sm bg-white border border-gray-300 rounded-lg text-slate-800 font-bold font-mono focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan outline-none"
                          placeholder="Ví dụ: 75, 110..."
                        />
                        <span className="absolute right-2 top-2 text-[11px] text-gray-400 font-extrabold select-none">mm</span>
                      </div>
                    </div>

                    {/* SET ROLL SIDE MARGIN */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider select-none flex items-center gap-1">
                        <span>Lề 2 bên (mm)</span>
                        <InfoTooltip content="Khoảng trống lề từ hai viền mép ngoài của phôi cuộn giấy đến viền ngoài của tem dán." />
                      </label>
                      <div className="relative">
                        <input
                          id="roll-side-margin-input"
                          type="text"
                          value={rollSideMarginInput}
                          onChange={(e) => {
                            const s = e.target.value;
                            setRollSideMarginInput(s);
                            const m = parseFloat(s);
                            if (!isNaN(m) && m >= 0) {
                              setSheetConfig(prev => ({ ...prev, rollSideMargin: Math.min(m, 50) }));
                            }
                          }}
                          onBlur={() => {
                            const m = parseFloat(rollSideMarginInput);
                            if (isNaN(m) || m < 0) {
                              setSheetConfig(prev => ({ ...prev, rollSideMargin: 0 }));
                              setRollSideMarginInput("0");
                            } else if (m > 50) {
                              setSheetConfig(prev => ({ ...prev, rollSideMargin: 50 }));
                              setRollSideMarginInput("50");
                            } else {
                              const rounded = Math.round(m * 10) / 10;
                              setSheetConfig(prev => ({ ...prev, rollSideMargin: rounded }));
                              setRollSideMarginInput(String(rounded));
                            }
                          }}
                          className="w-full pl-2 pr-7 py-1.5 text-sm bg-white border border-gray-300 rounded-lg text-slate-800 font-bold font-mono focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan outline-none"
                          placeholder="Ví dụ: 1.5, 2, 5..."
                        />
                        <span className="absolute right-2 top-2 text-[11px] text-gray-400 font-extrabold select-none">mm</span>
                      </div>


                      {/* WARNING BADGE IF ROLL WIDTH IS SMALLER THAN LABELS */}
                      {(() => {
                        const colCount = sheetConfig.cols || 1;
                        const actualGaps = (colCount - 1) * (sheetConfig.colGap || 0);
                        const totalLabelWidth = Math.round((colCount * labelConfig.width + actualGaps) * 10) / 10;
                        if (sheetConfig.mode === "thermal" && desiredRollWidth < totalLabelWidth) {
                          return (
                            <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] leading-relaxed">
                              <p className="flex items-center text-amber-955 font-black mb-1 select-none">
                                <span className="mr-1.5 text-xs text-amber-600">⚠️</span> Cảnh báo kích thước
                              </p>
                              <span>
                                Bề rộng cuộn tem (<strong>{desiredRollWidth}mm</strong>) đang nhỏ hơn tổng chiều rộng hàng tem dán (<strong>{totalLabelWidth}mm</strong>).
                                Vui lòng điều chỉnh lại bề rộng cuộn tem lớn hơn!
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>



                    {/* SET COL GAP */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider select-none flex items-center gap-1">
                        <span>Khoảng cách giữa các tem 1 hàng</span>
                        <InfoTooltip content="Khoảng hở ngang giữa các tem cạnh nhau trên cùng một dòng." />
                      </label>
                      <div className="flex border border-gray-300 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-kiot-cyan focus-within:ring-offset-0 focus-within:border-kiot-cyan">
                        <input
                          id="col-gap-input"
                          type="text"
                          value={colGapInput}
                          onChange={(e) => {
                            const valStr = e.target.value;
                            setColGapInput(valStr);
                            const valNum = parseFloat(valStr) || 0;
                            const valMm = colGapUnit === 'inch' ? valNum * 25.4 : valNum;
                            setSheetConfig(prev => ({ ...prev, colGap: valMm }));
                          }}
                          onBlur={() => {
                            if (!colGapInput.trim()) {
                              setColGapInput("0");
                              setSheetConfig(prev => ({ ...prev, colGap: 0 }));
                            }
                          }}
                          className="flex-1 pl-2 pr-2 py-1.5 text-sm font-bold font-mono text-slate-800 bg-white outline-none"
                          placeholder="0.0"
                        />
                        <select
                          value={colGapUnit}
                          onChange={(e) => {
                            const newUnit = e.target.value as 'mm' | 'inch';
                            setColGapUnit(newUnit);
                            const val = sheetConfig.colGap || 0;
                            if (newUnit === 'inch') {
                              setColGapInput(String(parseFloat((val / 25.4).toFixed(4))));
                            } else {
                              setColGapInput(String(val));
                            }
                          }}
                          className="bg-gray-50 border-l border-gray-300 px-2.5 py-1.5 text-xs font-extrabold outline-none text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          <option value="mm">mm</option>
                          <option value="inch">inch</option>
                        </select>
                      </div>

                    </div>

                    {/* NÚT TỐI ƯU HÓA HOÀN HẢO CHO IN NHÃN CUỘN */}
                    <button
                      type="button"
                      onClick={() => {
                        const colGaps = (sheetConfig.cols - 1) * sheetConfig.colGap;
                        const sideMargin = sheetConfig.rollSideMargin !== undefined ? sheetConfig.rollSideMargin : 1;
                        const optW = (desiredRollWidth - colGaps - (sideMargin * 2)) / sheetConfig.cols;
                        
                        applyPresetDimensions(
                          Math.max(10, Math.floor(optW * 10) / 10),
                          labelConfig.height,
                          `Khớp Cuộn ${sheetConfig.cols} Tem`
                        );
                      }}
                      className="w-full py-1.5 bg-kiot-cyan hover:bg-sky-600 text-white rounded text-[11px] font-bold text-center select-none cursor-pointer transition border border-kiot-cyan flex items-center justify-center space-x-1 shadow-xs font-sans"
                      title="Tính toán kích thước Chiều rộng của tem nhãn dán tối ưu nhất dựa theo số cột tem và khoảng cách để khít với cuộn decal."
                    >
                      ⚡ <span>Khớp vừa khổ giấy</span>
                    </button>
                  </div>
                )}
                    </div>
                  )}
                </div>

                {/* [Advanced] AI Template Recognition Accordion (cần Internet: ẩn ở bản desktop offline) */}
                <div className={desktop ? "hidden" : "space-y-1.5 animate-fadeIn"}>
                  <button
                    type="button"
                    onClick={() => setIsAiRecognizerExpanded(!isAiRecognizerExpanded)}
                    className={`w-full px-4 py-3 flex items-center justify-between cursor-pointer select-none group rounded-xl border transition-all duration-150 outline-none transform active:scale-[0.98] ${
                      isAiRecognizerExpanded
                        ? "bg-orange-100 text-orange-950 border-orange-300 shadow-sm"
                        : "bg-orange-50/90 text-orange-900 border-orange-200 hover:bg-orange-100/60 hover:border-orange-300 shadow-3xs"
                    }`}
                    title="Nhận diện mẫu tem thông minh bằng AI từ ảnh chụp hoặc sao chép"
                  >
                    <div className="flex items-center space-x-2.5 font-sans">
                      <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] tracking-wide shrink-0 transition-colors border flex items-center space-x-1 ${
                        isAiRecognizerExpanded ? "bg-orange-600 text-white border-orange-700" : "bg-orange-100 text-orange-800 border-orange-200"
                      }`}>
                        <Sparkles className="w-3 h-3" />
                        <span>NÂNG CAO</span>
                      </span>
                      <span className={`font-extrabold text-[12.5px] uppercase tracking-wider transition-colors leading-none ${
                        isAiRecognizerExpanded ? "text-orange-955" : "text-orange-900 group-hover:text-orange-955"
                      }`}>
                        Nhận diện mẫu tem AI
                      </span>
                    </div>
                    <div className={`transition-transform duration-150 ${isAiRecognizerExpanded ? "rotate-180 text-orange-600" : "text-orange-500 group-hover:text-orange-600"}`}>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isAiRecognizerExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-4 shadow-3xs">
                          {/* Compact secure config frame */}
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                                <Key className="w-3.5 h-3.5 text-orange-600" />
                                <span>Cấu hình Gemini API Key</span>
                              </span>
                              <span className="text-[10px] text-orange-500 font-bold">Tự động lưu</span>
                            </div>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <input
                                  type={showCustomApiKey ? "text" : "password"}
                                  value={userCustomApiKey}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setUserCustomApiKey(val);
                                    if (val.trim()) {
                                      safeLocalStorage.setItem("barcode_designer_gemini_key", val.trim());
                                    } else {
                                      safeLocalStorage.removeItem("barcode_designer_gemini_key");
                                    }
                                  }}
                                  placeholder="Dán API Key của bạn tại đây để dùng hạn ngạch riêng..."
                                  className="w-full pl-2 pr-8 py-1.5 text-xs bg-white border border-gray-300 rounded-md text-slate-800 font-medium font-mono focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowCustomApiKey(!showCustomApiKey)}
                                  className="absolute right-2 top-2.5 text-gray-400 hover:text-slate-600 cursor-pointer"
                                  title={showCustomApiKey ? "Ẩn Key" : "Hiển thị Key"}
                                >
                                  {showCustomApiKey ? (
                                    <EyeOff className="w-3.5 h-3.5" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (userCustomApiKey.trim()) {
                                    safeLocalStorage.setItem("barcode_designer_gemini_key", userCustomApiKey.trim());
                                    alert("✓ Đã xác nhận lưu Gemini API Key cá nhân của bạn!");
                                  } else {
                                    safeLocalStorage.removeItem("barcode_designer_gemini_key");
                                    alert("✓ Đã xóa API Key cá nhân. Hệ thống sẽ sử dụng API của ứng dụng.");
                                  }
                                }}
                                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-[11px] font-extrabold select-none cursor-pointer transition border border-orange-600 shadow-sm shrink-0"
                              >
                                Lưu Key
                              </button>
                            </div>

                            {/* Hướng dẫn cách lấy API Key chi tiết theo yêu cầu của người dùng */}
                            <div className="bg-orange-50/70 border border-orange-100 rounded-lg p-2.5 space-y-1.5 text-[10px] text-orange-950 font-medium">
                              <p className="font-extrabold text-[10.5px] text-orange-850 flex items-center gap-1">
                                🔑 Hướng dẫn cách lấy API Key:
                              </p>
                              <ol className="list-decimal pl-3.5 space-y-1 leading-relaxed text-orange-900">
                                <li>
                                  Truy cập website Google AI Studio:{" "}
                                  <a 
                                    href="https://aistudio.google.com/app/apikey" 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-orange-700 underline font-black hover:text-orange-850 inline-flex items-center gap-0.5"
                                  >
                                    aistudio.google.com <ExternalLink className="w-2.5 h-2.5 inline" />
                                  </a>
                                </li>
                                <li>Đăng nhập bằng <strong>tài khoản Google</strong> của bạn.</li>
                                <li>Click nút <strong className="bg-orange-100 px-1 py-0.5 rounded text-orange-950">"Create API Key"</strong> (Tạo khóa API mới).</li>
                                <li>Chọn một Google Cloud Project bất kỳ rồi bấm <strong className="bg-orange-100 px-1 py-0.5 rounded text-orange-950">"Create API key in existing project"</strong>.</li>
                                <li>Sao chép chuỗi mã (bắt đầu bằng <code className="bg-slate-100 text-slate-800 px-1 font-mono text-[9px] rounded">AIzaSy...</code>) và dán vào ô bên trên.</li>
                              </ol>
                              <p className="text-[9.5px] text-slate-500 font-bold leading-normal pt-1 border-t border-orange-100/60">
                                💡 <strong>Mẹo cực hay:</strong> Hệ thống tự động lưu Key của bạn vào trình duyệt ngay khi bạn dán/gõ. Hãy mở tab mới nếu đang chạy trong khung AI Studio để tránh các giới hạn bảo mật!
                              </p>
                            </div>
                          </div>

                          {/* Elegant Drag-and-Drop / Input Options */}
                          <div className="space-y-3">
                            {/* Hàng trên: 2 Lựa chọn cực kỳ đơn giản */}
                            <div className="space-y-2 text-[11px] text-slate-600 font-bold">
                              {/* Dòng 1: Tải tệp ảnh từ máy tính */}
                              <div className="flex items-center justify-between gap-3 bg-slate-50/50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                  Tải tệp ảnh từ máy tính:
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const input = document.createElement("input");
                                    input.type = "file";
                                    input.accept = "image/*";
                                    input.onchange = (ev: any) => {
                                      const file = ev.target.files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                          if (event.target?.result) {
                                            setAiImage(event.target.result as string);
                                            setShowSuccessBadge(true);
                                            setTimeout(() => setShowSuccessBadge(false), 3500);
                                          }
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    };
                                    input.click();
                                  }}
                                  className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-[10px] font-black select-none cursor-pointer transition border border-orange-600 shadow-3xs flex items-center gap-1 shrink-0"
                                >
                                  <CloudUpload className="w-3 h-3" />
                                  <span>Chọn tệp ảnh</span>
                                </button>
                              </div>

                              {/* Dòng 2: Chèn URL ảnh */}
                              <div className="flex items-center justify-between gap-3 bg-slate-50/50 px-2.5 py-1.5 rounded-lg border border-slate-100 overflow-hidden">
                                <span className="flex items-center gap-1.5 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                  Chèn URL ảnh:
                                </span>
                                <div className="flex items-center gap-1 flex-1 max-w-[180px] sm:max-w-[220px] overflow-hidden">
                                  <input
                                    type="text"
                                    placeholder="Dán link ảnh tại đây..."
                                    value={aiImageUrlInput}
                                    onChange={(e) => setAiImageUrlInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && aiImageUrlInput.trim()) {
                                        setAiImage(aiImageUrlInput.trim());
                                        setShowSuccessBadge(true);
                                        setTimeout(() => setShowSuccessBadge(false), 3500);
                                      }
                                    }}
                                    className="w-full px-2 py-1 text-[10px] font-semibold text-slate-800 bg-white border border-slate-200 rounded-md outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-550 placeholder-slate-400 truncate"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (aiImageUrlInput.trim()) {
                                        setAiImage(aiImageUrlInput.trim());
                                        setShowSuccessBadge(true);
                                        setTimeout(() => setShowSuccessBadge(false), 3500);
                                      }
                                    }}
                                    className="px-2 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-md text-[9px] font-black transition select-none cursor-pointer shrink-0"
                                  >
                                    Lưu
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Vùng kéo thả & Nhận diện Paste trực tiếp khi rê chuột */}
                            <div
                              ref={dropzoneRef}
                              tabIndex={0}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setIsHoveringDropzone(true);
                              }}
                              onDragLeave={() => {
                                setIsHoveringDropzone(false);
                              }}
                              onMouseEnter={() => {
                                setIsHoveringDropzone(true);
                                window.focus(); // Shift browser focus to this iframe immediately
                                dropzoneRef.current?.focus(); // Focus this element to capture Paste event
                              }}
                              onMouseLeave={() => {
                                setIsHoveringDropzone(false);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                setIsHoveringDropzone(false);
                                
                                // 1. Try to read from files
                                const files = e.dataTransfer.files;
                                if (files && files[0]) {
                                  const file = files[0];
                                  if (file.type.startsWith("image/")) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      if (event.target?.result) {
                                        setAiImage(event.target.result as string);
                                        setShowSuccessBadge(true);
                                        setTimeout(() => setShowSuccessBadge(false), 3500);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                    return;
                                  }
                                }

                                // 2. Try to read from items
                                const items = e.dataTransfer.items;
                                if (items) {
                                  for (let i = 0; i < items.length; i++) {
                                    if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                                      const file = items[i].getAsFile();
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                          if (event.target?.result) {
                                            setAiImage(event.target.result as string);
                                            setShowSuccessBadge(true);
                                            setTimeout(() => setShowSuccessBadge(false), 3500);
                                          }
                                        };
                                        reader.readAsDataURL(file);
                                        return;
                                      }
                                    }
                                  }
                                }

                                // 3. Try URLs
                                const imageUrl = e.dataTransfer.getData("text/html");
                                if (imageUrl) {
                                  const match = imageUrl.match(/src="([^"]+)"/);
                                  if (match && match[1]) {
                                    setAiImage(match[1]);
                                    setShowSuccessBadge(true);
                                    setTimeout(() => setShowSuccessBadge(false), 3500);
                                    return;
                                  }
                                }
                                
                                const textUrl = e.dataTransfer.getData("text/plain");
                                if (textUrl && (textUrl.startsWith("http://") || textUrl.startsWith("https://") || textUrl.startsWith("data:image/"))) {
                                  setAiImage(textUrl);
                                  setShowSuccessBadge(true);
                                  setTimeout(() => setShowSuccessBadge(false), 3500);
                                  return;
                                }
                              }}
                              onPaste={(e) => {
                                const items = e.clipboardData?.items;
                                if (!items) return;
                                for (let i = 0; i < items.length; i++) {
                                  if (items[i].type.indexOf("image") !== -1) {
                                    const file = items[i].getAsFile();
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (event) => {
                                        if (event.target?.result) {
                                          setAiImage(event.target.result as string);
                                          setShowSuccessBadge(true);
                                          setTimeout(() => setShowSuccessBadge(false), 3500);
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                      e.preventDefault();
                                      e.stopPropagation();
                                      break;
                                    }
                                  }
                                }
                              }}
                              onClick={() => {
                                dropzoneRef.current?.focus();
                              }}
                              className={`relative border border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer h-[130px] transition-all duration-150 outline-none select-none overflow-hidden ${
                                isHoveringDropzone
                                  ? "border-orange-500 bg-orange-50/50 ring-1 ring-orange-500/20"
                                  : "border-slate-200 hover:border-orange-400 hover:bg-slate-50/5"
                              }`}
                            >
                              {showSuccessBadge && (
                                <div className="absolute top-2 right-2 bg-emerald-500 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-full flex items-center space-x-1 shadow-sm animate-bounce z-10">
                                  <span>✓ Đã tải ảnh mẫu tem!</span>
                                </div>
                              )}

                              {aiImage ? (
                                <div className="relative w-full h-full p-2 flex items-center justify-center group/img">
                                  <img
                                    src={aiImage}
                                    alt="Label preview"
                                    className="max-h-[110px] max-w-full object-contain rounded-md border border-slate-100"
                                    referrerPolicy="no-referrer"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAiImage(null);
                                    }}
                                    className="absolute top-1.5 right-1.5 p-1 bg-rose-600 text-white rounded-full hover:bg-rose-700 shadow-md transition transform scale-90 opacity-0 group-hover/img:opacity-100 group-hover/img:scale-100 cursor-pointer z-20"
                                    title="Xóa ảnh"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                  <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-xs text-white text-[8px] font-black px-2 py-0.5 rounded-full select-none shadow-sm pointer-events-none opacity-80 whitespace-nowrap">
                                    Thả hoặc Ctrl + V để thay đổi
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center select-none w-full flex flex-col items-center justify-center space-y-1">
                                  <CloudUpload className={`w-6 h-6 transition-colors ${isHoveringDropzone ? 'text-orange-600 animate-pulse' : 'text-slate-400'}`} />
                                  <p className={`font-black text-xs transition-colors ${isHoveringDropzone ? 'text-orange-600' : 'text-slate-600'}`}>
                                    {isHoveringDropzone ? "Sẵn sàng dán! Ấn Ctrl + V" : "Kéo thả hoặc Dán ảnh (Ctrl + V)"}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action and status updates */}
                          <div className="space-y-2.5">
                            {isAiAnalyzing && (
                              <div className="p-3 bg-orange-50/60 border border-orange-200 rounded-lg flex items-start space-x-2.5 animate-pulse shadow-3xs">
                                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                                  <RefreshCw className="w-4 h-4 text-orange-600 animate-spin" />
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <p className="font-black text-orange-950 text-xs">AI Gemini đang bóc tách mẫu tem...</p>
                                  <p className="text-[10.5px] text-orange-700 font-medium leading-relaxed truncate mt-0.5">
                                    {aiStatusMessage || "Đang kết nối tới máy chủ..."}
                                  </p>
                                </div>
                              </div>
                            )}

                            <button
                              type="button"
                              disabled={!aiImage || isAiAnalyzing}
                              onClick={async () => {
                                if (!aiImage) return;
                                setIsAiAnalyzing(true);
                                setAiStatusMessage("Khởi chạy trợ lý AI Gemini 3.5 Flash...");
                                
                                try {
                                  setAiStatusMessage("Đang tối ưu dung lượng ảnh để phân tích siêu tốc...");
                                  const optimizedImg = await resizeImage(aiImage, 1024);
                                  
                                  // Step-by-step progress simulation to keep user engaged
                                  const progressSteps = [
                                    "Đang nén và truyền ảnh nhãn siêu nhẹ (~100KB)...",
                                    "Đang kết nối API Gemini 3.5 Flash...",
                                    "Gemini đang nhận diện các đối tượng (Text, Barcode, QR, Hình kẻ)...",
                                    "Chuẩn hóa tọa độ dựa trên kích thước thật " + labelConfig.width + "x" + labelConfig.height + "mm...",
                                    "Kiểm thử lề căn chỉnh và tối ưu hóa vị trí..."
                                  ];
                                  
                                  let stepIdx = 0;
                                  const progressInterval = setInterval(() => {
                                    if (stepIdx < progressSteps.length) {
                                      setAiStatusMessage(progressSteps[stepIdx]);
                                      stepIdx++;
                                    }
                                  }, 950);

                                  let result;
                                  const trimmedUserApiKey = userCustomApiKey.trim();

                                  if (trimmedUserApiKey) {
                                    // If user has supplied their own API key, bypass server/proxy and call Gemini REST API directly in-browser
                                    // This guarantees success on platforms like Vercel which lack server-side handlers
                                    setAiStatusMessage("Đang gọi trực tiếp API Gemini từ trình duyệt...");
                                    try {
                                      result = await callGeminiClientSide(
                                        optimizedImg,
                                        labelConfig.width,
                                        labelConfig.height,
                                        trimmedUserApiKey
                                      );
                                    } catch (directErr: any) {
                                      console.error("Direct API call failed, trying server-side proxy as fallback...", directErr);
                                      // Fallback to server call just in case
                                      const response = await fetch("/api/gemini/analyze-label", {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json"
                                        },
                                        body: JSON.stringify({
                                          image: optimizedImg,
                                          width: labelConfig.width,
                                          height: labelConfig.height,
                                          userApiKey: trimmedUserApiKey
                                        })
                                      });
                                      if (!response.ok) {
                                        const errData = await response.json().catch(() => ({}));
                                        throw new Error(errData.error || errData.message || `Lỗi máy chủ (${response.status}): ${directErr.message || directErr}`);
                                      }
                                      result = await response.json();
                                    }
                                  } else {
                                    // No custom API key provided, call server-side proxy
                                    const response = await fetch("/api/gemini/analyze-label", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json"
                                      },
                                      body: JSON.stringify({
                                        image: optimizedImg,
                                        width: labelConfig.width,
                                        height: labelConfig.height
                                      })
                                    });

                                    if (!response.ok) {
                                      const errData = await response.json().catch(() => ({}));
                                      if (response.status === 404) {
                                        throw new Error("Để sử dụng tính năng phân tích tem bằng AI trên phiên bản Web (Vercel), vui lòng cấu hình API Key cá nhân của bạn trong phần 'Cấu hình Gemini API Key' ở thanh bên trái.");
                                      }
                                      throw new Error(errData.error || errData.message || `Lỗi máy chủ: ${response.status}`);
                                    }
                                    result = await response.json();
                                  }

                                  clearInterval(progressInterval);
                                  
                                  if (!result.objects || !Array.isArray(result.objects)) {
                                    throw new Error("Không nhận được danh sách đối tượng hợp lệ từ AI.");
                                  }

                                  if (result.objects.length === 0) {
                                    throw new Error("Gemini không phát hiện được bất kỳ phần tử nào trên ảnh mẫu nhãn này.");
                                  }

                                  // Map results to type-safe LabelObjects
                                  const mappedObjects = result.objects.map((obj: any, idx: number) => {
                                    const id = `ai-obj-${Date.now()}-${idx}`;
                                    // Ensure center coordinates are safely numbers
                                    const x = typeof obj.x === 'number' ? obj.x : parseFloat(obj.x) || 0;
                                    const y = typeof obj.y === 'number' ? obj.y : parseFloat(obj.y) || 0;
                                    
                                    // Map raw elements to our schema
                                    const mapped: any = {
                                      id,
                                      type: obj.type,
                                      x,
                                      y,
                                      width: typeof obj.width === 'number' ? obj.width : parseFloat(obj.width) || 15,
                                      height: typeof obj.height === 'number' ? obj.height : parseFloat(obj.height) || 10,
                                      content: obj.content || "",
                                    };

                                    if (obj.type === 'text') {
                                      mapped.fontSize = typeof obj.fontSize === 'number' ? obj.fontSize : parseInt(obj.fontSize) || 10;
                                      mapped.fontWeight = obj.fontWeight || 'normal';
                                      mapped.textAlign = obj.textAlign || 'center';
                                      mapped.textFlowOrigin = obj.textFlowOrigin || 'center';
                                      mapped.fontFamily = 'Inter';
                                      mapped.color = '#000000';
                                    } else if (obj.type === 'barcode') {
                                      mapped.barcodeFormat = obj.barcodeFormat || 'CODE128';
                                      mapped.displayValue = obj.displayValue !== undefined ? !!obj.displayValue : true;
                                      mapped.barcodeWidth = typeof obj.barcodeWidth === 'number' ? obj.barcodeWidth : parseFloat(obj.barcodeWidth) || 1.5;
                                      mapped.barcodeHeight = typeof obj.barcodeHeight === 'number' ? obj.barcodeHeight : parseFloat(obj.barcodeHeight) || 10;
                                      mapped.color = '#000000';
                                      mapped.barcodeTextColor = '#000000';
                                    } else if (obj.type === 'qrcode') {
                                      mapped.qrErrorCorrection = 'M';
                                      mapped.color = '#000000';
                                    } else if (obj.type === 'shape') {
                                      mapped.shapeType = obj.shapeType || 'rect';
                                      mapped.shapeStrokeWidth = typeof obj.shapeStrokeWidth === 'number' ? obj.shapeStrokeWidth : parseInt(obj.shapeStrokeWidth) || 1;
                                      mapped.shapeStrokeColor = '#000000';
                                      mapped.shapeStrokeStyle = obj.shapeStrokeStyle || 'solid';
                                      mapped.shapeFillColor = 'transparent';
                                    }

                                    return mapped;
                                  });

                                  setObjectsWithHistory(mappedObjects);
                                  alert(`✓ Nhận diện thành công!\n\nAI Gemini đã phân tích ảnh nhãn và khôi phục thành công ${mappedObjects.length} đối tượng thiết kế trực tiếp lên bàn thiết kế.\n\nHệ thống sẽ tự động chuyển sang tab THIẾT KẾ TEM để bạn chỉnh sửa chi tiết!`);
                                  
                                  // Smooth transition to design tab
                                  setActiveSidebarTab('design');
                                  setIsStep3Expanded(true);

                                } catch (error: any) {
                                  console.error("AI Analysis error:", error);
                                  const errMsg = String(error.message || error);
                                  let friendlyMessage = errMsg;
                                  const isUsingCustomKey = !!userCustomApiKey.trim();
                                  
                                  if (errMsg.includes("prepayment credits") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429")) {
                                    if (isUsingCustomKey) {
                                      friendlyMessage = "API Key cá nhân của bạn hiện đã hết hạn ngạch miễn phí hoặc thiếu số dư (prepayment credits).\n\n💡 CÁCH KHẮC PHỤC:\n- Hãy tạo một API Key mới bằng tài khoản Google khác vẫn còn nguyên hạn ngạch.\n- Hoặc kiểm tra lại thiết lập thanh toán (billing) trên Google Cloud Console của tài khoản đó.";
                                    } else {
                                      friendlyMessage = "Hạn ngạch của máy chủ hệ thống tạm thời hết tài khoản trả trước (prepayment credits).\n\n💡 CÁCH KHẮC PHỤC RẤT DỄ DÀNG:\nBạn chỉ cần tự nhập API Key Gemini cá nhân (hoàn toàn miễn phí, tạo trong 30 giây) vào mục 'Cấu hình API Key' ở phía dưới để được phân tích mẫu nhãn hoàn toàn không giới hạn và siêu nhanh nhé!";
                                    }
                                  } else if (errMsg.includes("UNAVAILABLE") || errMsg.includes("high demand") || errMsg.includes("503")) {
                                    friendlyMessage = "Máy chủ Gemini của Google hiện đang quá tải tạm thời (High demand/Unavailable).\n\n💡 CÁCH KHẮC PHỤC:\n- Vui lòng bấm lại nút 'Bắt đầu Phân tích' sau vài giây.\n- Hoặc tự nhập API Key cá nhân của bạn ở phía dưới để được tối ưu hóa băng thông riêng!";
                                  } else if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("invalid") || errMsg.includes("not valid") || errMsg.includes("API key not found")) {
                                    if (isUsingCustomKey) {
                                      friendlyMessage = "API Key cá nhân bạn vừa nhập KHÔNG HỢP LỆ hoặc đã bị Google khóa/thu hồi.\n\n💡 CÁCH KHẮC PHỤC:\n- Hãy kiểm tra xem bạn đã sao chép đủ và chính xác chuỗi API Key chưa.\n- Hoặc click vào liên kết dưới 'Hướng dẫn cách lấy API Key' để tạo một khóa mới hoàn toàn.";
                                    }
                                  }
                                  alert(`⚠️ Lỗi phân tích mẫu nhãn:\n\n${friendlyMessage}`);
                                } finally {
                                  setIsAiAnalyzing(false);
                                }
                              }}
                              className={`w-full py-3 rounded-xl font-extrabold text-sm text-center select-none cursor-pointer transition border flex items-center justify-center space-x-2 shadow-md outline-none ${
                                !aiImage || isAiAnalyzing
                                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                  : "bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white border-orange-600 transform active:scale-[0.99]"
                              }`}
                            >
                              <Sparkles className={`w-4 h-4 ${isAiAnalyzing ? "animate-pulse" : ""}`} />
                              <span>⚡ Bắt đầu Phân tích mẫu tem AI</span>
                            </button>
                          </div>

                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              </div>
            )}

            {/* TAB 2: DESIGN & CONFIGURATION */}
            {activeSidebarTab === 'design' && (
              <>
                <div className="relative">
                  {officePreviewMode === 'sheet' && (
                    <div className="absolute -inset-1.5 bg-slate-50/75 backdrop-blur-[1px] z-30 rounded-xl cursor-not-allowed flex flex-col items-center justify-center p-4 border border-amber-200/60 shadow-md animate-fadeIn select-none">
                      <div className="bg-amber-100 text-amber-800 p-2.5 rounded-full border border-amber-200/65 shadow-xs mb-2">
                        <Lock className="w-4 h-4 text-amber-600" />
                      </div>
                      <p className="font-extrabold text-[11px] text-amber-950 uppercase tracking-widest text-center">Bàn thiết kế tạm khóa</p>
                      <p className="text-[10px] text-amber-900 text-center max-w-[210px] mt-1.5 font-medium leading-relaxed">
                        Vui lòng chuyển sang chế độ <strong>"Bàn Thiết Kế (1 Tem)"</strong> phía trên để chỉnh sửa nội dung hoặc thêm đối tượng mới!
                      </p>
                    </div>
                  )}

                  {/* BƯỚC 3 ACCORDION */}
                  <div className="space-y-1.5 animate-fadeIn mb-4">
                    <button
                      type="button"
                      onClick={() => setIsStep3Expanded(!isStep3Expanded)}
                      className={`w-full px-4 py-3 flex items-center justify-between cursor-pointer select-none group rounded-xl border transition-all duration-150 outline-none transform active:scale-[0.98] ${
                        isStep3Expanded
                          ? "bg-emerald-100 text-emerald-950 border-emerald-300 shadow-sm"
                          : "bg-emerald-50/90 text-emerald-900 border-emerald-200 hover:bg-emerald-100/60 hover:border-emerald-300 shadow-3xs"
                      }`}
                      title="Cấu hình nội dung thiết kế, thêm văn bản, mã vạch, QR, ảnh nền, watermark"
                    >
                      <div className="flex items-center space-x-2.5 font-sans">
                        <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] tracking-wide shrink-0 transition-colors border ${
                          isStep3Expanded ? "bg-emerald-600 text-white border-emerald-700" : "bg-emerald-100 text-emerald-800 border-emerald-200"
                        }`}>
                          BƯỚC 3
                        </span>
                        <span className={`font-extrabold text-[12.5px] uppercase tracking-wider transition-colors leading-none ${
                          isStep3Expanded ? "text-emerald-950" : "text-emerald-900 group-hover:text-emerald-950"
                        }`}>
                          Thiết kế mẫu tem
                        </span>
                      </div>
                      <div className={`transition-transform duration-150 ${isStep3Expanded ? "rotate-180 text-emerald-650" : "text-emerald-500 group-hover:text-emerald-600"}`}>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </button>

                    {isStep3Expanded && (
                      <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-4 shadow-3xs">
                        {/* MODULE 2: DESIGN TOOLBOX (Add text, barcode, and QR code) */}
                        <section className="border-b border-gray-150 pt-5 pb-4 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <h2 className="text-[12.5px] font-black text-kiot-navy uppercase tracking-wider flex items-center space-x-2 select-none">
                              <Plus className="w-3.5 h-3.5 text-kiot-cyan" />
                              <span>Thêm thông tin vào tem</span>
                            </h2>
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            <button
                              onClick={() => handleAddObject("text")}
                              className="group py-2 px-3.5 bg-white hover:bg-slate-50 border border-gray-200 hover:border-kiot-cyan text-kiot-charcoal hover:text-kiot-cyan text-[13px] font-extrabold rounded-lg transition duration-150 flex items-center justify-between cursor-pointer shadow-xs focus:ring-1 focus:ring-kiot-cyan focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400"
                              title="Thêm một đoạn dòng văn bản mới ở giữa nhãn"
                            >
                              <span className="flex items-center space-x-2">
                                 <FileText className="w-4 h-4 text-kiot-cyan" />
                                 <span>Văn bản</span>
                              </span>
                              <span className="p-0.5 rounded-full bg-sky-50 text-kiot-cyan border border-kiot-cyan/30 group-hover:bg-kiot-cyan group-hover:text-white transition-colors duration-150 shadow-2xs">
                                 <Plus className="w-3.5 h-3.5" strokeWidth={3.5} />
                              </span>
                            </button>

                            <button
                              onClick={() => handleAddObject("barcode")}
                              className="group py-2 px-3.5 bg-white hover:bg-slate-50 border border-gray-200 hover:border-kiot-cyan text-kiot-charcoal hover:text-kiot-cyan text-[13px] font-extrabold rounded-lg transition duration-150 flex items-center justify-between cursor-pointer shadow-xs focus:ring-1 focus:ring-kiot-cyan focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400"
                              title="Thêm một hình vẽ mã vạch chuẩn 1D ở giữa nhãn"
                            >
                              <span className="flex items-center space-x-2">
                                <Barcode className="w-4 h-4 text-emerald-500" />
                                <span>Mã vạch</span>
                              </span>
                              <span className="p-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-500/30 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-150 shadow-2xs">
                                <Plus className="w-3.5 h-3.5" strokeWidth={3.5} />
                              </span>
                            </button>

                            <button
                              onClick={() => handleAddObject("qrcode")}
                              className="group py-2 px-3.5 bg-white hover:bg-slate-50 border border-gray-200 hover:border-kiot-cyan text-kiot-charcoal hover:text-kiot-cyan text-[13px] font-extrabold rounded-lg transition duration-150 flex items-center justify-between cursor-pointer shadow-xs focus:ring-1 focus:ring-kiot-cyan focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400"
                              title="Thêm một hình vẽ mã QR code ở giữa nhãn"
                            >
                              <span className="flex items-center space-x-2">
                                <QrCode className="w-4 h-4 text-blue-500" />
                                <span>Mã QR</span>
                              </span>
                              <span className="p-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-500/30 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-150 shadow-2xs">
                                <Plus className="w-3.5 h-3.5" strokeWidth={3.5} />
                              </span>
                            </button>

                            <button
                              onClick={() => setShowImageImportModal(true)}
                              className="group py-2 px-3.5 bg-white hover:bg-slate-50 border border-gray-200 hover:border-kiot-cyan text-kiot-charcoal hover:text-kiot-cyan text-[13px] font-extrabold rounded-lg transition duration-150 flex items-center justify-between cursor-pointer shadow-xs focus:ring-1 focus:ring-kiot-cyan focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400"
                              title="Chèn logo, con dấu hoặc hình ảnh bất kỳ vào nhãn"
                            >
                              <span className="flex items-center space-x-2">
                                <Image className="w-4 h-4 text-rose-500" />
                                <span>Hình ảnh</span>
                              </span>
                              <span className="p-0.5 rounded-full bg-rose-50 text-rose-650 border border-rose-500/30 group-hover:bg-rose-500 group-hover:text-white transition-colors duration-150 shadow-2xs">
                                <Plus className="w-3.5 h-3.5" strokeWidth={3.5} />
                              </span>
                            </button>

                            <button
                              onClick={() => handleAddObject("shape", "line")}
                              className="group py-2 px-3.5 bg-white hover:bg-slate-50 border border-gray-200 hover:border-kiot-cyan text-kiot-charcoal hover:text-kiot-cyan text-[13px] font-extrabold rounded-lg transition duration-150 flex items-center justify-between cursor-pointer shadow-xs focus:ring-1 focus:ring-kiot-cyan focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400"
                              title="Thêm nét kẻ ngang / dọc hoặc hình khối bất kỳ vào nhãn"
                            >
                              <span className="flex items-center space-x-2">
                                <Shapes className="w-4 h-4 text-indigo-500" />
                                <span>Đường kẻ &amp; Hình khối</span>
                              </span>
                              <span className="p-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-500/30 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-150 shadow-2xs">
                                <Plus className="w-3.5 h-3.5" strokeWidth={3.5} />
                              </span>
                            </button>
                          </div>
                        </section>

                  {/* CHẾ ĐỘ NỀN & WATERMARK */}
                  <div id="bg-config-section" className="bg-slate-50/50 rounded-xl p-3.5 transition-all duration-150 shadow-3xs space-y-3 animate-fadeIn">
                    <div className="flex items-center space-x-2">
                      <Palette className="w-4 h-4 text-kiot-cyan" />
                      <span className="font-extrabold text-[12px] text-[#1E293B] uppercase tracking-wider font-sans select-none">
                        🎨 Chế độ nền &amp; Watermark
                      </span>
                    </div>

                    <div className="space-y-3 pt-2 text-[13px] border-t border-slate-200/80">
                      {/* 1. Background Color selector */}
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-[#475569] select-none">Màu nền tem nhãn:</label>
                        <div className="flex items-center space-x-2 font-sans">
                          {/* Nút 1: Chọn màu (Mặc định là Màu trắng #ffffff) */}
                          <div className={`relative w-8 h-8 rounded-md border flex items-center justify-center transition duration-150 cursor-pointer shrink-0 ${
                            labelConfig.bgColor !== "transparent"
                              ? "border-kiot-cyan bg-kiot-cyan/5 ring-1 ring-kiot-cyan font-semibold"
                              : "border-slate-250 bg-white hover:bg-slate-100/80"
                          }`}>
                            <input
                              type="color"
                              id="bg-color-picker"
                              value={(labelConfig.bgColor && labelConfig.bgColor !== "transparent") ? labelConfig.bgColor : "#ffffff"}
                              onChange={(e) => {
                                setLabelConfig({
                                  ...labelConfig,
                                  bgColor: e.target.value
                                });
                              }}
                              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
                              title="Chọn mã màu nền tùy ý"
                            />
                            <span 
                              className="w-5 h-5 rounded-full border border-slate-350 shrink-0 shadow-sm z-10 transition-transform duration-100 hover:scale-110"
                              style={{ backgroundColor: (labelConfig.bgColor && labelConfig.bgColor !== "transparent") ? labelConfig.bgColor : "#ffffff" }}
                            />
                          </div>

                          {/* Nút 2: Trong suốt */}
                          <button
                            type="button"
                            onClick={() => {
                              setLabelConfig({
                                ...labelConfig,
                                bgColor: "transparent"
                              });
                            }}
                            className={`w-8 h-8 rounded-md border flex items-center justify-center transition duration-150 cursor-pointer relative overflow-hidden shrink-0 ${
                              labelConfig.bgColor === "transparent"
                                ? "border-kiot-cyan bg-kiot-cyan/5 ring-1 ring-kiot-cyan"
                                : "border-slate-250 bg-white hover:bg-slate-50"
                            }`}
                            title="Nền trong suốt"
                          >
                            {/* Caro mô phỏng trong suốt */}
                            <div className="absolute inset-1.5 opacity-30 grid grid-cols-2 grid-rows-2">
                              <div className="bg-slate-400"></div>
                              <div className="bg-white"></div>
                              <div className="bg-white"></div>
                              <div className="bg-slate-400"></div>
                            </div>
                            {/* Đường gạch chéo đỏ biểu hiệu trong suốt */}
                            <div className="absolute w-[140%] h-[1.5px] bg-red-500 rotate-45 transform origin-center z-10 opacity-80" />
                          </button>
                        </div>
                      </div>

                      {/* 2. Watermark / Background Image Upload */}
                      <div className="space-y-1.5">
                        <label className="block font-bold text-[#475569] select-none">Ảnh nền hoặc Watermark:</label>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="file"
                            accept="image/*"
                            id="bg-image-uploader"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  if (event.target?.result) {
                                    setLabelConfig({
                                      ...labelConfig,
                                      bgImage: event.target.result as string,
                                      bgImageOpacity: labelConfig.bgImageOpacity !== undefined ? labelConfig.bgImageOpacity : 0.3,
                                      bgImageSize: labelConfig.bgImageSize || "contain"
                                    });
                                  }
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => document.getElementById("bg-image-uploader")?.click()}
                            className="flex-1 py-1.5 px-2.5 border border-dashed border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-kiot-cyan rounded font-bold text-center transition flex items-center justify-center space-x-1 cursor-pointer select-none text-[12.5px]"
                          >
                            <Upload className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{labelConfig.bgImage ? "Thay ảnh nền" : "Tải ảnh nền/Watermark"}</span>
                          </button>
                          {labelConfig.bgImage && (
                            <button
                              type="button"
                              onClick={() => {
                                setLabelConfig({
                                  ...labelConfig,
                                  bgImage: undefined,
                                  bgImageOpacity: undefined,
                                  bgImageSize: undefined
                                });
                                const inp = document.getElementById("bg-image-uploader") as HTMLInputElement;
                                if (inp) inp.value = "";
                              }}
                              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded transition border border-red-200 cursor-pointer animate-scaleIn"
                              title="Xóa ảnh nền/watermark"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {labelConfig.bgImage && (
                        <>
                          {/* 3. Watermark Opacity Slider */}
                          <div className="space-y-1 bg-slate-50 p-2 rounded border border-slate-100 animate-fadeIn">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-500">Độ mờ ảnh (Watermark):</span>
                              <span className="font-mono text-[10px] font-bold text-slate-750 bg-slate-200 px-1.5 py-0.5 rounded leading-tight select-none">
                                {Math.round((labelConfig.bgImageOpacity !== undefined ? labelConfig.bgImageOpacity : 0.3) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.05}
                              max={1.0}
                              step={0.05}
                              value={labelConfig.bgImageOpacity !== undefined ? labelConfig.bgImageOpacity : 0.3}
                              onChange={(e) => {
                                setLabelConfig({
                                  ...labelConfig,
                                  bgImageOpacity: parseFloat(e.target.value)
                                });
                              }}
                              className="w-full accent-kiot-cyan cursor-pointer h-1.5"
                            />
                          </div>

                          {/* In ảnh nền: bật = in cùng tem (watermark); tắt = chỉ để định vị khi thiết kế */}
                          <label className="flex items-start gap-2 bg-slate-50 p-2 rounded border border-slate-100 cursor-pointer select-none animate-fadeIn">
                            <input
                              type="checkbox"
                              id="bg-image-print-toggle"
                              checked={labelConfig.bgImagePrint !== false}
                              onChange={(e) => {
                                setLabelConfig({
                                  ...labelConfig,
                                  bgImagePrint: e.target.checked
                                });
                              }}
                              className="mt-0.5 w-3.5 h-3.5 accent-kiot-cyan cursor-pointer shrink-0"
                            />
                            <span className="leading-snug">
                              <span className="font-bold text-slate-700">In ảnh nền</span>
                              <span className="block text-[10.5px] text-slate-500">
                                {labelConfig.bgImagePrint !== false
                                  ? "Ảnh nền được in cùng tem (PDF, ZPL, TSPL)."
                                  : "Chỉ hiện khi thiết kế để định vị, không in ra tem."}
                              </span>
                            </span>
                          </label>

                          {/* 4. Background Image Fitting */}
                          <div className="flex items-center justify-between animate-fadeIn">
                            <span className="font-bold text-slate-500">Tỷ lệ tương thích:</span>
                            <div className="relative">
                              <select
                                value={labelConfig.bgImageSize || "contain"}
                                onChange={(e) => {
                                  setLabelConfig({
                                    ...labelConfig,
                                    bgImageSize: e.target.value as any
                                  });
                                }}
                                className="appearance-none pl-2.5 pr-7 py-1 bg-white border border-slate-250 rounded text-[11.5px] font-bold text-slate-700 focus:outline-none cursor-pointer"
                              >
                                <option value="contain">Co giãn vừa (Contain)</option>
                                <option value="cover">Lấp đầy (Cover)</option>
                                <option value="repeat">Lặp lại (Repeat)</option>
                                <option value="auto">Kích thước gốc (Auto)</option>
                              </select>
                              <ChevronDown className="absolute right-2 top-2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* PERSISTENT / COLLAPSIBLE DATA FILE INTEGRATION ("LIÊN KẾT FILE DATA") */}
                <div id="excel-section-header" className="bg-gradient-to-r from-emerald-50/80 via-emerald-50/50 to-teal-50/60 border border-emerald-200/80 rounded-lg p-3.5 transition-all duration-150 shadow-xs mb-4">
                  {/* Permanent Hidden file input to be triggered easily from both locations */}
                  <input
                    id="excel-file-uploader-direct"
                    type="file"
                    accept=".xlsx,.xls,.csv,.tsv,.txt"
                    onChange={handleExcelUpload}
                    className="hidden"
                  />

                  <div className="flex items-center justify-between w-full">
                    {/* Collapsible toggle */}
                    <button
                      type="button"
                      onClick={() => setIsExcelExpanded(!isExcelExpanded)}
                      className="flex items-center space-x-2.5 text-left select-none group cursor-pointer flex-1 min-w-0"
                    >
                      <FileSpreadsheet className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="font-extrabold text-[12.5px] text-emerald-800 uppercase tracking-wider group-hover:text-emerald-950 transition-colors font-sans truncate">
                          🔗 LIÊN KẾT FILE DATA
                        </span>
                        <span className="text-[11px] text-emerald-650 font-bold select-none leading-none mt-0.5 w-max">
                          In hàng loạt (Lựa chọn)
                        </span>
                      </div>
                    </button>

                    {/* Direct Upload button or clean row count badge inside the header bar */}
                    <div className="flex items-center space-x-2 ml-2 shrink-0">
                      {!excelFileName ? (
                        <span className="text-[10.5px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded select-none">
                          Chưa liên kết
                        </span>
                      ) : (
                        <div className="flex items-center space-x-1.5 bg-emerald-650 text-white px-2 py-1 rounded shadow-inner text-[11px] font-mono font-bold select-none">
                          <span>✓ {excelData.length} dòng</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Format Notice block */}
                  <div className="mt-3 pt-3 border-t border-emerald-250/20 text-[11.5px] text-emerald-800 flex items-start space-x-1.5 shadow-2xs select-none">
                    <span className="shrink-0 bg-emerald-600 text-white font-extrabold text-[9.5px] px-1.5 py-0.5 rounded uppercase tracking-wide">
                      NOTE
                    </span>
                    <span className="leading-relaxed font-bold text-emerald-950">
                      Định dạng .xlsx, .xls, .csv (UTF-8/UTF-16/ANSI). Dòng 1 chứa tiêu đề cột, dòng 2 trở đi chứa dữ liệu tem
                    </span>
                  </div>

                  {isExcelExpanded && (
                    <div className="space-y-4 text-sm bg-white border border-emerald-100 rounded-md p-3.5 mt-3 shadow-inner">
                      
                      {/* 1. EXCEL UPLOADER PORT */}
                      <section className="space-y-2.5">
                        {!excelFileName ? (
                          <div className="relative space-y-2">
                            <label 
                              htmlFor="excel-file-uploader-direct"
                              onClick={(e) => {
                                e.preventDefault();
                                triggerExcelLoadDialog('new');
                              }}
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const file = e.dataTransfer.files?.[0];
                                if (file) {
                                  const fname = file.name.toLowerCase();
                                  if (/\.(xlsx|xls|csv|tsv|txt)$/.test(fname)) {
                                    const b64Reader = new FileReader();
                                    b64Reader.onload = (b64Evt) => {
                                      try {
                                        const b64Result = b64Evt.target?.result as string;
                                        setExcelFileBase64(b64Result.split(",")[1] || b64Result);
                                      } catch (err) {
                                        console.error(err);
                                      }
                                    };
                                    b64Reader.readAsDataURL(file);

                                    const reader = new FileReader();
                                    reader.onload = (evt) => {
                                      if (evt.target?.result) {
                                        processExcelBinary(evt.target.result as ArrayBuffer, file.name, true);
                                      }
                                    };
                                    reader.readAsArrayBuffer(file);
                                  } else {
                                    alert("Định dạng tệp không được hỗ trợ! Vui lòng chỉ kéo thả tệp Excel hoặc CSV (.xlsx, .xls, .csv).");
                                  }
                                }
                              }}
                              className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-250/70 rounded-xl p-5 bg-slate-50/50 cursor-pointer hover:bg-emerald-50/25 hover:border-emerald-400 transition-all text-center space-y-3"
                            >
                              <div className="px-4.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[12px] rounded-lg shadow-md flex items-center justify-center space-x-2 transition-all transform hover:scale-[1.02] select-none active:scale-[0.98]">
                                <Upload className="w-4 h-4 text-white" />
                                <span>Upload file</span>
                              </div>
                              <div className="space-y-1 pb-1">
                                <span className="text-[13px] font-extrabold text-slate-850 block">Chọn tệp Excel từ máy</span>
                                <span className="text-[11.5px] text-slate-500 font-extrabold block">Hoặc kéo thả file vào vùng upload</span>
                              </div>
                            </label>
                            
                            {/* Download static generic sample template so they don't start empty */}
                            <div className="text-center pt-0.5">
                              <button
                                type="button"
                                onClick={handleDownloadExcelTemplate}
                                className="text-[11.5px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center gap-1 cursor-pointer transition select-none"
                              >
                                📥 Tải File Excel Mẫu để Điền Dữ Liệu
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3.5 bg-emerald-50 border border-emerald-250/70 rounded-lg space-y-3 shadow-2xs">
                            <div className="flex items-start justify-between">
                              <div className="min-w-0 pr-2 flex-1">
                                <p className="font-extrabold text-emerald-950 truncate text-[13px] flex items-center gap-1.5 leading-tight">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                                  <span>Đã liên kết dữ liệu Excel</span>
                                </p>
                                <p className="text-[11px] text-emerald-850 truncate font-black font-mono mt-1 border-b border-emerald-200/50 pb-1.5" title={excelFileName}>{excelFileName}</p>
                                <p className="text-[11px] text-zinc-650 font-bold mt-2">
                                  Sẵn sàng in hàng loạt: <span className="text-emerald-700 font-extrabold font-mono">{excelData.length} dòng dữ liệu</span>.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={handleClearExcel}
                                className="p-1 hover:bg-emerald-100 text-emerald-700 hover:text-red-650 rounded transition shrink-0 cursor-pointer ml-1 animate-fadeIn"
                                title="Hủy kết nối file Excel hiện tại"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="space-y-3 pt-2.5 border-t border-emerald-150/85">
                              {/* 1. Nút Đồng bộ */}
                              <div className="space-y-1">
                                <button
                                  type="button"
                                  onClick={handleDirectExcelSync}
                                  className="w-full text-[10.5px] bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-1.5 px-2.5 rounded-md inline-flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer select-none border border-emerald-700"
                                  title="Tự động đồng bộ / làm mới tất cả thông tin trực tiếp từ tệp tin mà không hiển thị lại hộp thoại thoại"
                                >
                                  <RefreshCw className="w-3 h-3 text-white animate-[spin_10s_linear_infinite]" />
                                  <span>Đồng bộ dữ liệu</span>
                                </button>
                                <p className="text-[9.5px] text-zinc-500 font-bold leading-normal pl-1.5 border-l border-emerald-400">
                                  Hệ thống tự động phát hiện, cập nhật dữ liệu ngầm và giữ nguyên liên kết.
                                </p>
                              </div>

                              {/* 2. Nút Cập nhật File mới */}
                              <div className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => triggerExcelLoadDialog('new')}
                                  className="w-full text-[10.5px] bg-white hover:bg-slate-50 text-slate-800 font-bold py-1.5 px-2.5 rounded-md inline-flex items-center justify-center gap-1.5 transition-all shadow-3xs active:scale-[0.98] border border-slate-300 cursor-pointer select-none"
                                  title="Thay đổi bằng file Excel hoàn toàn mới"
                                >
                                  <Upload className="w-3 h-3 text-zinc-650" />
                                  <span>Cập nhật File mới</span>
                                </button>
                                <p className="text-[9.5px] text-zinc-500 font-bold leading-normal pl-1.5 border-l border-slate-300">
                                  Nếu chọn file khác, các liên kết tem với cột cũ sẽ bị xóa hết.
                                </p>
                              </div>

                              {/* 3. Nút Tải tệp đang liên kết */}
                              <div className="pt-2 border-t border-emerald-200/40">
                                <button
                                  type="button"
                                  onClick={handleDownloadExcelTemplate}
                                  className="w-full text-[10px] bg-emerald-100/60 hover:bg-emerald-100 text-emerald-800 font-extrabold py-1 px-2 rounded inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none border border-emerald-200/50"
                                  title="Tải tệp Excel đang chạy trong mẫu thiết kế này"
                                >
                                  <Download className="w-2.5 h-2.5 text-emerald-700" />
                                  <span>Tải tệp đang liên kết</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </section>
                    </div>
                  )}
                </div>

                {isStep3Expanded && (
                  <div className="space-y-4">
                    {/* NÚT KHỚP VỪA VỚI NHÃN - KHÔNG TIÊU ĐỀ, KHÔNG MÔ TẢ THEO YÊU CẦU */}
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={handleFitObjectsToLabel}
                        disabled={objects.length === 0}
                        className="w-full py-2.5 bg-gradient-to-r from-kiot-cyan to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-lg text-xs font-black text-center select-none cursor-pointer transition flex items-center justify-center space-x-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transform active:scale-[0.98]"
                        title="Tự động co giãn tất cả đối tượng vừa vặn vào khổ tem và giữ nguyên vị trí cân đối"
                      >
                        ⚡ <span>Khớp vừa với nhãn</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

          </div>

          {/* Sticky Bottom Actions inside sidebar */}
          {activeSidebarTab === 'design' && (
            <div className="bg-slate-50 border-t border-gray-200 shrink-0 shadow-sm flex flex-col no-print">
              {/* Accordion Toggle Header */}
              <button
                type="button"
                onClick={() => setIsPrintExpanded(!isPrintExpanded)}
                className="mx-3 mt-3 mb-2 px-4 py-3 flex items-center justify-between cursor-pointer select-none group rounded-xl shadow-md transition-all duration-150 bg-gradient-to-r from-kiot-cyan to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white scale-[1.01] hover:scale-[1.02] active:scale-[0.99] border border-sky-600/30 border-b-[3px] border-b-sky-700/80"
                title="Nhấn để thiết lập số lượng bản in và thực hiện in nhãn"
              >
                <div className="flex items-center space-x-2.5">
                  <span className="px-2 py-0.5 rounded font-extrabold text-[10px] tracking-wide shrink-0 border bg-white/20 text-white border-white/30 group-hover:bg-white/30 transition-colors">
                    BƯỚC 4
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <Printer className="w-4 h-4 animate-pulse select-none shrink-0 text-white" />
                    <span className="font-extrabold text-[12.5px] uppercase tracking-wider font-sans text-white leading-none">
                      IN TEM
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] px-2 py-0.5 rounded font-black border font-mono transition-colors duration-150 bg-white/20 text-white border-white/30">
                    {printQuantityMode === "constant" ? `${printCopies} bản` : 'Theo Excel'}
                  </span>
                  <div className={`transition-transform duration-150 text-white ${isPrintExpanded ? "rotate-180" : ""}`}>
                    <ChevronDown className="w-4 h-4 text-white" />
                  </div>
                </div>
              </button>

              {/* Collapsed/Expanded Content */}
              {isPrintExpanded && (
                <div className="mx-3 mb-3 p-4 space-y-3.5 bg-white border border-gray-200 rounded-xl shadow-sm animate-fadeIn">
                  <div className="space-y-2 pb-1.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider select-none">
                        CHẾ ĐỘ SỐ LƯỢNG IN
                      </label>
                    </div>

                    {/* Two options selection button layout */}
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/85">
                      <button
                        type="button"
                        onClick={() => {
                          setPrintQuantityMode('constant');
                        }}
                        className={`px-1.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          printQuantityMode === 'constant'
                            ? "bg-white text-kiot-navy shadow-xs border border-gray-250 font-extrabold"
                            : "text-slate-500 hover:text-slate-800 font-semibold"
                        }`}
                      >
                        Số lượng cố định
                      </button>
                      <button
                        type="button"
                        disabled={excelData.length === 0}
                        onClick={() => {
                          setPrintQuantityMode('excel_column');
                        }}
                        className={`px-1.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-0.5 ${
                          excelData.length === 0
                            ? "opacity-55 cursor-not-allowed text-slate-400 font-semibold"
                            : printQuantityMode === 'excel_column'
                            ? "bg-white text-emerald-700 shadow-xs border border-emerald-250 font-extrabold"
                            : "text-slate-500 hover:text-slate-800 cursor-pointer font-semibold"
                        }`}
                        title={excelData.length === 0 ? "Hãy tải dữ liệu Excel trước" : "Lấy số bản in theo cột Excel"}
                      >
                        <span>SL theo file</span>
                        {excelData.length === 0 && <span className="text-[8px] bg-slate-200 text-slate-500 px-1 rounded font-bold">Khóa</span>}
                      </button>
                    </div>

                    {/* Quantity configuration elements */}
                    {printQuantityMode === 'constant' ? (
                      <div className="space-y-1 pt-1">
                        <label className="block text-[10px] text-slate-500 font-bold uppercase select-none mb-0.5">
                          Nhập số bản sao cần in:
                        </label>
                        <div className="relative">
                          <input
                            id="print-copies-input"
                            type="text"
                            value={printCopiesInput}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "");
                              setPrintCopiesInput(raw);
                            }}
                            onBlur={() => {
                              const val = parseInt(printCopiesInput, 10);
                              if (isNaN(val) || val < 1) {
                                setPrintCopies(1);
                                setPrintCopiesInput("1");
                              } else if (val > MAX_LABELS) {
                                setPrintCopies(MAX_LABELS);
                                setPrintCopiesInput(String(MAX_LABELS));
                              } else {
                                setPrintCopies(val);
                                setPrintCopiesInput(String(val));
                              }
                            }}
                            className="w-full pl-2 pr-8 py-1.5 text-sm bg-white border border-gray-300 rounded-lg text-slate-800 font-bold font-mono focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan outline-none"
                          />
                          <span className="absolute right-2 top-2 text-[11px] text-gray-400 font-extrabold select-none">bản</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 pt-1">
                        {excelData.length > 0 ? (
                          <>
                            <label className="block text-[10px] text-slate-500 font-bold uppercase select-none mb-0.5">
                              Chọn cột số lượng từ Excel:
                            </label>
                            <select
                              value={printQuantityColumn || ""}
                              onChange={(e) => setPrintQuantityColumn(e.target.value || null)}
                              className="w-full text-xs font-extrabold font-mono py-1.5 px-2 bg-white border border-gray-300 rounded-lg text-slate-800 focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan outline-none cursor-pointer"
                            >
                              <option value="">-- Tự động in mỗi dòng 1 tem --</option>
                              {numericExcelColumns.map((col) => (
                                <option key={col} value={col}>
                                  Cột: [{col}]
                                </option>
                              ))}
                            </select>
                            {numericExcelColumns.length === 0 ? (
                              <span className="block text-[10px] text-amber-950 font-semibold leading-normal bg-amber-50 p-1.5 rounded-md border border-amber-200 mt-1">
                                ⚠️ Không tìm thấy cột số lượng phù hợp. Đảm bảo Excel chứa cột SL / Số lượng dạng số.
                              </span>
                            ) : (
                              <span className="block text-[10px] text-emerald-700 font-semibold leading-relaxed bg-emerald-50 p-1 rounded-md border border-emerald-150 mt-1">
                                {printQuantityColumn
                                  ? `In dựa vào cột: ${printQuantityColumn}. Tổng in: ${printManifest.length} bản.`
                                  : `Mỗi dòng trong Excel sẽ được in đúng 1 bản. Tổng in: ${printManifest.length} bản.`}
                              </span>
                            )}
                          </>
                        ) : (
                          <div className="text-[10px] font-semibold text-yellow-850 bg-yellow-50 border border-yellow-250 p-1.5 rounded-md leading-normal">
                            Cần liên kết file dữ liệu trước trong tab <strong>"KHỔ TEM & GIẤY"</strong>.
                          </div>
                        )}
                      </div>
                    )}

                    {printLimitWarning && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-[11px] rounded-lg leading-relaxed font-semibold animate-pulse shadow-xs max-h-[140px] overflow-y-auto select-text font-sans">
                        ⚠️ <span className="font-bold">Cảnh báo an toàn:</span> {printLimitWarning}
                      </div>
                    )}
                  </div>

                  {/* LƯU FILE IN SECTION FOR SMALL LABELS (BYPASS WEBVIEW SCALE LIMITATIONS) */}
                  <div className="pt-2.5 border-t border-slate-200/80 space-y-2.5 font-sans">
                    {/* THIẾT LẬP MỞ RỘNG (GOM TỐI ƯU IN NHIỆT & XẢ RAM / CACHE) */}
                    <div className="bg-slate-50/90 rounded-xl border border-slate-200/80 overflow-hidden text-[10.5px] shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setIsExtendedSettingsOpen(!isExtendedSettingsOpen)}
                        className="w-full px-2.5 py-1.5 bg-slate-100/80 hover:bg-slate-100 flex items-center justify-between text-slate-700 font-extrabold cursor-pointer select-none transition-colors focus:outline-none"
                      >
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <Settings className="w-3.5 h-3.5 text-kiot-cyan shrink-0" />
                          <span className="uppercase tracking-wider text-[10px] text-slate-800">Thiết lập mở rộng</span>
                        </div>
                        <div className="flex items-center space-x-1 text-slate-400">
                          <span className="text-[9px] font-medium text-slate-500">
                            {isExtendedSettingsOpen ? "Ẩn" : "Hiện"}
                          </span>
                          {isExtendedSettingsOpen ? (
                            <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                        </div>
                      </button>

                      {isExtendedSettingsOpen && (
                        <div className="p-2.5 space-y-2.5 border-t border-slate-200/70 bg-white">
                          {/* 1. TỐI ƯU IN NHIỆT (ĐƠN SẮC NÉT) */}
                          <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200/60 shadow-2xs">
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <label htmlFor="sidebar-optimize-thermal-toggle" className="text-[10px] font-black text-slate-700 uppercase tracking-wide cursor-pointer select-none truncate">
                                Tối ưu in nhiệt (Đơn sắc nét)
                              </label>
                              <InfoTooltip content={
                                <div>
                                  <p className="font-bold mb-1">Tính năng binarize ảnh đơn sắc:</p>
                                  <p>Loại bỏ hoàn toàn các điểm ảnh mờ/xám (anti-aliasing) xung quanh chữ và nét vẽ. Toàn bộ nét vẽ sẽ được chuyển thành màu đen tuyền tuyệt đối trên nền trắng tinh khiết.</p>
                                  <p className="mt-1 font-semibold text-kiot-cyan">Giúp bản in trên máy in nhiệt cực kỳ sắc nét, không bị dính nét, xước hoặc nhòe mờ mã vạch/chữ viết!</p>
                                </div>
                              } />
                            </div>
                            <input
                              id="sidebar-optimize-thermal-toggle"
                              type="checkbox"
                              checked={optimizeThermalBinarization}
                              onChange={(e) => setOptimizeThermalBinarization(e.target.checked)}
                              className="w-4 h-4 text-kiot-cyan bg-gray-100 border-gray-300 rounded focus:ring-kiot-cyan focus:ring-1 cursor-pointer accent-kiot-cyan shrink-0"
                            />
                          </div>

                          {/* Kiểu PDF: vector (khuyên dùng) hoặc ảnh (dự phòng) */}
                          <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <label htmlFor="sidebar-pdf-engine" className="text-[10px] font-black text-slate-700 uppercase tracking-wide select-none truncate">
                                Kiểu PDF
                              </label>
                              <select
                                id="sidebar-pdf-engine"
                                value={pdfEngine}
                                onChange={(e) => {
                                  const v = e.target.value === "raster" ? "raster" : "vector";
                                  setPdfEngine(v);
                                  safeLocalStorage.setItem("kiotlabel_pdf_engine", v);
                                }}
                                className="text-[10.5px] font-bold border border-slate-300 rounded px-1.5 py-1 bg-white"
                              >
                                <option value="vector">Vector (nét, nhẹ, nhanh)</option>
                                <option value="raster">Ảnh (dự phòng)</option>
                              </select>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-snug">
                              {pdfEngine === "vector"
                                ? "Chữ, mã vạch, QR là nét vẽ thật (font Arial/Times khớp với bản thiết kế). Không phụ thuộc cỡ chữ tối thiểu của trình duyệt."
                                : "Chụp màn hình thành ảnh, dùng khi PDF vector lệch bản thiết kế. Độ phân giải chọn ở ô bên dưới."}
                            </p>
                          </div>

                          {/* Độ phân giải PDF/PNG (chỉ dùng cho PDF ảnh và PNG) */}
                          <div className="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-lg">
                            <label htmlFor="sidebar-pdf-dpi" className="text-[10px] font-black text-slate-700 uppercase tracking-wide select-none truncate">
                              Độ phân giải PDF/PNG
                            </label>
                            <select
                              id="sidebar-pdf-dpi"
                              value={pdfDpi}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                setPdfDpi(v);
                                safeLocalStorage.setItem("kiotlabel_pdf_dpi", String(v));
                              }}
                              className="text-[10.5px] font-bold border border-slate-300 rounded px-1.5 py-1 bg-white"
                            >
                              <option value={150}>150 DPI (nhẹ)</option>
                              <option value={203}>203 DPI (máy in 8 dot/mm)</option>
                              <option value={288}>288 DPI (mặc định)</option>
                              <option value={300}>300 DPI (máy in 12 dot/mm)</option>
                              <option value={600}>600 DPI (rất nặng)</option>
                            </select>
                          </div>

                          {/* 2. BỘ LỌC GIẢI PHÓNG RAM & TỐI ƯU HIỆU NĂNG CHO IN ẤN DÀI HẠN */}
                          <div className="p-2.5 bg-sky-50/50 border border-sky-100 rounded-lg space-y-2 text-[10.5px]">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[9.5px]">Độ ổn định RAM/Bộ nhớ</span>
                              </div>
                              <span className="font-mono font-bold text-sky-800 bg-sky-100/80 px-1.5 py-0.5 rounded text-[10px]">
                                Cache: {cachedPagesCount} trang
                              </span>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <label htmlFor="sidebar-auto-release-ram-toggle" className="text-[10px] font-bold text-slate-600 cursor-pointer select-none">
                                Tự động xả RAM sau khi in
                              </label>
                              <input
                                id="sidebar-auto-release-ram-toggle"
                                type="checkbox"
                                checked={autoReleaseRam}
                                onChange={(e) => setAutoReleaseRam(e.target.checked)}
                                className="w-3.5 h-3.5 text-kiot-cyan bg-gray-100 border-gray-300 rounded focus:ring-kiot-cyan focus:ring-1 cursor-pointer accent-kiot-cyan shrink-0"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                clearCanvasMemory();
                                alert("Đã giải phóng toàn bộ RAM cache ảnh thành công! Bộ nhớ trình duyệt đã được đưa về trạng thái tối ưu.");
                              }}
                              className="w-full py-1 px-2 text-center text-[10px] font-extrabold text-white bg-kiot-cyan hover:bg-sky-600 transition-colors rounded-md cursor-pointer select-none active:scale-[0.98]"
                              title="Giải phóng ngay lập tức toàn bộ bộ nhớ đệm GPU và RAM trình duyệt bằng cách dọn sạch các đối tượng canvas độ phân giải cao"
                            >
                              ⚡ XẢ RAM & DỌN CACHED CANVASES
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {desktop && (
                      <div id="desktop-print-panel" className="rounded-xl border border-orange-200 bg-orange-50/70 p-2.5 space-y-2 text-[10.5px]">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[10px]">In trực tiếp ra máy in</span>
                          <button
                            type="button"
                            onClick={async () => {
                              const r = await listDesktopPrinters(true);
                              if (r.ok) { setDesktopPrinters(r.data || []); setDirectPrintMsg(null); }
                              else setDirectPrintMsg({ ok: false, text: r.error || "Không đọc được danh sách máy in." });
                            }}
                            className="text-[9.5px] font-bold text-sky-700 hover:underline cursor-pointer"
                            title="Quét lại danh sách máy in của máy tính"
                          >
                            Làm mới
                          </button>
                        </div>
                        <select
                          id="desktop-printer-select"
                          value={effectivePrintTarget}
                          onChange={(e) => {
                            setPrintTarget(e.target.value);
                            safeLocalStorage.setItem("kiotlabel_print_target", e.target.value);
                            setDirectPrintMsg(null);
                          }}
                          className="w-full px-2 py-1.5 text-xs font-bold bg-white border border-gray-300 rounded-lg text-slate-800 focus:border-kiot-cyan focus:outline-none cursor-pointer"
                        >
                          <option value={PDF_TARGET}>💾 Lưu thành PDF (không in)</option>
                          {desktopPrinters.map((p) => (
                            <option key={p.name} value={p.name}>🖨 {p.name}{p.isDefault ? " (mặc định)" : ""}</option>
                          ))}
                        </select>
                        <p className="text-[9.5px] text-slate-600 leading-snug">
                          {effectivePrintTarget === PDF_TARGET
                            ? "Xuất tệp PDF để lưu hoặc in bằng phần mềm khác."
                            : `Gửi thẳng lệnh ${printerLang.toUpperCase()} (${printerDpi} DPI) tới máy in tem, không qua PDF. Đổi ngôn ngữ/độ phân giải ở mục "Xuất lệnh máy in nhiệt" bên dưới.`}
                        </p>
                        <button
                          type="button"
                          onClick={handleDirectPrint}
                          disabled={isDirectPrinting || isSavingFile}
                          className={`w-full py-2.5 px-2 rounded-lg flex items-center justify-center space-x-2 text-[11px] font-black border transition-all duration-150 cursor-pointer ${
                            isDirectPrinting || isSavingFile
                              ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                              : "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:shadow-sm active:scale-[0.98]"
                          }`}
                        >
                          {isDirectPrinting ? <RefreshCw className="w-3.5 h-3.5 stroke-[3.5] animate-spin" /> : <Printer className="w-3.5 h-3.5 stroke-[2.5]" />}
                          <span className="uppercase tracking-wider">{isDirectPrinting ? "Đang gửi lệnh in..." : effectivePrintTarget === PDF_TARGET ? "Lưu PDF" : "In ngay"}</span>
                        </button>
                        {directPrintMsg && (
                          <p className={`text-[10px] font-bold rounded-md px-2 py-1 border ${directPrintMsg.ok ? "text-emerald-800 bg-emerald-50 border-emerald-200" : "text-red-800 bg-red-50 border-red-200"}`}>
                            {directPrintMsg.text}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => handleSavePrintFile('pdf')}
                        disabled={isSavingFile}
                        className={`${desktop ? "hidden " : ""}w-full py-2.5 px-2 rounded-lg flex items-center justify-center space-x-2 text-[11px] font-black border transition-all duration-150 cursor-pointer ${
                          isSavingFile
                            ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                            : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:shadow-sm active:scale-[0.98]"
                        }`}
                        title="Lưu dưới dạng tệp PDF với kích thước gốc (mm)"
                      >
                        {isSavingFile && saveFileProgress.includes("PDF") ? (
                          <RefreshCw className="w-3.5 h-3.5 stroke-[3.5] animate-spin text-white" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 stroke-[2.5]" />
                        )}
                        <span className="uppercase tracking-wider">LƯU PDF</span>
                      </button>

                      {/* XUẤT LỆNH MÁY IN NHIỆT (ZPL / TSPL) */}
                      <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-2.5 space-y-2 text-[10.5px]">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[10px]">
                            Xuất lệnh máy in nhiệt
                          </span>
                          <span className="text-[9.5px] font-mono font-bold text-sky-800 bg-sky-100/80 px-1.5 py-0.5 rounded">
                            {(() => {
                              const jobs = buildPrinterCommandJobs();
                              return `${jobs.reduce((n, j) => n + j.copies, 0)} nhãn`;
                            })()}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Ngôn ngữ máy in">
                          {([["zpl", "ZPL", "Zebra"], ["tspl", "TSPL", "TSC, Xprinter, Gprinter"]] as const).map(([v, name, hint]) => (
                            <button
                              key={v}
                              type="button"
                              role="radio"
                              aria-checked={printerLang === v}
                              onClick={() => chooseLang(v)}
                              className={`px-2 py-1.5 rounded-lg border text-left cursor-pointer transition ${
                                printerLang === v ? "bg-white border-kiot-cyan ring-1 ring-kiot-cyan text-kiot-navy" : "bg-white border-gray-200 text-slate-600 hover:border-gray-300"
                              }`}
                            >
                              <div className="font-black text-[11px]">{name}</div>
                              <div className="text-[9px] font-semibold text-slate-500 leading-tight">{hint}</div>
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-600">Độ phân giải máy in</span>
                          <div className="flex gap-1">
                            {[203, 300, 600].map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => chooseDpi(d)}
                                className={`px-2 py-0.5 rounded-md border text-[10px] font-black cursor-pointer ${
                                  printerDpi === d ? "bg-kiot-cyan text-white border-kiot-cyan" : "bg-white text-slate-600 border-gray-200 hover:border-gray-300"
                                }`}
                              >
                                {d} DPI
                              </button>
                            ))}
                          </div>
                        </div>

                        {printerLang === "tspl" && (
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="tspl-gap-input" className="font-bold text-slate-600">Khoảng hở giữa 2 tem (mm)</label>
                            <input
                              id="tspl-gap-input"
                              type="number"
                              min={0}
                              max={20}
                              step={0.5}
                              value={tsplGapMm}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (Number.isFinite(v)) chooseGap(Math.min(20, Math.max(0, v)));
                              }}
                              className="w-16 px-2 py-0.5 text-xs border border-gray-200 rounded-md font-mono font-bold text-slate-800 focus:border-kiot-cyan focus:outline-none"
                            />
                          </div>
                        )}

                        {objects.some((o) => o.type === "image") && (
                          <p className="text-[9.5px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                            ⚠️ Hình ảnh không được xuất sang lệnh máy in (sẽ bị bỏ qua). Dùng PDF nếu tem có logo/ảnh.
                          </p>
                        )}
                        <p className="text-[9.5px] text-slate-500 leading-snug">
                          Chữ tiếng Việt có dấu cần máy in đã nạp font TrueType. Nếu máy in chưa có font, hãy dùng PDF.
                        </p>

                        <button
                          type="button"
                          onClick={handleExportPrinterCommands}
                          className="w-full py-2 px-2 rounded-lg flex items-center justify-center space-x-2 text-[11px] font-black border bg-slate-800 text-white border-slate-800 hover:bg-slate-900 hover:shadow-sm active:scale-[0.98] transition-all cursor-pointer"
                          title="Tải tệp lệnh để gửi thẳng tới máy in nhiệt"
                        >
                          <Printer className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span className="uppercase tracking-wider">Xuất file .{printerLang}</span>
                        </button>
                      </div>
                    </div>

                    {isSavingFile && (
                      <div className="flex items-center space-x-1.5 p-1.5 bg-slate-50 border border-slate-150 rounded-lg text-[10px] text-slate-600 font-mono font-bold leading-normal">
                        <RefreshCw className="w-3 h-3 animate-spin text-kiot-cyan shrink-0" />
                        <span>{saveFileProgress}<span data-live-progress></span></span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handlePrintLabel}
                    disabled={isPreparingPrint}
                    className={`w-full py-3 rounded-xl flex items-center justify-center space-x-2 transition-all duration-150 text-xs font-black border-b-[3px] ${
                      isPreparingPrint
                        ? "bg-slate-300 text-slate-500 border-slate-400 cursor-not-allowed opacity-75 shadow-none scale-100"
                        : "bg-gradient-to-r from-kiot-cyan to-sky-500 hover:from-sky-500 hover:to-sky-600 text-white cursor-pointer shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.98] border-sky-600"
                    }`}
                    title={isPreparingPrint ? "Đang chuẩn bị vẽ nhãn & mã vạch..." : "Gọi lệnh in nhãn dán tiêu chuẩn (Ctrl + P)"}
                  >
                    {isPreparingPrint ? (
                      <>
                        <RefreshCw className="w-4.5 h-4.5 stroke-[3] animate-spin" />
                        <span className="tracking-widest uppercase font-black font-sans">ĐANG CHUẨN BỊ IN...</span>
                      </>
                    ) : (
                      <>
                        <Printer className="w-4.5 h-4.5 stroke-[3]" />
                        <span className="tracking-widest uppercase font-black font-sans">IN NHÃN (CTRL + P)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick instructions in Sidebar bottom */}
          <footer className="p-2 bg-gray-50 border-t border-gray-200 text-[9.5px] text-gray-500 leading-normal flex items-start space-x-1 shrink-0">
            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            {activeSidebarTab === 'design' ? (
              <p className="leading-relaxed">
                Chọn đối tượng văn bản, QR, hoặc mã vạch bất kỳ. Trong Panel Thuộc Tính hiện lên bên dưới cấu hình diện tích sẽ có nút <strong>Liên kết dữ liệu Excel</strong> để lấy thông tin tự động theo cột hàng!
              </p>
            ) : (
              <p className="leading-relaxed">
                Nạp tệp Excel bán hàng, vật tư. Sau khi tải lên, tiêu đề cột (dòng 1) sẽ dùng để ánh xạ tự động vào cấu hình tem nhãn vô cùng dễ dàng.
              </p>
            )}
          </footer>
            </>
          )}
        </aside>

        {/* WORKSPACE AREA ON THE RIGHT - STRETCHABLE SPACE bg-slate-200 (Canvas wrapper is bg-gray-100) */}
        <main className={`${mobilePane === "canvas" ? "flex" : "hidden"} md:flex flex-1 flex-col bg-[#E5E7EB] relative min-w-0 overflow-hidden`}>
          
          {/* HORIZONTAL WORKSPACE TOOLBAR - Responsive layout, flex-wrap to prevent overlaps */}
          <section id="workspace-toolbar" className="min-h-[48px] py-1.5 bg-white border-b border-gray-200 flex flex-wrap gap-2 items-center justify-between px-3 shrink-0 no-print shadow-xs">
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              
              {(sheetConfig.mode === 'office' || sheetConfig.mode === 'thermal') && (
                <div className="flex items-center bg-gray-50 px-2 py-1 rounded-lg border border-gray-200 space-x-2 shrink-0 select-none">
                  <span className="text-[10.5px] text-gray-400 font-extrabold uppercase select-none tracking-wider">Chế độ xem</span>
                  <div className="flex bg-slate-100 p-0.5 rounded-md border border-gray-250">
                    <button
                      type="button"
                      onClick={() => setOfficePreviewMode('design')}
                      className={`px-2 py-1 text-[11px] rounded transition-all font-black cursor-pointer ${
                        officePreviewMode === 'design'
                          ? 'bg-kiot-cyan text-white shadow-xs'
                          : 'text-slate-550 hover:text-slate-800'
                      }`}
                    >
                      Bàn Thiết Kế (1 Tem)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOfficePreviewMode('sheet')}
                      className={`px-2 py-1 text-[11px] rounded transition-all font-black cursor-pointer ${
                        officePreviewMode === 'sheet'
                          ? 'bg-kiot-cyan text-white shadow-xs'
                          : 'text-slate-550 hover:text-slate-800'
                      }`}
                    >
                      {sheetConfig.mode === 'office' 
                        ? `Xem Trang In Lưới (${sheetConfig.paperSize})` 
                        : `Xem Cuộn Tem (${sheetConfig.cols} Tem)`}
                    </button>
                  </div>
                </div>
              )}
              
              {/* Display Zoom controls */}
              <div className="flex items-center bg-gray-50 px-2 py-1 rounded-lg border border-gray-200 space-x-1.5 font-sans shrink-0">
                <span className="text-[10.5px] text-gray-400 font-extrabold uppercase select-none tracking-wider">Zoom Tem</span>
                <button
                  type="button"
                  onClick={() => setPixelScale(Math.max(1.6983, pixelScale - 0.84915))}
                  className="p-1 rounded hover:bg-white text-gray-500 hover:text-gray-700 transition cursor-pointer"
                  title="Thu nhỏ phôi dán"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[12px] font-mono text-center w-11 text-gray-700 font-bold">
                  {Math.round((pixelScale / 8.4915) * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setPixelScale(Math.min(25.4745, pixelScale + 0.84915))}
                  className="p-1 rounded hover:bg-white text-gray-500 hover:text-gray-700 transition cursor-pointer"
                  title="Phóng to phôi dán"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Interface Zoom (UI Zoom) controls */}
              <div className="flex items-center bg-sky-50/70 px-2 py-1 rounded-lg border border-sky-200 space-x-1.5 font-sans shrink-0">
                <span className="text-[10.5px] text-sky-700 font-extrabold uppercase select-none tracking-wider">
                  <span className="hidden sm:inline">Zoom Giao Diện</span>
                  <span className="sm:hidden">Zoom UI</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const newZoom = Math.max(0.5, Math.round((interfaceZoom - 0.05) * 100) / 100);
                    handleUpdateInterfaceZoom(newZoom);
                    setIsZoomUserOverridden(true);
                    safeLocalStorage.setItem("kiotlabel_interface_zoom_override", "true");
                  }}
                  className="p-1 rounded hover:bg-white text-sky-700 hover:text-sky-900 transition cursor-pointer"
                  title="Thu nhỏ toàn bộ giao diện ứng dụng (Thích hợp cho màn hình nhỏ)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[12px] font-mono text-center w-12 text-sky-850 font-bold">
                  {Math.round(interfaceZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const newZoom = Math.min(1.5, Math.round((interfaceZoom + 0.05) * 100) / 100);
                    handleUpdateInterfaceZoom(newZoom);
                    setIsZoomUserOverridden(true);
                    safeLocalStorage.setItem("kiotlabel_interface_zoom_override", "true");
                  }}
                  className="p-1 rounded hover:bg-white text-sky-700 hover:text-sky-900 transition cursor-pointer"
                  title="Phóng to toàn bộ giao diện ứng dụng"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                {isZoomUserOverridden && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsZoomUserOverridden(false);
                      safeLocalStorage.removeItem("kiotlabel_interface_zoom_override");
                    }}
                    className="text-[9px] bg-sky-200/80 hover:bg-sky-200 text-sky-900 font-black px-1.5 py-0.5 rounded transition select-none uppercase tracking-wide leading-none"
                    title="Khôi phục tự động scale theo độ phân giải màn hình của bạn"
                  >
                    Tự động
                  </button>
                )}
              </div>

            </div>
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2.5">
              {/* Undo Button */}
              <button
                type="button"
                onClick={handleUndo}
                disabled={past.length === 0}
                className={`px-2.5 md:px-3 py-1.5 transition-all duration-150 rounded-lg text-xs md:text-[13px] font-bold flex items-center space-x-1.5 leading-none shadow-xs border ${
                  past.length === 0
                    ? "bg-gray-55 border-gray-150 text-gray-300 cursor-not-allowed font-sans"
                    : "bg-white hover:bg-slate-50 border-gray-200 hover:border-gray-300 text-slate-700 cursor-pointer hover:scale-[1.02] active:scale-[0.98] font-sans"
                }`}
                title="Hoàn tác thao tác trước (Ctrl + Z)"
              >
                <Undo2 className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline">Hoàn tác</span>
              </button>

              {/* Redo Button */}
              <button
                type="button"
                onClick={handleRedo}
                disabled={future.length === 0}
                className={`px-2.5 md:px-3 py-1.5 transition-all duration-150 rounded-lg text-xs md:text-[13px] font-bold flex items-center space-x-1.5 leading-none shadow-xs border ${
                  future.length === 0
                    ? "bg-gray-55 border-gray-150 text-gray-300 cursor-not-allowed font-sans"
                    : "bg-white hover:bg-slate-50 border-gray-200 hover:border-gray-300 text-slate-700 cursor-pointer hover:scale-[1.02] active:scale-[0.98] font-sans"
                }`}
                title="Làm lại thao tác vừa hoàn tác (Ctrl + Y)"
              >
                <Redo2 className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline">Làm lại</span>
              </button>

              {/* Blank restart canvas button */}
              <button
                onClick={handleClearCanvas}
                className="px-2.5 md:px-3 py-1.5 bg-white hover:bg-red-50 border border-red-200 hover:border-red-300 text-red-600 transition-all duration-150 rounded-lg text-xs md:text-[13px] font-bold flex items-center space-x-1.5 leading-none cursor-pointer shadow-xs hover:scale-[1.02] active:scale-[0.98] font-sans"
                title="Xóa toàn bộ các đối tượng hiện tại để bắt đầu thiết kế mới"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline">Xóa hết</span>
                <span className="lg:hidden">Xóa</span>
              </button>

              {/* Reset to default template button */}
              <button
                onClick={handleResetToDefault}
                className="px-2.5 md:px-3 py-1.5 bg-white hover:bg-amber-50 border border-amber-200 hover:border-amber-300 text-amber-700 transition-all duration-150 rounded-lg text-xs md:text-[13px] font-bold flex items-center space-x-1.5 leading-none cursor-pointer shadow-xs hover:scale-[1.02] active:scale-[0.98] font-sans"
                title="Khôi phục thiết kế và dữ liệu Excel liên kết về mẫu mặc định ban đầu"
              >
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline">Khôi phục mẫu</span>
                <span className="lg:hidden">Khôi phục</span>
              </button>
            </div>
          </section>

          {/* Thanh sắp xếp đối tượng */}
          {officePreviewMode === 'design' && (
            <div className="w-full flex justify-center px-4 mt-2 no-print">
              <ArrangeToolbar
                selectedCount={arrangeIds.length}
                totalCount={objects.length}
                onAlign={handleAlignObjects}
                onDistribute={handleDistributeObjects}
                onReorder={handleReorderObjects}
                onDuplicate={handleDuplicateObjects}
                onSelectAll={handleSelectAllObjects}
              />
            </div>
          )}

          {/* 3. INTERACTIVE CANVAS GRID PORTAL */}
          {showHowToUse && (
            <div className="w-full flex justify-center px-4 mt-3 select-none no-print animate-fadeIn">
              <div className="max-w-[924px] w-full p-3.5 bg-white border border-slate-200 rounded-2xl shadow-md flex flex-col space-y-2 relative font-sans animate-fadeIn">
                <button 
                  type="button" 
                  onClick={() => setShowHowToUse(false)}
                  className="absolute top-2.5 right-2.5 p-1 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                  title="Đóng bảng hướng dẫn"
                >
                  <X className="w-4 h-4" />
                </button>
                
                <div className="flex items-center justify-between pb-1 border-b border-slate-100 pr-8">
                  <div className="flex items-center space-x-2">
                    <span className="text-[12.3px] font-black text-slate-800 uppercase tracking-widest">📌 HƯỚNG DẪN THIẾT KẾ VÀ IN TEM</span>
                    <span className="text-[10.8px] bg-sky-50 text-kiot-cyan font-black px-1.5 py-0.5 rounded uppercase border border-kiot-cyan/15">Tuần tự 4 bước</span>
                  </div>
                  {!desktop && (
                    <a
                      id="download-offline-link"
                      href={OFFLINE_DOWNLOAD_URL}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-[11px] font-black uppercase tracking-wide shadow-sm cursor-pointer transition-all active:scale-[0.98]"
                      title="Tải KiotLabel bản offline cho Windows (một tệp KiotLabel.exe, khoảng 16 MB): bấm đúp là chạy, không cần cài đặt hay giải nén, không cần Internet và in thẳng ra máy in tem"
                    >
                      <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Tải bản offline</span>
                    </a>
                  )}
                </div>

                <div className="space-y-1.5">
                  {/* DÒNG HÀNG 1: KHỔ TEM & GIẤY IN (LIÊN KẾT BƯỚC 1 & BƯỚC 2) */}
                  <div className="flex flex-col md:flex-row items-stretch border border-blue-200/90 rounded-xl bg-white overflow-hidden shadow-xs hover:shadow-sm transition-all duration-200">
                    {/* Nút KHỔ GIẤY IN - Solid Blue Left Anchor */}
                    <button
                      type="button"
                      onClick={() => setActiveSidebarTab('layout')}
                      className="w-full md:w-[130px] text-white bg-[#0070F4] hover:bg-[#0062d6] font-black py-2.5 px-2.5 flex items-center justify-center md:flex-col md:justify-center text-left md:text-center cursor-pointer transition-all active:scale-[0.99] border-0 outline-none shrink-0 rounded-t-xl md:rounded-tr-none md:rounded-l-xl rounded-b-none"
                      title="Chuyển sang tab Thiết lập Khổ tem & Giấy"
                    >
                      <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center text-[#0070F4] font-black text-[10.3px] shadow-sm shrink-0 mr-2 md:mr-0 md:mb-1 ring-2 ring-white/10">1</div>
                      <div className="flex flex-col md:items-center">
                        <span className="text-[11.8px] font-black tracking-wider uppercase font-sans leading-none">KHỔ GIẤY IN</span>
                        <span className="text-[9.3px] text-sky-100 font-bold normal-case leading-none mt-0.5 md:mt-1">Thiết lập khổ</span>
                      </div>
                    </button>

                    {/* Bước 1 & Bước 2 (Không còn viền lùi vào trong, sát lề cạnh) */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 items-stretch bg-white rounded-b-xl md:rounded-bl-none md:rounded-r-xl">
                      {/* Bước 1 */}
                      <div className="py-2 px-3 flex items-start space-x-2 transition-all hover:bg-slate-50/50">
                        <span className="px-1.5 py-[1px] mt-0.5 rounded bg-sky-100 text-sky-700 font-extrabold text-[11.3px] tracking-wide shrink-0 border border-sky-200">BƯỚC 1</span>
                        <div className="text-[13.8px] leading-snug flex-1">
                          <p className="font-extrabold text-[#0F172A] mb-0.5">Thiết lập kích thước khổ tem</p>
                          <p className="text-slate-500 font-semibold text-[12.8px] leading-tight">Cấu hình cỡ nhãn thực tế (Rộng x Cao) ở cột bên trái.</p>
                        </div>
                      </div>

                      {/* Bước 2 */}
                      <div className="py-2 px-3 flex items-start space-x-2 transition-all hover:bg-slate-50/50 border-t md:border-t-0 md:border-l border-blue-100/60">
                        <span className="px-1.5 py-[1px] mt-0.5 rounded bg-indigo-100 text-[#4338CA] font-extrabold text-[11.3px] tracking-wide shrink-0 border border-indigo-200">BƯỚC 2</span>
                        <div className="text-[13.8px] leading-snug flex-1">
                          <p className="font-extrabold text-[#0F172A] mb-0.5">Thiết lập khổ giấy và máy in</p>
                          <p className="text-slate-500 font-semibold text-[12.8px] leading-tight">Chọn loại giấy lẻ hoặc A4/A5 và căn lề giấy phù hợp.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* DÒNG HÀNG 2: THIẾT KẾ & IN TEM (LIÊN KẾT BƯỚC 3 & BƯỚC 4) */}
                  <div className="flex flex-col md:flex-row items-stretch border border-emerald-200/90 rounded-xl bg-white overflow-hidden shadow-xs hover:shadow-sm transition-all duration-200">
                    {/* Nút THIẾT KẾ TEM - Solid Emerald Left Anchor */}
                    <button
                      type="button"
                      onClick={() => setActiveSidebarTab('design')}
                      className="w-full md:w-[130px] text-white bg-[#00B63E] hover:bg-[#009e35] font-black py-2 px-2.5 flex items-center justify-center md:flex-col md:justify-center text-left md:text-center cursor-pointer transition-all active:scale-[0.99] border-0 outline-none shrink-0 rounded-t-xl md:rounded-tr-none md:rounded-l-xl rounded-b-none"
                      title="Chuyển sang tab Thiết kế tem"
                    >
                      <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center text-[#00B63E] font-black text-[10.3px] shadow-sm shrink-0 mr-2 md:mr-0 md:mb-1 ring-2 ring-white/10">2</div>
                      <div className="flex flex-col md:items-center">
                        <span className="text-[11.8px] font-black tracking-wider uppercase font-sans leading-none">THIẾT KẾ TEM</span>
                        <span className="text-[9.3px] text-emerald-100 font-bold normal-case leading-none mt-0.5 md:mt-1 font-sans">Vẽ & chỉnh sửa</span>
                      </div>
                    </button>

                    {/* Bước 3 & Bước 4 (Không còn viền lùi vào trong, sát lề cạnh) */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 items-stretch bg-white rounded-b-xl md:rounded-bl-none md:rounded-r-xl">
                      {/* Bước 3 */}
                      <div className="py-2 px-3 flex items-start space-x-2 transition-all hover:bg-slate-50/50">
                        <span className="px-1.5 py-[1px] mt-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold text-[11.3px] tracking-wide shrink-0 border border-emerald-200">BƯỚC 3</span>
                        <div className="text-[13.8px] leading-snug flex-1">
                          <p className="font-extrabold text-[#0F172A] mb-0.5">Thiết kế mẫu tem</p>
                          <p className="text-slate-500 font-semibold text-[12.8px] leading-tight">Thêm nội dung, mã vạch, QR. Nhấp chọn để chỉnh tọa độ.</p>
                        </div>
                      </div>

                      {/* Bước 4 */}
                      <div className="py-2 px-3 flex items-start space-x-2 transition-all hover:bg-slate-50/50 border-t md:border-t-0 md:border-l border-emerald-100/60">
                        <span className="px-1.5 py-[1px] mt-0.5 rounded bg-amber-100 text-amber-800 font-extrabold text-[11.3px] tracking-wide shrink-0 border border-amber-200">BƯỚC 4</span>
                        <div className="text-[13.8px] leading-snug flex-1">
                          <p className="font-extrabold text-[#0F172A] mb-0.5">In nhãn tem</p>
                          <p className="text-slate-500 font-semibold text-[12.8px] leading-tight font-sans">Chọn số lượng in và bấm <strong className="text-slate-700">IN TEM</strong> hoặc <strong className="text-slate-700">Ctrl+P</strong> ở góc trái.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <LabelCanvas
            labelConfig={labelConfig}
            objects={displayObjects}
            selectedId={selectedId}
            selectedIds={selectedIds}
            pixelScale={pixelScale}
            gridSnapSize={gridSnapSize}
            onSelectObject={(id) => handleSelectObject(id, false)}
            onSelectObjectWithModifier={handleSelectObject}
            onSelectMultipleObjects={(ids) => {
              setSelectedIds(ids);
              if (ids.length > 0) {
                setSelectedId(ids[ids.length - 1]);
              } else {
                setSelectedId(null);
              }
            }}
            onUpdateObjectCoordinates={handleUpdateCoordinates}
            onUpdateMultipleObjectsCoordinates={handleUpdateMultipleObjectsCoordinates}
            onUpdateObjectGeometry={handleUpdateGeometry}
            onDeleteObject={handleDeleteObject}
            isBatchPrinting={isBatchPrinting}
            excelData={excelData}
            resolveDynamicObjects={resolveDynamicObjectsForCell}
            sheetConfig={sheetConfig}
            officePreviewMode={officePreviewMode}
            printCopies={printCopies}
            printManifestLength={printManifest.length}
            isSystemPrinting={isSystemPrinting}
            onAddImageObject={(base64) => handleAddObject("image", base64)}
            onUpdateObject={handleUpdateObject}
            currentFilePath={currentFilePath}
            currentLocalStorageKey={currentLocalStorageKey}
            saveLogs={saveLogs}
            onUpdateGridSnapSize={setGridSnapSize}
            showHowToUse={showHowToUse}
            onToggleHowToUse={() => setShowHowToUse(!showHowToUse)}
            onQuickPrint={() => {
              setActiveSidebarTab('design');
              setIsPrintExpanded(true);
              // Wait a split second to transition tabs and open accordion, then focus/scroll to the accordion component
              setTimeout(() => {
                const step4Btn = document.querySelector('[title*="bản in và thực hiện in nhãn"]');
                if (step4Btn) {
                  step4Btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 150);
            }}
            printQuantityMode={printQuantityMode}
            onUpdatePrintQuantityMode={setPrintQuantityMode}
            printQuantityColumn={printQuantityColumn}
            onUpdatePrintQuantityColumn={setPrintQuantityColumn}
            numericExcelColumns={numericExcelColumns}
            onUpdatePrintCopies={setPrintCopies}
            onPrintLabel={handlePrintLabel}
            isPreparingPrint={isPreparingPrint}
            onSavePrintFile={handleSavePrintFile}
            isSavingFile={isSavingFile}
            isVectorExport={isVectorExporting}
            desktopPrint={desktop ? {
              printers: desktopPrinters,
              target: effectivePrintTarget,
              pdfValue: PDF_TARGET,
              onChangeTarget: (v: string) => { setPrintTarget(v); safeLocalStorage.setItem("kiotlabel_print_target", v); setDirectPrintMsg(null); },
              message: directPrintMsg,
            } : undefined}
            saveFileProgress={saveFileProgress}
            optimizeThermalBinarization={optimizeThermalBinarization}
            onUpdateOptimizeThermalBinarization={setOptimizeThermalBinarization}
            autoReleaseRam={autoReleaseRam}
            onUpdateAutoReleaseRam={setAutoReleaseRam}
            cachedPagesCount={cachedPagesCount}
            onClearCanvasMemory={clearCanvasMemory}
          />

          {/* TAB THANH CONG CỤ THIẾT KẾ ĐA TAB / SHEET (DƯỚI CHÂN TRANG - ĐẬM MÀU CAO CẤP CHUYÊN NGHIỆP) */}
          <div className="bg-slate-200 border-t border-slate-300 flex items-center justify-between px-3.5 h-12 select-none shrink-0 overflow-x-auto no-print scrollbar-thin shadow-inner">
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                const isEditing = tab.id === editingTabId;
                return (
                  <div
                    key={tab.id}
                    onClick={() => {
                      if (!isEditing) {
                        handleSwitchTab(tab.id);
                      }
                    }}
                    onDoubleClick={() => {
                      if (!isEditing) {
                        handleRenameTab(tab.id);
                      }
                    }}
                    className={`group relative flex items-center space-x-2 px-3.5 py-1.5 text-[11px] rounded-lg transition-all duration-150 cursor-pointer border ${
                      isActive
                        ? "bg-white text-kiot-cyan font-black border-kiot-cyan shadow-sm scale-102 z-10"
                        : "bg-slate-100 text-slate-600 hover:text-slate-800 hover:bg-white border-slate-300"
                    }`}
                    title={isEditing ? "" : "Nháy đúp chuột (Double click) để đổi tên bản thiết kế"}
                  >
                    <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-kiot-cyan animate-pulse" : "text-slate-400"}`} />
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingTabName}
                        onChange={(e) => setEditingTabName(e.target.value)}
                        onBlur={() => handleSaveTabName(tab.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSaveTabName(tab.id);
                          } else if (e.key === "Escape") {
                            setEditingTabId(null);
                          }
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="bg-slate-50 border border-kiot-cyan text-slate-800 px-1 py-0.5 rounded outline-none w-[110px] font-sans text-[11px]"
                      />
                    ) : (
                      <span className="truncate max-w-[130px] font-sans">
                        {tab.name}
                      </span>
                    )}
                    
                    {/* Rename tooltip or button on hover */}
                    {!isEditing && (
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-900 text-white text-[9px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-50 font-bold">
                        Đúp chuột để đổi tên
                      </span>
                    )}

                    {/* Delete tab button */}
                    {tabs.length > 1 && !isEditing && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteTabClick(tab.id, tab.name, e)}
                        className="p-0.5 ml-2 transition-all relative z-30 cursor-pointer shrink-0 flex items-center justify-center text-slate-400 hover:text-red-600 hover:scale-110"
                        title="Xóa mẫu thiết kế này"
                      >
                        <X className="w-5 h-5" strokeWidth={3} />
                      </button>
                    )}
                  </div>
                );
              })}
              
              {/* Nút Thêm Tab Mới */}
              <button
                type="button"
                onClick={handleAddTab}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:text-kiot-cyan hover:bg-slate-100 rounded-lg transition border border-dashed border-slate-400 hover:border-kiot-cyan/50 cursor-pointer"
                title="Thêm Mẫu Thiết Kế Mới"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline font-sans">Mẫu mới</span>
              </button>
            </div>
            
            {/* Tab info text */}
            <div className="hidden md:flex items-center space-x-2 text-[10px] text-slate-500 font-bold font-sans pr-1">
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                <span>Đa tab thiết kế hoạt động độc lập</span>
              </span>
              <span className="bg-sky-50 text-kiot-cyan px-2 py-0.5 rounded border border-kiot-cyan/25 text-[9px]">V3.5 - Ổn định</span>
            </div>
          </div>

        </main>
      </div>

      {/* 4. IFRAME PRINT PROTECTOR AND ASSISTANT MODAL (High Density Aesthetics) */}
      {showPrintModal && (
        <div id="print-guide-backdrop" className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print animate-fade-in">
          <div 
            id="print-guide-modal" 
            className="bg-white border border-gray-200 shadow-2xl rounded-xl max-w-md w-full overflow-hidden text-slate-800 p-6 flex flex-col space-y-5 animate-scale-up"
          >
            {/* Modal Header */}
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <Printer className="w-5 h-5 text-blue-600" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-slate-900 leading-tight">Hướng Dẫn In Nhãn Nhiệt Chính Xác</h3>
                <p className="text-xs text-slate-500">Mở ứng dụng rộng để được liên kết trực tiếp tới trình duyệt ẩn.</p>
              </div>
            </div>

            {/* Modal Body / Explanation */}
            <div className="bg-amber-50/70 border border-amber-200/50 rounded-lg p-3 text-xs text-amber-900 flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Hạn Chế Của Trình Duyệt Web (Sandbox Iframe)</p>
                <p className="leading-normal text-[11px] text-amber-950">
                  Bạn đang chạy ứng dụng trong màn hình Xem trước (Iframe) của Google AI Studio. Trình duyệt Chrome/Edge chặn lệnh in từ bên trong khung con này để bảo mật.
                </p>
              </div>
            </div>

            <div className="text-xs text-gray-650 leading-relaxed font-normal space-y-2">
              <p>
                Để khởi chạy hộp thoại **Print Preview** của hệ điều hành Windows/macOS và in nhiệt trực tiếp ra máy in Brother/Xprinter/Zebra:
              </p>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px] font-medium text-slate-700">
                <li>Bấm vào nút **Mở Tab Mới** bên dưới</li>
                <li>Ứng dụng sẽ hoạt động tại 1 tab độc lập đầy đủ chức năng</li>
                <li>Trình duyệt hỗ trợ gọi hộp thoại in dán ngay lập tức!</li>
              </ol>
            </div>

            {/* Modal Actions */}
            <div className="space-y-2 pt-1 border-t border-gray-150">
              {/* RECOMMENDED ACT: Open direct tab */}
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowPrintModal(false)}
                className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-sm hover:shadow-md transition text-center text-xs tracking-wider uppercase cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở Trong Tab Mới Để In (Khuyên Dùng)</span>
              </a>

              {/* Best effort try now */}
              <button
                type="button"
                disabled={isPreparingPrint}
                onClick={() => {
                  setShowPrintModal(false);
                  setIsPreparingPrint(true);
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      setTimeout(() => {
                        window.focus();
                        window.print();
                        setTimeout(() => {
                          setIsPreparingPrint(false);
                        }, 800);
                      }, 500);
                    });
                  });
                }}
                className={`w-full py-2 border rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                  isPreparingPrint
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "border-gray-300 hover:bg-slate-50 text-slate-700 cursor-pointer"
                }`}
              >
                {isPreparingPrint ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang chuẩn bị vẽ nhãn...</span>
                  </>
                ) : (
                  <span>Xem trước & In trực tiếp tại đây</span>
                )}
              </button>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="py-1 px-3 border border-transparent rounded hover:bg-slate-100 text-slate-500 text-[11px] font-semibold transition cursor-pointer"
                >
                  Bỏ qua
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG XÁC NHẬN ĐÓNG TAB THIẾT KẾ (CHỐNG TẮT NHẦM) */}
      {tabToDelete && (
        <div id="tab-delete-backdrop" className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print animate-fade-in">
          <div 
            id="tab-delete-modal" 
            className="bg-white border border-gray-200 shadow-2xl rounded-xl max-w-sm w-full overflow-hidden text-slate-800 p-6 flex flex-col space-y-4 animate-scale-up"
          >
            {/* Modal Header */}
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0 text-red-600">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-slate-900 leading-tight">Xác Nhận Đóng Thiết Kế</h3>
                <p className="text-xs text-slate-500">Mẫu: <strong className="text-slate-800 font-bold">{tabToDelete.name}</strong></p>
              </div>
            </div>

            {/* Modal Content */}
            <div className="text-xs text-slate-600 leading-relaxed">
              <p>
                Bạn có chắc chắn muốn xóa bản thiết kế <strong className="text-red-600 font-semibold">"{tabToDelete.name}"</strong>? 
                Hành động này sẽ xóa toàn bộ nội dung của mẫu thiết kế này và <strong>không thể hoàn tác</strong> lại.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-150">
              <button
                type="button"
                onClick={() => setTabToDelete(null)}
                className="py-2 px-4 border border-gray-300 rounded-lg hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Hủy bỏ (Giữ lại)
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTab}
                className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm hover:shadow cursor-pointer flex items-center space-x-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Đồng ý xóa mẫu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showPopupBlockedModal && (
        <div id="popup-blocked-backdrop" className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print animate-fade-in">
          <div 
            id="popup-blocked-modal" 
            className="bg-white border border-gray-200 shadow-2xl rounded-xl max-w-md w-full overflow-hidden text-slate-800 p-6 flex flex-col space-y-4 animate-scale-up"
          >
            {/* Header */}
            <div className="flex items-start space-x-3.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${
                isPopupBlocked ? "bg-amber-50 border-amber-100 text-amber-600" : "bg-emerald-50 border-emerald-100 text-emerald-600"
              }`}>
                {isPopupBlocked ? <AlertCircle className="w-5 h-5 animate-bounce" /> : <CheckCircle className="w-5 h-5" />}
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-slate-900 leading-tight">
                  {isPopupBlocked ? "Yêu Cầu Cấp Quyền Mở Bản In PDF" : "Đã Khởi Tạo Bản In PDF Thành Công"}
                </h3>
                <p className="text-xs text-slate-500">
                  {isPopupBlocked ? "Trình duyệt đã ngăn cửa sổ bật lên tự động" : "Bản in PDF chất lượng cao 300 DPI đã sẵn sàng"}
                </p>
              </div>
            </div>

            {/* Warning / Informative box */}
            {isPopupBlocked ? (
              <div className="bg-amber-50 border border-amber-200/60 rounded-lg p-3 text-xs text-amber-900 space-y-2">
                <p className="font-semibold leading-normal flex items-center space-x-1">
                  <span>⚠️ Phát hiện trình duyệt chặn mở liên kết mới (Pop-up)!</span>
                </p>
                <p className="leading-relaxed text-[11px] text-amber-950">
                  Để tự động mở trực tiếp bản in trong những lần tiếp theo, bạn vui lòng bấm vào biểu tượng <strong>Chặn cửa sổ bật lên</strong> trên thanh địa chỉ trình duyệt (ở góc trên bên phải) và chọn <strong>"Luôn cho phép..."</strong> cho trang web này.
                </p>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200/65 rounded-lg p-3 text-xs text-emerald-900 space-y-1.5">
                <p className="font-semibold">
                  🎉 Bản in đã được chuyển sang tab mới!
                </p>
                <p className="leading-relaxed text-[11px] text-emerald-950">
                  Vui lòng chuyển sang tab trình duyệt mới vừa mở, kiểm tra nhãn dán hiển thị cực kỳ sắc nét và nhấn <strong>Ctrl + P</strong> (hoặc Cmd + P trên Mac) để in dán ngay lập tức.
                </p>
              </div>
            )}

            <div className="text-xs text-gray-500 leading-relaxed font-normal bg-slate-50 border border-slate-100 rounded-lg p-2.5">
              <p className="font-medium text-slate-700 mb-1">Mẹo in tem chuẩn xác nhất:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-0.5">
                <li>Chọn đúng máy in tem (máy in nhiệt hoặc máy văn phòng).</li>
                <li>Phần kích thước giấy (Paper size) chọn đúng kích thước thực tế tem.</li>
                <li>Phần Tỷ lệ (Scale) đặt là <strong>100%</strong> hoặc <strong>Fit to page (Vừa với trang)</strong>.</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-gray-150 flex flex-col">
              <a
                href={popupBlobUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  // If they click, we assume they are opening it manually
                  setIsPopupBlocked(false);
                }}
                className="w-full flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-sm transition text-center text-xs tracking-wider uppercase cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{isPopupBlocked ? "Mở Bản In Thủ Công" : "Mở Lại Bản In (Tab Mới)"}</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setShowPopupBlockedModal(false);
                }}
                className="w-full py-2 bg-white border border-gray-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-xs transition cursor-pointer"
              >
                Đóng thông báo
              </button>
            </div>
          </div>
        </div>
      )}

      {showImageImportModal && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print animate-fade-in"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowImageImportModal(false); setImportError(""); } }}
        >
          <div className="bg-white border border-gray-200 shadow-2xl rounded-xl max-w-lg w-full overflow-hidden text-slate-800 p-6 flex flex-col space-y-4 animate-scale-up">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center">
                  <Image className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 leading-tight">Chèn Hình Ảnh Vào Nhãn Dán</h3>
                  <p className="text-[10.5px] text-slate-500 font-medium">Hỗ trợ tải lên logo, con dấu tròn, ký hiệu, ảnh sản phẩm...</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowImageImportModal(false);
                  setImportError("");
                }}
                className="p-1 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importError && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-[11px] rounded-lg font-medium flex items-center space-x-2 animate-pulse">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {/* Drag & Drop Zone */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider text-[10px]">Cách 1: Tải lên từ máy tính (Khuyên dùng - Hoạt động Offline)</label>
              <div 
                className="border-2 border-dashed border-gray-200 hover:border-kiot-cyan bg-gray-50/50 hover:bg-sky-50/5 rounded-xl p-5 text-center transition duration-150 cursor-pointer relative"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          handleAddObject("image", event.target.result as string);
                          setShowImageImportModal(false);
                          setImportError("");
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  };
                  input.click();
                }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.type.startsWith("image/")) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      if (event.target?.result) {
                        handleAddObject("image", event.target.result as string);
                        setShowImageImportModal(false);
                        setImportError("");
                      }
                    };
                    reader.readAsDataURL(file);
                  } else {
                    setImportError("Tệp tin thả vào không đúng định dạng hình ảnh!");
                  }
                }}
              >
                <div className="flex flex-col items-center justify-center space-y-2 select-none">
                  <Upload className="w-7 h-7 text-gray-400 active:text-kiot-cyan inline-block shrink-0" />
                  <p className="text-xs font-bold text-gray-700">Kéo thả file hình ảnh vào đây hoặc click để chọn</p>
                  <p className="text-[10px] text-gray-405">Hỗ trợ các tệp: JPEG, PNG, JPG, SVG, WebP, GIF...</p>
                </div>
              </div>
            </div>

            {/* Google Drive Link Option (cần Internet: ẩn ở bản desktop offline) */}
            <div className={desktop ? "hidden" : "space-y-2 border-t border-gray-150 pt-3"}>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider text-[10px]">Cách 2: Chèn ảnh từ Google Drive</label>
              
              <div className="flex items-center space-x-1.5">
                <div className="relative flex-1">
                  <input 
                    type="text"
                    value={driveUrlInput}
                    onChange={(e) => setDriveUrlInput(e.target.value)}
                    placeholder="Dán link chia sẻ Google Drive (Bất kỳ ai có liên kết...)"
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan/50 bg-white"
                  />
                  <Link className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!driveUrlInput.trim()) {
                      setImportError("Vui lòng nhập đường dẫn chia sẻ từ Google Drive!");
                      return;
                    }
                    // Extract ID and convert 
                    let match = driveUrlInput.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                    let fileId = "";
                    if (match && match[1]) {
                      fileId = match[1];
                    } else {
                      match = driveUrlInput.match(/id=([a-zA-Z0-9_-]+)/);
                      if (match && match[1]) {
                        fileId = match[1];
                      }
                    }

                    if (!fileId) {
                      setImportError("Đường dẫn Google Drive không hợp lệ hoặc thiếu File ID!");
                      return;
                    }

                    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
                    handleAddObject("image", directUrl);
                    setDriveUrlInput("");
                    setShowImageImportModal(false);
                    setImportError("");
                  }}
                  className="px-4 py-1.5 bg-kiot-cyan hover:bg-sky-600 text-white text-xs font-bold rounded-lg transition shrink-0 cursor-pointer"
                >
                  Xác nhận
                </button>
              </div>
              <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-2.5 text-[10px] text-blue-900 leading-relaxed select-none">
                <strong>📝 Hướng dẫn:</strong> Trên Google Drive của bạn, click chuột phải vào ảnh ➡️ Chọn <strong>Chia sẻ (Share)</strong> ➡️ Chuyển quyền truy cập chung thành <strong>Bất kỳ ai có liên kết (Anyone with link)</strong> ➡️ Nhấp <strong>Sao chép liên kết</strong> rồi dán vào ô trên.
              </div>
            </div>

            {/* Custom Web Image Link (cần Internet: ẩn ở bản desktop offline) */}
            <div className={desktop ? "hidden" : "space-y-2 border-t border-gray-150 pt-3"}>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider text-[10px]">Cách 3: Chèn đường dẫn ảnh trực tuyến công khai (Web URL)</label>
              <div className="flex items-center space-x-1.5">
                <div className="relative flex-1">
                  <input 
                    type="text"
                    value={webUrlInput}
                    onChange={(e) => setWebUrlInput(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:border-kiot-cyan focus:ring-1 focus:ring-kiot-cyan/50 bg-white"
                  />
                  <Link className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!webUrlInput.trim()) {
                      setImportError("Vui lòng nhập đường dẫn hình ảnh!");
                      return;
                    }
                    if (!webUrlInput.startsWith("http://") && !webUrlInput.startsWith("https://")) {
                      setImportError("Đường dẫn ảnh trực tuyến phải bắt đầu bằng http:// hoặc https://");
                      return;
                    }
                    handleAddObject("image", webUrlInput);
                    setWebUrlInput("");
                    setShowImageImportModal(false);
                    setImportError("");
                  }}
                  className="px-4 py-1.5 bg-kiot-cyan hover:bg-sky-600 text-white text-xs font-bold rounded-lg transition shrink-0 cursor-pointer"
                >
                  Xác nhận
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {showSaveDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 no-print animate-fadeIn text-slate-800">
          <div className="bg-white border border-slate-100 shadow-2xl rounded-2xl max-w-sm w-full p-5 flex flex-col space-y-4 animate-scaleUp">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <Save className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-[14px] text-slate-800 leading-tight">Lưu mẫu thiết kế</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">Chọn phương thức và đặt tên để lưu trữ</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveLocation(null);
                }}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Destination Selection */}
            <div className="space-y-2">
              <label className="block text-[10.5px] font-extrabold text-slate-450 uppercase tracking-wider">
                1. Chọn nơi lưu trữ thiết kế:
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Local Storage Option */}
                <button
                  type="button"
                  onClick={() => setSaveLocation('local')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col items-start space-y-2 group ${
                    saveLocation === 'local'
                      ? 'border-kiot-green bg-emerald-50/50 ring-2 ring-kiot-green/10'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${saveLocation === 'local' ? 'bg-kiot-green text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'} transition-colors`}>
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-[11.5px] font-extrabold text-slate-800">Bộ nhớ duyệt web</h4>
                    <p className="text-[9.5px] text-slate-455 font-medium leading-normal mt-0.5">Lưu trữ cục bộ, an toàn trên trình duyệt máy bạn</p>
                  </div>
                </button>

                {/* Device Option */}
                <button
                  type="button"
                  onClick={() => setSaveLocation('device')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col items-start space-y-2 group ${
                    saveLocation === 'device'
                      ? 'border-kiot-green bg-emerald-50/50 ring-2 ring-kiot-green/10'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${saveLocation === 'device' ? 'bg-kiot-green text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'} transition-colors`}>
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-[11.5px] font-extrabold text-slate-800">Bộ nhớ thiết bị</h4>
                    <p className="text-[9.5px] text-slate-455 font-medium leading-normal mt-0.5">Tải file cấu hình offline (.kvl) về ổ cứng</p>
                  </div>
                </button>
              </div>

              {saveLocation === 'device' && typeof window !== 'undefined' && window.self !== window.top && (
                <div className="mt-3 p-2.5 bg-amber-50 rounded-lg text-[10px] text-amber-800 leading-relaxed border border-amber-200/50 animate-fadeIn">
                  💡 <strong>Giới hạn của Iframe:</strong> Trình duyệt chặn quyền ghi đè trực tiếp file khi trang web nằm trong khung xem thử của AI Studio. Hệ thống sẽ tự động tải file xuống qua trình duyệt. Để mở khóa tính năng <strong>tự động lưu đè trực tiếp (Ctrl + S)</strong>, bạn chỉ cần click nút <strong>"Mở tab mới"</strong> ở góc trên bên phải màn hình để chạy ứng dụng độc lập.
                </div>
              )}
            </div>

            {/* Step 2: Form Settings (Visible only when a destination is chosen) */}
            {saveLocation && (
              <div className="space-y-3.5 pt-3.5 border-t border-dashed border-slate-150 animate-fadeIn">
                {/* Section title */}
                <span className="block text-[10.5px] font-extrabold text-slate-450 uppercase tracking-wider">
                  2. Cấu hình chi tiết:
                </span>

                {/* Name Input */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600">
                    Tên mẫu nhãn dán:
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Tem Giá Rẻ, Nhãn Vận Đơn..."
                    value={saveTemplateName}
                    onChange={(e) => setSaveTemplateName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:border-kiot-green focus:ring-1 focus:ring-kiot-green focus:outline-none font-bold text-slate-800 text-xs"
                  />
                </div>

                {/* Footer confirm/save action */}
                <div className="flex items-center space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSaveDialog(false);
                      setSaveLocation(null);
                    }}
                    className="flex-1 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-xs font-bold text-slate-500 transition cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const finalName = saveTemplateName.trim() || `Bản vẽ ${new Date().toLocaleDateString("vi-VN")}`;
                      if (saveLocation === 'local') {
                        handleSaveToLocalStorage(finalName);
                        setCustomSaveName(finalName); // update state in header
                        setShowSaveDialog(false);
                        setSaveLocation(null);
                      } else if (saveLocation === 'device') {
                        // Pass onSuccess callback to close only when the file select action actually finishes
                        setCustomSaveName(finalName); // update state in header first
                        handleExportToFile(finalName, 'kvl', () => {
                          setShowSaveDialog(false);
                          setSaveLocation(null);
                        });
                      }
                    }}
                    className="flex-1 py-1.5 bg-kiot-green hover:bg-emerald-600 text-white rounded-lg text-xs font-extrabold uppercase transition cursor-pointer shadow-md flex items-center justify-center space-x-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Xác nhận Lưu</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
