import { Request } from "express";
import { isValidObjectId } from "mongoose";
import Feature, { FEATURE_SECTIONS, FeatureSection } from "../models/Feature";
import { asyncHandler, ApiError, toArray } from "../utils/helpers";
import { cached, invalidate, publicCache, noStore } from "../utils/cache";
import { removeRecord, syncFeature } from "../utils/chatbotSync";

const pickFields = (b: Request["body"]) => {
  const out: Record<string, any> = {};
  for (const k of ["title", "text", "icon", "section"]) if (b[k] !== undefined) out[k] = b[k];
  if (b.tags !== undefined) out.tags = toArray(b.tags).map((t) => t.trim()).filter(Boolean);
  if (b.order !== undefined && b.order !== "") out.order = Number(b.order);
  if (b.isPublished !== undefined) out.isPublished = b.isPublished === true || b.isPublished === "true";
  return out;
};

// validates AND narrows the type from string to "rdc" | "iic"
const parseSection = (value: unknown, fallback?: FeatureSection): FeatureSection | undefined => {
  if (value === undefined || value === "") return fallback;
  if (!(FEATURE_SECTIONS as readonly string[]).includes(value as string))
    throw new ApiError(400, `section must be one of: ${FEATURE_SECTIONS.join(", ")}`);
  return value as FeatureSection;
};

// GET /api/features?section=rdc   (public: published only)
export const getFeatures = asyncHandler(async (req, res) => {
  const section = parseSection(req.query.section, "rdc")!; // validated, so only 2 possible cache keys
  publicCache(res, 30);
  const body = await cached("features", `section:${section}`, 600, async () => ({
    success: true,
    data: await Feature.find({ section, isPublished: true }).sort({ order: 1, createdAt: 1 }),
  }));
  res.json(body);
});

// GET /api/features/admin/all?section=rdc   (admin: includes unpublished)
export const getAdminFeatures = asyncHandler(async (req, res) => {
  const section = parseSection(req.query.section);
  const items = await Feature.find(section ? { section } : {}).sort({ section: 1, order: 1 });
  noStore(res);
  res.json({ success: true, data: items });
});

// GET /api/features/:id
export const getFeature = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid id");
  const item = await Feature.findById(req.params.id);
  if (!item) throw new ApiError(404, "Feature not found");
  res.json({ success: true, data: item });
});

// POST /api/features   (admin, JSON)
export const createFeature = asyncHandler(async (req, res) => {
  const fields = pickFields(req.body);
  const section = parseSection(fields.section, "rdc")!;
  if (!fields.title) throw new ApiError(400, "Title is required");
  if (!fields.text) throw new ApiError(400, "Text is required");

  // put new card at the end of its section unless an order is given
  if (fields.order === undefined) {
    fields.order = await Feature.countDocuments({ section });
  }
  const item = await Feature.create({ ...fields, section, createdBy: req.user?.id });
  await invalidate("features");
  void syncFeature(item);
  res.status(201).json({ success: true, data: item });
});

// PATCH /api/features/:id   (admin, JSON)
export const updateFeature = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid id");
  const fields = pickFields(req.body);
  if (fields.section !== undefined) fields.section = parseSection(fields.section);

  const item = await Feature.findByIdAndUpdate(req.params.id, fields, { new: true, runValidators: true });
  if (!item) throw new ApiError(404, "Feature not found");
  await invalidate("features");
  void syncFeature(item);
  res.json({ success: true, data: item });
});

// PATCH /api/features/reorder   (admin)  body: { items: [{ id, order }, ...] }
export const reorderFeatures = asyncHandler(async (req, res) => {
  const items = req.body.items as { id: string; order: number }[];
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "items array is required");
  if (items.some((i) => !isValidObjectId(i.id) || typeof i.order !== "number"))
    throw new ApiError(400, "Each item needs a valid id and numeric order");

  await Feature.bulkWrite(
    items.map((i) => ({ updateOne: { filter: { _id: i.id }, update: { $set: { order: i.order } } } }))
  );
  await invalidate("features");
  res.json({ success: true, message: "Order updated" });
});

// DELETE /api/features/:id   (admin)
export const deleteFeature = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid id");
  const item = await Feature.findByIdAndDelete(req.params.id);
  if (!item) throw new ApiError(404, "Feature not found");
  await invalidate("features");
  void removeRecord("feature", String(item._id));
  res.json({ success: true, message: "Feature deleted" });
});