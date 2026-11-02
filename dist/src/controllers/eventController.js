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
exports.deleteEventMedia = exports.deleteEvent = exports.updateEvent = exports.getEvent = exports.getEventStats = exports.getAdminEvents = exports.getEvents = exports.createEvent = void 0;
const mongoose_1 = require("mongoose");
const Event_1 = __importStar(require("../models/Event"));
const cloudinary_1 = require("../utils/cloudinary");
const helpers_1 = require("../utils/helpers");
const cache_1 = require("../utils/cache");
const folderFor = (slug) => `iic/events/${slug}`;
const allMedia = (e) => [...e.images, ...e.videos, ...e.documents];
const pickFields = (b) => {
    const out = {};
    for (const k of ["title", "description", "category", "venue", "organiser", "outcome"])
        if (b[k] !== undefined)
            out[k] = b[k];
    if (b.eventDate)
        out.eventDate = new Date(b.eventDate);
    if (b.endDate)
        out.endDate = new Date(b.endDate);
    if (b.participants !== undefined && b.participants !== "")
        out.participants = Number(b.participants);
    if (b.isPublished !== undefined)
        out.isPublished = b.isPublished === true || b.isPublished === "true";
    return out;
};
// POST /api/events  (admin, multipart/form-data)
exports.createEvent = (0, helpers_1.asyncHandler)(async (req, res) => {
    const fields = pickFields(req.body);
    if (!fields.title)
        throw new helpers_1.ApiError(400, "Title is required");
    const event = new Event_1.default({ ...fields, slug: (0, helpers_1.slugify)(fields.title), createdBy: req.user?.id });
    const uploaded = await (0, cloudinary_1.uploadEventFiles)(req.files, folderFor(event.title));
    event.images = uploaded.images;
    event.videos = uploaded.videos;
    event.documents = uploaded.documents;
    try {
        await event.save();
    }
    catch (err) {
        await (0, cloudinary_1.deleteMedia)(allMedia(uploaded)); // don't leave orphan files in Cloudinary
        throw err;
    }
    await (0, cache_1.invalidate)("events");
    res.status(201).json({ success: true, data: event });
});
// GET /api/events  (public: published only)
// ?category=IIC&search=hackathon&status=upcoming|past&page=1&limit=12
exports.getEvents = (0, helpers_1.asyncHandler)(async (req, res) => buildList(req, res, true));
// GET /api/events/admin/all  (admin: includes drafts)
// extra admin filter: ?published=true|false
exports.getAdminEvents = (0, helpers_1.asyncHandler)(async (req, res) => buildList(req, res, false));
async function buildList(req, res, publicOnly) {
    const { category, search, status, published } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
    // only accept known values, so junk query strings can't create endless cache keys
    const validCategory = category && Event_1.EVENT_CATEGORIES.includes(category) ? category : undefined;
    const validStatus = status === "upcoming" || status === "past" ? status : undefined;
    const filter = {};
    if (publicOnly)
        filter.isPublished = true;
    else if (published === "true")
        filter.isPublished = true; // admin only
    else if (published === "false")
        filter.isPublished = false; // admin only
    if (validCategory)
        filter.category = validCategory;
    if (search)
        filter.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (validStatus === "upcoming")
        filter.eventDate = { $gte: new Date() };
    if (validStatus === "past")
        filter.eventDate = { $lt: new Date() };
    const load = async () => {
        const [items, total] = await Promise.all([
            Event_1.default.find(filter).sort({ eventDate: -1 }).skip((page - 1) * limit).limit(limit),
            Event_1.default.countDocuments(filter),
        ]);
        return { success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    };
    // Only the public list is cached. Searches are skipped (every query is different),
    // and the admin list is never cached so admins always see their latest edits.
    if (publicOnly && !search) {
        (0, cache_1.publicCache)(res, 30);
        const key = `list:${validCategory ?? ""}:${validStatus ?? ""}:${page}:${limit}`;
        return res.json(await (0, cache_1.cached)("events", key, 120, load));
    }
    (0, cache_1.noStore)(res);
    res.json(await load());
}
// GET /api/events/admin/stats  (admin) – exact counts, however many events exist
exports.getEventStats = (0, helpers_1.asyncHandler)(async (_req, res) => {
    const now = new Date();
    const [total, upcoming, drafts, byCategory, recent] = await Promise.all([
        Event_1.default.countDocuments(),
        Event_1.default.countDocuments({ eventDate: { $gte: now } }),
        Event_1.default.countDocuments({ isPublished: false }),
        Event_1.default.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
        Event_1.default.find().sort({ eventDate: -1 }).limit(5),
    ]);
    (0, cache_1.noStore)(res);
    res.json({
        success: true,
        data: {
            total,
            upcoming,
            past: total - upcoming,
            drafts,
            byCategory: Object.fromEntries(byCategory.map((c) => [c._id, c.count])),
            recent,
        },
    });
});
// GET /api/events/:idOrSlug  (public)
exports.getEvent = (0, helpers_1.asyncHandler)(async (req, res) => {
    const key = req.params.idOrSlug;
    const ckey = `one:${key.slice(0, 200)}`;
    const hit = await (0, cache_1.cacheGet)("events", ckey);
    if (hit) {
        (0, cache_1.publicCache)(res, 30);
        return res.json(hit);
    }
    const event = await Event_1.default.findOne((0, mongoose_1.isValidObjectId)(key) ? { _id: key } : { slug: key });
    if (!event || (!event.isPublished && req.user?.role !== "admin"))
        throw new helpers_1.ApiError(404, "Event not found");
    const body = { success: true, data: event };
    if (event.isPublished) {
        // only published events are stored, so a draft (visible to admins) never leaks to the public
        await (0, cache_1.cacheSet)("events", ckey, body, 300);
        (0, cache_1.publicCache)(res, 30);
    }
    else {
        (0, cache_1.noStore)(res);
    }
    res.json(body);
});
// PATCH /api/events/:id  (admin, multipart) – edit fields, add files, remove files via `removeMedia`
exports.updateEvent = (0, helpers_1.asyncHandler)(async (req, res) => {
    const event = await Event_1.default.findById(req.params.id);
    if (!event)
        throw new helpers_1.ApiError(404, "Event not found");
    Object.assign(event, pickFields(req.body));
    // remove selected media (ids of the media subdocuments)
    const removeIds = new Set((0, helpers_1.toArray)(req.body.removeMedia));
    const removed = [];
    for (const key of ["images", "videos", "documents"]) {
        const keep = [];
        for (const m of event[key])
            (removeIds.has(String(m._id)) ? removed : keep).push(m);
        event[key] = keep;
    }
    // add newly uploaded media
    const uploaded = await (0, cloudinary_1.uploadEventFiles)(req.files, folderFor(event.slug));
    event.images.push(...uploaded.images);
    event.videos.push(...uploaded.videos);
    event.documents.push(...uploaded.documents);
    try {
        await event.save();
    }
    catch (err) {
        await (0, cloudinary_1.deleteMedia)(allMedia(uploaded));
        throw err;
    }
    await (0, cloudinary_1.deleteMedia)(removed); // only after the DB save succeeded
    await (0, cache_1.invalidate)("events");
    res.json({ success: true, data: event });
});
// DELETE /api/events/:id  (admin)
exports.deleteEvent = (0, helpers_1.asyncHandler)(async (req, res) => {
    const event = await Event_1.default.findByIdAndDelete(req.params.id);
    if (!event)
        throw new helpers_1.ApiError(404, "Event not found");
    await (0, cloudinary_1.deleteMedia)(allMedia(event));
    await (0, cache_1.invalidate)("events");
    res.json({ success: true, message: "Event deleted" });
});
// DELETE /api/events/:id/media/:mediaId  (admin)
exports.deleteEventMedia = (0, helpers_1.asyncHandler)(async (req, res) => {
    const event = await Event_1.default.findById(req.params.id);
    if (!event)
        throw new helpers_1.ApiError(404, "Event not found");
    const mediaId = req.params.mediaId;
    let removed;
    for (const key of ["images", "videos", "documents"]) {
        const found = event[key].find((m) => String(m._id) === mediaId);
        if (found) {
            removed = found;
            event[key] = event[key].filter((m) => String(m._id) !== mediaId);
            break;
        }
    }
    if (!removed)
        throw new helpers_1.ApiError(404, "Media not found");
    await event.save();
    await (0, cloudinary_1.deleteMedia)([removed]);
    await (0, cache_1.invalidate)("events");
    res.json({ success: true, data: event });
});
