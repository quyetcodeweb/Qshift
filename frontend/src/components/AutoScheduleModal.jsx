import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  Input,
  Option,
  Select,
  Spinner,
  Typography,
} from "@material-tailwind/react";
import axios from "axios";
import DraftSchedulesModal from "./DraftSchedulesModal";
import { API_URL } from "../services/api";

const DAYS_OF_WEEK = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
  "Chủ nhật",
];
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
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
    "vi-VN",
  );
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : "--:--";
}

function shiftMinutes(shift) {
  const [startHour = 0, startMinute = 0] = String(shift?.start_time || "00:00")
    .split(":")
    .map(Number);
  const [endHour = 0, endMinute = 0] = String(shift?.end_time || "00:00")
    .split(":")
    .map(Number);
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function shiftsOverlap(first, second) {
  const firstTime = shiftMinutes(first);
  const secondTime = shiftMinutes(second);
  return firstTime.start < secondTime.end && secondTime.start < firstTime.end;
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
      detailed[key][shift.shift_id] = normalizeCount(
        generalConfig[dayIndex]?.[shift.shift_id],
      );
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
    (total, roleMap) =>
      total +
      Object.values(roleMap || {}).filter((config) => {
        const count =
          typeof config === "object" && config !== null
            ? config.required_count
            : config;
        return Number(count) > 0;
      }).length,
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
      <div className="text-xs font-bold uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function ScrollSelect({
  value,
  options,
  onChange,
  placeholder = "Chọn",
  disabled = false,
  className = "",
  buttonClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(
    (option) => String(option.value) === String(value),
  );

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-10 w-full items-center justify-between rounded-md border bg-white px-2 text-left text-sm font-medium outline-none transition focus:border-blue-600 disabled:cursor-not-allowed disabled:bg-slate-50 ${buttonClassName}`}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected?.label || placeholder}
        </span>
        <span className="ml-2 shrink-0 text-xs text-slate-400">▾</span>
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 min-w-full overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white py-1 shadow-xl">
          {options.map((option) => (
            <button
              key={option.value || "__empty"}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm font-semibold hover:bg-slate-50 ${
                String(option.value) === String(value)
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-700"
              }`}
            >
              <span className="block truncate">{option.label}</span>
            </button>
          ))}
        </div>
      )}
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
    <Dialog
      open={open}
      handler={onClose}
      size="lg"
      className="w-[min(94vw,900px)] overflow-hidden rounded-md"
    >
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
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100"
            >
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
                        <span className="block max-w-28 truncate normal-case">
                          {role.role_name}
                        </span>
                        <span className="mt-1 block text-[10px] normal-case text-slate-400">
                          SL / ưu tiên
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shifts.map((shift) => (
                    <tr key={shift.shift_id}>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">
                          {shift.shift_name}
                        </div>
                        <div className="text-xs font-medium text-slate-500">
                          {formatTime(shift.start_time)} -{" "}
                          {formatTime(shift.end_time)}
                        </div>
                      </td>
                      {roles.map((role) => (
                        <td
                          key={role.role_id}
                          className="px-3 py-3 text-center"
                        >
                          <div className="flex justify-center gap-1">
                            <input
                              type="number"
                              min="0"
                              value={
                                roleRequirements[shift.shift_id]?.[
                                  role.role_id
                                ]?.required_count ??
                                roleRequirements[shift.shift_id]?.[
                                  role.role_id
                                ] ??
                                0
                              }
                              onChange={(event) =>
                                setRoleRequirement(
                                  shift.shift_id,
                                  role.role_id,
                                  "required_count",
                                  event.target.value,
                                )
                              }
                              className="h-9 w-12 rounded-md border border-slate-300 bg-white px-2 text-center text-sm font-medium text-slate-950 outline-none focus:border-blue-600"
                              title="Số lượng mong muốn"
                            />
                            <input
                              type="number"
                              min="1"
                              value={
                                roleRequirements[shift.shift_id]?.[
                                  role.role_id
                                ]?.priority || 1
                              }
                              onChange={(event) =>
                                setRoleRequirement(
                                  shift.shift_id,
                                  role.role_id,
                                  "priority",
                                  event.target.value,
                                )
                              }
                              className="h-9 w-12 rounded-md border border-slate-300 bg-white px-2 text-center text-sm font-medium text-slate-950 outline-none focus:border-blue-600"
                              title="Ưu tiên: số nhỏ hơn được xếp trước"
                            />
                          </div>
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
          <Button
            variant="outlined"
            className="rounded-md border-slate-300 normal-case text-slate-700"
            onClick={clearRoleRequirements}
          >
            Xóa ràng buộc
          </Button>
          <Button
            className="rounded-md bg-green-600 normal-case"
            onClick={onClose}
          >
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
  availability,
  employeeRoles,
  draftName,
  setDraftName,
  updateShift,
  removeShift,
  addShift,
  onSaveDraft,
  onPublish,
  loading,
}) {
  const [previewMode, setPreviewMode] = useState("list");
  const [missingOnly, setMissingOnly] = useState(false);
  const [proposeSupplemental, setProposeSupplemental] = useState(false);

  const rows = useMemo(() => {
    const generated = schedule?.generated_shifts || [];
    return [...generated].sort((a, b) => {
      const dateCompare = String(a.work_date).localeCompare(
        String(b.work_date),
      );
      if (dateCompare !== 0) return dateCompare;
      return String(a.start_time || "").localeCompare(
        String(b.start_time || ""),
      );
    });
  }, [schedule]);
  const shiftsById = useMemo(
    () => new Map(shifts.map((shift) => [Number(shift.shift_id), shift])),
    [shifts],
  );
  const isAvailable = useCallback(
    (employeeId, dateStr, shiftId) => {
      const shiftIds =
        availability?.[employeeId]?.[dateStr] ||
        availability?.[String(employeeId)]?.[dateStr] ||
        [];
      return shiftIds.map(Number).includes(Number(shiftId));
    },
    [availability],
  );
  const isAssignedToCell = useCallback(
    (employeeId, dateStr, shiftId) =>
      rows.some(
        (row) =>
          Number(row.employee_id) === Number(employeeId) &&
          String(row.work_date).slice(0, 10) === String(dateStr).slice(0, 10) &&
          Number(row.shift_id) === Number(shiftId),
      ),
    [rows],
  );
  const employeeHasRole = useCallback(
    (employeeId, roleId) =>
      (
        employeeRoles[employeeId] ||
        employeeRoles[String(employeeId)] ||
        []
      ).some((role) => Number(role.role_id) === Number(roleId)),
    [employeeRoles],
  );

  const missingItems = useMemo(() => {
    if (!schedule?.assignment_details) return [];

    return Object.entries(schedule.assignment_details)
      .map(([key, detail]) => {
        const [dateStr, shiftId] = key.split("_");
        const shift = shiftsById.get(Number(shiftId));
        const assignedRows = rows.filter(
          (row) =>
            String(row.work_date).slice(0, 10) === dateStr &&
            Number(row.shift_id) === Number(shiftId),
        );
        const missingCount = Math.max(
          0,
          normalizeCount(detail.required) - assignedRows.length,
        );
        const missingRoles = (detail.role_requirements || [])
          .map((role) => {
            const assignedForRole = assignedRows.filter(
              (row) => Number(row.role_id) === Number(role.role_id),
            ).length;
            return {
              ...role,
              assigned: assignedForRole,
              shortfall: Math.max(
                0,
                normalizeCount(role.required) - assignedForRole,
              ),
            };
          })
          .filter((role) => normalizeCount(role.shortfall) > 0);
        const roleMissingCount = missingRoles.reduce(
          (sum, role) => sum + normalizeCount(role.shortfall),
          0,
        );

        if (missingCount <= 0 && roleMissingCount <= 0) return null;

        const roleIds = missingRoles.map((role) => Number(role.role_id));
        const availableOtherRoleEmployees = employees.filter((employee) => {
          if (!isAvailable(employee.employee_id, dateStr, shiftId))
            return false;
          if (isAssignedToCell(employee.employee_id, dateStr, shiftId))
            return false;
          if (roleIds.length === 0) return false;
          return !roleIds.some((roleId) =>
            employeeHasRole(employee.employee_id, roleId),
          );
        });

        return {
          key,
          dateStr,
          shift_id: Number(shiftId),
          shift_name: shift?.shift_name || `Ca ${shiftId}`,
          start_time: shift?.start_time,
          end_time: shift?.end_time,
          missingCount,
          displayMissingCount: Math.max(missingCount, roleMissingCount),
          missingRoles,
          availableOtherRoleEmployees,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const dateCompare = a.dateStr.localeCompare(b.dateStr);
        if (dateCompare !== 0) return dateCompare;
        return String(a.start_time || "").localeCompare(
          String(b.start_time || ""),
        );
      });
  }, [
    employees,
    employeeHasRole,
    isAssignedToCell,
    isAvailable,
    rows,
    schedule,
    shiftsById,
  ]);

  const missingByCell = useMemo(
    () =>
      new Map(
        missingItems.map((item) => [`${item.dateStr}_${item.shift_id}`, item]),
      ),
    [missingItems],
  );

  const conflicts = useMemo(() => {
    const messagesByIndex = new Map();

    rows.forEach((row, index) => {
      rows.forEach((other, otherIndex) => {
        if (index >= otherIndex) return;
        if (Number(row.employee_id) !== Number(other.employee_id)) return;
        if (
          String(row.work_date).slice(0, 10) !==
          String(other.work_date).slice(0, 10)
        )
          return;

        const rowShift = shiftsById.get(Number(row.shift_id)) || row;
        const otherShift = shiftsById.get(Number(other.shift_id)) || other;
        const isDuplicate = Number(row.shift_id) === Number(other.shift_id);
        if (!isDuplicate && !shiftsOverlap(rowShift, otherShift)) return;

        const message = isDuplicate
          ? "Trùng nhân viên trong cùng ca"
          : "Nhân viên bị trùng giờ ca";
        messagesByIndex.set(index, [
          ...(messagesByIndex.get(index) || []),
          message,
        ]);
        messagesByIndex.set(otherIndex, [
          ...(messagesByIndex.get(otherIndex) || []),
          message,
        ]);
      });
    });

    return messagesByIndex;
  }, [rows, shiftsById]);

  const dates = useMemo(
    () =>
      [
        ...new Set([
          ...rows.map((row) => String(row.work_date).slice(0, 10)),
          ...missingItems.map((item) => item.dateStr),
        ]),
      ].sort(),
    [missingItems, rows],
  );

  const tableDates = useMemo(
    () =>
      missingOnly
        ? dates.filter((dateStr) =>
            shifts.some((shift) =>
              missingByCell.has(`${dateStr}_${shift.shift_id}`),
            ),
          )
        : dates,
    [dates, missingByCell, missingOnly, shifts],
  );

  const cellTitle = (missingItem) => {
    if (!missingItem) return "";
    const roleText = missingItem.missingRoles.length
      ? missingItem.missingRoles
          .map(
            (role) => `${role.role_name || "Vai trò"}: thiếu ${role.shortfall}`,
          )
          .join(", ")
      : "Không thiếu vai trò cụ thể";
    const fallbackText = missingItem.availableOtherRoleEmployees.length
      ? missingItem.availableOtherRoleEmployees
          .map((employee) => employee.name)
          .join(", ")
      : "Không có";
    return `Thiếu ${missingItem.displayMissingCount} người/vị trí. Vai trò thiếu: ${roleText}. Rảnh nhưng khác vai trò: ${fallbackText}.`;
  };

  const missingSlots = useMemo(
    () =>
      missingItems.flatMap((item) => {
        const roleSlots = item.missingRoles.flatMap((role) =>
          Array.from(
            { length: normalizeCount(role.shortfall) },
            (_, index) => ({
              ...item,
              key: `${item.key}_role_${role.role_id}_${index}`,
              role_id: role.role_id,
              role_name: role.role_name,
            }),
          ),
        );
        const generalCount = Math.max(0, item.missingCount - roleSlots.length);
        const generalSlots = Array.from(
          { length: generalCount },
          (_, index) => ({
            ...item,
            key: `${item.key}_general_${index}`,
            role_id: null,
            role_name: null,
          }),
        );
        return [...roleSlots, ...generalSlots];
      }),
    [missingItems],
  );

  const listRows = useMemo(() => {
    const assignedRows = rows.map((row) => ({ type: "assigned", row }));
    const slotRows = missingSlots.map((slot) => ({ type: "missing", slot }));
    const allRows = missingOnly ? slotRows : [...assignedRows, ...slotRows];

    return allRows.sort((a, b) => {
      const aDate =
        a.type === "assigned"
          ? String(a.row.work_date).slice(0, 10)
          : a.slot.dateStr;
      const bDate =
        b.type === "assigned"
          ? String(b.row.work_date).slice(0, 10)
          : b.slot.dateStr;
      const dateCompare = aDate.localeCompare(bDate);
      if (dateCompare !== 0) return dateCompare;
      const aShift =
        a.type === "assigned"
          ? shiftsById.get(Number(a.row.shift_id)) || a.row
          : a.slot;
      const bShift =
        b.type === "assigned"
          ? shiftsById.get(Number(b.row.shift_id)) || b.row
          : b.slot;
      const timeCompare = String(aShift.start_time || "").localeCompare(
        String(bShift.start_time || ""),
      );
      if (timeCompare !== 0) return timeCompare;
      if (a.type !== b.type) return a.type === "missing" ? 1 : -1;
      return 0;
    });
  }, [missingOnly, missingSlots, rows, shiftsById]);

  const addAssignment = (
    dateStr,
    shift,
    employeeId,
    roleId = null,
    roleName = null,
  ) => {
    if (!employeeId) return;
    const employee = employees.find(
      (item) => Number(item.employee_id) === Number(employeeId),
    );
    if (!employee) return;

    addShift({
      employee_id: Number(employee.employee_id),
      employee_name: employee.name,
      shift_id: Number(shift.shift_id),
      shift_name: shift.shift_name,
      work_date: dateStr,
      role_id: roleId ? Number(roleId) : null,
      role_name: roleName || null,
      start_time: shift.start_time,
      end_time: shift.end_time,
      status: "DRAFT",
    });
  };

  const suggestedRoleForEmployee = (missingItem, employeeId) => {
    const role = missingItem?.missingRoles?.find((item) =>
      employeeHasRole(employeeId, item.role_id),
    );
    return role || missingItem?.missingRoles?.[0] || null;
  };

  const employeeOptionLabel = (employee, dateStr, shiftId) => {
    const availableAndUnassigned =
      isAvailable(employee.employee_id, dateStr, shiftId) &&
      !isAssignedToCell(employee.employee_id, dateStr, shiftId);
    return `${employee.name}${availableAndUnassigned ? " (!)" : ""}`;
  };
  const shiftOptions = shifts.map((shift) => ({
    value: shift.shift_id,
    label: shift.shift_name,
  }));
  const roleOptions = [
    { value: "", label: "Không chọn" },
    ...roles.map((role) => ({ value: role.role_id, label: role.role_name })),
  ];
  const employeeOptionsFor = (dateStr, shiftId, placeholder = null) => [
    ...(placeholder ? [{ value: "", label: placeholder }] : []),
    ...employees.map((employee) => ({
      value: employee.employee_id,
      label: employeeOptionLabel(employee, dateStr, shiftId),
    })),
  ];

  const MissingBadge = ({ item }) => {
    if (!item) return null;
    const roleText = item.missingRoles.length
      ? item.missingRoles
          .map(
            (role) => `${role.role_name || "Vai trò"}: thiếu ${role.shortfall}`,
          )
          .join(", ")
      : "Không thiếu vai trò cụ thể";
    const fallbackText = item.availableOtherRoleEmployees.length
      ? item.availableOtherRoleEmployees
          .map((employee) => employee.name)
          .join(", ")
      : "Không có";

    return (
      <span className="group absolute right-1 top-1">
        <span className="block rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-black text-white">
          -{item.displayMissingCount}
        </span>
        <span className="pointer-events-none absolute right-0 top-6 z-20 hidden w-72 rounded-md border border-red-200 bg-white p-3 text-left text-xs font-semibold text-slate-700 shadow-xl group-hover:block">
          <span className="block font-black text-red-700">
            Thiếu {item.displayMissingCount} người/vị trí
          </span>
          <span className="mt-1 block">Vai trò thiếu: {roleText}</span>
          <span className="mt-1 block">
            Nhân viên đăng ký rảnh: {fallbackText}
            {fallbackText !== "Không có"
              ? " (nhân viên không phải vai trò này nên không được xếp)"
              : ""}
          </span>
        </span>
      </span>
    );
  };

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

  const employeeShiftStats = useMemo(() => {
    const counts = rows.reduce((map, row) => {
      const employeeId = Number(row.employee_id);
      if (!employeeId) return map;

      const current = map.get(employeeId) || {
        employee_id: employeeId,
        employee_name: row.employee_name || "Chưa rõ nhân viên",
        shift_count: 0,
      };

      current.employee_name =
        row.employee_name || current.employee_name || "Chưa rõ nhân viên";
      current.shift_count += 1;
      map.set(employeeId, current);
      return map;
    }, new Map());

    return [...counts.values()].sort((a, b) => {
      if (b.shift_count !== a.shift_count) {
        return b.shift_count - a.shift_count;
      }
      return String(a.employee_name).localeCompare(String(b.employee_name));
    });
  }, [rows]);

  const supplementalRequests = useMemo(
    () =>
      missingSlots.map((slot) => ({
        work_date: slot.dateStr,
        shift_id: slot.shift_id,
        role_id: slot.role_id || null,
        count: 1,
      })),
    [missingSlots],
  );

  if (!schedule) return null;

  return (
    <Dialog
      open={open}
      handler={onClose}
      size="xl"
      className="w-[min(96vw,1080px)] overflow-hidden rounded-md"
    >
      <div className="flex max-h-[92dvh] min-h-0 flex-col overflow-hidden bg-white font-sans">
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
            <button
              type="button"
              onClick={onClose}
              className="self-start rounded-md px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100"
            >
              Đóng
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3 sm:p-5">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatBox label="Tổng ca" value={stats.total} tone="blue" />
            <StatBox label="Nhân viên" value={stats.employees} tone="green" />
            <StatBox label="Ngày có lịch" value={stats.dates} tone="slate" />
            <StatBox
              label="Đáp ứng"
              value={`${stats.fulfillment}%`}
              tone={Number(stats.fulfillment) >= 90 ? "green" : "orange"}
            />
          </div>

          <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-2.5">
            {employeeShiftStats.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-white p-3 text-center text-sm font-semibold text-slate-500">
                Chưa có nhân viên được xếp ca.
              </div>
            ) : (
              <div className="max-h-32 overflow-y-auto overscroll-contain pr-1 sm:max-h-28">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {employeeShiftStats.map((item) => (
                    <div
                      key={item.employee_id}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2"
                    >
                      <span className="min-w-0 truncate text-sm font-bold text-slate-800">
                        {item.employee_name}
                      </span>
                      <span className="shrink-0 rounded bg-blue-50 px-2 py-0.5 text-xs font-black text-blue-700">
                        {item.shift_count} ca
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {(schedule.stats?.unfulfilled > 0 ||
            schedule.stats?.role_unfulfilled > 0) && (
            <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-800">
              Còn {schedule.stats?.unfulfilled || 0} ca thiếu và{" "}
              {schedule.stats?.role_unfulfilled || 0} vị trí vai trò chưa đáp
              ứng.
            </div>
          )}

          {conflicts.size > 0 && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              Có {conflicts.size} dòng đang trùng nhân viên hoặc trùng giờ ca.
              Hãy kiểm tra các dòng được tô đỏ trước khi lưu/công bố.
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-md border border-slate-200 bg-white p-1">
              {[
                ["list", "Từng dòng"],
                ["table", "Bảng"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPreviewMode(value)}
                  className={`rounded px-3 py-1.5 text-sm font-bold ${
                    previewMode === value
                      ? "bg-green-500 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMissingOnly((current) => !current)}
              className={`rounded-md border px-3 py-2 text-sm font-bold ${
                missingOnly
                  ? "border-red-600 bg-red-50 text-red-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Chỉ hiển thị ca bị thiếu
            </button>
          </div>

          {previewMode === "list" ? (
            <div className="min-h-[320px] flex-1 overflow-auto overscroll-contain rounded-md border border-slate-200 sm:min-h-[380px]">
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
                  {listRows.map((item) => {
                    if (item.type === "missing") {
                      const slot = item.slot;
                      const shift =
                        shiftsById.get(Number(slot.shift_id)) || slot;

                      return (
                        <tr
                          key={`missing-${slot.key}`}
                          className="bg-red-50 align-top text-red-900"
                          title={cellTitle(slot)}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="date"
                              value={slot.dateStr}
                              readOnly
                              className="h-10 rounded-md border border-red-200 bg-red-50 px-2 text-sm font-bold text-red-900 outline-none"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <ScrollSelect
                              value={slot.shift_id}
                              options={[
                                {
                                  value: slot.shift_id,
                                  label: slot.shift_name,
                                },
                              ]}
                              disabled
                              className="w-36"
                              buttonClassName="border-red-200 bg-red-50 font-bold text-red-900"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <ScrollSelect
                              value=""
                              onChange={(value) => {
                                const selectedRole = slot.role_id
                                  ? slot
                                  : suggestedRoleForEmployee(slot, value);
                                addAssignment(
                                  slot.dateStr,
                                  shift,
                                  value,
                                  selectedRole?.role_id,
                                  selectedRole?.role_name,
                                );
                              }}
                              options={employeeOptionsFor(
                                slot.dateStr,
                                slot.shift_id,
                                "Chọn nhân viên bù",
                              )}
                              placeholder="Chọn nhân viên bù"
                              className="w-44"
                              buttonClassName="border-red-300 font-semibold text-red-900 focus:border-red-600"
                            />
                            <div className="mt-1 text-xs font-bold text-red-700">
                              Thiếu 1{" "}
                              {slot.role_name
                                ? `vai trò ${slot.role_name}`
                                : "người"}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <ScrollSelect
                              value={slot.role_id || ""}
                              disabled
                              options={[
                                {
                                  value: slot.role_id || "",
                                  label: slot.role_name || "Không chọn",
                                },
                              ]}
                              className="w-36"
                              buttonClassName="border-red-200 bg-red-50 font-semibold text-red-900"
                            />
                          </td>
                          <td className="px-3 py-3 font-medium">
                            {formatTime(slot.start_time)} -{" "}
                            {formatTime(slot.end_time)}
                          </td>
                          <td className="px-3 py-3 text-right text-xs font-bold">
                            Đang thiếu
                          </td>
                        </tr>
                      );
                    }

                    const row = item.row;
                    const originalIndex = schedule.generated_shifts.findIndex(
                      (item) => item === row,
                    );
                    const rowIndex = rows.findIndex((item) => item === row);
                    const rowConflicts = conflicts.get(rowIndex) || [];
                    const rowMissingItem = missingByCell.get(
                      `${String(row.work_date).slice(0, 10)}_${row.shift_id}`,
                    );
                    return (
                      <tr
                        key={`${row.work_date}-${row.shift_id}-${row.employee_id}-${originalIndex}`}
                        className="align-top"
                        title={
                          rowConflicts.length
                            ? rowConflicts.join(", ")
                            : cellTitle(rowMissingItem)
                        }
                      >
                        <td className="px-3 py-3">
                          <input
                            type="date"
                            value={String(row.work_date).slice(0, 10)}
                            onChange={(event) =>
                              updateShift(originalIndex, {
                                work_date: event.target.value,
                              })
                            }
                            className="h-10 rounded-md border border-slate-300 px-2 text-sm font-medium outline-none focus:border-blue-600"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <ScrollSelect
                            value={row.shift_id}
                            onChange={(value) => {
                              const selected = shifts.find(
                                (shift) =>
                                  String(shift.shift_id) === String(value),
                              );
                              updateShift(originalIndex, {
                                shift_id: Number(value),
                                shift_name:
                                  selected?.shift_name || row.shift_name,
                                start_time:
                                  selected?.start_time || row.start_time,
                                end_time: selected?.end_time || row.end_time,
                              });
                            }}
                            options={shiftOptions}
                            className="w-36"
                            buttonClassName="border-slate-300"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <ScrollSelect
                            value={row.employee_id}
                            onChange={(value) => {
                              const selected = employees.find(
                                (employee) =>
                                  String(employee.employee_id) ===
                                  String(value),
                              );
                              updateShift(originalIndex, {
                                employee_id: Number(value),
                                employee_name:
                                  selected?.name || row.employee_name,
                              });
                            }}
                            options={employeeOptionsFor(
                              row.work_date,
                              row.shift_id,
                            )}
                            className="w-44"
                            buttonClassName="border-slate-300"
                          />
                          {rowConflicts.length > 0 && (
                            <div className="mt-1 text-xs font-bold text-red-700">
                              {rowConflicts[0]}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <ScrollSelect
                            value={row.role_id || ""}
                            onChange={(value) => {
                              const selected = roles.find(
                                (role) =>
                                  String(role.role_id) === String(value),
                              );
                              updateShift(originalIndex, {
                                role_id: value ? Number(value) : null,
                                role_name: selected?.role_name || null,
                              });
                            }}
                            options={roleOptions}
                            className="w-36"
                            buttonClassName="border-slate-300"
                          />
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-600">
                          {formatTime(row.start_time)} -{" "}
                          {formatTime(row.end_time)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeShift(originalIndex)}
                            className="rounded-md px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="min-h-[320px] flex-1 overflow-auto overscroll-contain rounded-md border border-slate-200 bg-white sm:min-h-[380px]">
              <table className="min-w-[920px] w-full table-fixed text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-36 px-3 py-3">Ngày</th>
                    {shifts.map((shift) => (
                      <th
                        key={shift.shift_id}
                        className="px-3 py-3 text-center"
                      >
                        {shift.shift_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableDates.map((dateStr) => (
                    <tr key={dateStr}>
                      <td className="px-3 py-3 font-bold text-slate-800">
                        <div>{formatDate(dateStr)}</div>
                        <div className="text-xs font-medium text-slate-500">
                          {
                            DAYS_OF_WEEK[
                              (new Date(`${dateStr}T00:00:00`).getDay() + 6) % 7
                            ]
                          }
                        </div>
                      </td>
                      {shifts.map((shift) => {
                        const assigned = rows.filter(
                          (row) =>
                            String(row.work_date).slice(0, 10) === dateStr &&
                            Number(row.shift_id) === Number(shift.shift_id),
                        );
                        const missingItem = missingByCell.get(
                          `${dateStr}_${shift.shift_id}`,
                        );
                        return (
                          <td
                            key={shift.shift_id}
                            className="px-2 py-2 align-top"
                          >
                            <div
                              className={`relative min-h-24 rounded-md border p-2 ${
                                missingItem
                                  ? "border-red-500 bg-red-50"
                                  : "border-slate-200 bg-slate-50"
                              }`}
                            >
                              <MissingBadge item={missingItem} />
                              <div className="space-y-1 pr-8">
                                {assigned.length === 0 && (
                                  <div className="text-xs font-semibold text-slate-400">
                                    Chưa có nhân viên
                                  </div>
                                )}
                                {assigned.map((row) => {
                                  const originalIndex =
                                    schedule.generated_shifts.findIndex(
                                      (item) => item === row,
                                    );
                                  return (
                                    <div
                                      key={`${row.employee_id}-${row.role_id || "none"}-${originalIndex}`}
                                      className="flex items-start justify-between gap-2 rounded bg-white px-2 py-1 text-xs font-bold text-slate-800 shadow-sm"
                                    >
                                      <span className="min-w-0">
                                        <span className="block truncate">
                                          {row.employee_name}
                                        </span>
                                        {row.role_name ? (
                                          <span className="font-medium text-slate-500">
                                            ({row.role_name})
                                          </span>
                                        ) : null}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeShift(originalIndex)
                                        }
                                        className="shrink-0 rounded px-1 text-[11px] font-black text-red-600 hover:bg-red-50"
                                        title="Xóa nhân viên khỏi ca"
                                      >
                                        X
                                      </button>
                                    </div>
                                  );
                                })}
                                <ScrollSelect
                                  value=""
                                  onChange={(value) => {
                                    const selectedRole = missingItem
                                      ? suggestedRoleForEmployee(
                                          missingItem,
                                          value,
                                        )
                                      : null;
                                    addAssignment(
                                      dateStr,
                                      shift,
                                      value,
                                      selectedRole?.role_id,
                                      selectedRole?.role_name,
                                    );
                                  }}
                                  options={employeeOptionsFor(
                                    dateStr,
                                    shift.shift_id,
                                    "+ Thêm nhân viên",
                                  )}
                                  placeholder="+ Thêm nhân viên"
                                  className="mt-1 w-full"
                                  buttonClassName="h-8 border-slate-200 px-2 text-xs font-bold text-blue-700 shadow-sm"
                                />
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-4 sm:px-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <label className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-800 lg:col-span-3">
              <input
                type="checkbox"
                checked={proposeSupplemental}
                disabled={supplementalRequests.length === 0}
                onChange={(event) => setProposeSupplemental(event.target.checked)}
                className="h-4 w-4 rounded border-orange-300"
              />
              <span>
                Bạn có muốn đề xuất đăng ký lịch bổ sung?
                {supplementalRequests.length > 0
                  ? ` (${supplementalRequests.length} ca thiếu)`
                  : " (không có ca thiếu)"}
              </span>
            </label>
            <Input
              label="Tên bản nháp"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="bg-white"
            />
            <Button
              variant="outlined"
              onClick={onSaveDraft}
              disabled={loading || !draftName.trim()}
              className="rounded-md normal-case"
            >
              {loading ? "Đang lưu..." : "Lưu nháp"}
            </Button>
            <Button
              onClick={() =>
                onPublish({
                  supplementalRequests: proposeSupplemental
                    ? supplementalRequests
                    : [],
                })
              }
              disabled={
                loading ||
                (rows.length === 0 &&
                  (!proposeSupplemental || supplementalRequests.length === 0))
              }
              className="rounded-md bg-blue-700 normal-case"
            >
              {loading ? "Đang công bố..." : "Công bố lịch"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export default function AutoScheduleModal({
  open,
  onClose,
  onGenerate,
  scheduleSettings,
}) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [shifts, setShifts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeRoles, setEmployeeRoles] = useState({});
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

  const roleConstraintCount = useMemo(
    () => summarizeRoleConstraints(roleRequirements),
    [roleRequirements],
  );

  const fetchBaseData = useCallback(async () => {
    try {
      const [shiftRes, roleRes, employeeRes] = await Promise.all([
        axios.get(`${API_URL}/shifts`, { headers: authHeaders() }),
        axios.get(`${API_URL}/roles`, { headers: authHeaders() }),
        axios.get(`${API_URL}/employees`, { headers: authHeaders() }),
      ]);

      const shiftList = shiftRes.data || [];
      const employeeList = employeeRes.data || [];
      setShifts(shiftList);
      setRoles(roleRes.data || []);
      setEmployees(employeeList);
      setGeneralConfig(buildGeneralConfig(shiftList));
      setRoleRequirements(emptyRoleRequirements(shiftList));

      const roleResults = await Promise.allSettled(
        employeeList.map((employee) =>
          axios.get(`${API_URL}/roles/employee/${employee.employee_id}`, {
            headers: authHeaders(),
          }),
        ),
      );
      setEmployeeRoles(
        roleResults.reduce((map, result, index) => {
          map[employeeList[index].employee_id] =
            result.status === "fulfilled" ? result.value.data || [] : [];
          return map;
        }, {}),
      );
    } catch (err) {
      setNotice(
        err.response?.data?.message || "Không thể tải dữ liệu cấu hình",
      );
    }
  }, []);

  const fetchAvailability = useCallback(async () => {
    try {
      const res = await axios.get(
        `${API_URL}/schedules/availability/${month}/${year}`,
        {
          headers: authHeaders(),
        },
      );
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
    setDetailedConfig(
      buildDetailedFromGeneral({ generalConfig, shifts, month, year }),
    );
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
    setDetailedConfig(
      buildDetailedFromGeneral({
        generalConfig: nextGeneral,
        shifts,
        month,
        year,
      }),
    );
    setRoleRequirements(emptyRoleRequirements(shifts));
  };

  const incrementAllRequirements = () => {
    if (configMode === "general") {
      setGeneralConfig((current) => {
        const nextGeneral = buildGeneralConfig(shifts);
        DAYS_OF_WEEK.forEach((_day, dayIndex) => {
          shifts.forEach((shift) => {
            nextGeneral[dayIndex][shift.shift_id] =
              normalizeCount(current[dayIndex]?.[shift.shift_id]) + 1;
          });
        });
        return nextGeneral;
      });
      return;
    }

    setDetailedConfig((current) => {
      const baseDetailed = Object.keys(current).length
        ? current
        : buildDetailedFromGeneral({ generalConfig, shifts, month, year });

      return Object.entries(baseDetailed).reduce(
        (nextDetailed, [dateStr, dayConfig]) => {
          nextDetailed[dateStr] = {};
          shifts.forEach((shift) => {
            nextDetailed[dateStr][shift.shift_id] =
              normalizeCount(dayConfig?.[shift.shift_id]) + 1;
          });
          return nextDetailed;
        },
        {},
      );
    });
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

  const setRoleRequirement = (shiftId, roleId, field, value) => {
    setRoleRequirements((current) => ({
      ...current,
      [shiftId]: {
        ...current[shiftId],
        [roleId]: {
          ...(typeof current[shiftId]?.[roleId] === "object"
            ? current[shiftId]?.[roleId]
            : { required_count: normalizeCount(current[shiftId]?.[roleId]) }),
          [field]:
            field === "priority"
              ? Math.max(1, normalizeCount(value) || 1)
              : normalizeCount(value),
        },
      },
    }));
  };

  const clearRoleRequirements = () => {
    setRoleRequirements(emptyRoleRequirements(shifts));
  };

  const buildRolePayload = () => {
    if (roleConstraintCount === 0) return {};

    return Object.entries(roleRequirements).reduce(
      (payload, [shiftId, roleMap]) => {
        const rolesForShift = Object.entries(roleMap || {}).reduce(
          (rolePayload, [roleId, config]) => {
            const requiredCount = normalizeCount(
              typeof config === "object" && config !== null
                ? config.required_count
                : config,
            );
            if (requiredCount > 0) {
              const role = roles.find(
                (item) => Number(item.role_id) === Number(roleId),
              );
              rolePayload[Number(roleId)] = {
                required_count: requiredCount,
                priority:
                  typeof config === "object" && config !== null
                    ? Math.max(1, normalizeCount(config.priority) || 1)
                    : 1,
                role_name: role?.role_name,
              };
            }
            return rolePayload;
          },
          {},
        );

        if (Object.keys(rolesForShift).length > 0) {
          payload[Number(shiftId)] = rolesForShift;
        }
        return payload;
      },
      {},
    );
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

    const normalizedDetailed = Object.entries(detailed).reduce(
      (payload, [dateStr, dayConfig]) => {
        payload[dateStr] = {};
        Object.entries(dayConfig || {}).forEach(([shiftId, count]) => {
          payload[dateStr][Number(shiftId)] = normalizeCount(count);
        });
        return payload;
      },
      {},
    );

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
      setNotice(
        err.response?.data?.message || err.message || "Không thể tạo lịch",
      );
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

  const addGeneratedShift = (shift) => {
    setGeneratedSchedule((current) => {
      if (!current) return current;
      return {
        ...current,
        generated_shifts: [...current.generated_shifts, shift],
      };
    });
  };

  const removeGeneratedShift = (index) => {
    setGeneratedSchedule((current) => {
      if (!current) return current;
      return {
        ...current,
        generated_shifts: current.generated_shifts.filter(
          (_, itemIndex) => itemIndex !== index,
        ),
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
      window.appPopup?.({
        type: "success",
        title: "Đã lưu bản nháp",
        message: `${draftName.trim()} đã được lưu.`,
      });
      closeModal();
    } catch (err) {
      setNotice(
        err.response?.data?.message || err.message || "Không thể lưu nháp",
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async ({ supplementalRequests = [] } = {}) => {
    const confirmed = await window.appConfirm?.({
      title: "Công bố lịch làm",
      message: `Công bố lịch tháng ${month}/${year} cho nhân viên?`,
      confirmText: "Công bố",
      cancelText: "Kiểm tra lại",
      type: "warning",
    });
    if (!confirmed) return;

    try {
      setLoading(true);
      await axios.post(
        `${API_URL}/schedules/publish`,
        {
          month,
          year,
          shifts: generatedPayload("PUBLISHED"),
          supplemental_requests: supplementalRequests,
        },
        { headers: authHeaders() },
      );
      onGenerate?.({ month, year });
      window.dispatchEvent(new Event("notification-count-changed"));
      window.appPopup?.({
        type: "success",
        title: "Đã công bố lịch",
        message: `Lịch tháng ${month}/${year} đã được gửi đến nhân viên.`,
      });
      closeModal();
    } catch (err) {
      setNotice(
        err.response?.data?.message || err.message || "Không thể công bố lịch",
      );
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
    <Dialog
      open={open}
      handler={closeModal}
      size="lg"
      className="w-[min(96vw,1040px)] overflow-hidden rounded-md"
    >
      <div className="flex max-h-[72vh] flex-col overflow-hidden bg-white font-sans">
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Typography variant="h6" className="font-semibold text-slate-950">
                Tự động xếp lịch
              </Typography>
              <Typography className="mt-1 text-sm font-medium text-slate-500">
                Chọn số người cần cho từng ca, tạo lịch rồi kiểm tra trước khi
                lưu.
              </Typography>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="self-start rounded-md px-3 py-2 text-sm font-bold text-gray-800 hover:bg-red-50 lg:px-2 lg:py-1"
            >
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
                    <Select
                      label="Tháng"
                      value={String(month)}
                      onChange={(value) => setMonth(Number(value))}
                    >
                      {Array.from({ length: 12 }, (_, index) => (
                        <Option key={index + 1} value={String(index + 1)}>
                          Tháng {index + 1}
                        </Option>
                      ))}
                    </Select>
                    <Select
                      label="Năm"
                      value={String(year)}
                      onChange={(value) => setYear(Number(value))}
                    >
                      {[2025, 2026, 2027, 2028].map((item) => (
                        <Option key={item} value={String(item)}>
                          {item}
                        </Option>
                      ))}
                    </Select>
                  </div>

                  <div className="relative flex h-11 rounded-full bg-gray-200 p-1">
                    <span
                      className={`absolute top-1 h-9 w-[calc(50%-4px)] rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        configMode === "detailed"
                          ? "translate-x-full"
                          : "translate-x-0"
                      }`}
                    />
                    {VIEW_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setConfigMode(mode.value)}
                        className={`relative z-10 flex-1 rounded-full text-sm font-semibold transition ${
                          configMode === mode.value
                            ? "text-blue-700"
                            : "text-slate-500"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-slate-950">
                  Cấu hình nhanh
                </div>
                <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
                  <Button
                    size="sm"
                    variant="outlined"
                    className="rounded-md px-2 normal-case"
                    onClick={incrementAllRequirements}
                  >
                    +1 tất cả
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    className="rounded-md px-2 normal-case"
                    onClick={() => setRoleDialogOpen(true)}
                  >
                    Vai trò từng ca
                    {roleConstraintCount > 0 ? ` (${roleConstraintCount})` : ""}
                  </Button>
                  <Button
                    size="sm"
                    variant="text"
                    className="rounded-md px-2 normal-case text-orange-700"
                    onClick={resetConfig}
                  >
                    Đặt lại
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-950">
                Dữ liệu sẵn sàng
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-slate-50 p-2">
                  <div className="text-lg font-semibold">{shifts.length}</div>
                  <div className="text-xs font-bold text-slate-500">Ca</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <div className="text-lg font-semibold">
                    {employees.length}
                  </div>
                  <div className="text-xs font-bold text-slate-500">NV</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <div className="text-lg font-semibold">
                    {Object.keys(availability).length}
                  </div>
                  <div className="text-xs font-bold text-slate-500">Rảnh</div>
                </div>
              </div>
            </div>

            <section className="rounded-md border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                <Typography className="font-semibold text-slate-950">
                  {configMode === "general"
                    ? "Số người cần theo tuần"
                    : `Số người cần trong tháng ${month}/${year}`}
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
                            <th
                              key={shift.shift_id}
                              className="px-3 py-3 text-center"
                            >
                              <div>{shift.shift_name}</div>
                              <div className="mt-1 font-medium normal-case text-slate-400">
                                {formatTime(shift.start_time)}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {DAYS_OF_WEEK.map((day, dayIndex) => (
                          <tr key={day}>
                            <td className="px-3 py-3 font-semibold text-slate-800">
                              {day}
                            </td>
                            {shifts.map((shift) => (
                              <td
                                key={shift.shift_id}
                                className="px-3 py-3 text-center"
                              >
                                <input
                                  type="number"
                                  min="0"
                                  value={
                                    generalConfig[dayIndex]?.[shift.shift_id] ||
                                    0
                                  }
                                  onChange={(event) =>
                                    setGeneralValue(
                                      dayIndex,
                                      shift.shift_id,
                                      event.target.value,
                                    )
                                  }
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
                            <th
                              key={shift.shift_id}
                              className="px-3 py-3 text-center"
                            >
                              {shift.shift_name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detailedRows.map(({ dateStr, dayConfig }) => {
                          const date = new Date(`${dateStr}T00:00:00`);
                          const isWeekend =
                            date.getDay() === 0 || date.getDay() === 6;
                          return (
                            <tr
                              key={dateStr}
                              className={isWeekend ? "bg-orange-50/40" : ""}
                            >
                              <td className="px-3 py-3">
                                <div className="font-semibold text-slate-800">
                                  {formatDate(dateStr)}
                                </div>
                                <div className="text-xs font-medium text-slate-500">
                                  {DAYS_OF_WEEK[(date.getDay() + 6) % 7]}
                                </div>
                              </td>
                              {shifts.map((shift) => (
                                <td
                                  key={shift.shift_id}
                                  className="px-3 py-3 text-center"
                                >
                                  <input
                                    type="number"
                                    min="0"
                                    value={dayConfig[shift.shift_id] || 0}
                                    onChange={(event) =>
                                      setDetailedValue(
                                        dateStr,
                                        shift.shift_id,
                                        event.target.value,
                                      )
                                    }
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
          <Button
            variant="outlined"
            className="rounded-md normal-case"
            onClick={() => setShowDraftModal(true)}
            disabled={loading}
          >
            Xem bản nháp
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outlined"
              className="rounded-md normal-case"
              onClick={closeModal}
              disabled={loading}
            >
              Hủy
            </Button>
            <Button
              className="rounded-md bg-blue-700 normal-case"
              onClick={handleGenerate}
              disabled={loading || shifts.length === 0}
            >
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
        availability={availability}
        employeeRoles={employeeRoles}
        draftName={draftName}
        setDraftName={setDraftName}
        updateShift={updateGeneratedShift}
        removeShift={removeGeneratedShift}
        addShift={addGeneratedShift}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
        loading={loading}
      />

      <DraftSchedulesModal
        open={showDraftModal}
        onClose={() => setShowDraftModal(false)}
      />
    </Dialog>
  );
}
