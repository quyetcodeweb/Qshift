import express from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  autoGenerate,
  saveDraft,
  publishSchedule,
  getCurrentSchedules,
  createScheduleNote,
  getDrafts,
  deleteDraft,
  getAvailability,
  getScheduleNotes,
  getEmployeeStats,
  saveDraftWithName,
  getDraftsList,
  getDraftDetail,
  updateDraftByName,
  deleteDraftByName,
  createSingleSchedule,
  updateSingleSchedule,
  deleteSingleSchedule,
  getScheduleSettings,
  saveScheduleSettings,
} from "../controllers/schedule.controller.js";

const router = express.Router();

// Settings routes (specific routes first)
router.get("/settings", verifyToken, getScheduleSettings);
router.post("/settings", verifyToken, saveScheduleSettings);

// Draft management routes (more specific routes before generic)
router.get("/drafts/list", verifyToken, getDraftsList);
router.get("/drafts/:draft_id", verifyToken, getDraftDetail);
router.post("/drafts", verifyToken, saveDraftWithName);
router.put("/drafts/:draft_id", verifyToken, updateDraftByName);
router.delete("/drafts/:draft_id", verifyToken, deleteDraftByName);
router.get("/drafts", verifyToken, getDrafts);
router.delete("/draft/:id", verifyToken, deleteDraft);

// Public routes
router.get("/current", verifyToken, getCurrentSchedules);
router.get("/notes", verifyToken, getScheduleNotes);
router.post("/notes", verifyToken, createScheduleNote);
router.get("/availability/:month/:year", verifyToken, getAvailability);
router.get("/stats", verifyToken, getEmployeeStats);

// Admin routes
router.post("/auto-generate", verifyToken, autoGenerate);
router.post("/save-draft", verifyToken, saveDraft);
router.post("/publish", verifyToken, publishSchedule);

// Schedule CRUD routes (generic routes last)
router.post("/", verifyToken, createSingleSchedule);
router.put("/:id", verifyToken, updateSingleSchedule);
router.delete("/:id", verifyToken, deleteSingleSchedule);

export default router;
