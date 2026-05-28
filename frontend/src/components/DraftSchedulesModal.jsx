import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  Input,
  Spinner,
  Typography,
} from "@material-tailwind/react";
import axios from "axios";
import { API_URL } from "../services/api";

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

function formatDateInput(value) {
  return String(value || "").slice(0, 10);
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : "--:--";
}

function ScrollSelect({
  value,
  options,
  onChange,
  placeholder = "Chọn",
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
        onClick={() => setOpen((current) => !current)}
        className={`flex h-10 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-2 text-left text-sm font-medium outline-none transition focus:border-blue-600 ${buttonClassName}`}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected?.label || placeholder}
        </span>
        <span className="ml-2 shrink-0 text-xs text-slate-400">▾</span>
      </button>
      {open && (
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

function Stat({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

export default function DraftSchedulesModal({ open, onClose }) {
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [items, setItems] = useState([]);
  const [draftName, setDraftName] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);

  const shiftOptions = useMemo(
    () =>
      shifts.map((shift) => ({
        value: shift.shift_id,
        label: shift.shift_name,
      })),
    [shifts],
  );
  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.employee_id,
        label: employee.name,
      })),
    [employees],
  );
  const roleOptions = useMemo(
    () => [
      { value: "", label: "Không chọn" },
      ...roles.map((role) => ({ value: role.role_id, label: role.role_name })),
    ],
    [roles],
  );

  const loadBaseData = useCallback(async () => {
    const headers = authHeaders();
    const [shiftRes, employeeRes, roleRes] = await Promise.all([
      axios.get(`${API_URL}/shifts`, { headers }),
      axios.get(`${API_URL}/employees`, { headers }),
      axios.get(`${API_URL}/roles`, { headers }),
    ]);
    setShifts(shiftRes.data || []);
    setEmployees(employeeRes.data || []);
    setRoles(roleRes.data || []);
  }, []);

  const fetchDrafts = useCallback(async ({ keepSelection = false } = {}) => {
    try {
      setLoading(true);
      setNotice("");
      const res = await axios.get(`${API_URL}/schedules/drafts/list`, {
        headers: authHeaders(),
      });
      setDrafts(res.data || []);
      if (!keepSelection) {
        setSelectedDraft(null);
        setItems([]);
        setDraftName("");
      }
    } catch (err) {
      setNotice(
        err.response?.data?.message ||
          err.message ||
          "Không thể tải danh sách bản nháp",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchDrafts();
    loadBaseData().catch((err) => {
      setNotice(
        err.response?.data?.message ||
          err.message ||
          "Không thể tải dữ liệu chỉnh sửa",
      );
    });
  }, [fetchDrafts, loadBaseData, open]);

  const handleSelectDraft = async (draft) => {
    try {
      setDetailLoading(true);
      setNotice("");
      setSelectedDraft(draft);
      setDraftName(draft.name || "");
      const res = await axios.get(
        `${API_URL}/schedules/drafts/${draft.draft_id}`,
        {
          headers: authHeaders(),
        },
      );
      setItems(
        (res.data?.items || []).map((item) => ({
          ...item,
          work_date: formatDateInput(item.work_date),
          local_id: `${item.id || "draft"}-${item.employee_id}-${item.shift_id}-${item.work_date}-${Math.random()}`,
        })),
      );
    } catch (err) {
      setNotice(
        err.response?.data?.message ||
          err.message ||
          "Không thể tải chi tiết bản nháp",
      );
      setItems([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const updateItem = (localId, patch) => {
    setItems((current) =>
      current.map((item) => {
        if (item.local_id !== localId) return item;
        const next = { ...item, ...patch };
        if (patch.shift_id) {
          const shift = shifts.find(
            (entry) => Number(entry.shift_id) === Number(patch.shift_id),
          );
          next.shift_name = shift?.shift_name || next.shift_name;
          next.start_time = shift?.start_time || next.start_time;
          next.end_time = shift?.end_time || next.end_time;
        }
        if (patch.employee_id) {
          const employee = employees.find(
            (entry) => Number(entry.employee_id) === Number(patch.employee_id),
          );
          next.employee_name = employee?.name || next.employee_name;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "role_id")) {
          const role = roles.find(
            (entry) => Number(entry.role_id) === Number(patch.role_id),
          );
          next.role_name = role?.role_name || null;
        }
        return next;
      }),
    );
  };

  const addItem = ({ workDate, shiftId } = {}) => {
    const shift =
      shifts.find((entry) => Number(entry.shift_id) === Number(shiftId)) ||
      shifts[0];
    const employee = employees[0];
    if (!shift || !employee) {
      setNotice("Cần có ca làm và nhân viên trước khi thêm dòng");
      return;
    }
    setItems((current) => [
      ...current,
      {
        local_id: `new-${Date.now()}-${Math.random()}`,
        employee_id: employee.employee_id,
        employee_name: employee.name,
        shift_id: shift.shift_id,
        shift_name: shift.shift_name,
        work_date:
          workDate ||
          current[0]?.work_date ||
          `${selectedDraft.year}-${String(selectedDraft.month).padStart(2, "0")}-01`,
        role_id: null,
        role_name: null,
        start_time: shift.start_time,
        end_time: shift.end_time,
      },
    ]);
  };

  const removeItem = (localId) => {
    setItems((current) => current.filter((item) => item.local_id !== localId));
  };

  const saveDraft = async () => {
    if (!selectedDraft) return;
    try {
      setSaving(true);
      setNotice("");
      await axios.put(
        `${API_URL}/schedules/drafts/${selectedDraft.draft_id}`,
        {
          name: draftName.trim() || selectedDraft.name,
          month: selectedDraft.month,
          year: selectedDraft.year,
          shifts: items.map((item) => ({
            employee_id: item.employee_id,
            shift_id: item.shift_id,
            work_date: item.work_date,
            role_id: item.role_id || null,
          })),
        },
        { headers: authHeaders() },
      );
      window.appPopup?.({
        type: "success",
        title: "Đã lưu bản nháp",
        message: "Các thay đổi thủ công đã được cập nhật.",
      });
      await fetchDrafts({ keepSelection: true });
      setSelectedDraft((current) =>
        current
          ? {
              ...current,
              name: draftName.trim() || current.name,
              shift_count: items.length,
            }
          : current,
      );
    } catch (err) {
      setNotice(
        err.response?.data?.message || err.message || "Không thể lưu bản nháp",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteDraft = async () => {
    if (!selectedDraft) return;
    const confirmed = await window.appConfirm?.({
      title: "Xóa bản nháp",
      message: `Xóa bản nháp "${selectedDraft.name}"?`,
      confirmText: "Xóa",
      cancelText: "Giữ lại",
      type: "warning",
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      await axios.delete(
        `${API_URL}/schedules/drafts/${selectedDraft.draft_id}`,
        {
          headers: authHeaders(),
        },
      );
      window.appPopup?.({ type: "success", title: "Đã xóa bản nháp" });
      await fetchDrafts();
    } catch (err) {
      setNotice(
        err.response?.data?.message || err.message || "Không thể xóa bản nháp",
      );
    } finally {
      setSaving(false);
    }
  };

  const publishDraft = async () => {
    if (!selectedDraft || !items.length) return;
    const confirmed = await window.appConfirm?.({
      title: "Công bố bản nháp",
      message: "Công bố lịch này cho nhân viên?",
      confirmText: "Công bố",
      cancelText: "Xem lại",
      type: "info",
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/schedules/publish`,
        {
          month: selectedDraft.month,
          year: selectedDraft.year,
          shifts: items.map((item) => ({
            employee_id: item.employee_id,
            shift_id: item.shift_id,
            work_date: item.work_date,
            role_id: item.role_id || null,
            status: "PUBLISHED",
          })),
        },
        { headers: authHeaders() },
      );
      window.appPopup?.({ type: "success", title: "Đã công bố lịch" });
      await fetchDrafts();
    } catch (err) {
      setNotice(
        err.response?.data?.message ||
          err.message ||
          "Không thể công bố bản nháp",
      );
    } finally {
      setSaving(false);
    }
  };

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const dateCompare = String(a.work_date).localeCompare(
          String(b.work_date),
        );
        if (dateCompare !== 0) return dateCompare;
        return String(a.start_time || "").localeCompare(
          String(b.start_time || ""),
        );
      }),
    [items],
  );

  const tableDates = useMemo(
    () => [...new Set(sortedItems.map((item) => item.work_date))].sort(),
    [sortedItems],
  );

  return (
    <Dialog
      open={open}
      handler={onClose}
      size="xxl"
      className="overflow-hidden rounded-md"
    >
      <div className="flex max-h-[92dvh] min-h-0 flex-col bg-slate-50 font-sans">
        <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Typography variant="h5" className="font-black text-slate-950">
                Bản nháp lịch làm
              </Typography>
              <Typography className="mt-1 text-sm font-medium text-slate-500">
                Xem, chỉnh sửa thủ công và công bố các bản nháp đã lưu.
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

        {notice && (
          <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:mx-5">
            {notice}
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 sm:gap-4 sm:p-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden">
          <aside className="flex max-h-[34dvh] min-h-0 flex-col rounded-md border border-slate-200 bg-white lg:max-h-none">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="font-black text-slate-950">
                Danh sách bản nháp
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                {drafts.length}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <Spinner className="h-7 w-7 text-blue-600" />
                </div>
              ) : drafts.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-500">
                  Chưa có bản nháp nào.
                </div>
              ) : (
                <div className="space-y-2">
                  {drafts.map((draft) => (
                    <button
                      key={draft.draft_id}
                      type="button"
                      onClick={() => handleSelectDraft(draft)}
                      className={`w-full rounded-md border p-3 text-left transition ${
                        selectedDraft?.draft_id === draft.draft_id
                          ? "border-blue-600 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="truncate text-sm font-black text-slate-950">
                        {draft.name}
                      </div>
                      <div className="mt-1 text-xs font-bold text-slate-500">
                        Tháng {draft.month}/{draft.year} ·{" "}
                        {draft.shift_count || 0} ca
                      </div>
                      <div className="mt-1 text-xs font-medium text-slate-400">
                        Tạo ngày {formatDate(draft.created_at)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-h-[58dvh] flex-col rounded-md border border-slate-200 bg-white lg:min-h-0">
            {!selectedDraft ? (
              <div className="grid min-h-[420px] flex-1 place-items-center p-8 text-center">
                <div>
                  <Typography
                    variant="h6"
                    className="font-black text-slate-950"
                  >
                    Chọn một bản nháp
                  </Typography>
                  <Typography className="mt-2 text-sm font-medium text-slate-500">
                    Nội dung chi tiết và công cụ chỉnh sửa sẽ hiển thị tại đây.
                  </Typography>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 p-4">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_150px]">
                      <Input
                        label="Tên bản nháp"
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                      />
                      <Stat
                        label="Tháng"
                        value={`${selectedDraft.month}/${selectedDraft.year}`}
                      />
                      <Stat label="Số ca" value={items.length} />
                    </div>
                    <div className="grid gap-2 sm:flex sm:flex-wrap">
                      <Button
                        variant="outlined"
                        className="rounded-md normal-case"
                        onClick={() => addItem()}
                        disabled={saving || detailLoading}
                      >
                        Thêm ca
                      </Button>
                      <Button
                        variant="outlined"
                        className="rounded-md border-red-200 normal-case text-red-700"
                        onClick={deleteDraft}
                        disabled={saving}
                      >
                        Xóa bản nháp
                      </Button>
                      <Button
                        className="rounded-md bg-green-500 normal-case"
                        onClick={saveDraft}
                        disabled={saving || detailLoading || !items.length}
                      >
                        Lưu thay đổi
                      </Button>
                      <Button
                        className="rounded-md bg-blue-700 normal-case"
                        onClick={publishDraft}
                        disabled={saving || detailLoading || !items.length}
                      >
                        Công bố
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex rounded-md border border-slate-200 bg-white p-1 sm:w-fit">
                    {[
                      ["list", "Từng dòng"],
                      ["table", "Bảng"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setViewMode(value)}
                        className={`flex-1 rounded px-3 py-1.5 text-sm font-bold sm:flex-none ${
                          viewMode === value
                            ? "bg-green-500 text-white"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
                  {detailLoading ? (
                    <div className="flex h-full min-h-[360px] items-center justify-center">
                      <Spinner className="h-8 w-8 text-blue-600" />
                    </div>
                  ) : viewMode === "list" ? (
                    <div className="h-full min-h-[360px] overflow-auto overscroll-contain rounded-md border border-slate-200">
                      <table className="w-full min-w-[880px] text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-3">Ngày</th>
                            <th className="px-3 py-3">Ca làm</th>
                            <th className="px-3 py-3">Nhân viên</th>
                            <th className="px-3 py-3">Vai trò</th>
                            <th className="px-3 py-3">Giờ</th>
                            <th className="px-3 py-3 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedItems.map((item) => (
                            <tr key={item.local_id} className="align-top">
                              <td className="px-3 py-3">
                                <input
                                  type="date"
                                  value={item.work_date}
                                  onChange={(event) =>
                                    updateItem(item.local_id, {
                                      work_date: event.target.value,
                                    })
                                  }
                                  className="h-10 rounded-md border border-slate-300 px-2 text-sm font-medium outline-none focus:border-blue-600"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <ScrollSelect
                                  value={item.shift_id}
                                  options={shiftOptions}
                                  onChange={(value) =>
                                    updateItem(item.local_id, {
                                      shift_id: Number(value),
                                    })
                                  }
                                  className="w-40"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <ScrollSelect
                                  value={item.employee_id}
                                  options={employeeOptions}
                                  onChange={(value) =>
                                    updateItem(item.local_id, {
                                      employee_id: Number(value),
                                    })
                                  }
                                  className="w-48"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <ScrollSelect
                                  value={item.role_id || ""}
                                  options={roleOptions}
                                  onChange={(value) =>
                                    updateItem(item.local_id, {
                                      role_id: value ? Number(value) : null,
                                    })
                                  }
                                  className="w-40"
                                />
                              </td>
                              <td className="px-3 py-3 font-bold text-slate-600">
                                {formatTime(item.start_time)} -{" "}
                                {formatTime(item.end_time)}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.local_id)}
                                  className="rounded-md px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                                >
                                  Xóa
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="h-full min-h-[360px] overflow-auto overscroll-contain rounded-md border border-slate-200">
                      <table className="w-full min-w-[980px] table-fixed text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="w-36 px-3 py-3">Ngày</th>
                            {shifts.map((shift) => (
                              <th
                                key={shift.shift_id}
                                className="px-3 py-3 text-center"
                              >
                                <div>{shift.shift_name}</div>
                                <div className="mt-1 text-[11px] font-bold normal-case text-slate-400">
                                  {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {tableDates.map((dateStr) => (
                            <tr key={dateStr}>
                              <td className="px-3 py-3 font-black text-slate-800">
                                {formatDate(dateStr)}
                              </td>
                              {shifts.map((shift) => {
                                const cellItems = sortedItems.filter(
                                  (item) =>
                                    item.work_date === dateStr &&
                                    Number(item.shift_id) ===
                                      Number(shift.shift_id),
                                );
                                return (
                                  <td
                                    key={shift.shift_id}
                                    className="px-2 py-2 align-top"
                                  >
                                    <div className="min-h-24 rounded-md border border-slate-200 bg-slate-50 p-2">
                                      <div className="space-y-1">
                                        {cellItems.length === 0 && (
                                          <div className="text-xs font-semibold text-slate-400">
                                            Chưa có nhân viên
                                          </div>
                                        )}
                                        {cellItems.map((item) => (
                                          <div
                                            key={item.local_id}
                                            className="flex items-start justify-between gap-2 rounded bg-white px-2 py-1 text-xs font-bold text-slate-800 shadow-sm"
                                          >
                                            <span className="min-w-0">
                                              <span className="block truncate">
                                                {item.employee_name}
                                              </span>
                                              {item.role_name && (
                                                <span className="font-medium text-slate-500">
                                                  ({item.role_name})
                                                </span>
                                              )}
                                              <span className="block text-[11px] font-semibold text-slate-400">
                                                {formatTime(item.start_time)} - {formatTime(item.end_time)}
                                              </span>
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                removeItem(item.local_id)
                                              }
                                              className="shrink-0 rounded px-1 text-[11px] font-black text-red-600 hover:bg-red-50"
                                            >
                                              X
                                            </button>
                                          </div>
                                        ))}
                                        <ScrollSelect
                                          value=""
                                          options={[
                                            {
                                              value: "",
                                              label: "+ Thêm nhân viên",
                                            },
                                            ...employeeOptions,
                                          ]}
                                          placeholder="+ Thêm nhân viên"
                                          onChange={(value) => {
                                            if (!value) return;
                                            const employee = employees.find(
                                              (entry) =>
                                                Number(entry.employee_id) ===
                                                Number(value),
                                            );
                                            if (!employee) return;
                                            setItems((current) => [
                                              ...current,
                                              {
                                                local_id: `new-${Date.now()}-${Math.random()}`,
                                                employee_id:
                                                  employee.employee_id,
                                                employee_name: employee.name,
                                                shift_id: shift.shift_id,
                                                shift_name: shift.shift_name,
                                                work_date: dateStr,
                                                role_id: null,
                                                role_name: null,
                                                start_time: shift.start_time,
                                                end_time: shift.end_time,
                                              },
                                            ]);
                                          }}
                                          className="mt-1 w-full"
                                          buttonClassName="h-8 text-xs font-bold text-blue-700"
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
              </>
            )}
          </section>
        </div>
      </div>
    </Dialog>
  );
}
