import {
  Card,
  Button,
  Typography,
  Select,
  Option,
} from "@material-tailwind/react";
import { useEffect, useState } from "react";
import axios from "axios";

export default function AvailabilityPage() {
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [grid, setGrid] = useState({});
  const [originalGrid, setOriginalGrid] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  const user = JSON.parse(localStorage.getItem("user"));
  const role = user?.role;
  const userId = user?.user_id;

  console.log("👤 User info:", {
    userId,
    user_employee_id: user?.employee_id,
    role,
  });

  // ================= INIT =================
  useEffect(() => {
    console.log("🔄 INIT: fetchInit called, role:", role);
    fetchInit();
  }, []);

  const fetchInit = async () => {
    try {
      setLoadingEmployees(true);
      console.log("📦 fetchInit: loading employees and shifts");
      const [empRes, shiftRes] = await Promise.all([
        axios.get("http://localhost:5000/api/employees"),
        axios.get("http://localhost:5000/api/shifts"),
      ]);

      setEmployees(empRes.data);
      setShifts(shiftRes.data);
      console.log(
        "✅ fetchInit: got",
        empRes.data.length,
        "employees and",
        shiftRes.data.length,
        "shifts",
      );

      // Nếu là employee, set employeeId (từ user object hoặc lookup từ API)
      if (role === "EMPLOYEE") {
        if (user?.employee_id) {
          console.log(
            "👤 EMPLOYEE: using employee_id from user object:",
            user.employee_id,
          );
          setEmployeeId(String(user.employee_id));
        } else {
          console.log(
            "🔍 EMPLOYEE: looking up employee_id from API for user_id:",
            userId,
          );
          const myEmployee = empRes.data.find((e) => e.user_id === userId);
          if (myEmployee) {
            console.log("✅ Found employee from API:", myEmployee);
            setEmployeeId(String(myEmployee.employee_id));
          } else {
            console.warn("⚠️ Employee not found in API");
          }
        }
      } else if (role === "ADMIN" && empRes.data.length > 0) {
        // Auto-set first employee for admin
        console.log(
          "👨‍💼 ADMIN: setting default employee to:",
          empRes.data[0].employee_id,
        );
        setEmployeeId(String(empRes.data[0].employee_id));
      }
    } catch (err) {
      console.error("❌ fetchInit error:", err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  // ================= UTIL =================
  const getDaysInMonth = (m, y) => new Date(y, m, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");

  // ================= INIT GRID =================
  useEffect(() => {
    if (!shifts.length) return;

    console.log(
      "📊 INIT GRID: Creating empty grid for",
      getDaysInMonth(month, year),
      "days",
    );
    const days = getDaysInMonth(month, year);
    const init = {};

    for (let d = 1; d <= days; d++) {
      init[d] = {};
      shifts.forEach((s) => {
        init[d][s.shift_id] = false;
      });
    }

    setGrid(init);
    setOriginalGrid(init); // Reset original grid too
  }, [shifts, month, year]);

  // ================= LOAD DATA =================
  useEffect(() => {
    if (!employeeId) {
      console.log("⏸ LOAD DATA: employeeId not set yet");
      return;
    }
    console.log(
      "📥 LOAD DATA: fetching availability for emp",
      employeeId,
      `${month}/${year}`,
    );
    fetchData();
  }, [employeeId, month, year]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `http://localhost:5000/api/availability/${employeeId}?month=${month}&year=${year}`,
      );

      console.log("✅ LOAD DATA response:", res.data.length, "records");

      setGrid((prev) => {
        const newGrid = JSON.parse(JSON.stringify(prev)); // Deep copy prev grid

        res.data.forEach((item) => {
          const day = new Date(item.work_date).getDate();
          if (newGrid[day]) {
            newGrid[day][item.shift_id] = true;
            console.log(`✓ Set day ${day}, shift ${item.shift_id} = true`);
          }
        });

        console.log("📊 Updated grid:", newGrid);

        // Lưu lại trạng thái ban đầu từ DB để so sánh
        setOriginalGrid(JSON.parse(JSON.stringify(newGrid)));
        return newGrid;
      });
    } catch (err) {
      console.error("❌ LOAD DATA error:", err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  // ================= ACTION =================
  const toggle = (day, shift) => {
    setGrid((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [shift]: !prev[day][shift],
      },
    }));
  };

  // 🔥 SAVE (QUAN TRỌNG NHẤT)
  const handleSave = async () => {
    try {
      // Check có thay đổi không
      const hasChanged = JSON.stringify(grid) !== JSON.stringify(originalGrid);

      if (!hasChanged) {
        alert("Không có thay đổi để lưu!");
        return;
      }

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

      // 👨‍🔧 EMPLOYEE → gửi request
      if (role === "EMPLOYEE") {
        const token = localStorage.getItem("token");

        console.log("📤 Sending availability request:", {
          month,
          year,
          dataLen: availability.length,
          hasToken: !!token,
        });

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

        alert("Đã gửi yêu cầu, chờ admin duyệt!");
        fetchData(); // Refresh để lấy trạng thái mới
        return;
      }

      // 👨‍💼 ADMIN → lưu trực tiếp
      await axios.post("http://localhost:5000/api/availability", {
        employee_id: Number(employeeId),
        availability,
      });

      alert("Lưu thành công!");
      fetchData(); // Refresh
    } catch (err) {
      console.error(err);
      alert("Có lỗi xảy ra!");
    }
  };

  // ================= UI =================
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <Card className="p-6 rounded-2xl shadow-lg">
        <Typography variant="h4" className="mb-6">
          Thời gian rảnh
        </Typography>

        {!employeeId && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 p-3 rounded mb-4">
            ⏳ Đang tải dữ liệu...
          </div>
        )}

        {/* 👨 EMPLOYEE INFO */}
        {role === "EMPLOYEE" && employeeId && (
          <div className="bg-blue-50 border border-blue-200 p-3 rounded mb-4">
            <p className="text-sm text-gray-700">
              👤 <strong>Nhân viên:</strong>{" "}
              {employees.find((e) => String(e.employee_id) === employeeId)
                ?.name || `ID: ${employeeId}`}
            </p>
          </div>
        )}

        {/* 👨‍💼 ADMIN ONLY */}
        {role === "ADMIN" && (
          <Button
            className="bg-blue-600 mb-4"
            onClick={async () => {
              await axios.post("http://localhost:5000/api/notifications/send");
              alert("Đã gửi yêu cầu!");
            }}
          >
            Gửi yêu cầu nhân viên
          </Button>
        )}

        {/* FILTER */}
        <div className="flex gap-4 mb-6">
          {/* 👨‍💼 ADMIN mới thấy select nhân viên */}
          {role === "ADMIN" && (
            <Select
              label={loadingEmployees ? "Đang tải nhân viên..." : "Nhân viên"}
              value={employeeId || ""}
              onChange={(v) => {
                console.log("[AvailabilityPage] Employee selected:", v);
                setEmployeeId(v);
              }}
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
            {[2024, 2025, 2026].map((y) => (
              <Option key={y} value={String(y)}>
                {y}
              </Option>
            ))}
          </Select>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-center border">
            <thead>
              <tr>
                <th className="bg-red-500 text-white p-2">Day</th>
                {shifts.map((s) => (
                  <th key={s.shift_id} className="bg-blue-400 text-white p-2">
                    {s.shift_name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {Object.keys(grid)
                .sort((a, b) => a - b)
                .map((day) => (
                  <tr key={day}>
                    <td className="bg-red-400 text-white">{day}</td>

                    {shifts.map((s) => (
                      <td key={s.shift_id} className="bg-gray-100">
                        <input
                          type="checkbox"
                          checked={grid[day]?.[s.shift_id] || false}
                          onChange={() => toggle(day, s.shift_id)}
                          className="w-5 h-5"
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
            JSON.stringify(grid) === JSON.stringify(originalGrid)
          }
          className="mt-6 bg-green-600"
        >
          {role === "EMPLOYEE" ? "Gửi yêu cầu" : "Lưu"}
        </Button>
      </Card>
    </div>
  );
}
