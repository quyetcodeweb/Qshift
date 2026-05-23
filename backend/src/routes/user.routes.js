import express from "express";
import {
  getUsers,
  updateUser,
  changeOwnPassword,
  deleteUser,
  toggleUserStatus,
} from "../controllers/user.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", getUsers);
router.put("/me/password", verifyToken, changeOwnPassword);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);
router.patch("/:id/status", toggleUserStatus);

export default router;
