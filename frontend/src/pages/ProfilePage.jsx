import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Button,
  Card,
  Input,
  Spinner,
  Typography,
} from "@material-tailwind/react";
import {
  CheckIcon,
  PencilIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { getRole } from "../utils/auth";
import { API_URL } from "../services/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "QS";
  return parts
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function currency(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  });
}

function resizeImageFile(file, maxSize = 720, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      image.onerror = reject;
      image.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ProfileCard({ employee, large = false, canEditSalary = false, onSave }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: employee?.name || "",
    email: employee?.email || "",
    phone: employee?.phone || "",
    avatar_url: employee?.avatar_url || "",
    hourly_rate: employee?.hourly_rate || "",
  });

  useEffect(() => {
    setForm({
      name: employee?.name || "",
      email: employee?.email || "",
      phone: employee?.phone || "",
      avatar_url: employee?.avatar_url || "",
      hourly_rate: employee?.hourly_rate || "",
    });
  }, [employee]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAvatarFile = async (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn tệp ảnh");
      return;
    }

    try {
      const resizedImage = await resizeImageFile(file);
      handleChange("avatar_url", resizedImage);
    } catch {
      alert("Không thể đọc tệp ảnh này");
    }
  };

  const handleCancel = () => {
    setForm({
      name: employee?.name || "",
      email: employee?.email || "",
      phone: employee?.phone || "",
      avatar_url: employee?.avatar_url || "",
      hourly_rate: employee?.hourly_rate || "",
    });
    setEditing(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSave(employee.employee_id, form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const avatarSize = large ? "h-32 w-32 text-4xl" : "h-24 w-24 text-3xl";
  const cardPadding = large ? "p-8" : "p-5";

  return (
    <Card
      className={`relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm ${cardPadding}`}
    >
      <div className="absolute left-0 top-0 h-2 w-full bg-gradient-to-r from-blue-600 via-teal-500 to-amber-500" />

      <button
        type="button"
        onClick={() => setEditing(true)}
        className="absolute right-4 top-4 rounded-full bg-gray-900 p-2 text-white shadow transition hover:bg-blue-600"
        aria-label="Sửa hồ sơ"
      >
        <PencilIcon className="h-4 w-4" />
      </button>

      <div className={`flex ${large ? "flex-col md:flex-row" : "flex-col"} gap-5`}>
        <div className="flex flex-col items-center gap-3">
          {form.avatar_url ? (
            <img
              src={form.avatar_url}
              alt={form.name || "Ảnh nhân viên"}
              className={`${avatarSize} rounded-full border-4 border-white object-cover shadow-md ring-1 ring-gray-200`}
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div
              className={`${avatarSize} flex items-center justify-center rounded-full bg-blue-50 font-bold text-blue-700 shadow-inner ring-1 ring-blue-100`}
            >
              {initials(form.name)}
            </div>
          )}

          {editing && (
            <div className="w-full">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Ảnh đại diện
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => handleAvatarFile(event.target.files?.[0])}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-blue-700"
              />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          {editing ? (
            <>
              <Input
                label="Tên"
                value={form.name}
                onChange={(event) => handleChange("name", event.target.value)}
              />
              <Input
                label="Email"
                value={form.email}
                onChange={(event) => handleChange("email", event.target.value)}
              />
              <Input
                label="Số điện thoại"
                value={form.phone}
                onChange={(event) => handleChange("phone", event.target.value)}
              />
              {canEditSalary && (
                <Input
                  type="number"
                  label="Mức lương theo giờ"
                  value={form.hourly_rate}
                  onChange={(event) =>
                    handleChange("hourly_rate", event.target.value)
                  }
                />
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex items-center gap-2 bg-green-600"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <CheckIcon className="h-4 w-4" />
                  Lưu
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  className="flex items-center gap-2"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  <XMarkIcon className="h-4 w-4" />
                  Hủy
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <Typography
                  variant={large ? "h3" : "h5"}
                  className="truncate font-bold text-gray-900"
                >
                  {employee.name || "Chưa có tên"}
                </Typography>
                <Typography className="mt-1 truncate text-sm text-gray-500">
                  {employee.email || "Chưa có email"}
                </Typography>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
                  <Typography className="text-xs font-semibold uppercase text-gray-500">
                    Số điện thoại
                  </Typography>
                  <Typography className="font-medium text-gray-900">
                    {employee.phone || "-"}
                  </Typography>
                </div>
                <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
                  <Typography className="text-xs font-semibold uppercase text-gray-500">
                    Mức lương
                  </Typography>
                  <Typography className="font-medium text-gray-900">
                    {currency(employee.hourly_rate)}
                  </Typography>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const role = getRole();
  const isAdmin = role === "ADMIN";
  const [employees, setEmployees] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      if (isAdmin) {
        const res = await axios.get(`${API_URL}/employees`, {
          headers: authHeaders(),
        });
        setEmployees(res.data || []);
        return;
      }

      const res = await axios.get(`${API_URL}/employees/me`, {
        headers: authHeaders(),
      });
      setMyProfile(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Không thể tải hồ sơ");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleSave = useCallback(
    async (employeeId, form) => {
      const res = await axios.put(
        `${API_URL}/employees/${employeeId}`,
        {
          ...form,
          hourly_rate: Number(form.hourly_rate || 0),
        },
        { headers: authHeaders() },
      );

      if (isAdmin) {
        setEmployees((prev) =>
          prev.map((employee) =>
            employee.employee_id === employeeId ? res.data : employee,
          ),
        );
      } else {
        setMyProfile(res.data);
      }
    },
    [isAdmin],
  );

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="flex h-64 items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      );
    }

    if (isAdmin) {
      if (employees.length === 0) {
        return (
          <Card className="p-8 text-center text-gray-500">
            Chưa có hồ sơ nhân viên.
          </Card>
        );
      }

      return (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((employee) => (
            <ProfileCard
              key={employee.employee_id}
              employee={employee}
              canEditSalary={isAdmin}
              onSave={handleSave}
            />
          ))}
        </div>
      );
    }

    if (!myProfile) {
      return (
        <Card className="p-8 text-center text-gray-500">
          Chưa có hồ sơ nhân viên cho tài khoản này.
        </Card>
      );
    }

    return (
      <div className="mx-auto max-w-4xl">
        <ProfileCard employee={myProfile} large onSave={handleSave} />
      </div>
    );
  }, [employees, handleSave, isAdmin, loading, myProfile]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <Typography variant="h4" className="font-bold text-gray-900">
            Hồ sơ
          </Typography>
          <Typography className="text-sm text-gray-600">
            {isAdmin
              ? "Quản lý thông tin hồ sơ nhân viên"
              : "Thông tin cá nhân của bạn"}
          </Typography>
        </div>
        <Button variant="outlined" size="sm" onClick={fetchProfiles} disabled={loading}>
          Làm mới
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {content}
    </div>
  );
}
