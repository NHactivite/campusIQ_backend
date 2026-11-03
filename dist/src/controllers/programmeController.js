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
exports.deleteProgramme = exports.updateProgramme = exports.getProgramme = exports.getProgrammes = exports.createProgramme = exports.getAdminProgrammes = void 0;
const mongoose_1 = require("mongoose");
const Programme_1 = __importStar(require("../models/Programme"));
const cloudinary_1 = require("../utils/cloudinary");
const helpers_1 = require("../utils/helpers");
const cache_1 = require("../utils/cache");
const chatbotSync_1 = require("../utils/chatbotSync");
const FOLDER = "campusiq/programmes";
const uploadedFiles = (req) => req.files?.syllabus;
const pickFields = (b) => {
    const out = {};
    for (const k of ["name", "degreeLevel", "department", "duration", "eligibilityCriteria", "admissionRequirements", "courseOverview"])
        if (b[k] !== undefined)
            out[k] = b[k];
    if (b.availableSeats !== undefined && b.availableSeats !== "")
        out.availableSeats = Number(b.availableSeats);
    if (b.isPublished !== undefined)
        out.isPublished = b.isPublished === true || b.isPublished === "true";
    return out;
};
// GET /api/programmes/admin/all  (admin)
exports.getAdminProgrammes = (0, helpers_1.asyncHandler)(async (_req, res) => {
    const data = await Programme_1.default.find().sort({ createdAt: -1 });
    (0, cache_1.noStore)(res);
    res.json({ success: true, data });
});
// POST /api/programmes  (admin, multipart)
exports.createProgramme = (0, helpers_1.asyncHandler)(async (req, res) => {
    const fields = pickFields(req.body);
    if (!fields.name)
        throw new helpers_1.ApiError(400, "Name is required");
    if (!fields.degreeLevel || !Programme_1.DEGREE_LEVELS.includes(fields.degreeLevel))
        throw new helpers_1.ApiError(400, `degreeLevel must be one of: ${Programme_1.DEGREE_LEVELS.join(", ")}`);
    if (!fields.department)
        throw new helpers_1.ApiError(400, "Department is required");
    if (!fields.duration)
        throw new helpers_1.ApiError(400, "Duration is required");
    const syllabus = await (0, cloudinary_1.uploadFlatFiles)(uploadedFiles(req), FOLDER);
    let programme;
    try {
        programme = await Programme_1.default.create({
            ...fields,
            slug: (0, helpers_1.slugify)(fields.name),
            syllabus,
            createdBy: req.user?.id,
        });
    }
    catch (err) {
        await (0, cloudinary_1.deleteMedia)(syllabus);
        throw err;
    }
    await (0, cache_1.invalidate)("programmes");
    void (0, chatbotSync_1.syncProgramme)(programme);
    res.status(201).json({ success: true, data: programme });
});
// GET /api/programmes  (public: published only)
exports.getProgrammes = (0, helpers_1.asyncHandler)(async (req, res) => {
    const { degreeLevel, department, search } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
    const validLevel = degreeLevel && Programme_1.DEGREE_LEVELS.includes(degreeLevel)
        ? degreeLevel
        : undefined;
    const q = (search ?? "").trim().slice(0, 100);
    const filter = { isPublished: true };
    if (validLevel)
        filter.degreeLevel = validLevel;
    if (department) {
        filter.department = { $regex: department.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    if (q) {
        const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        filter.$or = [{ name: rx }, { department: rx }, { courseOverview: rx }];
    }
    const load = async () => {
        const [data, total] = await Promise.all([
            Programme_1.default.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
            Programme_1.default.countDocuments(filter),
        ]);
        return { success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    };
    if (!q && !department) {
        (0, cache_1.publicCache)(res, 30);
        const key = `list:${validLevel ?? "all"}:${page}:${limit}`;
        return res.json(await (0, cache_1.cached)("programmes", key, 300, load));
    }
    (0, cache_1.noStore)(res);
    res.json(await load());
});
// GET /api/programmes/:idOrSlug  (public)
exports.getProgramme = (0, helpers_1.asyncHandler)(async (req, res) => {
    const key = req.params.idOrSlug;
    const ckey = `one:${key.slice(0, 200)}`;
    const hit = await (0, cache_1.cacheGet)("programmes", ckey);
    if (hit) {
        (0, cache_1.publicCache)(res, 30);
        return res.json(hit);
    }
    const programme = await Programme_1.default.findOne((0, mongoose_1.isValidObjectId)(key) ? { _id: key, isPublished: true } : { slug: key, isPublished: true });
    if (!programme)
        throw new helpers_1.ApiError(404, "Programme not found");
    const body = { success: true, data: programme };
    await (0, cache_1.cacheSet)("programmes", ckey, body, 300);
    (0, cache_1.publicCache)(res, 30);
    res.json(body);
});
// PATCH /api/programmes/:id  (admin, multipart)
exports.updateProgramme = (0, helpers_1.asyncHandler)(async (req, res) => {
    const programme = await Programme_1.default.findById(req.params.id);
    if (!programme)
        throw new helpers_1.ApiError(404, "Programme not found");
    Object.assign(programme, pickFields(req.body));
    const removeIds = new Set((0, helpers_1.toArray)(req.body.removeMedia));
    const removed = [];
    const keep = [];
    for (const m of programme.syllabus)
        (removeIds.has(String(m._id)) ? removed : keep).push(m);
    programme.syllabus = keep;
    const added = await (0, cloudinary_1.uploadFlatFiles)(uploadedFiles(req), FOLDER);
    programme.syllabus.push(...added);
    try {
        await programme.save();
    }
    catch (err) {
        await (0, cloudinary_1.deleteMedia)(added);
        throw err;
    }
    await (0, cloudinary_1.deleteMedia)(removed);
    await (0, cache_1.invalidate)("programmes");
    void (0, chatbotSync_1.syncProgramme)(programme);
    res.json({ success: true, data: programme });
});
// DELETE /api/programmes/:id  (admin)
exports.deleteProgramme = (0, helpers_1.asyncHandler)(async (req, res) => {
    const programme = await Programme_1.default.findByIdAndDelete(req.params.id);
    if (!programme)
        throw new helpers_1.ApiError(404, "Programme not found");
    await (0, cloudinary_1.deleteMedia)(programme.syllabus);
    await (0, cache_1.invalidate)("programmes");
    void (0, chatbotSync_1.removeProgramme)(String(programme._id));
    res.json({ success: true, message: "Programme deleted" });
});
