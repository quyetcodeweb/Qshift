import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Card,
  Typography,
  List,
  ListItem,
  ListItemPrefix,
  Accordion,
  AccordionHeader,
  AccordionBody,
  Input,
  Button,
} from "@material-tailwind/react";

import {
  PresentationChartBarIcon,
  UserCircleIcon,
  CalendarDaysIcon,
  ClockIcon,
  CurrencyDollarIcon,
  UsersIcon,
  BellIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/solid";
import axios from "axios";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import { getRole, logout } from "../utils/auth";

export default function Sidebar() {
  const location = useLocation();
  const [open, setOpen] = React.useState(0);
  const role = getRole();
  const [count, setCount] = React.useState(0);
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
  const isPayrollTab = (tab) =>
    location.pathname === "/payroll" &&
    new URLSearchParams(location.search).get("tab") === tab;

  const handleOpen = (value) => {
    setOpen(open === value ? 0 : value);
  };
  async function fetchNoti() {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      const userId = user?.user_id;

      if (!userId) {
        console.warn("No user_id found");
        return;
      }

      const res = await axios.get("http://localhost:5000/api/notifications", {
        headers: {
          "user-id": userId,
        },
      });

      const unread = res.data.filter((n) => !n.is_read).length;
      setCount(unread);
    } catch (err) {
      console.error(
        "Lỗi Sidebar notifications:",
        err.response?.data || err.message,
      );
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
      try {
        setAvailabilityAccess(
          JSON.parse(localStorage.getItem("availabilityFillRequest")),
        );
      } catch {
        setAvailabilityAccess(null);
      }
    };

    window.addEventListener(
      "availability-access-changed",
      refreshAvailabilityAccess,
    );
    window.addEventListener("storage", refreshAvailabilityAccess);

    return () => {
      window.removeEventListener(
        "availability-access-changed",
        refreshAvailabilityAccess,
      );
      window.removeEventListener("storage", refreshAvailabilityAccess);
    };
  }, []);
  const baseItem =
    "py-2 px-1 text-sm font-medium transition-all duration-200 flex items-center gap-1";
  const hoverItem = "hover:bg-gray-100";
  const activeItem = "text-blue-600 bg-blue-50 border-l-4 border-blue-500";

  return (
    <Card className="h-screen w-64 min-w-[256px] max-w-[256px] flex flex-col justify-between p-4 shadow-xl">
      <div>
        <div className="flex items-center justify-between mb-6 px-2">
          <Typography variant="h5" className="font-bold text-gray-800">
            QShift
          </Typography>

          <Link to="/notifications">
            <div className="relative cursor-pointer">
              <BellIcon className="h-6 w-6 text-gray-600" />

              {count > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                  {count}
                </span>
              )}
            </div>
          </Link>
        </div>
        {/* Search */}
        <div className="mb-4">
          <Input
            icon={<MagnifyingGlassIcon className="h-4 w-4" />}
            label="Search"
            className="text-sm"
          />
        </div>

        <List className="text-sm text-gray-700">
          {/* Dashboard */}
          <Link to="/" className="no-underline block">
            <ListItem
              className={`${baseItem} ${hoverItem} ${
                isActive("/") ? activeItem : ""
              }`}
            >
              <ListItemPrefix className="min-w-[24px]">
                <PresentationChartBarIcon className="h-5 w-5" />
              </ListItemPrefix>
              Tổng quan
            </ListItem>
          </Link>

          {/* ADMIN */}
          {role === "ADMIN" && (
            <Accordion open={open === 1}>
              <ListItem className="p-0">
                <AccordionHeader
                  onClick={() => handleOpen(1)}
                  className={`${baseItem} ${hoverItem} border-0 shadow-none`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <ListItemPrefix className="min-w-[24px]">
                      <UsersIcon className="h-5 w-5" />
                    </ListItemPrefix>
                    <span>Quản lý nhân viên</span>
                  </div>

                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform ${
                      open === 1 ? "rotate-180" : ""
                    }`}
                  />
                </AccordionHeader>
              </ListItem>

              <AccordionBody className="py-1">
                <List>
                  <Link to="/userPage" className="no-underline block">
                    <ListItem
                      className={`${baseItem} ${hoverItem} pl-10 ${
                        isActive("/userPage") ? activeItem : ""
                      }`}
                    >
                      <ChevronRightIcon className="h-3 w-3 opacity-70" />
                      Tài khoản
                    </ListItem>
                  </Link>

                  <Link to="/employeePage" className="no-underline block">
                    <ListItem
                      className={`${baseItem} ${hoverItem} pl-10 ${
                        isActive("/employeePage") ? activeItem : ""
                      }`}
                    >
                      <ChevronRightIcon className="h-3 w-3 opacity-70" />
                      Nhân viên
                    </ListItem>
                  </Link>

                  <Link to="/employeeRoles" className="no-underline block">
                    <ListItem
                      className={`${baseItem} ${hoverItem} pl-10 ${
                        isActive("/employeeRoles") ? activeItem : ""
                      }`}
                    >
                      <ChevronRightIcon className="h-3 w-3 opacity-70" />
                      Vai trò nhân viên
                    </ListItem>
                  </Link>
                </List>
              </AccordionBody>
            </Accordion>
          )}

          {/* Lịch làm việc */}
          <Accordion open={open === 2}>
            <ListItem className="p-0">
              <AccordionHeader
                onClick={() => handleOpen(2)}
                className={`${baseItem} ${hoverItem} border-0 shadow-none`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <ListItemPrefix className="min-w-[24px]">
                    <CalendarDaysIcon className="h-5 w-5" />
                  </ListItemPrefix>
                  <span>Lịch làm việc</span>
                </div>

                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform ${
                    open === 2 ? "rotate-180" : ""
                  }`}
                />
              </AccordionHeader>
            </ListItem>

            <AccordionBody className="py-1">
              <List>
                <Link to="/shifts" className="no-underline block">
                  <ListItem
                    className={`${baseItem} ${hoverItem} pl-10 ${
                      isActive("/shifts") ? activeItem : ""
                    }`}
                  >
                    <ChevronRightIcon className="h-3 w-3 opacity-70" />
                    Lịch làm chung
                  </ListItem>
                </Link>

                {role === "ADMIN" && (
                  <Link to="/createSchedule" className="no-underline block">
                    <ListItem
                      className={`${baseItem} ${hoverItem} pl-10 ${
                        isActive("/createSchedule") ? activeItem : ""
                      }`}
                    >
                      <ChevronRightIcon className="h-3 w-3 opacity-70" />
                      Tạo lịch làm
                    </ListItem>
                  </Link>
                )}

                {role === "ADMIN" && (
                  <Link to="/shiftManagement" className="no-underline block">
                    <ListItem
                      className={`${baseItem} ${hoverItem} pl-10 ${
                        isActive("/shiftManagement") ? activeItem : ""
                      }`}
                    >
                      <ChevronRightIcon className="h-3 w-3 opacity-70" />
                      Quản lý ca
                    </ListItem>
                  </Link>
                )}
                {role === "ADMIN" && (
                  <Link to="/shiftSwaps" className="no-underline block">
                    <ListItem
                      className={`${baseItem} ${hoverItem} pl-10 ${
                        isActive("/shiftSwaps") ? activeItem : ""
                      }`}
                    >
                      <ChevronRightIcon className="h-3 w-3 opacity-70" />
                      Quản lý đổi ca
                    </ListItem>
                  </Link>
                )}
                {showAvailabilityLink && (
                  <Link to="/availabilityPage" className="no-underline block">
                  <ListItem
                    className={`${baseItem} ${hoverItem} pl-10 ${
                      isActive("/availabilityPage") ? activeItem : ""
                    }`}
                  >
                    <ChevronRightIcon className="h-3 w-3 opacity-70" />
                    Thời gian rảnh
                  </ListItem>
                  </Link>
                )}
              </List>
            </AccordionBody>
          </Accordion>

          {/* Chấm công */}
          <Accordion open={open === 3}>
            <ListItem className="p-0">
              <AccordionHeader
                onClick={() => handleOpen(3)}
                className={`${baseItem} ${hoverItem} border-0 shadow-none`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <ListItemPrefix className="min-w-[24px]">
                    <ClockIcon className="h-5 w-5" />
                  </ListItemPrefix>
                  <span>Chấm công</span>
                </div>

                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform ${
                    open === 3 ? "rotate-180" : ""
                  }`}
                />
              </AccordionHeader>
            </ListItem>

            <AccordionBody className="py-1">
              <List>
                <Link to="/attendance" className="no-underline block">
                  <ListItem
                    className={`${baseItem} ${hoverItem} pl-10 ${
                      isActive("/attendance") ? activeItem : ""
                    }`}
                  >
                    Chấm công
                  </ListItem>
                </Link>

                <Link to="/attendance/history" className="no-underline block">
                  <ListItem
                    className={`${baseItem} ${hoverItem} pl-10 ${
                      isActive("/attendance/history") ? activeItem : ""
                    }`}
                  >
                    Lịch sử
                  </ListItem>
                </Link>
              </List>
            </AccordionBody>
          </Accordion>

          {/* Lương */}
          {role === "ADMIN" ? (
            <Accordion open={open === 4}>
              <ListItem className="p-0">
                <AccordionHeader
                  onClick={() => handleOpen(4)}
                  className={`${baseItem} ${hoverItem} border-0 shadow-none`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <ListItemPrefix className="min-w-[24px]">
                      <CurrencyDollarIcon className="h-5 w-5" />
                    </ListItemPrefix>
                    <span>Lương</span>
                  </div>

                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform ${
                      open === 4 ? "rotate-180" : ""
                    }`}
                  />
                </AccordionHeader>
              </ListItem>

              <AccordionBody className="py-1">
                <List>
                  <Link to="/payroll?tab=salary" className="no-underline block">
                    <ListItem
                      className={`${baseItem} ${hoverItem} pl-10 ${
                        isPayrollTab("salary") ||
                        (isActive("/payroll") && !location.search)
                          ? activeItem
                          : ""
                      }`}
                    >
                      Tính lương
                    </ListItem>
                  </Link>
                  <Link to="/payroll?tab=stats" className="no-underline block">
                    <ListItem
                      className={`${baseItem} ${hoverItem} pl-10 ${
                        isPayrollTab("stats") ? activeItem : ""
                      }`}
                    >
                      Thống kê
                    </ListItem>
                  </Link>
                </List>
              </AccordionBody>
            </Accordion>
          ) : (
            <Link to="/payroll" className="no-underline block">
              <ListItem
                className={`${baseItem} ${hoverItem} ${
                  isActive("/payroll") ? activeItem : ""
                }`}
              >
                <ListItemPrefix className="min-w-[24px]">
                  <CurrencyDollarIcon className="h-5 w-5" />
                </ListItemPrefix>
                Lương
              </ListItem>
            </Link>
          )}

          {/* Profile */}
          <Link to="/profile" className="no-underline block">
            <ListItem
              className={`${baseItem} ${hoverItem} ${
                isActive("/profile") ? activeItem : ""
              }`}
            >
              <ListItemPrefix className="min-w-[24px]">
                <UserCircleIcon className="h-5 w-5" />
              </ListItemPrefix>
              Hồ sơ
            </ListItem>
          </Link>
        </List>
      </div>

      {/* Logout */}
      <Button
        color="red"
        variant="outlined"
        className="flex items-center justify-center gap-2 text-sm font-medium hover:bg-red-50 transition"
        onClick={logout}
      >
        <ArrowLeftOnRectangleIcon className="h-5 w-5" />
        Logout
      </Button>
    </Card>
  );
}
