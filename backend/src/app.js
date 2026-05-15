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
import shiftSwapRoutes from "./routes/shiftSwap.routes.js";
import pool from "./config/db.js";
import { runMigrations } from "./utils/migrate.js";
import { scanMissingAttendanceNotifications } from "./controllers/attendance.controller.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "https://qshift.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Qshift backend is running" });
});

app.get("/api/db-check", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS result");
    res.json({ success: true, result: rows[0]?.result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

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
app.use("/api/shift-swaps", shiftSwapRoutes);

// Run migrations on startup
await runMigrations();
scanMissingAttendanceNotifications();
setInterval(scanMissingAttendanceNotifications, 60 * 1000);

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
