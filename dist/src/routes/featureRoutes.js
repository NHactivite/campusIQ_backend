"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware"); // <- the file that exports writeRateLimit
const featureController_1 = require("../controllers/featureController");
const router = (0, express_1.Router)();
// public
router.get("/", featureController_1.getFeatures);
// admin (fixed paths must stay above "/:id")
router.get("/admin/all", auth_1.requireAdmin, featureController_1.getAdminFeatures);
router.patch("/reorder", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, featureController_1.reorderFeatures);
router.post("/", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, featureController_1.createFeature);
router.get("/:id", featureController_1.getFeature);
router.patch("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, featureController_1.updateFeature);
router.delete("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, featureController_1.deleteFeature);
exports.default = router;
