import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Button,
  Card,
  Chip,
  Option,
  Select,
  Spinner,
  Typography,
} from "@material-tailwind/react";
import { getRole } from "../utils/auth";

const API_URL = "http://localhost:5000/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekRange(value) {
  const date = new Date(`${value}T00:00:00`);
  const day = date.getDay() || 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

function getRange(filterMode, filters) {
  if (filterMode === "day") {
    const day = filters.day || formatDate(new Date());
    return { startDate: day, endDate: day };
  }

  if (filterMode === "week") {
    return getWeekRange(filters.week || formatDate(new Date()));
  }

  if (filterMode === "month") {
    const selectedMonth = filters.month || formatDate(new Date()).slice(0, 7);
    const [year, month] = selectedMonth.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      startDate: `${year}-${String(month).padStart(2, "0")}-01`,
      endDate: `${year}-${String(month).padStart(2, "0")}-${lastDay}`,
    };
  }

  const year = Number(filters.year || new Date().getFullYear());
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

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

export default function AttendanceHistoryPage() {
  const role = getRole();
  const isAdmin = role === "ADMIN";
  const today = formatDate(new Date());
  const thisMonth = today.slice(0, 7);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [filterMode, setFilterMode] = useState("month");
  const [filters, setFilters] = useState({
    day: today,
    week: today,
    month: thisMonth,
    year: String(new Date().getFullYear()),
  });
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ total: 0, on_time: 0, late: 0, missing: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;

    const fetchEmployees = async () => {
      try {
        const res = await axios.get(`${API_URL}/employees`);
        setEmployees(res.data || []);
      } catch (err) {
        console.error("[AttendanceHistory] Load employees:", err);
      }
    };

    fetchEmployees();
  }, [isAdmin]);

  const range = useMemo(() => getRange(filterMode, filters), [filterMode, filters]);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = {
        startDate: range.startDate,
        endDate: range.endDate,
      };

      if (isAdmin && selectedEmployee !== "all") {
        params.employee_id = selectedEmployee;
      }

      const res = await axios.get(`${API_URL}/attendance/history`, {
        params,
        headers: authHeaders(),
      });

      setRecords(res.data.records || []);
      setStats(res.data.stats || { total: 0, on_time: 0, late: 0, missing: 0 });
    } catch (err) {
      setError(err.response?.data?.message || "Không thể tải lịch sử chấm công");
      setRecords([]);
      setStats({ total: 0, on_time: 0, late: 0, missing: 0 });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, range.endDate, range.startDate, selectedEmployee]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <Typography variant="h4" className="font-bold text-gray-900">
            Lịch sử chấm công
          </Typography>
          <Typography className="text-sm text-gray-600">
            {range.startDate} đến {range.endDate}
          </Typography>
        </div>
        <Button variant="outlined" size="sm" onClick={fetchHistory} disabled={loading}>
          Làm mới
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className="p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {isAdmin && (
            <div>
              <Select
                label="Nhân viên"
                value={selectedEmployee}
                onChange={(value) => setSelectedEmployee(value || "all")}
              >
                <Option value="all">Tất cả nhân viên</Option>
                {employees.map((employee) => (
                  <Option key={employee.employee_id} value={String(employee.employee_id)}>
                    {employee.name}
                  </Option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Select
              label="Kiểu thời gian"
              value={filterMode}
              onChange={(value) => setFilterMode(value || "month")}
            >
              <Option value="day">Theo ngày</Option>
              <Option value="week">Theo tuần</Option>
              <Option value="month">Theo tháng</Option>
              <Option value="year">Theo năm</Option>
            </Select>
          </div>

          {filterMode === "day" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Ngày
              </label>
              <input
                type="date"
                value={filters.day}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, day: event.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          )}

          {filterMode === "week" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Tuần chứa ngày
              </label>
              <input
                type="date"
                value={filters.week}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, week: event.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          )}

          {filterMode === "month" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Tháng
              </label>
              <input
                type="month"
                value={filters.month}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, month: event.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          )}

          {filterMode === "year" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Năm
              </label>
              <input
                type="number"
                min="2020"
                max="2100"
                value={filters.year}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, year: event.target.value }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4 shadow-sm">
          <Typography className="text-sm text-gray-600">Tổng ca</Typography>
          <Typography variant="h4" className="font-bold text-gray-900">
            {stats.total}
          </Typography>
        </Card>
        <Card className="p-4 shadow-sm">
          <Typography className="text-sm text-gray-600">Đúng giờ</Typography>
          <Typography variant="h4" className="font-bold text-green-600">
            {stats.on_time}
          </Typography>
        </Card>
        <Card className="p-4 shadow-sm">
          <Typography className="text-sm text-gray-600">Đi trễ</Typography>
          <Typography variant="h4" className="font-bold text-orange-600">
            {stats.late}
          </Typography>
        </Card>
        <Card className="p-4 shadow-sm">
          <Typography className="text-sm text-gray-600">Chưa chấm</Typography>
          <Typography variant="h4" className="font-bold text-gray-600">
            {stats.missing}
          </Typography>
        </Card>
      </div>

      <Card className="overflow-hidden bg-white shadow-sm">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-8 w-8" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Không có dữ liệu chấm công trong khoảng thời gian này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="p-4 text-sm font-semibold">Ngày</th>
                  {isAdmin && <th className="p-4 text-sm font-semibold">Nhân viên</th>}
                  <th className="p-4 text-sm font-semibold">Ca làm</th>
                  <th className="p-4 text-sm font-semibold">Giờ ca</th>
                  <th className="p-4 text-sm font-semibold">Chấm vào</th>
                  <th className="p-4 text-sm font-semibold">Chấm ra</th>
                  <th className="p-4 text-sm font-semibold">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const chip = attendanceChip(record);

                  return (
                    <tr key={record.schedule_id} className="border-b hover:bg-gray-50">
                      <td className="p-4 text-gray-800">
                        {new Date(`${record.work_date}T00:00:00`).toLocaleDateString(
                          "vi-VN",
                        )}
                      </td>
                      {isAdmin && (
                        <td className="p-4">
                          <div className="font-semibold text-gray-900">
                            {record.employee_name}
                          </div>
                          <div className="text-xs text-gray-500">{record.email || "-"}</div>
                        </td>
                      )}
                      <td className="p-4 text-gray-800">{record.shift_name}</td>
                      <td className="p-4 text-gray-700">
                        {record.start_time?.slice(0, 5)} - {record.end_time?.slice(0, 5)}
                      </td>
                      <td className="p-4 text-gray-700">{formatTime(record.check_in)}</td>
                      <td className="p-4 text-gray-700">{formatTime(record.check_out)}</td>
                      <td className="p-4">
                        <Chip
                          value={chip.label}
                          color={chip.color}
                          size="sm"
                          className="w-fit"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
