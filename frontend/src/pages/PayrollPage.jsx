import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  GiftIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  ReceiptPercentIcon,
  Squares2X2Icon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL } from "../services/api";
import { getRole } from "../utils/auth";
import OperationalPageHeader from "../components/OperationalPageHeader";

const summaryPageSize = 8;
const detailPageSize = 10;

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function money(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")} đ`;
}

function signedMoney(value) {
  const number = Number(value || 0);
  if (!number) return "0 đ";
  return `${number > 0 ? "+" : "-"}${money(Math.abs(number))}`;
}

function compactMoney(value) {
  const number = Number(value || 0);
  const abs = Math.abs(number);
  if (abs >= 1000000)
    return `${number < 0 ? "-" : "+"}${Math.round(abs / 100000) / 10}tr`;
  if (abs >= 1000) return `${number < 0 ? "-" : "+"}${Math.round(abs / 1000)}k`;
  return signedMoney(number);
}

function hours(value) {
  return `${Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}h`;
}

function dateLabel(value) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("vi-VN");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getTabFromSearch(search) {
  const tab = new URLSearchParams(search).get("tab");
  return ["salary", "details", "stats", "resolve"].includes(tab) ? tab : "salary";
}

function monthDates(offset = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() + offset, 1);
  const year = date.getFullYear();
  const month = date.getMonth();
  const pad = (value) => String(value).padStart(2, "0");
  return {
    startDate: `${year}-${pad(month + 1)}-01`,
    endDate: `${year}-${pad(new Date(year, month + 1, 0).getDate())}`,
  };
}

function downloadCsv(filename, headers, data) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const content = [headers, ...data].map((row) => row.map(quote).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function statusMeta(status) {
  const map = {
    VALID: ["Hợp lệ", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
    UPCOMING: ["Chưa đến ca", "bg-slate-100 text-slate-600 ring-slate-200"],
    IN_PROGRESS: ["Đang làm", "bg-blue-50 text-blue-700 ring-blue-200"],
    LATE: ["Đi trễ", "bg-orange-50 text-orange-700 ring-orange-200"],
    EARLY_LEAVE: ["Về sớm", "bg-amber-50 text-amber-700 ring-amber-200"],
    RESOLVED_PAY: [
      "Đã duyệt tính lương",
      "bg-cyan-50 text-cyan-700 ring-cyan-200",
    ],
    RESOLVED_NO_PAY: [
      "Đã duyệt không tính",
      "bg-slate-100 text-slate-700 ring-slate-200",
    ],
    MISSING_CHECK_IN: ["Chưa chấm công", "bg-red-50 text-red-700 ring-red-200"],
    MISSING_CHECK_OUT: ["Thiếu chấm ra", "bg-red-50 text-red-700 ring-red-200"],
    NO_PAYABLE_TIME: [
      "Không có giờ hợp lệ",
      "bg-red-50 text-red-700 ring-red-200",
    ],
  };
  const item = map[status] || map.VALID;
  return { label: item[0], className: item[1] };
}

function StatCard({ icon: Icon, label, value, sub, tone = "gray" }) {
  const tones = {
    emerald: "bg-emerald-600",
    cyan: "bg-sky-600",
    amber: "bg-amber-500",
    red: "bg-rose-600",
    gray: "bg-gray-900",
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-gray-500">
            {label}
          </div>
          <div className="mt-2 truncate text-2xl font-black tracking-tight text-gray-950">
            {value}
          </div>
          <div className="mt-1 text-xs font-semibold text-gray-500">{sub}</div>
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]} text-white shadow-sm`}
          aria-label={Icon?.name || label}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}) {
  const styles = {
    primary: {
      backgroundColor: "#1d4ed8",
      color: "#ffffff",
      borderColor: "#1d4ed8",
    },
    cyan: {
      backgroundColor: "#0369a1",
      color: "#ffffff",
      borderColor: "#0891b2",
    },
    emerald: {
      backgroundColor: "#059669",
      color: "#ffffff",
      borderColor: "#059669",
    },
    outline: {
      backgroundColor: "#ffffff",
      color: "#374151",
      borderColor: "#d1d5db",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={styles[variant] || styles.primary}
      className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function EmployeePicker({ employees, value, onChange }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const keyword = normalize(query);
    if (!keyword) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.phone,
        `NV-${employee.employee_id}`,
      ].some((item) => normalize(item).includes(keyword)),
    );
  }, [employees, query]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm nhân viên"
          className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-cyan-500"
        />
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-cyan-500"
      >
        <option value="all">Tất cả nhân viên</option>
        {filtered.map((employee) => (
          <option key={employee.employee_id} value={employee.employee_id}>
            {employee.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
      <span className="text-sm font-semibold text-slate-500">
        Trang {page}/{totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
        >
          Trước
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
        >
          Sau
        </button>
      </div>
    </div>
  );
}

function SummaryTable({ rows, isAdmin }) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
        Không có dữ liệu lương trong bộ lọc hiện tại.
      </div>
    );
  }

  return (
    <div className="max-h-[34rem] overflow-auto overscroll-contain">
      <table className="w-full min-w-[1080px] text-left">
        <thead>
          <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
            {isAdmin && <th className="px-4 py-4">Nhân viên</th>}
            <th className="px-4 py-4">Ca</th>
            <th className="px-4 py-4">Giờ lịch</th>
            <th className="px-4 py-4">Giờ thực tế</th>
            <th className="px-4 py-4">Giờ tính lương</th>
            <th className="px-4 py-4">Đi trễ</th>
            <th className="px-4 py-4">Cần xử lý</th>
            <th className="px-4 py-4">Thưởng/phạt</th>
            <th className="px-4 py-4">Thưởng</th>
            <th className="px-4 py-4">Phạt</th>
            <th className="px-4 py-4 text-right">Tạm tính</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.employee_id}
              className="border-b border-slate-100 hover:bg-slate-50"
            >
              {isAdmin && (
                <td className="px-4 py-4">
                  <div className="font-bold text-slate-950">
                    {row.employee_name}
                  </div>
                  <div className="text-xs font-medium text-slate-500">
                    {row.email || "-"}
                  </div>
                </td>
              )}
              <td className="px-4 py-4 text-sm font-semibold text-slate-800">
                {row.total_shifts}
              </td>
              <td className="px-4 py-4 text-sm font-semibold text-slate-800">
                {hours(row.scheduled_hours)}
              </td>
              <td className="px-4 py-4 text-sm font-semibold text-slate-800">
                {hours(row.actual_hours)}
              </td>
              <td className="px-4 py-4 text-sm font-black text-cyan-700">
                {hours(row.worked_hours)}
              </td>
              <td className="px-4 py-4 text-sm font-semibold text-orange-700">
                {row.late_shifts}
              </td>
              <td className="px-4 py-4">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${row.issue_shifts ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}
                >
                  {row.issue_shifts}
                </span>
              </td>
              <td
                className={`px-4 py-4 text-sm font-black ${Number(row.adjustment_salary || 0) < 0 ? "text-red-700" : "text-emerald-700"}`}
              >
                {signedMoney(row.adjustment_salary)}
              </td>
              <td className="px-4 py-4 text-sm font-black text-emerald-700">
                {money(row.bonus_salary)}
              </td>
              <td className="px-4 py-4 text-sm font-black text-red-700">
                {money(row.penalty_salary)}
              </td>
              <td className="px-4 py-4 text-right text-base font-black text-emerald-700">
                {money(row.total_salary)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailList({ details, isAdmin, onResolve }) {
  if (!details.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
        Không có chi tiết bảng công trong bộ lọc hiện tại.
      </div>
    );
  }

  return (
    <div className="max-h-[34rem] overflow-auto overscroll-contain">
      <table className="w-full min-w-[1160px] text-left">
        <thead>
          <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
            <th className="px-4 py-4">Ngày</th>
            {isAdmin && <th className="px-4 py-4">Nhân viên</th>}
            <th className="px-4 py-4">Ca làm</th>
            <th className="px-4 py-4">Chấm công</th>
            <th className="px-4 py-4">Trễ</th>
            <th className="px-4 py-4">Giờ hợp lệ</th>
            <th className="px-4 py-4">Thưởng/phạt</th>
            <th className="px-4 py-4">Trạng thái</th>
            <th className="px-4 py-4 text-right">Lương ca</th>
            {isAdmin && <th className="px-4 py-4 text-right">Thao tác</th>}
          </tr>
        </thead>
        <tbody>
          {details.map((detail) => {
            const meta = statusMeta(detail.payroll_status);
            return (
              <tr
                key={detail.schedule_id}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-4 text-sm font-bold text-slate-900">
                  {dateLabel(detail.work_date)}
                </td>
                {isAdmin && (
                  <td className="px-4 py-4">
                    <div className="text-sm font-bold text-slate-950">
                      {detail.employee_name}
                    </div>
                    <div className="text-xs font-medium text-slate-500">
                      {detail.email || "-"}
                    </div>
                  </td>
                )}
                <td className="px-4 py-4">
                  <div className="text-sm font-bold text-slate-900">
                    {detail.shift_name}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    {detail.shift_time}
                  </div>
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-slate-800">
                  {detail.checked_time}
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-orange-700">
                  {detail.late_minutes || 0}p
                </td>
                <td className="px-4 py-4 text-sm font-black text-cyan-700">
                  {hours(detail.payable_hours)}
                </td>
                <td
                  className={`px-4 py-4 text-sm font-black ${Number(detail.adjustment_amount || 0) < 0 ? "text-red-700" : "text-emerald-700"}`}
                >
                  {Number(detail.adjustment_amount || 0)
                    ? compactMoney(detail.adjustment_amount)
                    : "-"}
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${meta.className}`}
                  >
                    {meta.label}
                  </span>
                </td>
                <td className="px-4 py-4 text-right text-sm font-black text-emerald-700">
                  {money(detail.salary)}
                </td>
                {isAdmin && (
                  <td className="px-4 py-4 text-right">
                    {detail.needs_resolution ? (
                      <button
                        type="button"
                        onClick={() => onResolve(detail)}
                        className="rounded-md bg-cyan-600 px-3 py-2 text-xs font-black text-white hover:bg-cyan-700"
                      >
                        Xử lý
                      </button>
                    ) : detail.is_resolved ? (
                      <button
                        type="button"
                        onClick={() => onResolve(detail)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                      >
                        Hoàn tác
                      </button>
                    ) : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PayrollChart({ rows }) {
  const data = [...rows]
    .sort((a, b) => Number(b.total_salary || 0) - Number(a.total_salary || 0))
    .slice(0, 8);
  const max = Math.max(1, ...data.map((item) => Number(item.total_salary || 0)));

  if (!data.length) {
    return <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-gray-200 text-sm font-semibold text-gray-500">Chưa có dữ liệu lương để biểu diễn.</div>;
  }

  return (
    <div className="max-h-[22rem] space-y-4 overflow-y-auto pr-2">
      {data.map((item) => (
        <div key={item.employee_id}>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-bold text-gray-700">{item.employee_name}</span>
            <span className="shrink-0 font-black tabular-nums text-gray-950">{money(item.total_salary)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-500"
              style={{ width: `${Math.max(4, (Number(item.total_salary || 0) / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function BulkResolveList({ details, selectedIds, onToggle, onSelectAll, onUndo }) {
  const pending = details.filter((detail) => detail.needs_resolution);
  const resolved = details.filter((detail) => detail.is_resolved);

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div>
            <h3 className="font-black text-gray-950">Ca chờ xử lý</h3>
            <p className="mt-0.5 text-xs font-medium text-gray-500">Chọn nhiều ca rồi áp dụng cùng một quyết định. Hệ thống dùng đúng giờ bắt đầu/kết thúc ca khi tính theo chấm công.</p>
          </div>
          {!!pending.length && (
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-gray-700">
              <input type="checkbox" checked={pending.length > 0 && pending.every((item) => selectedIds.includes(item.schedule_id))} onChange={(event) => onSelectAll(event.target.checked, pending)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              Chọn tất cả ({pending.length})
            </label>
          )}
        </div>
        {pending.length ? (
          <div className="max-h-[26rem] overflow-auto">
            <div className="min-w-[720px]">
              {pending.map((detail) => (
                <label key={detail.schedule_id} className="grid cursor-pointer grid-cols-[auto_minmax(11rem,1.2fr)_minmax(9rem,1fr)_7rem_7rem] items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0 transition hover:bg-blue-50/60">
                  <input type="checkbox" checked={selectedIds.includes(detail.schedule_id)} onChange={() => onToggle(detail.schedule_id)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="min-w-0"><span className="block truncate text-sm font-bold text-gray-950">{detail.employee_name}</span><span className="mt-0.5 block text-xs text-gray-500">{dateLabel(detail.work_date)} · {detail.shift_name}</span></span>
                  <span className="text-sm font-semibold text-gray-700">{detail.shift_time}</span>
                  <span className="text-sm font-bold text-amber-700">{detail.late_minutes || 0}p trễ</span>
                  <span className="text-sm font-bold text-rose-700">{statusMeta(detail.payroll_status).label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : <div className="px-4 py-8 text-center text-sm font-semibold text-gray-500">Không còn ca nào cần xử lý trong bộ lọc này.</div>}
      </div>

      {!!resolved.length && (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-3"><h3 className="font-black text-gray-950">Đã xử lý — có thể hoàn tác</h3></div>
          <div className="max-h-64 overflow-auto">
            {resolved.map((detail) => (
              <div key={detail.schedule_id} className="flex min-w-[520px] items-center justify-between gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0">
                <div className="min-w-0"><div className="truncate text-sm font-bold text-gray-950">{detail.employee_name} · {detail.shift_name}</div><div className="mt-0.5 text-xs text-gray-500">{dateLabel(detail.work_date)} · {detail.shift_time}</div></div>
                <div className="flex items-center gap-3"><span className="text-xs font-bold text-gray-600">{statusMeta(detail.payroll_status).label}</span><button type="button" onClick={() => onUndo(detail)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">Hoàn tác</button></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PayrollPage() {
  const role = getRole();
  const isAdmin = role === "ADMIN";
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(getTabFromSearch(location.search));
  const [filters, setFilters] = useState({
    employee_id: "all",
    startDate: "",
    endDate: "",
  });
  const [settings, setSettings] = useState({ calculation_mode: "attendance" });
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [details, setDetails] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summaryPage, setSummaryPage] = useState(1);
  const [detailPage, setDetailPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [selectedIssueIds, setSelectedIssueIds] = useState([]);
  const [batchResolving, setBatchResolving] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [resolveForm, setResolveForm] = useState({
    action: "PAY",
    override_check_in: "",
    override_check_out: "",
    note: "",
  });
  const [adjustForm, setAdjustForm] = useState({
    type: "BONUS",
    work_date: "",
    employee_id: "",
    amount: "",
    note: "",
  });
  const [feedback, setFeedback] = useState({ subject: "", content: "" });

  useEffect(
    () => setActiveTab(getTabFromSearch(location.search)),
    [location.search],
  );

  useEffect(() => {
    if (!isAdmin) return;
    axios
      .get(`${API_URL}/employees`, { headers: authHeaders() })
      .then((res) => setEmployees(res.data || []))
      .catch((err) => console.error("[Payroll] Load employees:", err));
  }, [isAdmin]);

  const fetchPayroll = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = { startDate: filters.startDate, endDate: filters.endDate };
      if (isAdmin && filters.employee_id !== "all")
        params.employee_id = filters.employee_id;
      const res = await axios.get(`${API_URL}/payroll/summary`, {
        params,
        headers: authHeaders(),
      });
      setRows(res.data.rows || []);
      setDetails(res.data.details || []);
      setTotals(res.data.totals || {});
      setSettings(res.data.settings || { calculation_mode: "attendance" });
      setSummaryPage(1);
      setDetailPage(1);
    } catch (err) {
      setError(err.response?.data?.message || "Không thể tải dữ liệu lương");
      setRows([]);
      setDetails([]);
      setTotals({});
    } finally {
      setLoading(false);
    }
  }, [filters.endDate, filters.employee_id, filters.startDate, isAdmin]);

  useEffect(() => {
    fetchPayroll();
  }, [fetchPayroll]);

  const summaryTotalPages = Math.max(
    1,
    Math.ceil(rows.length / summaryPageSize),
  );
  const detailTotalPages = Math.max(
    1,
    Math.ceil(details.length / detailPageSize),
  );
  const pagedRows = rows.slice(
    (summaryPage - 1) * summaryPageSize,
    summaryPage * summaryPageSize,
  );
  const pagedDetails = details.slice(
    (detailPage - 1) * detailPageSize,
    detailPage * detailPageSize,
  );
  const rangeText =
    filters.startDate || filters.endDate
      ? `${filters.startDate || "Từ đầu"} đến ${filters.endDate || "hiện tại"}`
      : "Tất cả thời gian";
  const modeText =
    settings.calculation_mode === "shift"
      ? "Tính theo giờ ca làm"
      : "Tính theo giờ chấm công";

  const setTab = (tab) => {
    setActiveTab(tab);
    navigate(`/payroll?tab=${tab}`);
  };

  const openResolve = (detail) => {
    if (detail.is_resolved && !detail.needs_resolution) {
      undoResolution(detail);
      return;
    }
    setSelectedDetail(detail);
    setResolveForm({
      action: "PAY",
      override_check_in: `${detail.work_date}T${String(detail.start_time || "00:00").slice(0, 5)}`,
      override_check_out: `${detail.work_date}T${String(detail.end_time || "00:00").slice(0, 5)}`,
      note: "",
    });
    setResolveOpen(true);
  };

  const undoResolution = async (detail) => {
    const confirmed = await window.appConfirm?.({
      title: "Hoàn tác xử lý",
      message: `Hoàn tác xử lý ca lương của ${detail.employee_name}?`,
      confirmText: "Hoàn tác",
      cancelText: "Giữ nguyên",
      type: "warning",
    });
    if (!confirmed) return;
    try {
      await axios.delete(`${API_URL}/payroll/resolve/${detail.schedule_id}`, {
        headers: authHeaders(),
      });
      window.appPopup?.({
        type: "success",
        title: "Đã hoàn tác",
        message: "Ca lương đã được đưa về trạng thái chờ xử lý.",
      });
      fetchPayroll();
    } catch (err) {
      window.appPopup?.({
        type: "error",
        title: "Không thể hoàn tác",
        message: err.response?.data?.message || "Vui lòng thử lại.",
      });
    }
  };

  const saveResolution = async () => {
    const confirmed = await window.appConfirm?.({
      title: "Lưu xử lý lương",
      message:
        resolveForm.action === "PAY"
          ? "Xác nhận tính lương cho ca này?"
          : "Xác nhận không tính lương cho ca này?",
      confirmText: "Lưu xử lý",
      cancelText: "Kiểm tra lại",
      type: "warning",
    });
    if (!confirmed) return;

    try {
      await axios.post(
        `${API_URL}/payroll/resolve/${selectedDetail.schedule_id}`,
        resolveForm,
        { headers: authHeaders() },
      );
      setResolveOpen(false);
      setSelectedDetail(null);
      window.appPopup?.({
        type: "success",
        title: "Đã xử lý lương",
        message: "Quyết định xử lý ca đã được lưu.",
      });
      fetchPayroll();
    } catch (err) {
      window.appPopup?.({
        type: "error",
        title: "Không thể xử lý lương",
        message: err.response?.data?.message || "Vui lòng thử lại.",
      });
    }
  };

  const saveSettings = async () => {
    try {
      await axios.put(`${API_URL}/payroll/settings`, settings, {
        headers: authHeaders(),
      });
      setSettingsOpen(false);
      window.appPopup?.({
        type: "success",
        title: "Đã lưu thiết lập",
        message: "Cách tính lương đã được cập nhật.",
      });
      fetchPayroll();
    } catch (err) {
      window.appPopup?.({
        type: "error",
        title: "Không thể lưu thiết lập",
        message: err.response?.data?.message || "Vui lòng thử lại.",
      });
    }
  };

  const saveAdjustment = async () => {
    try {
      await axios.post(`${API_URL}/payroll/adjustments`, adjustForm, {
        headers: authHeaders(),
      });
      setAdjustOpen(false);
      setAdjustForm({
        type: "BONUS",
        work_date: "",
        employee_id: "",
        amount: "",
        note: "",
      });
      window.dispatchEvent(new Event("notification-count-changed"));
      window.appPopup?.({
        type: "success",
        title: "Đã lưu thưởng/phạt",
        message: "Khoản điều chỉnh đã được gửi tới nhân viên.",
      });
      fetchPayroll();
    } catch (err) {
      window.appPopup?.({
        type: "error",
        title: "Không thể lưu thưởng/phạt",
        message: err.response?.data?.message || "Vui lòng kiểm tra dữ liệu.",
      });
    }
  };

  const submitFeedback = async () => {
    try {
      await axios.post(`${API_URL}/payroll/feedback`, feedback, {
        headers: authHeaders(),
      });
      setFeedback({ subject: "", content: "" });
      setFeedbackOpen(false);
      window.dispatchEvent(new Event("notification-count-changed"));
      window.appPopup?.({
        type: "success",
        title: "Đã gửi phản hồi",
        message: "Admin sẽ nhận được phản hồi lương của bạn.",
      });
    } catch (err) {
      window.appPopup?.({
        type: "error",
        title: "Không thể gửi phản hồi",
        message: err.response?.data?.message || "Vui lòng thử lại.",
      });
    }
  };

  const toggleIssueSelection = (scheduleId) => {
    setSelectedIssueIds((current) =>
      current.includes(scheduleId)
        ? current.filter((id) => id !== scheduleId)
        : [...current, scheduleId],
    );
  };

  const selectIssueRows = (checked, issueRows) => {
    setSelectedIssueIds((current) => {
      const issueIds = issueRows.map((detail) => detail.schedule_id);
      return checked
        ? [...new Set([...current, ...issueIds])]
        : current.filter((id) => !issueIds.includes(id));
    });
  };

  const resolveSelectedIssues = async (action) => {
    const selected = details.filter((detail) => selectedIssueIds.includes(detail.schedule_id) && detail.needs_resolution);
    if (!selected.length) {
      window.appPopup?.({ type: "warning", title: "Chưa chọn ca", message: "Hãy chọn ít nhất một ca cần xử lý." });
      return;
    }
    const confirmation = {
      title: action === "PAY" ? "Tính lương hàng loạt" : "Không tính lương hàng loạt",
      message: `${action === "PAY" ? "Tính lương" : "Không tính lương"} cho ${selected.length} ca đã chọn? Ghi chú sẽ được để trống.`,
      confirmText: action === "PAY" ? "Tính lương" : "Không tính",
      cancelText: "Kiểm tra lại",
      type: "warning",
    };
    const confirmed = window.appConfirm
      ? await window.appConfirm(confirmation)
      : window.confirm(confirmation.message);
    if (!confirmed) return;

    setBatchResolving(true);
    try {
      const results = await Promise.allSettled(
        selected.map((detail) => {
          const payload = { action, note: "" };
          if (action === "PAY" && settings.calculation_mode === "attendance") {
            payload.override_check_in = `${detail.work_date}T${String(detail.start_time || "00:00").slice(0, 5)}`;
            payload.override_check_out = `${detail.work_date}T${String(detail.end_time || "00:00").slice(0, 5)}`;
          }
          return axios.post(`${API_URL}/payroll/resolve/${detail.schedule_id}`, payload, { headers: authHeaders() });
        }),
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed) {
        window.appPopup?.({ type: "warning", title: "Đã xử lý một phần", message: `${selected.length - failed}/${selected.length} ca đã được cập nhật. Vui lòng thử lại các ca còn lại.` });
      } else {
        window.appPopup?.({ type: "success", title: "Đã xử lý hàng loạt", message: `${selected.length} ca đã được cập nhật và vẫn có thể hoàn tác.` });
      }
      setSelectedIssueIds([]);
      fetchPayroll();
    } finally {
      setBatchResolving(false);
    }
  };

  const applyMonth = (offset) => {
    setFilters((prev) => ({ ...prev, ...monthDates(offset) }));
  };

  const exportSummary = () => {
    downloadCsv(
      `bang-luong-${filters.startDate || "tat-ca"}-${filters.endDate || "hien-tai"}.csv`,
      [
        "Nhân viên",
        "Số ca",
        "Giờ theo lịch",
        "Giờ tính lương",
        "Đi trễ",
        "Ca cần xử lý",
        "Thưởng",
        "Phạt",
        "Tạm tính",
      ],
      rows.map((row) => [
        row.employee_name,
        row.total_shifts,
        row.scheduled_hours,
        row.worked_hours,
        row.late_shifts,
        row.issue_shifts,
        row.bonus_salary,
        row.penalty_salary,
        row.total_salary,
      ]),
    );
  };

  return (
    <div
      className="mx-auto max-w-[1500px] space-y-5 pb-6"
      style={{ fontFamily: '"Segoe UI", Arial, Tahoma, sans-serif' }}
    >
      <OperationalPageHeader
        title="Tính lương"
        description="Nắm lương tạm tính, chấm công bất thường và các khoản điều chỉnh trong cùng một không gian làm việc."
        actions={
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <>
                <ActionButton onClick={exportSummary} variant="outline" disabled={!rows.length}>
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  Xuất CSV
                </ActionButton>
                <ActionButton onClick={() => setAdjustOpen(true)} variant="emerald">
                  <GiftIcon className="h-5 w-5" />
                  Thưởng/phạt
                </ActionButton>
                <ActionButton onClick={() => setSettingsOpen(true)} variant="outline">
                  <Cog6ToothIcon className="h-5 w-5" />
                  Thiết lập
                </ActionButton>
              </>
            )}
            {!isAdmin && (
              <ActionButton onClick={() => setFeedbackOpen(true)} variant="cyan">
                <PaperAirplaneIcon className="h-5 w-5" />
                Phản hồi lương
              </ActionButton>
            )}
            <ActionButton onClick={fetchPayroll} disabled={loading} variant="primary">
              <ArrowPathIcon className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
              Làm mới
            </ActionButton>
          </div>
        }
      >
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700">
          <ReceiptPercentIcon className="h-4 w-4" />
          {modeText}
        </div>
      </OperationalPageHeader>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] sm:p-5">
        <div className="mb-4 flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-black text-gray-950">Kỳ lương cần xem</h2>
            <p className="mt-1 text-sm text-gray-500">Lọc dữ liệu trước khi xử lý, so sánh hoặc xuất bảng tổng hợp.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => applyMonth(0)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">Tháng này</button>
            <button type="button" onClick={() => applyMonth(-1)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">Tháng trước</button>
            <button type="button" onClick={() => setFilters((prev) => ({ ...prev, startDate: "", endDate: "" }))} className="rounded-lg px-3 py-2 text-xs font-bold text-gray-500 transition hover:bg-gray-100">Toàn thời gian</button>
          </div>
        </div>
        <div
          className={`grid gap-3 ${isAdmin ? "lg:grid-cols-[1.3fr_1fr_1fr]" : "lg:grid-cols-2"}`}
        >
          {isAdmin && (
            <EmployeePicker
              employees={employees}
              value={filters.employee_id}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, employee_id: value || "all" }))
              }
            />
          )}
          <label className="text-sm font-bold text-gray-700">
            Từ ngày
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  startDate: event.target.value,
                }))
              }
              className="mt-1 h-12 w-full rounded-xl border border-gray-200 px-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />
          </label>
          <label className="text-sm font-bold text-gray-700">
            Đến ngày
            <input
              type="date"
              min={filters.startDate || undefined}
              value={filters.endDate}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, endDate: event.target.value }))
              }
              className="mt-1 h-12 w-full rounded-xl border border-gray-200 px-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-500">
          <CalendarDaysIcon className="h-4 w-4" />
          {rangeText}
        </div>
      </section>

      {isAdmin && (
        <div className="flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-gray-50 p-1.5">
          {[
            { id: "salary", label: "Tổng hợp", icon: BanknotesIcon },
            { id: "details", label: "Chi tiết ca", icon: ClockIcon },
            { id: "resolve", label: "Xử lý", icon: Squares2X2Icon },
            { id: "stats", label: "Thống kê", icon: ChartBarIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              style={{
                backgroundColor: activeTab === tab.id ? "#1d4ed8" : "transparent",
                color: activeTab === tab.id ? "#ffffff" : "#334155",
                borderColor: activeTab === tab.id ? "#1d4ed8" : "transparent",
              }}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition hover:opacity-90"
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={BanknotesIcon}
          label="Lương tạm tính"
          value={money(totals.total_salary)}
          sub={`${hours(totals.worked_hours)} hợp lệ`}
          tone="emerald"
        />
        <StatCard
          icon={GiftIcon}
          label="Thưởng"
          value={money(totals.bonus_salary)}
          sub={`Phạt ${money(totals.penalty_salary)}`}
          tone="amber"
        />
        <StatCard
          icon={ClockIcon}
          label="Giờ theo lịch"
          value={hours(totals.scheduled_hours)}
          sub={`${totals.total_shifts || 0} ca đã công bố`}
        />
        <StatCard
          icon={CheckCircleIcon}
          label="Đúng giờ"
          value={totals.on_time_shifts || 0}
          sub={`Hiệu suất ${totals.efficiency || 0}%`}
          tone="cyan"
        />
        <StatCard
          icon={ExclamationTriangleIcon}
          label="Cần xử lý"
          value={totals.issue_shifts || 0}
          sub="Chưa chấm công hoặc đi trễ"
          tone="red"
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
        {loading ? (
          <div className="flex h-56 items-center justify-center text-sm font-bold text-gray-500">
            Đang tải dữ liệu...
          </div>
        ) : activeTab === "details" || !isAdmin ? (
          <>
            <div className="border-b border-gray-100 px-5 py-5">
              <h2 className="font-black text-gray-950">Chi tiết bảng công</h2>
              <p className="mt-1 text-sm font-medium text-gray-500">
                Ca tương lai chưa chấm công không còn bị đánh dấu cần xử lý.
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <DetailList
                details={pagedDetails}
                isAdmin={isAdmin}
                onResolve={openResolve}
              />
            </div>
            <Pagination
              page={detailPage}
              totalPages={detailTotalPages}
              onChange={setDetailPage}
            />
          </>
        ) : activeTab === "resolve" ? (
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-black text-gray-950">Xử lý vấn đề tính lương</h2>
                <p className="mt-1 max-w-2xl text-sm font-medium text-gray-500">Chọn các ca bất thường, áp dụng tính lương hoặc không tính lương cùng lúc. Quyết định hàng loạt sẽ không thêm ghi chú và luôn có thể hoàn tác.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton onClick={() => resolveSelectedIssues("NO_PAY")} disabled={batchResolving || !selectedIssueIds.length} variant="outline">Không tính lương</ActionButton>
                <ActionButton onClick={() => resolveSelectedIssues("PAY")} disabled={batchResolving || !selectedIssueIds.length} variant="primary">{batchResolving ? "Đang xử lý..." : `Tính lương (${selectedIssueIds.length})`}</ActionButton>
              </div>
            </div>
            <div className="mt-5">
              <BulkResolveList details={details} selectedIds={selectedIssueIds} onToggle={toggleIssueSelection} onSelectAll={selectIssueRows} onUndo={openResolve} />
            </div>
          </div>
        ) : activeTab === "stats" ? (
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-2 border-b border-gray-100 pb-5"><h2 className="font-black text-gray-950">Thống kê lương</h2><p className="text-sm font-medium text-gray-500">So sánh lương tạm tính theo nhân viên trong phạm vi đang lọc.</p></div>
            <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <StatCard icon={UserCircleIcon} label="Nhân viên có lương" value={rows.length} sub="Theo bộ lọc hiện tại" tone="cyan" />
                <StatCard icon={ExclamationTriangleIcon} label="Ca cần xử lý" value={totals.issue_shifts || 0} sub="Không gồm ca chưa đến giờ" tone="red" />
                <StatCard icon={GiftIcon} label="Tổng thưởng" value={money(totals.bonus_salary)} sub={`Tổng phạt ${money(totals.penalty_salary)}`} tone="amber" />
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 sm:p-5"><div className="mb-5 flex items-center justify-between gap-3"><div><h3 className="font-black text-gray-950">Phân bổ lương tạm tính</h3><p className="mt-1 text-sm text-gray-500">Tối đa 8 nhân viên có mức lương cao nhất.</p></div><ChartBarIcon className="h-6 w-6 text-blue-600" /></div><PayrollChart rows={rows} /></div>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-gray-100 px-5 py-5">
              <h2 className="font-black text-gray-950">
                Tổng hợp lương theo nhân viên
              </h2>
              <p className="mt-1 text-sm font-medium text-gray-500">
                Lương tạm tính đã bao gồm thưởng/phạt đã lưu.
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <SummaryTable rows={pagedRows} isAdmin={isAdmin} />
            </div>
            <Pagination
              page={summaryPage}
              totalPages={summaryTotalPages}
              onChange={setSummaryPage}
            />
          </>
        )}
      </section>

      <Modal
        open={settingsOpen}
        title="Thiết lập tính lương"
        onClose={() => setSettingsOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-md px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={saveSettings}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-bold text-white"
            >
              Lưu
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          {[
            {
              value: "attendance",
              title: "Tính theo giờ chấm công",
              desc: "Dựa trên giờ vào/ra thực tế hoặc giờ admin duyệt trước.",
            },
            {
              value: "shift",
              title: "Tính theo giờ ca làm",
              desc: "Ca hợp lệ hoặc đã duyệt sẽ tính theo toàn bộ thời lượng ca.",
            },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  calculation_mode: option.value,
                }))
              }
              className={`rounded-lg border p-4 text-left ${settings.calculation_mode === option.value ? "border-cyan-400 bg-cyan-50" : "border-slate-200"}`}
            >
              <div className="font-black text-slate-950">{option.title}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">
                {option.desc}
              </div>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={resolveOpen}
        title="Xử lý ca tính lương"
        onClose={() => setResolveOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setResolveOpen(false)}
              className="rounded-md px-4 py-2 text-sm font-bold text-red-600 hover:bg-green-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={saveResolution}
              className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-bold text-white"
            >
              Lưu xử lý
            </button>
          </>
        }
      >
        {selectedDetail && (
          <div className="mb-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-700">
            {selectedDetail.employee_name} · {selectedDetail.shift_name} ·{" "}
            {dateLabel(selectedDetail.work_date)} · {selectedDetail.shift_time}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              setResolveForm((prev) => ({ ...prev, action: "PAY" }))
            }
            className={`rounded-lg border p-3 text-sm font-black ${resolveForm.action === "PAY" ? "border-emerald-600 bg-green-500 text-white" : "border-slate-200 text-slate-600"}`}
          >
            Tính lương
          </button>
          <button
            type="button"
            onClick={() =>
              setResolveForm((prev) => ({ ...prev, action: "NO_PAY" }))
            }
            className={`rounded-lg border p-3 text-sm font-black ${resolveForm.action === "NO_PAY" ? "border-red-600 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}
          >
            Không tính
          </button>
        </div>
        {resolveForm.action === "PAY" &&
          settings.calculation_mode === "attendance" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">
                Giờ chấm vào
                <input
                  type="datetime-local"
                  value={resolveForm.override_check_in}
                  onChange={(event) =>
                    setResolveForm((prev) => ({
                      ...prev,
                      override_check_in: event.target.value,
                    }))
                  }
                  className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-cyan-500"
                />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Giờ chấm ra
                <input
                  type="datetime-local"
                  value={resolveForm.override_check_out}
                  onChange={(event) =>
                    setResolveForm((prev) => ({
                      ...prev,
                      override_check_out: event.target.value,
                    }))
                  }
                  className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-cyan-500"
                />
              </label>
            </div>
          )}
        <textarea
          value={resolveForm.note}
          onChange={(event) =>
            setResolveForm((prev) => ({ ...prev, note: event.target.value }))
          }
          placeholder="Ghi chú"
          rows={3}
          className="mt-4 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-cyan-500"
        />
      </Modal>

      <Modal
        open={adjustOpen}
        title="Thưởng/phạt"
        onClose={() => setAdjustOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setAdjustOpen(false)}
              className="rounded-md px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={saveAdjustment}
              className="rounded-md bg-green-500 px-4 py-2 text-sm font-bold text-white"
            >
              Lưu
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="text-sm font-bold text-slate-700">
            Loại
            <div className="mt-1 grid grid-cols-2 gap-2">
              {[
                { value: "BONUS", label: "Thưởng", color: "#059669" },
                { value: "PENALTY", label: "Phạt", color: "#dc2626" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() =>
                    setAdjustForm((prev) => ({ ...prev, type: item.value }))
                  }
                  style={{
                    backgroundColor:
                      adjustForm.type === item.value ? item.color : "#ffffff",
                    color:
                      adjustForm.type === item.value ? "#ffffff" : "#334155",
                    borderColor:
                      adjustForm.type === item.value ? item.color : "#cbd5e1",
                  }}
                  className="h-11 rounded-md border text-sm font-black transition hover:opacity-90"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <label className="text-sm font-bold text-slate-700">
            Ngày
            <input
              type="date"
              value={adjustForm.work_date}
              onChange={(event) =>
                setAdjustForm((prev) => ({
                  ...prev,
                  work_date: event.target.value,
                }))
              }
              className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="text-sm font-bold text-slate-700">
            Nhân viên
            <select
              value={adjustForm.employee_id}
              onChange={(event) =>
                setAdjustForm((prev) => ({
                  ...prev,
                  employee_id: event.target.value,
                }))
              }
              className="mt-1 h-11 w-full rounded-md border border-slate-200 bg-white px-3 outline-none focus:border-cyan-500"
            >
              <option value="">Chọn nhân viên</option>
              {employees.map((employee) => (
                <option key={employee.employee_id} value={employee.employee_id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700">
            Số tiền
            <input
              type="number"
              min="0"
              value={adjustForm.amount}
              onChange={(event) =>
                setAdjustForm((prev) => ({
                  ...prev,
                  amount: event.target.value,
                }))
              }
              className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-cyan-500"
            />
          </label>
        </div>
        <textarea
          value={adjustForm.note}
          onChange={(event) =>
            setAdjustForm((prev) => ({ ...prev, note: event.target.value }))
          }
          placeholder="Ghi chú hiển thị cho nhân viên"
          rows={3}
          className="mt-4 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-cyan-500"
        />
      </Modal>

      <Modal
        open={feedbackOpen}
        title="Phản hồi về lương"
        onClose={() => setFeedbackOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setFeedbackOpen(false)}
              className="rounded-md px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={submitFeedback}
              className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-bold text-white"
            >
              Gửi
            </button>
          </>
        }
      >
        <input
          value={feedback.subject}
          onChange={(event) =>
            setFeedback((prev) => ({ ...prev, subject: event.target.value }))
          }
          placeholder="Chủ đề"
          className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-cyan-500"
        />
        <textarea
          value={feedback.content}
          onChange={(event) =>
            setFeedback((prev) => ({ ...prev, content: event.target.value }))
          }
          placeholder="Nội dung"
          rows={4}
          className="mt-3 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-cyan-500"
        />
      </Modal>
    </div>
  );
}
