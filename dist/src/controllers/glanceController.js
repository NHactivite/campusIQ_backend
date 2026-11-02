"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteGlance = exports.reorderGlance = exports.updateGlance = exports.createGlance = exports.getAdminGlance = exports.getGlance = void 0;
const mongoose_1 = require("mongoose");
const Glance_1 = __importDefault(require("../models/Glance"));
const helpers_1 = require("../utils/helpers");
const cache_1 = require("../utils/cache");
const pickFields = (b) => {
    const out = {};
    for (const k of ["value", "label", "text", "category", "footnote"])
        if (b[k] !== undefined)
            out[k] = String(b[k]).trim();
    if (b.order !== undefined && b.order !== "")
        out.order = Number(b.order);
    if (b.isPublished !== undefined)
        out.isPublished = b.isPublished === true || b.isPublished === "true";
    if (b.highlight !== undefined)
        out.highlight = b.highlight === true || b.highlight === "true";
    return out;
};
// GET /api/glance   (public: published only)
exports.getGlance = (0, helpers_1.asyncHandler)(async (_req, res) => {
    (0, cache_1.publicCache)(res, 30);
    const body = await (0, cache_1.cached)("glance", "all", 600, async () => ({
        success: true,
        data: await Glance_1.default.find({ isPublished: true }).sort({ order: 1, createdAt: 1 }),
    }));
    res.json(body);
});
// GET /api/glance/admin/all   (admin: includes hidden)
exports.getAdminGlance = (0, helpers_1.asyncHandler)(async (_req, res) => {
    const items = await Glance_1.default.find().sort({ order: 1, createdAt: 1 });
    (0, cache_1.noStore)(res);
    res.json({ success: true, data: items });
});
// POST /api/glance   (admin, JSON)
exports.createGlance = (0, helpers_1.asyncHandler)(async (req, res) => {
    const fields = pickFields(req.body);
    if (!fields.value)
        throw new helpers_1.ApiError(400, "Value is required");
    if (!fields.label)
        throw new helpers_1.ApiError(400, "Label is required");
    if (!fields.text)
        throw new helpers_1.ApiError(400, "Text is required");
    if (fields.order === undefined)
        fields.order = await Glance_1.default.countDocuments();
    const item = await Glance_1.default.create({ ...fields, createdBy: req.user?.id });
    await (0, cache_1.invalidate)("glance");
    res.status(201).json({ success: true, data: item });
});
// PATCH /api/glance/:id   (admin, JSON)
exports.updateGlance = (0, helpers_1.asyncHandler)(async (req, res) => {
    if (!(0, mongoose_1.isValidObjectId)(req.params.id))
        throw new helpers_1.ApiError(400, "Invalid id");
    const item = await Glance_1.default.findByIdAndUpdate(req.params.id, pickFields(req.body), { new: true, runValidators: true });
    if (!item)
        throw new helpers_1.ApiError(404, "Card not found");
    await (0, cache_1.invalidate)("glance");
    res.json({ success: true, data: item });
});
// PATCH /api/glance/reorder   (admin)  body: { items: [{ id, order }] }
exports.reorderGlance = (0, helpers_1.asyncHandler)(async (req, res) => {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0)
        throw new helpers_1.ApiError(400, "items array is required");
    if (items.some((i) => !(0, mongoose_1.isValidObjectId)(i.id) || typeof i.order !== "number"))
        throw new helpers_1.ApiError(400, "Each item needs a valid id and numeric order");
    await Glance_1.default.bulkWrite(items.map((i) => ({ updateOne: { filter: { _id: i.id }, update: { $set: { order: i.order } } } })));
    await (0, cache_1.invalidate)("glance");
    res.json({ success: true, message: "Order updated" });
});
// DELETE /api/glance/:id   (admin)
exports.deleteGlance = (0, helpers_1.asyncHandler)(async (req, res) => {
    if (!(0, mongoose_1.isValidObjectId)(req.params.id))
        throw new helpers_1.ApiError(400, "Invalid id");
    const item = await Glance_1.default.findByIdAndDelete(req.params.id);
    if (!item)
        throw new helpers_1.ApiError(404, "Card not found");
    await (0, cache_1.invalidate)("glance");
    res.json({ success: true, message: "Card deleted" });
});
