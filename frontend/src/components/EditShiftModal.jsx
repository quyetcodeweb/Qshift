import {
  Dialog,
  DialogBody,
  DialogFooter,
  Button,
  Select,
  Option,
  Input,
  DialogHeader,
} from "@material-tailwind/react";
import { useState, useEffect } from "react";

export default function EditShiftModal({
  open,
  onClose,
  onEdit,
  schedule,
  employees,
  shifts,
}) {
  const [formData, setFormData] = useState({
    employee_id: "",
    shift_id: "",
    work_date: "",
  });

  useEffect(() => {
    if (schedule) {
      setFormData({
        employee_id: schedule.employee_id?.toString() || "",
        shift_id: schedule.shift_id?.toString() || "",
        work_date: schedule.work_date || "",
      });
    }
  }, [schedule, open]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = () => {
    if (!formData.employee_id || !formData.shift_id || !formData.work_date) {
      alert("Vui lòng điền đủ thông tin");
      return;
    }

    onEdit(schedule.schedule_id, {
      employee_id: parseInt(formData.employee_id),
      shift_id: parseInt(formData.shift_id),
      work_date: formData.work_date,
    });
  };

  return (
    <Dialog open={open} handler={onClose} size="sm">
      <DialogHeader>✏️ Sửa Ca Làm</DialogHeader>
      <DialogBody className="space-y-4">
        <Select
          label="Chọn nhân viên"
          value={formData.employee_id}
          onChange={(value) => handleChange("employee_id", value)}
        >
          {employees.map((emp) => (
            <Option key={emp.employee_id} value={emp.employee_id.toString()}>
              {emp.name}
            </Option>
          ))}
        </Select>

        <Select
          label="Chọn ca làm"
          value={formData.shift_id}
          onChange={(value) => handleChange("shift_id", value)}
        >
          {shifts.map((shift) => (
            <Option key={shift.shift_id} value={shift.shift_id.toString()}>
              {shift.shift_name} ({shift.start_time} - {shift.end_time})
            </Option>
          ))}
        </Select>

        <Input
          type="date"
          label="Ngày làm"
          value={formData.work_date}
          onChange={(e) => handleChange("work_date", e.target.value)}
        />
      </DialogBody>
      <DialogFooter className="gap-2">
        <Button
          variant="text"
          onClick={onClose}
          className="rounded-md bg-red-400 normal-case text-white"
        >
          Hủy
        </Button>
        <Button
          onClick={handleSubmit}
          className="rounded-md bg-light-green-400 normal-case text-white"
        >
          Cập nhật
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
