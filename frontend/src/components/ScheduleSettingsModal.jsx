import {
  Dialog,
  DialogBody,
  DialogFooter,
  Button,
  DialogHeader,
  Switch,
  Card,
  Typography,
} from "@material-tailwind/react";
import { useState, useEffect } from "react";

export default function ScheduleSettingsModal({
  open,
  onClose,
  onSave,
  initialSettings,
}) {
  const [settings, setSettings] = useState({
    balance_scheduling: false,
    prefer_consecutive_shifts: false,
    balance_by_workday: false,
    allow_role_fallback: false,
  });

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings, open]);

  const handleToggle = (key) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSubmit = () => {
    onSave(settings);
  };

  return (
    <Dialog open={open} handler={onClose} size="lg">
      <DialogHeader>⚙️ Cài Đặt Xếp Lịch</DialogHeader>
      <DialogBody className="space-y-6 max-h-96 overflow-y-auto">
        {/* Default Algorithm */}
        <Card className="p-4 bg-blue-50 border border-blue-200">
          <Typography variant="h6" className="mb-2 font-bold">
            🔧 Thuật toán mặc định
          </Typography>
          <Typography className="text-sm text-gray-700 leading-relaxed">
            Khi xếp ca, hệ thống sẽ xét từng nhân viên để kiểm tra:
          </Typography>
          <ul className="text-sm text-gray-700 mt-2 ml-4 space-y-1 list-disc">
            <li>Nhân viên có sẵn sàng làm việc vào ngày/ca đó không?</li>
            <li>Ca đó còn cần nhân viên không?</li>
            <li>Nếu thỏa mãn cả hai điều kiện, nhân viên sẽ được xếp.</li>
          </ul>
        </Card>

        {/* Balance Scheduling */}
        <Card className="p-4 bg-yellow-50 border border-yellow-200">
          <div className="flex items-start justify-between mb-2">
            <Typography variant="h6" className="font-bold">
              ⚖️ Xếp Lịch Cân Bằng
            </Typography>
            <Switch
              checked={settings.balance_scheduling}
              onChange={() => handleToggle("balance_scheduling")}
            />
          </div>
          <Typography className="text-sm text-gray-700 leading-relaxed">
            Khi bật, hệ thống sẽ phân bổ công việc đều đặn cho tất cả nhân viên:
          </Typography>
          <ul className="text-sm text-gray-700 mt-2 ml-4 space-y-1 list-disc">
            <li>
              Mỗi nhân viên có một "giá trị cân bằng" (tăng 1 sau mỗi lần được
              xếp).
            </li>
            <li>Ưu tiên xếp nhân viên có giá trị cân bằng thấp nhất trước.</li>
            <li>
              Nếu nhiều nhân viên có cùng giá trị, chọn những người đầu tiên.
            </li>
          </ul>
        </Card>

        {/* Balance Workdays */}
        <Card className="p-4 bg-cyan-50 border border-cyan-200">
          <div className="flex items-start justify-between mb-2">
            <Typography variant="h6" className="font-bold">
              Can Bang Theo Ngay Lam
            </Typography>
            <Switch
              checked={settings.balance_by_workday}
              onChange={() => handleToggle("balance_by_workday")}
            />
          </div>
          <Typography className="text-sm text-gray-700 leading-relaxed">
            Khi bat, he thong uu tien chia deu so ngay lam trong lan xep lich.
          </Typography>
          <ul className="text-sm text-gray-700 mt-2 ml-4 space-y-1 list-disc">
            <li>Phu hop khi bat uu tien lien ca de gom sang, trua, toi cho cung mot nhan vien.</li>
            <li>Vi du: ngay 1 uu tien nv1, ngay 2 uu tien nv2 thay vi chia xen ke tung ca.</li>
            <li>Neu so ngay lam bang nhau, he thong moi xet tiep so ca va cac rang buoc khac.</li>
          </ul>
        </Card>

        {/* Role Fallback */}
        <Card className="p-4 bg-orange-50 border border-orange-200">
          <div className="flex items-start justify-between mb-2">
            <Typography variant="h6" className="font-bold">
              Bu Vai Tro Thieu
            </Typography>
            <Switch
              checked={settings.allow_role_fallback}
              onChange={() => handleToggle("allow_role_fallback")}
            />
          </div>
          <Typography className="text-sm text-gray-700 leading-relaxed">
            Khi bat, neu ca thieu nhan vien co vai tro bat buoc, he thong co the dung nhan vien dang ranh khac de bu cho du so luong.
          </Typography>
          <ul className="text-sm text-gray-700 mt-2 ml-4 space-y-1 list-disc">
            <li>Mac dinh tat: neu can 1 thu ngan va 1 chay ban ma chi co thu ngan, chi xep 1 thu ngan.</li>
            <li>Khi bat: slot chay ban bi thieu co the duoc bu bang nhan vien khac dang ranh.</li>
            <li>Thong ke van ghi nhan so vai tro con thieu de admin biet lich co bu tam.</li>
          </ul>
        </Card>

        {/* Prefer Consecutive Shifts */}
        <Card className="p-4 bg-green-50 border border-green-200">
          <div className="flex items-start justify-between mb-2">
            <Typography variant="h6" className="font-bold">
              🔗 Ưu Tiên Liên Ca
            </Typography>
            <Switch
              checked={settings.prefer_consecutive_shifts}
              onChange={() => handleToggle("prefer_consecutive_shifts")}
            />
          </div>
          <Typography className="text-sm text-gray-700 leading-relaxed">
            Khi bật, hệ thống sẽ tránh "cắt ca" cho nhân viên:
          </Typography>
          <ul className="text-sm text-gray-700 mt-2 ml-4 space-y-1 list-disc">
            <li>
              Ví dụ: Không xếp "Sáng - Nghỉ - Tối" mà ưu tiên "Sáng - Trưa -
              Tối".
            </li>
            <li>
              Kiểm tra ca tiếp theo của nhân viên để đảm bảo tính liên tục.
            </li>
            <li>
              Nếu buộc phải cắt ca do thiếu nhân viên, ưu tiên cắt ca nhất là
              cắt.
            </li>
          </ul>
        </Card>

        {/* Summary */}
        <Card className="p-4 bg-purple-50 border border-purple-200">
          <Typography variant="h6" className="font-bold mb-2">
            📋 Tóm Tắt Cài Đặt Hiện Tại
          </Typography>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Xếp lịch cân bằng:</span>
              <span className="font-semibold">
                {settings.balance_scheduling ? "✅ BẬT" : "❌ TẮT"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Ưu tiên liên ca:</span>
              <span className="font-semibold">
                {settings.prefer_consecutive_shifts ? "✅ BẬT" : "❌ TẮT"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Can bang theo ngay lam:</span>
              <span className="font-semibold">
                {settings.balance_by_workday ? "BAT" : "TAT"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Bu vai tro thieu:</span>
              <span className="font-semibold">
                {settings.allow_role_fallback ? "BAT" : "TAT"}
              </span>
            </div>
          </div>
        </Card>
      </DialogBody>
      <DialogFooter>
        <Button variant="text" color="red" onClick={onClose} className="mr-1">
          Đóng
        </Button>
        <Button color="green" onClick={handleSubmit}>
          Lưu Cài Đặt
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
