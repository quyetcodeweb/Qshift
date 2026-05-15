import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { getRole } from "../utils/auth";

export default function NotificationPage() {
  const [data, setData] = useState([]);
  const [replyById, setReplyById] = useState({});
  const [swapReasonById, setSwapReasonById] = useState({});
  const role = getRole();
  const navigate = useNavigate();

  console.log("🔐 Current role:", role);

  const refreshNotificationCount = () => {
    window.dispatchEvent(new Event("notification-count-changed"));
  };

  async function fetchData() {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      const userId = user?.user_id;

      if (!userId) {
        console.error("Không có user_id → chưa login?");
        return;
      }

      const res = await axios.get("http://localhost:5000/api/notifications", {
        headers: { "user-id": userId },
      });

      console.log("📬 Notifications fetched:", res.data);
      res.data.forEach((n) => {
        console.log(`Notification ${n.notification_id}:`, {
          type: n.type,
          request_status: n.request_status,
          ref_id: n.ref_id,
          employee_name: n.employee_name,
          month: n.month,
          year: n.year,
        });
      });

      setData(res.data);
    } catch (err) {
      console.error("Lỗi fetch notifications:", err);
    }
  };

  const markRead = async (id) => {
    try {
      const item = data.find((n) => n.notification_id === id);
      if (item?.is_read) return;

      await axios.patch(`http://localhost:5000/api/notifications/${id}`);
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
      const user = JSON.parse(localStorage.getItem("user"));
      const userId = user?.user_id;

      if (!userId) return;

      await axios.patch("http://localhost:5000/api/notifications/read-all", null, {
        headers: { "user-id": userId },
      });

      setData((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      refreshNotificationCount();
    } catch (err) {
      console.error(err);
      alert("Không thể đánh dấu đã đọc tất cả");
    }
  };
  const approve = async (id) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `http://localhost:5000/api/availability/approve/${id}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      alert("✅ Đã chấp nhận lịch");
      fetchData();
    } catch (err) {
      console.error("Approve error:", err.response?.data || err.message);
      alert("Lỗi chấp nhận: " + (err.response?.data?.message || err.message));
    }
  };

  const reject = async (id) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `http://localhost:5000/api/availability/reject/${id}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      alert("✅ Đã từ chối lịch");
      fetchData();
    } catch (err) {
      console.error("Reject error:", err.response?.data || err.message);
      alert("Lỗi từ chối: " + (err.response?.data?.message || err.message));
    }
  }

  const respondShiftSwap = async (id, action) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `http://localhost:5000/api/shift-swaps/${id}/respond`,
        { action },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      alert(action === "accept" ? "Đã chấp nhận đổi ca" : "Đã từ chối đổi ca");
      fetchData();
      refreshNotificationCount();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý yêu cầu đổi ca");
    }
  };

  const adminShiftSwapAction = async (id, action) => {
    try {
      const token = localStorage.getItem("token");
      const reason = swapReasonById[id] || "";

      if (action === "revert" && !reason.trim()) {
        alert("Vui lòng nhập lý do hoàn tác");
        return;
      }

      await axios.post(
        `http://localhost:5000/api/shift-swaps/${id}/${action}`,
        { reason },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      setSwapReasonById((prev) => ({ ...prev, [id]: "" }));
      alert(action === "cancel" ? "Đã hủy yêu cầu đổi ca" : "Đã hoàn tác đổi ca");
      fetchData();
      refreshNotificationCount();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý yêu cầu đổi ca");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

  const respondPayrollFeedback = async (feedbackId, action) => {
    try {
      const token = localStorage.getItem("token");
      const reply = replyById[feedbackId] || "";

      await axios.post(
        `http://localhost:5000/api/payroll/feedback/${feedbackId}/respond`,
        { action, reply },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
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
      await axios.patch(
        `http://localhost:5000/api/notifications/${notification.notification_id}`,
      );

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

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Thông báo</h2>
        {data.some((n) => !n.is_read) && (
          <button
            onClick={markAllRead}
            className="rounded bg-gray-800 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
          >
            Đọc tất cả
          </button>
        )}
      </div>

      {data.length === 0 && <p className="text-gray-500">Không có thông báo</p>}

      {data.map((n) => {
        const showButtons = n.type === "AVAILABILITY_REQUEST" && 
                           role === "ADMIN" && 
                           (n.request_status === null || n.request_status === undefined || n.request_status === "PENDING");
        
        console.log(`Notification ${n.notification_id}:`, {
          type: n.type,
          role,
          request_status: n.request_status,
          showButtons,
        });

        return (
          <div
            key={n.notification_id}
            onClick={() => {
              if (n.type === "AVAILABILITY_FILL_REQUEST" && role === "EMPLOYEE") {
                return;
              }
              markRead(n.notification_id);
            }}
            className={`p-4 mb-2 rounded-lg cursor-pointer ${
              n.is_read ? "bg-gray-100" : "bg-blue-100"
            }`}
          >
            <div className="flex justify-between">
              <div>
                <p>{n.message}</p>
                {n.employee_name && n.month && n.year && (
                  <p className="text-sm text-gray-600 mt-1">
                    📅 Tháng {n.month}/{n.year} - {n.employee_name}
                  </p>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </div>

            {n.type === "AVAILABILITY_FILL_REQUEST" &&
              role === "EMPLOYEE" &&
              !n.is_read && (
              <div className="mt-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openAvailabilityFill(n);
                  }}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  OK!
                </button>
              </div>
            )}

            {n.type === "AVAILABILITY_REQUEST" && role === "ADMIN" && (
              <div className="mt-2 flex gap-2">
                {n.request_status === "APPROVED" && (
                  <span className="text-green-600 font-semibold text-sm">✅ Đã chấp nhận</span>
                )}
                {n.request_status === "REJECTED" && (
                  <span className="text-red-600 font-semibold text-sm">❌ Đã từ chối</span>
                )}
                {showButtons && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        approve(n.ref_id);
                      }}
                      className="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                    >
                      Chấp nhận
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reject(n.ref_id);
                      }}
                      className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                    >
                      Từ chối
                    </button>
                  </>
                )}
              </div>
            )}

            {n.type?.startsWith("SHIFT_SWAP") && (
              <div className="mt-3 rounded border border-blue-100 bg-white p-3 text-sm text-gray-700">
                <div className="grid gap-2 md:grid-cols-2">
                  <p><span className="font-semibold">Người gửi:</span> {n.swap_requester_name || "-"}</p>
                  <p><span className="font-semibold">Người nhận:</span> {n.swap_target_name || "-"}</p>
                  <p>
                    <span className="font-semibold">Ca gửi:</span>{" "}
                    {n.swap_requester_work_date} - {n.swap_requester_shift_name}{" "}
                    ({n.swap_requester_start_time?.slice(0, 5)} - {n.swap_requester_end_time?.slice(0, 5)})
                  </p>
                  <p>
                    <span className="font-semibold">Ca nhận:</span>{" "}
                    {n.swap_target_work_date} - {n.swap_target_shift_name}{" "}
                    ({n.swap_target_start_time?.slice(0, 5)} - {n.swap_target_end_time?.slice(0, 5)})
                  </p>
                </div>
                {n.swap_requester_note && <p className="mt-2">Ghi chú: {n.swap_requester_note}</p>}
                <p className="mt-2 font-semibold">Trạng thái: {n.swap_status}</p>

                {n.type === "SHIFT_SWAP_TARGET_REQUEST" &&
                  role === "EMPLOYEE" &&
                  n.swap_status === "PENDING_TARGET" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          respondShiftSwap(n.ref_id, "accept");
                        }}
                        className="rounded bg-green-600 px-3 py-1 text-sm font-semibold text-white hover:bg-green-700"
                      >
                        Chấp nhận
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          respondShiftSwap(n.ref_id, "reject");
                        }}
                        className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700"
                      >
                        Từ chối
                      </button>
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
                          setSwapReasonById((prev) => ({ ...prev, [n.ref_id]: e.target.value }))
                        }
                        rows={2}
                        className="w-full rounded border border-gray-300 p-2 text-sm"
                        placeholder="Lý do hủy..."
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          adminShiftSwapAction(n.ref_id, "cancel");
                        }}
                        className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700"
                      >
                        Từ chối
                      </button>
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
                          setSwapReasonById((prev) => ({ ...prev, [n.ref_id]: e.target.value }))
                        }
                        rows={2}
                        className="w-full rounded border border-gray-300 p-2 text-sm"
                        placeholder="Nhập lý do hoàn tác..."
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          adminShiftSwapAction(n.ref_id, "revert");
                        }}
                        className="rounded bg-purple-600 px-3 py-1 text-sm font-semibold text-white hover:bg-purple-700"
                      >
                        Hoàn tác
                      </button>
                    </div>
                  )}
              </div>
            )}

            {n.type === "PAYROLL_FEEDBACK" && role === "ADMIN" && (
              <div className="mt-3 rounded border border-blue-100 bg-white p-3">
                <p className="text-sm font-semibold text-gray-900">
                  {n.payroll_employee_name || "Nhân viên"}: {n.payroll_subject}
                </p>
                <p className="mt-1 text-sm text-gray-700">{n.payroll_content}</p>
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
                      className="w-full rounded border border-gray-300 p-2 text-sm outline-none focus:border-blue-500"
                      rows={3}
                      placeholder="Nhập nội dung trả lời..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          respondPayrollFeedback(n.payroll_feedback_id, "reply");
                        }}
                        className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                      >
                        Trả lời
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          respondPayrollFeedback(n.payroll_feedback_id, "reject");
                        }}
                        className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                      >
                        Từ chối
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    {n.payroll_status === "REJECTED" ? "Đã từ chối" : "Đã trả lời"}:{" "}
                    {n.payroll_reply || "-"}
                  </p>
                )}
              </div>
            )}

            {n.type === "PAYROLL_FEEDBACK_RESPONSE" && (
              <div className="mt-2 rounded border border-green-100 bg-white p-3 text-sm text-gray-700">
                <p className="font-semibold">{n.payroll_subject}</p>
                <p>{n.payroll_reply || n.message}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
