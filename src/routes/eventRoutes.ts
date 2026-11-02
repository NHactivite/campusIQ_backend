import { Router } from "express";
import { requireAdmin, optionalAdmin } from "../middleware/auth";
import { writeRateLimit } from "../middleware/rateLimitMiddleware"; // <- the file that exports writeRateLimit
import { eventUpload } from "../middleware/upload";
import {
  createEvent, getEvents, getAdminEvents, getEventStats, getEvent,
  updateEvent, deleteEvent, deleteEventMedia,
} from "../controllers/eventController";

const router = Router();

router.get("/", getEvents);

router.get("/admin/all", requireAdmin, getAdminEvents);
router.get("/admin/stats", requireAdmin, getEventStats);
// order matters: auth -> rate limit -> upload, so a throttled admin never makes the server parse files
router.post("/", requireAdmin, writeRateLimit, eventUpload, createEvent);
router.patch("/:id", requireAdmin, writeRateLimit, eventUpload, updateEvent);
router.delete("/:id", requireAdmin, writeRateLimit, deleteEvent);
router.delete("/:id/media/:mediaId", requireAdmin, writeRateLimit, deleteEventMedia);

router.get("/:idOrSlug", optionalAdmin, getEvent);

export default router;