import express from "express";
import {
  saveAvailability,
  getAvailability,
  requestAvailability,
  getMyAvailabilityRequest,
  getMyActiveFillRequest,
  requestEditAvailability,
  respondEditAvailability,
  approveRequest,
  rejectRequest,
  listAvailabilityRequests,
  remindAvailabilityRequest,
  deleteAvailabilityRequest,
} from "../controllers/availability.controller.js";
import { verifyAdmin, verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", verifyToken, verifyAdmin, saveAvailability);
router.get("/requests/all", verifyToken, verifyAdmin, listAvailabilityRequests);
router.post("/requests/:id/remind", verifyToken, verifyAdmin, remindAvailabilityRequest);
router.delete("/requests/:id", verifyToken, verifyAdmin, deleteAvailabilityRequest);
router.get("/request/me", verifyToken, getMyAvailabilityRequest);
router.get("/request/active", verifyToken, getMyActiveFillRequest);
router.post("/request/edit", verifyToken, requestEditAvailability);
router.post("/request/edit/:id/respond", verifyToken, verifyAdmin, respondEditAvailability);
router.get("/:employee_id", verifyToken, getAvailability);
router.post("/request", verifyToken, requestAvailability);
router.post("/approve/:id", verifyToken, verifyAdmin, approveRequest);
router.post("/reject/:id", verifyToken, verifyAdmin, rejectRequest);
export default router;
