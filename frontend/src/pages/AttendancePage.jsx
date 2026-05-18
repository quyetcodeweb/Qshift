import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Button,
  Card,
  Chip,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Option,
  Select,
  Spinner,
  Typography,
} from "@material-tailwind/react";
import {
  ArrowPathIcon,
  ArrowRightOnRectangleIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { getRole } from "../utils/auth";
import { API_URL } from "../services/api";

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

function toLocalDateTime(date, time) {
  if (!date || !time) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

function getShiftTimes(record) {
  const start = toLocalDateTime(record.work_date, record.start_time);
  let end = toLocalDateTime(record.work_date, record.end_time);

  if (start && end && end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return { start, end };
}

function formatDateTime(value) {
  if (!value) return "-";
  return String(value).slice(11, 16);
}

function formatShiftTime(value) {
  return value?.slice(0, 5) || "--:--";
}

function statusChip(group) {
  if (!group.check_in) {
    return { label: "Chưa chấm công", color: "gray" };
  }

  if (!group.check_out) {
    return { label: "Đang làm", color: "blue" };
  }

  if (group.attendance_status === "LATE") {
    return { label: "Đi trễ", color: "orange" };
  }

  return { label: "Đúng giờ", color: "green" };
}

function buildAttendanceGroups(records) {
  const map = new Map();

  records.forEach((record) => {
    const key = `${record.employee_id}-${record.work_date}`;
    map.set(key, [...(map.get(key) || []), record]);
  });

  return [...map.values()].flatMap((items) => {
    const sorted = items
      .map((record) => {
        const { start, end } = getShiftTimes(record);
        return { ...record, shiftStart: start, shiftEnd: end };
      })
      .filter((record) => record.shiftStart && record.shiftEnd)
      .sort((a, b) => a.shiftStart - b.shiftStart || a.schedule_id - b.schedule_id);
    const groups = [];

    sorted.forEach((record) => {
      const lastGroup = groups[groups.length - 1];
      const isLinked =
        lastGroup &&
        lastGroup.employee_id === record.employee_id &&
        lastGroup.work_date === record.work_date &&
        lastGroup.end.getTime() === record.shiftStart.getTime();

      if (isLinked) {
        lastGroup.records.push(record);
        lastGroup.schedule_ids.push(record.schedule_id);
        lastGroup.shift_name = `${lastGroup.shift_name}-${record.shift_name}`;
        lastGroup.end = record.shiftEnd;
        lastGroup.end_time = record.end_time;
        lastGroup.check_in = lastGroup.check_in || record.check_in;
        lastGroup.check_out = lastGroup.check_out || record.check_out;
        if (record.attendance_status === "LATE") lastGroup.attendance_status = "LATE";
        return;
      }

      groups.push({
        ...record,
        records: [record],
        schedule_ids: [record.schedule_id],
        start: record.shiftStart,
        end: record.shiftEnd,
      });
    });

    return groups;
  });
}

export default function AttendancePage() {
  const role = getRole();
  const isAdmin = role === "ADMIN";
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());
  const [currentDay, setCurrentDay] = useState(() => formatDate(new Date()));
  const [lateModalOpen, setLateModalOpen] = useState(false);
  const [lateForm, setLateForm] = useState({ schedule_id: "", minutes: "15", reason: "" });

  const fetchToday = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axios.get(`${API_URL}/attendance/today`, {
        headers: authHeaders(),
      });
      setRecords(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Không thể tải dữ liệu chấm công");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToday();
  }, [currentDay, fetchToday]);

  useEffect(() => {
    const timer = setInterval(() => {
      const nextNow = new Date();
      setNow(nextNow);
      setCurrentDay(formatDate(nextNow));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const groups = useMemo(() => buildAttendanceGroups(records), [records]);
  const summary = useMemo(
    () =>
      groups.reduce(
        (acc, group) => {
          acc.total += 1;
          if (group.check_in) acc.checkedIn += 1;
          if (group.check_out) acc.checkedOut += 1;
          if (group.attendance_status === "LATE") acc.late += 1;
          return acc;
        },
        { total: 0, checkedIn: 0, checkedOut: 0, late: 0 },
      ),
    [groups],
  );

  const upcomingGroups = useMemo(
    () => groups.filter((group) => !group.check_in && now < group.start),
    [groups, now],
  );

  const canCheckIn = (group) => {
    if (!group.start || !group.end || group.check_in) return false;
    const openAt = new Date(group.start.getTime() - 15 * 60 * 1000);
    return now >= openAt && now < group.end;
  };

  const canCheckOut = (group) =>
    Boolean(group.end && group.check_in && !group.check_out && now >= group.end);

  const markAttendance = async (scheduleId, action) => {
    try {
      setActionLoading(`${scheduleId}-${action}`);
      setError("");
      await axios.post(
        `${API_URL}/attendance/mark`,
        { schedule_id: scheduleId, action },
        { headers: authHeaders() },
      );
      await fetchToday();
    } catch (err) {
      setError(err.response?.data?.message || "Không thể ghi nhận chấm công");
    } finally {
      setActionLoading(null);
    }
  };

  const sendLateRequest = async () => {
    if (!lateForm.schedule_id || !lateForm.minutes) {
      setError("Vui lòng chọn ca và thời gian muốn xin trễ");
      return;
    }

    try {
      setActionLoading("late-request");
      setError("");
      await axios.post(
        `${API_URL}/attendance/late-request`,
        {
          schedule_id: Number(lateForm.schedule_id),
          requested_minutes: Number(lateForm.minutes),
          reason: lateForm.reason,
        },
        { headers: authHeaders() },
      );
      setLateModalOpen(false);
      setLateForm({ schedule_id: "", minutes: "15", reason: "" });
      window.dispatchEvent(new Event("notification-count-changed"));
      alert("Đã gửi yêu cầu xin trễ đến admin");
    } catch (err) {
      setError(err.response?.data?.message || "Không thể gửi yêu cầu xin trễ");
    } finally {
      setActionLoading(null);
    }
  };

  const renderAction = (group) => {
    const checkInVisible = !isAdmin && canCheckIn(group);
    const checkOutVisible = !isAdmin && canCheckOut(group);
    const actionKey = checkInVisible ? "check_in" : "check_out";
    const isBusy = actionLoading === `${group.schedule_id}-${actionKey}`;

    if (checkInVisible) {
      return (
        <Button
          size="sm"
          className="flex items-center justify-center gap-2 rounded-md bg-blue-600 normal-case"
          disabled={isBusy}
          onClick={() => markAttendance(group.schedule_id, "check_in")}
        >
          <ClockIcon className="h-4 w-4" />
          Chấm vào
        </Button>
      );
    }

    if (checkOutVisible) {
      return (
        <Button
          size="sm"
          className="flex items-center justify-center gap-2 rounded-md bg-green-600 normal-case"
          disabled={isBusy}
          onClick={() => markAttendance(group.schedule_id, "check_out")}
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4" />
          Chấm ra
        </Button>
      );
    }

    return (
      <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
        <CheckCircleIcon className="h-4 w-4 shrink-0" />
        Chưa đến giờ thao tác
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Typography variant="h4" className="font-bold tracking-tight text-gray-950">
            Chấm công hôm nay
          </Typography>
          <Typography className="mt-1 text-sm text-gray-600">
            {new Date(`${currentDay}T00:00:00`).toLocaleDateString("vi-VN", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </Typography>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isAdmin && (
            <Button
              size="sm"
              onClick={() => setLateModalOpen(true)}
              className="flex items-center gap-2 rounded-md bg-orange-600 normal-case"
            >
              <ExclamationTriangleIcon className="h-5 w-5" />
              Xin trễ
            </Button>
          )}
          <Button
            variant="outlined"
            size="sm"
            onClick={fetchToday}
            disabled={loading}
            className="flex items-center gap-2 rounded-md normal-case"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <Typography variant="h6" className="font-bold text-gray-950">
              Danh sách ca hôm nay
            </Typography>
            <Typography className="text-sm text-gray-500">
              Ca liền nhau sẽ được nối thành một dòng chấm công.
            </Typography>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center">
              <Spinner className="h-8 w-8 text-blue-600" />
            </div>
          ) : groups.length === 0 ? (
            <div className="p-10 text-center text-sm font-medium text-gray-500">
              Hôm nay chưa có ca làm được công bố.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {groups.map((group) => {
                const chip = statusChip(group);
                return (
                  <div
                    key={group.schedule_ids.join("-")}
                    className="grid gap-4 p-4 transition hover:bg-gray-50 lg:grid-cols-[minmax(180px,1.2fr)_150px_150px_120px_150px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-gray-950">
                        {group.shift_name}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-500">
                        <ClockIcon className="h-4 w-4" />
                        {formatShiftTime(group.start_time)} - {formatShiftTime(group.end_time)}
                      </div>
                      {isAdmin && (
                        <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-gray-500">
                          <UserCircleIcon className="h-4 w-4" />
                          {group.employee_name}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md bg-gray-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        Chấm vào
                      </div>
                      <div className="mt-1 text-sm font-bold text-gray-950">
                        {formatDateTime(group.check_in)}
                      </div>
                    </div>

                    <div className="rounded-md bg-gray-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        Chấm ra
                      </div>
                      <div className="mt-1 text-sm font-bold text-gray-950">
                        {formatDateTime(group.check_out)}
                      </div>
                    </div>

                    <div className="flex items-center">
                      <Chip value={chip.label} color={chip.color} size="sm" className="w-fit rounded-md" />
                    </div>

                    {!isAdmin && <div className="flex items-center">{renderAction(group)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <Typography variant="h6" className="font-bold text-gray-950">
              Tổng quan
            </Typography>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["Ca", summary.total],
                ["Đã vào", summary.checkedIn],
                ["Đã ra", summary.checkedOut],
                ["Trễ", summary.late],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md bg-gray-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</div>
                  <div className="mt-1 text-xl font-bold text-gray-950">{value}</div>
                </div>
              ))}
            </div>
          </Card>

          {!isAdmin && (
            <Card className="rounded-md border border-orange-100 bg-orange-50 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <CalendarDaysIcon className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" />
                <div>
                  <Typography className="text-sm font-bold text-orange-900">
                    Xin trễ trước giờ vào ca
                  </Typography>
                  <Typography className="mt-1 text-sm leading-6 text-orange-800">
                    Nếu admin duyệt, bạn có thể chấm công trong thời gian đã xin mà không bị ghi nhận là đi trễ.
                  </Typography>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={lateModalOpen} handler={() => setLateModalOpen(false)} size="sm">
        <DialogHeader className="border-b border-gray-100">
          <div className="flex w-full items-center justify-between gap-3">
            <Typography variant="h5" className="font-bold text-gray-950">
              Xin đi trễ
            </Typography>
            <button
              type="button"
              onClick={() => setLateModalOpen(false)}
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Select
            label="Ca muốn xin trễ"
            value={lateForm.schedule_id}
            onChange={(value) => setLateForm({ ...lateForm, schedule_id: value || "" })}
          >
            {upcomingGroups.map((group) => (
              <Option key={group.schedule_id} value={String(group.schedule_id)}>
                {group.shift_name} ({formatShiftTime(group.start_time)} - {formatShiftTime(group.end_time)})
              </Option>
            ))}
          </Select>
          <Select
            label="Thời gian muốn trễ"
            value={lateForm.minutes}
            onChange={(value) => setLateForm({ ...lateForm, minutes: value || "15" })}
          >
            {[5, 10, 15, 20, 30, 45, 60].map((minute) => (
              <Option key={minute} value={String(minute)}>
                {minute} phút
              </Option>
            ))}
          </Select>
          <Input
            label="Lý do"
            value={lateForm.reason}
            onChange={(event) => setLateForm({ ...lateForm, reason: event.target.value })}
          />
          {upcomingGroups.length === 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-sm font-medium text-amber-800">
              Hiện không có ca nào chưa bắt đầu để xin trễ.
            </div>
          )}
        </DialogBody>
        <DialogFooter className="gap-2 border-t border-gray-100">
          <Button variant="text" onClick={() => setLateModalOpen(false)} className="rounded-md normal-case text-gray-700">
            Hủy
          </Button>
          <Button
            onClick={sendLateRequest}
            disabled={!lateForm.schedule_id || actionLoading === "late-request"}
            className="flex items-center gap-2 rounded-md bg-orange-600 normal-case"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            Gửi yêu cầu
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
