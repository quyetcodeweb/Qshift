import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { API_URL } from "../services/api";

const LAYOUT_STORAGE_KEY = "qshift:schedule-export-layout:v2";
const PAPER_SIZES = [
  { value: "A5", label: "A5 · 148 × 210 mm" },
  { value: "A4", label: "A4 · 210 × 297 mm" },
  { value: "A3", label: "A3 · 297 × 420 mm" },
  { value: "LETTER", label: "Letter · 216 × 279 mm" },
];

const DEFAULT_LAYOUT = {
  serialColumnWidth: 5.78,
  dateColumnWidth: 8.66,
  employeeColumnWidth: 13.78,
  rowHeight: 28.05,
  paperSize: "A4",
  rowsPerPage: 16,
};

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function cloneDefaultLayout() {
  return { ...DEFAULT_LAYOUT };
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number * 100) / 100));
}

function normalizePaperSize(value) {
  return PAPER_SIZES.some((item) => item.value === value) ? value : "A4";
}

function normalizeLayout(value) {
  const defaults = cloneDefaultLayout();
  if (!value || typeof value !== "object") return defaults;

  const legacyWidths = Array.isArray(value.columnWidths)
    ? value.columnWidths
    : [];

  return {
    serialColumnWidth: clampNumber(
      value.serialColumnWidth ?? legacyWidths[0],
      defaults.serialColumnWidth,
      4,
      100,
    ),
    dateColumnWidth: clampNumber(
      value.dateColumnWidth ?? legacyWidths[1],
      defaults.dateColumnWidth,
      5,
      100,
    ),
    employeeColumnWidth: clampNumber(
      value.employeeColumnWidth ?? legacyWidths[2],
      defaults.employeeColumnWidth,
      8,
      100,
    ),
    rowHeight: clampNumber(value.rowHeight, defaults.rowHeight, 18, 72),
    paperSize: normalizePaperSize(value.paperSize),
    rowsPerPage: clampNumber(value.rowsPerPage, defaults.rowsPerPage, 1, 31),
  };
}

function getStoredLayout() {
  try {
    return normalizeLayout(
      JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)),
    );
  } catch {
    return cloneDefaultLayout();
  }
}

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return "Chưa chọn thời gian";
  const format = (value) =>
    new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return startDate === endDate
    ? format(startDate)
    : `${format(startDate)} – ${format(endDate)}`;
}

function paperSizeLabel(value) {
  return PAPER_SIZES.find((item) => item.value === value)?.value || "A4";
}

function splitIntoPages(items, pageSize) {
  const pages = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }
  return pages;
}

function groupColumnCount(group) {
  return Math.max(3, Number(group?.employeeColumnCount) || 0);
}

function assignmentFor(day, shiftId) {
  return (
    day?.assignments?.[shiftId] || day?.assignments?.[String(shiftId)] || []
  );
}

function ExportPreviewTable({
  days,
  shiftGroups,
  layout,
  pageNumber,
  totalPages,
}) {
  const rowHeight = Math.max(
    30,
    Math.round(Number(layout?.rowHeight || DEFAULT_LAYOUT.rowHeight) * 1.22),
  );
  const groups = shiftGroups || [];
  const employeeColumns = groups.flatMap((group) =>
    Array.from({ length: groupColumnCount(group) }, (_, index) => ({
      key: `${group.shiftId}-${index}`,
      width: Number(
        layout?.employeeColumnWidth || DEFAULT_LAYOUT.employeeColumnWidth,
      ),
    })),
  );
  const columns = [
    {
      key: "serial",
      width: Number(
        layout?.serialColumnWidth || DEFAULT_LAYOUT.serialColumnWidth,
      ),
    },
    {
      key: "date",
      width: Number(layout?.dateColumnWidth || DEFAULT_LAYOUT.dateColumnWidth),
    },
    ...employeeColumns,
  ];
  const totalColumns = columns.length;
  const tableWidth = columns.reduce(
    (total, column) => total + column.width * 7,
    0,
  );
  const fontSize = Math.max(10, Math.min(12, rowHeight / 3.1));

  return (
    <section
      className="mx-auto w-fit max-w-full"
      aria-label={`Trang xem trước ${pageNumber}`}
    >
      <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold text-gray-400">
        <span>{paperSizeLabel(layout?.paperSize)} ngang</span>
        <span>
          Trang {pageNumber}/{totalPages}
        </span>
      </div>
      <div className="overflow-auto rounded-xl border border-gray-200 bg-white p-2 shadow-[0_16px_42px_rgba(17,24,39,0.08)]">
        <table
          className="border-collapse text-center text-gray-950"
          style={{
            width: `${tableWidth}px`,
            tableLayout: "fixed",
            fontSize: `${fontSize}px`,
          }}
        >
          <colgroup>
            {columns.map((column) => (
              <col
                key={column.key}
                style={{ width: `${column.width * 7}px` }}
              />
            ))}
          </colgroup>
          <tbody>
            <tr>
              <th
                colSpan={totalColumns}
                className="border border-black bg-[#e7e6e6] px-2 font-bold tracking-[0.04em]"
                style={{ height: `${rowHeight}px` }}
              >
                BẢNG PHÂN CÔNG - THEO CA
              </th>
            </tr>
            <tr>
              <th
                rowSpan="2"
                className="border border-black bg-[#e7e6e6] px-1 font-bold"
                style={{ height: `${rowHeight}px` }}
              >
                STT
              </th>
              <th
                rowSpan="2"
                className="border border-black bg-[#e7e6e6] px-1 font-bold"
              >
                NGÀY
              </th>
              {groups.map((group) => (
                <th
                  key={group.shiftId}
                  colSpan={groupColumnCount(group)}
                  className="border border-black bg-[#e7e6e6] px-1 font-bold"
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              {groups.map((group) => (
                <th
                  key={`${group.shiftId}-employee-label`}
                  colSpan={groupColumnCount(group)}
                  className="border border-black bg-[#e7e6e6] px-1 text-[0.84em] font-bold"
                  style={{ height: `${rowHeight}px` }}
                >
                  TÊN NHÂN VIÊN
                </th>
              ))}
            </tr>
            {days.map((day) => (
              <tr key={day.date}>
                <td
                  className="border border-black bg-[#e7e6e6] px-1 font-semibold"
                  style={{ height: `${rowHeight}px` }}
                >
                  {day.dayNumber}
                </td>
                <td className="border border-black bg-[#e7e6e6] px-1 font-semibold">
                  {day.dateLabel}
                </td>
                {groups.flatMap((group) => {
                  const assignments = assignmentFor(day, group.shiftId);
                  return Array.from(
                    { length: groupColumnCount(group) },
                    (_, index) => (
                      <td
                        key={`${day.date}-${group.shiftId}-${index}`}
                        className="border border-black bg-white px-1 font-medium"
                      >
                        {assignments[index] || ""}
                      </td>
                    ),
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ScheduleExportModal({ open, onClose, initialRange }) {
  const [startDate, setStartDate] = useState(initialRange?.startDate || "");
  const [endDate, setEndDate] = useState(initialRange?.endDate || "");
  const [layout, setLayout] = useState(getStoredLayout);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStartDate(initialRange?.startDate || "");
    setEndDate(initialRange?.endDate || "");
    setPreview(null);
    setPreviewError("");
  }, [initialRange?.endDate, initialRange?.startDate, open]);

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    if (!open || !startDate || !endDate || startDate > endDate) {
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError("");

      try {
        const response = await axios.post(
          `${API_URL}/schedules/export/preview`,
          { startDate, endDate, layout },
          { headers: authHeaders(), signal: controller.signal },
        );
        setPreview(response.data);
      } catch (error) {
        if (error.code === "ERR_CANCELED") return;
        setPreview(null);
        setPreviewError(
          error.response?.data?.message ||
            "Không thể tải bản xem trước. Vui lòng thử lại.",
        );
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [endDate, layout, open, startDate]);

  const pages = useMemo(() => {
    if (!preview?.days?.length) return [];
    return splitIntoPages(
      preview.days,
      preview.rowsPerPage || preview.layout?.rowsPerPage || layout.rowsPerPage,
    );
  }, [layout.rowsPerPage, preview]);

  const previewIsCurrent = Boolean(
    preview &&
    preview.startDate === startDate &&
    preview.endDate === endDate &&
    Number(preview.layout?.serialColumnWidth) ===
      Number(layout.serialColumnWidth) &&
    Number(preview.layout?.dateColumnWidth) ===
      Number(layout.dateColumnWidth) &&
    Number(preview.layout?.employeeColumnWidth) ===
      Number(layout.employeeColumnWidth) &&
    Number(preview.layout?.rowHeight) === Number(layout.rowHeight) &&
    preview.layout?.paperSize === layout.paperSize,
  );

  const updateLayoutNumber = (key, value, min, max) => {
    if (value === "") return;
    setLayout((current) => ({
      ...current,
      [key]: clampNumber(value, current[key], min, max),
    }));
  };

  const downloadWorkbook = async () => {
    if (!previewIsCurrent || !startDate || !endDate || startDate > endDate)
      return;

    setExportLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/schedules/export`,
        { startDate, endDate, layout },
        {
          headers: authHeaders(),
          responseType: "blob",
        },
      );
      const url = URL.createObjectURL(
        new Blob([response.data], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `lich-lam-viec_${startDate}_${endDate}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      window.appPopup?.({
        type: "success",
        title: "Đã tải file Excel",
        message: `Lịch làm việc ${formatDateRange(startDate, endDate)} đã sẵn sàng.`,
      });
    } catch (error) {
      window.appPopup?.({
        type: "error",
        title: "Không thể xuất file",
        message:
          error.response?.data?.message ||
          "Không thể tạo file Excel. Vui lòng thử lại.",
      });
    } finally {
      setExportLoading(false);
    }
  };

  if (!open) return null;

  const invalidRange = Boolean(startDate && endDate && startDate > endDate);
  const activeLayout = preview?.layout || layout;
  const summary = preview?.summary || {};

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 p-0 sm:items-center sm:p-4">
      <section
        className="relative flex h-[100dvh] min-h-0 w-full max-w-[1440px] flex-col overflow-hidden rounded-t-2xl bg-gray-50 shadow-2xl sm:h-[calc(100dvh-2rem)] sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-export-title"
      >
        <h2 id="schedule-export-title" className="sr-only">
          Xuất Excel lịch làm việc
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-gray-500 shadow-sm ring-1 ring-gray-200 transition hover:bg-white hover:text-gray-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          aria-label="Đóng xuất Excel"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid min-h-full grid-cols-1 lg:grid-cols-[minmax(19rem,0.72fr)_minmax(0,1.48fr)]">
            <aside className="border-b border-gray-200 bg-white p-4 pt-5 sm:p-6 lg:border-b-0 lg:border-r">
              <section>
                <h3 className="text-sm font-bold text-gray-950">
                  Phạm vi xuất
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <label className="block text-sm font-semibold text-gray-700">
                    Từ ngày
                    <input
                      type="date"
                      value={startDate}
                      max={endDate || undefined}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-gray-700">
                    Đến ngày
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>
                {invalidRange && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.
                  </p>
                )}
              </section>

              <section className="mt-6 border-t border-gray-200 pt-5">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-950">
                  <AdjustmentsHorizontalIcon className="h-4 w-4 text-blue-700" />
                  Kích thước biểu mẫu
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="col-span-2 block text-xs font-bold text-gray-700">
                    Khổ giấy
                    <select
                      value={layout.paperSize}
                      onChange={(event) =>
                        setLayout((current) => ({
                          ...current,
                          paperSize: normalizePaperSize(event.target.value),
                        }))
                      }
                      className="mt-1.5 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    >
                      {PAPER_SIZES.map((paper) => (
                        <option key={paper.value} value={paper.value}>
                          {paper.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-bold text-gray-700">
                    STT
                    <input
                      type="number"
                      min="4"
                      max="100"
                      step="0.1"
                      value={layout.serialColumnWidth}
                      onChange={(event) =>
                        updateLayoutNumber(
                          "serialColumnWidth",
                          event.target.value,
                          4,
                          100,
                        )
                      }
                      className="mt-1.5 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-xs font-bold text-gray-700">
                    Ngày
                    <input
                      type="number"
                      min="5"
                      max="100"
                      step="0.1"
                      value={layout.dateColumnWidth}
                      onChange={(event) =>
                        updateLayoutNumber(
                          "dateColumnWidth",
                          event.target.value,
                          5,
                          100,
                        )
                      }
                      className="mt-1.5 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="col-span-2 block text-xs font-bold text-gray-700">
                    Tên nhân viên
                    <input
                      type="number"
                      min="8"
                      max="100"
                      step="0.1"
                      value={layout.employeeColumnWidth}
                      onChange={(event) =>
                        updateLayoutNumber(
                          "employeeColumnWidth",
                          event.target.value,
                          8,
                          100,
                        )
                      }
                      className="mt-1.5 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="col-span-2 block text-xs font-bold text-gray-700">
                    Chiều cao hàng (pt)
                    <input
                      type="number"
                      min="18"
                      max="72"
                      step="0.05"
                      value={layout.rowHeight}
                      onChange={(event) =>
                        updateLayoutNumber(
                          "rowHeight",
                          event.target.value,
                          18,
                          72,
                        )
                      }
                      className="mt-1.5 h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs leading-5 text-gray-500">
                  Độ rộng tên nhân viên áp dụng cho mọi ô nhân viên. Các ca và
                  nhân viên bổ sung sẽ tự nối tiếp sang phải.
                </p>
                <button
                  type="button"
                  onClick={() => setLayout(cloneDefaultLayout())}
                  className="mt-3 text-xs font-bold text-blue-700 transition hover:text-blue-800"
                >
                  Khôi phục kích thước mẫu
                </button>
              </section>

              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-gray-200 pt-5 text-center">
                <div className="rounded-xl bg-gray-50 px-2 py-3">
                  <div className="text-lg font-bold tabular-nums text-gray-950">
                    {summary.scheduledCount ?? 0}
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold text-gray-500">
                    ca đã xếp
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 px-2 py-3">
                  <div className="text-lg font-bold tabular-nums text-gray-950">
                    {preview?.shiftGroups?.length ?? 0}
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold text-gray-500">
                    nhóm ca
                  </div>
                </div>
              </div>
            </aside>

            <main className="min-h-0 min-w-0 bg-gray-100/70 p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3 pr-10 sm:pr-0">
                <h3 className="text-sm font-bold text-gray-950">
                  Xem trước biểu mẫu
                </h3>
                {preview && (
                  <span className="w-fit rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-600">
                    {pages.length} trang in
                  </span>
                )}
              </div>

              {previewLoading && (
                <div className="space-y-4" aria-label="Đang tải bản xem trước">
                  {[0, 1].map((item) => (
                    <div
                      key={item}
                      className="animate-pulse rounded-2xl border border-gray-200 bg-white p-4"
                    >
                      <div className="h-5 w-1/3 rounded bg-gray-200" />
                      <div className="mt-3 h-52 rounded-xl bg-gray-100" />
                    </div>
                  ))}
                </div>
              )}

              {!previewLoading && previewError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center">
                  <p className="text-sm font-bold text-rose-800">
                    Không thể tạo bản xem trước
                  </p>
                  <p className="mt-1 text-xs leading-5 text-rose-700">
                    {previewError}
                  </p>
                </div>
              )}

              {!previewLoading &&
                !previewError &&
                preview &&
                preview.days?.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
                    <DocumentArrowDownIcon className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="mt-3 text-sm font-bold text-gray-800">
                      Chưa có ngày nào để xem trước
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Hãy chọn một khoảng thời gian hợp lệ.
                    </p>
                  </div>
                )}

              {!previewLoading && !previewError && pages.length > 0 && (
                <div className="space-y-6">
                  {pages.map((days, index) => (
                    <ExportPreviewTable
                      key={`${days[0]?.date}-${index}`}
                      days={days}
                      shiftGroups={preview.shiftGroups || []}
                      layout={activeLayout}
                      pageNumber={index + 1}
                      totalPages={pages.length}
                    />
                  ))}
                </div>
              )}
            </main>
          </div>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs font-semibold text-gray-500">
            {formatDateRange(startDate, endDate)}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-bold text-gray-600 transition hover:bg-red-400 hover:text-white active:scale-[0.98] sm:order-2"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={downloadWorkbook}
              disabled={
                !previewIsCurrent ||
                previewLoading ||
                exportLoading ||
                invalidRange
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 text-sm font-bold text-white transition hover:bg-green-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              {exportLoading ? "Đang tạo file…" : "Xác nhận xuất file"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
