import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  UserGroupIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { API_URL } from "../services/api";

const statusMeta = {
  PENDING_TARGET: {
    label: "Chờ xác nhận",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    active: "border-amber-300 bg-amber-50 text-amber-800",
    count: "bg-amber-100 text-amber-800",
    group: "unresolved",
  },
  APPROVED: {
    label: "Đã đổi ca",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    active: "border-emerald-300 bg-emerald-50 text-emerald-800",
    count: "bg-emerald-100 text-emerald-800",
    group: "resolved",
  },
  REJECTED_BY_TARGET: {
    label: "Người nhận từ chối",
    tone: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-red-500",
    active: "border-red-300 bg-red-50 text-red-800",
    count: "bg-red-100 text-red-800",
    group: "resolved",
  },
  CANCELLED_BY_ADMIN: {
    label: "Admin đã hủy",
    tone: "border-gray-200 bg-gray-100 text-gray-700",
    dot: "bg-gray-500",
    active: "border-gray-300 bg-gray-100 text-gray-800",
    count: "bg-gray-200 text-gray-800",
    group: "resolved",
  },
  REVERTED_BY_ADMIN: {
    label: "Đã hoàn tác",
    tone: "border-violet-200 bg-violet-50 text-violet-800",
    dot: "bg-violet-500",
    active: "border-violet-300 bg-violet-50 text-violet-800",
    count: "bg-violet-100 text-violet-800",
    group: "resolved",
  },
};

const groupFilters = [
  { value: "all", label: "Tất cả" },
  { value: "unresolved", label: "Chưa giải quyết" },
  { value: "resolved", label: "Đã giải quyết" },
];

const statusOptions = [
  { value: "all", label: "Mọi trạng thái" },
  ...Object.entries(statusMeta).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
];

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDate(value) {
  if (!value) return "--";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatTime(value) {
  return value?.slice(0, 5) || "--:--";
}

function shiftSummary(request, owner) {
  const prefix = owner === "requester" ? "requester" : "target";
  return {
    date: request[`${prefix}_work_date`],
    name: request[`${prefix}_shift_name`] || "Ca làm",
    start: request[`${prefix}_start_time`],
    end: request[`${prefix}_end_time`],
  };
}

function requestSearchText(request) {
  return [
    request.requester_employee_name,
    request.target_employee_name,
    request.requester_shift_name,
    request.target_shift_name,
    request.requester_work_date,
    request.target_work_date,
    request.requester_note,
    request.admin_cancel_reason,
    request.admin_revert_reason,
    statusMeta[request.status]?.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeRequests(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.requests)) return data.requests;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function StatTile({ icon, label, value, active, onClick }) {
  const StatIcon = icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-20 w-full items-center gap-3 rounded-md border p-3 text-left transition ${
        active
          ? "border-blue-300 bg-blue-50 text-blue-800"
          : "border-gray-200 bg-white text-gray-800 hover:border-blue-200 hover:bg-gray-50"
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-700">
        <StatIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-7">{value}</span>
        <span className="block text-xs font-semibold uppercase text-gray-500">{label}</span>
      </span>
    </button>
  );
}

function ShiftBlock({ title, person, shift }) {
  return (
    <div className="min-w-0 rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase text-gray-500">{title}</span>
        <span className="shrink-0 text-xs font-semibold text-gray-500">{formatDate(shift.date)}</span>
      </div>
      <div className="mt-2 truncate text-sm font-bold text-gray-950">{person || "--"}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-gray-600">
        <span>{shift.name}</span>
        <span className="text-gray-300">|</span>
        <span>
          {formatTime(shift.start)} - {formatTime(shift.end)}
        </span>
      </div>
    </div>
  );
}

export default function ShiftSwapManagementPage() {
  const [requests, setRequests] = useState([]);
  const [reasonById, setReasonById] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  const fetchRequests = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/shift-swaps`, {
        headers: authHeaders(),
      });
      setRequests(normalizeRequests(res.data));
    } catch (err) {
      console.error("[ShiftSwapManagement] Load error:", err);
      setError(err.response?.data?.message || "Không thể tải request đổi ca");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const stats = useMemo(() => {
    const byStatus = Object.fromEntries(Object.keys(statusMeta).map((status) => [status, 0]));
    let unresolved = 0;
    let resolved = 0;

    requests.forEach((request) => {
      byStatus[request.status] = (byStatus[request.status] || 0) + 1;
      if (statusMeta[request.status]?.group === "unresolved") unresolved += 1;
      else resolved += 1;
    });

    return { total: requests.length, unresolved, resolved, byStatus };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return requests.filter((request) => {
      const meta = statusMeta[request.status];
      const matchesGroup = groupFilter === "all" || meta?.group === groupFilter;
      const matchesStatus = statusFilter === "all" || request.status === statusFilter;
      const matchesQuery = !keyword || requestSearchText(request).includes(keyword);
      return matchesGroup && matchesStatus && matchesQuery;
    });
  }, [groupFilter, query, requests, statusFilter]);

  const setReason = (id, value) => {
    setReasonById((prev) => ({ ...prev, [id]: value }));
  };

  const submitAction = async (request, action) => {
    const id = request.swap_request_id;
    const reason = reasonById[id] || "";

    if (action === "revert" && !reason.trim()) {
      alert("Vui lòng nhập lý do hoàn tác");
      return;
    }

    try {
      setLoadingId(id);
      await axios.post(
        `${API_URL}/shift-swaps/${id}/${action}`,
        { reason },
        { headers: authHeaders() },
      );
      setReasonById((prev) => ({ ...prev, [id]: "" }));
      await fetchRequests();
      window.dispatchEvent(new Event("notification-count-changed"));
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý yêu cầu đổi ca");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
            Quản lý đổi ca
          </h1>
          <p className="mt-1 text-sm font-medium text-gray-600">
            {stats.unresolved} request chưa giải quyết, {stats.resolved} request đã giải quyết.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchRequests}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60"
        >
          <ArrowPathIcon className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <FunnelIcon className="h-5 w-5 text-blue-600" />
              <h2 className="text-base font-bold text-gray-950">Bộ lọc request</h2>
            </div>

            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm người, ca, ghi chú..."
                className="h-11 w-full rounded-md border border-gray-300 bg-white pl-10 pr-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-blue-600"
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-md bg-gray-100 p-1">
              {groupFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setGroupFilter(item.value)}
                  className={`min-h-9 rounded px-2 text-xs font-bold transition ${
                    groupFilter === item.value
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-gray-600 hover:text-gray-950"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-xs font-bold uppercase text-gray-500">
              Loại request
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-bold text-gray-900 outline-none transition focus:border-blue-600"
            >
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </section>

          <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <UserGroupIcon className="h-5 w-5 text-blue-600" />
              <h2 className="text-base font-bold text-gray-950">Thống kê</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <StatTile
                icon={CalendarDaysIcon}
                label="Tổng request"
                value={stats.total}
                active={groupFilter === "all" && statusFilter === "all"}
                onClick={() => {
                  setGroupFilter("all");
                  setStatusFilter("all");
                }}
              />
              <StatTile
                icon={ClockIcon}
                label="Chưa giải quyết"
                value={stats.unresolved}
                active={groupFilter === "unresolved"}
                onClick={() => {
                  setGroupFilter("unresolved");
                  setStatusFilter("all");
                }}
              />
              <StatTile
                icon={CheckCircleIcon}
                label="Đã giải quyết"
                value={stats.resolved}
                active={groupFilter === "resolved"}
                onClick={() => {
                  setGroupFilter("resolved");
                  setStatusFilter("all");
                }}
              />
            </div>

            <div className="mt-4 space-y-2">
              {Object.entries(statusMeta).map(([status, meta]) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setStatusFilter(status);
                    setGroupFilter("all");
                  }}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                    statusFilter === status
                      ? meta.active
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2 font-bold">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                    <span className="truncate">{meta.label}</span>
                  </span>
                  <span
                    className={`ml-3 rounded px-2 py-0.5 text-xs font-bold ${
                      statusFilter === status ? meta.count : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {stats.byStatus[status] || 0}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="min-w-0">
          <section className="rounded-md border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-950">Danh sách request</h2>
                <p className="text-sm font-medium text-gray-500">
                  Hiển thị {filteredRequests.length} trên {requests.length} request.
                </p>
              </div>
            </div>

            {error ? (
              <div className="p-5">
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {error}
                </div>
              </div>
            ) : loading ? (
              <div className="grid gap-3 p-4">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-40 animate-pulse rounded-md bg-gray-100" />
                ))}
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
                <NoSymbolIcon className="h-12 w-12 text-gray-300" />
                <div className="mt-3 text-base font-bold text-gray-900">Không có request phù hợp</div>
                <div className="mt-1 text-sm font-medium text-gray-500">
                  Thử đổi bộ lọc hoặc làm mới dữ liệu.
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredRequests.map((request) => {
                  const meta = statusMeta[request.status] || {
                    label: request.status,
                    tone: "border-gray-200 bg-gray-50 text-gray-700",
                    dot: "bg-gray-400",
                  };
                  const requesterShift = shiftSummary(request, "requester");
                  const targetShift = shiftSummary(request, "target");
                  const canCancel = request.status === "PENDING_TARGET";
                  const canRevert = request.status === "APPROVED";
                  const canResolve = canCancel || canRevert;
                  const reason = reasonById[request.swap_request_id] || "";
                  const isBusy = loadingId === request.swap_request_id;

                  return (
                    <article key={request.swap_request_id} className="p-4 transition hover:bg-gray-50">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-bold ${meta.tone}`}
                            >
                              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                              {meta.label}
                            </span>
                            <span className="text-xs font-bold uppercase text-gray-400">
                              #{request.swap_request_id}
                            </span>
                            <span className="text-sm font-semibold text-gray-500">
                              {formatDateTime(request.created_at)}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <ShiftBlock
                              title="Ca gửi"
                              person={request.requester_employee_name}
                              shift={requesterShift}
                            />
                            <ShiftBlock
                              title="Ca nhận"
                              person={request.target_employee_name}
                              shift={targetShift}
                            />
                          </div>

                          {(request.requester_note ||
                            request.admin_cancel_reason ||
                            request.admin_revert_reason) && (
                            <div className="mt-3 grid gap-2 text-sm font-medium text-gray-700">
                              {request.requester_note && (
                                <div className="rounded-md bg-blue-50 px-3 py-2 text-blue-800">
                                  Ghi chú: {request.requester_note}
                                </div>
                              )}
                              {request.admin_cancel_reason && (
                                <div className="rounded-md bg-red-50 px-3 py-2 text-red-800">
                                  Lý do hủy: {request.admin_cancel_reason}
                                </div>
                              )}
                              {request.admin_revert_reason && (
                                <div className="rounded-md bg-violet-50 px-3 py-2 text-violet-800">
                                  Lý do hoàn tác: {request.admin_revert_reason}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="w-full shrink-0 xl:w-72">
                          {canResolve ? (
                            <div className="rounded-md border border-gray-200 bg-white p-3">
                              <label className="text-xs font-bold uppercase text-gray-500">
                                {canRevert ? "Lý do hoàn tác" : "Lý do hủy"}
                              </label>
                              <textarea
                                value={reason}
                                onChange={(event) =>
                                  setReason(request.swap_request_id, event.target.value)
                                }
                                rows={3}
                                className="mt-2 w-full resize-none rounded-md border border-gray-300 p-2 text-sm font-medium text-gray-900 outline-none transition focus:border-blue-600"
                                placeholder={canRevert ? "Nhập lý do..." : "Ghi chú tùy chọn..."}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  submitAction(request, canRevert ? "revert" : "cancel")
                                }
                                disabled={isBusy}
                                className={`mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm font-bold text-white transition disabled:opacity-60 ${
                                  canRevert
                                    ? "bg-violet-600 hover:bg-violet-700"
                                    : "bg-red-600 hover:bg-red-700"
                                }`}
                              >
                                {canRevert ? (
                                  <ArrowPathIcon className="h-5 w-5" />
                                ) : (
                                  <XCircleIcon className="h-5 w-5" />
                                )}
                                {isBusy ? "Đang xử lý..." : canRevert ? "Hoàn tác" : "Hủy request"}
                              </button>
                            </div>
                          ) : (
                            <div className="flex min-h-24 items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-3 text-center text-sm font-bold text-gray-500">
                              Request đã được giải quyết
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
