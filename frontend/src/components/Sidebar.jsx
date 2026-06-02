import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Accordion,
  AccordionBody,
  AccordionHeader,
  Button,
  Card,
  List,
  ListItem,
  ListItemPrefix,
  Typography,
} from "@material-tailwind/react";
import axios from "axios";
import {
  ArrowLeftOnRectangleIcon,
  BellIcon,
  CalendarDaysIcon,
  ClockIcon,
  CurrencyDollarIcon,
  PresentationChartBarIcon,
  UserCircleIcon,
  UsersIcon,
} from "@heroicons/react/24/solid";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  KeyIcon,
  LockClosedIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { API_URL } from "../services/api";
import { getRole, getUser, logout } from "../utils/auth";
import defaultEmployeeAvatar from "../assets/default-employee-avatar.svg";

function roleLabel(role) {
  return role === "ADMIN" ? "Admin" : "Nhân viên";
}

function getStoredUser() {
  try {
    return getUser() || {};
  } catch {
    return {};
  }
}

function readAvailabilityAccess() {
  try {
    const access = JSON.parse(localStorage.getItem("availabilityFillRequest"));
    if (access?.expiresAt && Date.now() > Number(access.expiresAt)) {
      localStorage.removeItem("availabilityFillRequest");
      return null;
    }
    return access;
  } catch {
    return null;
  }
}

function UserAvatar({ user, profile }) {
  const name = profile?.name || user?.employee_name || user?.username || "Q";
  const avatarUrl = profile?.avatar_url || user?.avatar_url;

  return (
    <img
      src={avatarUrl || defaultEmployeeAvatar}
      alt={name}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = defaultEmployeeAvatar;
      }}
      className="h-11 w-11 rounded-full border border-gray-200 object-cover"
    />
  );
}

function AdminPasswordDialog({ open, onClose }) {
  const [form, setForm] = React.useState({
    currentPassword: "",
    password: "",
    confirmPassword: "",
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({ currentPassword: "", password: "", confirmPassword: "" });
  }, [open]);

  if (!open) return null;

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const notifyWarning = (message) => {
    window.appPopup?.({
      type: "warning",
      title: "Cần kiểm tra lại",
      message,
    });
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.currentPassword) {
      notifyWarning("Vui lòng nhập mật khẩu hiện tại");
      return;
    }
    if (!form.password || form.password.length < 6) {
      notifyWarning("Mật khẩu mới cần ít nhất 6 ký tự");
      return;
    }
    if (form.password !== form.confirmPassword) {
      notifyWarning("Mật khẩu xác nhận chưa khớp");
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem("token");
      await axios.put(
        `${API_URL}/users/me/password`,
        {
          currentPassword: form.currentPassword,
          newPassword: form.password,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      window.appPopup?.({
        type: "success",
        title: "Đã đổi mật khẩu",
        message: "Mật khẩu admin đã được cập nhật.",
      });
      onClose();
    } catch (err) {
      window.appPopup?.({
        type: "error",
        title: "Không thể đổi mật khẩu",
        message:
          err.response?.data?.message ||
          err.response?.data?.error ||
          "Vui lòng thử lại.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-gray-950/35 p-3 backdrop-blur-sm sm:items-center">
      <form
        onSubmit={submit}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
      >
        <div className="flex items-start gap-3 px-4 pb-4 pt-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <LockClosedIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-gray-950">Đổi mật khẩu admin</h2>
            <p className="mt-1 text-sm font-medium text-gray-500">
              Cập nhật mật khẩu đăng nhập của tài khoản hiện tại.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Đóng"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-4 pb-4">
          {[
            ["currentPassword", "Mật khẩu hiện tại", "password"],
            ["password", "Mật khẩu mới", "password"],
            ["confirmPassword", "Xác nhận mật khẩu", "password"],
          ].map(([field, label, type]) => (
            <label key={field} className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
                {label}
              </span>
              <input
                type={type}
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
                autoComplete="new-password"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </label>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            <KeyIcon className="h-4 w-4" />
            {saving ? "Đang đổi" : "Đổi mật khẩu"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const [open, setOpen] = React.useState(0);
  const [count, setCount] = React.useState(0);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const role = getRole();
  const user = getStoredUser();
  const [profile, setProfile] = React.useState(null);
  const [availabilityAccess, setAvailabilityAccess] = React.useState(() => readAvailabilityAccess());

  const isActive = (path) => location.pathname === path;
  const showAvailabilityLink =
    role === "ADMIN" ||
    Boolean(availabilityAccess?.month && availabilityAccess?.year);
  const handleOpen = (value) => setOpen((current) => (current === value ? 0 : value));

  async function fetchNoti() {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      const userId = user?.user_id;
      if (!userId) return;

      const res = await axios.get(`${API_URL}/notifications`, {
        headers: { "user-id": userId },
      });
      setCount((res.data || []).filter((item) => !item.is_read).length);
    } catch (err) {
      console.error("Sidebar notifications:", err.response?.data || err.message);
    }
  }

  React.useEffect(() => {
    fetchNoti();
    const intervalId = window.setInterval(fetchNoti, 15000);
    window.addEventListener("notification-count-changed", fetchNoti);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("notification-count-changed", fetchNoti);
    };
  }, []);

  React.useEffect(() => {
    const refreshAvailabilityAccess = () => {
      setAvailabilityAccess(readAvailabilityAccess());
    };

    const intervalId = window.setInterval(refreshAvailabilityAccess, 60000);
    window.addEventListener("availability-access-changed", refreshAvailabilityAccess);
    window.addEventListener("storage", refreshAvailabilityAccess);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("availability-access-changed", refreshAvailabilityAccess);
      window.removeEventListener("storage", refreshAvailabilityAccess);
    };
  }, []);

  React.useEffect(() => {
    if (role !== "EMPLOYEE") return;

    const token = localStorage.getItem("token");
    if (!token) return;

    axios
      .get(`${API_URL}/employees/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setProfile(res.data || null))
      .catch(() => setProfile(null));
  }, [role]);

  const baseItem =
    "py-2 px-1 text-sm font-medium transition-all duration-200 flex items-center gap-1";
  const hoverItem = "hover:bg-gray-100";
  const activeItem = "text-blue-600 bg-blue-50 border-l-4 border-blue-500";
  const displayName = profile?.name || user?.employee_name || user?.username || "QShift user";

  return (
    <Card className="flex h-screen w-64 min-w-[256px] max-w-[256px] flex-col justify-between p-4 shadow-xl">
      <div>
        <div className="mb-6 flex items-center justify-between px-2">
          <Typography variant="h5" className="font-bold text-gray-800">
            QShift
          </Typography>

          <Link to="/notifications">
            <div className="relative cursor-pointer">
              <BellIcon className="h-6 w-6 text-gray-600" />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                  {count}
                </span>
              )}
            </div>
          </Link>
        </div>

        <div className="mb-5 flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="relative shrink-0">
            <UserAvatar user={user} profile={profile} />
            {role === "ADMIN" && (
              <button
                type="button"
                onClick={() => setPasswordOpen(true)}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-blue-600 text-white shadow-md transition hover:bg-blue-700"
                title="Đổi mật khẩu admin"
                aria-label="Đổi mật khẩu admin"
              >
                <KeyIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900">{displayName}</p>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
              {roleLabel(role)}
            </p>
          </div>
        </div>

        <List className="text-sm text-gray-700">
          <Link to="/" className="block no-underline">
            <ListItem className={`${baseItem} ${hoverItem} ${isActive("/") ? activeItem : ""}`}>
              <ListItemPrefix className="min-w-[24px]">
                <PresentationChartBarIcon className="h-5 w-5" />
              </ListItemPrefix>
              Tổng quan
            </ListItem>
          </Link>

          {role === "ADMIN" && (
            <Link to="/employeePage" className="block no-underline">
              <ListItem
                className={`${baseItem} ${hoverItem} ${
                  isActive("/employeePage") ||
                  isActive("/userPage") ||
                  isActive("/employeeRoles")
                    ? activeItem
                    : ""
                }`}
              >
                <ListItemPrefix className="min-w-[24px]">
                  <UsersIcon className="h-5 w-5" />
                </ListItemPrefix>
                Quản lý nhân viên
              </ListItem>
            </Link>
          )}

          <Accordion open={open === 2}>
            <ListItem className="p-0">
              <AccordionHeader
                onClick={() => handleOpen(2)}
                className={`${baseItem} ${hoverItem} border-0 shadow-none`}
              >
                <div className="flex flex-1 items-center gap-3">
                  <ListItemPrefix className="min-w-[24px]">
                    <CalendarDaysIcon className="h-5 w-5" />
                  </ListItemPrefix>
                  <span>Lịch làm việc</span>
                </div>
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${open === 2 ? "rotate-180" : ""}`} />
              </AccordionHeader>
            </ListItem>

            <AccordionBody className="py-1">
              <List>
                <Link to="/shifts" className="block no-underline">
                  <ListItem className={`${baseItem} ${hoverItem} pl-10 ${isActive("/shifts") ? activeItem : ""}`}>
                    <ChevronRightIcon className="h-3 w-3 opacity-70" />
                    Lịch làm chung
                  </ListItem>
                </Link>

                {role === "ADMIN" && (
                  <Link to="/createSchedule" className="block no-underline">
                    <ListItem className={`${baseItem} ${hoverItem} pl-10 ${isActive("/createSchedule") ? activeItem : ""}`}>
                      <ChevronRightIcon className="h-3 w-3 opacity-70" />
                      Tạo lịch làm
                    </ListItem>
                  </Link>
                )}

                {role === "ADMIN" && (
                  <Link to="/shiftSwaps" className="block no-underline">
                    <ListItem className={`${baseItem} ${hoverItem} pl-10 ${isActive("/shiftSwaps") ? activeItem : ""}`}>
                      <ChevronRightIcon className="h-3 w-3 opacity-70" />
                      Quản lý yêu cầu
                    </ListItem>
                  </Link>
                )}

                {showAvailabilityLink && (
                  <Link to="/availabilityPage" className="block no-underline">
                    <ListItem className={`${baseItem} ${hoverItem} pl-10 ${isActive("/availabilityPage") ? activeItem : ""}`}>
                      <ChevronRightIcon className="h-3 w-3 opacity-70" />
                      Thời gian rảnh
                    </ListItem>
                  </Link>
                )}
              </List>
            </AccordionBody>
          </Accordion>

          <Accordion open={open === 3}>
            <ListItem className="p-0">
              <AccordionHeader
                onClick={() => handleOpen(3)}
                className={`${baseItem} ${hoverItem} border-0 shadow-none`}
              >
                <div className="flex flex-1 items-center gap-3">
                  <ListItemPrefix className="min-w-[24px]">
                    <ClockIcon className="h-5 w-5" />
                  </ListItemPrefix>
                  <span>Chấm công</span>
                </div>
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${open === 3 ? "rotate-180" : ""}`} />
              </AccordionHeader>
            </ListItem>

            <AccordionBody className="py-1">
              <List>
                <Link to="/attendance" className="block no-underline">
                  <ListItem className={`${baseItem} ${hoverItem} pl-10 ${isActive("/attendance") ? activeItem : ""}`}>
                    Chấm công
                  </ListItem>
                </Link>
                <Link to="/attendance/history" className="block no-underline">
                  <ListItem className={`${baseItem} ${hoverItem} pl-10 ${isActive("/attendance/history") ? activeItem : ""}`}>
                    Lịch sử
                  </ListItem>
                </Link>
              </List>
            </AccordionBody>
          </Accordion>

          {role === "ADMIN" ? (
            <Link to="/payroll?tab=salary" className="block no-underline">
              <ListItem className={`${baseItem} ${hoverItem} ${isActive("/payroll") ? activeItem : ""}`}>
                <ListItemPrefix className="min-w-[24px]">
                  <CurrencyDollarIcon className="h-5 w-5" />
                </ListItemPrefix>
                Tính lương
              </ListItem>
            </Link>
          ) : (
            <Link to="/payroll" className="block no-underline">
              <ListItem className={`${baseItem} ${hoverItem} ${isActive("/payroll") ? activeItem : ""}`}>
                <ListItemPrefix className="min-w-[24px]">
                  <CurrencyDollarIcon className="h-5 w-5" />
                </ListItemPrefix>
                Lương
              </ListItem>
            </Link>
          )}

          {role === "EMPLOYEE" && (
          <Link to="/profile" className="block no-underline">
            <ListItem className={`${baseItem} ${hoverItem} ${isActive("/profile") ? activeItem : ""}`}>
              <ListItemPrefix className="min-w-[24px]">
                <UserCircleIcon className="h-5 w-5" />
              </ListItemPrefix>
              Hồ sơ
            </ListItem>
          </Link>
          )}

          {role === "ADMIN" && (
            <Link to="/statistics" className="block no-underline">
              <ListItem className={`${baseItem} ${hoverItem} ${isActive("/statistics") ? activeItem : ""}`}>
                <ListItemPrefix className="min-w-[24px]">
                  <PresentationChartBarIcon className="h-5 w-5" />
                </ListItemPrefix>
                Thống kê vận hành
              </ListItem>
            </Link>
          )}
        </List>
      </div>

      <Button
        color="red"
        variant="outlined"
        className="flex items-center justify-center gap-2 text-sm font-medium transition hover:bg-red-50"
        onClick={logout}
      >
        <ArrowLeftOnRectangleIcon className="h-5 w-5" />
        Logout
      </Button>

      <AdminPasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />
    </Card>
  );
}
