import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  CalendarDaysIcon,
  ClockIcon,
  PaperAirplaneIcon,
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { getRole } from "../utils/auth";
import { API_URL } from "../services/api";

const statusText = {
  PENDING_TARGET: "Chờ người nhận xác nhận",
  APPROVED: "Đã đổi ca",
  REJECTED_BY_TARGET: "Người nhận từ chối",
  CANCELLED_BY_ADMIN: "Admin đã hủy",
  REVERTED_BY_ADMIN: "Admin đã hoàn tác",
};

const shiftPalette = [
  { background: "#eff6ff", text: "#1e40af", dot: "#3b82f6" },
  { background: "#ecfdf5", text: "#065f46", dot: "#10b981" },
  { background: "#f5f3ff", text: "#5b21b6", dot: "#8b5cf6" },
  { background: "#fffbeb", text: "#92400e", dot: "#f59e0b" },
  { background: "#ecfeff", text: "#155e75", dot: "#06b6d4" },
  { background: "#fff1f2", text: "#9f1239", dot: "#f43f5e" },
];

const notePalette = [
  "#2563eb",
  "#0891b2",
  "#059669",
  "#16a34a",
  "#ca8a04",
  "#f97316",
  "#dc2626",
  "#e11d48",
  "#7c3aed",
  "#4f46e5",
  "#475569",
  "#0f766e",
];

const namedShiftColors = {
  blue: "#2563eb",
  green: "#059669",
  emerald: "#059669",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#ca8a04",
  red: "#dc2626",
  rose: "#e11d48",
  purple: "#7c3aed",
  violet: "#7c3aed",
  cyan: "#0891b2",
  sky: "#0284c7",
  gray: "#4b5563",
  slate: "#475569",
};

const viewOptions = [
  { value: "month", label: "Tháng" },
  { value: "week", label: "Tuần" },
  { value: "day", label: "Ngày" },
];

const weekdayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatDate(date) {
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(value) {
  return value?.slice(0, 5) || "--:--";
}

function shiftMinutes(schedule) {
  const [hour = 0, minute = 0] = String(schedule.start_time || "00:00")
    .split(":")
    .map(Number);
  return hour * 60 + minute;
}

function scheduleStart(schedule) {
  return new Date(`${schedule.work_date}T${schedule.start_time || "00:00:00"}`);
}

function normalizeColor(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return namedShiftColors[raw] || null;
}

function hexToRgb(hex) {
  const normalized = normalizeColor(hex);
  if (!normalized) return null;

  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function shiftTone(schedule) {
  const color = normalizeColor(schedule.color);
  const rgb = hexToRgb(color);

  if (color && rgb) {
    return {
      background: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
      text: color,
      dot: color,
    };
  }

  const index = Math.abs(Number(schedule.shift_id || 0)) % shiftPalette.length;
  return shiftPalette[index];
}

function toneFromHex(value, fallback = "#2563eb") {
  const color = normalizeColor(value) || fallback;
  const rgb = hexToRgb(color);
  if (!rgb) {
    return { background: "#eff6ff", text: fallback, dot: fallback };
  }
  return {
    background: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`,
    text: color,
    dot: color,
  };
}

function formatMoneyCompact(value) {
  const number = Number(value || 0);
  if (!number) return "";
  const abs = Math.abs(number);
  if (abs >= 1000000) return `${number > 0 ? "+" : "-"}${Math.round(abs / 100000) / 10}tr`;
  if (abs >= 1000) return `${number > 0 ? "+" : "-"}${Math.round(abs / 1000)}k`;
  return `${number > 0 ? "+" : "-"}${abs.toLocaleString("vi-VN")}đ`;
}

function borderClass(schedule, attendanceByScheduleId) {
  const now = new Date();
  if (now < scheduleStart(schedule)) return "border-gray-300";

  const attendance = attendanceByScheduleId.get(Number(schedule.schedule_id));
  if (attendance?.check_in) return "border-green-500";
  return "border-orange-500";
}

function borderLabel(schedule, attendanceByScheduleId) {
  const now = new Date();
  if (now < scheduleStart(schedule)) return "Ca chưa bắt đầu";

  const attendance = attendanceByScheduleId.get(Number(schedule.schedule_id));
  if (attendance?.check_in) return "Đã chấm công";
  return "Chưa chấm công";
}

function groupSchedulesByDate(schedules) {
  return schedules.reduce((map, schedule) => {
    const current = map.get(schedule.work_date) || [];
    current.push(schedule);
    current.sort((a, b) => shiftMinutes(a) - shiftMinutes(b));
    map.set(schedule.work_date, current);
    return map;
  }, new Map());
}

function monthCells(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function weekCells(date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function periodTitle(viewMode, cursorDate) {
  if (viewMode === "day") return formatDate(cursorDate);
  if (viewMode === "week") {
    const start = startOfWeek(cursorDate);
    const end = addDays(start, 6);
    return `${formatDate(start)} - ${formatDate(end)}`;
  }

  return cursorDate.toLocaleDateString("vi-VN", {
    month: "long",
    year: "numeric",
  });
}

function formatShift(schedule) {
  if (!schedule) return "-";
  return `${schedule.employee_name} - ${schedule.shift_name} (${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)})`;
}

function ScheduleTag({
  schedule,
  viewMode,
  role,
  currentEmployeeId,
  attendanceByScheduleId,
  adjustmentsByEmployeeDate = new Map(),
  onSelectSwap,
}) {
  const tone = shiftTone(schedule);
  const border = borderClass(schedule, attendanceByScheduleId);
  const isOtherEmployee =
    role === "EMPLOYEE" &&
    currentEmployeeId &&
    Number(schedule.employee_id) !== Number(currentEmployeeId);
  const label =
    viewMode === "month"
      ? schedule.employee_name
      : viewMode === "week"
        ? `${schedule.employee_name} · ${schedule.shift_name}`
        : `${schedule.employee_name} · ${schedule.shift_name} · ${formatTime(schedule.start_time)}-${formatTime(schedule.end_time)}`;
  const adjustment =
    adjustmentsByEmployeeDate.get(`${schedule.employee_id}-${schedule.work_date}`) || 0;

  return (
    <button
      type="button"
      onClick={() => {
        if (isOtherEmployee) onSelectSwap(schedule);
      }}
      className={`group relative z-0 w-full rounded-md border-l-4 ${border} px-2 py-1.5 text-left text-[11px] font-bold shadow-sm transition hover:z-[1000] hover:-translate-y-0.5 hover:shadow-md ${
        isOtherEmployee ? "cursor-pointer" : "cursor-default"
      }`}
      style={{ backgroundColor: tone.background, color: tone.text }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: tone.dot }}
        />
        <span className="min-w-0 truncate">{label}</span>
        {adjustment !== 0 && (
          <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${adjustment > 0 ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
            {formatMoneyCompact(adjustment)}
          </span>
        )}
      </span>

      {role === "ADMIN" && (
        <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-[999] hidden w-64 rounded-md border border-gray-200 bg-white p-3 text-xs font-medium text-gray-700 shadow-2xl ring-1 ring-gray-950/5 group-hover:block">
          <span className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 border-b border-r border-gray-200 bg-white" />
          <span className="block font-bold text-gray-950">{schedule.employee_name}</span>
          <span className="mt-1 block">{schedule.shift_name}</span>
          <span className="mt-1 block">
            {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
          </span>
          <span className="mt-1 block text-gray-500">
            {borderLabel(schedule, attendanceByScheduleId)}
          </span>
          {adjustment !== 0 && (
            <span className={`mt-2 block font-bold ${adjustment > 0 ? "text-emerald-700" : "text-red-700"}`}>
              Thưởng/phạt: {formatMoneyCompact(adjustment)}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function NoteTag({ note }) {
  const tone = toneFromHex(note.color);

  return (
    <button
      type="button"
      title={note.title}
      className="group relative z-0 w-full rounded-md px-2 py-1.5 text-left text-[11px] font-black shadow-sm transition hover:z-[1000] hover:-translate-y-0.5 hover:shadow-md focus:z-[1000]"
      style={{ backgroundColor: tone.background, color: tone.text }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} />
        <span className="min-w-0 truncate">{note.title}</span>
      </span>
      <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-[999] hidden w-64 rounded-md border border-gray-200 bg-white p-3 text-xs font-medium text-gray-700 shadow-2xl ring-1 ring-gray-950/5 group-hover:block group-focus:block">
        <span className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 border-b border-r border-gray-200 bg-white" />
        <span className="block font-bold text-gray-950">Thông báo</span>
        <span className="mt-1 block">{note.title}</span>
      </span>
    </button>
  );
}

function EmployeeSwapTab({ initialTarget, onClearInitialTarget }) {
  const [options, setOptions] = useState({
    current_employee_id: null,
    employees: [],
    schedules: [],
  });
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({
    requester_work_date: "",
    requester_schedule_id: "",
    target_employee_id: "",
    target_work_date: "",
    target_schedule_id: "",
    requester_note: "",
  });
  const [loading, setLoading] = useState(false);
  const hasInitialTarget = Boolean(initialTarget?.schedule_id);

  const fetchSwapData = useCallback(async () => {
    const [optionsRes, requestsRes] = await Promise.all([
      axios.get(`${API_URL}/shift-swaps/options`, {
        headers: authHeaders(),
      }),
      axios.get(`${API_URL}/shift-swaps`, {
        headers: authHeaders(),
      }),
    ]);

    setOptions(optionsRes.data);
    setRequests(requestsRes.data);
  }, []);

  useEffect(() => {
    fetchSwapData().catch((err) => {
      console.error("[EmployeeSwapTab] Load error:", err);
    });
  }, [fetchSwapData]);

  useEffect(() => {
    if (!initialTarget?.schedule_id) return;

    const target =
      options.schedules.find(
        (schedule) =>
          Number(schedule.schedule_id) === Number(initialTarget.schedule_id),
      ) || initialTarget;

    setForm((current) => ({
      ...current,
      target_employee_id: String(target.employee_id || ""),
      target_work_date: target.work_date || "",
      target_schedule_id: String(target.schedule_id || ""),
    }));
  }, [initialTarget, options.schedules]);

  const mySchedules = useMemo(() => {
    return options.schedules.filter(
      (schedule) =>
        Number(schedule.employee_id) === Number(options.current_employee_id),
    );
  }, [options.current_employee_id, options.schedules]);

  const requesterDates = useMemo(() => {
    return Array.from(new Set(mySchedules.map((schedule) => schedule.work_date))).sort();
  }, [mySchedules]);

  const mySchedulesForDate = useMemo(() => {
    return mySchedules.filter(
      (schedule) => schedule.work_date === form.requester_work_date,
    );
  }, [form.requester_work_date, mySchedules]);

  const targetDates = useMemo(() => {
    const dates = Array.from(
      new Set(
        options.schedules
          .filter(
            (schedule) =>
              Number(schedule.employee_id) === Number(form.target_employee_id),
          )
          .map((schedule) => schedule.work_date),
      ),
    );

    if (
      initialTarget?.work_date &&
      Number(initialTarget.employee_id) === Number(form.target_employee_id) &&
      !dates.includes(initialTarget.work_date)
    ) {
      dates.push(initialTarget.work_date);
    }

    return dates.sort();
  }, [form.target_employee_id, initialTarget, options.schedules]);

  const targetSchedules = useMemo(() => {
    const schedulesForDate = options.schedules.filter(
      (schedule) =>
        schedule.work_date === form.target_work_date &&
        Number(schedule.employee_id) === Number(form.target_employee_id),
    );

    if (
      initialTarget?.schedule_id &&
      initialTarget.work_date === form.target_work_date &&
      Number(initialTarget.employee_id) === Number(form.target_employee_id) &&
      !schedulesForDate.some(
        (schedule) =>
          Number(schedule.schedule_id) === Number(initialTarget.schedule_id),
      )
    ) {
      schedulesForDate.push(initialTarget);
    }

    return schedulesForDate;
  }, [form.target_employee_id, form.target_work_date, initialTarget, options.schedules]);

  const sentRequests = useMemo(() => {
    return requests.filter(
      (request) =>
        Number(request.requester_employee_id) ===
        Number(options.current_employee_id),
    );
  }, [options.current_employee_id, requests]);

  const submitRequest = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      await axios.post(
        `${API_URL}/shift-swaps`,
        {
          requester_schedule_id: form.requester_schedule_id,
          target_schedule_id: form.target_schedule_id,
          target_employee_id: form.target_employee_id,
          requester_note: form.requester_note,
        },
        { headers: authHeaders() },
      );

      alert("Đã gửi yêu cầu đổi ca");
      setForm({
        requester_work_date: "",
        requester_schedule_id: "",
        target_employee_id: "",
        target_work_date: "",
        target_schedule_id: "",
        requester_note: "",
      });
      onClearInitialTarget?.();
      fetchSwapData();
      window.dispatchEvent(new Event("notification-count-changed"));
    } catch (err) {
      alert(err.response?.data?.message || "Không thể gửi yêu cầu đổi ca");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <form onSubmit={submitRequest} className="space-y-3 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-gray-950">Gửi yêu cầu đổi ca</h2>

        {[
          {
            label: "Ngày ca của bạn",
            value: form.requester_work_date,
            disabled: false,
            options: requesterDates.map((date) => ({ value: date, label: date })),
            onChange: (value) =>
              setForm({
                ...form,
                requester_work_date: value,
                requester_schedule_id: "",
              }),
          },
          {
            label: "Ca của bạn",
            value: form.requester_schedule_id,
            disabled: !form.requester_work_date,
            options: mySchedulesForDate.map((schedule) => ({
              value: schedule.schedule_id,
              label: formatShift(schedule),
            })),
            onChange: (value) => setForm({ ...form, requester_schedule_id: value }),
          },
          {
            label: "Nhân viên cần đổi",
            value: form.target_employee_id,
            disabled: hasInitialTarget,
            options: options.employees.map((employee) => ({
              value: employee.employee_id,
              label: employee.name,
            })),
            onChange: (value) =>
              setForm({
                ...form,
                target_employee_id: value,
                target_work_date: "",
                target_schedule_id: "",
              }),
          },
          {
            label: "Ngày ca của người được gửi",
            value: form.target_work_date,
            disabled: hasInitialTarget || !form.target_employee_id,
            options: targetDates.map((date) => ({ value: date, label: date })),
            onChange: (value) =>
              setForm({
                ...form,
                target_work_date: value,
                target_schedule_id: "",
              }),
          },
          {
            label: "Ca của người được gửi",
            value: form.target_schedule_id,
            disabled: hasInitialTarget || !form.target_work_date,
            options: targetSchedules.map((schedule) => ({
              value: schedule.schedule_id,
              label: formatShift(schedule),
            })),
            onChange: (value) => setForm({ ...form, target_schedule_id: value }),
          },
        ].map((field) => (
          <label key={field.label} className="block text-sm font-semibold text-gray-700">
            {field.label}
            <select
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              disabled={field.disabled}
              className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-medium outline-none transition focus:border-blue-600 disabled:bg-gray-100"
              required
            >
              <option value="">Chọn</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        <label className="block text-sm font-semibold text-gray-700">
          Ghi chú
          <textarea
            value={form.requester_note}
            onChange={(event) =>
              setForm({ ...form, requester_note: event.target.value })
            }
            className="mt-1 w-full rounded-md border border-gray-300 p-3 text-sm outline-none transition focus:border-blue-600"
            rows={3}
            placeholder="Lý do đổi ca..."
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          Gửi yêu cầu
        </button>
      </form>

      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-gray-950">Lịch sử yêu cầu đã gửi</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="p-3">Ngày gửi</th>
                <th className="p-3">Người gửi</th>
                <th className="p-3">Người nhận</th>
                <th className="p-3">Ca của bạn</th>
                <th className="p-3">Ca muốn nhận</th>
                <th className="p-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {sentRequests.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-gray-500" colSpan={6}>
                    Chưa có yêu cầu đổi ca
                  </td>
                </tr>
              ) : (
                sentRequests.map((request) => (
                  <tr key={request.swap_request_id} className="border-b">
                    <td className="p-3">{new Date(request.created_at).toLocaleString("vi-VN")}</td>
                    <td className="p-3">{request.requester_employee_name}</td>
                    <td className="p-3">{request.target_employee_name}</td>
                    <td className="p-3">
                      {request.requester_work_date} - {request.requester_shift_name}
                    </td>
                    <td className="p-3">
                      {request.target_work_date} - {request.target_shift_name}
                    </td>
                    <td className="p-3 font-semibold">
                      {statusText[request.status] || request.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ShiftsCalendar() {
  const role = getRole();
  const [schedules, setSchedules] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [notes, setNotes] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [activeTab, setActiveTab] = useState("calendar");
  const [viewMode, setViewMode] = useState("month");
  const [cursorDate, setCursorDate] = useState(new Date());
  const [currentEmployeeId, setCurrentEmployeeId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [swapCandidate, setSwapCandidate] = useState(null);
  const [selectedSwapTarget, setSelectedSwapTarget] = useState(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteForm, setNoteForm] = useState({
    title: "",
    dates: [],
    draftDate: "",
    color: notePalette[0],
  });

  const range = useMemo(() => {
    if (viewMode === "day") {
      const key = dateKey(cursorDate);
      return { startDate: key, endDate: key };
    }

    if (viewMode === "week") {
      const start = startOfWeek(cursorDate);
      return { startDate: dateKey(start), endDate: dateKey(addDays(start, 6)) };
    }

    const start = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
    return { startDate: dateKey(start), endDate: dateKey(endOfMonth(cursorDate)) };
  }, [cursorDate, viewMode]);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      const month = cursorDate.getMonth() + 1;
      const year = cursorDate.getFullYear();
      const [scheduleRes, attendanceRes, notesRes, adjustmentsRes] = await Promise.allSettled([
        axios.get(`${API_URL}/schedules/current?month=${month}&year=${year}&scope=all`, {
          headers: authHeaders(),
        }),
        axios.get(`${API_URL}/attendance/history`, {
          params: range,
          headers: authHeaders(),
        }),
        axios.get(`${API_URL}/schedules/notes`, {
          params: range,
          headers: authHeaders(),
        }),
        axios.get(`${API_URL}/payroll/adjustments`, {
          params: range,
          headers: authHeaders(),
        }),
      ]);

      setSchedules(scheduleRes.status === "fulfilled" ? scheduleRes.value.data || [] : []);
      setAttendanceRecords(
        attendanceRes.status === "fulfilled"
          ? attendanceRes.value.data?.records || []
          : [],
      );
      setNotes(notesRes.status === "fulfilled" ? notesRes.value.data || [] : []);
      setAdjustments(adjustmentsRes.status === "fulfilled" ? adjustmentsRes.value.data || [] : []);
    } catch (err) {
      console.error("[ShiftsCalendar] Load error:", err);
      setSchedules([]);
      setAttendanceRecords([]);
      setNotes([]);
      setAdjustments([]);
    } finally {
      setLoading(false);
    }
  }, [cursorDate, range]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  useEffect(() => {
    if (role !== "EMPLOYEE") return;

    axios
      .get(`${API_URL}/shift-swaps/options`, { headers: authHeaders() })
      .then((res) => setCurrentEmployeeId(res.data?.current_employee_id || null))
      .catch(() => setCurrentEmployeeId(null));
  }, [role]);

  const schedulesByDate = useMemo(() => groupSchedulesByDate(schedules), [schedules]);
  const notesByDate = useMemo(() => {
    return notes.reduce((map, note) => {
      const current = map.get(note.work_date) || [];
      current.push(note);
      map.set(note.work_date, current);
      return map;
    }, new Map());
  }, [notes]);
  const adjustmentsByEmployeeDate = useMemo(() => {
    return adjustments.reduce((map, item) => {
      const key = `${item.employee_id}-${item.work_date}`;
      const signed = item.type === "PENALTY" ? -Number(item.amount || 0) : Number(item.amount || 0);
      map.set(key, (map.get(key) || 0) + signed);
      return map;
    }, new Map());
  }, [adjustments]);
  const attendanceByScheduleId = useMemo(() => {
    return new Map(
      attendanceRecords.map((record) => [Number(record.schedule_id), record]),
    );
  }, [attendanceRecords]);

  const visibleDates = useMemo(() => {
    if (viewMode === "day") return [cursorDate];
    if (viewMode === "week") return weekCells(cursorDate);
    return monthCells(cursorDate);
  }, [cursorDate, viewMode]);

  const visibleSchedules = useMemo(() => {
    const start = new Date(`${range.startDate}T00:00:00`);
    const end = new Date(`${range.endDate}T23:59:59`);
    return schedules
      .filter((schedule) => {
        const date = new Date(`${schedule.work_date}T00:00:00`);
        return date >= start && date <= end;
      })
      .sort((a, b) => scheduleStart(a) - scheduleStart(b));
  }, [range, schedules]);

  const movePeriod = (direction) => {
    if (viewMode === "month") {
      setCursorDate((current) => addMonths(current, direction));
      return;
    }

    if (viewMode === "week") {
      setCursorDate((current) => addDays(current, direction * 7));
      return;
    }

    setCursorDate((current) => addDays(current, direction));
  };

  const addNoteDate = () => {
    if (!noteForm.draftDate || noteForm.dates.includes(noteForm.draftDate)) return;
    setNoteForm((current) => ({
      ...current,
      dates: [...current.dates, current.draftDate].sort(),
      draftDate: "",
    }));
  };

  const submitScheduleNote = async (event) => {
    event.preventDefault();
    const dates = [...new Set([...noteForm.dates, noteForm.draftDate].filter(Boolean))].sort();
    try {
      await axios.post(
        `${API_URL}/schedules/notes`,
        { title: noteForm.title, dates, color: noteForm.color },
        { headers: authHeaders() },
      );
      setNoteModalOpen(false);
      setNoteForm({ title: "", dates: [], draftDate: "", color: notePalette[0] });
      window.dispatchEvent(new Event("notification-count-changed"));
      window.appPopup?.({ type: "success", title: "Đã gửi thông báo", message: `Đã gắn tag cho ${dates.length} ngày.` });
      fetchSchedules();
    } catch (err) {
      window.appPopup?.({ type: "error", title: "Không thể gửi thông báo", message: err.response?.data?.message || "Vui lòng thử lại." });
    }
  };

  const renderDayCell = (date) => {
    const key = dateKey(date);
    const items = schedulesByDate.get(key) || [];
    const dayNotes = notesByDate.get(key) || [];
    const isCurrentMonth = date.getMonth() === cursorDate.getMonth();
    const isToday = key === dateKey(new Date());

    return (
      <div
        key={key}
        className={`relative z-0 min-h-[132px] overflow-visible rounded-md border border-gray-200 bg-white p-2 hover:z-[900] ${
          viewMode === "month" && !isCurrentMonth ? "bg-gray-50 text-gray-400" : ""
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${
              isToday ? "bg-gray-950 text-white" : "text-gray-700"
            }`}
          >
            {date.getDate()}
          </span>
          {viewMode !== "month" && (
            <span className="text-xs font-semibold text-gray-400">
              {date.toLocaleDateString("vi-VN", { weekday: "short" })}
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          {dayNotes.map((note) => (
            <NoteTag key={note.note_id} note={note} />
          ))}
          {items.length === 0 && dayNotes.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 py-3 text-center text-[11px] font-semibold text-gray-400">
              Trống
            </div>
          ) : (
            items.map((schedule) => (
              <ScheduleTag
                key={schedule.schedule_id}
                schedule={schedule}
                viewMode={viewMode}
                role={role}
                currentEmployeeId={currentEmployeeId}
                attendanceByScheduleId={attendanceByScheduleId}
                adjustmentsByEmployeeDate={adjustmentsByEmployeeDate}
                onSelectSwap={setSwapCandidate}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-950 md:text-2xl">
              Lịch làm việc
            </h1>
            <p className="mt-1 text-sm font-medium text-gray-500">
              Xem lịch chung theo ngày, tuần hoặc tháng.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {role === "ADMIN" && (
              <button
                type="button"
                onClick={() => setNoteModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                <PaperAirplaneIcon className="h-5 w-5" />
                Gửi thông báo
              </button>
            )}
            {role === "EMPLOYEE" && (
              <div className="flex rounded-md border border-gray-200 bg-gray-50 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("calendar")}
                  className={`rounded px-3 py-2 text-sm font-bold ${
                    activeTab === "calendar" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600"
                  }`}
                >
                  Lịch chung
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("swap")}
                  className={`rounded px-3 py-2 text-sm font-bold ${
                    activeTab === "swap" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600"
                  }`}
                >
                  Đổi ca
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTab === "swap" && role === "EMPLOYEE" ? (
        <EmployeeSwapTab
          initialTarget={selectedSwapTarget}
          onClearInitialTarget={() => setSelectedSwapTarget(null)}
        />
      ) : (
        <div className="space-y-4 rounded-md border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => movePeriod(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 text-gray-700 transition hover:bg-gray-50"
                aria-label="Kỳ trước"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <div className="min-w-[220px] rounded-md bg-gray-50 px-4 py-2 text-center text-sm font-bold text-gray-950">
                {periodTitle(viewMode, cursorDate)}
              </div>
              <button
                type="button"
                onClick={() => movePeriod(1)}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 text-gray-700 transition hover:bg-gray-50"
                aria-label="Kỳ sau"
              >
                <ArrowRightIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setCursorDate(new Date())}
                className="flex h-10 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
              >
                <CalendarDaysIcon className="h-5 w-5" />
                Hôm nay
              </button>
              <button
                type="button"
                onClick={fetchSchedules}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 text-gray-700 transition hover:bg-gray-50"
                aria-label="Làm mới"
              >
                <ArrowPathIcon className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border border-gray-200 bg-gray-50 p-1">
                {viewOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setViewMode(option.value)}
                    className={`rounded px-3 py-2 text-sm font-bold transition ${
                      viewMode === option.value
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold text-gray-600">
                <span className="rounded-md border-l-4 border-gray-300 bg-gray-50 px-2 py-1">Chưa bắt đầu</span>
                <span className="rounded-md border-l-4 border-green-500 bg-green-50 px-2 py-1 text-green-700">Đã chấm công</span>
                <span className="rounded-md border-l-4 border-orange-500 bg-orange-50 px-2 py-1 text-orange-700">Chưa chấm công</span>
              </div>
            </div>
          </div>

          {viewMode === "day" ? (
            <div className="grid gap-3">
              {(notesByDate.get(dateKey(cursorDate)) || []).map((note) => (
                <NoteTag key={note.note_id} note={note} />
              ))}
              {visibleSchedules.length === 0 && !(notesByDate.get(dateKey(cursorDate)) || []).length ? (
                <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm font-semibold text-gray-500">
                  Không có ca trong ngày này
                </div>
              ) : (
                visibleSchedules.map((schedule) => {
                  const canRequestSwap =
                    role === "EMPLOYEE" &&
                    currentEmployeeId &&
                    Number(schedule.employee_id) !== Number(currentEmployeeId);
                  const adjustment =
                    adjustmentsByEmployeeDate.get(`${schedule.employee_id}-${schedule.work_date}`) || 0;

                  return (
                    <div
                      key={schedule.schedule_id}
                      className={`rounded-md border border-gray-200 border-l-4 ${borderClass(schedule, attendanceByScheduleId)} bg-white p-4 shadow-sm`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-gray-950 text-white">
                            <UserIcon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-base font-bold text-gray-950">{schedule.employee_name}</div>
                            <div className="mt-1 text-sm font-medium text-gray-500">{schedule.shift_name}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm font-bold">
                          <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-2 text-gray-700">
                            <ClockIcon className="h-4 w-4" />
                            {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                          </span>
                          <span className="rounded-md bg-gray-100 px-3 py-2 text-gray-700">
                            {borderLabel(schedule, attendanceByScheduleId)}
                          </span>
                          {adjustment !== 0 && (
                            <span className={`rounded-md px-3 py-2 ${adjustment > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                              {formatMoneyCompact(adjustment)}
                            </span>
                          )}
                          {canRequestSwap && (
                            <button
                              type="button"
                              onClick={() => setSwapCandidate(schedule)}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-white transition hover:bg-blue-700"
                            >
                              <ArrowsRightLeftIcon className="h-4 w-4" />
                              Đổi ca
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold uppercase tracking-wide text-gray-500">
                {weekdayLabels.map((day) => (
                  <div key={day} className="rounded-md bg-gray-50 py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className={`grid grid-cols-1 gap-2 overflow-visible sm:grid-cols-7 ${viewMode === "week" ? "sm:auto-rows-fr" : ""}`}>
                {visibleDates.map(renderDayCell)}
              </div>
            </>
          )}
        </div>
      )}

      {noteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/30 p-3 backdrop-blur-sm sm:items-center">
          <form onSubmit={submitScheduleNote} className="w-full max-w-lg rounded-md bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-950">Gửi thông báo lịch</h2>
                <p className="mt-1 text-sm text-gray-600">Tag sẽ hiển thị trên các ngày đã chọn trong lịch chung.</p>
              </div>
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-950"
                aria-label="Đóng"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <label className="mt-4 block text-sm font-semibold text-gray-700">
              Nội dung
              <input
                value={noteForm.title}
                onChange={(event) => setNoteForm((current) => ({ ...current, title: event.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none transition focus:border-blue-600"
                required
              />
            </label>

            <div className="mt-3">
              <label className="block text-sm font-semibold text-gray-700">
                Chọn ngày
                <div className="mt-1 flex gap-2">
                  <input
                    type="date"
                    value={noteForm.draftDate}
                    onChange={(event) => setNoteForm((current) => ({ ...current, draftDate: event.target.value }))}
                    className="h-10 min-w-0 flex-1 rounded-md border border-gray-300 px-3 text-sm outline-none transition focus:border-blue-600"
                  />
                  <button type="button" onClick={addNoteDate} className="rounded-md bg-gray-950 px-3 text-sm font-bold text-white">
                    Thêm
                  </button>
                </div>
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {noteForm.dates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setNoteForm((current) => ({ ...current, dates: current.dates.filter((item) => item !== date) }))}
                    className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700"
                  >
                    {date} ×
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-sm font-semibold text-gray-700">Màu tag</div>
              <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-12">
                {notePalette.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNoteForm((current) => ({ ...current, color }))}
                    className={`h-8 rounded-md border ${noteForm.color === color ? "border-gray-950 ring-2 ring-gray-950/20" : "border-gray-200"}`}
                    style={{ backgroundColor: color }}
                    aria-label={`Chọn màu ${color}`}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!noteForm.title.trim() || !noteForm.dates.length && !noteForm.draftDate}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                Gửi thông báo
              </button>
            </div>
          </form>
        </div>
      )}

      {swapCandidate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/30 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-md bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-950">Đổi ca với nhân viên này?</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {swapCandidate.employee_name} · {swapCandidate.shift_name} · {formatTime(swapCandidate.start_time)} - {formatTime(swapCandidate.end_time)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSwapCandidate(null)}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-950"
                aria-label="Đóng"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSwapCandidate(null)}
                className="rounded-md px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedSwapTarget(swapCandidate);
                  setSwapCandidate(null);
                  setActiveTab("swap");
                }}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
              >
                <ArrowsRightLeftIcon className="h-4 w-4" />
                Đổi ca
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
