import express from "express";
import { verifyAdmin, verifyToken } from "../middlewares/auth.middleware.js";
import {
  autoGenerate,
  saveDraft,
  publishSchedule,
  getCurrentSchedules,
  createScheduleNote,
  createSupplementalRequest,
  acceptSupplementalRequest,
  deleteSupplementalRequest,
  getDrafts,
  deleteDraft,
  getAvailability,
  getScheduleNotes,
  getSupplementalRequests,
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
  getScheduleExportPreview,
  exportScheduleWorkbook,
} from "../controllers/schedule.controller.js";

const router = express.Router();

// Settings routes (specific routes first)
router.get("/settings", verifyToken, getScheduleSettings);
router.post("/settings", verifyToken, saveScheduleSettings);

// Excel export routes (admin only)
router.post("/export/preview", verifyToken, verifyAdmin, getScheduleExportPreview);
router.post("/export", verifyToken, verifyAdmin, exportScheduleWorkbook);

// Draft management routes (more specific routes before generic)
router.get("/drafts/list", verifyToken, verifyAdmin, getDraftsList);
router.get("/drafts/:draft_id", verifyToken, verifyAdmin, getDraftDetail);
router.post("/drafts", verifyToken, verifyAdmin, saveDraftWithName);
router.put("/drafts/:draft_id", verifyToken, verifyAdmin, updateDraftByName);
router.delete("/drafts/:draft_id", verifyToken, verifyAdmin, deleteDraftByName);
router.get("/drafts", verifyToken, verifyAdmin, getDrafts);
router.delete("/draft/:id", verifyToken, verifyAdmin, deleteDraft);

// Public routes
router.get("/current", verifyToken, getCurrentSchedules);
router.get("/notes", verifyToken, getScheduleNotes);
router.post("/notes", verifyToken, createScheduleNote);
router.get("/supplemental-requests", verifyToken, getSupplementalRequests);
router.post("/supplemental-requests", verifyToken, createSupplementalRequest);
router.post("/supplemental-requests/:id/accept", verifyToken, acceptSupplementalRequest);
router.delete("/supplemental-requests/:id", verifyToken, deleteSupplementalRequest);
router.get("/availability/:month/:year", verifyToken, verifyAdmin, getAvailability);
router.get("/stats", verifyToken, verifyAdmin, getEmployeeStats);

// Admin routes
router.post("/auto-generate", verifyToken, verifyAdmin, autoGenerate);
router.post("/save-draft", verifyToken, verifyAdmin, saveDraft);
router.post("/publish", verifyToken, verifyAdmin, publishSchedule);

// Schedule CRUD routes (generic routes last)
router.post("/", verifyToken, verifyAdmin, createSingleSchedule);
router.put("/:id", verifyToken, verifyAdmin, updateSingleSchedule);
router.delete("/:id", verifyToken, verifyAdmin, deleteSingleSchedule);

export default router;
