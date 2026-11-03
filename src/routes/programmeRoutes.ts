import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { writeRateLimit } from "../middleware/rateLimitMiddleware";
import { programmeUpload } from "../middleware/upload";
import {
  getProgrammes, getProgramme,
  getAdminProgrammes, createProgramme, updateProgramme, deleteProgramme,
} from "../controllers/programmeController";

const router = Router();

router.get("/", getProgrammes);              // public
router.get("/admin/all", requireAdmin, getAdminProgrammes);
router.post("/", requireAdmin, writeRateLimit, programmeUpload, createProgramme);
router.patch("/:id", requireAdmin, writeRateLimit, programmeUpload, updateProgramme);
router.delete("/:id", requireAdmin, writeRateLimit, deleteProgramme);
router.get("/:idOrSlug", getProgramme);      // public

export default router;
