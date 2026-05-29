import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  TrophyIcon,
  UserGroupIcon,
  UserMinusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Card,
  Checkbox,
  Option,
  Select,
  Spinner,
  Typography,
} from "@material-tailwind/react";
import { API_URL } from "../services/api";

const today = new Date();
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const defaultCards = [
  "totalEmployees",
  "activeEmployees",
  "totalShifts",
  "totalHours",
];
const rolePalette = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#0891b2",
  "#db2777",
];
const toneClasses = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  indigo: "bg-indigo-50 text-indigo-700",
  cyan: "bg-cyan-50 text-cyan-700",
  orange: "bg-orange-50 text-orange-700",
  rose: "bg-rose-50 text-rose-700",
  slate: "bg-slate-100 text-slate-700",
  emerald: "bg-emerald-50 text-emerald-700",
};

const dashboardRequests = [
  { key: "stats", label: "thống kê lịch" },
  { key: "employees", label: "nhân viên" },
  { key: "today", label: "chấm công hôm nay" },
  { key: "attendance", label: "lịch sử chấm công" },
];

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthRange(value) {
  const [year, month] = value.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isActiveEmployee(employee) {
  const status = normalizeText(employee.status);
  return !status || status.includes("dang") || status.includes("active");
}

function hasAttendanceTime(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !text.startsWith("0000-00-00");
}

function isWorkingAttendance(record) {
  if (hasAttendanceTime(record.check_out)) return false;
  if (record.progress_status === "CHECKED_IN") return true;
  if (record.attendance_status === "LATE") return true;
  if (record.attendance_bucket === "LATE") return true;

  return (
    hasAttendanceTime(record.check_in) &&
    record.progress_status !== "COMPLETED"
  );
}

function numberValue(value) {
  return Number(value || 0);
}

function formatNumber(value, maximumFractionDigits = 0) {
  return Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits });
}

function isUpcomingAttendance(record) {
  return (
    !record.check_in &&
    (record.attendance_bucket === "UPCOMING" ||
      record.progress_status === "UPCOMING")
  );
}

function isMissingAttendance(record) {
  return !record.check_in && !isUpcomingAttendance(record);
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
    "vi-VN",
  );
}

function getEmployeeBirthday(employee) {
  return (
    employee.birth_date ||
    employee.date_of_birth ||
    employee.birthday ||
    employee.dob
  );
}

function getUpcomingBirthdays(employees) {
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return employees
    .map((employee) => {
      const birthday = getEmployeeBirthday(employee);
      if (!birthday) return null;

      const date = new Date(birthday);
      if (Number.isNaN(date.getTime())) return null;

      let nextBirthday = new Date(
        start.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );
      if (nextBirthday < start) {
        nextBirthday = new Date(
          start.getFullYear() + 1,
          date.getMonth(),
          date.getDate(),
        );
      }

      const daysLeft = Math.ceil((nextBirthday - start) / 86400000);
      return { ...employee, birthday, nextBirthday, daysLeft };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);
}

function getEmployeeName(record, employeesById) {
  return (
    record.employee_name ||
    employeesById.get(Number(record.employee_id))?.name ||
    "Không rõ"
  );
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildEmptyTrend(dateMode, dateParams) {
  if (dateMode === "month" || dateMode === "custom") {
    const start = new Date(`${dateParams.startDate}T00:00:00`);
    const end = new Date(`${dateParams.endDate}T00:00:00`);

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
      const step = Math.max(1, Math.ceil(days / 8));
      const buckets = [];

      for (let index = 0; index < days && buckets.length < 8; index += step) {
        const date = addDays(start, index);
        buckets.push({
          label: toDateInput(date).slice(5),
          shifts: 0,
          completed: 0,
          late: 0,
          leave: 0,
          missing: 0,
        });
      }

      return buckets;
    }
  }

  return [
    {
      label: "Không có ca",
      shifts: 0,
      completed: 0,
      late: 0,
      leave: 0,
      missing: 0,
    },
  ];
}

function buildTrend(
  records,
  stats,
  selectedEmployee,
  employeesById,
  dateMode,
  dateParams,
) {
  if (records.length > 0 && (dateMode === "month" || dateMode === "custom")) {
    const grouped = new Map();

    records.forEach((record) => {
      const key = String(record.work_date || "").slice(0, 10) || "Chưa rõ";
      const current = grouped.get(key) || {
        label: key.slice(5),
        shifts: 0,
        completed: 0,
        late: 0,
        leave: 0,
        missing: 0,
      };
      current.shifts += 1;

      if (record.check_in) current.completed += 1;
      if (isMissingAttendance(record)) current.missing += 1;
      if (record.attendance_status === "LATE") current.late += 1;

      grouped.set(key, current);
    });

    return [...grouped.entries()]
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([, value]) => value)
      .slice(-8);
  }

  if (records.length > 0) {
    const grouped = new Map();

    records.forEach((record) => {
      const key = String(record.work_date || "").slice(0, 7) || "Chưa rõ";
      const current = grouped.get(key) || {
        label: key,
        shifts: 0,
        completed: 0,
        late: 0,
        leave: 0,
        missing: 0,
      };
      current.shifts += 1;

      if (record.check_in) current.completed += 1;
      if (isMissingAttendance(record)) current.missing += 1;
      if (record.attendance_status === "LATE") current.late += 1;

      grouped.set(key, current);
    });

    return [...grouped.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-8);
  }

  if (stats.length === 0 && (dateMode === "month" || dateMode === "custom")) {
    return buildEmptyTrend(dateMode, dateParams);
  }

  if (stats.length === 0) {
    return [
      {
        label: "Không có ca",
        shifts: 0,
        completed: 0,
        late: 0,
        leave: 0,
        missing: 0,
      },
    ];
  }

  if (selectedEmployee !== "all") {
    const employee = stats.find(
      (item) => String(item.employee_id) === selectedEmployee,
    );
    if (!employee) {
      return [
        {
          label: "Không có ca",
          shifts: 0,
          completed: 0,
          late: 0,
          leave: 0,
          missing: 0,
        },
      ];
    }
    return [
      {
        label: "Theo lọc",
        shifts: numberValue(employee.total_shifts),
        completed: numberValue(employee.total_shifts),
        late: 0,
        leave: 0,
        missing: 0,
      },
    ];
  }

  return stats.slice(0, 8).map((employee) => ({
    label: getEmployeeName(employee, employeesById),
    shifts: numberValue(employee.total_shifts),
    completed: numberValue(employee.total_shifts),
    late: 0,
    leave: 0,
    missing: 0,
  }));
}

function LineChart({ data }) {
  const width = 720;
  const height = 260;
  const padding = { top: 24, right: 28, bottom: 46, left: 42 };
  const maxValue = Math.max(
    1,
    ...data.flatMap((item) => [
      item.shifts,
      item.completed,
      item.late,
      item.leave,
      item.missing,
    ]),
  );
  const xStep =
    data.length > 1
      ? (width - padding.left - padding.right) / (data.length - 1)
      : 0;
  const y = (value) =>
    height -
    padding.bottom -
    (value / maxValue) * (height - padding.top - padding.bottom);
  const x = (index) => padding.left + index * xStep;
  const path = (key) =>
    data
      .map(
        (item, index) =>
          `${index === 0 ? "M" : "L"} ${x(index)} ${y(item[key])}`,
      )
      .join(" ");

  if (data.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 px-2 text-center text-[11px] font-medium text-gray-500 sm:h-64 sm:text-sm">
        Chưa có dữ liệu để vẽ biểu đồ
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[120px] min-w-[340px] w-full sm:h-[260px] sm:min-w-[620px]"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const value = maxValue * tick;
          const lineY = y(value);
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={lineY}
                y2={lineY}
                stroke="#e5e7eb"
              />
              <text
                x={padding.left - 12}
                y={lineY + 4}
                textAnchor="end"
                className="fill-gray-400 text-[11px]"
              >
                {Math.round(value)}
              </text>
            </g>
          );
        })}
        <path
          d={`${path("shifts")} L ${x(data.length - 1)} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`}
          fill="url(#chartFill)"
        />
        <path
          d={path("shifts")}
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path("completed")}
          fill="none"
          stroke="#16a34a"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path("late")}
          fill="none"
          stroke="#f97316"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path("leave")}
          fill="none"
          stroke="#dc2626"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path("missing")}
          fill="none"
          stroke="#111827"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((item, index) => (
          <g key={`${item.label}-${index}`}>
            <circle cx={x(index)} cy={y(item.shifts)} r="4" fill="#2563eb" />
            <circle
              cx={x(index)}
              cy={y(item.completed)}
              r="3.5"
              fill="#16a34a"
            />
            <circle cx={x(index)} cy={y(item.late)} r="3.5" fill="#f97316" />
            <circle cx={x(index)} cy={y(item.leave)} r="3.5" fill="#dc2626" />
            <circle cx={x(index)} cy={y(item.missing)} r="3.5" fill="#111827" />
            <text
              x={x(index)}
              y={height - 18}
              textAnchor="middle"
              className="fill-gray-500 text-[11px]"
            >
              {item.label.length > 10
                ? `${item.label.slice(0, 10)}...`
                : item.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DonutChart({ data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-sm font-medium text-gray-500">
        Chưa có dữ liệu vai trò
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
      <svg viewBox="0 0 120 120" className="mx-auto h-44 w-44 -rotate-90">
        <circle
          cx="60"
          cy="60"
          r="42"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="18"
        />
        {data.map((item, index) => {
          const dash = (item.value / total) * 263.89;
          const segmentOffset =
            25 +
            data
              .slice(0, index)
              .reduce(
                (sum, previous) => sum + (previous.value / total) * 263.89,
                0,
              );

          return (
            <circle
              key={item.name}
              cx="60"
              cy="60"
              r="42"
              fill="none"
              stroke={item.color}
              strokeWidth="18"
              strokeDasharray={`${dash} ${263.89 - dash}`}
              strokeDashoffset={-segmentOffset}
              strokeLinecap="round"
            />
          );
        })}
        <text
          x="60"
          y="57"
          textAnchor="middle"
          className="rotate-90 origin-center fill-gray-900 text-[18px] font-bold"
        >
          {total}
        </text>
        <text
          x="60"
          y="75"
          textAnchor="middle"
          className="rotate-90 origin-center fill-gray-500 text-[8px]"
        >
          vai trò
        </text>
      </svg>
      <div className="space-y-3">
        {data.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-sm font-medium text-gray-700">
                {item.name}
              </span>
            </div>
            <span className="text-sm font-bold text-gray-900">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [roleAssignments, setRoleAssignments] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [dateMode, setDateMode] = useState("all");
  const [month, setMonth] = useState(currentMonth);
  const [customRange, setCustomRange] = useState({
    startDate: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: toDateInput(today),
  });
  const [selectedCards, setSelectedCards] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dashboardCards")) || defaultCards;
    } catch {
      return defaultCards;
    }
  });
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [draftCards, setDraftCards] = useState(selectedCards);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const dateParams = useMemo(() => {
    if (dateMode === "month") return monthRange(month);
    if (dateMode === "custom") return customRange;
    return {};
  }, [customRange, dateMode, month]);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const headers = authHeaders();
      const statsParams = { ...dateParams };
      const attendanceParams = { ...dateParams };

      if (selectedEmployee !== "all") {
        attendanceParams.employee_id = selectedEmployee;
      }

      const results = await Promise.allSettled([
        axios.get(`${API_URL}/schedules/stats`, {
          params: statsParams,
          headers,
        }),
        axios.get(`${API_URL}/employees`, { headers }),
        axios.get(`${API_URL}/attendance/today`, { headers }),
        axios.get(`${API_URL}/attendance/history`, {
          params: attendanceParams,
          headers,
        }),
      ]);

      const failedRequests = results
        .map((result, index) =>
          result.status === "rejected"
            ? {
                ...dashboardRequests[index],
                message:
                  result.reason?.response?.data?.message ||
                  result.reason?.response?.data?.error ||
                  result.reason?.message,
              }
            : null,
        )
        .filter(Boolean);

      if (failedRequests.length) {
        setError(
          `Không thể tải ${failedRequests
            .map((item) => item.label)
            .join(", ")}${
            failedRequests[0].message ? `: ${failedRequests[0].message}` : ""
          }`,
        );
      }

      const [statsRes, employeesRes, todayRes, attendanceRes] = results.map(
        (result) => (result.status === "fulfilled" ? result.value : null),
      );

      const employeeList = employeesRes?.data || [];
      setStats(statsRes?.data?.stats || []);
      setEmployees(employeeList);
      setTodayAttendance(todayRes?.data || []);
      setAttendanceRecords(attendanceRes?.data?.records || []);

      const roleResults = await Promise.allSettled(
        employeeList.map((employee) =>
          axios.get(`${API_URL}/roles/employee/${employee.employee_id}`, {
            headers,
          }),
        ),
      );

      setRoleAssignments(
        roleResults.flatMap((result, index) =>
          result.status === "fulfilled"
            ? (result.value.data || []).map((role) => ({
                ...role,
                employee_id: employeeList[index].employee_id,
              }))
            : [],
        ),
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể tải dữ liệu tổng quan",
      );
      setStats([]);
      setAttendanceRecords([]);
    } finally {
      setLoading(false);
    }
  }, [dateParams, selectedEmployee]);

  const fetchTodayAttendance = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/attendance/today`, {
        headers: authHeaders(),
      });
      setTodayAttendance(res.data || []);
    } catch (err) {
      console.error("[Dashboard] today attendance:", err);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const intervalId = window.setInterval(fetchTodayAttendance, 30000);
    window.addEventListener("notification-count-changed", fetchTodayAttendance);
    window.addEventListener("attendance-changed", fetchTodayAttendance);
    window.addEventListener("focus", fetchTodayAttendance);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(
        "notification-count-changed",
        fetchTodayAttendance,
      );
      window.removeEventListener("attendance-changed", fetchTodayAttendance);
      window.removeEventListener("focus", fetchTodayAttendance);
    };
  }, [fetchTodayAttendance]);

  const employeesById = useMemo(
    () =>
      new Map(
        employees.map((employee) => [Number(employee.employee_id), employee]),
      ),
    [employees],
  );

  const visibleStats = useMemo(() => {
    if (selectedEmployee === "all") return stats;
    return stats.filter(
      (employee) => String(employee.employee_id) === selectedEmployee,
    );
  }, [selectedEmployee, stats]);

  const totals = useMemo(() => {
    const totalShifts = visibleStats.reduce(
      (sum, item) => sum + numberValue(item.total_shifts),
      0,
    );
    const totalHours = visibleStats.reduce(
      (sum, item) => sum + numberValue(item.total_hours),
      0,
    );
    const lateCount = attendanceRecords.filter(
      (record) => record.attendance_status === "LATE",
    ).length;
    const missingCount = attendanceRecords.filter(isMissingAttendance).length;
    const upcomingCount = attendanceRecords.filter(isUpcomingAttendance).length;
    const completedCount = attendanceRecords.filter(
      (record) => record.check_in,
    ).length;
    const todayLate = todayAttendance.filter(
      (record) => record.attendance_status === "LATE",
    ).length;
    const todayMissing = todayAttendance.filter(isMissingAttendance).length;
    const todayUpcoming = todayAttendance.filter(isUpcomingAttendance).length;
    const activeEmployees = employees.filter(isActiveEmployee).length;
    const workingEmployeeIds = new Set(
      todayAttendance
        .filter(isWorkingAttendance)
        .map((record) => Number(record.employee_id))
        .filter(Boolean),
    );
    const workingShifts = todayAttendance.filter(isWorkingAttendance).length;

    return {
      totalEmployees: employees.length,
      activeEmployees,
      workingEmployees: workingEmployeeIds.size,
      workingShifts,
      totalShifts,
      totalHours,
      lateCount,
      missingCount,
      upcomingCount,
      completedCount,
      todayLate,
      todayMissing,
      todayUpcoming,
      leaveToday: 0,
      avgShifts: visibleStats.length ? totalShifts / visibleStats.length : 0,
      onTimeRate: attendanceRecords.length
        ? ((attendanceRecords.length -
            lateCount -
            missingCount -
            upcomingCount) /
            attendanceRecords.length) *
          100
        : 0,
    };
  }, [attendanceRecords, employees, todayAttendance, visibleStats]);

  const metricCards = useMemo(
    () => ({
      totalEmployees: {
        label: "Tổng nhân viên",
        value: formatNumber(totals.totalEmployees),
        detail: `${formatNumber(totals.workingEmployees)} đang trong ca`,
        icon: UserGroupIcon,
        tone: "blue",
      },
      activeEmployees: {
        label: "Nhân viên đang làm việc",
        value: formatNumber(totals.workingEmployees),
        detail: `${formatNumber(totals.workingShifts)} ca đang mở`,
        icon: CheckCircleIcon,
        tone: "green",
      },
      totalShifts: {
        label: "Tổng ca làm",
        value: formatNumber(totals.totalShifts),
        detail: dateMode === "all" ? "Tất cả thời gian" : "Theo bộ lọc",
        icon: CalendarDaysIcon,
        tone: "indigo",
      },
      totalHours: {
        label: "Tổng giờ làm",
        value: `${formatNumber(totals.totalHours, 1)}h`,
        detail: `${formatNumber(totals.avgShifts, 1)} ca/người`,
        icon: ClockIcon,
        tone: "cyan",
      },
      todayLate: {
        label: "Nhân viên đi trễ hôm nay",
        value: formatNumber(totals.todayLate),
        detail: `${formatNumber(todayAttendance.length)} ca hôm nay`,
        icon: ChartBarIcon,
        tone: "orange",
      },
      leaveToday: {
        label: "Nhân viên xin nghỉ hôm nay",
        value: formatNumber(totals.leaveToday),
        detail: "Chờ dữ liệu nghỉ phép",
        icon: UserMinusIcon,
        tone: "rose",
      },
      todayMissing: {
        label: "Nhân viên chưa chấm công",
        value: formatNumber(totals.todayMissing),
        detail: `${formatNumber(totals.todayUpcoming)} ca chưa làm`,
        icon: BriefcaseIcon,
        tone: "slate",
      },
      onTimeRate: {
        label: "Tỷ lệ đúng giờ",
        value: `${formatNumber(totals.onTimeRate, 1)}%`,
        detail: "Theo bộ lọc năng suất",
        icon: TrophyIcon,
        tone: "emerald",
      },
    }),
    [dateMode, todayAttendance.length, totals],
  );

  const trendData = useMemo(
    () =>
      buildTrend(
        attendanceRecords,
        visibleStats,
        selectedEmployee,
        employeesById,
        dateMode,
        dateParams,
      ),
    [
      attendanceRecords,
      dateMode,
      dateParams,
      employeesById,
      selectedEmployee,
      visibleStats,
    ],
  );

  const ranking = useMemo(() => {
    const attendanceByEmployee = attendanceRecords.reduce((map, record) => {
      const key = Number(record.employee_id);
      const current = map.get(key) || { late: 0, missing: 0 };
      if (record.attendance_status === "LATE") current.late += 1;
      if (isMissingAttendance(record)) current.missing += 1;
      map.set(key, current);
      return map;
    }, new Map());

    return stats
      .map((employee) => {
        const attendance = attendanceByEmployee.get(
          Number(employee.employee_id),
        ) || { late: 0, missing: 0 };
        const score =
          numberValue(employee.total_shifts) * 4 +
          numberValue(employee.total_hours) -
          attendance.late * 8 -
          attendance.missing * 5;
        return {
          ...employee,
          late: attendance.late,
          missing: attendance.missing,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [attendanceRecords, stats]);

  const roleData = useMemo(() => {
    const map = new Map();

    roleAssignments.forEach((role) => {
      const current = map.get(role.role_name) || {
        name: role.role_name,
        value: 0,
        color: role.color || rolePalette[map.size % rolePalette.length],
      };
      current.value += 1;
      map.set(role.role_name, current);
    });

    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [roleAssignments]);

  const birthdays = useMemo(() => getUpcomingBirthdays(employees), [employees]);
  const selectedEmployeeLabel =
    selectedEmployee === "all"
      ? "Toàn bộ nhân viên"
      : employeesById.get(Number(selectedEmployee))?.name || "Nhân viên";

  const filteredEmployees = useMemo(() => {
    const keyword = normalizeText(employeeSearch);
    if (!keyword) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.phone,
        `NV-${employee.employee_id}`,
      ].some((value) => normalizeText(value).includes(keyword)),
    );
  }, [employeeSearch, employees]);

  const saveCards = () => {
    const nextCards = draftCards.slice(0, 4);
    setSelectedCards(nextCards);
    localStorage.setItem("dashboardCards", JSON.stringify(nextCards));
    setCardModalOpen(false);
  };

  const toggleDraftCard = (key) => {
    setDraftCards((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= 4) return current;
      return [...current, key];
    });
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Typography
            variant="h4"
            className="font-bold tracking-tight text-gray-950"
          >
            Tổng quan vận hành
          </Typography>
          <Typography className="mt-1 text-sm text-gray-600">
            Theo dõi nhân sự, năng suất ca làm và phân bổ vai trò trong một màn
            hình.
          </Typography>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outlined"
            size="sm"
            onClick={() => {
              setDraftCards(selectedCards);
              setCardModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-md border-gray-300 normal-case text-gray-800"
          >
            <AdjustmentsHorizontalIcon className="h-4 w-4" />
            Chọn thẻ
          </Button>
          <Button
            size="sm"
            onClick={fetchDashboard}
            disabled={loading}
            aria-label="Làm mới"
            title="Làm mới"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white p-0 text-gray-950 shadow-sm transition hover:border-gray-400 hover:bg-gray-50"
          >
            <ArrowPathIcon
              className={`h-5 w-5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {selectedCards.slice(0, 4).map((key) => {
          const card = metricCards[key];
          const Icon = card.icon;
          return (
            <Card
              key={key}
              className="overflow-hidden rounded-md border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Typography className="truncate text-sm font-semibold text-gray-500">
                    {card.label}
                  </Typography>
                  <div className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
                    {card.value}
                  </div>
                  <Typography className="mt-2 text-xs font-medium text-gray-500">
                    {card.detail}
                  </Typography>
                </div>
                <div className={`rounded-md p-3 ${toneClasses[card.tone]}`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-1.5 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-md border border-gray-200 bg-white p-2 shadow-sm sm:p-5">
          <div>
            <Typography
              variant="h6"
              className="text-sm font-bold text-gray-950 sm:text-lg"
            >
              Năng suất nhân viên
            </Typography>
          </div>

          <div className="mt-1.5 grid gap-1 sm:mt-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-[190px_150px_190px_190px] lg:gap-x-7">
            <div className="relative">
              <button
                type="button"
                onClick={() => setEmployeePickerOpen((open) => !open)}
                className="flex h-7 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2 text-left text-[11px] font-medium text-gray-900 outline-none transition hover:border-blue-500 focus:border-blue-600 sm:h-10 sm:px-3 sm:text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {selectedEmployeeLabel}
                </span>
                <UserGroupIcon className="h-3.5 w-3.5 shrink-0 text-gray-400 sm:h-5 sm:w-5" />
              </button>
              {employeePickerOpen && (
                <div className="absolute left-0 top-12 z-40 w-full rounded-md border border-gray-200 bg-white p-2 shadow-xl">
                  <div className="relative mb-2">
                    <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={employeeSearch}
                      onChange={(event) =>
                        setEmployeeSearch(event.target.value)
                      }
                      placeholder="Tìm nhân viên..."
                      className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm font-medium text-gray-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmployee("all");
                        setEmployeePickerOpen(false);
                        setEmployeeSearch("");
                      }}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm font-bold transition ${
                        selectedEmployee === "all"
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      Tất cả nhân viên
                    </button>
                    {filteredEmployees.map((employee) => (
                      <button
                        key={employee.employee_id}
                        type="button"
                        onClick={() => {
                          setSelectedEmployee(String(employee.employee_id));
                          setEmployeePickerOpen(false);
                          setEmployeeSearch("");
                        }}
                        className={`w-full rounded-md px-3 py-2 text-left transition ${
                          String(employee.employee_id) === selectedEmployee
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <div className="truncate text-sm font-bold">
                          {employee.name}
                        </div>
                        <div className="truncate text-xs font-medium text-gray-500">
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
            <Select
              label="Thời gian"
              value={dateMode}
              onChange={(value) => setDateMode(value || "all")}
            >
              <Option value="all">Tất cả</Option>
              <Option value="month">Theo tháng</Option>
              <Option value="custom">Tùy chỉnh</Option>
            </Select>
            {dateMode === "month" && (
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="h-7 rounded-md border border-gray-300 px-2 text-[11px] font-medium text-gray-800 outline-none focus:border-blue-600 sm:h-10 sm:px-3 sm:text-sm lg:ml-8"
              />
            )}
            {dateMode === "custom" && (
              <>
                <input
                  type="date"
                  value={customRange.startDate}
                  onChange={(event) =>
                    setCustomRange((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                  className="h-7 rounded-md border border-gray-300 px-2 text-[11px] font-medium text-gray-800 outline-none focus:border-blue-600 sm:h-10 sm:px-3 sm:text-sm lg:ml-8"
                />
                <input
                  type="date"
                  value={customRange.endDate}
                  onChange={(event) =>
                    setCustomRange((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }))
                  }
                  className="h-7 rounded-md border border-gray-300 px-2 text-[11px] font-medium text-gray-800 outline-none focus:border-blue-600 sm:h-10 sm:px-3 sm:text-sm"
                />
              </>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1 text-[9px] font-semibold text-gray-600 sm:mt-4 sm:gap-2 sm:text-xs">
            <span className="rounded-md bg-gray-100 px-1 py-0.5 sm:px-3 sm:py-2">
              {selectedEmployeeLabel}
            </span>
            <span className="rounded-md bg-blue-50 px-1 py-0.5 text-blue-700 sm:px-3 sm:py-2">
              Tổng số ca: {formatNumber(totals.totalShifts)}
            </span>
            <span className="rounded-md bg-orange-50 px-1 py-0.5 text-orange-700 sm:px-3 sm:py-2">
              Số lần trễ: {formatNumber(totals.lateCount)}
            </span>
            <span className="rounded-md bg-red-50 px-1 py-0.5 text-red-700 ring-1 ring-inset ring-red-100 sm:px-3 sm:py-2">
              Nghỉ phép: {formatNumber(totals.leaveToday)}
            </span>
            <span className="rounded-md bg-green-50 px-1 py-0.5 text-green-700 sm:px-3 sm:py-2">
              Ca đã làm: {formatNumber(totals.completedCount)}
            </span>
            <span className="rounded-md bg-black px-1 py-0.5 text-white sm:px-3 sm:py-2">
              Chưa chấm công: {formatNumber(totals.missingCount)}
            </span>
            <span className="rounded-md bg-blue-50 px-1 py-0.5 text-blue-700 sm:px-3 sm:py-2">
              Chưa làm: {formatNumber(totals.upcomingCount)}
            </span>
          </div>

          <div className="mt-1.5 sm:mt-5">
            {loading ? (
              <div className="flex h-28 items-center justify-center sm:h-64">
                <Spinner className="h-6 w-6 text-blue-600 sm:h-8 sm:w-8" />
              </div>
            ) : (
              <LineChart data={trendData} />
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[9px] font-semibold text-gray-500 sm:mt-3 sm:gap-4 sm:text-xs">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
              Tổng ca
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-600" />
              Ca đã làm
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
              Đi trễ
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
              Nghỉ phép
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-black" />
              Chưa chấm công
            </span>
          </div>
        </Card>

        <Card className="rounded-md border border-gray-200 bg-white p-2 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <Typography
                variant="h6"
                className="text-xs font-bold text-gray-950 sm:text-lg"
              >
                Ranking siêng năng
              </Typography>
              <Typography className="text-[10px] text-gray-500 sm:text-sm">
                Nhiều ca, nhiều giờ, ít trễ.
              </Typography>
            </div>
            <TrophyIcon className="h-3.5 w-3.5 text-amber-500 sm:h-6 sm:w-6" />
          </div>
          <div className="mt-1.5 space-y-1 sm:mt-5 sm:space-y-3">
            {ranking.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-medium text-gray-500">
                Chưa có dữ liệu xếp hạng
              </div>
            ) : (
              ranking.map((employee, index) => (
                <div
                  key={employee.employee_id}
                  className="flex items-center gap-1 rounded-md border border-gray-100 bg-gray-50 px-1.5 py-1 sm:gap-3 sm:px-3 sm:py-3"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white text-[10px] font-bold text-gray-900 shadow-sm sm:h-9 sm:w-9 sm:text-sm">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10px] font-bold text-gray-950 sm:text-sm">
                      {employee.name}
                    </div>
                    <div className="truncate text-[9px] font-medium text-gray-500 sm:mt-1 sm:text-xs">
                      {formatNumber(employee.total_shifts)} ca ·{" "}
                      {formatNumber(employee.total_hours, 1)}h ·{" "}
                      {formatNumber(employee.late)} trễ ·{" "}
                      {formatNumber(employee.missing)} chưa chấm
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="rounded-md border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <Typography variant="h6" className="font-bold text-gray-950">
                Sinh nhật sắp tới
              </Typography>
              <Typography className="text-sm text-gray-500">
                Ưu tiên các ngày gần nhất.
              </Typography>
            </div>
            <CalendarDaysIcon className="h-6 w-6 text-blue-600" />
          </div>
          <div className="mt-5 space-y-3">
            {birthdays.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-medium text-gray-500">
                Chưa có dữ liệu sinh nhật trong hồ sơ nhân viên
              </div>
            ) : (
              birthdays.map((employee) => (
                <div
                  key={employee.employee_id}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-100 px-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-gray-950">
                      {employee.name}
                    </div>
                    <div className="mt-1 text-xs font-medium text-gray-500">
                      {formatDate(employee.birthday)}
                    </div>
                  </div>
                  <span className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                    {employee.daysLeft === 0
                      ? "Hôm nay"
                      : `${employee.daysLeft} ngày`}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="rounded-md border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-5">
            <Typography variant="h6" className="font-bold text-gray-950">
              Phân bổ vai trò nhân viên
            </Typography>
            <Typography className="text-sm text-gray-500">
              Tổng số vai trò đang được gán cho tất cả nhân viên.
            </Typography>
          </div>
          <DonutChart data={roleData} />
        </Card>
      </div>

      {cardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <Card className="max-h-[90vh] w-full overflow-y-auto rounded-t-md border border-gray-200 bg-white p-5 shadow-xl sm:max-w-2xl sm:rounded-md">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Typography variant="h5" className="font-bold text-gray-950">
                  Chọn 4 thẻ thông tin
                </Typography>
                <Typography className="mt-1 text-sm text-gray-500">
                  Đã chọn {draftCards.length}/4 thẻ hiển thị trên dashboard.
                </Typography>
              </div>
              <button
                type="button"
                onClick={() => setCardModalOpen(false)}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Đóng"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Object.entries(metricCards).map(([key, card]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDraftCard(key)}
                  className={`rounded-md border p-3 text-left transition ${
                    draftCards.includes(key)
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={draftCards.includes(key)}
                      readOnly
                      className="h-4 w-4 rounded border-gray-300"
                      containerProps={{ className: "p-0" }}
                    />
                    <span className="text-sm font-bold text-gray-900">
                      {card.label}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-medium text-gray-500">
                    {card.detail}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="text"
                onClick={() => setCardModalOpen(false)}
                className="rounded-md normal-case text-gray-700"
              >
                Hủy
              </Button>
              <Button
                onClick={saveCards}
                disabled={draftCards.length !== 4}
                className="rounded-md bg-green-500 normal-case text-white hover:bg-green-600"
              >
                Lưu thay đổi
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
