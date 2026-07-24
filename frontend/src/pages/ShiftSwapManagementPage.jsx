import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowPathIcon,
  BellAlertIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  TrashIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import OperationalPageHeader from "../components/OperationalPageHeader";
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
  AVAILABILITY_PENDING: {
    label: "Chờ nhập lịch rảnh",
    tone: "border-cyan-200 bg-cyan-50 text-cyan-800",
    dot: "bg-cyan-500",
    active: "border-cyan-300 bg-cyan-50 text-cyan-800",
    count: "bg-cyan-100 text-cyan-800",
    group: "unresolved",
  },
  AVAILABILITY_APPROVED: {
    label: "Đã nhập lịch rảnh",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    active: "border-emerald-300 bg-emerald-50 text-emerald-800",
    count: "bg-emerald-100 text-emerald-800",
    group: "resolved",
  },
  AVAILABILITY_SUBMITTED: {
    label: "Đã nhập lịch rảnh",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    active: "border-emerald-300 bg-emerald-50 text-emerald-800",
    count: "bg-emerald-100 text-emerald-800",
    group: "resolved",
  },
  AVAILABILITY_EDIT_PENDING: {
    label: "Chờ duyệt sửa",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    active: "border-amber-300 bg-amber-50 text-amber-800",
    count: "bg-amber-100 text-amber-800",
    group: "unresolved",
  },
  AVAILABILITY_EDIT_APPROVED: {
    label: "Đã duyệt sửa",
    tone: "border-cyan-200 bg-cyan-50 text-cyan-800",
    dot: "bg-cyan-500",
    active: "border-cyan-300 bg-cyan-50 text-cyan-800",
    count: "bg-cyan-100 text-cyan-800",
    group: "unresolved",
  },
  AVAILABILITY_REJECTED: {
    label: "Lịch rảnh bị từ chối",
    tone: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-red-500",
    active: "border-red-300 bg-red-50 text-red-800",
    count: "bg-red-100 text-red-800",
    group: "resolved",
  },
  PAYROLL_PENDING: {
    label: "Chờ phản hồi lương",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    active: "border-emerald-300 bg-emerald-50 text-emerald-800",
    count: "bg-emerald-100 text-emerald-800",
    group: "unresolved",
  },
  PAYROLL_ANSWERED: {
    label: "Đã trả lời lương",
    tone: "border-blue-200 bg-blue-50 text-blue-800",
    dot: "bg-blue-500",
    active: "border-blue-300 bg-blue-50 text-blue-800",
    count: "bg-blue-100 text-blue-800",
    group: "resolved",
  },
  PAYROLL_REJECTED: {
    label: "Đã từ chối phản hồi lương",
    tone: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-red-500",
    active: "border-red-300 bg-red-50 text-red-800",
    count: "bg-red-100 text-red-800",
    group: "resolved",
  },
};

const groupFilters = [
  { value: "all", label: "Tất cả" },
  { value: "unresolved", label: "Chưa giải quyết" },
  { value: "resolved", label: "Đã giải quyết" },
];

const REQUEST_BATCH_SIZE = 12;

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

function dateValue(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatDate(value) {
  if (!value) return "--";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
    "vi-VN",
    {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    },
  );
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
    request.kind === "availability"
      ? "lịch rảnh yêu cầu nhập lịch rảnh"
      : "đổi ca",
    request.kind === "payroll" ? "phản hồi lương" : "",
    request.employee_name,
    request.employee_code,
    request.email,
    request.month,
    request.year,
    request.requester_employee_name,
    request.target_employee_name,
    request.requester_shift_name,
    request.target_shift_name,
    request.requester_work_date,
    request.target_work_date,
    request.requester_note,
    request.admin_cancel_reason,
    request.admin_revert_reason,
    request.subject,
    request.content,
    request.admin_reply,
    statusMeta[getStatusKey(request)]?.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getStatusKey(request) {
  if (request.kind === "availability") {
    return `AVAILABILITY_${request.status || "PENDING"}`;
  }
  if (request.kind === "payroll") {
    return `PAYROLL_${request.status || "PENDING"}`;
  }

  return request.status;
}

function getDeleteEndpoint(request) {
  if (request.kind === "availability") {
    return `${API_URL}/availability/requests/${request.id}`;
  }
  if (request.kind === "payroll") {
    return `${API_URL}/payroll/feedback/${request.feedback_id}`;
  }
  return `${API_URL}/shift-swaps/${request.swap_request_id}`;
}

function normalizeRequests(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.requests)) return data.requests;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function normalizeAvailabilityRequests(data) {
  const rows = normalizeRequests(data);
  return rows.map((request) => ({
    ...request,
    kind: "availability",
    status: request.status || "PENDING",
    request_key: `availability-${request.id}`,
  }));
}

function normalizeSwapRequests(data) {
  return normalizeRequests(data).map((request) => ({
    ...request,
    kind: "swap",
    request_key: `swap-${request.swap_request_id}`,
  }));
}

function normalizePayrollFeedback(data) {
  return normalizeRequests(data).map((request) => ({
    ...request,
    kind: "payroll",
    request_key: `payroll-${request.feedback_id}`,
  }));
}

function StatTile({ icon, label, value, active, onClick }) {
  const StatIcon = icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-14 w-full items-center gap-2 rounded-md border p-2 text-left transition ${
        active
          ? "border-blue-300 bg-blue-50 text-blue-800"
          : "border-gray-200 bg-white text-gray-800 hover:border-blue-200 hover:bg-gray-50"
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-700">
        <StatIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-5">{value}</span>
        <span className="block truncate text-[11px] font-semibold uppercase text-gray-500">
          {label}
        </span>
      </span>
    </button>
  );
}

function ShiftBlock({ title, person, shift }) {
  return (
    <div className="min-w-0 rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase text-gray-500">
          {title}
        </span>
        <span className="shrink-0 text-xs font-semibold text-gray-500">
          {formatDate(shift.date)}
        </span>
      </div>
      <div className="mt-2 truncate text-sm font-bold text-gray-950">
        {person || "--"}
      </div>
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

function AvailabilityBlock({ request }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase text-gray-500">
          Nhập lịch rảnh
        </span>
        <span className="text-xs font-semibold text-gray-500">
          Tháng {request.month}/{request.year}
        </span>
      </div>
      <div className="mt-2 text-sm font-bold text-gray-950">
        {request.employee_name || request.email || `User #${request.user_id}`}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-gray-600">
        <span>{request.employee_code || "Chưa có mã nhân viên"}</span>
        <span className="text-gray-300">|</span>
        <span>{request.email || "--"}</span>
      </div>
    </div>
  );
}

export default function ShiftSwapManagementPage() {
  const [requests, setRequests] = useState([]);
  const [reasonById, setReasonById] = useState({});
  const [payrollReplyById, setPayrollReplyById] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [dateRangeError, setDateRangeError] = useState("");
  const [selectedRequestKeys, setSelectedRequestKeys] = useState([]);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [visibleCount, setVisibleCount] = useState(REQUEST_BATCH_SIZE);

  const fetchRequests = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [swapRes, availabilityRes, payrollFeedbackRes] = await Promise.all([
        axios.get(`${API_URL}/shift-swaps`, {
          headers: authHeaders(),
        }),
        axios.get(`${API_URL}/availability/requests/all`, {
          headers: authHeaders(),
        }),
        axios.get(`${API_URL}/payroll/feedback`, {
          headers: authHeaders(),
        }),
      ]);

      setRequests(
        [
          ...normalizeAvailabilityRequests(availabilityRes.data),
          ...normalizePayrollFeedback(payrollFeedbackRes.data),
          ...normalizeSwapRequests(swapRes.data),
        ].sort(
          (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
        ),
      );
    } catch (err) {
      console.error("[ShiftSwapManagement] Load error:", err);
      setError(
        err.response?.data?.message || "Không thể tải danh sách yêu cầu",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const stats = useMemo(() => {
    const byStatus = Object.fromEntries(
      Object.keys(statusMeta).map((status) => [status, 0]),
    );
    let unresolved = 0;
    let resolved = 0;

    requests.forEach((request) => {
      const statusKey = getStatusKey(request);
      byStatus[statusKey] = (byStatus[statusKey] || 0) + 1;
      if (statusMeta[statusKey]?.group === "unresolved") unresolved += 1;
      else resolved += 1;
    });

    return { total: requests.length, unresolved, resolved, byStatus };
  }, [requests]);

  const statusOptions = useMemo(
    () => [
      { value: "all", label: `Mọi trạng thái (${stats.total})` },
      ...Object.entries(statusMeta)
        .filter(([value]) => value !== "AVAILABILITY_SUBMITTED")
        .map(([value, meta]) => ({
        value,
        label: `${meta.label} (${stats.byStatus[value] || 0})`,
        })),
    ],
    [stats],
  );

  const filteredRequests = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return requests.filter((request) => {
      const createdDate = dateValue(request.created_at);
      const hasCreatedDate = Boolean(createdDate);
      const statusKey = getStatusKey(request);
      const meta = statusMeta[statusKey];
      const matchesGroup = groupFilter === "all" || meta?.group === groupFilter;
      const matchesStatus =
        statusFilter === "all" || statusKey === statusFilter;
      const matchesQuery =
        !keyword || requestSearchText(request).includes(keyword);
      const matchesDateFrom =
        !dateFromFilter || (hasCreatedDate && createdDate >= dateFromFilter);
      const matchesDateTo =
        !dateToFilter || (hasCreatedDate && createdDate <= dateToFilter);

      return (
        matchesGroup &&
        matchesStatus &&
        matchesQuery &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }, [
    dateFromFilter,
    dateToFilter,
    groupFilter,
    query,
    requests,
    statusFilter,
  ]);

  const visibleRequests = useMemo(
    () => filteredRequests.slice(0, visibleCount),
    [filteredRequests, visibleCount],
  );

  const selectedRequests = useMemo(
    () =>
      requests.filter((request) => selectedRequestKeys.includes(request.request_key)),
    [requests, selectedRequestKeys],
  );

  const allVisibleRequestsSelected =
    visibleRequests.length > 0 &&
    visibleRequests.every((request) =>
      selectedRequestKeys.includes(request.request_key),
    );

  useEffect(() => {
    setVisibleCount(REQUEST_BATCH_SIZE);
  }, [
    dateFromFilter,
    dateToFilter,
    groupFilter,
    query,
    requests,
    statusFilter,
  ]);

  useEffect(() => {
    const validKeys = new Set(requests.map((request) => request.request_key));
    setSelectedRequestKeys((keys) => keys.filter((key) => validKeys.has(key)));
  }, [requests]);

  const handleDateFromChange = (value) => {
    if (value && dateToFilter && value > dateToFilter) {
      setDateRangeError("Từ ngày không được sau Đến ngày.");
      return;
    }

    setDateRangeError("");
    setDateFromFilter(value);
  };

  const handleDateToChange = (value) => {
    if (value && dateFromFilter && value < dateFromFilter) {
      setDateRangeError("Đến ngày không được trước Từ ngày.");
      return;
    }

    setDateRangeError("");
    setDateToFilter(value);
  };

  const loadMoreRequests = useCallback(() => {
    setVisibleCount((count) =>
      Math.min(count + REQUEST_BATCH_SIZE, filteredRequests.length),
    );
  }, [filteredRequests.length]);

  const handleListScroll = useCallback(
    (event) => {
      const target = event.currentTarget;
      const distanceToBottom =
        target.scrollHeight - target.scrollTop - target.clientHeight;

      if (distanceToBottom < 180 && visibleCount < filteredRequests.length) {
        loadMoreRequests();
      }
    },
    [filteredRequests.length, loadMoreRequests, visibleCount],
  );

  const setReason = (id, value) => {
    setReasonById((prev) => ({ ...prev, [id]: value }));
  };

  const toggleRequestSelection = (requestKey) => {
    setSelectedRequestKeys((keys) =>
      keys.includes(requestKey)
        ? keys.filter((key) => key !== requestKey)
        : [...keys, requestKey],
    );
  };

  const handleRequestCardClick = (event, requestKey) => {
    if (!bulkDeleteMode) return;
    if (event.target.closest("button, input, textarea, select, a")) return;
    toggleRequestSelection(requestKey);
  };

  const toggleVisibleRequestSelection = () => {
    const visibleKeys = visibleRequests.map((request) => request.request_key);

    setSelectedRequestKeys((keys) => {
      if (visibleKeys.length === 0) return keys;
      if (visibleKeys.every((key) => keys.includes(key))) {
        return keys.filter((key) => !visibleKeys.includes(key));
      }

      return [...new Set([...keys, ...visibleKeys])];
    });
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
      window.appPopup?.({
        type: "success",
        title: "Đã xử lý yêu cầu",
        message: "Trạng thái yêu cầu đổi ca đã được cập nhật.",
      });
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý yêu cầu đổi ca");
    } finally {
      setLoadingId(null);
    }
  };

  const remindAvailability = async (request) => {
    try {
      setLoadingId(request.request_key);
      await axios.post(
        `${API_URL}/availability/requests/${request.id}/remind`,
        {},
        { headers: authHeaders() },
      );
      window.dispatchEvent(new Event("notification-count-changed"));
      alert("Đã gửi thông báo nhắc nhở nhân viên nhập lịch rảnh");
    } catch (err) {
      alert(err.response?.data?.message || "Không thể gửi nhắc nhở");
    } finally {
      setLoadingId(null);
    }
  };

  const respondAvailabilityEdit = async (request, action) => {
    try {
      setLoadingId(request.request_key);
      await axios.post(
        `${API_URL}/availability/request/edit/${request.id}/respond`,
        { action },
        { headers: authHeaders() },
      );
      await fetchRequests();
      window.dispatchEvent(new Event("notification-count-changed"));
      window.appPopup?.({
        type: "success",
        title:
          action === "approve"
            ? "Đã duyệt yêu cầu sửa"
            : "Đã từ chối yêu cầu sửa",
        message: "Yêu cầu sửa lịch rảnh đã được cập nhật.",
      });
    } catch (err) {
      alert(
        err.response?.data?.message || "Không thể xử lý yêu cầu sửa lịch rảnh",
      );
    } finally {
      setLoadingId(null);
    }
  };

  const respondPayrollFeedback = async (request, action) => {
    try {
      const reply = payrollReplyById[request.feedback_id] || "";
      setLoadingId(request.request_key);

      await axios.post(
        `${API_URL}/payroll/feedback/${request.feedback_id}/respond`,
        { action, reply },
        { headers: authHeaders() },
      );

      setPayrollReplyById((prev) => ({ ...prev, [request.feedback_id]: "" }));
      await fetchRequests();
      window.dispatchEvent(new Event("notification-count-changed"));
      window.appPopup?.({
        type: "success",
        title:
          action === "reject" ? "Đã từ chối phản hồi" : "Đã trả lời phản hồi",
        message: "Phản hồi lương đã được cập nhật.",
      });
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý phản hồi lương");
    } finally {
      setLoadingId(null);
    }
  };

  const deleteRequest = async (request) => {
    const confirmed = await window.appConfirm?.({
      title: "Xóa yêu cầu",
      message: "Xóa yêu cầu này? Thao tác không thể hoàn tác.",
      confirmText: "Xóa",
      cancelText: "Giữ lại",
      type: "warning",
    });

    if (!confirmed) return;

    try {
      setDeletingId(request.request_key);
      await axios.delete(getDeleteEndpoint(request), { headers: authHeaders() });
      setRequests((prev) =>
        prev.filter((item) => item.request_key !== request.request_key),
      );
      setSelectedRequestKeys((keys) =>
        keys.filter((key) => key !== request.request_key),
      );
      window.dispatchEvent(new Event("notification-count-changed"));
      window.appPopup?.({
        type: "success",
        title: "Đã xóa yêu cầu",
        message: "Yêu cầu đã được xóa.",
      });
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xóa yêu cầu");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteSelectedRequests = async () => {
    if (selectedRequests.length === 0) return;

    const confirmed = await window.appConfirm?.({
      title: "Xóa nhiều yêu cầu",
      message: `Xóa ${selectedRequests.length} yêu cầu đã chọn? Thao tác không thể hoàn tác.`,
      confirmText: "Xóa",
      cancelText: "Giữ lại",
      type: "warning",
    });

    if (!confirmed) return;

    try {
      setDeletingId("bulk");
      await Promise.all(
        selectedRequests.map((request) =>
          axios.delete(getDeleteEndpoint(request), { headers: authHeaders() }),
        ),
      );
      const deletedKeys = new Set(
        selectedRequests.map((request) => request.request_key),
      );
      setRequests((prev) =>
        prev.filter((request) => !deletedKeys.has(request.request_key)),
      );
      setSelectedRequestKeys([]);
      window.dispatchEvent(new Event("notification-count-changed"));
      window.appPopup?.({
        type: "success",
        title: "Đã xóa yêu cầu đã chọn",
        message: `${deletedKeys.size} yêu cầu đã được xóa.`,
      });
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xóa các yêu cầu đã chọn");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 pb-8 sm:p-6">
      <OperationalPageHeader
        title="Quản lý yêu cầu"
        description="Theo dõi, phân loại và xử lý yêu cầu đổi ca, lịch rảnh và phản hồi lương trong một nơi."
        actions={<button
          type="button"
          onClick={fetchRequests}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-700 shadow-none transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-60"
        >
          <ArrowPathIcon
            className={`h-5 w-5 ${loading ? "animate-spin" : ""}`}
          />
          Làm mới
        </button>}
      />

      <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/5">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <FunnelIcon className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-gray-950">
                Bộ lọc yêu cầu
              </h2>
            </div>

            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm người, ca, ghi chú..."
                className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
              {groupFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setGroupFilter(item.value)}
                  className={`min-h-9 rounded px-2 text-xs font-bold transition ${
                    groupFilter === item.value
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-gray-600 hover:text-gray-950"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-gray-500">
              Trạng thái chi tiết
            </label>
            <div className="mt-2 max-h-48 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-1.5 lg:max-h-56">
              {statusOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setStatusFilter(item.value)}
                  className={`mb-1 flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-bold transition last:mb-0 ${
                    statusFilter === item.value
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                      : "text-gray-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <label className="block text-xs font-bold uppercase text-gray-500">
                Từ ngày
              </label>
              <label className="block text-xs font-bold uppercase text-gray-500">
                Đến ngày
              </label>
              <input
                type="date"
                value={dateFromFilter}
                max={dateToFilter || undefined}
                onChange={(event) => handleDateFromChange(event.target.value)}
                className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm font-bold text-gray-900 outline-none transition focus:border-blue-600"
              />
              <input
                type="date"
                value={dateToFilter}
                min={dateFromFilter || undefined}
                onChange={(event) => handleDateToChange(event.target.value)}
                className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm font-bold text-gray-900 outline-none transition focus:border-blue-600"
              />
            </div>

            {dateRangeError && (
              <p className="mt-2 text-xs font-semibold text-red-600">
                {dateRangeError}
              </p>
            )}

            {(dateFromFilter || dateToFilter) && (
              <button
                type="button"
                onClick={() => {
                  setDateFromFilter("");
                  setDateToFilter("");
                  setDateRangeError("");
                }}
                className="mt-3 h-9 w-full rounded-md border border-gray-200 bg-white text-sm font-bold text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                Xóa lọc thời gian
              </button>
            )}
          </section>
        </aside>

        <main className="min-w-0">
          <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/5">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <h2 className="text-lg font-bold text-gray-950">
                  Danh sách yêu cầu
                </h2>
                <p className="text-sm font-medium text-gray-500">
                  Hiển thị {visibleRequests.length} trên{" "}
                  {filteredRequests.length} yêu cầu phù hợp.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {bulkDeleteMode ? (
                  <>
                    <button
                      type="button"
                      onClick={toggleVisibleRequestSelection}
                      disabled={visibleRequests.length === 0}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                    >
                      {allVisibleRequestsSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedRequests}
                      disabled={selectedRequests.length === 0 || deletingId === "bulk"}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                      {deletingId === "bulk" ? "Đang xóa..." : `Xóa đã chọn (${selectedRequests.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkDeleteMode(false);
                        setSelectedRequestKeys([]);
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
                    >
                      Hủy
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setBulkDeleteMode(true)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-700 transition hover:bg-red-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Xóa nhiều
                  </button>
                )}
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
                  <div
                    key={item}
                    className="h-40 animate-pulse rounded-md bg-gray-100"
                  />
                ))}
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
                <NoSymbolIcon className="h-12 w-12 text-gray-300" />
                <div className="mt-3 text-base font-bold text-gray-900">
                  Không có yêu cầu phù hợp
                </div>
                <div className="mt-1 text-sm font-medium text-gray-500">
                  Thử đổi bộ lọc hoặc làm mới dữ liệu.
                </div>
              </div>
            ) : (
              <div
                onScroll={handleListScroll}
                className="max-h-[calc(100vh-220px)] min-h-[420px] overflow-y-auto overscroll-contain"
              >
                <div className="divide-y divide-gray-100">
                  {visibleRequests.map((request) => {
                    const statusKey = getStatusKey(request);
                    const meta = statusMeta[statusKey] || {
                      label: request.status,
                      tone: "border-gray-200 bg-gray-50 text-gray-700",
                      dot: "bg-gray-400",
                    };
                    const isAvailability = request.kind === "availability";
                    const isPayroll = request.kind === "payroll";
                    const isSwap = request.kind === "swap";
                    const requesterShift = shiftSummary(request, "requester");
                    const targetShift = shiftSummary(request, "target");
                    const canCancel =
                      isSwap && request.status === "PENDING_TARGET";
                    const canRevert = isSwap && request.status === "APPROVED";
                    const canRemind =
                      isAvailability &&
                      !Number(request.has_submitted) &&
                      ["PENDING", null, undefined].includes(request.status);
                    const canRespondAvailabilityEdit =
                      isAvailability && request.status === "EDIT_PENDING";
                    const canRespondPayroll =
                      isPayroll && request.status === "PENDING";
                    const canResolve = canCancel || canRevert;
                    const reason = reasonById[request.swap_request_id] || "";
                    const isBusy =
                      loadingId === request.swap_request_id ||
                      loadingId === request.request_key;
                    const isDeleting = deletingId === request.request_key;
                    const isSelected = selectedRequestKeys.includes(
                      request.request_key,
                    );

                    return (
                      <article
                        key={request.request_key}
                        onClick={(event) =>
                          handleRequestCardClick(event, request.request_key)
                        }
                        className={`relative p-4 transition duration-200 hover:bg-slate-50 ${
                          bulkDeleteMode
                            ? "cursor-pointer"
                            : ""
                        } ${
                          isSelected
                            ? "request-selection-enter bg-red-50 ring-1 ring-inset ring-red-200"
                            : ""
                        }`}
                      >
                        {bulkDeleteMode && (
                          <div className={`pointer-events-none absolute inset-y-0 left-0 w-1 transition-colors ${isSelected ? "bg-red-500" : "bg-transparent"}`} />
                        )}
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {bulkDeleteMode && (
                                <span className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${isSelected ? "border-red-500 bg-red-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                                  <CheckCircleIcon className="h-4 w-4" />
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-bold ${meta.tone}`}
                              >
                                <span
                                  className={`h-2 w-2 rounded-full ${meta.dot}`}
                                />
                                {meta.label}
                              </span>
                              <span className="text-xs font-bold uppercase text-gray-400">
                                #
                                {isAvailability
                                  ? request.id
                                  : isPayroll
                                    ? request.feedback_id
                                    : request.swap_request_id}
                              </span>
                              <span className="rounded bg-gray-100 px-2 py-1 text-xs font-bold uppercase text-gray-600">
                                {isAvailability
                                  ? "Lịch rảnh"
                                  : isPayroll
                                    ? "Lương"
                                    : "Đổi ca"}
                              </span>
                              <span className="text-sm font-semibold text-gray-500">
                                {formatDateTime(request.created_at)}
                              </span>
                              {canRemind && (
                                <button
                                  type="button"
                                  onClick={() => remindAvailability(request)}
                                  disabled={isBusy}
                                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-cyan-600 px-2.5 text-xs font-bold text-white transition hover:bg-cyan-700 disabled:opacity-60"
                                >
                                  <BellAlertIcon className="h-4 w-4" />
                                  {isBusy ? "Đang gửi..." : "Nhắc nhở"}
                                </button>
                              )}
                              {!bulkDeleteMode && (
                                <button
                                  type="button"
                                  onClick={() => deleteRequest(request)}
                                  disabled={isDeleting}
                                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                  {isDeleting ? "Đang xóa..." : "Xóa"}
                                </button>
                              )}
                            </div>

                            {isAvailability ? (
                              <div className="mt-3">
                                <AvailabilityBlock request={request} />
                                <div className="mt-3 rounded-md bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-800">
                                  Trạng thái:{" "}
                                  {request.status === "APPROVED"
                                    ? "Nhân viên đã nhập lịch rảnh"
                                    : "Nhân viên chưa nhập lịch rảnh"}
                                </div>
                              </div>
                            ) : isPayroll ? (
                              <div className="mt-3 grid gap-2 text-sm font-medium text-gray-700">
                                <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-900">
                                  <div className="text-xs font-bold uppercase text-emerald-600">
                                    {request.employee_name ||
                                      request.email ||
                                      "Nhân viên"}
                                  </div>
                                  <div className="mt-1 text-base font-bold">
                                    {request.subject}
                                  </div>
                                  <div className="mt-2 whitespace-pre-wrap leading-6">
                                    {request.content}
                                  </div>
                                </div>
                                {request.admin_reply && (
                                  <div className="rounded-md bg-blue-50 px-3 py-2 text-blue-800">
                                    Phản hồi admin: {request.admin_reply}
                                  </div>
                                )}
                              </div>
                            ) : (
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
                            )}

                            {isSwap &&
                              (request.requester_note ||
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
                                      Lý do hoàn tác:{" "}
                                      {request.admin_revert_reason}
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>

                          {isAvailability && canRespondAvailabilityEdit && (
                            <div className="w-full shrink-0 xl:w-72">
                              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                                <div className="text-sm font-bold text-amber-900">
                                  Nhân viên xin phép sửa lịch rảnh.
                                </div>
                                <div className="mt-3 grid gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      respondAvailabilityEdit(
                                        request,
                                        "approve",
                                      )
                                    }
                                    disabled={isBusy}
                                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    <CheckCircleIcon className="h-5 w-5" />
                                    {isBusy ? "Đang xử lý..." : "Duyệt sửa"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      respondAvailabilityEdit(request, "reject")
                                    }
                                    disabled={isBusy}
                                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-red-600 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                                  >
                                    <XCircleIcon className="h-5 w-5" />
                                    {isBusy ? "Đang xử lý..." : "Từ chối"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {isPayroll && (
                            <div className="w-full shrink-0 xl:w-72">
                              {canRespondPayroll ? (
                                <div className="rounded-md border border-emerald-200 bg-white p-3">
                                  <label className="text-xs font-bold uppercase text-gray-500">
                                    Nội dung trả lời
                                  </label>
                                  <textarea
                                    value={
                                      payrollReplyById[request.feedback_id] ||
                                      ""
                                    }
                                    onChange={(event) =>
                                      setPayrollReplyById((prev) => ({
                                        ...prev,
                                        [request.feedback_id]:
                                          event.target.value,
                                      }))
                                    }
                                    rows={4}
                                    className="mt-2 w-full resize-none rounded-md border border-gray-300 p-2 text-sm font-medium text-gray-900 outline-none transition focus:border-emerald-600"
                                    placeholder="Nhập nội dung trả lời..."
                                  />
                                  <div className="mt-2 grid gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        respondPayrollFeedback(request, "reply")
                                      }
                                      disabled={isBusy}
                                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                      <CheckCircleIcon className="h-5 w-5" />
                                      {isBusy ? "Đang xử lý..." : "Trả lời"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        respondPayrollFeedback(
                                          request,
                                          "reject",
                                        )
                                      }
                                      disabled={isBusy}
                                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-red-600 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                                    >
                                      <XCircleIcon className="h-5 w-5" />
                                      {isBusy ? "Đang xử lý..." : "Từ chối"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex min-h-24 items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-3 text-center text-sm font-bold text-gray-500">
                                  Phản hồi lương đã được xử lý
                                </div>
                              )}
                            </div>
                          )}

                          {isSwap && (
                            <div className="w-full shrink-0 xl:w-72">
                              {canResolve ? (
                                <div className="rounded-md border border-gray-200 bg-white p-3">
                                  <label className="text-xs font-bold uppercase text-gray-500">
                                    {canRevert ? "Lý do hoàn tác" : "Lý do hủy"}
                                  </label>
                                  <textarea
                                    value={reason}
                                    onChange={(event) =>
                                      setReason(
                                        request.swap_request_id,
                                        event.target.value,
                                      )
                                    }
                                    rows={3}
                                    className="mt-2 w-full resize-none rounded-md border border-gray-300 p-2 text-sm font-medium text-gray-900 outline-none transition focus:border-blue-600"
                                    placeholder={
                                      canRevert
                                        ? "Nhập lý do..."
                                        : "Ghi chú tùy chọn..."
                                    }
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      submitAction(
                                        request,
                                        canRevert ? "revert" : "cancel",
                                      )
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
                                    {isBusy
                                      ? "Đang xử lý..."
                                      : canRevert
                                        ? "Hoàn tác"
                                        : "Hủy yêu cầu"}
                                  </button>
                                </div>
                              ) : (
                                <div className="flex min-h-24 items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-3 text-center text-sm font-bold text-gray-500">
                                  Yêu cầu đã được giải quyết
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {visibleRequests.length < filteredRequests.length && (
                  <div className="flex justify-center border-t border-gray-100 p-3">
                    <button
                      type="button"
                      onClick={loadMoreRequests}
                      className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      Tải thêm yêu cầu
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
