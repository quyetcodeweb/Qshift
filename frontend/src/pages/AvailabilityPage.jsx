import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogHeader,
  Option,
  Select,
  Spinner,
  Typography,
} from "@material-tailwind/react";
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  FunnelIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  QuestionMarkCircleIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { API_URL } from "../services/api";

const ACCESS_KEY = "availabilityFillRequest";

function readAccess() {
  try {
    return JSON.parse(localStorage.getItem(ACCESS_KEY));
  } catch {
    return null;
  }
}

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN");
}

function formatTime(value) {
  return value?.slice(0, 5) || "--:--";
}

export default function AvailabilityPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const role = user?.role;
  const userId = user?.user_id;
  const employeeAccess = useMemo(() => readAccess(), []);
  const searchParams = new URLSearchParams(window.location.search);
  const requestedMonth = Number(employeeAccess?.month || searchParams.get("month"));
  const requestedYear = Number(employeeAccess?.year || searchParams.get("year"));

  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(requestedMonth || new Date().getMonth() + 1);
  const [year, setYear] = useState(requestedYear || new Date().getFullYear());
  const [grid, setGrid] = useState({});
  const [originalGrid, setOriginalGrid] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);

  const isEmployee = role === "EMPLOYEE";
  const isAdmin = role === "ADMIN";
  const canEmployeeFill = useMemo(() => {
    if (!isEmployee) return true;
    return Boolean(employeeAccess?.month && employeeAccess?.year);
  }, [employeeAccess?.month, employeeAccess?.year, isEmployee]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => String(employee.employee_id) === String(employeeId)),
    [employeeId, employees],
  );
  const filteredEmployees = useMemo(() => {
    const keyword = employeeSearch.trim().toLowerCase();
    if (!keyword) return employees;
    return employees.filter((employee) =>
      [employee.name, employee.email, employee.phone, employee.employee_code]
        .some((value) => String(value || "").toLowerCase().includes(keyword)),
    );
  }, [employeeSearch, employees]);

  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [month, year]);

  const selectedCount = useMemo(
    () =>
      Object.values(grid).reduce(
        (total, dayValue) => total + Object.values(dayValue || {}).filter(Boolean).length,
        0,
      ),
    [grid],
  );

  const hasChanged = useMemo(
    () => JSON.stringify(grid) !== JSON.stringify(originalGrid),
    [grid, originalGrid],
  );

  const createEmptyGrid = useCallback((targetMonth, targetYear, shiftList) => {
    const days = new Date(targetYear, targetMonth, 0).getDate();
    const nextGrid = {};

    for (let day = 1; day <= days; day += 1) {
      nextGrid[day] = {};
      shiftList.forEach((shift) => {
        nextGrid[day][shift.shift_id] = false;
      });
    }

    return nextGrid;
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
      const nextGrid = createEmptyGrid(month, year, shifts);

      records.forEach((item) => {
        const day = getAvailabilityDay(item);
        if (day && nextGrid[day]) {
          nextGrid[day][item.shift_id] = true;
        }
      });

      setGrid(nextGrid);
      setOriginalGrid(JSON.parse(JSON.stringify(nextGrid)));
    },
    [createEmptyGrid, getAvailabilityDay, month, shifts, year],
  );

  const fetchInit = useCallback(async () => {
    try {
      setLoadingEmployees(true);
      const [employeeRes, shiftRes] = await Promise.all([
        axios.get(`${API_URL}/employees`, { headers: authHeaders() }),
        axios.get(`${API_URL}/shifts`, { headers: authHeaders() }),
      ]);

      const employeeList = employeeRes.data || [];
      setEmployees(employeeList);
      setShifts(shiftRes.data || []);

      if (isEmployee) {
        if (user?.employee_id) {
          setEmployeeId(String(user.employee_id));
        } else {
          const myEmployee = employeeList.find((employee) => employee.user_id === userId);
          if (myEmployee) setEmployeeId(String(myEmployee.employee_id));
        }
      } else if (employeeList.length > 0) {
        setEmployeeId(String(employeeList[0].employee_id));
      }
    } catch (err) {
      console.error("fetchInit error:", err);
    } finally {
      setLoadingEmployees(false);
    }
  }, [isEmployee, user?.employee_id, userId]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/availability/${employeeId}?month=${month}&year=${year}`, {
        headers: authHeaders(),
      });
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
  }, [applyAvailabilityToGrid, employeeAccess?.availability, employeeId, month, year]);

  useEffect(() => {
    fetchInit();
  }, [fetchInit]);

  useEffect(() => {
    if (isEmployee && employeeAccess?.month && employeeAccess?.year) {
      setMonth(Number(employeeAccess.month));
      setYear(Number(employeeAccess.year));
    }
  }, [employeeAccess?.month, employeeAccess?.year, isEmployee]);

  useEffect(() => {
    if (!shifts.length) return;
    const nextGrid = createEmptyGrid(month, year, shifts);
    setGrid(nextGrid);
    setOriginalGrid(nextGrid);
  }, [createEmptyGrid, month, shifts, year]);

  useEffect(() => {
    if (!employeeId || !canEmployeeFill || !shifts.length) return;
    fetchData();
  }, [canEmployeeFill, employeeId, fetchData, shifts.length]);

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

  const toggle = (day, shiftId) => {
    setGrid((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [shiftId]: !prev[day]?.[shiftId],
      },
    }));
  };

  const handleSave = async () => {
    try {
      if (!isEmployee && !hasChanged) {
        alert("Không có thay đổi để lưu!");
        return;
      }

      const availability = buildAvailability();

      if (isEmployee) {
        await axios.post(
          `${API_URL}/availability/request`,
          { month, year, data: availability },
          { headers: authHeaders() },
        );

        clearEmployeeAccess();
        window.dispatchEvent(new Event("notification-count-changed"));
        alert("Đã lưu lịch rảnh và gửi thông báo cho admin!");
        navigate("/");
        return;
      }

      await axios.post(
        `${API_URL}/availability`,
        {
          employee_id: Number(employeeId),
          availability,
        },
        { headers: authHeaders() },
      );

      alert("Lưu thành công!");
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Có lỗi xảy ra!");
    }
  };

  const sendFillRequest = async () => {
    try {
      const res = await axios.post(
        `${API_URL}/notifications/send`,
        { month, year },
        { headers: authHeaders() },
      );
      alert(`Đã gửi yêu cầu cho ${res.data.count || 0} nhân viên!`);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Không thể gửi yêu cầu!");
    }
  };

  if (isEmployee && !canEmployeeFill) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <Card className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <InformationCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-blue-600" />
            <div>
              <Typography variant="h5" className="font-bold text-gray-950">
                Thời gian rảnh
              </Typography>
              <Typography className="mt-2 text-sm leading-6 text-gray-600">
                Mục này chỉ mở khi admin gửi yêu cầu điền lịch rảnh. Vui lòng kiểm tra thông báo và nhấn OK để bắt đầu.
              </Typography>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Typography variant="h4" className="font-bold tracking-tight text-gray-950">
            Thời gian rảnh
          </Typography>
          <Typography className="mt-1 text-sm text-gray-600">
            Chọn các ca mà nhân viên có thể làm để hệ thống tự động xếp lịch chính xác hơn.
          </Typography>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          aria-label="Chú thích chức năng"
        >
          <QuestionMarkCircleIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit rounded-md border border-gray-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
          <div className="mb-4 flex items-center gap-2">
            <FunnelIcon className="h-5 w-5 text-blue-600" />
            <Typography variant="h6" className="font-bold text-gray-950">
              Bộ lọc
            </Typography>
          </div>

          <div className="space-y-4">
            {isEmployee ? (
              <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
                <div className="flex items-center gap-2 text-sm font-bold text-blue-900">
                  <UserCircleIcon className="h-5 w-5" />
                  {selectedEmployee?.name || `ID: ${employeeId}`}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-blue-800">
                  <CalendarDaysIcon className="h-5 w-5" />
                  Tháng {month}/{year}
                </div>
              </div>
            ) : (
              <>
                <div className="relative">
                  <button
                    type="button"
                    disabled={loadingEmployees || employees.length === 0}
                    onClick={() => setEmployeePickerOpen((open) => !open)}
                    className="flex h-11 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 text-left text-sm font-semibold text-gray-900 outline-none transition hover:border-blue-500 focus:border-blue-600 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {loadingEmployees
                        ? "Đang tải nhân viên..."
                        : selectedEmployee?.name || "Chọn nhân viên"}
                    </span>
                    <UserCircleIcon className="h-5 w-5 shrink-0 text-gray-400" />
                  </button>
                  {employeePickerOpen && (
                    <div className="absolute left-0 top-12 z-40 w-full rounded-md border border-gray-200 bg-white p-2 shadow-xl">
                      <div className="relative mb-2">
                        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          value={employeeSearch}
                          onChange={(event) => setEmployeeSearch(event.target.value)}
                          placeholder="Tìm tên, email, SĐT..."
                          className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm font-medium text-gray-900 outline-none focus:border-blue-600"
                        />
                      </div>
                      <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                        {filteredEmployees.length === 0 ? (
                          <div className="px-3 py-4 text-center text-sm font-medium text-gray-500">
                            Không tìm thấy nhân viên
                          </div>
                        ) : (
                          filteredEmployees.map((employee) => (
                            <button
                              key={employee.employee_id}
                              type="button"
                              onClick={() => {
                                setEmployeeId(String(employee.employee_id));
                                setEmployeePickerOpen(false);
                                setEmployeeSearch("");
                              }}
                              className={`w-full rounded-md px-3 py-2 text-left transition ${
                                String(employee.employee_id) === String(employeeId)
                                  ? "bg-blue-50 text-blue-700"
                                  : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <div className="truncate text-sm font-bold">{employee.name}</div>
                              <div className="truncate text-xs font-medium text-gray-500">
                                {employee.email || employee.phone || `ID: ${employee.employee_id}`}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="hidden">
                <Select
                  label={loadingEmployees ? "Đang tải nhân viên..." : "Nhân viên"}
                  value={employeeId || ""}
                  onChange={(value) => setEmployeeId(value || "")}
                  disabled={loadingEmployees || employees.length === 0}
                >
                  {employees.length === 0 ? (
                    <Option value="" disabled>
                      {loadingEmployees ? "Đang tải..." : "Không có nhân viên"}
                    </Option>
                  ) : (
                    employees.map((employee) => (
                      <Option key={employee.employee_id} value={String(employee.employee_id)}>
                        {employee.name}
                      </Option>
                    ))
                  )}
                </Select>
                </div>

                <div className="grid gap-3">
                  <Select label="Tháng" value={String(month)} onChange={(value) => setMonth(Number(value))}>
                    {[...Array(12)].map((_, index) => (
                      <Option key={index + 1} value={String(index + 1)}>
                        Tháng {index + 1}
                      </Option>
                    ))}
                  </Select>
                  <Select label="Năm" value={String(year)} onChange={(value) => setYear(Number(value))}>
                    {[2024, 2025, 2026, 2027, 2028].map((item) => (
                      <Option key={item} value={String(item)}>
                        {item}
                      </Option>
                    ))}
                  </Select>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-gray-200 p-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <CalendarDaysIcon className="h-4 w-4" />
                  Ngày
                </div>
                <div className="mt-1 text-xl font-bold text-gray-950">{daysInMonth}</div>
              </div>
              <div className="rounded-md border border-gray-200 p-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <CheckCircleIcon className="h-4 w-4" />
                  Đã chọn
                </div>
                <div className="mt-1 text-xl font-bold text-gray-950">{selectedCount}</div>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 p-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                <ClockIcon className="h-4 w-4" />
                Ca làm
              </div>
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
                {shifts.length === 0 ? (
                  <div className="text-sm font-medium text-gray-500">Chưa có ca làm</div>
                ) : (
                  shifts.map((shift) => (
                    <div key={shift.shift_id} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: shift.color || "#2563eb" }}
                      />
                      <span className="min-w-0 flex-1 truncate">{shift.shift_name}</span>
                      <span className="shrink-0 text-xs text-gray-500">
                        {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {isAdmin && (
              <Button
                variant="outlined"
                onClick={sendFillRequest}
                className="flex w-full items-center justify-center gap-2 rounded-md border-blue-200 normal-case text-blue-700"
              >
                <PaperAirplaneIcon className="h-5 w-5" />
                Gửi yêu cầu nhân viên
              </Button>
            )}
          </div>
        </Card>

        <Card className="flex h-[calc(100vh-170px)] min-h-[560px] flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm max-lg:h-[680px]">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Typography variant="h6" className="font-bold text-gray-950">
                Form đăng ký lịch rảnh
              </Typography>
              <Typography className="text-sm text-gray-500">
                {selectedEmployee?.name || "Chưa chọn nhân viên"} · Tháng {month}/{year}
              </Typography>
            </div>
            <Button
              onClick={handleSave}
              disabled={!employeeId || loading || (!isEmployee && !hasChanged)}
              className="flex items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 normal-case text-white disabled:opacity-50"
            >
              <CheckCircleIcon className="h-5 w-5" />
              Lưu lịch rảnh
            </Button>
          </div>

          {!employeeId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm font-medium text-gray-500">
              Đang tải dữ liệu nhân viên...
            </div>
          ) : loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="h-8 w-8 text-blue-600" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="min-w-max w-full border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 w-28 border-b border-r border-gray-200 bg-gray-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-600">
                      Ngày
                    </th>
                    {shifts.map((shift) => (
                      <th
                        key={shift.shift_id}
                        className="sticky top-0 z-10 min-w-44 border-b border-gray-200 bg-gray-50 px-3 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: shift.color || "#2563eb" }}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-gray-950">{shift.shift_name}</div>
                            <div className="mt-0.5 text-xs font-semibold text-gray-500">
                              {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                            </div>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(grid)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((day) => {
                      const dateValue = `${year}-${pad(month)}-${pad(day)}`;
                      return (
                        <tr key={day} className="group">
                          <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-4 py-3 group-hover:bg-blue-50">
                            <div className="text-sm font-bold text-gray-950">{day}</div>
                            <div className="text-xs font-medium text-gray-500">{formatDate(dateValue)}</div>
                          </td>
                          {shifts.map((shift) => {
                            const checked = Boolean(grid[day]?.[shift.shift_id]);
                            return (
                              <td key={shift.shift_id} className="border-b border-gray-100 bg-white px-3 py-3 group-hover:bg-blue-50">
                                <button
                                  type="button"
                                  onClick={() => toggle(day, shift.shift_id)}
                                  className={`flex h-10 w-full items-center justify-center rounded-md border text-sm font-bold transition ${
                                    checked
                                      ? "border-green-200 bg-green-50 text-green-700"
                                      : "border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                  }`}
                                  aria-pressed={checked}
                                >
                                  {checked ? "Rảnh" : "Không"}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={helpOpen} handler={() => setHelpOpen(false)} size="md">
        <DialogHeader className="border-b border-gray-100">
          <div className="flex w-full items-center justify-between gap-3">
            <Typography variant="h5" className="font-bold text-gray-950">
              Chú thích thời gian rảnh
            </Typography>
            <button type="button" onClick={() => setHelpOpen(false)} className="rounded-md p-2 text-gray-500 hover:bg-gray-100">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="rounded-md bg-gray-50 p-3 text-sm leading-6 text-gray-700">
            Admin chọn nhân viên, tháng và năm để xem hoặc chỉnh lịch rảnh. Nút gửi yêu cầu sẽ thông báo nhân viên điền lịch rảnh cho tháng đang chọn.
          </div>
          <div className="rounded-md bg-green-50 p-3 text-sm leading-6 text-green-800">
            Nhân viên chỉ thấy trang này khi có yêu cầu từ admin. Sau khi lưu, dữ liệu được gửi về admin duyệt.
          </div>
          <div className="rounded-md bg-blue-50 p-3 text-sm leading-6 text-blue-800">
            Bảng bên phải có thể cuộn ngang khi có nhiều ca làm và cuộn dọc khi tháng có nhiều ngày.
          </div>
        </DialogBody>
      </Dialog>
    </div>
  );
}
