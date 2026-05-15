import express from "express";
import {
  getUsers,
  updateUser,
  deleteUser,
  toggleUserStatus,
} from "../controllers/user.controller.js";

const router = express.Router();

router.get("/", getUsers);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);
router.patch("/:id/status", toggleUserStatus);

export default router;