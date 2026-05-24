import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
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
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL } from "../services/api";
import { getRole } from "../utils/auth";

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
  if (abs >= 1000000) return `${number < 0 ? "-" : "+"}${Math.round(abs / 100000) / 10}tr`;
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
  return ["salary", "details", "stats"].includes(tab) ? tab : "salary";
}

function statusMeta(status) {
  const map = {
    VALID: ["Hợp lệ", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
    UPCOMING: ["Chưa đến ca", "bg-slate-100 text-slate-600 ring-slate-200"],
    IN_PROGRESS: ["Đang làm", "bg-blue-50 text-blue-700 ring-blue-200"],
    LATE: ["Đi trễ", "bg-orange-50 text-orange-700 ring-orange-200"],
    EARLY_LEAVE: ["Về sớm", "bg-amber-50 text-amber-700 ring-amber-200"],
    RESOLVED_PAY: ["Đã duyệt tính lương", "bg-cyan-50 text-cyan-700 ring-cyan-200"],
    RESOLVED_NO_PAY: ["Đã duyệt không tính", "bg-slate-100 text-slate-700 ring-slate-200"],
    MISSING_CHECK_IN: ["Chưa chấm công", "bg-red-50 text-red-700 ring-red-200"],
    MISSING_CHECK_OUT: ["Thiếu chấm ra", "bg-red-50 text-red-700 ring-red-200"],
    NO_PAYABLE_TIME: ["Không có giờ hợp lệ", "bg-red-50 text-red-700 ring-red-200"],
  };
  const item = map[status] || map.VALID;
  return { label: item[0], className: item[1] };
}

function StatCard({ icon: Icon, label, value, sub, tone = "slate" }) {
  const tones = {
    emerald: "bg-emerald-600",
    cyan: "bg-cyan-600",
    amber: "bg-amber-500",
    red: "bg-red-600",
    slate: "bg-slate-950",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase text-slate-500">{label}</div>
          <div className="mt-2 truncate text-2xl font-black text-slate-950">{value}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">{sub}</div>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tones[tone]} text-white`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, disabled, variant = "primary", type = "button" }) {
  const styles = {
    primary: { backgroundColor: "#0f172a", color: "#ffffff", borderColor: "#0f172a" },
    cyan: { backgroundColor: "#0891b2", color: "#ffffff", borderColor: "#0891b2" },
    emerald: { backgroundColor: "#059669", color: "#ffffff", borderColor: "#059669" },
    outline: { backgroundColor: "#ffffff", color: "#334155", borderColor: "#cbd5e1" },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={styles[variant] || styles.primary}
      className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-bold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
      [employee.name, employee.email, employee.phone, `NV-${employee.employee_id}`].some((item) =>
        normalize(item).includes(keyword),
      ),
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
    return <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">Không có dữ liệu lương trong bộ lọc hiện tại.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
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
            <tr key={row.employee_id} className="border-b border-slate-100 hover:bg-slate-50">
              {isAdmin && (
                <td className="px-4 py-4">
                  <div className="font-bold text-slate-950">{row.employee_name}</div>
                  <div className="text-xs font-medium text-slate-500">{row.email || "-"}</div>
                </td>
              )}
              <td className="px-4 py-4 text-sm font-semibold text-slate-800">{row.total_shifts}</td>
              <td className="px-4 py-4 text-sm font-semibold text-slate-800">{hours(row.scheduled_hours)}</td>
              <td className="px-4 py-4 text-sm font-semibold text-slate-800">{hours(row.actual_hours)}</td>
              <td className="px-4 py-4 text-sm font-black text-cyan-700">{hours(row.worked_hours)}</td>
              <td className="px-4 py-4 text-sm font-semibold text-orange-700">{row.late_shifts}</td>
              <td className="px-4 py-4">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${row.issue_shifts ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>
                  {row.issue_shifts}
                </span>
              </td>
              <td className={`px-4 py-4 text-sm font-black ${Number(row.adjustment_salary || 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                {signedMoney(row.adjustment_salary)}
              </td>
              <td className="px-4 py-4 text-sm font-black text-emerald-700">{money(row.bonus_salary)}</td>
              <td className="px-4 py-4 text-sm font-black text-red-700">{money(row.penalty_salary)}</td>
              <td className="px-4 py-4 text-right text-base font-black text-emerald-700">{money(row.total_salary)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailList({ details, isAdmin, onResolve }) {
  if (!details.length) {
    return <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">Không có chi tiết bảng công trong bộ lọc hiện tại.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1160px] text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
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
              <tr key={detail.schedule_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-4 text-sm font-bold text-slate-900">{dateLabel(detail.work_date)}</td>
                {isAdmin && (
                  <td className="px-4 py-4">
                    <div className="text-sm font-bold text-slate-950">{detail.employee_name}</div>
                    <div className="text-xs font-medium text-slate-500">{detail.email || "-"}</div>
                  </td>
                )}
                <td className="px-4 py-4">
                  <div className="text-sm font-bold text-slate-900">{detail.shift_name}</div>
                  <div className="text-xs font-semibold text-slate-500">{detail.shift_time}</div>
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-slate-800">{detail.checked_time}</td>
                <td className="px-4 py-4 text-sm font-semibold text-orange-700">{detail.late_minutes || 0}p</td>
                <td className="px-4 py-4 text-sm font-black text-cyan-700">{hours(detail.payable_hours)}</td>
                <td className={`px-4 py-4 text-sm font-black ${Number(detail.adjustment_amount || 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {Number(detail.adjustment_amount || 0) ? compactMoney(detail.adjustment_amount) : "-"}
                </td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${meta.className}`}>{meta.label}</span>
                </td>
                <td className="px-4 py-4 text-right text-sm font-black text-emerald-700">{money(detail.salary)}</td>
                {isAdmin && (
                  <td className="px-4 py-4 text-right">
                    {detail.needs_resolution ? (
                      <button type="button" onClick={() => onResolve(detail)} className="rounded-md bg-cyan-600 px-3 py-2 text-xs font-black text-white hover:bg-cyan-700">
                        Xử lý
                      </button>
                    ) : detail.is_resolved ? (
                      <button type="button" onClick={() => onResolve(detail)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100">
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

function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">{footer}</div>}
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
  const [filters, setFilters] = useState({ employee_id: "all", startDate: "", endDate: "" });
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
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [resolveForm, setResolveForm] = useState({ action: "PAY", override_check_in: "", override_check_out: "", note: "" });
  const [adjustForm, setAdjustForm] = useState({ type: "BONUS", work_date: "", employee_id: "", amount: "", note: "" });
  const [feedback, setFeedback] = useState({ subject: "", content: "" });

  useEffect(() => setActiveTab(getTabFromSearch(location.search)), [location.search]);

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
      if (isAdmin && filters.employee_id !== "all") params.employee_id = filters.employee_id;
      const res = await axios.get(`${API_URL}/payroll/summary`, { params, headers: authHeaders() });
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

  const summaryTotalPages = Math.max(1, Math.ceil(rows.length / summaryPageSize));
  const detailTotalPages = Math.max(1, Math.ceil(details.length / detailPageSize));
  const pagedRows = rows.slice((summaryPage - 1) * summaryPageSize, summaryPage * summaryPageSize);
  const pagedDetails = details.slice((detailPage - 1) * detailPageSize, detailPage * detailPageSize);
  const rangeText = filters.startDate || filters.endDate ? `${filters.startDate || "Từ đầu"} đến ${filters.endDate || "hiện tại"}` : "Tất cả thời gian";
  const modeText = settings.calculation_mode === "shift" ? "Tính theo giờ ca làm" : "Tính theo giờ chấm công";

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
      await axios.delete(`${API_URL}/payroll/resolve/${detail.schedule_id}`, { headers: authHeaders() });
      window.appPopup?.({ type: "success", title: "Đã hoàn tác", message: "Ca lương đã được đưa về trạng thái chờ xử lý." });
      fetchPayroll();
    } catch (err) {
      window.appPopup?.({ type: "error", title: "Không thể hoàn tác", message: err.response?.data?.message || "Vui lòng thử lại." });
    }
  };

  const saveResolution = async () => {
    const confirmed = await window.appConfirm?.({
      title: "Lưu xử lý lương",
      message: resolveForm.action === "PAY"
        ? "Xác nhận tính lương cho ca này?"
        : "Xác nhận không tính lương cho ca này?",
      confirmText: "Lưu xử lý",
      cancelText: "Kiểm tra lại",
      type: "warning",
    });
    if (!confirmed) return;

    try {
      await axios.post(`${API_URL}/payroll/resolve/${selectedDetail.schedule_id}`, resolveForm, { headers: authHeaders() });
      setResolveOpen(false);
      setSelectedDetail(null);
      window.appPopup?.({ type: "success", title: "Đã xử lý lương", message: "Quyết định xử lý ca đã được lưu." });
      fetchPayroll();
    } catch (err) {
      window.appPopup?.({ type: "error", title: "Không thể xử lý lương", message: err.response?.data?.message || "Vui lòng thử lại." });
    }
  };

  const saveSettings = async () => {
    try {
      await axios.put(`${API_URL}/payroll/settings`, settings, { headers: authHeaders() });
      setSettingsOpen(false);
      window.appPopup?.({ type: "success", title: "Đã lưu thiết lập", message: "Cách tính lương đã được cập nhật." });
      fetchPayroll();
    } catch (err) {
      window.appPopup?.({ type: "error", title: "Không thể lưu thiết lập", message: err.response?.data?.message || "Vui lòng thử lại." });
    }
  };

  const saveAdjustment = async () => {
    try {
      await axios.post(`${API_URL}/payroll/adjustments`, adjustForm, { headers: authHeaders() });
      setAdjustOpen(false);
      setAdjustForm({ type: "BONUS", work_date: "", employee_id: "", amount: "", note: "" });
      window.dispatchEvent(new Event("notification-count-changed"));
      window.appPopup?.({ type: "success", title: "Đã lưu thưởng/phạt", message: "Khoản điều chỉnh đã được gửi tới nhân viên." });
      fetchPayroll();
    } catch (err) {
      window.appPopup?.({ type: "error", title: "Không thể lưu thưởng/phạt", message: err.response?.data?.message || "Vui lòng kiểm tra dữ liệu." });
    }
  };

  const submitFeedback = async () => {
    try {
      await axios.post(`${API_URL}/payroll/feedback`, feedback, { headers: authHeaders() });
      setFeedback({ subject: "", content: "" });
      setFeedbackOpen(false);
      window.dispatchEvent(new Event("notification-count-changed"));
      window.appPopup?.({ type: "success", title: "Đã gửi phản hồi", message: "Admin sẽ nhận được phản hồi lương của bạn." });
    } catch (err) {
      window.appPopup?.({ type: "error", title: "Không thể gửi phản hồi", message: err.response?.data?.message || "Vui lòng thử lại." });
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5" style={{ fontFamily: '"Segoe UI", Arial, Tahoma, sans-serif' }}>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700 ring-1 ring-cyan-200">
              <ReceiptPercentIcon className="h-4 w-4" />
              {modeText}
            </div>
            <h1 className="text-2xl font-black text-slate-950 md:text-3xl">Tính lương</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
              Theo dõi lương tạm tính, xử lý ca thiếu chấm công hoặc đi trễ, và cộng thưởng/phạt theo từng ngày làm việc.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <>
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
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className={`grid gap-3 ${isAdmin ? "lg:grid-cols-[1.3fr_1fr_1fr]" : "lg:grid-cols-2"}`}>
          {isAdmin && <EmployeePicker employees={employees} value={filters.employee_id} onChange={(value) => setFilters((prev) => ({ ...prev, employee_id: value || "all" }))} />}
          <label className="text-sm font-bold text-slate-700">
            Từ ngày
            <input type="date" value={filters.startDate} onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))} className="mt-1 h-12 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-cyan-500" />
          </label>
          <label className="text-sm font-bold text-slate-700">
            Đến ngày
            <input type="date" min={filters.startDate || undefined} value={filters.endDate} onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))} className="mt-1 h-12 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-cyan-500" />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
          <CalendarDaysIcon className="h-4 w-4" />
          {rangeText}
        </div>
      </section>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {[
            { id: "salary", label: "Tổng hợp", icon: BanknotesIcon },
            { id: "details", label: "Chi tiết ca", icon: ClockIcon },
            { id: "stats", label: "Thống kê", icon: ChartBarIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              style={{
                backgroundColor: activeTab === tab.id ? "#0f172a" : "#ffffff",
                color: activeTab === tab.id ? "#ffffff" : "#334155",
                borderColor: activeTab === tab.id ? "#0f172a" : "#cbd5e1",
              }}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition hover:opacity-90"
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={BanknotesIcon} label="Lương tạm tính" value={money(totals.total_salary)} sub={`${hours(totals.worked_hours)} hợp lệ`} tone="emerald" />
        <StatCard icon={GiftIcon} label="Thưởng" value={money(totals.bonus_salary)} sub={`Phạt ${money(totals.penalty_salary)}`} tone="amber" />
        <StatCard icon={ClockIcon} label="Giờ theo lịch" value={hours(totals.scheduled_hours)} sub={`${totals.total_shifts || 0} ca đã công bố`} />
        <StatCard icon={CheckCircleIcon} label="Đúng giờ" value={totals.on_time_shifts || 0} sub={`Hiệu suất ${totals.efficiency || 0}%`} tone="cyan" />
        <StatCard icon={ExclamationTriangleIcon} label="Cần xử lý" value={totals.issue_shifts || 0} sub="Chưa chấm công hoặc đi trễ" tone="red" />
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-56 items-center justify-center text-sm font-bold text-slate-500">Đang tải dữ liệu...</div>
        ) : activeTab === "details" || !isAdmin ? (
          <>
            <div className="border-b border-slate-100 px-4 py-4">
              <h2 className="font-black text-slate-950">Chi tiết bảng công</h2>
              <p className="text-sm font-medium text-slate-500">Ca tương lai chưa chấm công không còn bị đánh dấu cần xử lý.</p>
            </div>
            <div className="p-3 sm:p-4">
              <DetailList details={pagedDetails} isAdmin={isAdmin} onResolve={openResolve} />
            </div>
            <Pagination page={detailPage} totalPages={detailTotalPages} onChange={setDetailPage} />
          </>
        ) : activeTab === "stats" ? (
          <div className="p-4">
            <h2 className="font-black text-slate-950">Thống kê lương</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <StatCard icon={UserCircleIcon} label="Nhân viên có lương" value={rows.length} sub="Theo bộ lọc hiện tại" tone="cyan" />
              <StatCard icon={ExclamationTriangleIcon} label="Ca cần xử lý" value={totals.issue_shifts || 0} sub="Không gồm ca chưa đến giờ" tone="red" />
              <StatCard icon={GiftIcon} label="Tổng thưởng" value={money(totals.bonus_salary)} sub={`Tổng phạt ${money(totals.penalty_salary)}`} tone="amber" />
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-100 px-4 py-4">
              <h2 className="font-black text-slate-950">Tổng hợp lương theo nhân viên</h2>
              <p className="text-sm font-medium text-slate-500">Lương tạm tính đã bao gồm thưởng/phạt đã lưu.</p>
            </div>
            <div className="p-3 sm:p-4">
              <SummaryTable rows={pagedRows} isAdmin={isAdmin} />
            </div>
            <Pagination page={summaryPage} totalPages={summaryTotalPages} onChange={setSummaryPage} />
          </>
        )}
      </section>

      <Modal
        open={settingsOpen}
        title="Thiết lập tính lương"
        onClose={() => setSettingsOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-md px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
            <button type="button" onClick={saveSettings} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white">Lưu</button>
          </>
        }
      >
        <div className="grid gap-3">
          {[
            { value: "attendance", title: "Tính theo giờ chấm công", desc: "Dựa trên giờ vào/ra thực tế hoặc giờ admin duyệt trước." },
            { value: "shift", title: "Tính theo giờ ca làm", desc: "Ca hợp lệ hoặc đã duyệt sẽ tính theo toàn bộ thời lượng ca." },
          ].map((option) => (
            <button key={option.value} type="button" onClick={() => setSettings((prev) => ({ ...prev, calculation_mode: option.value }))} className={`rounded-lg border p-4 text-left ${settings.calculation_mode === option.value ? "border-cyan-400 bg-cyan-50" : "border-slate-200"}`}>
              <div className="font-black text-slate-950">{option.title}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">{option.desc}</div>
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
            <button type="button" onClick={() => setResolveOpen(false)} className="rounded-md px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
            <button type="button" onClick={saveResolution} className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-bold text-white">Lưu xử lý</button>
          </>
        }
      >
        {selectedDetail && <div className="mb-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-700">{selectedDetail.employee_name} · {selectedDetail.shift_name} · {dateLabel(selectedDetail.work_date)} · {selectedDetail.shift_time}</div>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setResolveForm((prev) => ({ ...prev, action: "PAY" }))} className={`rounded-lg border p-3 text-sm font-black ${resolveForm.action === "PAY" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 text-slate-600"}`}>Tính lương</button>
          <button type="button" onClick={() => setResolveForm((prev) => ({ ...prev, action: "NO_PAY" }))} className={`rounded-lg border p-3 text-sm font-black ${resolveForm.action === "NO_PAY" ? "border-red-600 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}>Không tính</button>
        </div>
        {resolveForm.action === "PAY" && settings.calculation_mode === "attendance" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">Giờ chấm vào<input type="datetime-local" value={resolveForm.override_check_in} onChange={(event) => setResolveForm((prev) => ({ ...prev, override_check_in: event.target.value }))} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-cyan-500" /></label>
            <label className="text-sm font-bold text-slate-700">Giờ chấm ra<input type="datetime-local" value={resolveForm.override_check_out} onChange={(event) => setResolveForm((prev) => ({ ...prev, override_check_out: event.target.value }))} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-cyan-500" /></label>
          </div>
        )}
        <textarea value={resolveForm.note} onChange={(event) => setResolveForm((prev) => ({ ...prev, note: event.target.value }))} placeholder="Ghi chú" rows={3} className="mt-4 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-cyan-500" />
      </Modal>

      <Modal
        open={adjustOpen}
        title="Thưởng/phạt"
        onClose={() => setAdjustOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setAdjustOpen(false)} className="rounded-md px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
            <button type="button" onClick={saveAdjustment} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Lưu</button>
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
                  onClick={() => setAdjustForm((prev) => ({ ...prev, type: item.value }))}
                  style={{
                    backgroundColor: adjustForm.type === item.value ? item.color : "#ffffff",
                    color: adjustForm.type === item.value ? "#ffffff" : "#334155",
                    borderColor: adjustForm.type === item.value ? item.color : "#cbd5e1",
                  }}
                  className="h-11 rounded-md border text-sm font-black transition hover:opacity-90"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <label className="text-sm font-bold text-slate-700">Ngày<input type="date" value={adjustForm.work_date} onChange={(event) => setAdjustForm((prev) => ({ ...prev, work_date: event.target.value }))} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-cyan-500" /></label>
          <label className="text-sm font-bold text-slate-700">Nhân viên<select value={adjustForm.employee_id} onChange={(event) => setAdjustForm((prev) => ({ ...prev, employee_id: event.target.value }))} className="mt-1 h-11 w-full rounded-md border border-slate-200 bg-white px-3 outline-none focus:border-cyan-500"><option value="">Chọn nhân viên</option>{employees.map((employee) => <option key={employee.employee_id} value={employee.employee_id}>{employee.name}</option>)}</select></label>
          <label className="text-sm font-bold text-slate-700">Số tiền<input type="number" min="0" value={adjustForm.amount} onChange={(event) => setAdjustForm((prev) => ({ ...prev, amount: event.target.value }))} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-cyan-500" /></label>
        </div>
        <textarea value={adjustForm.note} onChange={(event) => setAdjustForm((prev) => ({ ...prev, note: event.target.value }))} placeholder="Ghi chú hiển thị cho nhân viên" rows={3} className="mt-4 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-cyan-500" />
      </Modal>

      <Modal
        open={feedbackOpen}
        title="Phản hồi về lương"
        onClose={() => setFeedbackOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setFeedbackOpen(false)} className="rounded-md px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
            <button type="button" onClick={submitFeedback} className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-bold text-white">Gửi</button>
          </>
        }
      >
        <input value={feedback.subject} onChange={(event) => setFeedback((prev) => ({ ...prev, subject: event.target.value }))} placeholder="Chủ đề" className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-cyan-500" />
        <textarea value={feedback.content} onChange={(event) => setFeedback((prev) => ({ ...prev, content: event.target.value }))} placeholder="Nội dung" rows={4} className="mt-3 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-cyan-500" />
      </Modal>
    </div>
  );
}
