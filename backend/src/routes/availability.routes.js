import express from "express";
import {
  saveAvailability,
  getAvailability,
  requestAvailability,
  getMyAvailabilityRequest,
  requestEditAvailability,
  respondEditAvailability,
  approveRequest,
  rejectRequest,
  listAvailabilityRequests,
  remindAvailabilityRequest,
  deleteAvailabilityRequest,
} from "../controllers/availability.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", saveAvailability);
router.get("/requests/all", verifyToken, listAvailabilityRequests);
router.post("/requests/:id/remind", verifyToken, remindAvailabilityRequest);
router.delete("/requests/:id", verifyToken, deleteAvailabilityRequest);
router.get("/request/me", verifyToken, getMyAvailabilityRequest);
router.post("/request/edit", verifyToken, requestEditAvailability);
router.post("/request/edit/:id/respond", verifyToken, respondEditAvailability);
router.get("/:employee_id", getAvailability);
router.post("/request", verifyToken, requestAvailability);
router.post("/approve/:id", verifyToken, approveRequest);
router.post("/reject/:id", verifyToken, rejectRequest);
export default router;
