import {
  Card,
  Button,
  Typography,
  Select,
  Option,
} from "@material-tailwind/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const ACCESS_KEY = "availabilityFillRequest";

const readAccess = () => {
  try {
    return JSON.parse(localStorage.getItem(ACCESS_KEY));
  } catch {
    return null;
  }
};

export default function AvailabilityPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const role = user?.role;
  const userId = user?.user_id;
  const employeeAccess = readAccess();
  const searchParams = new URLSearchParams(window.location.search);
  const requestedMonth = Number(employeeAccess?.month || searchParams.get("month"));
  const requestedYear = Number(employeeAccess?.year || searchParams.get("year"));

  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(
    requestedMonth || new Date().getMonth() + 1,
  );
  const [year, setYear] = useState(requestedYear || new Date().getFullYear());
  const [grid, setGrid] = useState({});
  const [originalGrid, setOriginalGrid] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  const canEmployeeFill = useMemo(() => {
    if (role !== "EMPLOYEE") return true;
    return Boolean(employeeAccess?.month && employeeAccess?.year);
  }, [employeeAccess?.month, employeeAccess?.year, role]);

  useEffect(() => {
    fetchInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (role === "EMPLOYEE" && employeeAccess?.month && employeeAccess?.year) {
      setMonth(Number(employeeAccess.month));
      setYear(Number(employeeAccess.year));
    }
  }, [employeeAccess?.month, employeeAccess?.year, role]);

  const fetchInit = async () => {
    try {
      setLoadingEmployees(true);
      const [empRes, shiftRes] = await Promise.all([
        axios.get("http://localhost:5000/api/employees"),
        axios.get("http://localhost:5000/api/shifts"),
      ]);

      setEmployees(empRes.data);
      setShifts(shiftRes.data);

      if (role === "EMPLOYEE") {
        if (user?.employee_id) {
          setEmployeeId(String(user.employee_id));
        } else {
          const myEmployee = empRes.data.find((e) => e.user_id === userId);
          if (myEmployee) {
            setEmployeeId(String(myEmployee.employee_id));
          }
        }
      } else if (role === "ADMIN" && empRes.data.length > 0) {
        setEmployeeId(String(empRes.data[0].employee_id));
      }
    } catch (err) {
      console.error("fetchInit error:", err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const pad = (n) => String(n).padStart(2, "0");

  const createEmptyGrid = useCallback((m, y, shiftList) => {
    const days = new Date(y, m, 0).getDate();
    const init = {};

    for (let d = 1; d <= days; d++) {
      init[d] = {};
      shiftList.forEach((s) => {
        init[d][s.shift_id] = false;
      });
    }

    return init;
  }, []);

  const getAvailabilityDay = useCallback((item) => {
    const rawDate = item.date || item.work_date;
    if (!rawDate) return null;

    if (typeof rawDate === "string") {
      const dateOnly = rawDate.split("T")[0];
      const day = Number(dateOnly.split("-")[2]);
      return Number.isNaN(day) ? null : day;
    }

    const day = new Date(rawDate).getDate();
    return Number.isNaN(day) ? null : day;
  }, []);

  const applyAvailabilityToGrid = useCallback(
    (records) => {
      const newGrid = createEmptyGrid(month, year, shifts);

      records.forEach((item) => {
        const day = getAvailabilityDay(item);
        if (day && newGrid[day]) {
          newGrid[day][item.shift_id] = true;
        }
      });

      setGrid(newGrid);
      setOriginalGrid(JSON.parse(JSON.stringify(newGrid)));
    },
    [createEmptyGrid, getAvailabilityDay, month, shifts, year],
  );

  useEffect(() => {
    if (!shifts.length) return;

    const init = createEmptyGrid(month, year, shifts);
    setGrid(init);
    setOriginalGrid(init);
  }, [shifts, month, year, createEmptyGrid]);

  useEffect(() => {
    if (!employeeId || !canEmployeeFill || !shifts.length) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, month, year, canEmployeeFill, shifts.length]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `http://localhost:5000/api/availability/${employeeId}?month=${month}&year=${year}`,
      );

      const fallbackAvailability = Array.isArray(employeeAccess?.availability)
        ? employeeAccess.availability
        : [];
      const records = res.data.length > 0 ? res.data : fallbackAvailability;
      applyAvailabilityToGrid(records);
    } catch (err) {
      console.error("LOAD DATA error:", err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (day, shift) => {
    setGrid((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [shift]: !prev[day][shift],
      },
    }));
  };

  const buildAvailability = () => {
    const availability = [];

    Object.keys(grid).forEach((day) => {
      Object.keys(grid[day]).forEach((shift) => {
        if (grid[day][shift]) {
          availability.push({
            date: `${year}-${pad(month)}-${pad(day)}`,
            shift_id: Number(shift),
          });
        }
      });
    });

    return availability;
  };

  const clearEmployeeAccess = () => {
    localStorage.removeItem(ACCESS_KEY);
    window.dispatchEvent(new Event("availability-access-changed"));
  };

  const handleSave = async () => {
    try {
      const hasChanged = JSON.stringify(grid) !== JSON.stringify(originalGrid);

      if (role !== "EMPLOYEE" && !hasChanged) {
        alert("Không có thay đổi để lưu!");
        return;
      }

      const availability = buildAvailability();

      if (role === "EMPLOYEE") {
        const token = localStorage.getItem("token");

        await axios.post(
          "http://localhost:5000/api/availability/request",
          {
            month,
            year,
            data: availability,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        clearEmployeeAccess();
        window.dispatchEvent(new Event("notification-count-changed"));
        alert("Đã lưu lịch rảnh và gửi thông báo cho admin!");
        navigate("/");
        return;
      }

      await axios.post("http://localhost:5000/api/availability", {
        employee_id: Number(employeeId),
        availability,
      });

      alert("Lưu thành công!");
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Có lỗi xảy ra!");
    }
  };

  const sendFillRequest = async () => {
    try {
      const res = await axios.post("http://localhost:5000/api/notifications/send", {
        month,
        year,
      });
      alert(`Đã gửi yêu cầu cho ${res.data.count || 0} nhân viên!`);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Không thể gửi yêu cầu!");
    }
  };

  if (role === "EMPLOYEE" && !canEmployeeFill) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Card className="p-6 shadow-lg">
          <Typography variant="h4" className="mb-3">
            Thời gian rảnh
          </Typography>
          <p className="text-gray-700">
            Mục này chỉ mở khi admin gửi yêu cầu điền lịch rảnh. Vui lòng kiểm
            tra thông báo và nhấn OK để bắt đầu.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Card className="p-6 shadow-lg">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Typography variant="h4">Thời gian rảnh</Typography>
            {role === "EMPLOYEE" && (
              <p className="mt-1 text-sm text-gray-600">
                Chỉ điền lịch rảnh cho tháng {month}/{year} theo yêu cầu của
                admin.
              </p>
            )}
          </div>

          {role === "ADMIN" && (
            <Button className="bg-blue-600" onClick={sendFillRequest}>
              Gửi yêu cầu nhân viên
            </Button>
          )}
        </div>

        {!employeeId && (
          <div className="mb-4 rounded border border-yellow-400 bg-yellow-100 p-3 text-yellow-800">
            Đang tải dữ liệu...
          </div>
        )}

        {role === "EMPLOYEE" && employeeId && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-gray-700">
              <strong>Nhân viên:</strong>{" "}
              {employees.find((e) => String(e.employee_id) === employeeId)
                ?.name || `ID: ${employeeId}`}
            </p>
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-4">
          {role === "ADMIN" && (
            <Select
              label={loadingEmployees ? "Đang tải nhân viên..." : "Nhân viên"}
              value={employeeId || ""}
              onChange={(v) => setEmployeeId(v)}
              disabled={loadingEmployees || employees.length === 0}
            >
              {employees.length === 0 ? (
                <Option value="" disabled>
                  {loadingEmployees ? "Đang tải..." : "Không có nhân viên"}
                </Option>
              ) : (
                employees.map((e) => (
                  <Option key={e.employee_id} value={String(e.employee_id)}>
                    {e.name}
                  </Option>
                ))
              )}
            </Select>
          )}

          {role === "ADMIN" ? (
            <>
              <Select
                label="Tháng"
                value={String(month)}
                onChange={(val) => setMonth(Number(val))}
              >
                {[...Array(12)].map((_, i) => (
                  <Option key={i + 1} value={String(i + 1)}>
                    Tháng {i + 1}
                  </Option>
                ))}
              </Select>

              <Select
                label="Năm"
                value={String(year)}
                onChange={(val) => setYear(Number(val))}
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <Option key={y} value={String(y)}>
                    {y}
                  </Option>
                ))}
              </Select>
            </>
          ) : (
            <div className="rounded border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700">
              Tháng {month}/{year}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border text-center">
            <thead>
              <tr>
                <th className="bg-red-500 p-2 text-white">Ngày</th>
                {shifts.map((s) => (
                  <th key={s.shift_id} className="bg-blue-400 p-2 text-white">
                    {s.shift_name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {Object.keys(grid)
                .sort((a, b) => Number(a) - Number(b))
                .map((day) => (
                  <tr key={day}>
                    <td className="bg-red-400 text-white">{day}</td>

                    {shifts.map((s) => (
                      <td key={s.shift_id} className="bg-gray-100 p-2">
                        <input
                          type="checkbox"
                          checked={grid[day]?.[s.shift_id] || false}
                          onChange={() => toggle(day, s.shift_id)}
                          className="h-5 w-5"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <Button
          onClick={handleSave}
          disabled={
            !employeeId ||
            loading ||
            (role !== "EMPLOYEE" &&
              JSON.stringify(grid) === JSON.stringify(originalGrid))
          }
          className="mt-6 bg-green-600"
        >
          Lưu
        </Button>
      </Card>
    </div>
  );
}
