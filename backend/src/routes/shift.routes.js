import express from "express";
import {
  getShifts,
  createShift,
  updateShift,
  deleteShift,
} from "../controllers/shift.controller.js";
import { verifyAdmin, verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", verifyToken, getShifts);
router.post("/", verifyToken, verifyAdmin, createShift);
router.put("/:id", verifyToken, verifyAdmin, updateShift);
router.delete("/:id", verifyToken, verifyAdmin, deleteShift);

export default router;
