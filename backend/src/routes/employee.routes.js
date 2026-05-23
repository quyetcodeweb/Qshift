import express from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  createEmployee,
  getEmployees,
  getEmployeeById,
  getMyProfile,
  deleteEmployee,
  updateEmployee,
} from "../controllers/employee.controller.js";

const router = express.Router();

router.post("/", createEmployee);
router.get("/", getEmployees);
router.get("/me", verifyToken, getMyProfile);
router.get("/:id", verifyToken, getEmployeeById);
router.put("/:id", verifyToken, updateEmployee);
router.delete("/:id", verifyToken, deleteEmployee);

export default router;
