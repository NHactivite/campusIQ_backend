import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { writeRateLimit } from "../middleware/rateLimitMiddleware";
import { getIndexStatus, resyncOne, resyncMissing } from "../controllers/indexController";

const router = Router();

router.get("/status", requireAdmin, getIndexStatus);
router.post("/resync-missing", requireAdmin, writeRateLimit, resyncMissing);
router.post("/resync/:kind/:id", requireAdmin, writeRateLimit, resyncOne);

export default router;