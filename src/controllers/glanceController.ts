import { Request } from "express";
import { isValidObjectId } from "mongoose";
import Glance from "../models/Glance";
import { asyncHandler, ApiError } from "../utils/helpers";
import { cached, invalidate, publicCache, noStore } from "../utils/cache";
import { removeRecord, syncGlance } from "../utils/chatbotSync";

const pickFields = (b: Request["body"]) => {
  const out: Record<string, any> = {};
  for (const k of ["value", "label", "text", "category", "footnote"])
    if (b[k] !== undefined) out[k] = String(b[k]).trim();
  if (b.order !== undefined && b.order !== "") out.order = Number(b.order);
  if (b.isPublished !== undefined) out.isPublished = b.isPublished === true || b.isPublished === "true";
  if (b.highlight !== undefined) out.highlight = b.highlight === true || b.highlight === "true";
  return out;
};

// GET /api/glance   (public: published only)
export const getGlance = asyncHandler(async (_req, res) => {
  publicCache(res, 30);
  const body = await cached("glance", "all", 600, async () => ({
    success: true,
    data: await Glance.find({ isPublished: true }).sort({ order: 1, createdAt: 1 }),
  }));
  res.json(body);
});

// GET /api/glance/admin/all   (admin: includes hidden)
export const getAdminGlance = asyncHandler(async (_req, res) => {
  const items = await Glance.find().sort({ order: 1, createdAt: 1 });
  noStore(res);
  res.json({ success: true, data: items });
});

// POST /api/glance   (admin, JSON)
export const createGlance = asyncHandler(async (req, res) => {
  const fields = pickFields(req.body);
  if (!fields.value) throw new ApiError(400, "Value is required");
  if (!fields.label) throw new ApiError(400, "Label is required");
  if (!fields.text) throw new ApiError(400, "Text is required");

  if (fields.order === undefined) fields.order = await Glance.countDocuments();
  const item = await Glance.create({ ...fields, createdBy: req.user?.id });
  await invalidate("glance");
   void syncGlance(item);
  res.status(201).json({ success: true, data: item });
});

// PATCH /api/glance/:id   (admin, JSON)
export const updateGlance = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid id");
  const item = await Glance.findByIdAndUpdate(req.params.id, pickFields(req.body), { new: true, runValidators: true });
  if (!item) throw new ApiError(404, "Card not found");
  await invalidate("glance");
  void syncGlance(item);
  res.json({ success: true, data: item });
});

// PATCH /api/glance/reorder   (admin)  body: { items: [{ id, order }] }
export const reorderGlance = asyncHandler(async (req, res) => {
  const items = req.body.items as { id: string; order: number }[];
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "items array is required");
  if (items.some((i) => !isValidObjectId(i.id) || typeof i.order !== "number"))
    throw new ApiError(400, "Each item needs a valid id and numeric order");

  await Glance.bulkWrite(
    items.map((i) => ({ updateOne: { filter: { _id: i.id }, update: { $set: { order: i.order } } } }))
  );
  await invalidate("glance");
  res.json({ success: true, message: "Order updated" });
});

// DELETE /api/glance/:id   (admin)
export const deleteGlance = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid id");
  const item = await Glance.findByIdAndDelete(req.params.id);
  if (!item) throw new ApiError(404, "Card not found");
  await invalidate("glance");
  void removeRecord("glance", String(item._id));
  res.json({ success: true, message: "Card deleted" });
});