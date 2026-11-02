import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { getThreads, getThreadMessages, getUnanswered, getChatStats } from "../controllers/chatController";

const router = Router();

router.get("/admin/stats", requireAdmin, getChatStats);
router.get("/admin/threads", requireAdmin, getThreads);
router.get("/admin/threads/:userId/:threadId", requireAdmin, getThreadMessages);
router.get("/admin/unanswered", requireAdmin, getUnanswered);

export default router;