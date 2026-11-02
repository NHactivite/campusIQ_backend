import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { writeRateLimit } from "../middleware/rateLimitMiddleware"; // <- the file that exports writeRateLimit
import {
  getFeatures, getAdminFeatures, getFeature,
  createFeature, updateFeature, reorderFeatures, deleteFeature,
} from "../controllers/featureController";

const router = Router();

// public
router.get("/", getFeatures);

// admin (fixed paths must stay above "/:id")
router.get("/admin/all", requireAdmin, getAdminFeatures);
router.patch("/reorder", requireAdmin, writeRateLimit, reorderFeatures);
router.post("/", requireAdmin, writeRateLimit, createFeature);

router.get("/:id", getFeature);
router.patch("/:id", requireAdmin, writeRateLimit, updateFeature);
router.delete("/:id", requireAdmin, writeRateLimit, deleteFeature);

export default router;