"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware"); // <- the file that exports writeRateLimit
const glanceController_1 = require("../controllers/glanceController");
const router = (0, express_1.Router)();
router.get("/", glanceController_1.getGlance);
// fixed paths must stay above "/:id"
router.get("/admin/all", auth_1.requireAdmin, glanceController_1.getAdminGlance);
router.patch("/reorder", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, glanceController_1.reorderGlance);
router.post("/", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, glanceController_1.createGlance);
router.patch("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, glanceController_1.updateGlance);
router.delete("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, glanceController_1.deleteGlance);
exports.default = router;
