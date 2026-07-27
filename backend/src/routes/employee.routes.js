import express from "express";
import { verifyAdmin, verifyToken } from "../middlewares/auth.middleware.js";
import {
  createEmployee,
  getEmployees,
  getEmployeeById,
  getMyProfile,
  getMyEmailPreferences,
  sendEmailOtp,
  deleteEmployee,
  updateMyEmailPreferences,
  updateEmployee,
} from "../controllers/employee.controller.js";

const router = express.Router();

router.post("/", verifyToken, verifyAdmin, createEmployee);
router.get("/", verifyToken, verifyAdmin, getEmployees);
router.get("/me", verifyToken, getMyProfile);
router.get("/me/email-preferences", verifyToken, getMyEmailPreferences);
router.put("/me/email-preferences", verifyToken, updateMyEmailPreferences);
router.post("/me/email-otp", verifyToken, sendEmailOtp);
router.get("/:id", verifyToken, getEmployeeById);
router.put("/:id", verifyToken, updateEmployee);
router.delete("/:id", verifyToken, deleteEmployee);

export default router;
