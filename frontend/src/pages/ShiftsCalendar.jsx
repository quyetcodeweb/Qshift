import { useCallback, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import { getRole } from "../utils/auth";

const API_URL = `${(import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "")}/api`;

const transformToCalendarEvents = (schedules) => {
  return schedules
    .map((schedule) => {
      const {
        work_date,
        start_time,
        end_time,
        employee_name,
        shift_name,
        status,
      } = schedule;

      if (!work_date || !start_time || !end_time || !employee_name || !shift_name) {
        return null;
      }

      return {
        title: `${employee_name} - ${shift_name}`,
        start: `${work_date}T${start_time}`,
        end: `${work_date}T${end_time}`,
        backgroundColor: status === "PUBLISHED" ? "#10b981" : "#f59e0b",
        borderColor: status === "PUBLISHED" ? "#059669" : "#d97706",
        extendedProps: { status, employee_name, shift_name },
      };
    })
    .filter(Boolean);
};

const statusText = {
  PENDING_TARGET: "Chờ người nhận xác nhận",
  APPROVED: "Đã đổi ca",
  REJECTED_BY_TARGET: "Người nhận từ chối",
  CANCELLED_BY_ADMIN: "Admin đã hủy",
  REVERTED_BY_ADMIN: "Admin đã hoàn tác",
};

function formatShift(schedule) {
  if (!schedule) return "-";
  return `${schedule.employee_name} - ${schedule.shift_name} (${schedule.start_time?.slice(0, 5)} - ${schedule.end_time?.slice(0, 5)})`;
}

function EmployeeSwapTab() {
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

  const token = localStorage.getItem("token");

  const fetchSwapData = useCallback(async () => {
    const [optionsRes, requestsRes] = await Promise.all([
      axios.get(`${API_URL}/shift-swaps/options`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      axios.get(`${API_URL}/shift-swaps`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    setOptions(optionsRes.data);
    setRequests(requestsRes.data);
  }, [token]);

  useEffect(() => {
    fetchSwapData().catch((err) => {
      console.error("[EmployeeSwapTab] Load error:", err);
    });
  }, [fetchSwapData]);

  const mySchedules = useMemo(() => {
    return options.schedules.filter(
      (schedule) => Number(schedule.employee_id) === Number(options.current_employee_id),
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
    return Array.from(
      new Set(
        options.schedules
          .filter(
            (schedule) =>
              Number(schedule.employee_id) === Number(form.target_employee_id),
          )
          .map((schedule) => schedule.work_date),
      ),
    ).sort();
  }, [form.target_employee_id, options.schedules]);

  const targetSchedules = useMemo(() => {
    return options.schedules.filter(
      (schedule) =>
        schedule.work_date === form.target_work_date &&
        Number(schedule.employee_id) === Number(form.target_employee_id),
    );
  }, [form.target_employee_id, form.target_work_date, options.schedules]);

  const sentRequests = useMemo(() => {
    return requests.filter(
      (request) =>
        Number(request.requester_employee_id) === Number(options.current_employee_id),
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
        { headers: { Authorization: `Bearer ${token}` } },
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
      <form onSubmit={submitRequest} className="space-y-3 rounded-lg bg-white p-4 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Gửi yêu cầu đổi ca</h2>

        <label className="block text-sm font-medium text-gray-700">
          Ngày ca của bạn
          <select
            value={form.requester_work_date}
            onChange={(event) =>
              setForm({
                ...form,
                requester_work_date: event.target.value,
                requester_schedule_id: "",
              })
            }
            className="mt-1 w-full rounded border border-gray-300 p-2"
            required
          >
            <option value="">Chọn ngày của bạn</option>
            {requesterDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Ca của bạn
          <select
            value={form.requester_schedule_id}
            onChange={(event) =>
              setForm({ ...form, requester_schedule_id: event.target.value })
            }
            className="mt-1 w-full rounded border border-gray-300 p-2"
            required
            disabled={!form.requester_work_date}
          >
            <option value="">Chọn ca</option>
            {mySchedulesForDate.map((schedule) => (
              <option key={schedule.schedule_id} value={schedule.schedule_id}>
                {formatShift(schedule)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Nhân viên cần đổi
          <select
            value={form.target_employee_id}
            onChange={(event) =>
              setForm({
                ...form,
                target_employee_id: event.target.value,
                target_work_date: "",
                target_schedule_id: "",
              })
            }
            className="mt-1 w-full rounded border border-gray-300 p-2"
            required
          >
            <option value="">Chọn nhân viên</option>
            {options.employees.map((employee) => (
              <option key={employee.employee_id} value={employee.employee_id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Ngày ca của người được gửi
          <select
            value={form.target_work_date}
            onChange={(event) =>
              setForm({
                ...form,
                target_work_date: event.target.value,
                target_schedule_id: "",
              })
            }
            className="mt-1 w-full rounded border border-gray-300 p-2"
            required
            disabled={!form.target_employee_id}
          >
            <option value="">Chọn ngày của người đó</option>
            {targetDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Ca của người được gửi
          <select
            value={form.target_schedule_id}
            onChange={(event) =>
              setForm({ ...form, target_schedule_id: event.target.value })
            }
            className="mt-1 w-full rounded border border-gray-300 p-2"
            required
            disabled={!form.target_work_date}
          >
            <option value="">Chọn ca của nhân viên đó</option>
            {targetSchedules.map((schedule) => (
              <option key={schedule.schedule_id} value={schedule.schedule_id}>
                {formatShift(schedule)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Ghi chú
          <textarea
            value={form.requester_note}
            onChange={(event) =>
              setForm({ ...form, requester_note: event.target.value })
            }
            className="mt-1 w-full rounded border border-gray-300 p-2"
            rows={3}
            placeholder="Lý do đổi ca..."
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Gửi request
        </button>
      </form>

      <div className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Lịch sử request đã gửi</h2>
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
                    <td className="p-3">{new Date(request.created_at).toLocaleString()}</td>
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
  const [events, setEvents] = useState([]);
  const [activeTab, setActiveTab] = useState("calendar");
  const role = getRole();

  const fetchSchedules = useCallback(async (date = new Date()) => {
    try {
      const token = localStorage.getItem("token");
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const res = await axios.get(
        `${API_URL}/schedules/current?month=${month}&year=${year}&scope=all`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setEvents(transformToCalendarEvents(res.data));
    } catch (err) {
      console.error("[fetchSchedules] Error:", err);
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow">
        <h1 className="text-2xl font-bold">📅 Lịch Làm Việc</h1>
        {role === "EMPLOYEE" && (
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              onClick={() => setActiveTab("calendar")}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                activeTab === "calendar" ? "bg-white text-blue-600 shadow" : "text-gray-600"
              }`}
            >
              Lịch chung
            </button>
            <button
              onClick={() => setActiveTab("swap")}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                activeTab === "swap" ? "bg-white text-blue-600 shadow" : "text-gray-600"
              }`}
            >
              Đổi ca
            </button>
          </div>
        )}
      </div>

      {activeTab === "swap" && role === "EMPLOYEE" ? (
        <EmployeeSwapTab />
      ) : (
        <div className="rounded-xl bg-white p-4 shadow">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            events={events}
            height="80vh"
            eventDisplay="block"
            datesSet={(arg) => {
              const year = arg.view.currentStart.getFullYear();
              const month = arg.view.currentStart.getMonth() + 1;
              fetchSchedules(new Date(year, month - 1, 1));
            }}
          />
        </div>
      )}
    </div>
  );
}
