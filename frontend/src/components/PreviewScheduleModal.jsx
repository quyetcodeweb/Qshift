import { useState } from "react";
import {
  Dialog,
  Card,
  Button,
  Typography,
  Checkbox,
  Alert,
} from "@material-tailwind/react";
import axios from "axios";
import { API_URL } from "../services/api";

export default function PreviewScheduleModal({
  open,
  onClose,
  schedule,
  onPublish,
}) {
  const [selectedShifts, setSelectedShifts] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  if (!schedule || !schedule.generated_shifts) return null;

  const toggleShift = (idx) => {
    const updated = new Set(selectedShifts);
    if (updated.has(idx)) {
      updated.delete(idx);
    } else {
      updated.add(idx);
    }
    setSelectedShifts(updated);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const shiftsToSave = schedule.generated_shifts.map((shift, idx) => ({
        ...shift,
        status: "DRAFT",
      }));

      const res = await axios.post(
        `${API_URL}/schedules/save-draft`,
        {
          month: schedule.month,
          year: schedule.year,
          shifts: shiftsToSave,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      onPublish(res.data);
    } catch (err) {
      console.error("Error saving draft:", err);
      alert(
        "Lỗi lưu bản nháp: " + (err.response?.data?.message || err.message),
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!confirm("Công bố lịch này cho tất cả nhân viên?")) return;

    console.log(
      "[handlePublish] Publishing",
      schedule.generated_shifts.length,
      "shifts",
    );
    console.log(
      "[handlePublish] Month:",
      schedule.month,
      "Year:",
      schedule.year,
    );
    console.log(
      "[handlePublish] First 3 shifts:",
      JSON.stringify(schedule.generated_shifts.slice(0, 3), null, 2),
    );

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const shiftsToPublish = schedule.generated_shifts.map((shift) => ({
        ...shift,
        status: "PUBLISHED",
      }));

      console.log("[handlePublish] Sending to API...");
      const res = await axios.post(
        `${API_URL}/schedules/publish`,
        {
          month: schedule.month,
          year: schedule.year,
          shifts: shiftsToPublish,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      console.log("[handlePublish] Response:", res.data);
      onPublish(res.data);
    } catch (err) {
      console.error("Error publishing:", err);
      alert("Lỗi công bố: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Group by employee
  const byEmployee = {};
  schedule.generated_shifts.forEach((shift) => {
    if (!byEmployee[shift.employee_id]) {
      byEmployee[shift.employee_id] = {
        name: shift.employee_name,
        shifts: [],
      };
    }
    byEmployee[shift.employee_id].shifts.push(shift);
  });

  // Summary stats
  const totalShifts = schedule.generated_shifts.length;
  const uniqueEmployees = Object.keys(byEmployee).length;
  const avgShiftsPerEmployee = (totalShifts / uniqueEmployees).toFixed(1);

  return (
    <Dialog open={open} handler={onClose} size="xl">
      <Card className="p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <Typography variant="h5">
            ✅ Preview - Tháng {schedule.month}/{schedule.year}
          </Typography>
          <button onClick={onClose} className="text-gray-500 text-xl">
            ×
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="p-3 bg-blue-50">
            <Typography className="text-xs text-gray-600">Tổng ca</Typography>
            <Typography className="text-2xl font-bold">
              {totalShifts}
            </Typography>
          </Card>
          <Card className="p-3 bg-green-50">
            <Typography className="text-xs text-gray-600">Nhân viên</Typography>
            <Typography className="text-2xl font-bold">
              {uniqueEmployees}
            </Typography>
          </Card>
          <Card className="p-3 bg-purple-50">
            <Typography className="text-xs text-gray-600">
              Trung bình/người
            </Typography>
            <Typography className="text-2xl font-bold">
              {avgShiftsPerEmployee}
            </Typography>
          </Card>
        </div>

        {/* Details Toggle */}
        <Button
          size="sm"
          variant="text"
          onClick={() => setShowDetails(!showDetails)}
          className="mb-3"
        >
          {showDetails ? "▼" : "▶"} Chi Tiết ({totalShifts} ca)
        </Button>

        {/* Detailed List */}
        {showDetails && (
          <div className="mb-4 space-y-3 max-h-96 overflow-y-auto">
            {Object.entries(byEmployee).map(([empId, empData]) => (
              <Card key={empId} className="p-3 bg-gray-50">
                <Typography className="font-semibold mb-2">
                  {empData.name} ({empData.shifts.length} ca)
                </Typography>
                <div className="space-y-1 text-sm">
                  {empData.shifts.map((shift, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between text-gray-700"
                    >
                      <span>
                        {new Date(shift.work_date).toLocaleDateString("vi-VN")}{" "}
                        - {shift.shift_name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {shift.start_time} - {shift.end_time}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Alerts */}
        <div className="space-y-2 mb-4">
          <Alert color="blue">
            💡 Kiểm tra lịch trước khi công bố. Bạn có thể sửa đổi hoặc xóa ca
            nào không hợp lý.
          </Alert>
          <Alert color="yellow">
            ⚠️ Lưu bản nháp để chỉnh sửa sau, hoặc công bố ngay để gửi cho nhân
            viên.
          </Alert>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <Button variant="outlined" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="outlined"
            color="blue"
            onClick={handleSave}
            disabled={loading}
          >
            💾 Lưu Bản Nháp
          </Button>
          <Button
            onClick={handlePublish}
            disabled={loading}
            className="bg-green-600"
          >
            {loading ? "Đang xử lý..." : "✅ Công Bố Ngay"}
          </Button>
        </div>
      </Card>
    </Dialog>
  );
}
