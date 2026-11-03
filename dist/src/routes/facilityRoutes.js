"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const upload_1 = require("../middleware/upload");
const facilityController_1 = require("../controllers/facilityController");
const router = (0, express_1.Router)();
router.get("/", facilityController_1.getFacilities); // public
router.get("/admin/all", auth_1.requireAdmin, facilityController_1.getAdminFacilities);
router.post("/", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, upload_1.facilityUpload, facilityController_1.createFacility);
router.patch("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, upload_1.facilityUpload, facilityController_1.updateFacility);
router.delete("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, facilityController_1.deleteFacility);
router.get("/:idOrSlug", facilityController_1.getFacility); // public
exports.default = router;
