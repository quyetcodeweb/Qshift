import express from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  getPayrollSettings,
  getPayrollSummary,
  respondPayrollFeedback,
  resolvePayrollSchedule,
  submitPayrollFeedback,
  undoPayrollResolution,
  updatePayrollSettings,
} from "../controllers/payroll.controller.js";

const router = express.Router();

router.get("/summary", verifyToken, getPayrollSummary);
router.get("/settings", verifyToken, getPayrollSettings);
router.put("/settings", verifyToken, updatePayrollSettings);
router.post("/resolve/:scheduleId", verifyToken, resolvePayrollSchedule);
router.delete("/resolve/:scheduleId", verifyToken, undoPayrollResolution);
router.post("/feedback", verifyToken, submitPayrollFeedback);
router.post("/feedback/:id/respond", verifyToken, respondPayrollFeedback);

export default router;
