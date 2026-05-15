import {
  Card,
  Button,
  Typography,
  Dialog,
  DialogHeader,
  DialogBody,
  Input,
  Select,
  Option,
} from "@material-tailwind/react";
import { useEffect, useState } from "react";
import axios from "axios";

export default function UserPage() {
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);

  const fetchUsers = async () => {
    const res = await axios.get("http://localhost:5000/api/users");
    setUsers(res.data);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (id) => {
    await axios.delete(`http://localhost:5000/api/users/${id}`);
    fetchUsers();
  };

  const toggleStatus = async (user) => {
    await axios.patch(
      `http://localhost:5000/api/users/${user.user_id}/status`,
      {
        status: !user.status,
      },
    );
    fetchUsers();
  };

  const openEdit = (user) => {
    setSelectedUser(user);
    setForm({
      username: user.username,
      password: "",
      role: user.role,
      status: user.status,
    });
    setOpen(true);
  };

  const handleUpdate = async () => {
    await axios.put(
      `http://localhost:5000/api/users/${selectedUser.user_id}`,
      form,
    );
    setOpen(false);
    fetchUsers();
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <Card className="p-6 shadow-lg rounded-2xl">
        {/* Header */}
        <Typography variant="h4" className="mb-6 font-bold text-gray-800">
          Quản lý tài khoản
        </Typography>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="p-3">Username</th>
                <th className="p-3">Role</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Hành động</th>
              </tr>
            </thead>

            <tbody>
              {users.map((u) => (
                <tr
                  key={u.user_id}
                  className="border-b hover:bg-gray-50 transition"
                >
                  <td className="p-3 font-medium">{u.username}</td>
                  <td className="p-3">{u.role}</td>

                  <td className="p-3">
                    <span
                      className={`px-3 py-1 rounded-full text-sm ${
                        u.status
                          ? "bg-green-100 text-green-600"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {u.status ? "Active" : "Disabled"}
                    </span>
                  </td>

                  <td className="p-3 space-x-2">
                    <Button
                      size="sm"
                      className="bg-blue-500"
                      onClick={() => openEdit(u)}
                    >
                      Sửa
                    </Button>

                    <Button
                      size="sm"
                      className="bg-yellow-500"
                      onClick={() => toggleStatus(u)}
                    >
                      Toggle
                    </Button>

                    <Button
                      size="sm"
                      className="bg-red-500"
                      onClick={() => handleDelete(u.user_id)}
                    >
                      Xóa
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal Edit */}
        <Dialog open={open} handler={() => setOpen(false)} size="sm">
          <DialogHeader>Chỉnh sửa tài khoản</DialogHeader>

          <DialogBody className="space-y-4">
            <Input
              label="Username"
              value={form.username || ""}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />

            <Input
              label="Password (để trống nếu không đổi)"
              value={form.password || ""}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />

            <Select
              label="Role"
              value={form.role}
              onChange={(val) => setForm({ ...form, role: val })}
            >
              <Option value="ADMIN">ADMIN</Option>
              <Option value="EMPLOYEE">EMPLOYEE</Option>
            </Select>

            <Select
              label="Status"
              value={form.status ? "true" : "false"}
              onChange={(val) => setForm({ ...form, status: val === "true" })}
            >
              <Option value="true">Active</Option>
              <Option value="false">Disabled</Option>
            </Select>

            <Button onClick={handleUpdate} fullWidth className="bg-green-600">
              Lưu thay đổi
            </Button>
          </DialogBody>
        </Dialog>
      </Card>
    </div>
  );
}
