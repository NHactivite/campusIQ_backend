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
exports.deleteLinkage = exports.reorderLinkages = exports.updateLinkage = exports.createLinkage = exports.getLinkage = exports.getAdminLinkages = exports.getLinkages = void 0;
const mongoose_1 = require("mongoose");
const Linkage_1 = __importStar(require("../models/Linkage"));
const helpers_1 = require("../utils/helpers");
const cache_1 = require("../utils/cache");
const chatbotSync_1 = require("../utils/chatbotSync");
const pickFields = (b) => {
    const out = {};
    for (const k of ["title", "status", "text"])
        if (b[k] !== undefined)
            out[k] = String(b[k]).trim();
    if (b.order !== undefined && b.order !== "")
        out.order = Number(b.order);
    if (b.isPublished !== undefined)
        out.isPublished = b.isPublished === true || b.isPublished === "true";
    return out;
};
// validates AND narrows string -> LinkageStatus
const parseStatus = (value) => {
    if (value === undefined || value === "")
        return undefined;
    if (!Linkage_1.LINKAGE_STATUSES.includes(value))
        throw new helpers_1.ApiError(400, `status must be one of: ${Linkage_1.LINKAGE_STATUSES.join(", ")}`);
    return value;
};
// GET /api/linkages?status=Initiated   (public: published only, status optional)
exports.getLinkages = (0, helpers_1.asyncHandler)(async (req, res) => {
    const status = parseStatus(req.query.status); // validated, so the cache key space is tiny
    (0, cache_1.publicCache)(res, 30);
    const body = await (0, cache_1.cached)("linkages", `status:${status ?? "all"}`, 600, async () => ({
        success: true,
        data: await Linkage_1.default.find({ isPublished: true, ...(status && { status }) }).sort({ order: 1, createdAt: 1 }),
    }));
    res.json(body);
});
// GET /api/linkages/admin/all   (admin: includes hidden)
exports.getAdminLinkages = (0, helpers_1.asyncHandler)(async (_req, res) => {
    const items = await Linkage_1.default.find().sort({ order: 1, createdAt: 1 });
    (0, cache_1.noStore)(res);
    res.json({ success: true, data: items });
});
// GET /api/linkages/:id
exports.getLinkage = (0, helpers_1.asyncHandler)(async (req, res) => {
    if (!(0, mongoose_1.isValidObjectId)(req.params.id))
        throw new helpers_1.ApiError(400, "Invalid id");
    const item = await Linkage_1.default.findById(req.params.id);
    if (!item)
        throw new helpers_1.ApiError(404, "Linkage not found");
    res.json({ success: true, data: item });
});
// POST /api/linkages   (admin, JSON)
exports.createLinkage = (0, helpers_1.asyncHandler)(async (req, res) => {
    const fields = pickFields(req.body);
    const status = parseStatus(fields.status);
    if (!fields.title)
        throw new helpers_1.ApiError(400, "Title is required");
    if (!status)
        throw new helpers_1.ApiError(400, "Status is required");
    if (!fields.text)
        throw new helpers_1.ApiError(400, "Text is required");
    if (fields.order === undefined)
        fields.order = await Linkage_1.default.countDocuments();
    const item = await Linkage_1.default.create({ ...fields, status, createdBy: req.user?.id });
    await (0, cache_1.invalidate)("linkages");
    void (0, chatbotSync_1.syncLinkage)(item);
    res.status(201).json({ success: true, data: item });
});
// PATCH /api/linkages/:id   (admin, JSON)
exports.updateLinkage = (0, helpers_1.asyncHandler)(async (req, res) => {
    if (!(0, mongoose_1.isValidObjectId)(req.params.id))
        throw new helpers_1.ApiError(400, "Invalid id");
    const fields = pickFields(req.body);
    if (fields.status !== undefined)
        fields.status = parseStatus(fields.status);
    const item = await Linkage_1.default.findByIdAndUpdate(req.params.id, fields, { new: true, runValidators: true });
    if (!item)
        throw new helpers_1.ApiError(404, "Linkage not found");
    await (0, cache_1.invalidate)("linkages");
    void (0, chatbotSync_1.syncLinkage)(item);
    res.json({ success: true, data: item });
});
// PATCH /api/linkages/reorder   (admin)  body: { items: [{ id, order }] }
exports.reorderLinkages = (0, helpers_1.asyncHandler)(async (req, res) => {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0)
        throw new helpers_1.ApiError(400, "items array is required");
    if (items.some((i) => !(0, mongoose_1.isValidObjectId)(i.id) || typeof i.order !== "number"))
        throw new helpers_1.ApiError(400, "Each item needs a valid id and numeric order");
    await Linkage_1.default.bulkWrite(items.map((i) => ({ updateOne: { filter: { _id: i.id }, update: { $set: { order: i.order } } } })));
    await (0, cache_1.invalidate)("linkages");
    res.json({ success: true, message: "Order updated" });
});
// DELETE /api/linkages/:id   (admin)
exports.deleteLinkage = (0, helpers_1.asyncHandler)(async (req, res) => {
    if (!(0, mongoose_1.isValidObjectId)(req.params.id))
        throw new helpers_1.ApiError(400, "Invalid id");
    const item = await Linkage_1.default.findByIdAndDelete(req.params.id);
    if (!item)
        throw new helpers_1.ApiError(404, "Linkage not found");
    await (0, cache_1.invalidate)("linkages");
    void (0, chatbotSync_1.removeRecord)("linkage", String(item._id));
    res.json({ success: true, message: "Linkage deleted" });
});
