import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { writeRateLimit } from "../middleware/rateLimitMiddleware";
import { noticeUpload } from "../middleware/upload";
import {
  getNotices, getNotice, getAdminNotices, createNotice, updateNotice, deleteNotice,
} from "../controllers/noticeController";

const router = Router();

router.get("/", getNotices); // public

router.get("/admin/all", requireAdmin, getAdminNotices); // fixed path stays above "/:id"
router.post("/", requireAdmin, writeRateLimit, noticeUpload, createNotice);
router.patch("/:id", requireAdmin, writeRateLimit, noticeUpload, updateNotice);
router.delete("/:id", requireAdmin, writeRateLimit, deleteNotice);

router.get("/:id", getNotice); // public

export default router;