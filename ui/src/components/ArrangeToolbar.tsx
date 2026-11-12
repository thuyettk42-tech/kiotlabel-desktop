/**
 * Thanh "Sắp xếp": căn chỉnh, phân bố, thứ tự lớp, nhân đôi, chọn tất cả.
 */
import React from "react";
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  BringToFront,
  SendToBack,
  ArrowUp,
  ArrowDown,
  CopyPlus,
  BoxSelect,
} from "lucide-react";
import type { AlignMode, DistributeAxis, OrderAction } from "../utils/arrange";

interface ArrangeToolbarProps {
  selectedCount: number;
  totalCount: number;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onReorder: (action: OrderAction) => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
}

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md border transition-all duration-150 flex items-center justify-center ${
        disabled
          ? "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed"
          : "bg-white border-gray-200 text-slate-700 hover:bg-sky-50 hover:border-kiot-cyan hover:text-kiot-navy cursor-pointer active:scale-95"
      }`}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="hidden lg:inline text-[10px] font-black uppercase tracking-wider text-slate-400 mr-0.5 select-none">
        {label}
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

export function ArrangeToolbar({
  selectedCount,
  totalCount,
  onAlign,
  onDistribute,
  onReorder,
  onDuplicate,
  onSelectAll,
}: ArrangeToolbarProps) {
  const has = selectedCount >= 1;
  const many = selectedCount >= 2;
  const three = selectedCount >= 3;
  const alignHint = many ? "theo nhóm đã chọn" : "vào phôi tem";
  const size = "w-4 h-4";

  return (
    <div
      id="arrange-toolbar"
      className="no-print w-fit max-w-full flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-3 py-1.5 bg-white border border-gray-150 rounded-xl shadow-xs select-none"
    >
      <Group label="Căn chỉnh">
        <IconButton title={`Căn trái ${alignHint}`} disabled={!has} onClick={() => onAlign("left")}>
          <AlignStartVertical className={size} />
        </IconButton>
        <IconButton title={`Căn giữa theo chiều ngang ${alignHint}`} disabled={!has} onClick={() => onAlign("hcenter")}>
          <AlignCenterVertical className={size} />
        </IconButton>
        <IconButton title={`Căn phải ${alignHint}`} disabled={!has} onClick={() => onAlign("right")}>
          <AlignEndVertical className={size} />
        </IconButton>
        <span className="w-px h-5 bg-gray-200 mx-0.5" />
        <IconButton title={`Căn trên ${alignHint}`} disabled={!has} onClick={() => onAlign("top")}>
          <AlignStartHorizontal className={size} />
        </IconButton>
        <IconButton title={`Căn giữa theo chiều dọc ${alignHint}`} disabled={!has} onClick={() => onAlign("vmiddle")}>
          <AlignCenterHorizontal className={size} />
        </IconButton>
        <IconButton title={`Căn dưới ${alignHint}`} disabled={!has} onClick={() => onAlign("bottom")}>
          <AlignEndHorizontal className={size} />
        </IconButton>
      </Group>

      <Group label="Phân bố">
        <IconButton
          title="Phân bố đều theo chiều ngang (chọn từ 3 đối tượng)"
          disabled={!three}
          onClick={() => onDistribute("horizontal")}
        >
          <AlignHorizontalSpaceBetween className={size} />
        </IconButton>
        <IconButton
          title="Phân bố đều theo chiều dọc (chọn từ 3 đối tượng)"
          disabled={!three}
          onClick={() => onDistribute("vertical")}
        >
          <AlignVerticalSpaceBetween className={size} />
        </IconButton>
      </Group>

      <Group label="Lớp">
        <IconButton title="Đưa lên trên cùng (Ctrl+Shift+])" disabled={!has} onClick={() => onReorder("front")}>
          <BringToFront className={size} />
        </IconButton>
        <IconButton title="Đưa lên một lớp (Ctrl+])" disabled={!has} onClick={() => onReorder("forward")}>
          <ArrowUp className={size} />
        </IconButton>
        <IconButton title="Đưa xuống một lớp (Ctrl+[)" disabled={!has} onClick={() => onReorder("backward")}>
          <ArrowDown className={size} />
        </IconButton>
        <IconButton title="Đưa xuống dưới cùng (Ctrl+Shift+[)" disabled={!has} onClick={() => onReorder("back")}>
          <SendToBack className={size} />
        </IconButton>
      </Group>

      <Group label="Chọn">
        <IconButton title="Nhân đôi đối tượng đã chọn (Ctrl+D)" disabled={!has} onClick={onDuplicate}>
          <CopyPlus className={size} />
        </IconButton>
        <IconButton title="Chọn tất cả đối tượng (Ctrl+A)" disabled={totalCount === 0} onClick={onSelectAll}>
          <BoxSelect className={size} />
        </IconButton>
        <span className="text-[10.5px] font-bold text-slate-500 ml-1 whitespace-nowrap">
          {has ? `Đang chọn ${selectedCount}/${totalCount}` : `${totalCount} đối tượng`}
        </span>
      </Group>
    </div>
  );
}

export default ArrangeToolbar;
