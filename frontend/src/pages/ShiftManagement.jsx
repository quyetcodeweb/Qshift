import { useCallback, useEffect, useState } from "react";
import api from "../services/api";

export default function ShiftManagement() {
  const [shifts, setShifts] = useState([]);
  const [form, setForm] = useState({
    shift_name: "",
    start_time: "",
    end_time: "",
    description: "",
  });

  const [editingId, setEditingId] = useState(null);

  const fetchShifts = useCallback(async () => {
    const res = await api.get("/shifts");
    setShifts(res.data);
  }, []);

  // Load data
  useEffect(() => {
    queueMicrotask(fetchShifts);
  }, [fetchShifts]);

  // Input change
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Submit
  const handleSubmit = async () => {
    if (!form.shift_name) return alert("Nhập tên ca");

    // Cho phép ca kéo dài qua nửa đêm (ví dụ: 22:00 - 02:00)
    // Chỉ báo lỗi nếu thời gian bắt đầu = thời gian kết thúc
    if (form.start_time === form.end_time) {
      return alert("Giờ bắt đầu và kết thúc không được giống nhau");
    }

    if (editingId) {
      await api.put(`/shifts/${editingId}`, form);
    } else {
      await api.post("/shifts", form);
    }

    setForm({
      shift_name: "",
      start_time: "",
      end_time: "",
      description: "",
    });

    setEditingId(null);
    fetchShifts();
  };

  // Edit
  const handleEdit = (shift) => {
    setForm(shift);
    setEditingId(shift.shift_id);
  };

  const handleDelete = async (shift) => {
    const confirmed = await window.appConfirm?.({
      title: "Xóa ca làm",
      message: `Xóa ca "${shift.shift_name}" (${shift.start_time} - ${shift.end_time})?\n\nDữ liệu liên quan sẽ bị xóa:\n- Yêu cầu ca\n- Tính sẵn có nhân viên\n- Lịch làm việc`,
      confirmText: "Xóa",
      cancelText: "Giữ lại",
      type: "warning",
    });

    if (confirmed) {
      await api.delete(`/shifts/${shift.shift_id}`);
      fetchShifts();
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Quản lý ca làm</h2>

      {/* FORM */}
      <div className="bg-white p-4 rounded-xl shadow mb-6 grid grid-cols-4 gap-4">
        <input
          name="shift_name"
          placeholder="Tên ca"
          value={form.shift_name}
          onChange={handleChange}
          className="border p-2 rounded"
        />

        <input
          type="time"
          name="start_time"
          value={form.start_time}
          onChange={handleChange}
          className="border p-2 rounded"
        />

        <input
          type="time"
          name="end_time"
          value={form.end_time}
          onChange={handleChange}
          className="border p-2 rounded"
        />

        <input
          name="description"
          placeholder="Mô tả"
          value={form.description}
          onChange={handleChange}
          className="border p-2 rounded"
        />

        <button
          onClick={handleSubmit}
          className="col-span-4 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
        >
          {editingId ? "Cập nhật ca" : "Thêm ca"}
        </button>
      </div>

      {/* LIST */}
      <div className="grid grid-cols-3 gap-4">
        {shifts.map((shift) => (
          <div
            key={shift.shift_id}
            className="bg-blue-50 p-4 rounded-xl shadow"
          >
            <h3 className="font-bold text-lg">{shift.shift_name}</h3>

            <p className="text-gray-700">
              🕒 {shift.start_time} - {shift.end_time}
            </p>

            <p className="text-sm text-gray-500">{shift.description}</p>

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleEdit(shift)}
                className="bg-yellow-400 px-3 py-1 rounded"
              >
                Sửa
              </button>

              <button
                onClick={() => handleDelete(shift)}
                className="bg-red-500 text-white px-3 py-1 rounded"
              >
                Xóa
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
