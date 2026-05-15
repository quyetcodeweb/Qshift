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
  const adminCount = users.filter((user) => user.role === "ADMIN").length;
  const isEditingLastAdmin =
    selectedUser?.role === "ADMIN" && adminCount <= 1;

  const fetchUsers = async () => {
    const res = await axios.get("http://localhost:5000/api/users");
    setUsers(res.data);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
  }, []);

  const handleDelete = async (user) => {
    const isLastAdmin = user.role === "ADMIN" && adminCount <= 1;
    if (isLastAdmin) {
      alert("Không thể xóa admin cuối cùng");
      return;
    }

    try {
      await axios.delete(`http://localhost:5000/api/users/${user.user_id}`);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xóa tài khoản");
    }
  };

  const toggleStatus = async (user) => {
    if (user.role === "ADMIN") {
      alert("Không thể vô hiệu hóa tài khoản admin");
      return;
    }

    try {
      await axios.patch(
        `http://localhost:5000/api/users/${user.user_id}/status`,
        { status: !user.status },
      );
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể đổi trạng thái");
    }
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
    try {
      await axios.put(
        `http://localhost:5000/api/users/${selectedUser.user_id}`,
        form,
      );
      setOpen(false);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể cập nhật tài khoản");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Card className="rounded-2xl p-6 shadow-lg">
        <Typography variant="h4" className="mb-6 font-bold text-gray-800">
          Quản lý tài khoản
        </Typography>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-100 text-sm text-gray-600">
                <th className="p-3">Tên đăng nhập</th>
                <th className="p-3">Role</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Hành động</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => {
                const isLastAdmin = user.role === "ADMIN" && adminCount <= 1;

                return (
                  <tr
                    key={user.user_id}
                    className="border-b transition hover:bg-gray-50"
                  >
                    <td className="p-3 font-medium">{user.username}</td>
                    <td className="p-3">{user.role}</td>

                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => toggleStatus(user)}
                        disabled={user.role === "ADMIN"}
                        className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                          user.role === "ADMIN"
                            ? "cursor-not-allowed bg-gray-100 text-gray-500"
                            : user.status
                              ? "bg-green-100 text-green-700 hover:bg-green-200 hover:shadow-sm"
                              : "bg-red-100 text-red-700 hover:bg-red-200 hover:shadow-sm"
                        }`}
                        title={
                          user.role === "ADMIN"
                            ? "Không thể vô hiệu hóa tài khoản admin"
                            : "Nhấn để đổi trạng thái tài khoản"
                        }
                      >
                        {user.status ? "Active" : "Disabled"}
                      </button>
                    </td>

                    <td className="space-x-2 p-3">
                      <Button
                        size="sm"
                        className="bg-blue-500"
                        onClick={() => openEdit(user)}
                        title="Sửa tên đăng nhập và mật khẩu"
                      >
                        Sửa
                      </Button>

                      <Button
                        size="sm"
                        className={isLastAdmin ? "bg-gray-400" : "bg-red-500"}
                        onClick={() => handleDelete(user)}
                        disabled={isLastAdmin}
                        title={
                          isLastAdmin
                            ? "Không thể xóa admin cuối cùng"
                            : "Xóa tài khoản"
                        }
                      >
                        Xóa
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Dialog open={open} handler={() => setOpen(false)} size="sm">
          <DialogHeader>Chỉnh sửa tài khoản</DialogHeader>

          <DialogBody className="space-y-4">
            <Input
              label="Tên đăng nhập"
              value={form.username || ""}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />

            <Input
              label="Mật khẩu mới (để trống nếu không đổi)"
              type="password"
              value={form.password || ""}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />

            <Select
              label="Role"
              value={form.role}
              onChange={(val) => setForm({ ...form, role: val })}
              disabled={isEditingLastAdmin}
            >
              <Option value="ADMIN">ADMIN</Option>
              <Option value="EMPLOYEE">EMPLOYEE</Option>
            </Select>

            <Select
              label="Status"
              value={form.status ? "true" : "false"}
              onChange={(val) => setForm({ ...form, status: val === "true" })}
              disabled={selectedUser?.role === "ADMIN"}
            >
              <Option value="true">Active</Option>
              <Option value="false">Disabled</Option>
            </Select>

            {isEditingLastAdmin && (
              <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                Đây là admin cuối cùng. Bạn vẫn có thể sửa tên đăng nhập và mật
                khẩu, nhưng không thể đổi role hoặc vô hiệu hóa tài khoản này.
              </p>
            )}

            <Button onClick={handleUpdate} fullWidth className="bg-green-600">
              Lưu thay đổi
            </Button>
          </DialogBody>
        </Dialog>
      </Card>
    </div>
  );
}
