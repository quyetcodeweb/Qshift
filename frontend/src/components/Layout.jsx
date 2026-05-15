import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="flex w-screen h-screen overflow-hidden">
      <Sidebar role="ADMIN" />

      <div className="flex-1 bg-blue-50 p-6 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
