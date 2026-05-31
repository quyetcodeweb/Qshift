import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import EmployeePage from "./pages/EmployeePage";
import ShiftsCalendar from "./pages/ShiftsCalendar";
import ProtectedRoute from "./components/ProtectedRoute";
import AvailabilityPage from "./pages/AvailabilityPage";
import NotificationPage from "./pages/NotificationPage";
import CreateSchedule from "./pages/CreateSchedule";
import AttendancePage from "./pages/AttendancePage";
import AttendanceHistoryPage from "./pages/AttendanceHistoryPage";
import ProfilePage from "./pages/ProfilePage";
import PayrollPage from "./pages/PayrollPage";
import ShiftSwapManagementPage from "./pages/ShiftSwapManagementPage";
import StatisticsPage from "./pages/StatisticsPage";
import { isLoggedIn } from "./utils/auth";

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={isLoggedIn() ? <Navigate to="/" /> : <Login />}
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />

        {/* ADMIN */}
        <Route
          path="statistics"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <StatisticsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="employeePage"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <EmployeePage />
            </ProtectedRoute>
          }
        />

        <Route path="employeeRoles" element={<Navigate to="/employeePage" />} />

        <Route path="userPage" element={<Navigate to="/employeePage" />} />

        <Route
          path="shiftManagement"
          element={<Navigate to="/createSchedule" />}
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
            <ProtectedRoute roles={["EMPLOYEE"]}>
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
