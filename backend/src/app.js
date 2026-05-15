import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import shiftRoutes from "./routes/shift.routes.js";
import userRoutes from "./routes/user.routes.js";
import employeeRoutes from "./routes/employee.routes.js";
import authRoutes from "./routes/auth.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import availabilityPage from "./routes/availability.routes.js";
import scheduleRoutes from "./routes/schedule.routes.js";
import rolesRoutes from "./routes/roles.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import payrollRoutes from "./routes/payroll.routes.js";
import { runMigrations } from "./utils/migrate.js";
import { scanMissingAttendanceNotifications } from "./controllers/attendance.controller.js";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/shifts", shiftRoutes);
app.use("/api/users", userRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/availability", availabilityPage);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/payroll", payrollRoutes);

// Run migrations on startup
await runMigrations();
scanMissingAttendanceNotifications();
setInterval(scanMissingAttendanceNotifications, 60 * 1000);

app.listen(process.env.PORT, () => {
  console.log("Server running on port " + process.env.PORT);
});
