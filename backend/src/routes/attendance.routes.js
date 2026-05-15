import express from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  getAttendanceHistory,
  getTodayAttendance,
  markAttendance,
} from "../controllers/attendance.controller.js";

const router = express.Router();

router.get("/today", verifyToken, getTodayAttendance);
router.get("/history", verifyToken, getAttendanceHistory);
router.post("/mark", verifyToken, markAttendance);

export default router;
