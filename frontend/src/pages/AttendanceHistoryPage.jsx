import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Button,
  Card,
  Chip,
  Spinner,
  Typography,
} from "@material-tailwind/react";
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { getRole } from "../utils/auth";
import { API_URL } from "../services/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

const pageSize = 10;

function formatTime(value) {
  if (!value) return "-";
  return value.slice(11, 16);
}

function attendanceChip(record) {
  if (!record.check_in) {
    return { label: "Chưa chấm", color: "gray" };
  }

  if (record.attendance_status === "LATE") {
    return { label: "Đi trễ", color: "orange" };
  }

  return { label: "Đúng giờ", color: "green" };
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function AttendanceHistoryPage() {
  const role = getRole();
  const isAdmin = role === "ADMIN";
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ startDate: "", endDate: "" });
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchEmployees = async () => {
      try {
        const res = await axios.get(`${API_URL}/employees`, { headers: authHeaders() });
        setEmployees(res.data || []);
      } catch (err) {
        console.error("[AttendanceHistory] Load employees:", err);
      }
    };

    fetchEmployees();
  }, [isAdmin]);

  const selectedEmployeeLabel =
    selectedEmployee === "all"
      ? "Tất cả nhân viên"
      : employees.find((employee) => String(employee.employee_id) === selectedEmployee)?.name || "Nhân viên";
  const timeLabel =
    dateRange.startDate || dateRange.endDate
      ? `${dateRange.startDate || "Tất cả"} - ${dateRange.endDate || "Tất cả"}`
      : "Tất cả thời gian";
  const filteredEmployees = useMemo(() => {
    const keyword = normalize(employeeSearch);
    if (!keyword) return employees;
    return employees.filter((employee) =>
      [employee.name, employee.email, employee.phone, `NV-${employee.employee_id}`].some((value) =>
        normalize(value).includes(keyword),
      ),
    );
  }, [employeeSearch, employees]);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = {};

      if (dateRange.startDate && dateRange.endDate) {
        params.startDate = dateRange.startDate;
        params.endDate = dateRange.endDate;
      }

      if (isAdmin && selectedEmployee !== "all") {
        params.employee_id = selectedEmployee;
      }

      const res = await axios.get(`${API_URL}/attendance/history`, {
        params,
        headers: authHeaders(),
      });

      setRecords(res.data.records || []);
    } catch (err) {
      setError(err.response?.data?.message || "Không thể tải lịch sử chấm công");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange.endDate, dateRange.startDate, isAdmin, selectedEmployee]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const visibleRecords = useMemo(
    () =>
      [...records].sort((a, b) => {
        const dateCompare = String(b.work_date || "").localeCompare(String(a.work_date || ""));
        if (dateCompare !== 0) return dateCompare;
        return String(b.start_time || "").localeCompare(String(a.start_time || ""));
      }),
    [records],
  );

  const visibleStats = useMemo(
    () =>
      visibleRecords.reduce(
        (acc, record) => {
          acc.total += 1;
          if (!record.check_in) acc.missing += 1;
          else if (record.attendance_status === "LATE") acc.late += 1;
          else acc.on_time += 1;
          return acc;
        },
        { total: 0, on_time: 0, late: 0, missing: 0 },
      ),
    [visibleRecords],
  );
  const displayStats = visibleStats;
  const totalPages = Math.max(1, Math.ceil(visibleRecords.length / pageSize));
  const pagedRecords = visibleRecords.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [dateRange.endDate, dateRange.startDate, selectedEmployee]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Typography variant="h4" className="font-bold tracking-tight text-gray-950">
            Lịch sử chấm công
          </Typography>
          <Typography className="mt-1 text-sm text-gray-600">
            {dateRange.startDate && dateRange.endDate
              ? `${dateRange.startDate} đến ${dateRange.endDate}`
              : "Hiển thị toàn bộ dữ liệu, mới nhất trước"}
          </Typography>
        </div>
        <Button
          variant="outlined"
          size="sm"
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-2 rounded-md normal-case"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <Card className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,280px)_minmax(240px,320px)_1fr]">
          {isAdmin && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setEmployeePickerOpen((open) => !open)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 text-left text-sm font-medium text-gray-900 outline-none transition hover:border-blue-500 focus:border-blue-600"
              >
                <span className="min-w-0 flex-1 truncate">{selectedEmployeeLabel}</span>
                <UserGroupIcon className="h-5 w-5 shrink-0 text-gray-400" />
              </button>
              {employeePickerOpen && (
                <div className="absolute left-0 top-12 z-40 w-full rounded-md border border-gray-200 bg-white p-2 shadow-xl">
                  <div className="relative mb-2">
                    <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={employeeSearch}
                      onChange={(event) => setEmployeeSearch(event.target.value)}
                      placeholder="Tìm nhân viên..."
                      className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm font-medium text-gray-900 outline-none focus:border-blue-600"
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
                        selectedEmployee === "all" ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
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
                        <div className="truncate text-sm font-bold">{employee.name}</div>
                        <div className="truncate text-xs font-medium text-gray-500">
                          {employee.email || employee.phone || `NV-${employee.employee_id}`}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setTimePickerOpen((open) => !open)}
              className="flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 text-left text-sm font-medium text-gray-900 outline-none transition hover:border-blue-500 focus:border-blue-600"
            >
              <span className="flex min-w-0 items-center gap-2">
                <CalendarDaysIcon className="h-5 w-5 shrink-0 text-gray-400" />
                <span className="truncate">{timeLabel}</span>
              </span>
            </button>
            {timePickerOpen && (
              <div className="absolute left-0 top-12 z-30 w-full min-w-[280px] rounded-md border border-gray-200 bg-white p-3 shadow-xl sm:min-w-[420px]">
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    type="date"
                    value={dateRange.startDate}
                    max={dateRange.endDate || undefined}
                    onChange={(event) => {
                      const nextStartDate = event.target.value;
                      setDateRange((prev) => ({
                        ...prev,
                        startDate: nextStartDate,
                        endDate:
                          prev.endDate && nextStartDate && prev.endDate < nextStartDate
                            ? nextStartDate
                            : prev.endDate,
                      }));
                    }}
                    className="h-10 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-800 outline-none focus:border-blue-600"
                  />
                  <input
                    type="date"
                    value={dateRange.endDate}
                    min={dateRange.startDate || undefined}
                    onChange={(event) => setDateRange((prev) => ({ ...prev, endDate: event.target.value }))}
                    className="h-10 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-800 outline-none focus:border-blue-600"
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="text"
                    size="sm"
                    onClick={() => setDateRange({ startDate: "", endDate: "" })}
                    className="rounded-md normal-case text-gray-700"
                  >
                    Xóa lọc
                  </Button>
                  <Button size="sm" onClick={() => setTimePickerOpen(false)} className="rounded-md bg-gray-950 normal-case">
                    Xong
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center rounded-md bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600">
            {isAdmin ? selectedEmployeeLabel : "Dữ liệu của bạn"} · {timeLabel}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["Tổng ca", displayStats.total, "text-gray-950"],
          ["Đúng giờ", displayStats.on_time, "text-green-600"],
          ["Đi trễ", displayStats.late, "text-orange-600"],
          ["Chưa chấm", displayStats.missing, "text-gray-600"],
        ].map(([label, value, color]) => (
          <Card key={label} className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <Typography className="text-sm font-semibold text-gray-500">{label}</Typography>
            <Typography variant="h4" className={`mt-2 font-bold ${color}`}>
              {value}
            </Typography>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-8 w-8 text-blue-600" />
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="p-8 text-center text-sm font-medium text-gray-500">
            Không có dữ liệu chấm công trong khoảng thời gian này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-4">Ngày</th>
                  {isAdmin && <th className="px-5 py-4">Nhân viên</th>}
                  <th className="px-5 py-4">Ca làm</th>
                  <th className="px-5 py-4">Giờ ca</th>
                  <th className="px-5 py-4">Chấm vào</th>
                  <th className="px-5 py-4">Chấm ra</th>
                  <th className="px-5 py-4">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((record) => {
                  const chip = attendanceChip(record);
                  return (
                    <tr key={record.schedule_id} className="border-b border-gray-100 transition hover:bg-gray-50">
                      <td className="px-5 py-4 text-sm font-semibold text-gray-800">
                        {new Date(`${record.work_date}T00:00:00`).toLocaleDateString("vi-VN")}
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4">
                          <div className="text-sm font-bold text-gray-950">{record.employee_name}</div>
                          <div className="mt-1 text-xs font-medium text-gray-500">{record.email || "-"}</div>
                        </td>
                      )}
                      <td className="px-5 py-4 text-sm font-semibold text-gray-800">{record.shift_name}</td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-600">
                        {record.start_time?.slice(0, 5)} - {record.end_time?.slice(0, 5)}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-700">{formatTime(record.check_in)}</td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-700">{formatTime(record.check_out)}</td>
                      <td className="px-5 py-4">
                        <Chip value={chip.label} color={chip.color} size="sm" className="w-fit rounded-md" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && visibleRecords.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-gray-500">
              Trang {page}/{totalPages} · {visibleRecords.length} dòng
            </div>
            <div className="flex gap-2">
              <Button
                variant="outlined"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-md normal-case"
              >
                Trước
              </Button>
              <Button
                variant="outlined"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="rounded-md normal-case"
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
