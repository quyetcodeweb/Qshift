import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Spinner,
  Textarea,
  Typography,
} from "@material-tailwind/react";
import {
  ArrowPathIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ChartPieIcon,
  CheckCircleIcon,
  ClockIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  ReceiptPercentIcon,
  TableCellsIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useLocation, useNavigate } from "react-router-dom";
import { getRole } from "../utils/auth";
import { API_URL } from "../services/api";

const summaryPageSize = 8;
const detailPageSize = 10;
const chartColors = [
  "#0891b2",
  "#059669",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#2563eb",
  "#db2777",
  "#475569",
  "#14b8a6",
  "#84cc16",
];

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

function money(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")} đ`;
}

function hours(value) {
  return `${Number(value || 0).toLocaleString("vi-VN", {
    maximumFractionDigits: 2,
  })}h`;
}

function percent(value) {
  return `${Number(value || 0)}%`;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function dateLabel(value) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("vi-VN");
}

function getTabFromSearch(search) {
  const tab = new URLSearchParams(search).get("tab");
  return ["salary", "details", "stats"].includes(tab) ? tab : "salary";
}

function statusMeta(status) {
  const map = {
    VALID: ["Hợp lệ", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
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
    MISSING_CHECK_IN: [
      "Chưa chấm vào",
      "bg-slate-100 text-slate-700 ring-slate-200",
    ],
    MISSING_CHECK_OUT: [
      "Thiếu chấm ra",
      "bg-red-50 text-red-700 ring-red-200",
    ],
    NO_PAYABLE_TIME: [
      "Không có giờ hợp lệ",
      "bg-red-50 text-red-700 ring-red-200",
    ],
  };

  const item = map[status] || map.VALID;
  return { label: item[0], className: item[1] };
}

function StatCard({ icon, label, value, sub, accent = "bg-slate-950" }) {
  const Icon = icon;

  return (
    <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Typography className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {label}
          </Typography>
          <div className="mt-2 truncate text-2xl font-black text-slate-950">
            {value}
          </div>
          {sub && (
            <div className="mt-1 text-xs font-semibold text-slate-500">
              {sub}
            </div>
          )}
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent} text-white`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <span className="text-sm font-semibold text-slate-500">
        Trang {page}/{totalPages}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outlined"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-lg border-slate-300 normal-case"
        >
          Trước
        </Button>
        <Button
          variant="outlined"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded-lg border-slate-300 normal-case"
        >
          Sau
        </Button>
      </div>
    </div>
  );
}

function EmployeePicker({ employees, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = employees.find(
    (employee) => String(employee.employee_id) === value,
  );
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
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-blue-gray-200 bg-white px-3 text-left text-sm font-semibold text-slate-900 outline-none transition hover:border-slate-400"
      >
        <span className="truncate">
          {value === "all"
            ? "Tất cả nhân viên"
            : selected?.name || "Chọn nhân viên"}
        </span>
        <UserCircleIcon className="h-5 w-5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-40 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
          <div className="relative mb-2">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm tên, email, SĐT..."
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-cyan-500"
            />
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => {
                onChange("all");
                setOpen(false);
                setQuery("");
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-bold transition ${
                value === "all"
                  ? "bg-cyan-50 text-cyan-700"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Tất cả nhân viên
            </button>
            {filtered.map((employee) => (
              <button
                key={employee.employee_id}
                type="button"
                onClick={() => {
                  onChange(String(employee.employee_id));
                  setOpen(false);
                  setQuery("");
                }}
                className={`w-full rounded-lg px-3 py-2 text-left transition ${
                  String(employee.employee_id) === value
                    ? "bg-cyan-50 text-cyan-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="truncate text-sm font-bold">
                  {employee.name}
                </div>
                <div className="truncate text-xs font-medium text-slate-500">
                  {employee.email ||
                    employee.phone ||
                    `NV-${employee.employee_id}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <Card className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
      <Typography className="text-sm font-semibold text-slate-500">
        {text}
      </Typography>
    </Card>
  );
}

function SummaryTable({ rows, isAdmin }) {
  if (!rows.length) {
    return (
      <EmptyState text="Không có dữ liệu lương trong bộ lọc hiện tại." />
    );
  }

  return (
    <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              {isAdmin && <th className="px-4 py-4">Nhân viên</th>}
              <th className="px-4 py-4">Ca</th>
              <th className="px-4 py-4">Giờ lịch</th>
              <th className="px-4 py-4">Giờ thực tế</th>
              <th className="px-4 py-4">Giờ tính lương</th>
              <th className="px-4 py-4">Đi trễ</th>
              <th className="px-4 py-4">Cần xử lý</th>
              <th className="px-4 py-4">Lương/giờ</th>
              <th className="px-4 py-4 text-right">Tạm tính</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.employee_id}
                className="border-b border-slate-100 transition hover:bg-slate-50"
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
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                      row.issue_shifts
                        ? "bg-red-50 text-red-700 ring-red-200"
                        : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    }`}
                  >
                    {row.issue_shifts}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-slate-800">
                  {money(row.hourly_rate)}
                </td>
                <td className="px-4 py-4 text-right text-base font-black text-emerald-700">
                  {money(row.total_salary)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DetailList({ details, isAdmin, onResolve }) {
  if (!details.length) {
    return (
      <EmptyState text="Không có chi tiết bảng công trong bộ lọc hiện tại." />
    );
  }

  const ResolveButton = ({ detail }) =>
    isAdmin && detail.needs_resolution ? (
      <button
        type="button"
        onClick={() => onResolve(detail)}
        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-cyan-700 bg-cyan-600 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-cyan-700"
      >
        Xử lý
      </button>
    ) : isAdmin && detail.is_resolved ? (
      <button
        type="button"
        onClick={() => onResolve(detail)}
        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm transition hover:bg-slate-100"
      >
        Hoàn tác
      </button>
    ) : null;

  return (
    <div className="space-y-3">
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-4">Ngày</th>
                {isAdmin && <th className="px-4 py-4">Nhân viên</th>}
                <th className="px-4 py-4">Ca làm</th>
                <th className="px-4 py-4">Chấm công</th>
                <th className="px-4 py-4">Trễ</th>
                <th className="px-4 py-4">Giờ hợp lệ</th>
                <th className="px-4 py-4">Trạng thái</th>
                <th className="px-4 py-4 text-right">Lương</th>
                {isAdmin && <th className="px-4 py-4 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {details.map((detail) => {
                const meta = statusMeta(detail.payroll_status);
                return (
                  <tr
                    key={detail.schedule_id}
                    className="border-b border-slate-100 transition hover:bg-slate-50"
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
                      <div className="mt-1 text-xs font-semibold text-slate-500">
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
                        <ResolveButton detail={detail} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        {details.map((detail) => {
          const meta = statusMeta(detail.payroll_status);
          return (
            <Card
              key={detail.schedule_id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-950">
                    {detail.shift_name}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {dateLabel(detail.work_date)} · {detail.shift_time}
                  </div>
                  {isAdmin && (
                    <div className="mt-2 text-sm font-bold text-slate-800">
                      {detail.employee_name}
                    </div>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${meta.className}`}
                >
                  {meta.label}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs font-bold uppercase text-slate-400">
                    Chấm công
                  </div>
                  <div className="mt-1 font-bold text-slate-900">
                    {detail.checked_time}
                  </div>
                </div>
                <div className="rounded-lg bg-cyan-50 p-3">
                  <div className="text-xs font-bold uppercase text-cyan-600">
                    Giờ hợp lệ
                  </div>
                  <div className="mt-1 font-black text-cyan-800">
                    {hours(detail.payable_hours)}
                  </div>
                </div>
                <div className="rounded-lg bg-orange-50 p-3">
                  <div className="text-xs font-bold uppercase text-orange-600">
                    Đi trễ
                  </div>
                  <div className="mt-1 font-bold text-orange-800">
                    {detail.late_minutes || 0}p
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3">
                  <div className="text-xs font-bold uppercase text-emerald-600">
                    Lương
                  </div>
                  <div className="mt-1 font-black text-emerald-800">
                    {money(detail.salary)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <ResolveButton detail={detail} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PayrollChart({ rows, type }) {
  const chartRows = rows.slice(0, 10);
  const maxSalary = Math.max(
    ...chartRows.map((row) => Number(row.total_salary || 0)),
    1,
  );
  const totalSalary =
    chartRows.reduce((sum, row) => sum + Number(row.total_salary || 0), 0) || 1;

  if (!chartRows.length) {
    return <EmptyState text="Không có dữ liệu để thống kê." />;
  }

  if (type === "pie") {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-center">
          <div
            className="mx-auto h-64 w-64 rounded-full"
            style={{
              background: `conic-gradient(${chartRows
                .map((row, index) => {
                  const start = chartRows
                    .slice(0, index)
                    .reduce(
                      (sum, item) =>
                        sum +
                        (Number(item.total_salary || 0) / totalSalary) * 100,
                      0,
                    );
                  const end =
                    start + (Number(row.total_salary || 0) / totalSalary) * 100;
                  return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
                })
                .join(", ")})`,
            }}
          />
          <div className="space-y-3">
            {chartRows.map((row, index) => (
              <div
                key={row.employee_id}
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        chartColors[index % chartColors.length],
                    }}
                  />
                  <span className="truncate text-sm font-bold text-slate-800">
                    {row.employee_name}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-black text-emerald-700">
                  {money(row.total_salary)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        {chartRows.map((row) => (
          <div
            key={row.employee_id}
            className="grid gap-2 md:grid-cols-[190px_minmax(0,1fr)_130px] md:items-center"
          >
            <div className="min-w-0">
              <div className="truncate font-bold text-slate-950">
                {row.employee_name}
              </div>
              <div className="text-xs font-semibold text-slate-500">
                {hours(row.worked_hours)} · {row.total_shifts} ca ·{" "}
                {percent(row.efficiency)} đúng giờ
              </div>
            </div>
            <div className="h-9 overflow-hidden rounded-full bg-slate-100">
              <div
                className="flex h-full items-center justify-end rounded-full bg-cyan-500 pr-3 text-xs font-black text-white"
                style={{
                  width: `${Math.max((Number(row.total_salary || 0) / maxSalary) * 100, 6)}%`,
                }}
              >
                {percent(row.productivity)}
              </div>
            </div>
            <div className="text-left font-black text-emerald-700 md:text-right">
              {money(row.total_salary)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function PayrollPage() {
  const role = getRole();
  const isAdmin = role === "ADMIN";
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(getTabFromSearch(location.search));
  const [chartType, setChartType] = useState("bar");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [resolveForm, setResolveForm] = useState({
    action: "PAY",
    override_check_in: "",
    override_check_out: "",
    note: "",
  });
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
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingResolve, setSavingResolve] = useState(false);
  const [error, setError] = useState("");
  const [summaryPage, setSummaryPage] = useState(1);
  const [detailPage, setDetailPage] = useState(1);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState({ subject: "", content: "" });

  useEffect(() => {
    setActiveTab(getTabFromSearch(location.search));
  }, [location.search]);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchEmployees = async () => {
      try {
        const res = await axios.get(`${API_URL}/employees`, {
          headers: authHeaders(),
        });
        setEmployees(res.data || []);
      } catch (err) {
        console.error("[Payroll] Load employees:", err);
      }
    };

    fetchEmployees();
  }, [isAdmin]);

  const fetchPayroll = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = {
        startDate: filters.startDate,
        endDate: filters.endDate,
      };

      if (isAdmin && filters.employee_id !== "all") {
        params.employee_id = filters.employee_id;
      }

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

  const setTab = (tab) => {
    setActiveTab(tab);
    navigate(`/payroll?tab=${tab}`);
  };

  const summaryTotalPages = Math.max(
    1,
    Math.ceil(rows.length / summaryPageSize),
  );
  const detailTotalPages = Math.max(
    1,
    Math.ceil(details.length / detailPageSize),
  );
  const pagedRows = useMemo(
    () =>
      rows.slice(
        (summaryPage - 1) * summaryPageSize,
        summaryPage * summaryPageSize,
      ),
    [rows, summaryPage],
  );
  const pagedDetails = useMemo(
    () =>
      details.slice(
        (detailPage - 1) * detailPageSize,
        detailPage * detailPageSize,
      ),
    [details, detailPage],
  );

  useEffect(() => {
    setSummaryPage((page) => Math.min(page, summaryTotalPages));
  }, [summaryTotalPages]);

  useEffect(() => {
    setDetailPage((page) => Math.min(page, detailTotalPages));
  }, [detailTotalPages]);

  const rangeText =
    filters.startDate || filters.endDate
      ? `${filters.startDate || "Từ đầu"} đến ${filters.endDate || "hiện tại"}`
      : "Tất cả thời gian";

  const undoResolution = async (detail) => {
    if (!window.confirm(`Hoàn tác xử lý ca lương của ${detail.employee_name}?`)) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/payroll/resolve/${detail.schedule_id}`, {
        headers: authHeaders(),
      });
      await fetchPayroll();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể hoàn tác xử lý");
    }
  };

  const openResolve = (detail) => {
    if (detail.is_resolved && !detail.needs_resolution) {
      undoResolution(detail);
      return;
    }

    setSelectedDetail(detail);
    setResolveForm({
      action: "PAY",
      override_check_in: detail.effective_check_in
        ? String(detail.effective_check_in).replace(" ", "T").slice(0, 16)
        : `${detail.work_date}T${String(detail.start_time || "00:00").slice(0, 5)}`,
      override_check_out: detail.effective_check_out
        ? String(detail.effective_check_out).replace(" ", "T").slice(0, 16)
        : `${detail.work_date}T${String(detail.end_time || "00:00").slice(0, 5)}`,
      note: "",
    });
    setResolveOpen(true);
  };

  const saveSettings = async () => {
    try {
      setSavingSettings(true);
      const res = await axios.put(`${API_URL}/payroll/settings`, settings, {
        headers: authHeaders(),
      });
      setSettings(res.data);
      setSettingsOpen(false);
      await fetchPayroll();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể lưu thiết lập");
    } finally {
      setSavingSettings(false);
    }
  };

  const saveResolution = async () => {
    if (!selectedDetail) return;
    try {
      setSavingResolve(true);
      await axios.post(
        `${API_URL}/payroll/resolve/${selectedDetail.schedule_id}`,
        resolveForm,
        { headers: authHeaders() },
      );
      setResolveOpen(false);
      setSelectedDetail(null);
      await fetchPayroll();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý ca lương");
    } finally {
      setSavingResolve(false);
    }
  };

  const submitFeedback = async () => {
    try {
      await axios.post(`${API_URL}/payroll/feedback`, feedback, {
        headers: authHeaders(),
      });
      alert("Đã gửi phản hồi đến admin");
      setFeedback({ subject: "", content: "" });
      setFeedbackOpen(false);
    } catch (err) {
      alert(err.response?.data?.message || "Không thể gửi phản hồi");
    }
  };

  const modeText =
    settings.calculation_mode === "shift"
      ? "Tính theo giờ ca làm"
      : "Tính theo giờ chấm công";

  return (
    <div
      className="mx-auto max-w-[1500px] space-y-5"
      style={{ fontFamily: '"Segoe UI", Arial, Tahoma, sans-serif' }}
    >
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:p-6">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-cyan-100 ring-1 ring-white/15">
              <ReceiptPercentIcon className="h-4 w-4" />
              {modeText}
            </div>
            <Typography
              variant="h3"
              className="font-black tracking-normal text-white"
              style={{ color: "#ffffff" }}
            >
              Lương nhân viên
            </Typography>
            <Typography className="mt-2 max-w-2xl text-sm font-medium text-slate-300">
              Chỉ cộng lương cho ca hợp lệ hoặc ca đã được admin xử lý. Ca thiếu
              chấm công sẽ chờ quyết định trước khi tính vào lương.
            </Typography>
          </div>

          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-cyan-300 bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-none transition hover:bg-cyan-300"
              >
                <Cog6ToothIcon className="h-5 w-5" />
                Thiết lập
              </button>
            )}
            {!isAdmin && (
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-cyan-300 bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-none transition hover:bg-cyan-300"
              >
                <PaperAirplaneIcon className="h-5 w-5" />
                Phản hồi lương
              </button>
            )}
            <button
              type="button"
              onClick={fetchPayroll}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/80 bg-white px-4 py-3 text-sm font-bold text-slate-950 shadow-none transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowPathIcon className="h-5 w-5" />
              Làm mới
            </button>
          </div>
        </div>
      </section>

      <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-950">
          <FunnelIcon className="h-5 w-5 text-cyan-600" />
          Bộ lọc kỳ lương
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
          <Input
            type="date"
            label="Từ ngày"
            value={filters.startDate}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, startDate: event.target.value }))
            }
          />
          <Input
            type="date"
            label="Đến ngày"
            min={filters.startDate || undefined}
            value={filters.endDate}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, endDate: event.target.value }))
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <CalendarDaysIcon className="h-4 w-4" />
          {rangeText}
        </div>
      </Card>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {[
            { id: "salary", label: "Tổng hợp", icon: TableCellsIcon },
            { id: "details", label: "Chi tiết ca", icon: ClockIcon },
            { id: "stats", label: "Thống kê", icon: ChartBarIcon },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "filled" : "outlined"}
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-2 rounded-xl normal-case ${
                activeTab === tab.id
                  ? "bg-green-500 text-white"
                  : "border-slate-300 text-slate-800"
              }`}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={BanknotesIcon}
          label="Lương tạm tính"
          value={money(totals.total_salary)}
          sub={`${hours(totals.worked_hours)} hợp lệ`}
          accent="bg-emerald-600"
        />
        <StatCard
          icon={ClockIcon}
          label="Giờ theo lịch"
          value={hours(totals.scheduled_hours)}
          sub={`${totals.total_shifts || 0} ca đã công bố`}
          accent="bg-slate-950"
        />
        <StatCard
          icon={CheckCircleIcon}
          label="Đúng giờ"
          value={totals.on_time_shifts || 0}
          sub={`Hiệu suất ${percent(totals.efficiency)}`}
          accent="bg-cyan-600"
        />
        <StatCard
          icon={ExclamationTriangleIcon}
          label="Cần xử lý"
          value={totals.issue_shifts || 0}
          sub={`${totals.missing_shifts || 0} ca chưa chấm`}
          accent="bg-red-600"
        />
        <StatCard
          icon={UserCircleIcon}
          label="Năng suất"
          value={percent(totals.productivity)}
          sub={`${totals.attended_shifts || 0}/${totals.total_shifts || 0} ca có chấm công`}
          accent="bg-amber-500"
        />
      </div>

      {loading ? (
        <Card className="flex h-56 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <Spinner className="h-9 w-9 text-cyan-600" />
        </Card>
      ) : activeTab === "stats" && isAdmin ? (
        <Card className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Typography variant="h6" className="font-black text-slate-950">
                Thống kê lương
              </Typography>
              <Typography className="text-sm font-medium text-slate-500">
                Chọn kiểu biểu đồ phù hợp với cách admin muốn xem dữ liệu.
              </Typography>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "bar", label: "Cột", icon: ChartBarIcon },
                { id: "pie", label: "Tròn", icon: ChartPieIcon },
              ].map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={chartType === item.id ? "filled" : "outlined"}
                  onClick={() => setChartType(item.id)}
                  className={`flex items-center gap-2 rounded-lg normal-case ${
                    chartType === item.id
                      ? "bg-green-500 text-white"
                      : "border-slate-300 text-slate-800"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <PayrollChart rows={rows} type={chartType} />
        </Card>
      ) : activeTab === "details" || !isAdmin ? (
        <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-4">
            <Typography variant="h6" className="font-black text-slate-950">
              Chi tiết bảng công
            </Typography>
            <Typography className="text-sm font-medium text-slate-500">
              Ca chưa hợp lệ sẽ không được tính lương cho đến khi admin xử lý.
            </Typography>
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
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-4">
            <Typography variant="h6" className="font-black text-slate-950">
              Tổng hợp lương theo nhân viên
            </Typography>
            <Typography className="text-sm font-medium text-slate-500">
              Chỉ những ca đã hợp lệ hoặc đã được admin giải quyết mới cộng vào
              lương tạm tính.
            </Typography>
          </div>
          <div className="p-3 sm:p-4">
            <SummaryTable rows={pagedRows} isAdmin={isAdmin} />
          </div>
          <Pagination
            page={summaryPage}
            totalPages={summaryTotalPages}
            onChange={setSummaryPage}
          />
        </Card>
      )}

      <Dialog
        open={settingsOpen}
        handler={() => setSettingsOpen(false)}
        size="sm"
      >
        <DialogHeader className="flex items-center justify-between">
          <span>Thiết lập tính lương</span>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {[
            {
              value: "attendance",
              title: "Tính theo giờ chấm công",
              desc: "Lương dựa trên giờ vào/ra thực tế. Ca thiếu dữ liệu cần admin nhập giờ bù khi xử lý.",
            },
            {
              value: "shift",
              title: "Tính theo giờ ca làm",
              desc: "Ca hợp lệ hoặc được duyệt sẽ tính theo toàn bộ thời lượng ca đã xếp.",
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
              className={`w-full rounded-xl border p-4 text-left transition ${
                settings.calculation_mode === option.value
                  ? "border-cyan-400 bg-cyan-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="font-black text-slate-950">{option.title}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">
                {option.desc}
              </div>
            </button>
          ))}
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button
            variant="text"
            color="red"
            onClick={() => setSettingsOpen(false)}
          >
            Hủy
          </Button>
          <Button
            onClick={saveSettings}
            disabled={savingSettings}
            className="bg-slate-950"
          >
            Lưu thiết lập
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={resolveOpen}
        handler={() => setResolveOpen(false)}
        size="sm"
      >
        <DialogHeader>Xử lý ca tính lương</DialogHeader>
        <DialogBody className="space-y-4">
          {selectedDetail && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              {selectedDetail.employee_name} · {selectedDetail.shift_name} ·{" "}
              {dateLabel(selectedDetail.work_date)} ·{" "}
              {selectedDetail.shift_time}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setResolveForm((prev) => ({ ...prev, action: "PAY" }))
              }
              className={`rounded-xl border p-3 text-sm font-black ${
                resolveForm.action === "PAY"
                  ? "border-emerald-300 bg-green-500 text-white"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              Tính lương
            </button>
            <button
              type="button"
              onClick={() =>
                setResolveForm((prev) => ({ ...prev, action: "NO_PAY" }))
              }
              className={`rounded-xl border p-3 text-sm font-black ${
                resolveForm.action === "NO_PAY"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              Không tính
            </button>
          </div>
          {resolveForm.action === "PAY" &&
            settings.calculation_mode === "attendance" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  type="datetime-local"
                  label="Giờ chấm vào"
                  value={resolveForm.override_check_in}
                  onChange={(event) =>
                    setResolveForm((prev) => ({
                      ...prev,
                      override_check_in: event.target.value,
                    }))
                  }
                />
                <Input
                  type="datetime-local"
                  label="Giờ chấm ra"
                  value={resolveForm.override_check_out}
                  onChange={(event) =>
                    setResolveForm((prev) => ({
                      ...prev,
                      override_check_out: event.target.value,
                    }))
                  }
                />
              </div>
            )}
          <Textarea
            label="Ghi chú"
            value={resolveForm.note}
            onChange={(event) =>
              setResolveForm((prev) => ({ ...prev, note: event.target.value }))
            }
          />
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button
            variant="text"
            color="red"
            onClick={() => setResolveOpen(false)}
          >
            Hủy
          </Button>
          <Button
            onClick={saveResolution}
            disabled={savingResolve}
            className="bg-light-green-500"
          >
            Lưu xử lý
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={feedbackOpen}
        handler={() => setFeedbackOpen(false)}
        size="sm"
      >
        <DialogHeader>Phản hồi về lương</DialogHeader>
        <DialogBody className="space-y-4">
          <Input
            label="Chủ đề"
            value={feedback.subject}
            onChange={(event) =>
              setFeedback((prev) => ({ ...prev, subject: event.target.value }))
            }
          />
          <Textarea
            label="Nội dung"
            value={feedback.content}
            onChange={(event) =>
              setFeedback((prev) => ({ ...prev, content: event.target.value }))
            }
          />
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button
            variant="text"
            color="red"
            onClick={() => setFeedbackOpen(false)}
          >
            Hủy
          </Button>
          <Button className="bg-slate-950" onClick={submitFeedback}>
            Gửi
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
