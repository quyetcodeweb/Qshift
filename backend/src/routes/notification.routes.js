import express from "express";
import {
  sendAvailabilityRequest,
  getNotifications,
  markRead,
  markAllRead,
} from "../controllers/notification.controller.js";

const router = express.Router();

router.post("/send", sendAvailabilityRequest);
router.get("/", getNotifications);
router.patch("/read-all", markAllRead);
router.patch("/:id", markRead);

export default router;
