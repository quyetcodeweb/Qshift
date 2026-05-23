import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AdjustmentsHorizontalIcon,
  CalendarDaysIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  SparklesIcon,
  TrashIcon,
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
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
  Switch,
  Typography,
} from "@material-tailwind/react";
import AutoScheduleModal from "../components/AutoScheduleModal";
import { API_URL } from "../services/api";

const schedulePageSize = 8;
const emptyScheduleForm = {
  employee_id: "",
  shift_id: "",
  work_date: "",
  status: "PUBLISHED",
};
const emptyShiftForm = {
  shift_name: "",
  start_time: "",
  end_time: "",
  description: "",
  color: "#2563eb",
};
const defaultSettings = {
  balance_scheduling: false,
  prefer_consecutive_shifts: false,
  balance_by_workday: false,
  allow_role_fallback: false,
};
const settingRows = [
  {
    key: "balance_scheduling",
    title: "Xếp lịch cân bằng",
    note: "Phân bổ số ca đều hơn giữa các nhân viên, ưu tiên người đang có ít ca hơn.",
  },
  {
    key: "prefer_consecutive_shifts",
    title: "Ưu tiên liền ca",
    note: "Ưu tiên xếp các ca liên tiếp cho cùng nhân viên để hạn chế lịch bị đứt quãng.",
  },
  {
    key: "balance_by_workday",
    title: "Cân bằng theo ngày làm",
    note: "Ưu tiên chia đều số ngày làm, hữu ích khi một ngày có nhiều ca.",
  },
  {
    key: "allow_role_fallback",
    title: "Bù vai trò thiếu",
    note: "Khi thiếu đúng vai trò bắt buộc, hệ thống có thể dùng nhân viên rảnh khác để bù tạm.",
  },
];

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
    "vi-VN",
  );
}

function formatTime(value) {
  return value?.slice(0, 5) || "--:--";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function statusBadge(status) {
  if (status === "PUBLISHED")
    return "bg-green-50 text-green-700 ring-green-100";
  return "bg-amber-50 text-amber-700 ring-amber-100";
}

function statusText(status) {
  return status === "PUBLISHED" ? "Đã công bố" : "Chưa công bố";
}

function isHexColor(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(value || "");
}

function timeToMinutes(value) {
  const [hours = 0, minutes = 0] = String(value || "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

function timeRanges(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === end) return [];
  if (end > start) return [[start, end]];
  return [
    [start, 1440],
    [0, end],
  ];
}

function hasTimeOverlap(aStart, aEnd, bStart, bEnd) {
  const first = timeRanges(aStart, aEnd);
  const second = timeRanges(bStart, bEnd);
  return first.some(([start, end]) =>
    second.some(([otherStart, otherEnd]) => start < otherEnd && otherStart < end),
  );
}

export default function CreateSchedule() {
  const [schedules, setSchedules] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [scheduleSettings, setScheduleSettings] = useState(defaultSettings);
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm);
  const [shiftForm, setShiftForm] = useState(emptyShiftForm);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openAutoScheduleModal, setOpenAutoScheduleModal] = useState(false);
  const [expandedNote, setExpandedNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filterShift, setFilterShift] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState("");
  const [viewYear, setViewYear] = useState("");
  const [page, setPage] = useState(1);
  const [scheduleEmployeeSearch, setScheduleEmployeeSearch] = useState("");
  const [scheduleEmployeePickerOpen, setScheduleEmployeePickerOpen] =
    useState(false);

  const fetchSchedules = useCallback(
    async (month = viewMonth || "all", year = viewYear || "all") => {
      try {
        setLoading(true);
        const res = await axios.get(
          `${API_URL}/schedules/current?month=${month}&year=${year}`,
          {
            headers: authHeaders(),
          },
        );
        setSchedules(res.data || []);
      } catch (err) {
        console.error("[CreateSchedule] schedules:", err);
        setSchedules([]);
      } finally {
        setLoading(false);
      }
    },
    [viewMonth, viewYear],
  );

  const fetchShifts = useCallback(async () => {
    const res = await axios.get(`${API_URL}/shifts`, {
      headers: authHeaders(),
    });
    setShifts(res.data || []);
  }, []);

  const fetchEmployees = useCallback(async () => {
    const res = await axios.get(`${API_URL}/employees`, {
      headers: authHeaders(),
    });
    setEmployees(res.data || []);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/schedules/settings`, {
        headers: authHeaders(),
      });
      setScheduleSettings({ ...defaultSettings, ...(res.data || {}) });
    } catch {
      setScheduleSettings(defaultSettings);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  useEffect(() => {
    fetchShifts();
    fetchEmployees();
    loadSettings();
  }, [fetchEmployees, fetchShifts, loadSettings]);

  const filteredSchedules = useMemo(() => {
    const keyword = normalize(query);
    return schedules
      .filter((schedule) => {
        const matchQuery =
          !keyword ||
          [
            schedule.employee_name,
            schedule.shift_name,
            schedule.work_date,
          ].some((value) => normalize(value).includes(keyword));
        const matchShift =
          !filterShift || String(schedule.shift_id) === filterShift;
        const matchStatus = !filterStatus || schedule.status === filterStatus;
        const scheduleDate = String(schedule.work_date || "").slice(0, 10);
        const matchStartDate =
          !filterStartDate || scheduleDate >= filterStartDate;
        const matchEndDate = !filterEndDate || scheduleDate <= filterEndDate;
        const matchMonth =
          !viewMonth ||
          Number(schedule.work_date?.slice(5, 7)) === Number(viewMonth);
        const matchYear =
          !viewYear || schedule.work_date?.slice(0, 4) === viewYear;
        return (
          matchQuery &&
          matchShift &&
          matchStatus &&
          matchStartDate &&
          matchEndDate &&
          matchMonth &&
          matchYear
        );
      })
      .sort((a, b) =>
        `${a.work_date} ${a.start_time}`.localeCompare(
          `${b.work_date} ${b.start_time}`,
        ),
      );
  }, [
    filterEndDate,
    filterShift,
    filterStartDate,
    filterStatus,
    query,
    schedules,
    viewMonth,
    viewYear,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredSchedules.length / schedulePageSize),
  );
  const pagedSchedules = filteredSchedules.slice(
    (page - 1) * schedulePageSize,
    page * schedulePageSize,
  );
  const selectedScheduleFormEmployee = employees.find(
    (employee) => String(employee.employee_id) === scheduleForm.employee_id,
  );
  const filteredScheduleEmployees = useMemo(() => {
    const keyword = normalize(scheduleEmployeeSearch);
    if (!keyword) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.phone,
        employee.employee_code,
        `NV-${employee.employee_id}`,
      ].some((value) => normalize(value).includes(keyword)),
    );
  }, [employees, scheduleEmployeeSearch]);

  useEffect(() => {
    setPage(1);
  }, [
    query,
    filterEndDate,
    filterShift,
    filterStartDate,
    filterStatus,
    viewMonth,
    viewYear,
  ]);

  const openCreateSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm(emptyScheduleForm);
    setScheduleModalOpen(true);
  };

  const fillScheduleForm = (schedule) => {
    setScheduleForm({
      employee_id: String(schedule.employee_id || ""),
      shift_id: String(schedule.shift_id || ""),
      work_date: schedule.work_date || "",
      status: schedule.status || "PUBLISHED",
    });
  };

  const startInlineEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    fillScheduleForm(schedule);
    setScheduleModalOpen(false);
  };

  const closeSelectedSchedule = () => {
    setSelectedSchedule(null);
    setEditingSchedule(null);
  };

  const saveSchedule = async () => {
    if (
      !scheduleForm.employee_id ||
      !scheduleForm.shift_id ||
      !scheduleForm.work_date
    ) {
      alert("Vui lòng nhập đủ nhân viên, ca làm và ngày làm");
      return;
    }

    const payload = {
      employee_id: Number(scheduleForm.employee_id),
      shift_id: Number(scheduleForm.shift_id),
      work_date: scheduleForm.work_date,
      status: scheduleForm.status,
    };

    try {
      if (editingSchedule) {
        await axios.put(
          `${API_URL}/schedules/${editingSchedule.schedule_id}`,
          payload,
          {
            headers: authHeaders(),
          },
        );
      } else {
        await axios.post(`${API_URL}/schedules`, payload, {
          headers: authHeaders(),
        });
      }
      setScheduleModalOpen(false);
      if (
        selectedSchedule &&
        editingSchedule?.schedule_id === selectedSchedule.schedule_id
      ) {
        const employee = employees.find(
          (item) => String(item.employee_id) === String(payload.employee_id),
        );
        const shift = shifts.find(
          (item) => String(item.shift_id) === String(payload.shift_id),
        );
        setSelectedSchedule({
          ...selectedSchedule,
          ...payload,
          employee_name: employee?.name || selectedSchedule.employee_name,
          shift_name: shift?.shift_name || selectedSchedule.shift_name,
          start_time: shift?.start_time || selectedSchedule.start_time,
          end_time: shift?.end_time || selectedSchedule.end_time,
          color: shift?.color || selectedSchedule.color,
        });
      }
      setEditingSchedule(null);
      const [year, month] = scheduleForm.work_date.split("-");
      setViewYear(year);
      setViewMonth(String(Number(month)));
      fetchSchedules(String(Number(month)), year);
    } catch (err) {
      alert(err.response?.data?.message || "Không thể lưu ca làm");
    }
  };

  const deleteSchedule = async (schedule) => {
    const confirmed = await window.appConfirm?.({
      title: "Xóa ca làm",
      message: `Xóa ca ${schedule.shift_name} của ${schedule.employee_name}?`,
      confirmText: "Xóa",
      cancelText: "Giữ lại",
      type: "warning",
    });
    if (!confirmed)
      return;
    try {
      await axios.delete(`${API_URL}/schedules/${schedule.schedule_id}`, {
        headers: authHeaders(),
      });
      setSelectedSchedule(null);
      fetchSchedules();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xóa ca làm");
    }
  };

  const openCreateShift = () => {
    setEditingShift(null);
    setShiftForm(emptyShiftForm);
    setShiftModalOpen(true);
  };

  const openEditShift = (shift) => {
    setEditingShift(shift);
    setShiftForm({
      shift_name: shift.shift_name || "",
      start_time: formatTime(shift.start_time),
      end_time: formatTime(shift.end_time),
      description: shift.description || "",
      color: shift.color || "#2563eb",
    });
    setShiftModalOpen(true);
  };

  const saveShift = async () => {
    if (!shiftForm.shift_name || !shiftForm.start_time || !shiftForm.end_time) {
      alert("Vui lòng nhập tên ca, giờ vào và giờ ra");
      return;
    }

    if (shiftForm.start_time === shiftForm.end_time) {
      alert("Giờ vào và giờ ra không được giống nhau");
      return;
    }

    if (!isHexColor(shiftForm.color)) {
      alert("Vui lòng nhập mã màu HEX hợp lệ, ví dụ #2563eb");
      return;
    }

    const conflictShift = shifts.find(
      (shift) =>
        String(shift.shift_id) !== String(editingShift?.shift_id || "") &&
        hasTimeOverlap(
          shiftForm.start_time,
          shiftForm.end_time,
          shift.start_time,
          shift.end_time,
        ),
    );

    if (conflictShift) {
      alert(
        `Không thể lưu ca vì bị trùng thời gian với "${conflictShift.shift_name}" (${formatTime(conflictShift.start_time)} - ${formatTime(conflictShift.end_time)})`,
      );
      return;
    }

    try {
      if (editingShift) {
        await axios.put(
          `${API_URL}/shifts/${editingShift.shift_id}`,
          shiftForm,
          { headers: authHeaders() },
        );
      } else {
        await axios.post(`${API_URL}/shifts`, shiftForm, {
          headers: authHeaders(),
        });
      }
      setShiftModalOpen(false);
      setEditingShift(null);
      fetchShifts();
      fetchSchedules();
    } catch (err) {
      alert(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể lưu ca làm",
      );
    }
  };

  const deleteShift = async (shift) => {
    const confirmed = await window.appConfirm?.({
      title: "Xóa loại ca",
      message: `Xóa ca "${shift.shift_name}"? Lịch làm liên quan cũng sẽ bị xóa.`,
      confirmText: "Xóa",
      cancelText: "Giữ lại",
      type: "warning",
    });
    if (!confirmed)
      return;
    try {
      await axios.delete(`${API_URL}/shifts/${shift.shift_id}`, {
        headers: authHeaders(),
      });
      fetchShifts();
      fetchSchedules();
    } catch (err) {
      alert(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể xóa ca",
      );
    }
  };

  const saveSettings = async () => {
    try {
      await axios.post(`${API_URL}/schedules/settings`, scheduleSettings, {
        headers: authHeaders(),
      });
      setSettingsOpen(false);
    } catch (err) {
      alert(err.response?.data?.message || "Không thể lưu cài đặt");
    }
  };

  const isEditingSelected = Boolean(
    selectedSchedule &&
    editingSchedule?.schedule_id === selectedSchedule.schedule_id &&
    !scheduleModalOpen,
  );
  const selectedShiftColor = isHexColor(shiftForm.color)
    ? shiftForm.color
    : "#2563eb";
  const dateRangeLabel =
    filterStartDate || filterEndDate
      ? `${filterStartDate ? formatDate(filterStartDate) : "Tất cả"} - ${filterEndDate ? formatDate(filterEndDate) : "Tất cả"}`
      : "Tất cả thời gian";

  const employeePicker = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setScheduleEmployeePickerOpen((open) => !open)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 text-left text-sm font-medium text-gray-900 outline-none transition hover:border-blue-500 focus:border-blue-600"
      >
        <span className="min-w-0 flex-1 truncate">
          {selectedScheduleFormEmployee?.name || "Chọn nhân viên"}
        </span>
        <UserIcon className="h-5 w-5 shrink-0 text-gray-400" />
      </button>
      {scheduleEmployeePickerOpen && (
        <div className="absolute left-0 top-12 z-40 w-full rounded-md border border-gray-200 bg-white p-2 shadow-xl">
          <div className="relative mb-2">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={scheduleEmployeeSearch}
              onChange={(event) =>
                setScheduleEmployeeSearch(event.target.value)
              }
              placeholder="Tìm tên, email, SĐT..."
              className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm font-medium text-gray-900 outline-none focus:border-blue-600"
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {filteredScheduleEmployees.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm font-medium text-gray-500">
                Không tìm thấy nhân viên
              </div>
            ) : (
              filteredScheduleEmployees.map((employee) => (
                <button
                  key={employee.employee_id}
                  type="button"
                  onClick={() => {
                    setScheduleForm({
                      ...scheduleForm,
                      employee_id: String(employee.employee_id),
                    });
                    setScheduleEmployeePickerOpen(false);
                    setScheduleEmployeeSearch("");
                  }}
                  className={`w-full rounded-md px-3 py-2 text-left transition ${
                    String(employee.employee_id) === scheduleForm.employee_id
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
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Typography
            variant="h4"
            className="font-bold tracking-tight text-gray-950"
          >
            Tạo lịch làm
          </Typography>
          <Typography className="mt-1 text-sm text-gray-600">
            Quản lý lịch làm thủ công, danh mục ca làm và tự động xếp lịch trong
            một màn hình.
          </Typography>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outlined"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 rounded-md border-gray-300 bg-white px-4 py-2.5 normal-case text-gray-900"
          >
            <AdjustmentsHorizontalIcon className="h-5 w-5" />
            Cài đặt
          </Button>
          <Button
            onClick={() => setOpenAutoScheduleModal(true)}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 normal-case"
          >
            <SparklesIcon className="h-5 w-5" />
            Tự động xếp
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Typography variant="h6" className="font-bold text-gray-950">
                Danh sách ca đã xếp
              </Typography>
              <Typography className="text-sm text-gray-500">
                {filteredSchedules.length} ca trong bộ lọc hiện tại
              </Typography>
            </div>
            <Button
              onClick={openCreateSchedule}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-950 p-0"
              aria-label="Thêm ca làm thủ công"
            >
              <PlusIcon className="text-green-500 h-5 w-5" />
            </Button>
          </div>

          <div className="space-y-3 border-b border-gray-100 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(160px,220px)_minmax(160px,220px)_minmax(260px,1fr)]">
              <Select
                value={viewMonth}
                label="Tháng"
                onChange={(value) => setViewMonth(value || "")}
              >
                <Option value="">Tất cả tháng</Option>
                {[...Array(12)].map((_, index) => (
                  <Option key={index + 1} value={String(index + 1)}>
                    Tháng {index + 1}
                  </Option>
                ))}
              </Select>
              <Select
                value={viewYear}
                label="Năm"
                onChange={(value) => setViewYear(value || "")}
              >
                <Option value="">Tất cả năm</Option>
                {[2024, 2025, 2026, 2027, 2028].map((year) => (
                  <Option key={year} value={String(year)}>
                    {year}
                  </Option>
                ))}
              </Select>
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm nhân viên, ca..."
                  className="h-10 w-full rounded-md border border-gray-300 bg-white pl-10 pr-3 text-sm font-medium text-gray-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDateRangeOpen((open) => !open)}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 text-left text-sm font-medium text-gray-900 outline-none transition hover:border-blue-500 focus:border-blue-600"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <CalendarDaysIcon className="h-5 w-5 shrink-0 text-gray-400" />
                    <span className="truncate">{dateRangeLabel}</span>
                  </span>
                </button>
                {dateRangeOpen && (
                  <div className="absolute left-0 top-12 z-30 w-full min-w-[280px] rounded-md border border-gray-200 bg-white p-3 shadow-xl lg:min-w-[580px]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        type="date"
                        label="Bắt đầu"
                        value={filterStartDate}
                        onChange={(event) => {
                          const nextStartDate = event.target.value;
                          setFilterStartDate(nextStartDate);
                          if (
                            filterEndDate &&
                            nextStartDate &&
                            filterEndDate < nextStartDate
                          ) {
                            setFilterEndDate(nextStartDate);
                          }
                        }}
                      />
                      <Input
                        type="date"
                        label="Kết thúc"
                        value={filterEndDate}
                        min={filterStartDate || undefined}
                        onChange={(event) => {
                          const nextEndDate = event.target.value;
                          setFilterEndDate(
                            filterStartDate &&
                              nextEndDate &&
                              nextEndDate < filterStartDate
                              ? filterStartDate
                              : nextEndDate,
                          );
                        }}
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        variant="text"
                        size="sm"
                        onClick={() => {
                          setFilterStartDate("");
                          setFilterEndDate("");
                        }}
                        className="rounded-md normal-case text-gray-700"
                      >
                        Xóa
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setDateRangeOpen(false)}
                        className="rounded-md bg-green-600 normal-case text-white"
                      >
                        Xong
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <Select
                value={filterShift}
                label="Ca làm"
                onChange={(value) => setFilterShift(value || "")}
              >
                <Option value="">Tất cả ca</Option>
                {shifts.map((shift) => (
                  <Option key={shift.shift_id} value={String(shift.shift_id)}>
                    {shift.shift_name}
                  </Option>
                ))}
              </Select>
              <Select
                value={filterStatus}
                label="Trạng thái"
                onChange={(value) => setFilterStatus(value || "")}
              >
                <Option value="">Tất cả</Option>
                <Option value="PUBLISHED">Đã công bố</Option>
                <Option value="DRAFT">Chưa công bố</Option>
              </Select>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner className="h-8 w-8 text-blue-600" />
              </div>
            ) : pagedSchedules.length === 0 ? (
              <div className="p-10 text-center text-sm font-medium text-gray-500">
                Không có ca làm phù hợp
              </div>
            ) : (
              pagedSchedules.map((schedule) => (
                <button
                  key={schedule.schedule_id}
                  type="button"
                  onClick={() => setSelectedSchedule(schedule)}
                  className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-gray-50 lg:grid-cols-[120px_1fr_1fr_120px_130px]"
                >
                  <div>
                    <div className="text-sm font-bold text-gray-950">
                      {formatDate(schedule.work_date)}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-gray-500">
                      {schedule.work_date}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: schedule.color || "#2563eb" }}
                      />
                      <span className="truncate text-sm font-bold text-gray-950">
                        {schedule.shift_name}
                      </span>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800">
                    <UserIcon className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="truncate">
                      {schedule.employee_name || "-"}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-700">
                    <div>{formatTime(schedule.start_time)}</div>
                    <div className="mt-1 text-gray-500">
                      {formatTime(schedule.end_time)}
                    </div>
                  </div>
                  <div>
                    <span
                      className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusBadge(schedule.status)}`}
                    >
                      {statusText(schedule.status)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-gray-500">
              Trang {page}/{totalPages}
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
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                className="rounded-md normal-case"
              >
                Sau
              </Button>
            </div>
          </div>
        </Card>

        <Card className="h-fit rounded-md border border-gray-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <Typography variant="h6" className="font-bold text-gray-950">
                Quản lý ca làm
              </Typography>
              <Typography className="text-sm text-gray-500">
                {shifts.length} ca đang tồn tại
              </Typography>
            </div>
            <Button
              onClick={openCreateShift}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-950 p-0"
              aria-label="Thêm ca"
            >
              <PlusIcon className="text-green-500 h-5 w-5" />
            </Button>
          </div>

          <div className="max-h-[calc(100vh-220px)] space-y-3 overflow-y-auto pr-1">
            {shifts.map((shift) => (
              <div
                key={shift.shift_id}
                className="rounded-md border border-gray-200 p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: shift.color || "#2563eb" }}
                      />
                      <div className="truncate text-sm font-bold text-gray-950">
                        {shift.shift_name}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-gray-500">
                      <ClockIcon className="h-4 w-4" />
                      {formatTime(shift.start_time)} -{" "}
                      {formatTime(shift.end_time)}
                    </div>
                    {shift.description && (
                      <div className="mt-2 text-xs font-medium text-gray-500">
                        {shift.description}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => openEditShift(shift)}
                      className="rounded-md p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-700"
                      aria-label="Sửa ca"
                    >
                      <PencilSquareIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteShift(shift)}
                      className="rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-700"
                      aria-label="Xóa ca"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {selectedSchedule && (
        <Dialog
          open={Boolean(selectedSchedule)}
          handler={closeSelectedSchedule}
          size="md"
        >
          <DialogHeader className="border-b border-gray-100">
            <div className="flex w-full items-center justify-between gap-3">
              <div>
                <Typography variant="h5" className="font-bold text-gray-950">
                  {selectedSchedule.shift_name}
                </Typography>
                <Typography className="mt-1 text-sm text-gray-500">
                  {formatDate(selectedSchedule.work_date)}
                </Typography>
              </div>
              <button
                type="button"
                onClick={closeSelectedSchedule}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>
          {isEditingSelected ? (
            <DialogBody className="space-y-4">
              {employeePicker}
              <Select
                label="Ca làm"
                value={scheduleForm.shift_id}
                onChange={(value) =>
                  setScheduleForm({ ...scheduleForm, shift_id: value || "" })
                }
              >
                {shifts.map((shift) => (
                  <Option key={shift.shift_id} value={String(shift.shift_id)}>
                    {shift.shift_name} ({formatTime(shift.start_time)} -{" "}
                    {formatTime(shift.end_time)})
                  </Option>
                ))}
              </Select>
              <Input
                type="date"
                label="Ngày làm"
                value={scheduleForm.work_date}
                onChange={(event) =>
                  setScheduleForm({
                    ...scheduleForm,
                    work_date: event.target.value,
                  })
                }
              />
              <Select
                label="Trạng thái"
                value={scheduleForm.status}
                onChange={(value) =>
                  setScheduleForm({
                    ...scheduleForm,
                    status: value || "PUBLISHED",
                  })
                }
              >
                <Option value="PUBLISHED">Đã công bố</Option>
                <Option value="DRAFT">Chưa công bố</Option>
              </Select>
            </DialogBody>
          ) : (
            <DialogBody className="space-y-3">
              {[
                ["Nhân viên", selectedSchedule.employee_name || "-"],
                ["Giờ vào ca", formatTime(selectedSchedule.start_time)],
                ["Giờ ra ca", formatTime(selectedSchedule.end_time)],
                ["Trạng thái", statusText(selectedSchedule.status)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md bg-gray-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    {label}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-950">
                    {value}
                  </div>
                </div>
              ))}
            </DialogBody>
          )}
          {isEditingSelected ? (
            <DialogFooter className="gap-2 border-t border-gray-100">
              <Button
                variant="text"
                onClick={() => setEditingSchedule(null)}
                className="rounded-md normal-case text-gray-700"
              >
                Hủy
              </Button>
              <Button
                onClick={saveSchedule}
                className="rounded-md bg-gray-950 normal-case"
              >
                Lưu thay đổi
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter className="gap-2 border-t border-gray-100">
              <Button
                variant="outlined"
                onClick={() => startInlineEditSchedule(selectedSchedule)}
                className="flex items-center gap-2 rounded-md normal-case"
              >
                <PencilSquareIcon className="h-4 w-4" />
                Sửa
              </Button>
              <Button
                variant="outlined"
                onClick={() => deleteSchedule(selectedSchedule)}
                className="flex items-center gap-2 rounded-md border-red-200 normal-case text-red-700"
              >
                <TrashIcon className="h-4 w-4" />
                Xóa
              </Button>
            </DialogFooter>
          )}
        </Dialog>
      )}

      <Dialog
        open={scheduleModalOpen}
        handler={() => setScheduleModalOpen(false)}
        size="md"
      >
        <DialogHeader className="border-b border-gray-100">
          {editingSchedule ? "Sửa ca làm" : "Thêm ca làm thủ công"}
        </DialogHeader>
        <DialogBody className="space-y-4">
          {employeePicker}
          <Select
            label="Ca làm"
            value={scheduleForm.shift_id}
            onChange={(value) =>
              setScheduleForm({ ...scheduleForm, shift_id: value || "" })
            }
          >
            {shifts.map((shift) => (
              <Option key={shift.shift_id} value={String(shift.shift_id)}>
                {shift.shift_name} ({formatTime(shift.start_time)} -{" "}
                {formatTime(shift.end_time)})
              </Option>
            ))}
          </Select>
          <Input
            type="date"
            label="Ngày làm"
            value={scheduleForm.work_date}
            onChange={(event) =>
              setScheduleForm({
                ...scheduleForm,
                work_date: event.target.value,
              })
            }
          />
          <Select
            label="Trạng thái"
            value={scheduleForm.status}
            onChange={(value) =>
              setScheduleForm({ ...scheduleForm, status: value || "PUBLISHED" })
            }
          >
            <Option value="PUBLISHED">Đã công bố</Option>
            <Option value="DRAFT">Chưa công bố</Option>
          </Select>
        </DialogBody>
        <DialogFooter className="gap-2 border-t border-gray-100">
          <Button
            variant="text"
            onClick={() => setScheduleModalOpen(false)}
            className="rounded-md normal-case text-gray-700"
          >
            Hủy
          </Button>
          <Button
            onClick={saveSchedule}
            className="rounded-md bg-gray-950 normal-case"
          >
            Lưu ca làm
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={shiftModalOpen}
        handler={() => setShiftModalOpen(false)}
        size="md"
      >
        <DialogHeader className="border-b border-gray-100">
          {editingShift ? "Sửa loại ca" : "Thêm loại ca"}
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Input
            label="Tên ca"
            value={shiftForm.shift_name}
            onChange={(event) =>
              setShiftForm({ ...shiftForm, shift_name: event.target.value })
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="time"
              label="Giờ vào ca"
              value={shiftForm.start_time}
              onChange={(event) =>
                setShiftForm({ ...shiftForm, start_time: event.target.value })
              }
            />
            <Input
              type="time"
              label="Giờ ra ca"
              value={shiftForm.end_time}
              onChange={(event) =>
                setShiftForm({ ...shiftForm, end_time: event.target.value })
              }
            />
          </div>
          <Input
            label="Mô tả"
            value={shiftForm.description}
            onChange={(event) =>
              setShiftForm({ ...shiftForm, description: event.target.value })
            }
          />
          <div>
            <Typography className="mb-2 text-sm font-bold text-gray-700">
              Màu ca làm
            </Typography>
            <div className="grid gap-3 sm:grid-cols-[88px_1fr] sm:items-end">
              <label className="flex h-10 cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white p-1">
                <input
                  type="color"
                  value={selectedShiftColor}
                  onChange={(event) =>
                    setShiftForm({ ...shiftForm, color: event.target.value })
                  }
                  className="h-full w-full cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label="Chọn màu ca làm"
                />
              </label>
              <Input
                label="Mã màu HEX"
                value={shiftForm.color}
                onChange={(event) =>
                  setShiftForm({ ...shiftForm, color: event.target.value })
                }
              />
            </div>
            <div
              className="mt-3 rounded-md border p-3 text-sm font-semibold"
              style={{
                borderColor: selectedShiftColor,
                backgroundColor: `${selectedShiftColor}18`,
                color: selectedShiftColor,
              }}
            >
              {shiftForm.shift_name || "Xem trước màu ca làm"}
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="gap-2 border-t border-gray-100">
          <Button
            variant="text"
            onClick={() => setShiftModalOpen(false)}
            className="rounded-md normal-case text-gray-700"
          >
            Hủy
          </Button>
          <Button
            onClick={saveShift}
            className="rounded-md bg-gray-950 normal-case"
          >
            Lưu loại ca
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={settingsOpen}
        handler={() => setSettingsOpen(false)}
        size="lg"
      >
        <DialogHeader className="border-b border-gray-100">
          Cài đặt xếp lịch
        </DialogHeader>
        <DialogBody className="space-y-3">
          {settingRows.map((item) => (
            <div
              key={item.key}
              className="rounded-md border border-gray-200 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Typography className="truncate text-sm font-bold text-gray-950">
                    {item.title}
                  </Typography>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedNote(expandedNote === item.key ? "" : item.key)
                    }
                    className="text-gray-400 hover:text-blue-700"
                  >
                    <QuestionMarkCircleIcon className="h-5 w-5" />
                  </button>
                </div>
                <Switch
                  checked={Boolean(scheduleSettings[item.key])}
                  onChange={() =>
                    setScheduleSettings((prev) => ({
                      ...prev,
                      [item.key]: !prev[item.key],
                    }))
                  }
                />
              </div>
              {expandedNote === item.key && (
                <div className="mt-3 rounded-md bg-blue-50 p-3 text-sm font-medium text-blue-800">
                  {item.note}
                </div>
              )}
            </div>
          ))}
        </DialogBody>
        <DialogFooter className="gap-2 border-t border-gray-100">
          <Button
            variant="text"
            onClick={() => setSettingsOpen(false)}
            className="rounded-md normal-case text-gray-700"
          >
            Đóng
          </Button>
          <Button
            onClick={saveSettings}
            className="rounded-md bg-gray-950 normal-case"
          >
            Lưu cài đặt
          </Button>
        </DialogFooter>
      </Dialog>

      <AutoScheduleModal
        open={openAutoScheduleModal}
        onClose={() => setOpenAutoScheduleModal(false)}
        scheduleSettings={scheduleSettings}
        onGenerate={(result) => {
          if (result?.month && result?.year) {
            setViewMonth(String(result.month));
            setViewYear(String(result.year));
            fetchSchedules(String(result.month), String(result.year));
          } else {
            fetchSchedules();
          }
          setOpenAutoScheduleModal(false);
        }}
      />
    </div>
  );
}
