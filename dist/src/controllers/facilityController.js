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
exports.deleteFacility = exports.updateFacility = exports.getFacility = exports.getFacilities = exports.createFacility = exports.getAdminFacilities = void 0;
const mongoose_1 = require("mongoose");
const Facility_1 = __importStar(require("../models/Facility"));
const cloudinary_1 = require("../utils/cloudinary");
const helpers_1 = require("../utils/helpers");
const cache_1 = require("../utils/cache");
const chatbotSync_1 = require("../utils/chatbotSync");
const folderFor = (slug) => `campusiq/facilities/${slug}`;
const allMedia = (f) => [...f.images, ...f.documents];
const pickFields = (b) => {
    const out = {};
    for (const k of ["name", "description", "category", "location", "operatingHours", "contactDetails"])
        if (b[k] !== undefined)
            out[k] = b[k];
    if (b.amenities !== undefined) {
        out.amenities = (0, helpers_1.toArray)(b.amenities);
    }
    if (b.isPublished !== undefined)
        out.isPublished = b.isPublished === true || b.isPublished === "true";
    return out;
};
// GET /api/facilities/admin/all  (admin)
exports.getAdminFacilities = (0, helpers_1.asyncHandler)(async (_req, res) => {
    const data = await Facility_1.default.find().sort({ createdAt: -1 });
    (0, cache_1.noStore)(res);
    res.json({ success: true, data });
});
// POST /api/facilities  (admin, multipart)
exports.createFacility = (0, helpers_1.asyncHandler)(async (req, res) => {
    const fields = pickFields(req.body);
    if (!fields.name)
        throw new helpers_1.ApiError(400, "Name is required");
    if (!fields.description)
        throw new helpers_1.ApiError(400, "Description is required");
    const facility = new Facility_1.default({
        ...fields,
        slug: (0, helpers_1.slugify)(fields.name),
        createdBy: req.user?.id,
    });
    const uploaded = await (0, cloudinary_1.uploadEventFiles)(req.files, folderFor(facility.slug));
    facility.images = uploaded.images;
    facility.documents = uploaded.documents;
    try {
        await facility.save();
    }
    catch (err) {
        await (0, cloudinary_1.deleteMedia)(allMedia(uploaded));
        throw err;
    }
    await (0, cache_1.invalidate)("facilities");
    void (0, chatbotSync_1.syncFacility)(facility);
    res.status(201).json({ success: true, data: facility });
});
// GET /api/facilities  (public: published only)
exports.getFacilities = (0, helpers_1.asyncHandler)(async (req, res) => {
    const { category, search } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
    const validCategory = category && Facility_1.FACILITY_CATEGORIES.includes(category)
        ? category
        : undefined;
    const q = (search ?? "").trim().slice(0, 100);
    const filter = { isPublished: true };
    if (validCategory)
        filter.category = validCategory;
    if (q) {
        const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        filter.$or = [{ name: rx }, { description: rx }, { location: rx }];
    }
    const load = async () => {
        const [data, total] = await Promise.all([
            Facility_1.default.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
            Facility_1.default.countDocuments(filter),
        ]);
        return { success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    };
    if (!q) {
        (0, cache_1.publicCache)(res, 30);
        const key = `list:${validCategory ?? "all"}:${page}:${limit}`;
        return res.json(await (0, cache_1.cached)("facilities", key, 300, load));
    }
    (0, cache_1.noStore)(res);
    res.json(await load());
});
// GET /api/facilities/:idOrSlug  (public)
exports.getFacility = (0, helpers_1.asyncHandler)(async (req, res) => {
    const key = req.params.idOrSlug;
    const ckey = `one:${key.slice(0, 200)}`;
    const hit = await (0, cache_1.cacheGet)("facilities", ckey);
    if (hit) {
        (0, cache_1.publicCache)(res, 30);
        return res.json(hit);
    }
    const facility = await Facility_1.default.findOne((0, mongoose_1.isValidObjectId)(key) ? { _id: key, isPublished: true } : { slug: key, isPublished: true });
    if (!facility)
        throw new helpers_1.ApiError(404, "Facility not found");
    const body = { success: true, data: facility };
    await (0, cache_1.cacheSet)("facilities", ckey, body, 300);
    (0, cache_1.publicCache)(res, 30);
    res.json(body);
});
// PATCH /api/facilities/:id  (admin, multipart)
exports.updateFacility = (0, helpers_1.asyncHandler)(async (req, res) => {
    const facility = await Facility_1.default.findById(req.params.id);
    if (!facility)
        throw new helpers_1.ApiError(404, "Facility not found");
    Object.assign(facility, pickFields(req.body));
    const removeIds = new Set((0, helpers_1.toArray)(req.body.removeMedia));
    const removed = [];
    for (const key of ["images", "documents"]) {
        const keep = [];
        for (const m of facility[key])
            (removeIds.has(String(m._id)) ? removed : keep).push(m);
        facility[key] = keep;
    }
    const uploaded = await (0, cloudinary_1.uploadEventFiles)(req.files, folderFor(facility.slug));
    facility.images.push(...uploaded.images);
    facility.documents.push(...uploaded.documents);
    try {
        await facility.save();
    }
    catch (err) {
        await (0, cloudinary_1.deleteMedia)([...uploaded.images, ...uploaded.documents]);
        throw err;
    }
    await (0, cloudinary_1.deleteMedia)(removed);
    await (0, cache_1.invalidate)("facilities");
    void (0, chatbotSync_1.syncFacility)(facility);
    res.json({ success: true, data: facility });
});
// DELETE /api/facilities/:id  (admin)
exports.deleteFacility = (0, helpers_1.asyncHandler)(async (req, res) => {
    const facility = await Facility_1.default.findByIdAndDelete(req.params.id);
    if (!facility)
        throw new helpers_1.ApiError(404, "Facility not found");
    await (0, cloudinary_1.deleteMedia)(allMedia(facility));
    await (0, cache_1.invalidate)("facilities");
    void (0, chatbotSync_1.removeFacility)(String(facility._id));
    res.json({ success: true, message: "Facility deleted" });
});
