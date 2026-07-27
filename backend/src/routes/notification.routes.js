import express from "express";
import {
  sendAvailabilityRequest,
  getNotifications,
  markRead,
  markAllRead,
  deleteNotifications,
} from "../controllers/notification.controller.js";
import { verifyAdmin, verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/send", verifyToken, verifyAdmin, sendAvailabilityRequest);
router.get("/", verifyToken, getNotifications);
router.patch("/read-all", verifyToken, markAllRead);
router.delete("/", verifyToken, deleteNotifications);
router.patch("/:id", verifyToken, markRead);

export default router;
