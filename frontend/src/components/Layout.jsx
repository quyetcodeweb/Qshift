import Sidebar from "./Sidebar";
import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  BellIcon,
  CalendarDaysIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ArrowLeftOnRectangleIcon,
  HomeIcon,
  UserCircleIcon,
  UsersIcon,
} from "@heroicons/react/24/solid";
import { ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { getRole, logout } from "../utils/auth";

function MobileNavItem({ to, icon, label, active }) {
  return (
    <Link
      to={to}
      className={`flex min-w-[72px] flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-semibold ${
        active ? "bg-blue-50 text-blue-700" : "text-gray-500"
      }`}
    >
      {React.createElement(icon, { className: "h-5 w-5 shrink-0" })}
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

function MobileChrome() {
  const role = getRole();
  const location = useLocation();
  const [availabilityAccess, setAvailabilityAccess] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("availabilityFillRequest"));
    } catch {
      return null;
    }
  });
  const isActive = (path) => location.pathname === path;
  const showAvailabilityLink =
    role === "ADMIN" ||
    Boolean(availabilityAccess?.month && availabilityAccess?.year);

  React.useEffect(() => {
    const refreshAvailabilityAccess = () => {
      try {
        setAvailabilityAccess(JSON.parse(localStorage.getItem("availabilityFillRequest")));
      } catch {
        setAvailabilityAccess(null);
      }
    };

    window.addEventListener("availability-access-changed", refreshAvailabilityAccess);
    window.addEventListener("storage", refreshAvailabilityAccess);

    return () => {
      window.removeEventListener("availability-access-changed", refreshAvailabilityAccess);
      window.removeEventListener("storage", refreshAvailabilityAccess);
    };
  }, []);

  const employeeItems = [
    { to: "/", label: "Tổng quan", icon: HomeIcon },
    { to: "/shifts", label: "Lịch", icon: CalendarDaysIcon },
    ...(showAvailabilityLink
      ? [{ to: "/availabilityPage", label: "Rảnh", icon: ClipboardDocumentListIcon }]
      : []),
    { to: "/attendance", label: "Chấm công", icon: ClockIcon },
    { to: "/payroll", label: "Lương", icon: CurrencyDollarIcon },
    { to: "/profile", label: "Hồ sơ", icon: UserCircleIcon },
  ];
  const adminItems = [
    { to: "/", label: "Tổng quan", icon: HomeIcon },
    { to: "/employeePage", label: "Nhân sự", icon: UsersIcon },
    { to: "/shifts", label: "Lịch", icon: CalendarDaysIcon },
    { to: "/createSchedule", label: "Tạo lịch", icon: ClipboardDocumentListIcon },
    { to: "/availabilityPage", label: "Rảnh", icon: CalendarDaysIcon },
    { to: "/attendance", label: "Công", icon: ClockIcon },
    { to: "/profile", label: "Hồ sơ", icon: UserCircleIcon },
  ];
  const items = role === "ADMIN" ? adminItems : employeeItems;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:hidden">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-lg font-bold text-gray-900">
            QShift
          </Link>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {role === "ADMIN" ? "Admin" : "Nhân viên"}
            </span>
            <Link to="/notifications" aria-label="Thông báo">
              <BellIcon className="h-6 w-6 text-gray-700" />
            </Link>
            <button
              type="button"
              onClick={logout}
              aria-label="Đăng xuất"
              className="rounded-full border border-gray-200 p-2 text-gray-700 shadow-sm"
            >
              <ArrowLeftOnRectangleIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-gray-200 bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] md:hidden">
        {items.map((item) => (
          <MobileNavItem
            key={item.to}
            {...item}
            active={isActive(item.to) || (item.to === "/" && location.pathname === "/")}
          />
        ))}
      </nav>
    </>
  );
}

export default function Layout() {
  return (
    <div className="min-h-dvh bg-slate-50 md:flex md:h-screen md:overflow-hidden">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <MobileChrome />

      <main className="min-w-0 flex-1 overflow-x-hidden bg-slate-50 px-3 pb-24 pt-3 sm:px-4 md:overflow-auto md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
