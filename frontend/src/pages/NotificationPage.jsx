import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowPathIcon,
  BellIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
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
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("vi-VN", {
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
      className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      dot: "bg-emerald-500",
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
    className: "bg-slate-50 text-slate-700 ring-slate-100",
    dot: "bg-slate-500",
  };
}

function requestStatusLabel(status) {
  const map = {
    APPROVED: ["Đã chấp nhận", "bg-emerald-50 text-emerald-700 ring-emerald-100"],
    REJECTED: ["Đã từ chối", "bg-red-50 text-red-700 ring-red-100"],
    PENDING: ["Đang chờ", "bg-amber-50 text-amber-700 ring-amber-100"],
    PENDING_TARGET: ["Chờ nhân viên", "bg-amber-50 text-amber-700 ring-amber-100"],
  };
  const item = map[status] || ["Đang chờ", "bg-slate-50 text-slate-700 ring-slate-100"];
  return { label: item[0], className: item[1] };
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value || "-"}</div>
    </div>
  );
}

function ActionButton({ children, tone = "slate", onClick }) {
  const tones = {
    slate: "bg-slate-950 text-white hover:bg-slate-800",
    blue: "bg-blue-600 text-white hover:bg-blue-700",
    green: "bg-emerald-600 text-white hover:bg-emerald-700",
    red: "bg-red-600 text-white hover:bg-red-700",
    purple: "bg-violet-600 text-white hover:bg-violet-700",
    white: "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
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
  const [visibleCount, setVisibleCount] = useState(notificationBatchSize);
  const loadMoreRef = useRef(null);
  const role = getRole();
  const navigate = useNavigate();

  const unreadCount = useMemo(
    () => data.filter((item) => !item.is_read).length,
    [data],
  );
  const visibleNotifications = useMemo(
    () => data.slice(0, visibleCount),
    [data, visibleCount],
  );
  const visibleIds = useMemo(
    () => visibleNotifications.map((item) => item.notification_id),
    [visibleNotifications],
  );
  const hasMoreNotifications = visibleCount < data.length;
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
    if (!window.confirm(`Xóa ${selectedIds.length} thông báo đã chọn?`)) return;

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
      refreshNotificationCount();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Không thể xóa thông báo");
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
    const node = loadMoreRef.current;
    if (!node || !hasMoreNotifications) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) =>
            Math.min(count + notificationBatchSize, data.length),
          );
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [data.length, hasMoreNotifications]);

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      {loading && data.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-cyan-600" />
          <div className="mt-3 text-sm font-semibold text-slate-500">
            Đang tải thông báo...
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <InboxIcon className="mx-auto h-10 w-10 text-slate-300" />
          <div className="mt-3 text-base font-black text-slate-900">
            Không có thông báo
          </div>
          <div className="mt-1 text-sm font-medium text-slate-500">
            Các yêu cầu mới sẽ xuất hiện tại đây.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="sticky top-3 z-30 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              Chọn tất cả đã tải
              {selectedIds.length > 0 && (
                <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-black text-cyan-700">
                  {selectedIds.length} đã chọn
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <ArrowPathIcon className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
                Làm mới
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                  <CheckCircleIcon className="h-5 w-5" />
                  Đọc tất cả
                </button>
              )}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700"
                >
                  <TrashIcon className="h-5 w-5" />
                  Xóa đã chọn
                </button>
              )}
            </div>
          </div>
          {visibleNotifications.map((n) => {
            const tone = notificationTone(n.type);
            const ToneIcon = tone.icon;
            const showAvailabilityButtons =
              n.type === "AVAILABILITY_REQUEST" &&
              role === "ADMIN" &&
              (n.request_status === null ||
                n.request_status === undefined ||
                n.request_status === "PENDING");

            return (
              <article
                key={n.notification_id}
                onClick={() => {
                  if (n.type === "AVAILABILITY_FILL_REQUEST" && role === "EMPLOYEE") {
                    return;
                  }
                  markRead(n.notification_id);
                }}
                className={`group relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  n.is_read
                    ? "border-slate-200"
                    : "border-cyan-200 ring-1 ring-cyan-100"
                }`}
              >
                <label
                  className="absolute left-4 top-4 z-10 inline-flex cursor-pointer rounded-lg bg-white/90 p-1 shadow-sm ring-1 ring-slate-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(n.notification_id)}
                    onChange={() => toggleSelected(n.notification_id)}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    aria-label="Chọn thông báo"
                  />
                </label>
                {!n.is_read && (
                  <div className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-cyan-500" />
                )}

                <div className="grid gap-3 pl-8 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
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
                            ? "bg-slate-100 text-slate-500"
                            : "bg-cyan-100 text-cyan-700"
                        }`}
                      >
                        {n.is_read ? "Đã đọc" : "Chưa đọc"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                      {n.message}
                    </p>
                    {n.employee_name && n.month && n.year && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                        <CalendarDaysIcon className="h-4 w-4" />
                        Tháng {n.month}/{n.year} · {n.employee_name}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-3 lg:block lg:text-right">
                    <div className="text-xs font-semibold text-slate-500">
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

                {n.type === "AVAILABILITY_REQUEST" && role === "ADMIN" && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    {n.request_status === "APPROVED" && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700 ring-1 ring-emerald-100">
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
                      <div className="mt-3 rounded-lg bg-white p-3 text-sm font-medium text-slate-700 ring-1 ring-blue-100">
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
                            className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium outline-none transition focus:border-blue-500"
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
                            className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium outline-none transition focus:border-violet-500"
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
                      <div className="mt-3 rounded-lg bg-white p-3 text-sm font-medium text-slate-700 ring-1 ring-orange-100">
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
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                    <div className="flex items-start gap-2">
                      <UserCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">
                          {n.payroll_employee_name || "Nhân viên"}:{" "}
                          {n.payroll_subject}
                        </p>
                        <p className="mt-1 text-sm font-medium leading-6 text-slate-700">
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
                          className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium outline-none transition focus:border-emerald-500"
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
                      <p className="mt-3 rounded-lg bg-white p-3 text-sm font-semibold text-slate-700 ring-1 ring-emerald-100">
                        {n.payroll_status === "REJECTED"
                          ? "Đã từ chối"
                          : "Đã trả lời"}
                        : {n.payroll_reply || "-"}
                      </p>
                    )}
                  </div>
                )}

                {n.type === "PAYROLL_FEEDBACK_RESPONSE" && (
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm text-slate-700">
                    <p className="font-black text-slate-900">
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
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-500">
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                Đang tải thêm...
              </div>
            ) : (
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Đã hiển thị tất cả thông báo
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



