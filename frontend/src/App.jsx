import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import EmployeePage from "./pages/EmployeePage";
import ShiftsCalendar from "./pages/ShiftsCalendar";
import ShiftManagement from "./pages/ShiftManagement";
import UserPage from "./pages/UserPage";
import ProtectedRoute from "./components/ProtectedRoute";
import AvailabilityPage from "./pages/AvailabilityPage";
import NotificationPage from "./pages/NotificationPage";
import EmployeeRolesPage from "./pages/EmployeeRolesPage";
import CreateSchedule from "./pages/CreateSchedule";
import AttendancePage from "./pages/AttendancePage";
import AttendanceHistoryPage from "./pages/AttendanceHistoryPage";
import ProfilePage from "./pages/ProfilePage";
import PayrollPage from "./pages/PayrollPage";
import ShiftSwapManagementPage from "./pages/ShiftSwapManagementPage";
import { isLoggedIn } from "./utils/auth";

function App() {
  return (
    <Routes>
      {/* 🔥 Nếu chưa login → luôn về login */}
      <Route
        path="/login"
        element={isLoggedIn() ? <Navigate to="/" /> : <Login />}
      />

      {/* 🔥 Protected */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />

        {/* ADMIN ONLY */}
        <Route
          path="employeePage"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <EmployeePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="employeeRoles"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <EmployeeRolesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="userPage"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <UserPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="shiftManagement"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <ShiftManagement />
            </ProtectedRoute>
          }
        />

        <Route
          path="shiftSwaps"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <ShiftSwapManagementPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="availabilityPage"
          element={
            <ProtectedRoute roles={["ADMIN", "EMPLOYEE"]}>
              <AvailabilityPage />
            </ProtectedRoute>
          }
        />

        {/* BOTH */}
        <Route path="shifts" element={<ShiftsCalendar />} />
        <Route
          path="createSchedule"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <CreateSchedule />
            </ProtectedRoute>
          }
        />
        <Route
          path="attendance"
          element={
            <ProtectedRoute roles={["ADMIN", "EMPLOYEE"]}>
              <AttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="attendance/history"
          element={
            <ProtectedRoute roles={["ADMIN", "EMPLOYEE"]}>
              <AttendanceHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile"
          element={
            <ProtectedRoute roles={["ADMIN", "EMPLOYEE"]}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="notifications" element={<NotificationPage />} />

        {/* ADMIN */}
        <Route
          path="payroll"
          element={
            <ProtectedRoute roles={["ADMIN", "EMPLOYEE"]}>
              <PayrollPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* 🔥 fallback */}
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;
