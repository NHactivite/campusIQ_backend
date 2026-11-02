"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware"); // <- the file that exports writeRateLimit
const linkageController_1 = require("../controllers/linkageController");
const router = (0, express_1.Router)();
router.get("/", linkageController_1.getLinkages);
// fixed paths must stay above "/:id"
router.get("/admin/all", auth_1.requireAdmin, linkageController_1.getAdminLinkages);
router.patch("/reorder", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, linkageController_1.reorderLinkages);
router.post("/", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, linkageController_1.createLinkage);
router.get("/:id", linkageController_1.getLinkage);
router.patch("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, linkageController_1.updateLinkage);
router.delete("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, linkageController_1.deleteLinkage);
exports.default = router;
