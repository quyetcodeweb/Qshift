import express from "express";
import {
  getUsers,
  updateUser,
  changeOwnPassword,
  sendPasswordOtp,
  deleteUser,
  toggleUserStatus,
} from "../controllers/user.controller.js";
import { verifyAdmin, verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", verifyToken, verifyAdmin, getUsers);
router.post("/me/password-otp", verifyToken, sendPasswordOtp);
router.put("/me/password", verifyToken, changeOwnPassword);
router.put("/:id", verifyToken, verifyAdmin, updateUser);
router.delete("/:id", verifyToken, verifyAdmin, deleteUser);
router.patch("/:id/status", verifyToken, verifyAdmin, toggleUserStatus);

export default router;
