import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../services/api";

const statusText = {
  PENDING_TARGET: "Chờ người nhận xác nhận",
  APPROVED: "Đã đổi ca",
  REJECTED_BY_TARGET: "Người nhận từ chối",
  CANCELLED_BY_ADMIN: "Admin đã hủy",
  REVERTED_BY_ADMIN: "Admin đã hoàn tác",
};

const statusClass = {
  PENDING_TARGET: "bg-yellow-50 text-yellow-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED_BY_TARGET: "bg-red-50 text-red-700",
  CANCELLED_BY_ADMIN: "bg-gray-100 text-gray-700",
  REVERTED_BY_ADMIN: "bg-purple-50 text-purple-700",
};

function shiftLabel(request, owner) {
  const prefix = owner === "requester" ? "requester" : "target";
  return `${request[`${prefix}_work_date`]} - ${request[`${prefix}_shift_name`]} (${request[`${prefix}_start_time`]?.slice(0, 5)} - ${request[`${prefix}_end_time`]?.slice(0, 5)})`;
}

export default function ShiftSwapManagementPage() {
  const [requests, setRequests] = useState([]);
  const [reasonById, setReasonById] = useState({});
  const [loadingId, setLoadingId] = useState(null);

  const fetchRequests = useCallback(async () => {
    const token = localStorage.getItem("token");
    const res = await axios.get(`${API_URL}/shift-swaps`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setRequests(res.data);
  }, []);

  useEffect(() => {
    fetchRequests().catch((err) => {
      console.error("[ShiftSwapManagement] Load error:", err);
    });
  }, [fetchRequests]);

  const submitAction = async (request, action) => {
    try {
      const reason = reasonById[request.swap_request_id] || "";
      const token = localStorage.getItem("token");

      if (action === "revert" && !reason.trim()) {
        alert("Vui lòng nhập lý do hoàn tác");
        return;
      }

      setLoadingId(request.swap_request_id);
      await axios.post(
        `${API_URL}/shift-swaps/${request.swap_request_id}/${action}`,
        { reason },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setReasonById((prev) => ({ ...prev, [request.swap_request_id]: "" }));
      fetchRequests();
      window.dispatchEvent(new Event("notification-count-changed"));
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xử lý yêu cầu đổi ca");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-4 shadow">
        <h1 className="text-2xl font-bold">Quản lý đổi ca</h1>
      </div>

      <div className="rounded-xl bg-white p-4 shadow">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="p-3">Ngày gửi</th>
                <th className="p-3">Người gửi</th>
                <th className="p-3">Người nhận</th>
                <th className="p-3">Ca gửi</th>
                <th className="p-3">Ca nhận</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Lý do / ghi chú</th>
                <th className="p-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-gray-500" colSpan={8}>
                    Chưa có request đổi ca
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.swap_request_id} className="border-b align-top">
                    <td className="p-3">{new Date(request.created_at).toLocaleString()}</td>
                    <td className="p-3 font-medium">{request.requester_employee_name}</td>
                    <td className="p-3 font-medium">{request.target_employee_name}</td>
                    <td className="p-3">{shiftLabel(request, "requester")}</td>
                    <td className="p-3">{shiftLabel(request, "target")}</td>
                    <td className="p-3">
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${statusClass[request.status] || "bg-gray-100 text-gray-700"}`}>
                        {statusText[request.status] || request.status}
                      </span>
                    </td>
                    <td className="p-3 text-gray-700">
                      {request.requester_note && <p>Ghi chú: {request.requester_note}</p>}
                      {request.admin_cancel_reason && <p>Hủy: {request.admin_cancel_reason}</p>}
                      {request.admin_revert_reason && <p>Hoàn tác: {request.admin_revert_reason}</p>}
                    </td>
                    <td className="p-3">
                      {(request.status === "PENDING_TARGET" || request.status === "APPROVED") && (
                        <div className="w-56 space-y-2">
                          <textarea
                            value={reasonById[request.swap_request_id] || ""}
                            onChange={(event) =>
                              setReasonById((prev) => ({
                                ...prev,
                                [request.swap_request_id]: event.target.value,
                              }))
                            }
                            rows={2}
                            className="w-full rounded border border-gray-300 p-2 text-sm"
                            placeholder={
                              request.status === "APPROVED"
                                ? "Lý do hoàn tác..."
                                : "Lý do hủy..."
                            }
                          />
                          {request.status === "PENDING_TARGET" && (
                            <button
                              onClick={() => submitAction(request, "cancel")}
                              disabled={loadingId === request.swap_request_id}
                              className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              Từ chối
                            </button>
                          )}
                          {request.status === "APPROVED" && (
                            <button
                              onClick={() => submitAction(request, "revert")}
                              disabled={loadingId === request.swap_request_id}
                              className="rounded bg-purple-600 px-3 py-1 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
                            >
                              Hoàn tác
                            </button>
                          )}
                        </div>
                      )}
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
