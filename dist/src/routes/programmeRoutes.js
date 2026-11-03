"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const upload_1 = require("../middleware/upload");
const programmeController_1 = require("../controllers/programmeController");
const router = (0, express_1.Router)();
router.get("/", programmeController_1.getProgrammes); // public
router.get("/admin/all", auth_1.requireAdmin, programmeController_1.getAdminProgrammes);
router.post("/", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, upload_1.programmeUpload, programmeController_1.createProgramme);
router.patch("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, upload_1.programmeUpload, programmeController_1.updateProgramme);
router.delete("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, programmeController_1.deleteProgramme);
router.get("/:idOrSlug", programmeController_1.getProgramme); // public
exports.default = router;
