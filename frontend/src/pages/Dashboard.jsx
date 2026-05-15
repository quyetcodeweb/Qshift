import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Button,
  Typography,
  Select,
  Option,
} from "@material-tailwind/react";
import axios from "axios";
import { API_URL } from "../services/api";

export default function Dashboard() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterMode, setFilterMode] = useState("month"); // month or custom
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("token");

      if (!token) {
        setError("Chưa đăng nhập");
        setLoading(false);
        return;
      }

      let params = {};

      if (filterMode === "month") {
        const daysInMonth = new Date(year, month, 0).getDate();
        params.startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        params.endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;
      } else if (filterMode === "custom" && startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      console.log("[Dashboard] Fetching stats with params:", params);

      const res = await axios.get(`${API_URL}/schedules/stats`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log("[Dashboard] Response:", res.data);
      setStats(res.data.stats || []);
      console.log("[Dashboard] Loaded", res.data.count, "employee stats");
    } catch (err) {
      console.error("[Dashboard] Error fetching stats:", err);
      setError(err.response?.data?.message || err.message || "Lỗi tải dữ liệu");
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, [filterMode, month, year, startDate, endDate]);

  useEffect(() => {
    console.log("[Dashboard] useEffect triggered");
    fetchStats();
  }, [fetchStats]);

  const totalStats = stats.reduce(
    (acc, emp) => ({
      shifts: acc.shifts + (emp.total_shifts || 0),
      hours: acc.hours + Number(emp.total_hours || 0),
    }),
    { shifts: 0, hours: 0 },
  );

  return (
    <div className="space-y-5">
      <Typography variant="h4" className="font-bold text-gray-900">
        📊 Tổng Quan
      </Typography>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          ❌ {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Card className="p-4 bg-white shadow-sm md:p-6">
          <Typography className="text-gray-600 text-sm">
            Tổng Nhân Viên
          </Typography>
          <Typography variant="h5" className="mt-2 font-bold">
            {stats.length}
          </Typography>
        </Card>

        <Card className="p-4 bg-white shadow-sm md:p-6">
          <Typography className="text-gray-600 text-sm">Tổng Ca Làm</Typography>
          <Typography variant="h5" className="mt-2 font-bold text-blue-600">
            {totalStats.shifts}
          </Typography>
        </Card>

        <Card className="p-4 bg-white shadow-sm md:p-6">
          <Typography className="text-gray-600 text-sm">
            Tổng Giờ Làm
          </Typography>
          <Typography variant="h5" className="mt-2 font-bold text-green-600">
            {totalStats.hours.toFixed(1)}h
          </Typography>
        </Card>

        <Card className="p-4 bg-white shadow-sm md:p-6">
          <Typography className="text-gray-600 text-sm">
            Trung Bình/Người
          </Typography>
          <Typography variant="h5" className="mt-2 font-bold text-orange-600">
            {stats.length > 0
              ? (totalStats.shifts / stats.length).toFixed(1)
              : 0}{" "}
            ca
          </Typography>
        </Card>
      </div>

      {/* Filter Controls */}
      <Card className="p-4 bg-white shadow-sm md:p-6">
        <Typography variant="h6" className="mb-4 font-semibold">
          🔍 Bộ Lọc
        </Typography>

        <div className="space-y-4">
          {/* Filter Mode Toggle */}
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              size="sm"
              variant={filterMode === "month" ? "filled" : "outlined"}
              onClick={() => setFilterMode("month")}
              className={filterMode === "month" ? "bg-blue-600" : ""}
            >
              Theo Tháng
            </Button>
            <Button
              size="sm"
              variant={filterMode === "custom" ? "filled" : "outlined"}
              onClick={() => setFilterMode("custom")}
              className={filterMode === "custom" ? "bg-blue-600" : ""}
            >
              Tùy Chỉnh
            </Button>
          </div>

          {/* Month/Year Filter */}
          {filterMode === "month" && (
            <div className="grid gap-3 sm:grid-cols-[150px_150px_auto] sm:items-end">
              <div>
                <Select
                  label="Tháng"
                  value={String(month)}
                  onChange={(v) => setMonth(Number(v))}
                >
                  {[...Array(12)].map((_, i) => (
                    <Option key={i + 1} value={String(i + 1)}>
                      Tháng {i + 1}
                    </Option>
                  ))}
                </Select>
              </div>

              <div>
                <Select
                  label="Năm"
                  value={String(year)}
                  onChange={(v) => setYear(Number(v))}
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <Option key={y} value={String(y)}>
                      {y}
                    </Option>
                  ))}
                </Select>
              </div>

              <Button
                size="sm"
                variant="text"
                onClick={fetchStats}
                disabled={loading}
                className="text-blue-600 mt-1"
              >
                {loading ? "⏳ Đang tải..." : "🔄 Làm Mới"}
              </Button>
            </div>
          )}

          {/* Custom Date Range */}
          {filterMode === "custom" && (
            <div className="flex gap-4 flex-wrap items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Từ ngày
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Đến ngày
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
              </div>

              <Button
                size="sm"
                variant="text"
                onClick={fetchStats}
                disabled={loading || !startDate || !endDate}
                className="text-blue-600"
              >
                {loading ? "⏳ Đang tải..." : "🔄 Làm Mới"}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Rankings Table */}
      <Card className="overflow-hidden shadow-sm bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left">
          <thead>
            <tr className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <th className="p-4 font-semibold">🏆 Xếp Hạng</th>
              <th className="p-4 font-semibold">Tên Nhân Viên</th>
              <th className="p-4 font-semibold">Email</th>
              <th className="p-4 font-semibold text-center">⏳ Ca Làm</th>
              <th className="p-4 font-semibold text-center">⌚ Giờ Làm</th>
              <th className="p-4 font-semibold text-center">📅 Ca Đầu</th>
              <th className="p-4 font-semibold text-center">📅 Ca Cuối</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                {[...Array(5)].map((_, idx) => (
                  <tr key={idx} className="border-b animate-pulse">
                    <td className="p-4">
                      <div className="h-4 bg-gray-200 rounded w-8"></div>
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-gray-200 rounded w-32"></div>
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-gray-200 rounded w-40"></div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="h-4 bg-gray-200 rounded w-12 mx-auto"></div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="h-4 bg-gray-200 rounded w-24 mx-auto"></div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="h-4 bg-gray-200 rounded w-24 mx-auto"></div>
                    </td>
                  </tr>
                ))}
              </>
            ) : stats.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-4 text-center text-gray-500">
                  Không có dữ liệu
                </td>
              </tr>
            ) : (
              stats.map((emp, idx) => (
                <tr
                  key={emp.employee_id}
                  className={`border-b transition ${
                    idx === 0
                      ? "bg-yellow-50"
                      : idx === 1
                        ? "bg-gray-100"
                        : idx === 2
                          ? "bg-orange-50"
                          : "hover:bg-gray-50"
                  }`}
                >
                  <td className="p-4 font-bold text-center">
                    {idx === 0
                      ? "🥇"
                      : idx === 1
                        ? "🥈"
                        : idx === 2
                          ? "🥉"
                          : `#${idx + 1}`}
                  </td>
                  <td className="p-4 font-medium text-gray-800">{emp.name}</td>
                  <td className="p-4 text-gray-600">{emp.email || "-"}</td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-700 rounded-full font-semibold text-sm">
                      {emp.total_shifts}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center justify-center w-12 h-8 bg-green-100 text-green-700 rounded font-semibold text-sm">
                      {emp.total_hours}h
                    </span>
                  </td>
                  <td className="p-4 text-center text-sm text-gray-600">
                    {emp.first_shift_date
                      ? new Date(emp.first_shift_date).toLocaleDateString(
                          "vi-VN",
                        )
                      : "-"}
                  </td>
                  <td className="p-4 text-center text-sm text-gray-600">
                    {emp.last_shift_date
                      ? new Date(emp.last_shift_date).toLocaleDateString(
                          "vi-VN",
                        )
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </Card>

      {/* Footer Stats */}
      {stats.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 bg-blue-50">
            <Typography className="text-sm text-gray-600">
              Top Siêng Năng
            </Typography>
            <Typography variant="h6" className="mt-2 font-bold text-blue-700">
              {stats[0]?.name} - {stats[0]?.total_shifts} ca
            </Typography>
          </Card>

          <Card className="p-4 bg-green-50">
            <Typography className="text-sm text-gray-600">
              Công Giờ Cao Nhất
            </Typography>
            <Typography variant="h6" className="mt-2 font-bold text-green-700">
              {stats[0]?.name} - {stats[0]?.total_hours} giờ
            </Typography>
          </Card>
        </div>
      )}
    </div>
  );
}
