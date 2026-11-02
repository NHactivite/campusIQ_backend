import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { writeRateLimit } from "../middleware/rateLimitMiddleware"; // <- the file that exports writeRateLimit
import {
  getGlance, getAdminGlance, createGlance, updateGlance, reorderGlance, deleteGlance,
} from "../controllers/glanceController";

const router = Router();

router.get("/", getGlance);

// fixed paths must stay above "/:id"
router.get("/admin/all", requireAdmin, getAdminGlance);
router.patch("/reorder", requireAdmin, writeRateLimit, reorderGlance);
router.post("/", requireAdmin, writeRateLimit, createGlance);

router.patch("/:id", requireAdmin, writeRateLimit, updateGlance);
router.delete("/:id", requireAdmin, writeRateLimit, deleteGlance);

export default router;