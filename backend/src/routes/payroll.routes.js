import express from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  createPayrollAdjustment,
  deletePayrollFeedback,
  getPayrollAdjustments,
  getPayrollSettings,
  getPayrollSummary,
  listPayrollFeedback,
  respondPayrollFeedback,
  resolvePayrollSchedule,
  submitPayrollFeedback,
  undoPayrollResolution,
  updatePayrollSettings,
} from "../controllers/payroll.controller.js";

const router = express.Router();

router.get("/summary", verifyToken, getPayrollSummary);
router.get("/adjustments", verifyToken, getPayrollAdjustments);
router.post("/adjustments", verifyToken, createPayrollAdjustment);
router.get("/settings", verifyToken, getPayrollSettings);
router.put("/settings", verifyToken, updatePayrollSettings);
router.post("/resolve/:scheduleId", verifyToken, resolvePayrollSchedule);
router.delete("/resolve/:scheduleId", verifyToken, undoPayrollResolution);
router.get("/feedback", verifyToken, listPayrollFeedback);
router.post("/feedback", verifyToken, submitPayrollFeedback);
router.post("/feedback/:id/respond", verifyToken, respondPayrollFeedback);
router.delete("/feedback/:id", verifyToken, deletePayrollFeedback);

export default router;
