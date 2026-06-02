import express from "express";
import {
  getUsers,
  updateUser,
  changeOwnPassword,
  sendPasswordOtp,
  deleteUser,
  toggleUserStatus,
} from "../controllers/user.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", getUsers);
router.post("/me/password-otp", verifyToken, sendPasswordOtp);
router.put("/me/password", verifyToken, changeOwnPassword);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);
router.patch("/:id/status", toggleUserStatus);

export default router;
