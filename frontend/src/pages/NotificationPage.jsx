import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowPathIcon,
  BellIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  FunnelIcon,
  InboxIcon,
  PaperAirplaneIcon,
  TrashIcon,
  UserCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { getRole } from "../utils/auth";
import { API_URL } from "../services/api";

const notificationBatchSize = 8;

function getUserId() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  return user?.user_id;
}

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateTime(value) {
  if (!value) return "-";
  const normalized = String(value).includes("T")
    ? String(value)
    : `${String(value).replace(" ", "T")}+07:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

function timeRange(start, end) {
  return `${start?.slice(0, 5) || "--:--"} - ${end?.slice(0, 5) || "--:--"}`;
}

function notificationTone(type) {
  if (type?.includes("SHIFT_SWAP")) {
    return {
      icon: ArrowPathIcon,
      label: "Đổi ca",
      className: "bg-blue-50 text-blue-700 ring-blue-100",
      dot: "bg-blue-500",
    };
  }
  if (type?.includes("ATTENDANCE")) {
    return {
      icon: ClockIcon,
      label: "Chấm công",
      className: "bg-orange-50 text-orange-700 ring-orange-100",
      dot: "bg-orange-500",
    };
  }
  if (type?.includes("PAYROLL")) {
    return {
      icon: PaperAirplaneIcon,
      label: "Lương",
      className: "bg-green-50 text-green-700 ring-green-100",
      dot: "bg-green-500",
    };
  }
  if (type?.includes("AVAILABILITY")) {
    return {
      icon: CalendarDaysIcon,
      label: "Lịch rảnh",
      className: "bg-violet-50 text-violet-700 ring-violet-100",
      dot: "bg-violet-500",
    };
  }
  return {
    icon: BellIcon,
    label: "Thông báo",
    className: "bg-gray-50 text-gray-700 ring-gray-100",
    dot: "bg-gray-500",
  };
}

function notificationCategoryKey(type) {
  if (type?.includes("SHIFT_SWAP")) return "SHIFT_SWAP";
  if (type?.includes("ATTENDANCE")) return "ATTENDANCE";
  if (type?.includes("PAYROLL")) return "PAYROLL";
  if (type?.includes("AVAILABILITY")) return "AVAILABILITY";
  return "GENERAL";
}

const notificationFilterTypes = [
  "SHIFT_SWAP",
  "ATTENDANCE",
  "PAYROLL",
  "AVAILABILITY",
  "GENERAL",
];

function requestStatusLabel(status) {
  const map = {
    APPROVED: ["Đã chấp nhận", "bg-green-50 text-green-700 ring-green-100"],
    REJECTED: ["Đã từ chối", "bg-red-50 text-red-700 ring-red-100"],
    PENDING: ["Đang chờ", "bg-amber-50 text-amber-700 ring-amber-100"],
    PENDING_TARGET: ["Chờ nhân viên", "bg-amber-50 text-amber-700 ring-amber-100"],
    SUBMITTED: ["Đã lưu", "bg-cyan-50 text-cyan-700 ring-cyan-100"],
    EDIT_PENDING: ["Chờ duyệt sửa", "bg-amber-50 text-amber-700 ring-amber-100"],
    EDIT_APPROVED: ["Đã duyệt sửa", "bg-green-50 text-green-700 ring-green-100"],
  };
  const item = map[status] || ["Đang chờ", "bg-gray-50 text-gray-700 ring-gray-100"];
  return { label: item[0], className: item[1] };
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-100">
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-800">{value || "-"}</div>
    </div>
  );
}

function ActionButton({ children, tone = "gray", onClick }) {
  const tones = {
    gray: "bg-gray-950 text-white hover:bg-gray-800",
    blue: "bg-blue-600 text-white hover:bg-blue-700",
    green: "bg-green-600 text-white hover:bg-green-700",
    red: "bg-red-600 text-white hover:bg-red-700",
    purple: "bg-violet-600 text-white hover:bg-violet-700",
    white: "border border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-2 text-sm font-bold transition ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export default function NotificationPage() {
  const [data, setData] = useState([]);
  const [replyById, setReplyById] = useState({});
  const [swapReasonById, setSwapReasonById] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [readFilter, setReadFilter] = useState("ALL");
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [visibleCount, setVisibleCount] = useState(notificationBatchSize);
  const loadMoreRef = useRef(null);
  const role = getRole();
  const navigate = useNavigate();

  const unreadCount = useMemo(
    () => data.filter((item) => !item.is_read).length,
    [data],
  );
  const notificationTypeOptions = useMemo(() => {
    const counts = data.reduce((acc, item) => {
      const key = notificationCategoryKey(item.type);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return notificationFilterTypes.map((key) => ({
      key,
      count: counts[key] || 0,
      label: notificationTone(key).label,
    }));
  }, [data]);
  const filteredNotifications = useMemo(
    () =>
      data.filter((item) => {
        const matchesType =
          typeFilter === "ALL" || notificationCategoryKey(item.type) === typeFilter;
        const matchesRead =
          readFilter === "ALL" ||
          (readFilter === "UNREAD" ? !item.is_read : Boolean(item.is_read));
        return matchesType && matchesRead;
      }),
    [data, readFilter, typeFilter],
  );
  const visibleNotifications = useMemo(
    () => filteredNotifications.slice(0, visibleCount),
    [filteredNotifications, visibleCount],
  );
  const visibleIds = useMemo(
    () => visibleNotifications.map((item) => item.notification_id),
    [visibleNotifications],
  );
  const hasMoreNotifications = visibleCount < filteredNotifications.length;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const refreshNotificationCount = () => {
    window.dispatchEvent(new Event("notification-count-changed"));
  };

  async function fetchData() {
    try {
      const userId = getUserId();
      if (!userId) return;

      setLoading(true);
      const res = await axios.get(`${API_URL}/notifications`, {
        headers: { "user-id": userId },
      });
      setData(res.data || []);
      setSelectedIds([]);
      setVisibleCount(notificationBatchSize);
    } catch (err) {
      console.error("Lỗi tải thông báo:", err);
    } finally {
      setLoading(false);
    }
  }

  const markRead = async (id) => {
    try {
      const item = data.find((n) => n.notification_id === id);
      if (item?.is_read) return;

      await axios.patch(`${API_URL}/notifications/${id}`);
      setData((prev) =>
        prev.map((n) =>
          n.notification_id === id ? { ...n, is_read: 1 } : n,
        ),
      );
      refreshNotificationCount();
    } catch (err) {
      console.error(err);
    }
  };

  const markAllRead = async () => {
    try {
      const userId = getUserId();
      if (!userId) return;

      await axios.patch(`${API_URL}/notifications/read-all`, null, {
        headers: { "user-id": userId },
      });

      setData((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      refreshNotificationCount();
    } catch (err) {
      console.error(err);
      alert("Không thể đánh dấu đã đọc tất cả");
    }
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...prev, ...visibleIds])),
    );
  };

  const deleteSelected = async () => {
    if (!selectedIds.length) return;
    const confirmOptions = {
      title: "Xóa thông báo",
      message: `Xóa ${selectedIds.length} thông báo đã chọn?`,
      confirmText: "Xóa",
      cancelText: "Giữ lại",
      type: "warning",
    };
    const confirmed = window.appConfirm
      ? await window.appConfirm(confirmOptions)
      : window.confirm(confirmOptions.message);
    if (!confirmed) return;

    try {
      const userId = getUserId();
      if (!userId) return;

      await axios.delete(`${API_URL}/notifications`, {
        headers: { "user-id": userId },
        data: { ids: selectedIds },
      });

      setData((prev) =>
        prev.filter((item) => !selectedIds.includes(item.notification_id)),
      );
      setSelectedIds([]);
      setBulkDeleteMode(false);
      refreshNotificationCount();
    } catch (err) {
      console.error(err);
      alert(
        err.response?.data?.detail ||
          err.response?.data?.message ||
          "Không thể xóa thông báo",
      );
    }
  };

  const approve = async (id) => {
    try {
      await axios.post(`${API_URL}/availability/approve/${id}`, {}, {
        headers: authHeaders(),
      });
      alert("Đã chấp nhận lịch");
      fetchData();
    } catch (err) {
      alert("Lỗi chấp nhận: " + (err.response?.data?.message || err.message));
    }
  };

  const reject = async (id) => {
    try {
      await axios.post(`${API_URL}/availability/reject/${id}`, {}, {
        headers: authHeaders(),
      });
      alert("Đã từ chối lịch");
      fetchData();
    } catch (err) {
      alert("Lỗi từ chối: " + (err.response?.data?.message || err.message));
    }
  };

  const respondShiftSwap = async (id, action) => {
    try {
      await axios.post(
        `${API_URL}/shift-swaps/${id}/respond`,
        { action },
        { headers: authHeaders() },
      );
      alert(action === "accept" ? "Đã chấp nhận đổi ca" : "Đã từ chối đổi ca");
      fetchData();
      refreshNotificationCount();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý yêu cầu đổi ca");
    }
  };

  const respondLateRequest = async (id, action) => {
    try {
      await axios.post(
        `${API_URL}/attendance/late-request/${id}/respond`,
        { action },
        { headers: authHeaders() },
      );
      alert(action === "approve" ? "Đã duyệt xin trễ" : "Đã từ chối xin trễ");
      fetchData();
      refreshNotificationCount();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý yêu cầu xin trễ");
    }
  };

  const respondAvailabilityEdit = async (id, action) => {
    try {
      await axios.post(
        `${API_URL}/availability/request/edit/${id}/respond`,
        { action },
        { headers: authHeaders() },
      );
      alert(action === "approve" ? "Đã duyệt yêu cầu sửa" : "Đã từ chối yêu cầu sửa");
      fetchData();
      refreshNotificationCount();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý yêu cầu sửa lịch rảnh");
    }
  };

  const adminShiftSwapAction = async (id, action) => {
    try {
      const reason = swapReasonById[id] || "";

      if (action === "revert" && !reason.trim()) {
        alert("Vui lòng nhập lý do hoàn tác");
        return;
      }

      await axios.post(
        `${API_URL}/shift-swaps/${id}/${action}`,
        { reason },
        { headers: authHeaders() },
      );
      setSwapReasonById((prev) => ({ ...prev, [id]: "" }));
      alert(action === "cancel" ? "Đã hủy yêu cầu đổi ca" : "Đã hoàn tác đổi ca");
      fetchData();
      refreshNotificationCount();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý yêu cầu đổi ca");
    }
  };

  const respondPayrollFeedback = async (feedbackId, action) => {
    try {
      const reply = replyById[feedbackId] || "";

      await axios.post(
        `${API_URL}/payroll/feedback/${feedbackId}/respond`,
        { action, reply },
        { headers: authHeaders() },
      );

      alert(action === "reject" ? "Đã từ chối phản hồi" : "Đã gửi trả lời");
      setReplyById((prev) => ({ ...prev, [feedbackId]: "" }));
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý phản hồi lương");
    }
  };

  const openAvailabilityFill = async (notification) => {
    try {
      await axios.patch(`${API_URL}/notifications/${notification.notification_id}`);

      setData((prev) =>
        prev.map((n) =>
          n.notification_id === notification.notification_id
            ? { ...n, is_read: 1 }
            : n,
        ),
      );

      let availabilityData = [];
      try {
        availabilityData =
          typeof notification.availability_data === "string"
            ? JSON.parse(notification.availability_data || "[]")
            : notification.availability_data || [];
      } catch {
        availabilityData = [];
      }

      localStorage.setItem(
        "availabilityFillRequest",
        JSON.stringify({
          month: notification.month,
          year: notification.year,
          requestId: notification.ref_id,
          availability: availabilityData,
        }),
      );
      window.dispatchEvent(new Event("availability-access-changed"));
      refreshNotificationCount();
      navigate(
        `/availabilityPage?month=${notification.month}&year=${notification.year}`,
      );
    } catch (err) {
      console.error(err);
      alert("Không thể mở trang điền lịch rảnh");
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setVisibleCount(notificationBatchSize);
  }, [readFilter, typeFilter]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMoreNotifications) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) =>
            Math.min(count + notificationBatchSize, filteredNotifications.length),
          );
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredNotifications.length, hasMoreNotifications]);

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      {loading && data.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-cyan-600" />
          <div className="mt-3 text-sm font-semibold text-gray-500">
            Đang tải thông báo...
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center shadow-sm">
          <InboxIcon className="mx-auto h-10 w-10 text-gray-300" />
          <div className="mt-3 text-base font-black text-gray-900">
            Không có thông báo
          </div>
          <div className="mt-1 text-sm font-medium text-gray-500">
            Các yêu cầu mới sẽ xuất hiện tại đây.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="z-0 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:sticky sm:top-3 sm:z-30">
            <div className="flex gap-2 sm:hidden">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Loại thông báo</span>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 outline-none focus:border-green-500"
                >
                  <option value="ALL">Tất cả loại ({data.length})</option>
                  {notificationTypeOptions.map((option) => (
                    <option key={option.key} value={option.key}>{option.label} ({option.count})</option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Trạng thái đã đọc</span>
                <select
                  value={readFilter}
                  onChange={(event) => setReadFilter(event.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 outline-none focus:border-green-500"
                >
                  <option value="ALL">Tất cả ({data.length})</option>
                  <option value="UNREAD">Chưa đọc ({unreadCount})</option>
                  <option value="READ">Đã đọc ({data.length - unreadCount})</option>
                </select>
              </label>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="hidden min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 sm:flex">
                <FunnelIcon className="h-5 w-5 shrink-0 text-green-600" />
                {[{ key: "ALL", label: "Tất cả", count: data.length }, ...notificationTypeOptions].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setTypeFilter(option.key)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold transition ${
                      typeFilter === option.key
                        ? "bg-green-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-700"
                    }`}
                  >
                    {option.label} <span className="opacity-75">{option.count}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-800 transition hover:bg-gray-50 disabled:opacity-60 sm:px-4"
              >
                <ArrowPathIcon className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
                Làm mới
              </button>
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
                aria-label="Đánh dấu tất cả là đã xem"
                title="Đánh dấu tất cả là đã xem"
              >
                <CheckCircleIcon className="h-5 w-5" />
                <span className="hidden sm:inline">Đã xem tất cả</span>
              </button>
              {!bulkDeleteMode ? (
                <button
                  type="button"
                  onClick={() => setBulkDeleteMode(true)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-50 px-3 text-sm font-bold text-red-700 ring-1 ring-red-100 transition hover:bg-red-100 sm:px-4"
                  aria-label="Xóa nhiều thông báo"
                  title="Xóa nhiều thông báo"
                >
                  <TrashIcon className="h-5 w-5" />
                  <span className="hidden sm:inline">Xóa nhiều</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50 sm:px-4"
                    aria-label={allVisibleSelected ? "Bỏ chọn tất cả thông báo đang hiển thị" : "Chọn tất cả thông báo đang hiển thị"}
                    title={allVisibleSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                  >
                    <CheckCircleIcon className="h-5 w-5" />
                    <span className="hidden sm:inline">{allVisibleSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    disabled={selectedIds.length === 0}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 text-sm font-bold text-white transition hover:bg-red-700 sm:px-4"
                    aria-label={`Xóa ${selectedIds.length} thông báo đã chọn`}
                    title={`Xóa đã chọn (${selectedIds.length})`}
                  >
                    <TrashIcon className="h-5 w-5" />
                    <span className="hidden sm:inline">Xóa đã chọn {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds([]);
                      setBulkDeleteMode(false);
                    }}
                    className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-bold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                  >
                    Hủy
                  </button>
                </>
              )}
              </div>
            </div>
            <div className="hidden items-center gap-2 overflow-x-auto border-t border-gray-100 pt-3 sm:flex">
              <span className="shrink-0 text-xs font-black uppercase tracking-wide text-gray-400">Trạng thái</span>
              {[
                ["ALL", "Tất cả", data.length],
                ["UNREAD", "Chưa đọc", unreadCount],
                ["READ", "Đã đọc", data.length - unreadCount],
              ].map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setReadFilter(key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    readFilter === key
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-700"
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </div>
          {filteredNotifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
              <InboxIcon className="mx-auto h-9 w-9 text-gray-300" />
              <div className="mt-3 text-sm font-black text-gray-800">
                Không có thông báo thuộc loại này
              </div>
            </div>
          ) : visibleNotifications.map((n) => {
            const tone = notificationTone(n.type);
            const ToneIcon = tone.icon;
            const showAvailabilityButtons =
              n.type === "AVAILABILITY_REQUEST" &&
              role === "ADMIN" &&
              (n.request_status === null ||
                n.request_status === undefined ||
                n.request_status === "PENDING");
            const showAvailabilityEditButtons =
              n.type === "AVAILABILITY_EDIT_REQUEST" &&
              role === "ADMIN" &&
              n.request_status === "EDIT_PENDING";

            return (
              <article
                key={n.notification_id}
                onClick={(event) => {
                  if (bulkDeleteMode) {
                    if (event.target.closest("button, input, textarea, select, a, label")) {
                      return;
                    }
                    toggleSelected(n.notification_id);
                    return;
                  }
                  if (n.type === "AVAILABILITY_FILL_REQUEST" && role === "EMPLOYEE") {
                    return;
                  }
                  markRead(n.notification_id);
                }}
                className={`group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-[0.995] ${
                  bulkDeleteMode
                    ? selectedIds.includes(n.notification_id)
                      ? "request-selection-enter cursor-pointer border-red-300 bg-red-50 ring-1 ring-red-100"
                      : "cursor-pointer border-gray-200 bg-white hover:border-red-200 hover:bg-red-50/40"
                    : n.is_read
                      ? "border-gray-200 bg-white"
                      : "border-green-200 bg-green-50/35 ring-1 ring-green-100"
                }`}
              >
                {bulkDeleteMode && (
                  <span className={`absolute left-4 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${
                    selectedIds.includes(n.notification_id)
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-gray-300 bg-white text-transparent"
                  }`}>
                    <CheckCircleIcon className="h-4 w-4" />
                  </span>
                )}
                {!n.is_read && (
                  <div className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-green-500 transition-opacity duration-300" />
                )}

                <div className={`grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] ${bulkDeleteMode ? "pl-8" : ""}`}>
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone.className}`}
                  >
                    <ToneIcon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${tone.className}`}
                      >
                        {tone.label}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                          n.is_read
                            ? "bg-gray-100 text-gray-500"
                            : "bg-cyan-100 text-cyan-700"
                        }`}
                      >
                        {n.is_read ? "Đã đọc" : "Chưa đọc"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-gray-900">
                      {n.message}
                    </p>
                    {n.employee_name && n.month && n.year && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                        <CalendarDaysIcon className="h-4 w-4" />
                        Tháng {n.month}/{n.year} · {n.employee_name}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-3 lg:block lg:text-right">
                    <div className="text-xs font-semibold text-gray-500">
                      {formatDateTime(n.created_at)}
                    </div>
                  </div>
                </div>

                {n.type === "AVAILABILITY_FILL_REQUEST" &&
                  role === "EMPLOYEE" &&
                  !n.is_read && (
                    <div className="mt-4 flex justify-end">
                      <ActionButton
                        tone="blue"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAvailabilityFill(n);
                        }}
                      >
                        Điền lịch rảnh
                      </ActionButton>
                    </div>
                  )}

                {n.type === "AVAILABILITY_EDIT_APPROVED" && role === "EMPLOYEE" && (
                  <div className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-bold text-green-700 ring-1 ring-green-100">
                    Admin đã duyệt yêu cầu sửa lịch rảnh của bạn.
                  </div>
                )}

                {n.type === "AVAILABILITY_EDIT_REJECTED" && role === "EMPLOYEE" && (
                  <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 ring-1 ring-red-100">
                    Yêu cầu sửa lịch rảnh đã bị từ chối.
                  </div>
                )}

                {n.type === "AVAILABILITY_REQUEST" && role === "ADMIN" && (
                  <div className="mt-4 rounded-xl bg-gray-50 p-3">
                    {n.request_status === "APPROVED" && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-green-700 ring-1 ring-green-100">
                        <CheckCircleIcon className="h-4 w-4" />
                        Đã chấp nhận
                      </span>
                    )}
                    {n.request_status === "REJECTED" && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700 ring-1 ring-red-100">
                        <XCircleIcon className="h-4 w-4" />
                        Đã từ chối
                      </span>
                    )}
                    {showAvailabilityButtons && (
                      <div className="flex flex-wrap gap-2">
                        <ActionButton
                          tone="green"
                          onClick={(e) => {
                            e.stopPropagation();
                            approve(n.ref_id);
                          }}
                        >
                          Chấp nhận
                        </ActionButton>
                        <ActionButton
                          tone="red"
                          onClick={(e) => {
                            e.stopPropagation();
                            reject(n.ref_id);
                          }}
                        >
                          Từ chối
                        </ActionButton>
                      </div>
                    )}
                  </div>
                )}

                {n.type === "AVAILABILITY_EDIT_REQUEST" && role === "ADMIN" && (
                  <div className="mt-4 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-100">
                    <div className="mb-3 text-sm font-bold text-amber-800">
                      {n.employee_name || "Nhân viên"} xin phép sửa lịch rảnh tháng {n.month}/{n.year}
                    </div>
                    {showAvailabilityEditButtons ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-2 text-sm font-bold transition"
                          style={{ backgroundColor: "#16a34a", color: "#ffffff" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            respondAvailabilityEdit(n.ref_id, "approve");
                          }}
                        >
                          Duyệt sửa
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-9 items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-red-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            respondAvailabilityEdit(n.ref_id, "reject");
                          }}
                        >
                          Từ chối
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${requestStatusLabel(n.request_status).className}`}
                      >
                        {requestStatusLabel(n.request_status).label}
                      </span>
                    )}
                  </div>
                )}

                {n.type?.startsWith("SHIFT_SWAP") && (
                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <DetailItem label="Người gửi" value={n.swap_requester_name} />
                      <DetailItem label="Người nhận" value={n.swap_target_name} />
                      <DetailItem
                        label="Ca gửi"
                        value={`${n.swap_requester_work_date || "-"} · ${n.swap_requester_shift_name || "-"} (${timeRange(n.swap_requester_start_time, n.swap_requester_end_time)})`}
                      />
                      <DetailItem
                        label="Ca nhận"
                        value={`${n.swap_target_work_date || "-"} · ${n.swap_target_shift_name || "-"} (${timeRange(n.swap_target_start_time, n.swap_target_end_time)})`}
                      />
                    </div>
                    {n.swap_requester_note && (
                      <div className="mt-3 rounded-lg bg-white p-3 text-sm font-medium text-gray-700 ring-1 ring-blue-100">
                        Ghi chú: {n.swap_requester_note}
                      </div>
                    )}
                    <div className="mt-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${requestStatusLabel(n.swap_status).className}`}
                      >
                        {requestStatusLabel(n.swap_status).label}
                      </span>
                    </div>

                    {n.type === "SHIFT_SWAP_TARGET_REQUEST" &&
                      role === "EMPLOYEE" &&
                      n.swap_status === "PENDING_TARGET" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <ActionButton
                            tone="green"
                            onClick={(e) => {
                              e.stopPropagation();
                              respondShiftSwap(n.ref_id, "accept");
                            }}
                          >
                            Chấp nhận
                          </ActionButton>
                          <ActionButton
                            tone="red"
                            onClick={(e) => {
                              e.stopPropagation();
                              respondShiftSwap(n.ref_id, "reject");
                            }}
                          >
                            Từ chối
                          </ActionButton>
                        </div>
                      )}

                    {n.type === "SHIFT_SWAP_ADMIN_REQUEST" &&
                      role === "ADMIN" &&
                      n.swap_status === "PENDING_TARGET" && (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={swapReasonById[n.ref_id] || ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setSwapReasonById((prev) => ({
                                ...prev,
                                [n.ref_id]: e.target.value,
                              }))
                            }
                            rows={2}
                            className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium outline-none transition focus:border-blue-500"
                            placeholder="Lý do hủy..."
                          />
                          <ActionButton
                            tone="red"
                            onClick={(e) => {
                              e.stopPropagation();
                              adminShiftSwapAction(n.ref_id, "cancel");
                            }}
                          >
                            Từ chối
                          </ActionButton>
                        </div>
                      )}

                    {n.type === "SHIFT_SWAP_APPROVED_ADMIN" &&
                      role === "ADMIN" &&
                      n.swap_status === "APPROVED" && (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={swapReasonById[n.ref_id] || ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setSwapReasonById((prev) => ({
                                ...prev,
                                [n.ref_id]: e.target.value,
                              }))
                            }
                            rows={2}
                            className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium outline-none transition focus:border-violet-500"
                            placeholder="Nhập lý do hoàn tác..."
                          />
                          <ActionButton
                            tone="purple"
                            onClick={(e) => {
                              e.stopPropagation();
                              adminShiftSwapAction(n.ref_id, "revert");
                            }}
                          >
                            Hoàn tác
                          </ActionButton>
                        </div>
                      )}
                  </div>
                )}

                {n.type === "ATTENDANCE_LATE_REQUEST" && role === "ADMIN" && (
                  <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/60 p-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <DetailItem label="Nhân viên" value={n.late_employee_name} />
                      <DetailItem
                        label="Số phút xin trễ"
                        value={`${n.late_requested_minutes || "-"} phút`}
                      />
                      <DetailItem
                        label="Ca"
                        value={`${n.late_work_date || "-"} · ${n.late_shift_name || "-"} (${timeRange(n.late_start_time, n.late_end_time)})`}
                      />
                      <DetailItem
                        label="Trạng thái"
                        value={requestStatusLabel(n.late_request_status).label}
                      />
                    </div>
                    {n.late_request_reason && (
                      <div className="mt-3 rounded-lg bg-white p-3 text-sm font-medium text-gray-700 ring-1 ring-orange-100">
                        Lý do: {n.late_request_reason}
                      </div>
                    )}
                    {n.late_request_status === "PENDING" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionButton
                          tone="green"
                          onClick={(e) => {
                            e.stopPropagation();
                            respondLateRequest(n.ref_id, "approve");
                          }}
                        >
                          Duyệt
                        </ActionButton>
                        <ActionButton
                          tone="red"
                          onClick={(e) => {
                            e.stopPropagation();
                            respondLateRequest(n.ref_id, "reject");
                          }}
                        >
                          Từ chối
                        </ActionButton>
                      </div>
                    )}
                  </div>
                )}

                {n.type === "PAYROLL_FEEDBACK" && role === "ADMIN" && (
                  <div className="mt-4 rounded-xl border border-green-100 bg-green-50/60 p-3">
                    <div className="flex items-start gap-2">
                      <UserCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-900">
                          {n.payroll_employee_name || "Nhân viên"}:{" "}
                          {n.payroll_subject}
                        </p>
                        <p className="mt-1 text-sm font-medium leading-6 text-gray-700">
                          {n.payroll_content}
                        </p>
                      </div>
                    </div>
                    {n.payroll_status === "PENDING" ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={replyById[n.payroll_feedback_id] || ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            setReplyById((prev) => ({
                              ...prev,
                              [n.payroll_feedback_id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium outline-none transition focus:border-green-500"
                          rows={3}
                          placeholder="Nhập nội dung trả lời..."
                        />
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            tone="blue"
                            onClick={(e) => {
                              e.stopPropagation();
                              respondPayrollFeedback(
                                n.payroll_feedback_id,
                                "reply",
                              );
                            }}
                          >
                            Trả lời
                          </ActionButton>
                          <ActionButton
                            tone="red"
                            onClick={(e) => {
                              e.stopPropagation();
                              respondPayrollFeedback(
                                n.payroll_feedback_id,
                                "reject",
                              );
                            }}
                          >
                            Từ chối
                          </ActionButton>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 rounded-lg bg-white p-3 text-sm font-semibold text-gray-700 ring-1 ring-green-100">
                        {n.payroll_status === "REJECTED"
                          ? "Đã từ chối"
                          : "Đã trả lời"}
                        : {n.payroll_reply || "-"}
                      </p>
                    )}
                  </div>
                )}

                {n.type === "PAYROLL_FEEDBACK_RESPONSE" && (
                  <div className="mt-4 rounded-xl border border-green-100 bg-green-50/60 p-3 text-sm text-gray-700">
                    <p className="font-black text-gray-900">
                      {n.payroll_subject}
                    </p>
                    <p className="mt-1 font-medium leading-6">
                      {n.payroll_reply || n.message}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
          <div ref={loadMoreRef} className="py-2 text-center">
            {hasMoreNotifications ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-gray-500">
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                Đang tải thêm...
              </div>
            ) : (
              <div className="text-xs font-bold uppercase tracking-wide text-gray-400">
                Đã hiển thị tất cả thông báo
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



