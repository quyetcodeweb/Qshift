import express from "express";
import {
  saveAvailability,
  getAvailability,
  requestAvailability,
  approveRequest,
  rejectRequest,
} from "../controllers/availability.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", saveAvailability);
router.get("/:employee_id", getAvailability);
router.post("/request", verifyToken, requestAvailability);
router.post("/approve/:id", verifyToken, approveRequest);
router.post("/reject/:id", verifyToken, rejectRequest);
export default router;