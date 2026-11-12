/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an uncaught exception:", error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  private handleResetAndReload = () => {
    try {
      // Clear main saved key to reset if state/storage corruption occurred
      localStorage.removeItem("barcode_designer_saved_v1");
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  private handleReloadOnly = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-lg w-full p-8 shadow-xl text-center">
            {/* Warning Icon */}
            <div className="inline-flex items-center justify-center w-14 h-14 bg-rose-50 rounded-full text-rose-500 mb-6">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h1 className="text-xl font-black text-slate-800 mb-2">Đã xảy ra lỗi hệ thống</h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Không thể tải giao diện KiotLabel do một lỗi phát sinh bất ngờ. Lỗi này có thể xảy ra do xung đột dữ liệu cũ hoặc trình duyệt offline bị gián hạn.
            </p>

            {/* Error Message Collapse */}
            <div className="bg-rose-50/70 border border-rose-100 rounded-lg p-4 mb-6 text-left">
              <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wide block mb-1">Chi tiết kỹ thuật:</span>
              <code className="block font-mono text-xs text-rose-600 word-break break-all max-h-32 overflow-auto whitespace-pre-wrap leading-relaxed">
                {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
              </code>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={this.handleReloadOnly}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                Tải lại trang
              </button>
              <button
                onClick={this.handleResetAndReload}
                className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-sm"
                title="Khôi phục cài đặt gốc, giải quyết xung đột dữ liệu lưu trữ"
              >
                Xóa dữ liệu lưu trữ & Khởi động lại
              </button>
            </div>
            
            <p className="text-[10.5px] text-slate-400 mt-6 leading-normal">
              Nếu lỗi vẫn tiếp diễn, vui lòng kiểm tra tệp tin Excel liên kết hoặc cấu hình cài đặt offline.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
