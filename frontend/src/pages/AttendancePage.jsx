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
  ArrowRightOnRectangleIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/solid";
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

function formatTime(value) {
  if (!value) return "-";
  return value.slice(11, 16);
}

function statusChip(record) {
  if (!record.check_in) {
    return { label: "Chưa chấm công", color: "gray" };
  }

  if (!record.check_out) {
    return { label: "Đang làm", color: "blue" };
  }

  if (record.attendance_status === "LATE") {
    return { label: "Đi trễ", color: "orange" };
  }

  return { label: "Đúng giờ", color: "green" };
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

  const summary = useMemo(
    () =>
      records.reduce(
        (acc, record) => {
          acc.total += 1;
          if (record.check_in) acc.checkedIn += 1;
          if (record.check_out) acc.checkedOut += 1;
          if (record.attendance_status === "LATE") acc.late += 1;
          return acc;
        },
        { total: 0, checkedIn: 0, checkedOut: 0, late: 0 },
      ),
    [records],
  );

  const canCheckIn = (record) => {
    const { start, end } = getShiftTimes(record);
    if (!start || !end || record.check_in) return false;
    const openAt = new Date(start.getTime() - 15 * 60 * 1000);
    return now >= openAt && now < end;
  };

  const canCheckOut = (record) => {
    const { end } = getShiftTimes(record);
    return Boolean(end && record.check_in && !record.check_out && now >= end);
  };

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

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <Typography variant="h4" className="font-bold text-gray-900">
            Chấm công hôm nay
          </Typography>
          <Typography className="text-sm text-gray-600">
            {new Date(`${currentDay}T00:00:00`).toLocaleDateString("vi-VN", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </Typography>
        </div>
        <Button variant="outlined" size="sm" onClick={fetchToday} disabled={loading}>
          Làm mới
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isAdmin && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card className="p-4 shadow-sm">
            <Typography className="text-sm text-gray-600">Ca hôm nay</Typography>
            <Typography variant="h4" className="font-bold text-gray-900">
              {summary.total}
            </Typography>
          </Card>
          <Card className="p-4 shadow-sm">
            <Typography className="text-sm text-gray-600">Đã vào ca</Typography>
            <Typography variant="h4" className="font-bold text-blue-600">
              {summary.checkedIn}
            </Typography>
          </Card>
          <Card className="p-4 shadow-sm">
            <Typography className="text-sm text-gray-600">Đã ra về</Typography>
            <Typography variant="h4" className="font-bold text-green-600">
              {summary.checkedOut}
            </Typography>
          </Card>
          <Card className="p-4 shadow-sm">
            <Typography className="text-sm text-gray-600">Đi trễ</Typography>
            <Typography variant="h4" className="font-bold text-orange-600">
              {summary.late}
            </Typography>
          </Card>
        </div>
      )}

      <Card className="overflow-hidden bg-white shadow-sm">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-8 w-8" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Hôm nay chưa có ca làm được công bố.
          </div>
        ) : (
          <>
          <div className="space-y-3 p-3 md:hidden">
            {records.map((record) => {
              const chip = statusChip(record);
              const checkInVisible = !isAdmin && canCheckIn(record);
              const checkOutVisible = !isAdmin && canCheckOut(record);
              const actionKey = checkInVisible ? "check_in" : "check_out";
              const isBusy =
                actionLoading === `${record.schedule_id}-${actionKey}`;

              return (
                <div
                  key={record.schedule_id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-900">
                        {record.shift_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {record.start_time?.slice(0, 5)} -{" "}
                        {record.end_time?.slice(0, 5)}
                      </div>
                    </div>
                    <Chip
                      value={chip.label}
                      color={chip.color}
                      size="sm"
                      className="shrink-0"
                    />
                  </div>

                  {isAdmin && (
                    <div className="mt-3 text-sm text-gray-700">
                      <div className="font-medium">{record.employee_name}</div>
                      <div className="truncate text-gray-500">{record.email || "-"}</div>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md bg-gray-50 p-3">
                      <div className="text-gray-500">Chấm vào</div>
                      <div className="font-semibold text-gray-900">
                        {formatTime(record.check_in)}
                      </div>
                    </div>
                    <div className="rounded-md bg-gray-50 p-3">
                      <div className="text-gray-500">Chấm ra</div>
                      <div className="font-semibold text-gray-900">
                        {formatTime(record.check_out)}
                      </div>
                    </div>
                  </div>

                  {!isAdmin && (
                    <div className="mt-4">
                      {checkInVisible && (
                        <Button
                          fullWidth
                          className="flex items-center justify-center gap-2 bg-blue-600"
                          disabled={isBusy}
                          onClick={() => markAttendance(record.schedule_id, "check_in")}
                        >
                          <ClockIcon className="h-4 w-4" />
                          Chấm công vào
                        </Button>
                      )}
                      {checkOutVisible && (
                        <Button
                          fullWidth
                          className="flex items-center justify-center gap-2 bg-green-600"
                          disabled={isBusy}
                          onClick={() => markAttendance(record.schedule_id, "check_out")}
                        >
                          <ArrowRightOnRectangleIcon className="h-4 w-4" />
                          Chấm công ra
                        </Button>
                      )}
                      {!checkInVisible && !checkOutVisible && (
                        <div className="flex items-center gap-2 rounded-md bg-gray-50 p-3 text-sm text-gray-500">
                          <CheckCircleIcon className="h-4 w-4 shrink-0" />
                          Chưa đến thời điểm thao tác
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[840px] text-left">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="p-4 text-sm font-semibold">Nhân viên</th>
                  <th className="p-4 text-sm font-semibold">Ca làm</th>
                  <th className="p-4 text-sm font-semibold">Giờ ca</th>
                  <th className="p-4 text-sm font-semibold">Chấm vào</th>
                  <th className="p-4 text-sm font-semibold">Chấm ra</th>
                  <th className="p-4 text-sm font-semibold">Trạng thái</th>
                  {!isAdmin && <th className="p-4 text-sm font-semibold">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const chip = statusChip(record);
                  const checkInVisible = !isAdmin && canCheckIn(record);
                  const checkOutVisible = !isAdmin && canCheckOut(record);
                  const actionKey = checkInVisible ? "check_in" : "check_out";
                  const isBusy =
                    actionLoading === `${record.schedule_id}-${actionKey}`;

                  return (
                    <tr key={record.schedule_id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <div className="font-semibold text-gray-900">
                          {record.employee_name}
                        </div>
                        <div className="text-xs text-gray-500">{record.email || "-"}</div>
                      </td>
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
                      {!isAdmin && (
                        <td className="p-4">
                          {checkInVisible && (
                            <Button
                              size="sm"
                              className="flex items-center gap-2 bg-blue-600"
                              disabled={isBusy}
                              onClick={() => markAttendance(record.schedule_id, "check_in")}
                            >
                              <ClockIcon className="h-4 w-4" />
                              Chấm công vào
                            </Button>
                          )}
                          {checkOutVisible && (
                            <Button
                              size="sm"
                              className="flex items-center gap-2 bg-green-600"
                              disabled={isBusy}
                              onClick={() => markAttendance(record.schedule_id, "check_out")}
                            >
                              <ArrowRightOnRectangleIcon className="h-4 w-4" />
                              Chấm công ra
                            </Button>
                          )}
                          {!checkInVisible && !checkOutVisible && (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <CheckCircleIcon className="h-4 w-4" />
                              Chưa đến thời điểm thao tác
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}
