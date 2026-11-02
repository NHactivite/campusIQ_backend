import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { writeRateLimit } from "../middleware/rateLimitMiddleware"; // <- the file that exports writeRateLimit
import {
  getLinkages, getAdminLinkages, getLinkage,
  createLinkage, updateLinkage, reorderLinkages, deleteLinkage,
} from "../controllers/linkageController";

const router = Router();

router.get("/", getLinkages);

// fixed paths must stay above "/:id"
router.get("/admin/all", requireAdmin, getAdminLinkages);
router.patch("/reorder", requireAdmin, writeRateLimit, reorderLinkages);
router.post("/", requireAdmin, writeRateLimit, createLinkage);

router.get("/:id", getLinkage);
router.patch("/:id", requireAdmin, writeRateLimit, updateLinkage);
router.delete("/:id", requireAdmin, writeRateLimit, deleteLinkage);

export default router;