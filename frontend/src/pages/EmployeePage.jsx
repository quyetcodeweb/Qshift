import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Button,
  Card,
  Chip,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Option,
  Select,
  Spinner,
  Typography,
} from "@material-tailwind/react";
import {
  ArrowPathIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  PlusIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrashIcon,
  UserCircleIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { API_URL } from "../services/api";

const defaultForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  birth_date: "",
  gender: "",
  emergency_contact: "",
  emergency_phone: "",
  hourly_rate: "",
  hire_date: "",
  status: "Đang làm việc",
  password: "",
};

const statusOptions = ["Đang làm việc", "Nghỉ phép", "Thử việc"];
const genderOptions = ["Nam", "Nữ", "Khác"];
const pageSize = 8;
const colors = [
  { name: "Xanh", value: "#2563eb" },
  { name: "Lục", value: "#16a34a" },
  { name: "Cam", value: "#f97316" },
  { name: "Đỏ", value: "#dc2626" },
  { name: "Tím", value: "#7c3aed" },
  { name: "Hồng", value: "#db2777" },
];

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function displayStatus(status) {
  const normalized = normalize(status);
  if (normalized.includes("thu viec") || normalized.includes("probation"))
    return "Thử việc";
  if (normalized.includes("nghi") || normalized.includes("leave"))
    return "Nghỉ phép";
  return "Đang làm việc";
}

function statusStyle(status) {
  const value = displayStatus(status);
  if (value === "Nghỉ phép") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (value === "Thử việc") return "bg-blue-50 text-blue-700 ring-blue-100";
  return "bg-green-50 text-green-700 ring-green-100";
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
    "vi-VN",
  );
}

function money(value) {
  const number = Number(value || 0);
  return number ? `${number.toLocaleString("vi-VN")} đ/giờ` : "-";
}

function initials(name) {
  return String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function defaultPassword(employee) {
  const phone = String(employee?.phone || "");
  return phone.length >= 5 ? `A${phone.slice(-5)}` : "Chưa đủ SĐT";
}

function roleText(user) {
  return user?.role === "ADMIN" ? "Quản trị viên" : "Nhân viên";
}

function EmployeeAvatar({ employee, size = "md" }) {
  const dimension = size === "lg" ? "h-20 w-20 text-xl" : "h-11 w-11 text-sm";
  if (employee?.avatar_url) {
    return (
      <img
        src={employee.avatar_url}
        alt={employee.name}
        className={`${dimension} rounded-md object-cover ring-1 ring-gray-200`}
      />
    );
  }

  return (
    <div
      className={`${dimension} flex shrink-0 items-center justify-center rounded-md bg-gray-950 font-bold text-white`}
    >
      {initials(employee?.name)}
    </div>
  );
}

export default function EmployeePage() {
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [roles, setRoles] = useState([]);
  const [employeeRoles, setEmployeeRoles] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedRoleEmployee, setSelectedRoleEmployee] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [roleEmployeeSearch, setRoleEmployeeSearch] = useState("");
  const [roleEmployeePickerOpen, setRoleEmployeePickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("#2563eb");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = authHeaders();
      const [employeesRes, usersRes, todayRes, rolesRes] = await Promise.allSettled([
        axios.get(`${API_URL}/employees`, { headers }),
        axios.get(`${API_URL}/users`, { headers }),
        axios.get(`${API_URL}/attendance/today`, { headers }),
        axios.get(`${API_URL}/roles`, { headers }),
      ]);

      const employeeList =
        employeesRes.status === "fulfilled" ? employeesRes.value.data || [] : [];
      setEmployees(employeeList);
      setUsers(usersRes.status === "fulfilled" ? usersRes.value.data || [] : []);
      setTodayAttendance(todayRes.status === "fulfilled" ? todayRes.value.data || [] : []);
      setRoles(rolesRes.status === "fulfilled" ? rolesRes.value.data || [] : []);

      if (!selectedRoleEmployee && employeeList.length > 0) {
        setSelectedRoleEmployee(String(employeeList[0].employee_id));
      }
    } catch (err) {
      console.error("[EmployeePage] Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedRoleEmployee]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const usersByEmployeeId = useMemo(() => {
    return new Map(
      users
        .filter((user) => user.employee_id)
        .map((user) => [Number(user.employee_id), user]),
    );
  }, [users]);

  const rows = useMemo(() => {
    return employees.map((employee) => ({
      employee,
      user: usersByEmployeeId.get(Number(employee.employee_id)),
    }));
  }, [employees, usersByEmployeeId]);

  const filteredRows = useMemo(() => {
    const keyword = normalize(query);
    if (!keyword) return rows;

    return rows.filter(({ employee, user }) =>
      [
        employee.name,
        employee.email,
        employee.phone,
        employee.address,
        employee.gender,
        employee.emergency_contact,
        employee.emergency_phone,
        user?.username,
        user?.role,
      ].some((value) => normalize(value).includes(keyword)),
    );
  }, [query, rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const summary = useMemo(() => {
    const working = employees.filter(
      (employee) => displayStatus(employee.status) === "Đang làm việc",
    ).length;
    const probation = employees.filter(
      (employee) => displayStatus(employee.status) === "Thử việc",
    ).length;
    return { total: employees.length, working, probation };
  }, [employees]);

  const activityByEmployeeId = useMemo(() => {
    const map = new Map();
    todayAttendance.forEach((record) => {
      const current = map.get(Number(record.employee_id));
      if (!current || record.progress_status === "CHECKED_IN") {
        map.set(Number(record.employee_id), record);
      }
    });
    return map;
  }, [todayAttendance]);

  const selectedRoleEmployeeObj = employees.find(
    (employee) => String(employee.employee_id) === selectedRoleEmployee,
  );
  const filteredRoleEmployees = useMemo(() => {
    const keyword = normalize(roleEmployeeSearch);
    if (!keyword) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.phone,
        employee.employee_code,
        `NV-${employee.employee_id}`,
      ].some((value) => normalize(value).includes(keyword)),
    );
  }, [employees, roleEmployeeSearch]);

  const fetchEmployeeRoles = useCallback(async () => {
    if (!selectedRoleEmployee) {
      setEmployeeRoles([]);
      return;
    }

    try {
      const res = await axios.get(
        `${API_URL}/roles/employee/${selectedRoleEmployee}`,
        {
          headers: authHeaders(),
        },
      );
      setEmployeeRoles(res.data || []);
    } catch {
      setEmployeeRoles([]);
    }
  }, [selectedRoleEmployee]);

  useEffect(() => {
    fetchEmployeeRoles();
  }, [fetchEmployeeRoles]);

  const openEmployeeProfile = (employee) => {
    setSelectedEmployee(employee);
  };

  const openCreateForm = () => {
    setEditingEmployee(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const openEditForm = async (employee) => {
    let detail = employee;
    try {
      const res = await axios.get(`${API_URL}/employees/${employee.employee_id}`, {
        headers: authHeaders(),
      });
      detail = res.data || employee;
    } catch (err) {
      console.error("[EmployeePage] Load employee detail:", err);
    }

    setEditingEmployee(detail);
    setForm({
      name: detail.name || "",
      email: detail.email || "",
      phone: detail.phone || "",
      address: detail.address || "",
      birth_date: detail.birth_date ? String(detail.birth_date).slice(0, 10) : "",
      gender: detail.gender || "",
      emergency_contact: detail.emergency_contact || "",
      emergency_phone: detail.emergency_phone || "",
      hourly_rate: detail.hourly_rate || "",
      hire_date: detail.hire_date ? String(detail.hire_date).slice(0, 10) : "",
      status: displayStatus(detail.status),
      password: "",
    });
    setFormOpen(true);
  };

  const saveEmployee = async () => {
    if (!form.name || !form.phone) {
      alert("Vui lòng nhập tên và số điện thoại");
      return;
    }

    try {
      if (editingEmployee) {
        const { password, ...employeePayload } = form;
        await axios.put(`${API_URL}/employees/${editingEmployee.employee_id}`, employeePayload, {
          headers: authHeaders(),
        });

        const user = usersByEmployeeId.get(Number(editingEmployee.employee_id));
        if (password && user) {
          await axios.put(
            `${API_URL}/users/${user.user_id}`,
            {
              username: user.username,
              password,
              role: user.role,
              status: user.status,
            },
            { headers: authHeaders() },
          );
        }
      } else {
        await axios.post(`${API_URL}/employees`, form, {
          headers: authHeaders(),
        });
      }
      setFormOpen(false);
      setForm(defaultForm);
      setEditingEmployee(null);
      await loadData();
      if (editingEmployee) {
        setSelectedEmployee({ ...editingEmployee, ...form });
      }
      window.appPopup?.({
        type: "success",
        title: editingEmployee ? "Đã cập nhật nhân viên" : "Đã thêm nhân viên",
        message: `${form.name} đã được lưu vào hệ thống.`,
      });
    } catch (err) {
      alert(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể thêm nhân viên",
      );
    }
  };

  const deleteEmployee = async (employee) => {
    const confirmed = await window.appConfirm?.({
      title: "Xóa nhân viên",
      message: `Xóa nhân viên ${employee.name}? Thao tác này cũng xóa tài khoản và dữ liệu liên quan.`,
      confirmText: "Xóa",
      cancelText: "Giữ lại",
      type: "warning",
    });
    if (!confirmed) return;

    try {
      await axios.delete(`${API_URL}/employees/${employee.employee_id}`, {
        headers: authHeaders(),
      });
      setSelectedEmployee(null);
      await loadData();
    } catch (err) {
      alert(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể xóa nhân viên",
      );
    }
  };

  const toggleUserStatus = async (user) => {
    if (!user) return;
    if (user.role === "ADMIN") {
      alert("Không thể vô hiệu hóa tài khoản admin");
      return;
    }

    const confirmed = await window.appConfirm?.({
      title: user.status ? "Vô hiệu hóa tài khoản" : "Kích hoạt tài khoản",
      message: `${user.status ? "Vô hiệu hóa" : "Kích hoạt"} tài khoản ${user.username}?`,
      confirmText: user.status ? "Vô hiệu hóa" : "Kích hoạt",
      cancelText: "Hủy",
      type: "warning",
    });
    if (!confirmed) return;

    try {
      await axios.patch(
        `${API_URL}/users/${user.user_id}/status`,
        { status: !user.status },
        { headers: authHeaders() },
      );
      await loadData();
      if (selectedEmployee) {
        setSelectedEmployee({ ...selectedEmployee });
      }
      window.appPopup?.({
        type: "success",
        title: "Đã đổi trạng thái",
        message: `Tài khoản ${user.username} đã được cập nhật.`,
      });
    } catch (err) {
      alert(
        err.response?.data?.message || "Không thể đổi trạng thái tài khoản",
      );
    }
  };

  const addEmployeeRole = async () => {
    if (!selectedRoleEmployee || !selectedRole) return;

    try {
      await axios.post(
        `${API_URL}/roles/employee/${selectedRoleEmployee}`,
        { role_id: Number(selectedRole) },
        { headers: authHeaders() },
      );
      setSelectedRole("");
      fetchEmployeeRoles();
      window.appPopup?.({ type: "success", title: "Đã thêm vai trò", message: "Vai trò đã được gán cho nhân viên." });
    } catch (err) {
      alert(err.response?.data?.message || "Không thể thêm vai trò");
    }
  };

  const removeEmployeeRole = async (roleId) => {
    const confirmed = await window.appConfirm?.({
      title: "Xóa vai trò nhân viên",
      message: "Xóa vai trò này khỏi nhân viên đang chọn?",
      confirmText: "Xóa vai trò",
      cancelText: "Giữ lại",
      type: "warning",
    });
    if (!confirmed) return;

    try {
      await axios.delete(
        `${API_URL}/roles/employee/${selectedRoleEmployee}/${roleId}`,
        {
          headers: authHeaders(),
        },
      );
      fetchEmployeeRoles();
      window.appPopup?.({ type: "success", title: "Đã xóa vai trò", message: "Vai trò đã được gỡ khỏi nhân viên." });
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xóa vai trò");
    }
  };

  const createRole = async () => {
    if (!newRoleName.trim()) return;

    try {
      await axios.post(
        `${API_URL}/roles`,
        {
          role_name: newRoleName.trim(),
          description: newRoleName.trim(),
          color: newRoleColor,
        },
        { headers: authHeaders() },
      );
      setNewRoleName("");
      setNewRoleColor("#2563eb");
      setCreateRoleOpen(false);
      const res = await axios.get(`${API_URL}/roles`, {
        headers: authHeaders(),
      });
      setRoles(res.data || []);
      window.appPopup?.({ type: "success", title: "Đã tạo vai trò", message: `Vai trò ${newRoleName.trim()} đã được tạo.` });
    } catch (err) {
      alert(err.response?.data?.message || "Không thể tạo vai trò");
    }
  };

  const profileUser = selectedEmployee
    ? usersByEmployeeId.get(Number(selectedEmployee.employee_id))
    : null;
  const profileActivity = selectedEmployee
    ? activityByEmployeeId.get(Number(selectedEmployee.employee_id))
    : null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Typography
            variant="h4"
            className="font-bold tracking-tight text-gray-950"
          >
            Quản lý nhân viên
          </Typography>
          <Typography className="mt-1 text-sm text-gray-600">
            Quản lý hồ sơ, tài khoản và vai trò nhân viên trong cùng một màn
            hình.
          </Typography>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            size="sm"
            onClick={() => setRoleDrawerOpen(true)}
            className="flex h-10 items-center gap-2 rounded-md border-gray-300 px-3 normal-case text-gray-900"
          >
            <ShieldCheckIcon className="h-5 w-5" />
            Vai trò
          </Button>
          <Button
            size="sm"
            onClick={openCreateForm}
            className="flex h-10 w-10 items-center justify-center rounded-md bg-green-500 p-0"
            aria-label="Thêm nhân viên"
          >
            <PlusIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Card className="rounded-md border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo tên, số điện thoại hoặc email"
                className="h-11 w-full rounded-md border border-gray-300 bg-white pl-10 pr-3 text-sm font-medium text-gray-900 outline-none transition focus:border-blue-600"
              />
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-md bg-gray-100 px-3 py-2 text-gray-700">
                Tổng nhân viên: {summary.total}
              </span>
              <span className="rounded-md bg-green-50 px-3 py-2 text-green-700">
                Đang làm việc: {summary.working}
              </span>
              <span className="rounded-md bg-blue-50 px-3 py-2 text-blue-700">
                Đang thử việc: {summary.probation}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                <th className="px-5 py-4">Nhân viên</th>
                <th className="px-5 py-4">Tên đăng nhập/Role</th>
                <th className="px-5 py-4">Liên hệ</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Ngày vào làm</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-5 py-14 text-center">
                    <Spinner className="mx-auto h-8 w-8 text-blue-600" />
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-5 py-14 text-center text-sm font-medium text-gray-500"
                  >
                    Không tìm thấy nhân viên phù hợp
                  </td>
                </tr>
              ) : (
                pagedRows.map(({ employee, user }) => {
                  const disabled = user && !user.status;
                  return (
                    <tr
                      key={employee.employee_id}
                      onClick={() => openEmployeeProfile(employee)}
                      className={`cursor-pointer border-b border-gray-100 transition ${
                        disabled
                          ? "bg-red-50/80 hover:bg-red-50"
                          : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <EmployeeAvatar employee={employee} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-gray-950">
                              {employee.name}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-gray-500">
                              NV-{employee.employee_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-semibold text-gray-900">
                          {user?.username || "-"}
                        </div>
                        <div className="mt-1 text-xs font-medium text-gray-500">
                          {roleText(user)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-semibold text-gray-900">
                          {employee.email || "-"}
                        </div>
                        <div className="mt-1 text-xs font-medium text-gray-500">
                          {employee.phone || "-"}
                        </div>
                        <div className="mt-1 max-w-[260px] truncate text-xs font-medium text-gray-400">
                          {employee.address || "Chưa cập nhật địa chỉ"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusStyle(employee.status)}`}
                        >
                          {displayStatus(employee.status)}
                        </span>
                        {disabled && (
                          <div className="mt-2 text-xs font-semibold text-red-700">
                            Tài khoản vô hiệu hóa
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-700">
                        {formatDate(employee.hire_date)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium text-gray-500">
            Hiển thị {pagedRows.length} trên {filteredRows.length} nhân viên
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outlined"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="flex items-center gap-1 rounded-md border-gray-300 px-3 normal-case"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Trước
            </Button>
            <span className="rounded-md bg-gray-100 px-3 py-2 text-sm font-bold text-gray-800">
              {page}/{totalPages}
            </span>
            <Button
              variant="outlined"
              size="sm"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              className="flex items-center gap-1 rounded-md border-gray-300 px-3 normal-case"
            >
              Sau
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog
        open={Boolean(selectedEmployee)}
        handler={() => setSelectedEmployee(null)}
        size="xl"
      >
        {selectedEmployee && (
          <>
            <DialogHeader className="border-b border-gray-100 p-0">
              <div className="flex w-full items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <EmployeeAvatar employee={selectedEmployee} size="lg" />
                  <div>
                    <Typography
                      variant="h5"
                      className="font-bold text-gray-950"
                    >
                      {selectedEmployee.name}
                    </Typography>
                    <Typography className="mt-1 text-sm font-medium text-gray-500">
                      NV-{selectedEmployee.employee_id} ·{" "}
                      {roleText(profileUser)}
                    </Typography>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditForm(selectedEmployee)}
                      className="rounded-md border border-gray-200 p-2 text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      aria-label="Sửa nhân viên"
                      title="Sửa nhân viên"
                    >
                      <PencilSquareIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEmployee(selectedEmployee)}
                      className="rounded-md border border-gray-200 p-2 text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                      aria-label="Xóa nhân viên"
                      title="Xóa nhân viên"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {profileUser?.role !== "ADMIN" && (
                    <Button
                      variant="outlined"
                      size="sm"
                      onClick={() => toggleUserStatus(profileUser)}
                      className="flex items-center gap-2 rounded-md border-red-200 normal-case text-red-700"
                    >
                      <NoSymbolIcon className="h-4 w-4" />
                      {profileUser?.status ? "Vô hiệu hóa" : "Kích hoạt"}
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedEmployee(null)}
                    className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-950"
                    aria-label="Đóng"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </DialogHeader>

            <DialogBody className="max-h-[72vh] overflow-y-auto p-5">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="rounded-md border border-gray-200 p-4 shadow-sm lg:col-span-2">
                  <Typography className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">
                    Thông tin hồ sơ
                  </Typography>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["Tên đăng nhập", profileUser?.username || "-"],
                      ["Role", roleText(profileUser)],
                      ["Email", selectedEmployee.email || "-"],
                      ["Ngay sinh", formatDate(selectedEmployee.birth_date)],
                      ["Gioi tinh", selectedEmployee.gender || "-"],
                      ["Dia chi", selectedEmployee.address || "-"],
                      [
                        "Nguoi lien he khan cap",
                        selectedEmployee.emergency_contact || "-",
                      ],
                      [
                        "SDT khan cap",
                        selectedEmployee.emergency_phone || "-",
                      ],
                      ["Số điện thoại", selectedEmployee.phone || "-"],
                      [
                        "Trạng thái hồ sơ",
                        displayStatus(selectedEmployee.status),
                      ],
                      ["Ngày vào làm", formatDate(selectedEmployee.hire_date)],
                      ["Lương theo giờ", money(selectedEmployee.hourly_rate)],
                      ["Mật khẩu tài khoản", defaultPassword(selectedEmployee)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md bg-gray-50 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                          {label}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-gray-950">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="rounded-md border border-gray-200 p-4 shadow-sm">
                  <Typography className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">
                    Hoạt động hiện tại
                  </Typography>
                  <div className="rounded-md bg-gray-950 p-4 text-white">
                    <div className="flex items-center gap-2">
                      {profileActivity?.progress_status === "CHECKED_IN" ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-300" />
                      ) : (
                        <BriefcaseIcon className="h-5 w-5 text-gray-300" />
                      )}
                      <span className="text-sm font-bold">
                        {profileActivity?.progress_status === "CHECKED_IN"
                          ? "Đang trong ca làm"
                          : "Không trong ca làm"}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-gray-300">
                      {profileActivity
                        ? `${profileActivity.shift_name} · ${profileActivity.start_time?.slice(0, 5)} - ${profileActivity.end_time?.slice(0, 5)}`
                        : "Không có ca đang chấm công trong hôm nay"}
                    </div>
                  </div>
                  <div className="mt-4 rounded-md border border-gray-200 p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      Trạng thái tài khoản
                    </div>
                    <div
                      className={`mt-2 inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${
                        profileUser?.status
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {profileUser?.status
                        ? "Đang hoạt động"
                        : "Đã vô hiệu hóa"}
                    </div>
                  </div>
                </Card>
              </div>
            </DialogBody>
          </>
        )}
      </Dialog>

      <Dialog
        open={formOpen}
        handler={() => {
          setFormOpen(false);
          setEditingEmployee(null);
        }}
        size="lg"
      >
        <DialogHeader className="border-b border-gray-100">
          <div>
            <Typography variant="h5" className="font-bold text-gray-950">
              {editingEmployee ? "Sửa nhân viên" : "Thêm nhân viên"}
            </Typography>
            <Typography className="mt-1 text-sm font-medium text-gray-500">
              {editingEmployee
                ? "Cập nhật thông tin hồ sơ nhân viên."
                : "Tài khoản sẽ được tạo tự động theo số điện thoại."}
            </Typography>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Tên nhân viên"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
            <Input
              label="Email"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
            <Input
              label="Số điện thoại"
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
            />
            <Input
              label="Lương / giờ"
              value={form.hourly_rate}
              onChange={(event) =>
                setForm({ ...form, hourly_rate: event.target.value })
              }
            />
            <Input
              type="date"
              label="Ngay sinh"
              value={form.birth_date}
              onChange={(event) =>
                setForm({ ...form, birth_date: event.target.value })
              }
            />
            <Select
              label="Gioi tinh"
              value={form.gender}
              onChange={(value) => setForm({ ...form, gender: value || "" })}
            >
              {genderOptions.map((option) => (
                <Option key={option} value={option}>
                  {option}
                </Option>
              ))}
            </Select>
            <Input
              label="Nguoi lien he khan cap"
              value={form.emergency_contact}
              onChange={(event) =>
                setForm({ ...form, emergency_contact: event.target.value })
              }
            />
            <Input
              label="SDT khan cap"
              value={form.emergency_phone}
              onChange={(event) =>
                setForm({ ...form, emergency_phone: event.target.value })
              }
            />
            <label className="sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-blue-gray-500">
                Dia chi
              </span>
              <textarea
                value={form.address}
                onChange={(event) =>
                  setForm({ ...form, address: event.target.value })
                }
                rows={3}
                className="w-full resize-none rounded-md border border-blue-gray-200 bg-transparent px-3 py-2.5 text-sm font-normal text-blue-gray-700 outline outline-0 transition-all placeholder-shown:border-blue-gray-200 focus:border-gray-900 focus:outline-0"
              />
            </label>
            <Input
              type="date"
              label="Ngày vào làm"
              value={form.hire_date}
              onChange={(event) =>
                setForm({ ...form, hire_date: event.target.value })
              }
            />
            <Select
              label="Trạng thái"
              value={form.status}
              onChange={(value) =>
                setForm({ ...form, status: value || "Đang làm việc" })
              }
            >
              {statusOptions.map((option) => (
                <Option key={option} value={option}>
                  {option}
                </Option>
              ))}
            </Select>
            {editingEmployee && (
              <Input
                type="password"
                label="Mật khẩu mới"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
              />
            )}
          </div>

          {!editingEmployee && (
          <div className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm font-medium text-blue-800">
            Tên đăng nhập là số điện thoại. Mật khẩu mặc định là chữ A kèm 5 số
            cuối của số điện thoại.
          </div>
          )}
          {editingEmployee && (
            <div className="rounded-md border border-amber-100 bg-amber-50 p-4 text-sm font-medium text-amber-800">
              Để trống mật khẩu mới nếu không muốn thay đổi mật khẩu tài khoản.
            </div>
          )}
        </DialogBody>
        <DialogFooter className="gap-2 border-t border-gray-100">
          <Button
            variant="text"
            onClick={() => {
              setFormOpen(false);
              setEditingEmployee(null);
            }}
            className="rounded-md bg-red-400 normal-case text-white"
          >
            Hủy
          </Button>
          <Button
            onClick={saveEmployee}
            className="rounded-md bg-light-green-400 normal-case text-white"
          >
            {editingEmployee ? "Cập nhật nhân viên" : "Lưu nhân viên"}
          </Button>
        </DialogFooter>
      </Dialog>

      {roleDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-gray-950/40 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <Typography variant="h5" className="font-bold text-gray-950">
                  Vai trò nhân viên
                </Typography>
                <Typography className="mt-1 text-sm text-gray-500">
                  Tạo vai trò và gán vai trò cho từng nhân viên.
                </Typography>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setCreateRoleOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-950 p-0"
                  aria-label="Thêm vai trò"
                >
                  <PlusIcon className="h-5 w-5" />
                </Button>
                <button
                  type="button"
                  onClick={() => setRoleDrawerOpen(false)}
                  className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-950"
                  aria-label="Đóng"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <Card className="rounded-md border border-gray-200 p-4 shadow-sm">
                <div className="grid gap-4">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setRoleEmployeePickerOpen((open) => !open)}
                      className="flex h-11 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 text-left text-sm font-semibold text-gray-900 outline-none transition hover:border-blue-500 focus:border-blue-600"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {selectedRoleEmployeeObj?.name || "Chọn nhân viên"}
                      </span>
                      <UserCircleIcon className="h-5 w-5 shrink-0 text-gray-400" />
                    </button>
                    {roleEmployeePickerOpen && (
                      <div className="absolute left-0 top-12 z-40 w-full rounded-md border border-gray-200 bg-white p-2 shadow-xl">
                        <div className="relative mb-2">
                          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input
                            value={roleEmployeeSearch}
                            onChange={(event) => setRoleEmployeeSearch(event.target.value)}
                            placeholder="Tìm tên, email, SĐT..."
                            className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm font-medium text-gray-900 outline-none focus:border-blue-600"
                          />
                        </div>
                        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                          {filteredRoleEmployees.map((employee) => (
                            <button
                              key={employee.employee_id}
                              type="button"
                              onClick={() => {
                                setSelectedRoleEmployee(String(employee.employee_id));
                                setRoleEmployeePickerOpen(false);
                                setRoleEmployeeSearch("");
                              }}
                              className={`w-full rounded-md px-3 py-2 text-left transition ${
                                String(employee.employee_id) === selectedRoleEmployee
                                  ? "bg-blue-50 text-blue-700"
                                  : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <div className="truncate text-sm font-bold">{employee.name}</div>
                              <div className="truncate text-xs font-medium text-gray-500">
                                {employee.email || employee.phone || `NV-${employee.employee_id}`}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedRoleEmployeeObj && (
                    <div className="flex items-center gap-3 rounded-md bg-gray-50 p-3">
                      <EmployeeAvatar employee={selectedRoleEmployeeObj} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-gray-950">
                          {selectedRoleEmployeeObj.name}
                        </div>
                        <div className="text-xs font-medium text-gray-500">
                          {selectedRoleEmployeeObj.email ||
                            selectedRoleEmployeeObj.phone}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="rounded-md border border-gray-200 p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <Typography variant="h6" className="font-bold text-gray-950">
                    Thêm vai trò nhân viên
                  </Typography>
                  <SparklesIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Select
                    label="Vai trò"
                    value={selectedRole}
                    onChange={(value) => setSelectedRole(value || "")}
                  >
                    {roles
                      .filter(
                        (role) =>
                          !employeeRoles.some(
                            (employeeRole) =>
                              employeeRole.role_id === role.role_id,
                          ),
                      )
                      .map((role) => (
                        <Option key={role.role_id} value={String(role.role_id)}>
                          {role.role_name}
                        </Option>
                      ))}
                  </Select>
                  <Button
                    onClick={addEmployeeRole}
                    disabled={!selectedRole}
                    className="rounded-md bg-blue-600 normal-case"
                  >
                    Thêm
                  </Button>
                </div>
              </Card>

              <Card className="rounded-md border border-gray-200 p-4 shadow-sm">
                <Typography
                  variant="h6"
                  className="mb-4 font-bold text-gray-950"
                >
                  Vai trò hiện tại
                </Typography>
                {employeeRoles.length === 0 ? (
                  <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-medium text-gray-500">
                    Nhân viên này chưa có vai trò
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {employeeRoles.map((role) => (
                      <Chip
                        key={role.role_id}
                        value={role.role_name}
                        onClose={() => removeEmployeeRole(role.role_id)}
                        style={{ backgroundColor: role.color || "#2563eb" }}
                        className="rounded-md text-white"
                      />
                    ))}
                  </div>
                )}
              </Card>

              <Card className="rounded-md border border-gray-200 p-4 shadow-sm">
                <Typography
                  variant="h6"
                  className="mb-4 font-bold text-gray-950"
                >
                  Danh sách vai trò
                </Typography>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <span
                      key={role.role_id}
                      className="rounded-md px-3 py-1.5 text-xs font-bold text-white"
                      style={{ backgroundColor: role.color || "#2563eb" }}
                    >
                      {role.role_name}
                    </span>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={createRoleOpen}
        handler={() => setCreateRoleOpen(false)}
        size="sm"
      >
        <DialogHeader>Tạo vai trò mới</DialogHeader>
        <DialogBody className="space-y-4">
          <Input
            label="Tên vai trò"
            value={newRoleName}
            onChange={(event) => setNewRoleName(event.target.value)}
          />
          <div>
            <Typography className="mb-2 text-sm font-bold text-gray-700">
              Màu vai trò
            </Typography>
            <div className="grid grid-cols-6 gap-2">
              {colors.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setNewRoleColor(color.value)}
                  className={`h-10 rounded-md ring-2 ring-offset-2 transition ${
                    newRoleColor === color.value
                      ? "ring-gray-950"
                      : "ring-transparent"
                  }`}
                  style={{ backgroundColor: color.value }}
                  aria-label={color.name}
                />
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button
            variant="text"
            onClick={() => setCreateRoleOpen(false)}
            className="rounded-md normal-case text-gray-700"
          >
            Hủy
          </Button>
          <Button
            onClick={createRole}
            disabled={!newRoleName.trim()}
            className="rounded-md bg-gray-950 normal-case"
          >
            Tạo vai trò
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
