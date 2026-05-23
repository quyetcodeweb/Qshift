import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowPathIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { API_URL } from "../services/api";

const now = new Date();
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const palette = ["#2563eb", "#059669", "#f97316", "#dc2626", "#7c3aed", "#0891b2"];

const views = [
  { key: "overview", label: "Tổng quan", icon: ChartBarIcon },
  { key: "employees", label: "Nhân sự", icon: UserGroupIcon },
  { key: "payroll", label: "Lương", icon: BanknotesIcon },
  { key: "schedules", label: "Lịch làm", icon: CalendarDaysIcon },
  { key: "attendance", label: "Ra vào", icon: ClockIcon },
];

const toneClasses = {
  blue: {
    bar: "bg-blue-600",
    soft: "bg-blue-50 text-blue-700 ring-blue-100",
    icon: "bg-blue-50 text-blue-700",
  },
  green: {
    bar: "bg-emerald-600",
    soft: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    icon: "bg-emerald-50 text-emerald-700",
  },
  orange: {
    bar: "bg-orange-500",
    soft: "bg-orange-50 text-orange-700 ring-orange-100",
    icon: "bg-orange-50 text-orange-700",
  },
  red: {
    bar: "bg-red-600",
    soft: "bg-red-50 text-red-700 ring-red-100",
    icon: "bg-red-50 text-red-700",
  },
  violet: {
    bar: "bg-violet-600",
    soft: "bg-violet-50 text-violet-700 ring-violet-100",
    icon: "bg-violet-50 text-violet-700",
  },
  slate: {
    bar: "bg-slate-500",
    soft: "bg-slate-100 text-slate-700 ring-slate-200",
    icon: "bg-slate-100 text-slate-700",
  },
};

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function monthRange(value) {
  const [year, month] = value.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    month,
    year,
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
  };
}

function n(value) {
  return Number(value || 0);
}

function fmt(value, digits = 0) {
  return n(value).toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

function money(value) {
  return n(value).toLocaleString("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  });
}

function dateLabel(value) {
  if (!value) return "-";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

function timeLabel(value) {
  if (!value) return "--:--";
  const raw = String(value);
  return raw.includes(" ") ? raw.slice(11, 16) : raw.slice(0, 5);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isActiveEmployee(employee) {
  const status = normalize(employee.status);
  return !status || status.includes("active") || status.includes("dang") || status === "1";
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function countBy(items, getKey) {
  return items.reduce((map, item) => {
    const key = getKey(item);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
}

function Status({ children, tone = "slate" }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${toneClasses[tone].soft}`}>
      {children}
    </span>
  );
}

function Metric({ icon, label, value, helper, tone = "blue" }) {
  const MetricIcon = icon;
  const classes = toneClasses[tone] || toneClasses.blue;

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-2 truncate text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            {value}
          </div>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${classes.icon}`}>
          <MetricIcon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 h-1.5 w-14 rounded-full bg-slate-100">
        <div className={`h-full w-2/3 rounded-full ${classes.bar}`} />
      </div>
      <div className="mt-3 text-sm font-medium leading-5 text-slate-600">{helper}</div>
    </section>
  );
}

function Section({ title, subtitle, action, children }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <h2 className="text-base font-black text-slate-950 sm:text-lg">{title}</h2>
          {subtitle && <p className="mt-1 text-sm font-medium leading-6 text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function EmptyState({ text = "Chưa có dữ liệu" }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-500">
      {text}
    </div>
  );
}

function BarList({ data, suffix = "", empty = "Chưa có dữ liệu" }) {
  const max = Math.max(1, ...data.map((item) => n(item.value)));

  if (!data.length) return <EmptyState text={empty} />;

  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={`${item.label}-${index}`} className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-bold text-slate-700">{item.label}</span>
            <span className="shrink-0 font-black text-slate-950">
              {item.display || `${fmt(item.value, 1)}${suffix}`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(4, (n(item.value) / max) * 100)}%`,
                backgroundColor: item.color || palette[index % palette.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniTrend({ data }) {
  const max = Math.max(1, ...data.map((item) => n(item.value)));
  const rows = data.length ? data : [{ label: "01", value: 0 }];

  return (
    <div className="flex h-52 items-end gap-2 overflow-x-auto rounded-md bg-slate-50 px-3 py-4">
      {rows.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex min-w-10 flex-1 flex-col items-center justify-end gap-2">
          <div className="text-xs font-black text-slate-700">{fmt(item.value)}</div>
          <div
            className="w-full max-w-8 rounded-t-md bg-blue-600"
            style={{ height: `${Math.max(8, (n(item.value) / max) * 132)}px` }}
          />
          <div className="text-[11px] font-bold text-slate-500">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function EfficiencyStatus({ value }) {
  if (value >= 90) return <Status tone="green">Ổn định</Status>;
  if (value >= 70) return <Status tone="blue">Theo dõi</Status>;
  if (value >= 50) return <Status tone="orange">Cần chú ý</Status>;
  return <Status tone="red">Cần xử lý</Status>;
}

function EmployeeTable({ rows }) {
  if (!rows.length) return <EmptyState text="Chưa có dữ liệu nhân viên" />;

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[920px] text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-black uppercase tracking-wide text-slate-500">
              <th className="py-3 pr-4">Nhân viên</th>
              <th className="px-4 py-3 text-right">Ca</th>
              <th className="px-4 py-3 text-right">Giờ công</th>
              <th className="px-4 py-3 text-right">Lương</th>
              <th className="px-4 py-3 text-right">Đúng giờ</th>
              <th className="px-4 py-3 text-right">Trễ</th>
              <th className="px-4 py-3 text-right">Lỗi công</th>
              <th className="py-3 pl-4">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.employee_id} className="text-sm">
                <td className="py-3 pr-4">
                  <div className="font-black text-slate-950">{row.employee_name}</div>
                  <div className="mt-1 text-xs font-medium text-slate-500">{row.email || `ID ${row.employee_id}`}</div>
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-700">{fmt(row.total_shifts)}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-700">{fmt(row.worked_hours, 1)}h</td>
                <td className="px-4 py-3 text-right font-black text-slate-950">{money(row.total_salary)}</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-700">{fmt(row.efficiency)}%</td>
                <td className="px-4 py-3 text-right font-bold text-orange-700">{fmt(row.late_shifts)}</td>
                <td className="px-4 py-3 text-right font-bold text-red-700">{fmt(row.issue_shifts)}</td>
                <td className="py-3 pl-4">
                  <EfficiencyStatus value={n(row.efficiency)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {rows.map((row) => (
          <article key={row.employee_id} className="rounded-md border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-950">{row.employee_name}</div>
                <div className="mt-1 text-xs font-medium text-slate-500">{row.email || `ID ${row.employee_id}`}</div>
              </div>
              <EfficiencyStatus value={n(row.efficiency)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-slate-50 p-2">
                <div className="text-xs font-bold text-slate-500">Ca</div>
                <div className="font-black text-slate-950">{fmt(row.total_shifts)}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-2">
                <div className="text-xs font-bold text-slate-500">Giờ công</div>
                <div className="font-black text-slate-950">{fmt(row.worked_hours, 1)}h</div>
              </div>
              <div className="rounded-md bg-slate-50 p-2">
                <div className="text-xs font-bold text-slate-500">Lương</div>
                <div className="font-black text-slate-950">{money(row.total_salary)}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-2">
                <div className="text-xs font-bold text-slate-500">Trễ / lỗi</div>
                <div className="font-black text-slate-950">
                  {fmt(row.late_shifts)} / {fmt(row.issue_shifts)}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function AttentionList({ rows }) {
  if (!rows.length) return <EmptyState text="Không có cảnh báo" />;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.employee_id} className="rounded-md border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-950">{row.employee_name}</div>
              <div className="mt-1 text-xs font-medium text-slate-500">
                {fmt(row.total_shifts)} ca, {fmt(row.worked_hours, 1)}h công
              </div>
            </div>
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-orange-500" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Status tone="orange">{fmt(row.late_shifts)} trễ</Status>
            <Status tone="red">{fmt(row.issue_shifts)} lỗi công</Status>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventList({ events }) {
  if (!events.length) return <EmptyState text="Chưa có lượt ra vào" />;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {events.map((event) => (
        <div
          key={`${event.schedule_id}-${event.effective_check_in || event.check_in || event.work_date}`}
          className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_auto] sm:items-center"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-950">{event.employee_name}</div>
            <div className="mt-1 text-xs font-medium text-slate-500">
              {dateLabel(event.work_date)} - {event.shift_name} - {event.shift_time}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">
              Vào {timeLabel(event.effective_check_in || event.check_in)}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
              Ra {timeLabel(event.effective_check_out || event.check_out)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StatisticsPage() {
  const [activeView, setActiveView] = useState("overview");
  const [month, setMonth] = useState(currentMonth);
  const [employeeId, setEmployeeId] = useState("all");
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [payrollRows, setPayrollRows] = useState([]);
  const [payrollDetails, setPayrollDetails] = useState([]);
  const [payrollTotals, setPayrollTotals] = useState({});
  const [payrollSettings, setPayrollSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const range = useMemo(() => monthRange(month), [month]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const headers = authHeaders();
      const employeeParam = employeeId !== "all" ? { employee_id: employeeId } : {};
      const [employeeRes, scheduleRes, attendanceRes, payrollRes] = await Promise.all([
        axios.get(`${API_URL}/employees`, { headers }),
        axios.get(`${API_URL}/schedules/current`, {
          headers,
          params: { month: range.month, year: range.year, scope: "all" },
        }),
        axios.get(`${API_URL}/attendance/history`, {
          headers,
          params: { startDate: range.startDate, endDate: range.endDate, ...employeeParam },
        }),
        axios.get(`${API_URL}/payroll/summary`, {
          headers,
          params: { startDate: range.startDate, endDate: range.endDate, ...employeeParam },
        }),
      ]);

      setEmployees(employeeRes.data || []);
      setSchedules(scheduleRes.data || []);
      setAttendance(attendanceRes.data?.records || []);
      setPayrollRows(payrollRes.data?.rows || []);
      setPayrollDetails(payrollRes.data?.details || []);
      setPayrollTotals(payrollRes.data?.totals || {});
      setPayrollSettings(payrollRes.data?.settings || {});
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Không thể tải thống kê");
    } finally {
      setLoading(false);
    }
  }, [employeeId, range.endDate, range.month, range.startDate, range.year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedEmployeeName = useMemo(() => {
    if (employeeId === "all") return "Tất cả nhân viên";
    return employees.find((employee) => String(employee.employee_id) === String(employeeId))?.name || "Nhân viên";
  }, [employeeId, employees]);

  const filteredEmployees = useMemo(() => {
    if (employeeId === "all") return employees;
    return employees.filter((employee) => String(employee.employee_id) === String(employeeId));
  }, [employeeId, employees]);

  const employeeStats = useMemo(() => {
    const active = filteredEmployees.filter(isActiveEmployee).length;
    const inactive = Math.max(filteredEmployees.length - active, 0);
    const noSchedule = filteredEmployees.filter(
      (employee) => !schedules.some((schedule) => Number(schedule.employee_id) === Number(employee.employee_id)),
    ).length;
    const topWorkers = [...payrollRows]
      .sort((a, b) => n(b.worked_hours) - n(a.worked_hours))
      .slice(0, 6)
      .map((row) => ({
        label: row.employee_name,
        value: row.worked_hours,
        display: `${fmt(row.worked_hours, 1)}h - ${money(row.total_salary)}`,
      }));
    const attention = [...payrollRows]
      .sort((a, b) => n(b.late_shifts) + n(b.issue_shifts) - n(a.late_shifts) - n(a.issue_shifts))
      .slice(0, 6);
    return { active, inactive, noSchedule, topWorkers, attention };
  }, [filteredEmployees, payrollRows, schedules]);

  const scheduleStats = useMemo(() => {
    const byShift = [...countBy(schedules, (item) => item.shift_name || "Chưa rõ").entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    const byWeekday = weekdays.map((label, index) => ({
      label,
      value: schedules.filter((item) => new Date(`${item.work_date}T00:00:00`).getDay() === index).length,
    }));
    const peakDays = [...countBy(schedules, (item) => String(item.work_date).slice(0, 10)).entries()]
      .map(([label, value]) => ({ label: dateLabel(label), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    return { byShift, byWeekday, peakDays };
  }, [schedules]);

  const attendanceStats = useMemo(() => {
    const checkedIn = attendance.filter((item) => item.check_in).length;
    const completed = attendance.filter((item) => item.check_in && item.check_out).length;
    const late = attendance.filter((item) => item.attendance_status === "LATE").length;
    const missing = attendance.filter((item) => !item.check_in).length;
    const early = payrollDetails.filter((item) => n(item.early_leave_minutes) > 0).length;
    const lateMinutes = payrollDetails.reduce((sum, item) => sum + n(item.late_minutes), 0);
    const earlyMinutes = payrollDetails.reduce((sum, item) => sum + n(item.early_leave_minutes), 0);
    const byDay = [...countBy(attendance.filter((item) => item.check_in), (item) => String(item.check_in).slice(8, 10)).entries()]
      .map(([label, value]) => ({ label, value }))
      .slice(-14);
    const byHour = [...countBy(attendance.filter((item) => item.check_in), (item) => `${String(item.check_in).slice(11, 13)}:00`).entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return {
      checkedIn,
      completed,
      late,
      missing,
      early,
      lateMinutes,
      earlyMinutes,
      byDay,
      byHour,
      attendanceRate: percent(checkedIn, attendance.length),
      completionRate: percent(completed, attendance.length),
    };
  }, [attendance, payrollDetails]);

  const salaryStats = useMemo(() => {
    const avgSalary = payrollRows.length
      ? payrollRows.reduce((sum, row) => sum + n(row.total_salary), 0) / payrollRows.length
      : 0;
    const avgHourly = payrollRows.length
      ? payrollRows.reduce((sum, row) => sum + n(row.hourly_rate), 0) / payrollRows.length
      : 0;
    const highest = [...payrollRows].sort((a, b) => n(b.total_salary) - n(a.total_salary))[0];
    return { avgSalary, avgHourly, highest };
  }, [payrollRows]);

  const latestEvents = useMemo(
    () =>
      [...payrollDetails]
        .filter((item) => item.effective_check_in || item.check_in)
        .sort((a, b) => String(b.effective_check_in || b.check_in).localeCompare(String(a.effective_check_in || a.check_in)))
        .slice(0, 8),
    [payrollDetails],
  );

  const show = (...keys) => activeView === "overview" || keys.includes(activeView);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_560px] xl:items-end">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-blue-700">QShift Analytics</div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Thống kê vận hành
            </h1>
            <div className="mt-2 flex flex-wrap gap-2 text-sm font-bold text-slate-600">
              <span className="rounded-md bg-slate-100 px-2.5 py-1">{selectedEmployeeName}</span>
              <span className="rounded-md bg-slate-100 px-2.5 py-1">
                {range.startDate} - {range.endDate}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="grid gap-1 text-sm font-bold text-slate-700">
              Tháng
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value || currentMonth)}
                className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-slate-700">
              Nhân viên
              <select
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
              >
                <option value="all">Tất cả nhân viên</option>
                {employees.map((employee) => (
                  <option key={employee.employee_id} value={employee.employee_id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              <ArrowPathIcon className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
              Làm mới
            </button>
          </div>
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-md border border-slate-200 bg-white p-2 shadow-sm">
        {views.map((view) => {
          const ViewIcon = view.icon;
          return (
            <button
              key={view.key}
              type="button"
              onClick={() => setActiveView(view.key)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-black transition ${
                activeView === view.key
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <ViewIcon className="h-4 w-4" />
              {view.label}
            </button>
          );
        })}
      </nav>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid min-h-[420px] place-items-center rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            <div className="text-sm font-bold text-slate-600">Đang tổng hợp thống kê...</div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              icon={UserGroupIcon}
              label="Nhân viên hoạt động"
              value={fmt(employeeStats.active)}
              helper={`${fmt(employeeStats.inactive)} ngừng hoạt động, ${fmt(employeeStats.noSchedule)} chưa có lịch`}
              tone="blue"
            />
            <Metric
              icon={CalendarDaysIcon}
              label="Ca đã xếp"
              value={fmt(schedules.length)}
              helper={`${fmt(payrollTotals.scheduled_hours, 1)} giờ lịch, ${fmt(attendanceStats.attendanceRate)}% có chấm vào`}
              tone="green"
            />
            <Metric
              icon={BanknotesIcon}
              label="Lương tạm tính"
              value={money(payrollTotals.total_salary)}
              helper={`${fmt(payrollTotals.worked_hours, 1)} giờ được trả, TB ${money(salaryStats.avgSalary)}/người`}
              tone="orange"
            />
            <Metric
              icon={ExclamationTriangleIcon}
              label="Trễ / về sớm"
              value={`${fmt(attendanceStats.late)} / ${fmt(attendanceStats.early)}`}
              helper={`${fmt(attendanceStats.lateMinutes)} phút trễ, ${fmt(attendanceStats.earlyMinutes)} phút về sớm`}
              tone="red"
            />
          </div>

          {show("employees") && (
            <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Section title="Nhân viên cần chú ý" subtitle="Dựa trên số lượt trễ và ca thiếu dữ liệu.">
                <AttentionList rows={employeeStats.attention} />
              </Section>
              <Section title="Hiệu suất nhân viên" subtitle="Tổng hợp ca, giờ công, lương, đúng giờ và lỗi công.">
                <EmployeeTable rows={payrollRows} />
              </Section>
            </div>
          )}

          {show("payroll") && (
            <div className="grid gap-5 xl:grid-cols-[0.85fr_1.35fr]">
              <Section title="Cách tính lương" subtitle="Tóm tắt logic tính lương đang áp dụng cho kỳ này.">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-md border border-slate-200 p-4">
                    <div className="text-sm font-bold text-slate-500">Chế độ tính</div>
                    <div className="mt-1 text-xl font-black text-slate-950">
                      {payrollSettings.calculation_mode === "shift"
                        ? "Theo giờ ca đã xếp"
                        : "Theo giờ chấm công hợp lệ"}
                    </div>
                  </div>
                  <div className="rounded-md bg-emerald-50 p-4">
                    <div className="text-sm font-bold text-emerald-700">Giờ được trả</div>
                    <div className="mt-1 text-2xl font-black text-emerald-950">
                      {fmt(payrollTotals.worked_hours, 1)}h
                    </div>
                  </div>
                  <div className="rounded-md bg-orange-50 p-4">
                    <div className="text-sm font-bold text-orange-700">Ca cần xử lý</div>
                    <div className="mt-1 text-2xl font-black text-orange-950">
                      {fmt(payrollTotals.issue_shifts)}
                    </div>
                  </div>
                </div>
              </Section>
              <Section title="Phân bổ lương" subtitle="Nhân viên có lương cao, trung bình lương và mức giờ.">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md bg-slate-50 p-4">
                    <div className="text-sm font-bold text-slate-500">Cao nhất</div>
                    <div className="mt-1 text-xl font-black text-slate-950">
                      {money(salaryStats.highest?.total_salary)}
                    </div>
                    <div className="mt-1 truncate text-xs font-bold text-slate-500">
                      {salaryStats.highest?.employee_name || "-"}
                    </div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-4">
                    <div className="text-sm font-bold text-slate-500">Trung bình/người</div>
                    <div className="mt-1 text-xl font-black text-slate-950">{money(salaryStats.avgSalary)}</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-4">
                    <div className="text-sm font-bold text-slate-500">TB lương/giờ</div>
                    <div className="mt-1 text-xl font-black text-slate-950">{money(salaryStats.avgHourly)}</div>
                  </div>
                </div>
                <div className="mt-5">
                  <BarList data={employeeStats.topWorkers} empty="Chưa có giờ công" />
                </div>
              </Section>
            </div>
          )}

          {show("schedules") && (
            <div className="grid gap-5 xl:grid-cols-3">
              <Section title="Lịch làm theo ca" subtitle="Tỷ trọng ca trong tháng.">
                <BarList data={scheduleStats.byShift} suffix=" ca" />
              </Section>
              <Section title="Lịch làm theo thứ" subtitle="Ngày nào đang được xếp nhiều nhất.">
                <BarList data={scheduleStats.byWeekday} suffix=" ca" />
              </Section>
              <Section title="Ngày cao điểm" subtitle="Các ngày có nhiều ca làm nhất.">
                <BarList data={scheduleStats.peakDays} suffix=" ca" />
              </Section>
            </div>
          )}

          {show("attendance") && (
            <>
              <div className="grid gap-5 xl:grid-cols-[1.25fr_0.9fr]">
                <Section title="Tần suất ra vào theo ngày" subtitle="Số lượt chấm vào trong tháng.">
                  <MiniTrend data={attendanceStats.byDay} />
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md bg-slate-50 p-3">
                      <div className="text-xs font-black uppercase text-slate-500">Đã vào ca</div>
                      <div className="mt-1 text-xl font-black text-slate-950">{fmt(attendanceStats.checkedIn)}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3">
                      <div className="text-xs font-black uppercase text-slate-500">Hoàn tất vào/ra</div>
                      <div className="mt-1 text-xl font-black text-slate-950">{fmt(attendanceStats.completed)}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3">
                      <div className="text-xs font-black uppercase text-slate-500">Tỷ lệ hoàn tất</div>
                      <div className="mt-1 text-xl font-black text-slate-950">{fmt(attendanceStats.completionRate)}%</div>
                    </div>
                  </div>
                </Section>
                <Section title="Khung giờ chấm vào" subtitle="Tần suất bắt đầu ca theo từng giờ.">
                  <BarList data={attendanceStats.byHour} suffix=" lượt" empty="Chưa có lượt chấm vào" />
                </Section>
              </div>
              <Section title="Lượt ra vào gần đây" subtitle="Các mốc chấm công mới nhất trong tháng.">
                <EventList events={latestEvents} />
              </Section>
            </>
          )}

          {activeView === "overview" && (
            <Section
              title="Tổng hợp nhanh"
              subtitle="Các lát cắt quan trọng nhất của kỳ đang xem."
              action={<Status tone={attendanceStats.missing > 0 ? "orange" : "green"}>{attendanceStats.missing} ca thiếu chấm</Status>}
            >
              <div className="grid gap-5 xl:grid-cols-[1fr_1fr_1fr]">
                <BarList data={scheduleStats.byShift.slice(0, 5)} suffix=" ca" />
                <BarList data={employeeStats.topWorkers.slice(0, 5)} empty="Chưa có giờ công" />
                <AttentionList rows={employeeStats.attention.slice(0, 3)} />
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
