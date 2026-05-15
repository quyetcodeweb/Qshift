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
import axios from "axios";

export default function EmployeePage() {
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});

  const fetchEmployees = async () => {
    const res = await axios.get("http://localhost:5000/api/employees");
    setEmployees(res.data);
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleCreate = async () => {
    await axios.post("http://localhost:5000/api/employees", form);
    setOpen(false);
    setForm({});
    fetchEmployees();
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <Card className="p-6 shadow-lg rounded-2xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <Typography variant="h4" className="font-bold text-gray-800">
            Quản lý nhân viên
          </Typography>

          <Button
            onClick={() => setOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            + Thêm nhân viên
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="p-3">Tên</th>
                <th className="p-3">Email</th>
                <th className="p-3">SĐT</th>
                <th className="p-3">Lương / giờ</th>
                <th className="p-3">Ngày vào làm</th>
              </tr>
            </thead>

            <tbody>
              {employees.map((e) => (
                <tr
                  key={e.employee_id}
                  className="border-b hover:bg-gray-50 transition"
                >
                  <td className="p-3 font-medium text-gray-800">{e.name}</td>
                  <td className="p-3 text-gray-600">{e.email}</td>
                  <td className="p-3">{e.phone}</td>
                  <td className="p-3 text-green-600 font-semibold">
                    {Number(e.hourly_rate).toLocaleString()} đ
                  </td>
                  <td className="p-3 text-gray-500">
                    {e.hire_date
                      ? new Date(e.hire_date).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal */}
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

            <Input
              label="Trạng thái"
              value={form.status || ""}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            />

            <Button
              onClick={handleCreate}
              fullWidth
              className="bg-green-600 hover:bg-green-700 rounded-lg"
            >
              Lưu nhân viên
            </Button>
          </DialogBody>
        </Dialog>
      </Card>
    </div>
  );
}
