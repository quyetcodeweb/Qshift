import express from "express";
import { verifyToken, verifyAdmin } from "../middlewares/auth.middleware.js";
import {
  getRoles,
  createRole,
  getEmployeeRoles,
  assignRoleToEmployee,
  removeRoleFromEmployee,
  getShiftRoleRequirements,
  setShiftRoleRequirements,
} from "../controllers/roles.controller.js";

const router = express.Router();

// Public routes
router.get("/", verifyToken, getRoles);
router.get("/employee/:employee_id", verifyToken, getEmployeeRoles);
router.get("/shift/:shift_id", verifyToken, getShiftRoleRequirements);

// Admin routes
router.post("/", verifyToken, verifyAdmin, createRole);
router.post("/employee/:employee_id", verifyToken, verifyAdmin, assignRoleToEmployee);
router.delete("/employee/:employee_id/:role_id", verifyToken, verifyAdmin, removeRoleFromEmployee);
router.post("/shift/:shift_id", verifyToken, verifyAdmin, setShiftRoleRequirements);

export default router;
