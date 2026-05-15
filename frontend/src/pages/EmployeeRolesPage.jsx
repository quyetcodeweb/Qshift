import { useState, useEffect } from "react";
import {
  Card,
  Button,
  Typography,
  Select,
  Option,
  Chip,
  Input,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@material-tailwind/react";
import axios from "axios";
import { useLocation } from "react-router-dom";

export default function EmployeeRolesPage() {
  const location = useLocation();
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [employeeRoles, setEmployeeRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#3B82F6");
  const [creatingRole, setCreatingRole] = useState(false);
  const roleReminder = location.state?.message;
  const createdEmployeeId = location.state?.employeeId;

  const COLORS = [
    { name: "Xanh", value: "#3B82F6" },
    { name: "Xanh lá", value: "#10B981" },
    { name: "Vàng", value: "#F59E0B" },
    { name: "Đỏ", value: "#EF4444" },
    { name: "Tím", value: "#8B5CF6" },
    { name: "Hồng", value: "#EC4899" },
    { name: "Xanh lục", value: "#06B6D4" },
    { name: "Cam", value: "#F97316" },
  ];

  useEffect(() => {
    fetchEmployees();
    fetchRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/employees");
      setEmployees(res.data);
      if (createdEmployeeId) {
        setSelectedEmployee(String(createdEmployeeId));
      } else if (res.data.length > 0) {
        setSelectedEmployee(String(res.data[0].employee_id));
      }
    } catch (err) {
      console.error("Error fetching employees:", err);
    }
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/roles", {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("[EmployeeRolesPage] Fetched roles:", res.data);
      setRoles(res.data);
    } catch (err) {
      console.error(
        "[EmployeeRolesPage] Error fetching roles:",
        err.response?.data || err.message,
      );
      setRoles([]);
    }
  };

  useEffect(() => {
    if (selectedEmployee) {
      fetchEmployeeRoles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee]);

  const fetchEmployeeRoles = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `http://localhost:5000/api/roles/employee/${selectedEmployee}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setEmployeeRoles(res.data);
    } catch (err) {
      console.error("Error fetching employee roles:", err);
      setEmployeeRoles([]);
    }
  };

  const handleAddRole = async () => {
    if (!selectedRole) {
      alert("Vui lòng chọn vai trò");
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      await axios.post(
        `http://localhost:5000/api/roles/employee/${selectedEmployee}`,
        { role_id: Number(selectedRole) },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setSelectedRole("");
      fetchEmployeeRoles();
      alert("✅ Đã thêm vai trò");
    } catch (err) {
      console.error("Error adding role:", err);
      alert("❌ Lỗi: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRole = async (roleId) => {
    if (!window.confirm("Xóa vai trò này?")) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `http://localhost:5000/api/roles/employee/${selectedEmployee}/${roleId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      fetchEmployeeRoles();
      alert("✅ Đã xóa vai trò");
    } catch (err) {
      console.error("Error removing role:", err);
      alert("❌ Lỗi: " + (err.response?.data?.message || err.message));
    }
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) {
      alert("Vui lòng nhập tên vai trò");
      return;
    }

    try {
      setCreatingRole(true);
      const token = localStorage.getItem("token");
      const response = await axios.post(
        "http://localhost:5000/api/roles",
        {
          role_name: newRoleName.trim(),
          description: newRoleName.trim(),
          color: newRoleColor,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      alert(`✅ Đã tạo vai trò: ${response.data.role_name}`);
      setNewRoleName("");
      setNewRoleColor("#3B82F6");
      setShowCreateModal(false);
      fetchRoles();
    } catch (err) {
      console.error("Error creating role:", err);
      alert("❌ Lỗi: " + (err.response?.data?.message || err.message));
    } finally {
      setCreatingRole(false);
    }
  };

  const selectedEmployeeObj = employees.find(
    (e) => String(e.employee_id) === selectedEmployee,
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <Typography variant="h4" className="mb-6 font-bold">
        👥 Quản Lý Vai Trò Nhân Viên
      </Typography>

      {roleReminder && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          {roleReminder}
        </div>
      )}

      <div className="mb-4">
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-green-600"
        >
          ➕ Tạo Vai Trò Mới
        </Button>
      </div>

      {/* Danh Sách Tất Cả Vai Trò */}
      <div className="mb-6">
        <Card className="p-6 bg-white shadow-sm">
          <Typography variant="h6" className="mb-4 font-semibold">
            📚 Danh Sách Tất Cả Vai Trò ({roles.length})
          </Typography>

          {roles.length === 0 ? (
            <Typography className="text-gray-500 text-center py-4">
              Chưa có vai trò nào. Hãy tạo vai trò mới!
            </Typography>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {roles.map((role) => (
                <div key={role.role_id} className="flex items-center gap-2">
                  <Chip
                    value={role.role_name}
                    style={{ backgroundColor: role.color || "#3B82F6" }}
                    className="text-white font-semibold flex-1"
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Employee Selection */}
        <div className="lg:col-span-1">
          <Card className="p-6 bg-white shadow-sm">
            <Typography variant="h6" className="mb-4 font-semibold">
              📋 Chọn Nhân Viên
            </Typography>

            <div style={{ minWidth: "100%" }}>
              <Select
                label="Nhân viên"
                value={selectedEmployee}
                onChange={(v) => setSelectedEmployee(v)}
              >
                {employees.map((emp) => (
                  <Option key={emp.employee_id} value={String(emp.employee_id)}>
                    {emp.name}
                  </Option>
                ))}
              </Select>
            </div>

            {selectedEmployeeObj && (
              <div className="mt-6 p-4 bg-blue-50 rounded border border-blue-200">
                <Typography className="text-sm font-semibold text-blue-700">
                  {selectedEmployeeObj.name}
                </Typography>
                <Typography className="text-xs text-blue-600 mt-1">
                  {selectedEmployeeObj.email}
                </Typography>
              </div>
            )}
          </Card>
        </div>

        {/* Right Panel - Role Management */}
        <div className="lg:col-span-2">
          <Card className="p-6 bg-white shadow-sm mb-6">
            <Typography variant="h6" className="mb-4 font-semibold">
              ➕ Thêm Vai Trò
            </Typography>

            {roles.length === 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded">
                <Typography className="text-red-700 text-sm font-semibold">
                  ⚠️ Không tải được danh sách vai trò. Vui lòng tải lại trang
                  hoặc kiểm tra kết nối.
                </Typography>
              </div>
            )}

            <div className="flex gap-4 mb-4">
              <div style={{ minWidth: "250px", flex: 1 }}>
                <Select
                  label="Chọn vai trò"
                  value={selectedRole}
                  onChange={(v) => setSelectedRole(v)}
                  disabled={roles.length === 0}
                >
                  {roles
                    .filter(
                      (r) =>
                        !employeeRoles.find((er) => er.role_id === r.role_id),
                    )
                    .map((role) => (
                      <Option key={role.role_id} value={String(role.role_id)}>
                        {role.role_name}
                      </Option>
                    ))}
                </Select>
              </div>

              <Button
                onClick={handleAddRole}
                disabled={loading || !selectedRole || roles.length === 0}
                className="bg-blue-600 mt-1"
              >
                {loading ? "⏳ Đang thêm..." : "✨ Thêm"}
              </Button>
            </div>
          </Card>

          <Card className="p-6 bg-white shadow-sm">
            <Typography variant="h6" className="mb-4 font-semibold">
              🏷️ Vai Trò Hiện Tại
            </Typography>

            {employeeRoles.length === 0 ? (
              <Typography className="text-gray-500 text-center py-4">
                Chưa có vai trò nào
              </Typography>
            ) : (
              <div className="flex flex-wrap gap-3">
                {employeeRoles.map((role) => (
                  <Chip
                    key={role.role_id}
                    value={role.role_name}
                    onClose={() => handleRemoveRole(role.role_id)}
                    style={{ backgroundColor: role.color || "#3B82F6" }}
                    className="text-white font-semibold"
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal Tạo Vai Trò Mới */}
      <Dialog open={showCreateModal} handler={() => setShowCreateModal(false)}>
        <DialogHeader className="flex justify-between items-center">
          <span>➕ Tạo Vai Trò Mới</span>
          <button
            onClick={() => setShowCreateModal(false)}
            className="text-gray-500"
          >
            ✕
          </button>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Input
            type="text"
            label="Tên vai trò"
            placeholder="vd: Quản lý ca, Kế toán, ..."
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
          />

          <div>
            <Typography className="text-sm font-semibold mb-3">
              Chọn Màu Thẻ
            </Typography>
            <div className="grid grid-cols-4 gap-3">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setNewRoleColor(color.value)}
                  className={`w-full h-12 rounded-lg border-2 transition ${
                    newRoleColor === color.value
                      ? "border-gray-800"
                      : "border-gray-300"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                >
                  {newRoleColor === color.value && (
                    <span className="text-white font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <Card className="p-3 bg-gray-50">
            <Typography className="text-xs font-semibold">
              Xem Trước:
            </Typography>
            <Chip
              value={newRoleName || "Vai trò"}
              style={{ backgroundColor: newRoleColor }}
              className="text-white font-semibold mt-2"
            />
          </Card>
        </DialogBody>

        <DialogFooter className="space-x-3">
          <Button variant="text" onClick={() => setShowCreateModal(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleCreateRole}
            disabled={creatingRole || !newRoleName.trim()}
            className="bg-green-600"
          >
            {creatingRole ? "⏳ Đang tạo..." : "✨ Tạo Vai Trò"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
