"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNotice = exports.getNotices = exports.deleteNotice = exports.updateNotice = exports.createNotice = exports.getAdminNotices = void 0;
const Notice_1 = __importStar(require("../models/Notice"));
const cloudinary_1 = require("../utils/cloudinary");
const helpers_1 = require("../utils/helpers");
const cache_1 = require("../utils/cache");
const chatbotSync_1 = require("../utils/chatbotSync");
const mongoose_1 = require("mongoose");
const FOLDER = "iic/notices";
const uploadedFiles = (req) => req.files?.files;
const pickFields = (b) => {
    const out = {};
    if (b.title !== undefined)
        out.title = String(b.title).trim();
    if (b.text !== undefined)
        out.text = String(b.text);
    if (b.category !== undefined) {
        if (!Notice_1.NOTICE_CATEGORIES.includes(b.category))
            throw new helpers_1.ApiError(400, `category must be one of: ${Notice_1.NOTICE_CATEGORIES.join(", ")}`);
        out.category = b.category;
    }
    if (b.noticeDate !== undefined)
        out.noticeDate = b.noticeDate ? new Date(b.noticeDate) : undefined;
    if (b.isPublished !== undefined)
        out.isPublished = b.isPublished === true || b.isPublished === "true";
    return out;
};
// GET /api/notices/admin/all  (admin)
exports.getAdminNotices = (0, helpers_1.asyncHandler)(async (_req, res) => {
    const data = await Notice_1.default.find().sort({ createdAt: -1 });
    (0, cache_1.noStore)(res);
    res.json({ success: true, data });
});
// POST /api/notices  (admin, multipart: files[])
exports.createNotice = (0, helpers_1.asyncHandler)(async (req, res) => {
    const fields = pickFields(req.body);
    if (!fields.title)
        throw new helpers_1.ApiError(400, "Title is required");
    const incoming = uploadedFiles(req);
    if (!fields.text?.trim() && !incoming?.length)
        throw new helpers_1.ApiError(400, "Add some text or at least one file");
    const files = await (0, cloudinary_1.uploadFlatFiles)(incoming, FOLDER);
    let notice;
    try {
        notice = await Notice_1.default.create({ ...fields, files, createdBy: req.user?.id });
    }
    catch (err) {
        await (0, cloudinary_1.deleteMedia)(files); // no orphan files in Cloudinary
        throw err;
    }
    void (0, chatbotSync_1.syncNotice)(notice); // not awaited: the admin doesn't wait for indexing
    await (0, cache_1.invalidate)("notices");
    res.status(201).json({ success: true, data: notice });
});
// PATCH /api/notices/:id  (admin, multipart) – edit, add files, remove files via `removeMedia`
exports.updateNotice = (0, helpers_1.asyncHandler)(async (req, res) => {
    const notice = await Notice_1.default.findById(req.params.id);
    if (!notice)
        throw new helpers_1.ApiError(404, "Notice not found");
    Object.assign(notice, pickFields(req.body));
    const removeIds = new Set((0, helpers_1.toArray)(req.body.removeMedia));
    const removed = [];
    const keep = [];
    for (const m of notice.files)
        (removeIds.has(String(m._id)) ? removed : keep).push(m);
    notice.files = keep;
    const added = await (0, cloudinary_1.uploadFlatFiles)(uploadedFiles(req), FOLDER);
    notice.files.push(...added);
    if (!notice.text?.trim() && notice.files.length === 0) {
        await (0, cloudinary_1.deleteMedia)(added);
        throw new helpers_1.ApiError(400, "A notice needs some text or at least one file");
    }
    try {
        await notice.save();
    }
    catch (err) {
        await (0, cloudinary_1.deleteMedia)(added);
        throw err;
    }
    await (0, cloudinary_1.deleteMedia)(removed); // only after the DB save succeeded
    void (0, chatbotSync_1.syncNotice)(notice);
    await (0, cache_1.invalidate)("notices");
    res.json({ success: true, data: notice });
});
// DELETE /api/notices/:id  (admin)
exports.deleteNotice = (0, helpers_1.asyncHandler)(async (req, res) => {
    const notice = await Notice_1.default.findByIdAndDelete(req.params.id);
    if (!notice)
        throw new helpers_1.ApiError(404, "Notice not found");
    await (0, cloudinary_1.deleteMedia)(notice.files);
    void (0, chatbotSync_1.removeNotice)(String(notice._id));
    await (0, cache_1.invalidate)("notices");
    res.json({ success: true, message: "Notice deleted" });
});
// GET /api/notices?category=exams&search=fee&page=1&limit=10   (public: published only)
exports.getNotices = (0, helpers_1.asyncHandler)(async (req, res) => {
    const { category, search } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const validCategory = category && Notice_1.NOTICE_CATEGORIES.includes(category) ? category : undefined;
    const q = (search ?? "").trim().slice(0, 100);
    const filter = { isPublished: true };
    if (validCategory)
        filter.category = validCategory;
    if (q) {
        const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        filter.$or = [{ title: rx }, { text: rx }];
    }
    const load = async () => {
        const [data, total] = await Promise.all([
            Notice_1.default.find(filter)
                .select("-createdBy")
                .sort({ noticeDate: -1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Notice_1.default.countDocuments(filter),
        ]);
        return { success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    };
    (0, cache_1.publicCache)(res, 30);
    // Searches are skipped (every query is different, so they would only fill Redis).
    // Category, page and limit are validated, so the number of cache keys stays small.
    if (!q) {
        const key = `list:${validCategory ?? "all"}:${page}:${limit}`;
        return res.json(await (0, cache_1.cached)("notices", key, 300, load));
    }
    res.json(await load());
});
// GET /api/notices/:id   (public: published only)
exports.getNotice = (0, helpers_1.asyncHandler)(async (req, res) => {
    const id = String(req.params.id);
    if (!(0, mongoose_1.isValidObjectId)(id))
        throw new helpers_1.ApiError(400, "Invalid id");
    (0, cache_1.publicCache)(res, 30);
    // only published notices are cached, so a draft can never leak to the public
    const body = await (0, cache_1.cached)("notices", `one:${id}`, 300, async () => {
        const notice = await Notice_1.default.findOne({ _id: id, isPublished: true }).select("-createdBy");
        return notice ? { success: true, data: notice } : null;
    });
    if (!body)
        throw new helpers_1.ApiError(404, "Notice not found");
    res.json(body);
});
