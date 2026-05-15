import express from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  getPayrollSummary,
  respondPayrollFeedback,
  submitPayrollFeedback,
} from "../controllers/payroll.controller.js";

const router = express.Router();

router.get("/summary", verifyToken, getPayrollSummary);
router.post("/feedback", verifyToken, submitPayrollFeedback);
router.post("/feedback/:id/respond", verifyToken, respondPayrollFeedback);

export default router;
