import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Spinner } from "@material-tailwind/react";
import {
  ArrowPathIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  CameraIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  IdentificationIcon,
  KeyIcon,
  LockClosedIcon,
  MapPinIcon,
  PencilSquareIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserCircleIcon,
  UserIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { API_URL } from "../services/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user")) || {};
  } catch {
    return {};
  }
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "QS";
  return parts
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function money(value) {
  return Number(value || 0).toLocaleString("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  });
}

function resizeImageFile(file, maxSize = 760, quality = 0.84) {
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
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = reject;
      image.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Field({ icon, label, children }) {
  const IconComponent = icon;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        <IconComponent className="h-4 w-4" />
        {label}
      </div>
      <div className="min-h-[24px] break-words text-sm font-semibold text-slate-900">
        {children || "Chưa cập nhật"}
      </div>
    </div>
  );
}

function TextInput({ label, icon, className = "", ...props }) {
  const IconComponent = icon;

  return (
    <label className={`block ${className}`}>
      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <IconComponent className="h-4 w-4" />
        {label}
      </span>
      <input
        {...props}
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function SelectInput({ label, icon, className = "", children, ...props }) {
  const IconComponent = icon;

  return (
    <label className={`block ${className}`}>
      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <IconComponent className="h-4 w-4" />
        {label}
      </span>
      <select
        {...props}
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
      >
        {children}
      </select>
    </label>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
      <Spinner className="h-10 w-10 text-cyan-600" />
    </div>
  );
}

export default function ProfilePage() {
  const fileInputRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: "",
  });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const account = useMemo(() => getStoredUser(), []);

  const setProfileForm = useCallback((employee) => {
    setForm({
      name: employee?.name || "",
      email: employee?.email || "",
      phone: employee?.phone || "",
      avatar_url: employee?.avatar_url || "",
      address: employee?.address || "",
      birth_date: toDateInput(employee?.birth_date),
      gender: employee?.gender || "",
      emergency_contact: employee?.emergency_contact || "",
      emergency_phone: employee?.emergency_phone || "",
      hire_date: toDateInput(employee?.hire_date),
      status: employee?.status || "Đang làm việc",
      hourly_rate: employee?.hourly_rate || 0,
    });
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axios.get(`${API_URL}/employees/me`, {
        headers: authHeaders(),
      });
      setProfile(res.data);
      setProfileForm(res.data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể tải hồ sơ cá nhân",
      );
    } finally {
      setLoading(false);
    }
  }, [setProfileForm]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAvatarFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn đúng định dạng ảnh");
      return;
    }

    try {
      const imageData = await resizeImageFile(file);
      updateForm("avatar_url", imageData);
      setEditing(true);
      setError("");
    } catch {
      setError("Không thể đọc ảnh này, vui lòng chọn ảnh khác");
    }
  };

  const cancelEdit = () => {
    setProfileForm(profile);
    setEditing(false);
    setError("");
  };

  const saveProfile = async () => {
    if (!profile?.employee_id) return;
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Vui lòng nhập tên và số điện thoại");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const res = await axios.put(
        `${API_URL}/employees/${profile.employee_id}`,
        {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          avatar_url: form.avatar_url || null,
          address: form.address.trim(),
          birth_date: form.birth_date || null,
          gender: form.gender || null,
          emergency_contact: form.emergency_contact.trim(),
          emergency_phone: form.emergency_phone.trim(),
          hire_date: toDateInput(profile.hire_date) || null,
          status: profile.status || "Đang làm việc",
          hourly_rate: profile.hourly_rate,
        },
        { headers: authHeaders() },
      );
      setProfile(res.data);
      setProfileForm(res.data);
      setEditing(false);
      setSuccess("Đã cập nhật hồ sơ cá nhân");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể lưu hồ sơ",
      );
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!passwordForm.password || passwordForm.password.length < 6) {
      setError("Mật khẩu mới cần ít nhất 6 ký tự");
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setError("Mật khẩu xác nhận chưa khớp");
      return;
    }

    try {
      setSavingPassword(true);
      setError("");
      setSuccess("");
      await axios.put(
        `${API_URL}/users/${profile.user_id}`,
        {
          username: profile.username || account.username,
          password: passwordForm.password,
          role: account.role || "EMPLOYEE",
          status: account.status ?? true,
        },
        { headers: authHeaders() },
      );
      setPasswordForm({ password: "", confirmPassword: "" });
      setSuccess("Đã đổi mật khẩu tài khoản");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể đổi mật khẩu",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const statusStyle = String(profile?.status || "")
    .toLowerCase()
    .includes("thử")
    ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-5 px-2 pb-8 sm:px-0">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative bg-[linear-gradient(135deg,#0f172a_0%,#134e4a_48%,#f59e0b_100%)] px-4 py-6 text-white sm:px-6 sm:py-8 lg:px-8">
          <div className="absolute inset-x-0 bottom-0 h-16 bg-white [clip-path:polygon(0_100%,100%_36%,100%_100%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="relative h-28 w-28 shrink-0 sm:h-36 sm:w-36">
                {form.avatar_url ? (
                  <img
                    src={form.avatar_url}
                    alt={form.name || "Ảnh hồ sơ"}
                    className="h-full w-full rounded-3xl border-4 border-white object-cover shadow-xl"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-3xl border-4 border-white bg-white text-3xl font-black text-slate-900 shadow-xl">
                    {initials(form.name)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-lg ring-1 ring-slate-200 transition hover:scale-105 hover:bg-cyan-50"
                  aria-label="Chọn ảnh hồ sơ"
                >
                  <CameraIcon className="h-5 w-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleAvatarFile(event.target.files?.[0])}
                  className="hidden"
                />
              </div>

              <div className="min-w-0 pb-2">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusStyle}`}>
                    {profile?.status || "Đang làm việc"}
                  </span>
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/25">
                    {profile?.username || account.username || "Tài khoản nhân viên"}
                  </span>
                </div>
                <h1 className="break-words text-3xl font-black tracking-normal sm:text-4xl">
                  {form.name || "Hồ sơ cá nhân"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-medium text-white/80">
                  Quản lý thông tin cá nhân, ảnh đại diện và mật khẩu tài khoản của bạn.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={fetchProfile}
                disabled={loading}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-bold text-white ring-1 ring-white/25 transition hover:bg-white/25 disabled:opacity-60"
              >
                <ArrowPathIcon className="h-5 w-5" />
                Làm mới
              </button>
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    <XMarkIcon className="h-5 w-5" />
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={saving}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
                  >
                    <CheckCircleIcon className="h-5 w-5" />
                    {saving ? "Đang lưu" : "Lưu hồ sơ"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-cyan-50"
                >
                  <PencilSquareIcon className="h-5 w-5" />
                  Sửa thông tin
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-4 sm:p-6">
            <ProfileSkeleton />
          </div>
        ) : (
          <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-8">
            <section className="space-y-5">
              {(error || success) && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                    error
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {error || success}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-slate-950">Thông tin cá nhân</h2>
                    <p className="text-sm font-medium text-slate-500">
                      Các thông tin này dùng cho hồ sơ nhân sự và liên hệ nội bộ.
                    </p>
                  </div>
                  <SparklesIcon className="hidden h-7 w-7 text-amber-500 sm:block" />
                </div>

                {editing ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextInput
                      label="Họ và tên"
                      icon={UserIcon}
                      value={form.name}
                      onChange={(event) => updateForm("name", event.target.value)}
                    />
                    <TextInput
                      label="Số điện thoại"
                      icon={PhoneIcon}
                      value={form.phone}
                      onChange={(event) => updateForm("phone", event.target.value)}
                    />
                    <TextInput
                      label="Email"
                      icon={EnvelopeIcon}
                      type="email"
                      value={form.email}
                      onChange={(event) => updateForm("email", event.target.value)}
                    />
                    <TextInput
                      label="Ngày sinh"
                      icon={CalendarDaysIcon}
                      type="date"
                      value={form.birth_date}
                      onChange={(event) => updateForm("birth_date", event.target.value)}
                    />
                    <SelectInput
                      label="Giới tính"
                      icon={UserCircleIcon}
                      value={form.gender}
                      onChange={(event) => updateForm("gender", event.target.value)}
                    >
                      <option value="">Chưa cập nhật</option>
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                      <option value="Khác">Khác</option>
                    </SelectInput>
                    <TextInput
                      label="Người liên hệ khẩn cấp"
                      icon={UsersIcon}
                      value={form.emergency_contact}
                      onChange={(event) =>
                        updateForm("emergency_contact", event.target.value)
                      }
                    />
                    <TextInput
                      label="SĐT khẩn cấp"
                      icon={ShieldCheckIcon}
                      value={form.emergency_phone}
                      onChange={(event) =>
                        updateForm("emergency_phone", event.target.value)
                      }
                    />
                    <label className="block md:col-span-2">
                      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <MapPinIcon className="h-4 w-4" />
                        Địa chỉ
                      </span>
                      <textarea
                        value={form.address}
                        onChange={(event) => updateForm("address", event.target.value)}
                        rows={4}
                        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field icon={PhoneIcon} label="Số điện thoại">
                      {profile?.phone}
                    </Field>
                    <Field icon={EnvelopeIcon} label="Email">
                      {profile?.email}
                    </Field>
                    <Field icon={CalendarDaysIcon} label="Ngày sinh">
                      {formatDate(profile?.birth_date)}
                    </Field>
                    <Field icon={UserCircleIcon} label="Giới tính">
                      {profile?.gender}
                    </Field>
                    <Field icon={UsersIcon} label="Liên hệ khẩn cấp">
                      {profile?.emergency_contact}
                    </Field>
                    <Field icon={ShieldCheckIcon} label="SĐT khẩn cấp">
                      {profile?.emergency_phone}
                    </Field>
                    <Field icon={MapPinIcon} label="Địa chỉ">
                      {profile?.address}
                    </Field>
                    <Field icon={BriefcaseIcon} label="Ngày vào làm">
                      {formatDate(profile?.hire_date)}
                    </Field>
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                    <IdentificationIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-950">Tài khoản</h2>
                    <p className="text-sm font-medium text-slate-500">Thông tin đăng nhập</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <Field icon={UserIcon} label="Tên đăng nhập">
                    {profile?.username || account.username}
                  </Field>
                  <Field icon={BriefcaseIcon} label="Lương theo giờ">
                    {money(profile?.hourly_rate)}
                  </Field>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    Mức lương chỉ do admin quản lý và không thể chỉnh sửa tại trang hồ sơ.
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
                    <LockClosedIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black">Đổi mật khẩu</h2>
                    <p className="text-sm font-medium text-slate-300">
                      Cập nhật mật khẩu tài khoản nhân viên
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                      <KeyIcon className="h-4 w-4" />
                      Mật khẩu mới
                    </span>
                    <input
                      type="password"
                      value={passwordForm.password}
                      onChange={(event) =>
                        setPasswordForm((prev) => ({
                          ...prev,
                          password: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/20"
                      placeholder="Tối thiểu 6 ký tự"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                      <ShieldCheckIcon className="h-4 w-4" />
                      Xác nhận mật khẩu
                    </span>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(event) =>
                        setPasswordForm((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/20"
                      placeholder="Nhập lại mật khẩu"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={changePassword}
                    disabled={savingPassword}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
                  >
                    <LockClosedIcon className="h-5 w-5" />
                    {savingPassword ? "Đang đổi" : "Đổi mật khẩu"}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
