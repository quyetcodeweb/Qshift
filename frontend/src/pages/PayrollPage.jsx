import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Option,
  Select,
  Spinner,
  Textarea,
  Typography,
} from "@material-tailwind/react";
import { useLocation, useNavigate } from "react-router-dom";
import { getRole } from "../utils/auth";
import { API_URL } from "../services/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

function money(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")} đ`;
}

function percent(value) {
  return `${Number(value || 0)}%`;
}

function getTabFromSearch(search) {
  return new URLSearchParams(search).get("tab") === "stats" ? "stats" : "salary";
}

function StatCard({ label, value, tone = "text-gray-900" }) {
  return (
    <Card className="p-4 shadow-sm">
      <Typography className="text-sm text-gray-600">{label}</Typography>
      <Typography variant="h4" className={`font-bold ${tone}`}>
        {value}
      </Typography>
    </Card>
  );
}

function PayrollTable({ rows, isAdmin }) {
  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center text-gray-500 shadow-sm">
        Không có dữ liệu lương trong bộ lọc hiện tại.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="bg-gray-900 text-white">
              {isAdmin && <th className="p-4 text-sm font-semibold">Nhân viên</th>}
              <th className="p-4 text-sm font-semibold">Tổng ca</th>
              <th className="p-4 text-sm font-semibold">Đúng giờ</th>
              <th className="p-4 text-sm font-semibold">Đi trễ</th>
              <th className="p-4 text-sm font-semibold">Chưa chấm</th>
              <th className="p-4 text-sm font-semibold">Giờ công</th>
              <th className="p-4 text-sm font-semibold">Lương / giờ</th>
              <th className="p-4 text-sm font-semibold">Tổng lương</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employee_id} className="border-b hover:bg-gray-50">
                {isAdmin && (
                  <td className="p-4">
                    <div className="font-semibold text-gray-900">{row.employee_name}</div>
                    <div className="text-xs text-gray-500">{row.email || "-"}</div>
                  </td>
                )}
                <td className="p-4 text-gray-800">{row.total_shifts}</td>
                <td className="p-4 text-green-700">{row.on_time_shifts}</td>
                <td className="p-4 text-orange-700">{row.late_shifts}</td>
                <td className="p-4 text-gray-700">{row.missing_shifts}</td>
                <td className="p-4 text-gray-800">{row.worked_hours}</td>
                <td className="p-4 text-gray-800">{money(row.hourly_rate)}</td>
                <td className="p-4 font-bold text-green-700">{money(row.total_salary)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PayrollChart({ rows }) {
  const maxSalary = Math.max(...rows.map((row) => Number(row.total_salary || 0)), 1);
  const chartRows = rows.slice(0, 12);

  if (chartRows.length === 0) {
    return (
      <Card className="p-8 text-center text-gray-500 shadow-sm">
        Không có dữ liệu để thống kê.
      </Card>
    );
  }

  return (
    <Card className="p-5 shadow-sm">
      <Typography variant="h6" className="mb-4 font-bold text-gray-900">
        Lương và hiệu suất theo nhân viên
      </Typography>
      <div className="space-y-4">
        {chartRows.map((row) => (
          <div key={row.employee_id} className="grid grid-cols-1 gap-2 md:grid-cols-[180px_1fr_110px] md:items-center">
            <div>
              <div className="font-semibold text-gray-900">{row.employee_name}</div>
              <div className="text-xs text-gray-500">
                {row.total_shifts} ca, hiệu suất {percent(row.efficiency)}
              </div>
            </div>
            <div className="h-8 overflow-hidden rounded bg-gray-100">
              <div
                className="flex h-full items-center justify-end bg-blue-600 pr-3 text-xs font-semibold text-white"
                style={{ width: `${Math.max((Number(row.total_salary || 0) / maxSalary) * 100, 4)}%` }}
              >
                {percent(row.productivity)}
              </div>
            </div>
            <div className="text-right font-semibold text-green-700">
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
  const [filters, setFilters] = useState({
    employee_id: "all",
    startDate: "",
    endDate: "",
  });
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState({ subject: "", content: "" });

  useEffect(() => {
    setActiveTab(getTabFromSearch(location.search));
  }, [location.search]);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchEmployees = async () => {
      try {
        const res = await axios.get(`${API_URL}/employees`);
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
      setTotals(res.data.totals || {});
    } catch (err) {
      setError(err.response?.data?.message || "Không thể tải dữ liệu lương");
      setRows([]);
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

  return (
    <div className="min-h-screen space-y-6 bg-gray-50 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Typography variant="h4" className="font-bold text-gray-900">
            Lương
          </Typography>
          <Typography className="text-sm text-gray-600">
            {filters.startDate && filters.endDate
              ? `${filters.startDate} đến ${filters.endDate}`
              : "Tất cả thời gian"}
          </Typography>
        </div>

        {!isAdmin && (
          <Button className="bg-blue-600" onClick={() => setFeedbackOpen(true)}>
            Phản hồi
          </Button>
        )}
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeTab === "salary" ? "filled" : "outlined"}
            className={activeTab === "salary" ? "bg-blue-600" : ""}
            onClick={() => setTab("salary")}
          >
            Tính lương
          </Button>
          <Button
            variant={activeTab === "stats" ? "filled" : "outlined"}
            className={activeTab === "stats" ? "bg-blue-600" : ""}
            onClick={() => setTab("stats")}
          >
            Thống kê
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className="p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {isAdmin && (
            <Select
              label="Nhân viên"
              value={filters.employee_id}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, employee_id: value || "all" }))
              }
            >
              <Option value="all">Tất cả nhân viên</Option>
              {employees.map((employee) => (
                <Option key={employee.employee_id} value={String(employee.employee_id)}>
                  {employee.name}
                </Option>
              ))}
            </Select>
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
            value={filters.endDate}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, endDate: event.target.value }))
            }
          />
          <Button variant="outlined" onClick={fetchPayroll} disabled={loading}>
            Làm mới
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <StatCard label="Số ca làm" value={totals.total_shifts || 0} />
        <StatCard label="Đi đúng giờ" value={totals.on_time_shifts || 0} tone="text-green-700" />
        <StatCard label="Đi trễ" value={totals.late_shifts || 0} tone="text-orange-700" />
        <StatCard label="Năng suất" value={percent(totals.productivity)} tone="text-blue-700" />
        <StatCard label="Hiệu suất" value={percent(totals.efficiency)} tone="text-purple-700" />
      </div>

      {loading ? (
        <Card className="flex h-48 items-center justify-center shadow-sm">
          <Spinner className="h-8 w-8" />
        </Card>
      ) : activeTab === "stats" && isAdmin ? (
        <PayrollChart rows={rows} />
      ) : (
        <PayrollTable rows={rows} isAdmin={isAdmin} />
      )}

      <Dialog open={feedbackOpen} handler={() => setFeedbackOpen(false)} size="sm">
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
          <Button variant="text" color="red" onClick={() => setFeedbackOpen(false)}>
            Hủy
          </Button>
          <Button className="bg-blue-600" onClick={submitFeedback}>
            Gửi
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
