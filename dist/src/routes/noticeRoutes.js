"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const upload_1 = require("../middleware/upload");
const noticeController_1 = require("../controllers/noticeController");
const router = (0, express_1.Router)();
router.get("/", noticeController_1.getNotices); // public
router.get("/admin/all", auth_1.requireAdmin, noticeController_1.getAdminNotices); // fixed path stays above "/:id"
router.post("/", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, upload_1.noticeUpload, noticeController_1.createNotice);
router.patch("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, upload_1.noticeUpload, noticeController_1.updateNotice);
router.delete("/:id", auth_1.requireAdmin, rateLimitMiddleware_1.writeRateLimit, noticeController_1.deleteNotice);
router.get("/:id", noticeController_1.getNotice); // public
exports.default = router;
