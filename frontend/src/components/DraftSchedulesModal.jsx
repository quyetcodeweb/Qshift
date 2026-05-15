import { useState, useEffect } from "react";
import {
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Button,
  Typography,
  Card,
  Chip,
  IconButton,
  Tooltip,
} from "@material-tailwind/react";
import axios from "axios";
import { API_URL } from "../services/api";

export default function DraftSchedulesModal({ open, onClose }) {
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [draftDetails, setDraftDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchDrafts();
    }
  }, [open]);

  const fetchDrafts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${API_URL}/schedules/drafts/list`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setDrafts(res.data);
      setSelectedDraft(null);
      setDraftDetails(null);
    } catch (err) {
      console.error("Error fetching drafts:", err);
      alert("❌ Lỗi tải bản nháp: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDraft = async (draft) => {
    try {
      setDetailLoading(true);
      setSelectedDraft(draft);

      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${API_URL}/schedules/drafts/${draft.draft_id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setDraftDetails(res.data);
    } catch (err) {
      console.error("Error fetching draft details:", err);
      alert("❌ Lỗi tải chi tiết bản nháp: " + err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDeleteDraft = async (draftId) => {
    if (!window.confirm("Xóa bản nháp này?")) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API_URL}/schedules/drafts/${draftId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      alert("✅ Đã xóa bản nháp");
      fetchDrafts();
      setSelectedDraft(null);
      setDraftDetails(null);
    } catch (err) {
      console.error("Error deleting draft:", err);
      alert("❌ Lỗi xóa bản nháp: " + err.message);
    }
  };

  const handlePublishDraft = async () => {
    if (!selectedDraft || !draftDetails?.items?.length) return;
    if (!window.confirm("Công bố bản nháp này?")) return;

    try {
      setDetailLoading(true);
      const token = localStorage.getItem("token");
      const shifts = draftDetails.items.map((item) => ({
        employee_id: item.employee_id,
        shift_id: item.shift_id,
        work_date: item.work_date,
        role_id: item.role_id || null,
        status: "PUBLISHED",
      }));

      await axios.post(
        `${API_URL}/schedules/publish`,
        {
          month: selectedDraft.month,
          year: selectedDraft.year,
          shifts,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      alert("Đã công bố bản nháp");
      fetchDrafts();
      setSelectedDraft(null);
      setDraftDetails(null);
    } catch (err) {
      console.error("Error publishing draft:", err);
      alert("Lỗi công bố: " + (err.response?.data?.message || err.message));
    } finally {
      setDetailLoading(false);
    }
  };

  const getDraftRows = () => {
    if (!draftDetails?.items) return [];

    return [...draftDetails.items]
      .sort((a, b) => {
        const dateCompare = String(a.work_date).localeCompare(String(b.work_date));
        if (dateCompare !== 0) return dateCompare;
        return String(a.shift_name || "").localeCompare(String(b.shift_name || ""));
      })
      .map((item) => ({
        date: new Date(item.work_date).toLocaleDateString("vi-VN"),
        shift: item.shift_name,
        employee: item.employee_name,
        role: item.role_name || "-",
      }));
  };

  return (
    <Dialog open={open} handler={onClose} size="xxl" className="max-h-[90vh]">
      <DialogHeader className="flex justify-between items-center">
        <span>📋 Bản Nháp Lịch</span>
        <button onClick={onClose} className="text-gray-500">
          ✕
        </button>
      </DialogHeader>

      <DialogBody className="max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Drafts List */}
          <div className="lg:col-span-1">
            <Typography variant="h6" className="mb-4 font-semibold">
              📝 Danh Sách Bản Nháp ({drafts.length})
            </Typography>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-12 bg-gray-200 animate-pulse rounded"
                  ></div>
                ))}
              </div>
            ) : drafts.length === 0 ? (
              <Typography className="text-gray-500 text-center py-8">
                Chưa có bản nháp nào
              </Typography>
            ) : (
              <div className="space-y-2">
                {drafts.map((draft) => (
                  <Card
                    key={draft.draft_id}
                    className={`p-4 cursor-pointer border-2 transition ${
                      selectedDraft?.draft_id === draft.draft_id
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-blue-400"
                    }`}
                    onClick={() => handleSelectDraft(draft)}
                  >
                    <Typography className="font-semibold text-sm">
                      {draft.name}
                    </Typography>
                    <Typography className="text-xs text-gray-600">
                      {draft.month}/{draft.year}
                    </Typography>
                    <Typography className="text-xs text-gray-500 mt-1">
                      {draft.shift_count} ca
                    </Typography>
                    <Typography className="text-xs text-gray-400 mt-1">
                      {new Date(draft.created_at).toLocaleDateString("vi-VN")}
                    </Typography>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Draft Details */}
          <div className="lg:col-span-2">
            {selectedDraft ? (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <Typography variant="h5" className="font-bold">
                      {selectedDraft.name}
                    </Typography>
                    <Typography className="text-gray-600">
                      Tháng {selectedDraft.month}/{selectedDraft.year}
                    </Typography>
                  </div>
                  <Tooltip title="Xóa bản nháp">
                    <IconButton
                      onClick={() => handleDeleteDraft(selectedDraft.draft_id)}
                      className="bg-red-50 text-red-600"
                      size="sm"
                    >
                      🗑️
                    </IconButton>
                  </Tooltip>
                </div>

                <div className="mb-4 flex justify-end">
                  <Button
                    size="sm"
                    onClick={handlePublishDraft}
                    disabled={detailLoading || !draftDetails?.items?.length}
                    className="bg-green-600"
                  >
                    Cong bo ban nhap
                  </Button>
                </div>

                {detailLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-8 bg-gray-200 animate-pulse rounded"
                      ></div>
                    ))}
                  </div>
                ) : draftDetails ? (
                  <>
                    <Card className="p-4 mb-4 bg-blue-50">
                      <Typography className="text-sm font-semibold">
                        📊 Tổng: {draftDetails.items.length} ca
                      </Typography>
                    </Card>

                    <div className="space-y-2">
                      <Typography variant="h6" className="font-semibold mb-3">
                        📅 Chi Tiết Ca Làm
                      </Typography>

                      <div className="max-h-96 overflow-auto border border-gray-200 rounded bg-white">
                        <table className="w-full min-w-[620px] border-collapse text-sm">
                          <thead className="sticky top-0 bg-gray-100">
                            <tr>
                              <th className="border border-gray-200 p-2 text-left">Ngay</th>
                              <th className="border border-gray-200 p-2 text-left">Ca</th>
                              <th className="border border-gray-200 p-2 text-left">Nhan vien</th>
                              <th className="border border-gray-200 p-2 text-left">Vai tro</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getDraftRows().map((row, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="border border-gray-200 p-2 font-medium">{row.date}</td>
                                <td className="border border-gray-200 p-2">{row.shift}</td>
                                <td className="border border-gray-200 p-2">{row.employee}</td>
                                <td className="border border-gray-200 p-2">{row.role}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <div className="flex items-center justify-center h-64">
                <Typography className="text-gray-400">
                  Chọn bản nháp để xem chi tiết
                </Typography>
              </div>
            )}
          </div>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button onClick={onClose} variant="text" className="mr-3">
          Đóng
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
