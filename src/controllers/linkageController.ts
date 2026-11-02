import { Request } from "express";
import { isValidObjectId } from "mongoose";
import Linkage, { LINKAGE_STATUSES, LinkageStatus } from "../models/Linkage";
import { asyncHandler, ApiError } from "../utils/helpers";
import { cached, invalidate, publicCache, noStore } from "../utils/cache";
import { removeRecord, syncLinkage } from "../utils/chatbotSync";

const pickFields = (b: Request["body"]) => {
  const out: Record<string, any> = {};
  for (const k of ["title", "status", "text"]) if (b[k] !== undefined) out[k] = String(b[k]).trim();
  if (b.order !== undefined && b.order !== "") out.order = Number(b.order);
  if (b.isPublished !== undefined) out.isPublished = b.isPublished === true || b.isPublished === "true";
  return out;
};

// validates AND narrows string -> LinkageStatus
const parseStatus = (value: unknown): LinkageStatus | undefined => {
  if (value === undefined || value === "") return undefined;
  if (!(LINKAGE_STATUSES as readonly string[]).includes(value as string))
    throw new ApiError(400, `status must be one of: ${LINKAGE_STATUSES.join(", ")}`);
  return value as LinkageStatus;
};

// GET /api/linkages?status=Initiated   (public: published only, status optional)
export const getLinkages = asyncHandler(async (req, res) => {
  const status = parseStatus(req.query.status); // validated, so the cache key space is tiny
  publicCache(res, 30);
  const body = await cached("linkages", `status:${status ?? "all"}`, 600, async () => ({
    success: true,
    data: await Linkage.find({ isPublished: true, ...(status && { status }) }).sort({ order: 1, createdAt: 1 }),
  }));
  res.json(body);
});

// GET /api/linkages/admin/all   (admin: includes hidden)
export const getAdminLinkages = asyncHandler(async (_req, res) => {
  const items = await Linkage.find().sort({ order: 1, createdAt: 1 });
  noStore(res);
  res.json({ success: true, data: items });
});

// GET /api/linkages/:id
export const getLinkage = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid id");
  const item = await Linkage.findById(req.params.id);
  if (!item) throw new ApiError(404, "Linkage not found");
  res.json({ success: true, data: item });
});

// POST /api/linkages   (admin, JSON)
export const createLinkage = asyncHandler(async (req, res) => {
  const fields = pickFields(req.body);
  const status = parseStatus(fields.status);
  if (!fields.title) throw new ApiError(400, "Title is required");
  if (!status) throw new ApiError(400, "Status is required");
  if (!fields.text) throw new ApiError(400, "Text is required");

  if (fields.order === undefined) fields.order = await Linkage.countDocuments();
  const item = await Linkage.create({ ...fields, status, createdBy: req.user?.id });
  await invalidate("linkages");
  void syncLinkage(item);
  res.status(201).json({ success: true, data: item });
});

// PATCH /api/linkages/:id   (admin, JSON)
export const updateLinkage = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid id");
  const fields = pickFields(req.body);
  if (fields.status !== undefined) fields.status = parseStatus(fields.status);

  const item = await Linkage.findByIdAndUpdate(req.params.id, fields, { new: true, runValidators: true });
  if (!item) throw new ApiError(404, "Linkage not found");
  await invalidate("linkages");
  void syncLinkage(item);
  res.json({ success: true, data: item });
});

// PATCH /api/linkages/reorder   (admin)  body: { items: [{ id, order }] }
export const reorderLinkages = asyncHandler(async (req, res) => {
  const items = req.body.items as { id: string; order: number }[];
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "items array is required");
  if (items.some((i) => !isValidObjectId(i.id) || typeof i.order !== "number"))
    throw new ApiError(400, "Each item needs a valid id and numeric order");

  await Linkage.bulkWrite(
    items.map((i) => ({ updateOne: { filter: { _id: i.id }, update: { $set: { order: i.order } } } }))
  );
  await invalidate("linkages");
  res.json({ success: true, message: "Order updated" });
});

// DELETE /api/linkages/:id   (admin)
export const deleteLinkage = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid id");
  const item = await Linkage.findByIdAndDelete(req.params.id);
  if (!item) throw new ApiError(404, "Linkage not found");
  await invalidate("linkages");
  void removeRecord("linkage", String(item._id));
  res.json({ success: true, message: "Linkage deleted" });
});