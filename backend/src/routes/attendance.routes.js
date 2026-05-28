import express from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  getAttendanceSettings,
  getAttendanceHistory,
  getTodayAttendance,
  markAttendance,
  requestLateAttendance,
  respondLateAttendance,
  updateAttendanceSettings,
} from "../controllers/attendance.controller.js";

const router = express.Router();

router.get("/today", verifyToken, getTodayAttendance);
router.get("/history", verifyToken, getAttendanceHistory);
router.get("/settings", verifyToken, getAttendanceSettings);
router.put("/settings", verifyToken, updateAttendanceSettings);
router.post("/mark", verifyToken, markAttendance);
router.post("/late-request", verifyToken, requestLateAttendance);
router.post("/late-request/:id/respond", verifyToken, respondLateAttendance);

export default router;
