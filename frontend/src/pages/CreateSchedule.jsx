import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Input,
  Select,
  Option,
  Card,
  Typography,
} from "@material-tailwind/react";
import axios from "axios";
import ScheduleListTable from "../components/ScheduleListTable";
import AddShiftModal from "../components/AddShiftModal";
import EditShiftModal from "../components/EditShiftModal";
import ScheduleSettingsModal from "../components/ScheduleSettingsModal";
import AutoScheduleModal from "../components/AutoScheduleModal";
import { API_URL } from "../services/api";

export default function CreateSchedule() {
  const [schedules, setSchedules] = useState([]);
  const [filteredSchedules, setFilteredSchedules] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState([]);

  // Modal states
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [openSettingsModal, setOpenSettingsModal] = useState(false);
  const [openAutoScheduleModal, setOpenAutoScheduleModal] = useState(false);

  // Edit state
  const [editingSchedule, setEditingSchedule] = useState(null);

  // Filter states
  const [viewMonth, setViewMonth] = useState(String(new Date().getMonth() + 1));
  const [viewYear, setViewYear] = useState(String(new Date().getFullYear()));
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterShift, setFilterShift] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // Schedule settings
  const [scheduleSettings, setScheduleSettings] = useState({
    balance_scheduling: false,
    prefer_consecutive_shifts: false,
    balance_by_workday: false,
    allow_role_fallback: false,
  });

  const fetchSchedules = useCallback(
    async (month = viewMonth, year = viewYear) => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get(
          `${API_URL}/schedules/current?month=${month}&year=${year}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setSchedules(res.data);
      } catch (err) {
        console.error("Error fetching schedules:", err);
      }
    },
    [viewMonth, viewYear],
  );

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  useEffect(() => {
    fetchShifts();
    fetchEmployees();
    loadSettings();
  }, []);

  useEffect(() => {
    let filtered = [...schedules];

    if (filterEmployee) {
      filtered = filtered.filter((s) =>
        s.employee_name?.toLowerCase().includes(filterEmployee.toLowerCase()),
      );
    }

    if (filterShift) {
      filtered = filtered.filter((s) => s.shift_name === filterShift);
    }

    if (filterDate) {
      filtered = filtered.filter((s) => s.work_date === filterDate);
    }

    setFilteredSchedules(filtered);
  }, [schedules, filterEmployee, filterShift, filterDate]);

  useEffect(() => {
    const visibleIds = new Set(filteredSchedules.map((s) => s.schedule_id));
    setSelectedScheduleIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [filteredSchedules]);

  const fetchShifts = async () => {
    try {
      const res = await axios.get(`${API_URL}/shifts`);
      setShifts(res.data);
    } catch (err) {
      console.error("Error fetching shifts:", err);
    }
  };

  const fetchEmployees = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_URL}/employees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployees(res.data);
    } catch (err) {
      console.error("Error fetching employees:", err);
    }
  };

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${API_URL}/schedules/settings`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.data) {
        setScheduleSettings(res.data);
      }
    } catch {
      console.log("No settings found, using defaults");
    }
  };

  const handleAddShift = async (data) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_URL}/schedules`,
        {
          ...data,
          status: "PUBLISHED",
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setOpenAddModal(false);
      const [year, month] = data.work_date.split("-");
      setViewMonth(String(Number(month)));
      setViewYear(year);
      fetchSchedules(String(Number(month)), year);
    } catch (err) {
      alert("Lỗi thêm ca: " + (err.response?.data?.message || err.message));
    }
  };

  const handleEditShift = async (id, data) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API_URL}/schedules/${id}`, data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOpenEditModal(false);
      setEditingSchedule(null);
      const [year, month] = data.work_date.split("-");
      setViewMonth(String(Number(month)));
      setViewYear(year);
      fetchSchedules(String(Number(month)), year);
    } catch (err) {
      alert("Lỗi cập nhật ca: " + (err.response?.data?.message || err.message));
    }
  };

  const handleDeleteShift = async (id) => {
    if (confirm("Bạn chắc chắn muốn xóa ca này?")) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API_URL}/schedules/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSelectedScheduleIds((prev) =>
          prev.filter((scheduleId) => scheduleId !== id),
        );
        fetchSchedules();
      } catch (err) {
        alert("Lỗi xóa ca: " + (err.response?.data?.message || err.message));
      }
    }
  };

  const handleToggleSchedule = (id) => {
    setSelectedScheduleIds((prev) =>
      prev.includes(id)
        ? prev.filter((scheduleId) => scheduleId !== id)
        : [...prev, id],
    );
  };

  const handleToggleAllSchedules = () => {
    const visibleIds = filteredSchedules.map((schedule) => schedule.schedule_id);
    const selectedVisibleIds = selectedScheduleIds.filter((id) =>
      visibleIds.includes(id),
    );

    if (selectedVisibleIds.length === visibleIds.length) {
      setSelectedScheduleIds((prev) =>
        prev.filter((id) => !visibleIds.includes(id)),
      );
      return;
    }

    setSelectedScheduleIds((prev) =>
      Array.from(new Set([...prev, ...visibleIds])),
    );
  };

  const handleDeleteSelectedSchedules = async () => {
    if (selectedScheduleIds.length === 0) return;

    if (
      !confirm(
        `Ban chac chan muon xoa ${selectedScheduleIds.length} ca da chon?`,
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      await Promise.all(
        selectedScheduleIds.map((id) =>
          axios.delete(`${API_URL}/schedules/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ),
      );
      setSelectedScheduleIds([]);
      fetchSchedules();
    } catch (err) {
      alert("Loi xoa ca: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (settings) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_URL}/schedules/settings`,
        settings,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setScheduleSettings(settings);
      setOpenSettingsModal(false);
      alert("✓ Cài đặt đã được lưu");
    } catch (err) {
      alert("Lỗi lưu cài đặt: " + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow">
        <h1 className="text-2xl font-bold">📋 Tạo Lịch Làm</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => setOpenSettingsModal(true)}
            className="bg-gray-600 flex items-center gap-2"
          >
            ⚙️ Cài đặt
          </Button>
          <Button
            onClick={() => setOpenAutoScheduleModal(true)}
            className="bg-indigo-600 flex items-center gap-2"
          >
            🤖 Tự động xếp
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 bg-white rounded-xl shadow">
        <Typography variant="h6" className="mb-4">
          🔍 Lọc thông tin
        </Typography>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <Select
            value={viewMonth}
            label="Tháng hiển thị"
            onChange={(value) => setViewMonth(value || "all")}
          >
            <Option value="all">Tất cả tháng</Option>
            {[...Array(12)].map((_, index) => (
              <Option key={index + 1} value={String(index + 1)}>
                Tháng {index + 1}
              </Option>
            ))}
          </Select>
          <Select
            value={viewYear}
            label="Năm hiển thị"
            onChange={(value) => setViewYear(value || "all")}
          >
            <Option value="all">Tất cả năm</Option>
            {[2024, 2025, 2026, 2027, 2028].map((year) => (
              <Option key={year} value={String(year)}>
                {year}
              </Option>
            ))}
          </Select>
          <Input
            label="Tên nhân viên"
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
            placeholder="Lọc theo tên..."
          />
          <Select
            value={filterShift}
            label="Ca làm"
            onChange={(value) => setFilterShift(value)}
          >
            <Option value="">Tất cả ca</Option>
            {shifts.map((shift) => (
              <Option key={shift.shift_id} value={shift.shift_name}>
                {shift.shift_name}
              </Option>
            ))}
          </Select>
          <Input
            type="date"
            label="Ngày làm"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>
      </Card>

      {/* Add Button */}
      <div className="flex flex-wrap justify-end gap-2">
        {selectedScheduleIds.length > 0 && (
          <Button
            onClick={handleDeleteSelectedSchedules}
            disabled={loading}
            className="bg-red-600 flex items-center gap-2"
          >
            Xoa {selectedScheduleIds.length} ca da chon
          </Button>
        )}
        <Button
          onClick={() => setOpenAddModal(true)}
          className="bg-green-600 flex items-center gap-2"
        >
          ➕ Thêm ca làm
        </Button>
      </div>

      {/* Schedule List */}
      <ScheduleListTable
        schedules={filteredSchedules}
        shifts={shifts}
        employees={employees}
        onEdit={(schedule) => {
          setEditingSchedule(schedule);
          setOpenEditModal(true);
        }}
        onDelete={handleDeleteShift}
        selectedScheduleIds={selectedScheduleIds}
        onToggleSchedule={handleToggleSchedule}
        onToggleAllSchedules={handleToggleAllSchedules}
      />

      {/* Modals */}
      <AddShiftModal
        open={openAddModal}
        onClose={() => setOpenAddModal(false)}
        onAdd={handleAddShift}
        employees={employees}
        shifts={shifts}
      />

      {editingSchedule && (
        <EditShiftModal
          open={openEditModal}
          onClose={() => {
            setOpenEditModal(false);
            setEditingSchedule(null);
          }}
          onEdit={handleEditShift}
          schedule={editingSchedule}
          employees={employees}
          shifts={shifts}
        />
      )}

      <ScheduleSettingsModal
        open={openSettingsModal}
        onClose={() => setOpenSettingsModal(false)}
        onSave={handleSaveSettings}
        initialSettings={scheduleSettings}
      />

      <AutoScheduleModal
        open={openAutoScheduleModal}
        onClose={() => setOpenAutoScheduleModal(false)}
        scheduleSettings={scheduleSettings}
        onGenerate={(result) => {
          if (result?.month && result?.year) {
            setViewMonth(String(result.month));
            setViewYear(String(result.year));
            fetchSchedules(String(result.month), String(result.year));
          } else {
            fetchSchedules();
          }
          setOpenAutoScheduleModal(false);
        }}
      />
    </div>
  );
}
