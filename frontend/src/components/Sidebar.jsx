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
} from "@heroicons/react/24/outline";
import { API_URL } from "../services/api";
import { getRole, getUser, logout } from "../utils/auth";

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
  const initial = String(name).trim().charAt(0).toUpperCase() || "Q";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-11 w-11 rounded-full border border-gray-200 object-cover"
      />
    );
  }

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
      {initial}
    </div>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const [open, setOpen] = React.useState(0);
  const [count, setCount] = React.useState(0);
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
          <UserAvatar user={user} profile={profile} />
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
    </Card>
  );
}
