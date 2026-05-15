import {
  Card,
  Button,
  Typography,
  Dialog,
  DialogHeader,
  DialogBody,
  Input,
} from "@material-tailwind/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_URL } from "../services/api";

const defaultForm = {
  status: "Đang làm",
};

export default function EmployeePage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const fetchEmployees = async () => {
    const res = await axios.get(`${API_URL}/employees`);
    setEmployees(res.data);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEmployees();
  }, []);

  const handleCreate = async () => {
    const res = await axios.post(`${API_URL}/employees`, form);
    const employeeId = res.data?.employee?.employee_id;

    setOpen(false);
    setForm(defaultForm);
    fetchEmployees();

    alert("Đã thêm nhân viên thành công. Vui lòng thêm vai trò cho nhân viên.");
    navigate("/employeeRoles", {
      state: {
        employeeId,
        message: "Vui lòng thêm vai trò cho nhân viên mới.",
      },
    });
  };

  const openCreateModal = () => {
    setForm(defaultForm);
    setOpen(true);
  };

  const toggleEmployeeStatus = () => {
    setForm((prev) => ({
      ...prev,
      status: prev.status === "Đang làm" ? "Nghỉ" : "Đang làm",
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Card className="rounded-2xl p-6 shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <Typography variant="h4" className="font-bold text-gray-800">
            Quản lý nhân viên
          </Typography>

          <Button
            onClick={openCreateModal}
            className="rounded-lg bg-blue-600 hover:bg-blue-700"
          >
            + Thêm nhân viên
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-100 text-sm text-gray-600">
                <th className="p-3">Tên</th>
                <th className="p-3">Email</th>
                <th className="p-3">SĐT</th>
                <th className="p-3">Lương / giờ</th>
                <th className="p-3">Ngày vào làm</th>
              </tr>
            </thead>

            <tbody>
              {employees.map((employee) => (
                <tr
                  key={employee.employee_id}
                  className="border-b transition hover:bg-gray-50"
                >
                  <td className="p-3 font-medium text-gray-800">
                    {employee.name}
                  </td>
                  <td className="p-3 text-gray-600">{employee.email}</td>
                  <td className="p-3">{employee.phone}</td>
                  <td className="p-3 font-semibold text-green-600">
                    {Number(employee.hourly_rate).toLocaleString()} đ
                  </td>
                  <td className="p-3 text-gray-500">
                    {employee.hire_date
                      ? new Date(employee.hire_date).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Dialog open={open} handler={() => setOpen(false)} size="sm">
          <DialogHeader className="text-lg font-semibold">
            Thêm nhân viên
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Input
              label="Tên"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Input
              label="Email"
              value={form.email || ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />

            <Input
              label="Số điện thoại"
              value={form.phone || ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />

            <Input
              label="Lương / giờ"
              value={form.hourly_rate || ""}
              onChange={(e) =>
                setForm({ ...form, hourly_rate: e.target.value })
              }
            />

            <Input
              type="date"
              value={form.hire_date || ""}
              onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
            />

            <div className="rounded-lg border border-blue-gray-100 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <Typography className="text-sm font-medium text-gray-800">
                  Trạng thái
                </Typography>
                <Typography
                  className={`text-sm font-semibold ${
                    form.status === "Đang làm"
                      ? "text-green-700"
                      : "text-red-700"
                  }`}
                >
                  {form.status}
                </Typography>
              </div>

              <button
                type="button"
                onClick={toggleEmployeeStatus}
                className={`relative h-9 w-20 rounded-full p-1 transition ${
                  form.status === "Đang làm" ? "bg-green-500" : "bg-red-500"
                }`}
                aria-label="Đổi trạng thái nhân viên"
              >
                <span
                  className={`block h-7 w-7 rounded-full bg-white shadow transition-transform ${
                    form.status === "Đang làm"
                      ? "translate-x-11"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <Button
              onClick={handleCreate}
              fullWidth
              className="rounded-lg bg-green-600 hover:bg-green-700"
            >
              Lưu nhân viên
            </Button>
          </DialogBody>
        </Dialog>
      </Card>
    </div>
  );
}
