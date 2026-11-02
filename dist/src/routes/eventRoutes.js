"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware"); // <- the file that exports writeRateLimit
const upload_1 = require("../middleware/upload");
const eventController_1 = require("../controllers/eventController");
const router = (0, express_1.Router)();
router.get("/", eventController_1.getEvents);
router.get("/admin/all", auth_1.requireAdmin, eventController_1.getAdminEvents);
router.get("/admin/stats", auth_1.requireAdmin, eventController_1.getEventStats);
// order matters: auth -> rate limit -> upload, so a throttled admin never makes the server parse files
router.post("/", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, upload_1.eventUpload, eventController_1.createEvent);
router.patch("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, upload_1.eventUpload, eventController_1.updateEvent);
router.delete("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, eventController_1.deleteEvent);
router.delete("/:id/media/:mediaId", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, eventController_1.deleteEventMedia);
router.get("/:idOrSlug", auth_1.optionalAdmin, eventController_1.getEvent);
exports.default = router;
