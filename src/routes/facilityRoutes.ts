import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { writeRateLimit } from "../middleware/rateLimitMiddleware";
import { facilityUpload } from "../middleware/upload";
import {
  getFacilities, getFacility,
  getAdminFacilities, createFacility, updateFacility, deleteFacility,
} from "../controllers/facilityController";

const router = Router();

router.get("/", getFacilities);              // public
router.get("/admin/all", requireAdmin, getAdminFacilities);
router.post("/", requireAdmin, writeRateLimit, facilityUpload, createFacility);
router.patch("/:id", requireAdmin, writeRateLimit, facilityUpload, updateFacility);
router.delete("/:id", requireAdmin, writeRateLimit, deleteFacility);
router.get("/:idOrSlug", getFacility);       // public

export default router;
