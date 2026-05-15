import express from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  cancelShiftSwapByAdmin,
  createShiftSwapRequest,
  getShiftSwapOptions,
  getShiftSwapRequests,
  respondToShiftSwapRequest,
  revertShiftSwapByAdmin,
} from "../controllers/shiftSwap.controller.js";

const router = express.Router();

router.get("/options", verifyToken, getShiftSwapOptions);
router.get("/", verifyToken, getShiftSwapRequests);
router.post("/", verifyToken, createShiftSwapRequest);
router.post("/:id/respond", verifyToken, respondToShiftSwapRequest);
router.post("/:id/cancel", verifyToken, cancelShiftSwapByAdmin);
router.post("/:id/revert", verifyToken, revertShiftSwapByAdmin);

export default router;
