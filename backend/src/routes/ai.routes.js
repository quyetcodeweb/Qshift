import express from "express";
import {
  analyzeRequestController,
  analyzeScheduleController,
  employeeChatController,
  managerChatController,
} from "../controllers/ai.controller.js";
import { verifyAdmin, verifyEmployee, verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/schedule-analysis", verifyToken, verifyAdmin, analyzeScheduleController);
router.post("/request-analysis", verifyToken, verifyAdmin, analyzeRequestController);
router.post("/manager-chat", verifyToken, verifyAdmin, managerChatController);
router.post("/employee-chat", verifyToken, verifyEmployee, employeeChatController);

export default router;
