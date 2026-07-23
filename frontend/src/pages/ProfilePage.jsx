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
import defaultEmployeeAvatar from "../assets/default-employee-avatar.svg";

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
        const scale = Math.min(
          1,
          maxSize / Math.max(image.width, image.height),
        );
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

const emailNotificationOptions = [
  { key: "schedule", label: "Lịch làm việc" },
  { key: "attendance", label: "Chấm công" },
  { key: "attendance_reminder", label: "Nhắc chấm công" },
  { key: "bell", label: "Thông báo trong chuông" },
  { key: "shift_swap", label: "Yêu cầu đổi ca" },
  { key: "admin_reminder", label: "Nhắc nhở của admin" },
  { key: "payroll", label: "Lương và phản hồi" },
  { key: "availability", label: "Đăng ký ngày nghỉ" },
  { key: "security", label: "Bảo mật tài khoản" },
];

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
    currentPassword: "",
    password: "",
    confirmPassword: "",
    otp: "",
  });
  const [emailOtp, setEmailOtp] = useState("");
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [sendingPasswordOtp, setSendingPasswordOtp] = useState(false);
  const [emailPrefs, setEmailPrefs] = useState({});
  const [savingEmailPrefs, setSavingEmailPrefs] = useState(false);
  const [showEmailPrefs, setShowEmailPrefs] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
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
      const [profileResult, prefsResult] = await Promise.allSettled([
        axios.get(`${API_URL}/employees/me`, {
          headers: authHeaders(),
        }),
        axios.get(`${API_URL}/employees/me/email-preferences`, {
          headers: authHeaders(),
        }),
      ]);

      if (profileResult.status !== "fulfilled") {
        const loadError = profileResult.reason;
        throw new Error(
          loadError.response?.data?.message ||
            loadError.response?.data?.error ||
            "Khong the tai ho so ca nhan",
        );
      }

      setProfile(profileResult.value.data);
      setProfileForm(profileResult.value.data);
      if (prefsResult.status === "fulfilled") {
        setEmailPrefs(prefsResult.value.data || {});
      }
    } catch (err) {
      setError(
        err.message ||
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

  const emailChanged = Boolean(
    profile?.email &&
    String(form.email || "").trim() &&
    String(profile.email || "").trim() !== String(form.email || "").trim(),
  );

  const requestEmailOtp = async (purpose = "email_change") => {
    try {
      if (purpose === "email_change") setSendingEmailOtp(true);
      if (purpose === "password_change") setSendingPasswordOtp(true);
      const endpoint =
        purpose === "password_change"
          ? `${API_URL}/users/me/password-otp`
          : `${API_URL}/employees/me/email-otp`;
      await axios.post(endpoint, { purpose }, { headers: authHeaders() });
      window.appPopup?.({
        type: "success",
        title: "Đã gửi mã OTP",
        message: "Vui lòng kiểm tra email để lấy mã xác minh.",
      });
    } catch (err) {
      notifyProfileError(
        err.response?.data?.message || "Không thể gửi mã OTP",
        "Không thể gửi OTP",
      );
    } finally {
      setSendingEmailOtp(false);
      setSendingPasswordOtp(false);
    }
  };

  const saveEmailPreferences = async (nextPrefs = emailPrefs) => {
    try {
      setSavingEmailPrefs(true);
      const res = await axios.put(
        `${API_URL}/employees/me/email-preferences`,
        nextPrefs,
        { headers: authHeaders() },
      );
      setEmailPrefs(res.data || nextPrefs);
    } catch (err) {
      notifyProfileError(
        err.response?.data?.message || "Không thể lưu thiết lập email",
        "Không thể lưu thiết lập",
      );
    } finally {
      setSavingEmailPrefs(false);
    }
  };

  const toggleEmailPref = (key) => {
    const next = { ...emailPrefs, [key]: !emailPrefs[key] };
    setEmailPrefs(next);
    saveEmailPreferences(next);
  };

  const employeePayload = useCallback(
    (source, overrides = {}) => ({
      name: String(source?.name || "").trim(),
      email: String(source?.email || "").trim(),
      phone: String(source?.phone || "").trim(),
      avatar_url: source?.avatar_url || null,
      address: String(source?.address || "").trim(),
      birth_date: toDateInput(source?.birth_date) || null,
      gender: source?.gender || null,
      emergency_contact: String(source?.emergency_contact || "").trim(),
      emergency_phone: String(source?.emergency_phone || "").trim(),
      hire_date: toDateInput(profile?.hire_date) || null,
      status: profile?.status || "Đang làm việc",
      hourly_rate: profile?.hourly_rate,
      ...overrides,
    }),
    [profile],
  );

  const handleAvatarFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn đúng định dạng ảnh");
      return;
    }

    try {
      if (!profile?.employee_id) return;
      setSavingAvatar(true);
      setError("");
      setSuccess("");
      const imageData = await resizeImageFile(file);
      const res = await axios.put(
        `${API_URL}/employees/${profile.employee_id}`,
        employeePayload(profile, { avatar_url: imageData }),
        { headers: authHeaders() },
      );

      setProfile(res.data);
      setForm((prev) => ({
        ...prev,
        avatar_url: res.data?.avatar_url || imageData,
      }));
      setSuccess("Đã cập nhật ảnh hồ sơ");
      window.appPopup?.({
        type: "success",
        title: "Đã đổi ảnh hồ sơ",
        message: "Ảnh đại diện mới đã được lưu.",
      });
      setSavingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Không thể cập nhật ảnh hồ sơ";
      setError(message);
      window.appPopup?.({
        type: "error",
        title: "Không thể đổi ảnh",
        message,
      });
      setSavingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    if (emailChanged && !emailOtp.trim()) {
      notifyProfileError("Vui lòng nhập mã OTP đã gửi tới email cũ");
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
          emailOtp: emailChanged ? emailOtp.trim() : undefined,
        },
        { headers: authHeaders() },
      );
      setProfile(res.data);
      setProfileForm(res.data);
      setEmailOtp("");
      setEditing(false);
      window.appPopup?.({
        type: "success",
        title: "Đã lưu thông tin",
        message: "Hồ sơ cá nhân đã được cập nhật.",
      });
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

  const notifyProfileError = (message, title = "Cần kiểm tra lại") => {
    setError(message);
    window.appPopup?.({
      type: "warning",
      title,
      message,
    });
  };

  const changePassword = async () => {
    if (!passwordForm.currentPassword) {
      notifyProfileError("Vui lòng nhập mật khẩu cũ");
      return;
    }
    if (!passwordForm.password || passwordForm.password.length < 6) {
      notifyProfileError("Mật khẩu mới cần ít nhất 6 ký tự");
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      notifyProfileError("Mật khẩu xác nhận chưa khớp");
      return;
    }
    if (!passwordForm.otp.trim()) {
      notifyProfileError("Vui lòng nhập mã OTP đã gửi tới email");
      return;
    }

    try {
      setSavingPassword(true);
      setError("");
      setSuccess("");
      await axios.put(
        `${API_URL}/users/me/password`,
        {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.password,
          otp: passwordForm.otp.trim(),
        },
        { headers: authHeaders() },
      );
      setPasswordForm({
        currentPassword: "",
        password: "",
        confirmPassword: "",
        otp: "",
      });
      setSuccess("Đã đổi mật khẩu tài khoản");
      window.appPopup?.({
        type: "success",
        title: "Đã đổi mật khẩu",
        message: "Mật khẩu tài khoản đã được cập nhật.",
      });
      setShowPasswordDialog(false);
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Không thể đổi mật khẩu";
      setError(message);
      window.appPopup?.({
        type: "error",
        title: "Không thể đổi mật khẩu",
        message,
      });
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
    <>
      <div className="mx-auto min-h-screen max-w-7xl space-y-5 px-2 pb-8 sm:px-0">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5">
          <div className="relative bg-[linear-gradient(135deg,#052e2b_0%,#065f46_55%,#15803d_100%)] px-4 py-6 text-white sm:px-6 sm:py-8 lg:px-8">
            <div className="absolute inset-x-0 bottom-0 h-16 bg-white [clip-path:polygon(0_100%,100%_36%,100%_100%)]" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="relative h-28 w-28 shrink-0 sm:h-36 sm:w-36">
                  <img
                    src={form.avatar_url || defaultEmployeeAvatar}
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = defaultEmployeeAvatar;
                    }}
                    alt={form.name || "Ảnh hồ sơ"}
                    className="h-full w-full rounded-3xl border-4 border-white object-cover shadow-xl"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={savingAvatar}
                    className="absolute -bottom-2 -right-2 flex h-11 w-11 items-center justify-center rounded-xl !bg-gray-200 !text-black shadow-lg ring-1 ring-emerald-100 transition hover:scale-105 hover:!bg-emerald-50 disabled:cursor-wait disabled:opacity-70"
                    aria-label="Chọn ảnh hồ sơ"
                  >
                    {savingAvatar ? (
                      <ArrowPathIcon className="h-5 w-5 animate-spin" />
                    ) : (
                      <CameraIcon className="h-5 w-5" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleAvatarFile(event.target.files?.[0])
                    }
                    className="hidden"
                  />
                </div>

                <div className="min-w-0 pb-2">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusStyle}`}
                    >
                      {profile?.status || "Đang làm việc"}
                    </span>
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/25">
                      {profile?.username ||
                        account.username ||
                        "Tài khoản nhân viên"}
                    </span>
                  </div>
                  <h1 className="break-words text-3xl font-black tracking-normal sm:text-4xl">
                    {form.name || "Hồ sơ cá nhân"}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm font-medium text-white/80">
                    Quản lý thông tin cá nhân, ảnh đại diện và mật khẩu tài
                    khoản của bạn.
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
                <button
                  type="button"
                  onClick={() => setShowEmailPrefs(true)}
                  className="inline-flex h-11 items-center gap-2 rounded-xl !bg-yellow-500 px-4 text-sm font-bold !text-black shadow-sm transition hover:!bg-green-50"
                >
                  <EnvelopeIcon className="h-5 w-5" />
                  Email
                </button>
                {editing ? (
                  <>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition hover:brightness-95 disabled:opacity-60"
                      style={{
                        backgroundColor: "#ffffff",
                        borderColor: "#cbd5e1",
                        color: "#0f172a",
                      }}
                    >
                      <XMarkIcon className="h-5 w-5" />
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={saveProfile}
                      disabled={saving}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-green-800 transition hover:bg-green-50 disabled:opacity-60"
                    >
                      <CheckCircleIcon className="h-5 w-5" />
                      {saving ? "Đang lưu" : "Lưu hồ sơ"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex h-11 items-center gap-2 rounded-xl !bg-green-600 px-4 text-sm font-bold !text-white shadow-sm transition hover:!bg-green-700"
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
                      <h2 className="text-lg font-black text-slate-950">
                        Thông tin cá nhân
                      </h2>
                      <p className="text-sm font-medium text-slate-500">
                        Các thông tin này dùng cho hồ sơ nhân sự và liên hệ nội
                        bộ.
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
                        onChange={(event) =>
                          updateForm("name", event.target.value)
                        }
                      />
                      <TextInput
                        label="Số điện thoại"
                        icon={PhoneIcon}
                        value={form.phone}
                        onChange={(event) =>
                          updateForm("phone", event.target.value)
                        }
                      />
                      <div className="space-y-2">
                        <TextInput
                          label="Email"
                          icon={EnvelopeIcon}
                          type="email"
                          value={form.email}
                          onChange={(event) =>
                            updateForm("email", event.target.value)
                          }
                        />
                        {emailChanged && (
                          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                            <p className="text-xs font-semibold text-cyan-900">
                              Email đang được đổi. Vui lòng xác minh mã OTP gửi
                              tới email cũ.
                            </p>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                              <input
                                value={emailOtp}
                                onChange={(event) =>
                                  setEmailOtp(event.target.value)
                                }
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="Nhập OTP"
                                className="h-10 flex-1 rounded-lg border border-cyan-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                              />
                              <button
                                type="button"
                                onClick={() => requestEmailOtp("email_change")}
                                disabled={sendingEmailOtp}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 text-sm font-black text-white transition hover:bg-cyan-700 disabled:opacity-60"
                              >
                                {sendingEmailOtp ? (
                                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                ) : (
                                  <EnvelopeIcon className="h-4 w-4" />
                                )}
                                Gửi mã
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <TextInput
                        label="Ngày sinh"
                        icon={CalendarDaysIcon}
                        type="date"
                        value={form.birth_date}
                        onChange={(event) =>
                          updateForm("birth_date", event.target.value)
                        }
                      />
                      <SelectInput
                        label="Giới tính"
                        icon={UserCircleIcon}
                        value={form.gender}
                        onChange={(event) =>
                          updateForm("gender", event.target.value)
                        }
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
                          onChange={(event) =>
                            updateForm("address", event.target.value)
                          }
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
                      <h2 className="text-base font-black text-slate-950">
                        Tài khoản
                      </h2>
                      <p className="text-sm font-medium text-slate-500">
                        Thông tin đăng nhập
                      </p>
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
                      Mức lương chỉ do admin quản lý và không thể chỉnh sửa tại
                      trang hồ sơ.
                    </div>
                  </div>
                </div>

                <div className="hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                      <EnvelopeIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-slate-950">
                        Thông báo email
                      </h2>
                      <p className="text-sm font-medium text-slate-500">
                        Chọn những nội dung muốn nhận qua email.
                      </p>
                    </div>
                  </div>
                  {!profile?.email && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                      Cập nhật email để nhận thông báo.
                    </div>
                  )}
                  <div className="space-y-2">
                    {emailNotificationOptions.map((item) => (
                      <label
                        key={item.key}
                        className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <span className="text-sm font-bold text-slate-700">
                          {item.label}
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(emailPrefs[item.key])}
                          disabled={savingEmailPrefs || !profile?.email}
                          onChange={() => toggleEmailPref(item.key)}
                          className="h-5 w-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:opacity-50"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPasswordDialog(true)}
                  className="group flex w-full items-center justify-between rounded-2xl border border-green-200 bg-green-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100/70"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm">
                      <LockClosedIcon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-black text-green-500">
                        Đổi mật khẩu
                      </span>
                      <span className="mt-0.5 block text-xs font-semibold text-green-700">
                        Mở cửa sổ bảo mật
                      </span>
                    </span>
                  </span>
                  <KeyIcon className="h-5 w-5 text-green-700 transition group-hover:translate-x-0.5" />
                </button>

                <div
                  className="hidden rounded-2xl border p-5 text-white shadow-sm"
                  style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-950"
                      style={{ backgroundColor: "#67e8f9" }}
                    >
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
                        Mật khẩu cũ
                      </span>
                      <input
                        type="password"
                        name="profile_old_password_no_autofill"
                        value={passwordForm.currentPassword}
                        onChange={(event) =>
                          setPasswordForm((prev) => ({
                            ...prev,
                            currentPassword: event.target.value,
                          }))
                        }
                        autoComplete="new-password"
                        className="h-11 w-full rounded-lg border px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-400 focus:ring-4"
                        style={{
                          backgroundColor: "rgba(255,255,255,0.1)",
                          borderColor: "rgba(255,255,255,0.16)",
                          "--tw-ring-color": "rgba(103,232,249,0.22)",
                        }}
                        placeholder="Nhập mật khẩu hiện tại"
                      />
                    </label>
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
                        autoComplete="new-password"
                        className="h-11 w-full rounded-lg border px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-400 focus:ring-4"
                        style={{
                          backgroundColor: "rgba(255,255,255,0.1)",
                          borderColor: "rgba(255,255,255,0.16)",
                          "--tw-ring-color": "rgba(103,232,249,0.22)",
                        }}
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
                        autoComplete="new-password"
                        className="h-11 w-full rounded-lg border px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-400 focus:ring-4"
                        style={{
                          backgroundColor: "rgba(255,255,255,0.1)",
                          borderColor: "rgba(255,255,255,0.16)",
                          "--tw-ring-color": "rgba(103,232,249,0.22)",
                        }}
                        placeholder="Nhập lại mật khẩu"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                        <EnvelopeIcon className="h-4 w-4" />
                        OTP email
                      </span>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={passwordForm.otp}
                          onChange={(event) =>
                            setPasswordForm((prev) => ({
                              ...prev,
                              otp: event.target.value,
                            }))
                          }
                          inputMode="numeric"
                          maxLength={6}
                          autoComplete="one-time-code"
                          className="h-11 flex-1 rounded-lg border px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-400 focus:ring-4"
                          style={{
                            backgroundColor: "rgba(255,255,255,0.1)",
                            borderColor: "rgba(255,255,255,0.16)",
                            "--tw-ring-color": "rgba(103,232,249,0.22)",
                          }}
                          placeholder="Nhập mã OTP"
                        />
                        <button
                          type="button"
                          onClick={() => requestEmailOtp("password_change")}
                          disabled={sendingPasswordOtp}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15 disabled:opacity-60"
                        >
                          {sendingPasswordOtp ? (
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            <EnvelopeIcon className="h-4 w-4" />
                          )}
                          Gửi mã
                        </button>
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={changePassword}
                      disabled={savingPassword}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-black text-slate-950 transition hover:brightness-105 disabled:opacity-60"
                      style={{ backgroundColor: "#67e8f9" }}
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
      {showEmailPrefs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg animate-[profileModalIn_180ms_ease-out] overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <EnvelopeIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-950">
                    Thông báo email
                  </h2>
                  <p className="text-sm font-medium text-slate-500">
                    Chọn nội dung muốn nhận qua email.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailPrefs(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Đóng thiết lập email"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {!profile?.email && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  Cập nhật email để nhận thông báo.
                </div>
              )}
              <div className="space-y-2">
                {emailNotificationOptions.map((item) => (
                  <label
                    key={item.key}
                    className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                  >
                    <span className="text-sm font-bold text-slate-700">
                      {item.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(emailPrefs[item.key])}
                      disabled={savingEmailPrefs || !profile?.email}
                      onChange={() => toggleEmailPref(item.key)}
                      className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {showPasswordDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-0 py-0 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
          <div className="w-full animate-[profileModalIn_180ms_ease-out] overflow-hidden rounded-t-2xl border border-white/70 bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <LockClosedIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-950">
                    Đổi mật khẩu
                  </h2>
                  <p className="text-sm font-medium text-slate-500">
                    Xác minh email để bảo vệ tài khoản.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordDialog(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Đóng đổi mật khẩu"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Mật khẩu hiện tại
                </span>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      currentPassword: event.target.value,
                    }))
                  }
                  autoComplete="current-password"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
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
                    autoComplete="new-password"
                    placeholder="Tối thiểu 6 ký tự"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
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
                    autoComplete="new-password"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Mã OTP email
                </span>
                <div className="flex gap-2">
                  <input
                    value={passwordForm.otp}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        otp: event.target.value,
                      }))
                    }
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder="Nhập mã gồm 6 số"
                    className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
                  />
                  <button
                    type="button"
                    onClick={() => requestEmailOtp("password_change")}
                    disabled={sendingPasswordOtp}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                  >
                    {sendingPasswordOtp ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <EnvelopeIcon className="h-4 w-4" />
                    )}
                    Gửi mã
                  </button>
                </div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowPasswordDialog(false)}
                className="h-11 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={changePassword}
                disabled={savingPassword}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <LockClosedIcon className="h-4 w-4" />
                {savingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
