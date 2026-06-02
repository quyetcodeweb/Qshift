import express from "express";
import {
  analyzeRequestController,
  analyzeScheduleController,
  managerChatController,
} from "../controllers/ai.controller.js";
import { verifyAdmin, verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/schedule-analysis", verifyToken, verifyAdmin, analyzeScheduleController);
router.post("/request-analysis", verifyToken, verifyAdmin, analyzeRequestController);
router.post("/manager-chat", verifyToken, verifyAdmin, managerChatController);

export default router;
