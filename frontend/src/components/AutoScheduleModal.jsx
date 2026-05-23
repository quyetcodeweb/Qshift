import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Dialog, Input, Option, Select, Spinner, Typography } from "@material-tailwind/react";
import axios from "axios";
import DraftSchedulesModal from "./DraftSchedulesModal";
import { API_URL } from "../services/api";

const DAYS_OF_WEEK = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const VIEW_MODES = [
  { value: "general", label: "Theo tuần" },
  { value: "detailed", label: "Theo ngày" },
];

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN");
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : "--:--";
}

function normalizeCount(value) {
  return Math.max(0, Number.parseInt(value, 10) || 0);
}

function buildGeneralConfig(shifts) {
  return DAYS_OF_WEEK.reduce((config, _day, dayIndex) => {
    config[dayIndex] = {};
    shifts.forEach((shift) => {
      config[dayIndex][shift.shift_id] = 0;
    });
    return config;
  }, {});
}

function buildDetailedFromGeneral({ generalConfig, shifts, month, year }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const detailed = {};

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    const dayIndex = (date.getDay() + 6) % 7;
    const key = dateKey(year, month, day);
    detailed[key] = {};
    shifts.forEach((shift) => {
      detailed[key][shift.shift_id] = normalizeCount(generalConfig[dayIndex]?.[shift.shift_id]);
    });
  }

  return detailed;
}

function emptyRoleRequirements(shifts) {
  return shifts.reduce((config, shift) => {
    config[shift.shift_id] = {};
    return config;
  }, {});
}

function summarizeRoleConstraints(roleRequirements) {
  return Object.values(roleRequirements).reduce(
    (total, roleMap) => total + Object.values(roleMap || {}).filter((count) => Number(count) > 0).length,
    0,
  );
}

function StatBox({ label, value, tone = "slate" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-900",
    green: "bg-emerald-50 text-emerald-900",
    orange: "bg-orange-50 text-orange-900",
    slate: "bg-slate-100 text-slate-900",
  };

  return (
    <div className={`rounded-md p-3 ${tones[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function RoleRequirementsDialog({
  open,
  onClose,
  roles,
  shifts,
  roleRequirements,
  setRoleRequirement,
  clearRoleRequirements,
}) {
  return (
    <Dialog open={open} handler={onClose} size="lg" className="w-[min(94vw,900px)] overflow-hidden rounded-md">
      <div className="flex max-h-[68vh] flex-col overflow-hidden bg-white font-sans">
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Typography variant="h6" className="font-semibold text-slate-950">
                Ràng buộc vai trò
              </Typography>
              <Typography className="mt-1 text-sm font-medium text-slate-500">
                Để trống nếu ca không cần giới hạn vai trò.
              </Typography>
            </div>
            <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">
              Đóng
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 sm:p-5">
          {roles.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
              Chưa có vai trò để cấu hình.
            </div>
          ) : (
            <div className="overflow-auto rounded-md border border-slate-200 bg-white">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-44 px-3 py-3">Ca</th>
                    {roles.map((role) => (
                      <th key={role.role_id} className="px-3 py-3 text-center">
                        <span className="block max-w-28 truncate normal-case">{role.role_name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shifts.map((shift) => (
                    <tr key={shift.shift_id}>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">{shift.shift_name}</div>
                        <div className="text-xs font-medium text-slate-500">
                          {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                        </div>
                      </td>
                      {roles.map((role) => (
                        <td key={role.role_id} className="px-3 py-3 text-center">
                          <input
                            type="number"
                            min="0"
                            value={roleRequirements[shift.shift_id]?.[role.role_id] || 0}
                            onChange={(event) => setRoleRequirement(shift.shift_id, role.role_id, event.target.value)}
                            className="h-9 w-14 rounded-md border border-slate-300 bg-white px-2 text-center text-sm font-medium text-slate-950 outline-none focus:border-blue-600"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:justify-end sm:px-5">
          <Button variant="outlined" className="rounded-md border-slate-300 normal-case text-slate-700" onClick={clearRoleRequirements}>
            Xóa ràng buộc
          </Button>
          <Button className="rounded-md bg-slate-950 normal-case" onClick={onClose}>
            Áp dụng
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function PreviewDialog({
  open,
  onClose,
  schedule,
  employees,
  shifts,
  roles,
  draftName,
  setDraftName,
  updateShift,
  removeShift,
  onSaveDraft,
  onPublish,
  loading,
}) {
  const rows = useMemo(() => {
    const generated = schedule?.generated_shifts || [];
    return [...generated].sort((a, b) => {
      const dateCompare = String(a.work_date).localeCompare(String(b.work_date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.start_time || "").localeCompare(String(b.start_time || ""));
    });
  }, [schedule]);

  const stats = useMemo(() => {
    const uniqueEmployees = new Set(rows.map((row) => row.employee_id)).size;
    const uniqueDates = new Set(rows.map((row) => row.work_date)).size;
    return {
      total: rows.length,
      employees: uniqueEmployees,
      dates: uniqueDates,
      fulfillment: schedule?.stats?.fulfillment_rate || "100",
    };
  }, [rows, schedule]);

  if (!schedule) return null;

  return (
    <Dialog open={open} handler={onClose} size="xl" className="w-[min(96vw,1080px)] overflow-hidden rounded-md">
      <div className="flex max-h-[72vh] flex-col overflow-hidden bg-white font-sans">
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Typography variant="h6" className="font-semibold text-slate-950">
                Xem trước lịch tháng {schedule.month}/{schedule.year}
              </Typography>
              <Typography className="mt-1 text-sm font-medium text-slate-500">
                Có thể chỉnh trực tiếp trước khi lưu hoặc công bố.
              </Typography>
            </div>
            <button type="button" onClick={onClose} className="self-start rounded-md px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">
              Đóng
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 sm:p-5">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatBox label="Tổng ca" value={stats.total} tone="blue" />
            <StatBox label="Nhân viên" value={stats.employees} tone="green" />
            <StatBox label="Ngày có lịch" value={stats.dates} tone="slate" />
            <StatBox label="Đáp ứng" value={`${stats.fulfillment}%`} tone={Number(stats.fulfillment) >= 90 ? "green" : "orange"} />
          </div>

          {(schedule.stats?.unfulfilled > 0 || schedule.stats?.role_unfulfilled > 0) && (
            <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-800">
              Còn {schedule.stats?.unfulfilled || 0} ca thiếu và {schedule.stats?.role_unfulfilled || 0} vị trí vai trò chưa đáp ứng.
            </div>
          )}

          <div className="max-h-[42vh] overflow-auto rounded-md border border-slate-200">
            <table className="min-w-[820px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Ngày</th>
                  <th className="px-3 py-3">Ca</th>
                  <th className="px-3 py-3">Nhân viên</th>
                  <th className="px-3 py-3">Vai trò</th>
                  <th className="px-3 py-3">Giờ</th>
                  <th className="px-3 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const originalIndex = schedule.generated_shifts.findIndex((item) => item === row);
                  return (
                    <tr key={`${row.work_date}-${row.shift_id}-${row.employee_id}-${originalIndex}`} className="align-top">
                      <td className="px-3 py-3">
                        <input
                          type="date"
                          value={String(row.work_date).slice(0, 10)}
                          onChange={(event) => updateShift(originalIndex, { work_date: event.target.value })}
                          className="h-10 rounded-md border border-slate-300 px-2 text-sm font-medium outline-none focus:border-blue-600"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={row.shift_id}
                          onChange={(event) => {
                            const selected = shifts.find((shift) => String(shift.shift_id) === event.target.value);
                            updateShift(originalIndex, {
                              shift_id: Number(event.target.value),
                              shift_name: selected?.shift_name || row.shift_name,
                              start_time: selected?.start_time || row.start_time,
                              end_time: selected?.end_time || row.end_time,
                            });
                          }}
                          className="h-10 w-36 rounded-md border border-slate-300 bg-white px-2 text-sm font-medium outline-none focus:border-blue-600"
                        >
                          {shifts.map((shift) => (
                            <option key={shift.shift_id} value={shift.shift_id}>
                              {shift.shift_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={row.employee_id}
                          onChange={(event) => {
                            const selected = employees.find((employee) => String(employee.employee_id) === event.target.value);
                            updateShift(originalIndex, {
                              employee_id: Number(event.target.value),
                              employee_name: selected?.name || row.employee_name,
                            });
                          }}
                          className="h-10 w-44 rounded-md border border-slate-300 bg-white px-2 text-sm font-medium outline-none focus:border-blue-600"
                        >
                          {employees.map((employee) => (
                            <option key={employee.employee_id} value={employee.employee_id}>
                              {employee.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={row.role_id || ""}
                          onChange={(event) => {
                            const selected = roles.find((role) => String(role.role_id) === event.target.value);
                            updateShift(originalIndex, {
                              role_id: event.target.value ? Number(event.target.value) : null,
                              role_name: selected?.role_name || null,
                            });
                          }}
                          className="h-10 w-36 rounded-md border border-slate-300 bg-white px-2 text-sm font-medium outline-none focus:border-blue-600"
                        >
                          <option value="">Không chọn</option>
                          {roles.map((role) => (
                            <option key={role.role_id} value={role.role_id}>
                              {role.role_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-600">
                        {formatTime(row.start_time)} - {formatTime(row.end_time)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button type="button" onClick={() => removeShift(originalIndex)} className="rounded-md px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50">
                          Xóa
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-4 sm:px-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <Input
              label="Tên bản nháp"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="bg-white"
            />
            <Button variant="outlined" onClick={onSaveDraft} disabled={loading || !draftName.trim()} className="rounded-md normal-case">
              {loading ? "Đang lưu..." : "Lưu nháp"}
            </Button>
            <Button onClick={onPublish} disabled={loading || rows.length === 0} className="rounded-md bg-blue-700 normal-case">
              {loading ? "Đang công bố..." : "Công bố lịch"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export default function AutoScheduleModal({ open, onClose, onGenerate, scheduleSettings }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [shifts, setShifts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [availability, setAvailability] = useState({});
  const [configMode, setConfigMode] = useState("general");
  const [generalConfig, setGeneralConfig] = useState({});
  const [detailedConfig, setDetailedConfig] = useState({});
  const [roleRequirements, setRoleRequirements] = useState({});
  const [generatedSchedule, setGeneratedSchedule] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const roleConstraintCount = useMemo(() => summarizeRoleConstraints(roleRequirements), [roleRequirements]);

  const fetchBaseData = useCallback(async () => {
    try {
      const [shiftRes, roleRes, employeeRes] = await Promise.all([
        axios.get(`${API_URL}/shifts`, { headers: authHeaders() }),
        axios.get(`${API_URL}/roles`, { headers: authHeaders() }),
        axios.get(`${API_URL}/employees`, { headers: authHeaders() }),
      ]);

      const shiftList = shiftRes.data || [];
      setShifts(shiftList);
      setRoles(roleRes.data || []);
      setEmployees(employeeRes.data || []);
      setGeneralConfig(buildGeneralConfig(shiftList));
      setRoleRequirements(emptyRoleRequirements(shiftList));
    } catch (err) {
      setNotice(err.response?.data?.message || "Không thể tải dữ liệu cấu hình");
    }
  }, []);

  const fetchAvailability = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/schedules/availability/${month}/${year}`, {
        headers: authHeaders(),
      });
      setAvailability(res.data.availability || {});
    } catch {
      setAvailability({});
    }
  }, [month, year]);

  useEffect(() => {
    if (!open) return;
    fetchBaseData();
  }, [fetchBaseData, open]);

  useEffect(() => {
    if (!open) return;
    fetchAvailability();
  }, [fetchAvailability, open]);

  useEffect(() => {
    if (!shifts.length) return;
    setDetailedConfig(buildDetailedFromGeneral({ generalConfig, shifts, month, year }));
  }, [generalConfig, month, shifts, year]);

  const closeModal = () => {
    setGeneratedSchedule(null);
    setPreviewOpen(false);
    setNotice("");
    onClose();
  };

  const resetConfig = () => {
    const nextGeneral = buildGeneralConfig(shifts);
    setGeneralConfig(nextGeneral);
    setDetailedConfig(buildDetailedFromGeneral({ generalConfig: nextGeneral, shifts, month, year }));
    setRoleRequirements(emptyRoleRequirements(shifts));
  };

  const autoFillWorkdays = () => {
    const nextGeneral = buildGeneralConfig(shifts);
    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      shifts.forEach((shift) => {
        nextGeneral[dayIndex][shift.shift_id] = 1;
      });
    }
    setGeneralConfig(nextGeneral);
    setConfigMode("general");
  };

  const setGeneralValue = (dayIndex, shiftId, value) => {
    setGeneralConfig((current) => ({
      ...current,
      [dayIndex]: {
        ...current[dayIndex],
        [shiftId]: normalizeCount(value),
      },
    }));
  };

  const setDetailedValue = (dateStr, shiftId, value) => {
    setDetailedConfig((current) => ({
      ...current,
      [dateStr]: {
        ...current[dateStr],
        [shiftId]: normalizeCount(value),
      },
    }));
  };

  const setRoleRequirement = (shiftId, roleId, value) => {
    setRoleRequirements((current) => ({
      ...current,
      [shiftId]: {
        ...current[shiftId],
        [roleId]: normalizeCount(value),
      },
    }));
  };

  const clearRoleRequirements = () => {
    setRoleRequirements(emptyRoleRequirements(shifts));
  };

  const buildRolePayload = () => {
    if (roleConstraintCount === 0) return {};

    return Object.entries(roleRequirements).reduce((payload, [shiftId, roleMap]) => {
      const rolesForShift = Object.entries(roleMap || {}).reduce((rolePayload, [roleId, count]) => {
        const requiredCount = normalizeCount(count);
        if (requiredCount > 0) {
          const role = roles.find((item) => Number(item.role_id) === Number(roleId));
          rolePayload[Number(roleId)] = {
            required_count: requiredCount,
            role_name: role?.role_name,
          };
        }
        return rolePayload;
      }, {});

      if (Object.keys(rolesForShift).length > 0) {
        payload[Number(shiftId)] = rolesForShift;
      }
      return payload;
    }, {});
  };

  const configForGeneration = () => {
    if (configMode === "general") {
      return buildDetailedFromGeneral({ generalConfig, shifts, month, year });
    }
    return detailedConfig;
  };

  const handleGenerate = async () => {
    const detailed = configForGeneration();
    const hasRequirement = Object.values(detailed).some((dayConfig) =>
      Object.values(dayConfig || {}).some((count) => Number(count) > 0),
    );

    if (!hasRequirement) {
      setNotice("Hãy nhập số người cần xếp cho ít nhất một ca.");
      return;
    }

    const normalizedDetailed = Object.entries(detailed).reduce((payload, [dateStr, dayConfig]) => {
      payload[dateStr] = {};
      Object.entries(dayConfig || {}).forEach(([shiftId, count]) => {
        payload[dateStr][Number(shiftId)] = normalizeCount(count);
      });
      return payload;
    }, {});

    const shiftsWithRequirements = shifts
      .map((shift) => {
        const counts = Object.values(normalizedDetailed)
          .map((dayConfig) => normalizeCount(dayConfig[shift.shift_id]))
          .filter((count) => count > 0);
        if (counts.length === 0) return null;
        return {
          shift_id: shift.shift_id,
          required_employees: Math.max(...counts),
        };
      })
      .filter(Boolean);

    try {
      setLoading(true);
      setNotice("");
      const response = await axios.post(
        `${API_URL}/schedules/auto-generate`,
        {
          month,
          year,
          shifts: shiftsWithRequirements,
          detailed_requirements: normalizedDetailed,
          role_requirements: buildRolePayload(),
          scheduling_settings: scheduleSettings,
          availability,
        },
        { headers: authHeaders() },
      );

      const schedule = {
        ...response.data,
        month,
        year,
        generated_shifts: response.data.generated_shifts || [],
      };
      setGeneratedSchedule(schedule);
      setDraftName(`Lịch tháng ${month}/${year}`);
      setPreviewOpen(true);
    } catch (err) {
      setNotice(err.response?.data?.message || err.message || "Không thể tạo lịch");
    } finally {
      setLoading(false);
    }
  };

  const updateGeneratedShift = (index, patch) => {
    setGeneratedSchedule((current) => {
      if (!current) return current;
      const nextShifts = [...current.generated_shifts];
      nextShifts[index] = { ...nextShifts[index], ...patch };
      return { ...current, generated_shifts: nextShifts };
    });
  };

  const removeGeneratedShift = (index) => {
    setGeneratedSchedule((current) => {
      if (!current) return current;
      return {
        ...current,
        generated_shifts: current.generated_shifts.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const generatedPayload = (status) =>
    (generatedSchedule?.generated_shifts || []).map((shift) => ({
      employee_id: shift.employee_id,
      shift_id: shift.shift_id,
      work_date: String(shift.work_date).slice(0, 10),
      role_id: shift.role_id || null,
      status,
    }));

  const handleSaveDraft = async () => {
    if (!draftName.trim()) return;

    try {
      setLoading(true);
      const response = await axios.post(
        `${API_URL}/schedules/drafts`,
        {
          name: draftName.trim(),
          month,
          year,
          shifts: generatedPayload("DRAFT"),
        },
        { headers: authHeaders() },
      );
      onGenerate?.(response.data);
      closeModal();
    } catch (err) {
      setNotice(err.response?.data?.message || err.message || "Không thể lưu nháp");
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    try {
      setLoading(true);
      await axios.post(
        `${API_URL}/schedules/publish`,
        {
          month,
          year,
          shifts: generatedPayload("PUBLISHED"),
        },
        { headers: authHeaders() },
      );
      onGenerate?.({ month, year });
      closeModal();
    } catch (err) {
      setNotice(err.response?.data?.message || err.message || "Không thể công bố lịch");
    } finally {
      setLoading(false);
    }
  };

  const detailedRows = useMemo(
    () =>
      Object.entries(detailedConfig)
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .map(([dateStr, dayConfig]) => ({ dateStr, dayConfig })),
    [detailedConfig],
  );

  return (
    <Dialog open={open} handler={closeModal} size="lg" className="w-[min(96vw,1040px)] overflow-hidden rounded-md">
      <div className="flex max-h-[72vh] flex-col overflow-hidden bg-white font-sans">
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Typography variant="h6" className="font-semibold text-slate-950">
                Tự động xếp lịch
              </Typography>
              <Typography className="mt-1 text-sm font-medium text-slate-500">
                Chọn số người cần cho từng ca, tạo lịch rồi kiểm tra trước khi lưu.
              </Typography>
            </div>
            <button type="button" onClick={closeModal} className="self-start rounded-md px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">
              Đóng
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50 p-4 sm:p-5">
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Tháng" value={String(month)} onChange={(value) => setMonth(Number(value))}>
                      {Array.from({ length: 12 }, (_, index) => (
                        <Option key={index + 1} value={String(index + 1)}>
                          Tháng {index + 1}
                        </Option>
                      ))}
                    </Select>
                    <Select label="Năm" value={String(year)} onChange={(value) => setYear(Number(value))}>
                      {[2025, 2026, 2027, 2028].map((item) => (
                        <Option key={item} value={String(item)}>
                          {item}
                        </Option>
                      ))}
                    </Select>
                  </div>

                  <div className="relative flex h-11 rounded-full bg-slate-100 p-1">
                    <span
                      className={`absolute top-1 h-9 w-[calc(50%-4px)] rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        configMode === "detailed" ? "translate-x-full" : "translate-x-0"
                      }`}
                    />
                    {VIEW_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setConfigMode(mode.value)}
                        className={`relative z-10 flex-1 rounded-full text-sm font-semibold transition ${
                          configMode === mode.value ? "text-blue-700" : "text-slate-500"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-slate-950">Cấu hình nhanh</div>
                <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
                  <Button size="sm" variant="outlined" className="rounded-md px-2 normal-case" onClick={autoFillWorkdays}>
                    Điền ngày thường
                  </Button>
                  <Button size="sm" variant="outlined" className="rounded-md px-2 normal-case" onClick={() => setRoleDialogOpen(true)}>
                    Vai trò từng ca
                    {roleConstraintCount > 0 ? ` (${roleConstraintCount})` : ""}
                  </Button>
                  <Button size="sm" variant="text" className="rounded-md px-2 normal-case text-orange-700" onClick={resetConfig}>
                    Đặt lại
                  </Button>
                </div>
              </div>

            </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-950">Dữ liệu sẵn sàng</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-lg font-semibold">{shifts.length}</div>
                    <div className="text-xs font-bold text-slate-500">Ca</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-lg font-semibold">{employees.length}</div>
                    <div className="text-xs font-bold text-slate-500">NV</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-lg font-semibold">{Object.keys(availability).length}</div>
                    <div className="text-xs font-bold text-slate-500">Rảnh</div>
                  </div>
                </div>
              </div>

            <section className="rounded-md border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                <Typography className="font-semibold text-slate-950">
                  {configMode === "general" ? "Số người cần theo tuần" : `Số người cần trong tháng ${month}/${year}`}
                </Typography>
              </div>

              <div className="p-4 sm:p-5">
                {notice && (
                  <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-800">
                    {notice}
                  </div>
                )}

                {configMode === "general" ? (
                  <div className="max-h-[42vh] overflow-auto rounded-md border border-slate-200">
                    <table className="min-w-[680px] w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-3">Ngày</th>
                          {shifts.map((shift) => (
                            <th key={shift.shift_id} className="px-3 py-3 text-center">
                              <div>{shift.shift_name}</div>
                              <div className="mt-1 font-medium normal-case text-slate-400">{formatTime(shift.start_time)}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {DAYS_OF_WEEK.map((day, dayIndex) => (
                          <tr key={day}>
                            <td className="px-3 py-3 font-semibold text-slate-800">{day}</td>
                            {shifts.map((shift) => (
                              <td key={shift.shift_id} className="px-3 py-3 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={generalConfig[dayIndex]?.[shift.shift_id] || 0}
                                  onChange={(event) => setGeneralValue(dayIndex, shift.shift_id, event.target.value)}
                                  className="h-10 w-16 rounded-md border border-slate-300 text-center text-sm font-semibold outline-none focus:border-blue-600"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="max-h-[42vh] overflow-auto rounded-md border border-slate-200">
                    <table className="min-w-[680px] w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-3">Ngày</th>
                          {shifts.map((shift) => (
                            <th key={shift.shift_id} className="px-3 py-3 text-center">
                              {shift.shift_name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detailedRows.map(({ dateStr, dayConfig }) => {
                          const date = new Date(`${dateStr}T00:00:00`);
                          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                          return (
                            <tr key={dateStr} className={isWeekend ? "bg-orange-50/40" : ""}>
                              <td className="px-3 py-3">
                                <div className="font-semibold text-slate-800">{formatDate(dateStr)}</div>
                                <div className="text-xs font-medium text-slate-500">{DAYS_OF_WEEK[(date.getDay() + 6) % 7]}</div>
                              </td>
                              {shifts.map((shift) => (
                                <td key={shift.shift_id} className="px-3 py-3 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    value={dayConfig[shift.shift_id] || 0}
                                    onChange={(event) => setDetailedValue(dateStr, shift.shift_id, event.target.value)}
                                    className="h-10 w-16 rounded-md border border-slate-300 text-center text-sm font-semibold outline-none focus:border-blue-600"
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <Button variant="outlined" className="rounded-md normal-case" onClick={() => setShowDraftModal(true)} disabled={loading}>
            Xem bản nháp
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outlined" className="rounded-md normal-case" onClick={closeModal} disabled={loading}>
              Hủy
            </Button>
            <Button className="rounded-md bg-blue-700 normal-case" onClick={handleGenerate} disabled={loading || shifts.length === 0}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner className="h-4 w-4" /> Đang tạo
                </span>
              ) : (
                "Tạo lịch"
              )}
            </Button>
          </div>
        </div>
      </div>

      <RoleRequirementsDialog
        open={roleDialogOpen}
        onClose={() => setRoleDialogOpen(false)}
        roles={roles}
        shifts={shifts}
        roleRequirements={roleRequirements}
        setRoleRequirement={setRoleRequirement}
        clearRoleRequirements={clearRoleRequirements}
      />

      <PreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        schedule={generatedSchedule}
        employees={employees}
        shifts={shifts}
        roles={roles}
        draftName={draftName}
        setDraftName={setDraftName}
        updateShift={updateGeneratedShift}
        removeShift={removeGeneratedShift}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
        loading={loading}
      />

      <DraftSchedulesModal open={showDraftModal} onClose={() => setShowDraftModal(false)} />
    </Dialog>
  );
}
