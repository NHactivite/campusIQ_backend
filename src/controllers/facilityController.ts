import { Request } from "express";
import { isValidObjectId } from "mongoose";
import Facility, { FACILITY_CATEGORIES } from "../models/Facility";
import { IMedia } from "../models/Event";
import { uploadEventFiles, deleteMedia } from "../utils/cloudinary";
import { asyncHandler, ApiError, slugify, toArray } from "../utils/helpers";
import { cached, cacheGet, cacheSet, invalidate, publicCache, noStore } from "../utils/cache";
import { syncFacility, removeFacility } from "../utils/chatbotSync";

type Files = { [field: string]: Express.Multer.File[] } | undefined;
const folderFor = (slug: string) => `campusiq/facilities/${slug}`;
const allMedia = (f: { images: IMedia[]; documents: IMedia[] }) =>
  [...f.images, ...f.documents];

const pickFields = (b: Request["body"]) => {
  const out: Record<string, any> = {};
  for (const k of ["name", "description", "category", "location", "operatingHours", "contactDetails"])
    if (b[k] !== undefined) out[k] = b[k];
  if (b.amenities !== undefined) {
    out.amenities = toArray(b.amenities);
  }
  if (b.isPublished !== undefined)
    out.isPublished = b.isPublished === true || b.isPublished === "true";
  return out;
};

// GET /api/facilities/admin/all  (admin)
export const getAdminFacilities = asyncHandler(async (_req, res) => {
  const data = await Facility.find().sort({ createdAt: -1 });
  noStore(res);
  res.json({ success: true, data });
});

// POST /api/facilities  (admin, multipart)
export const createFacility = asyncHandler(async (req, res) => {
  const fields = pickFields(req.body);
  if (!fields.name) throw new ApiError(400, "Name is required");
  if (!fields.description) throw new ApiError(400, "Description is required");

  const facility = new Facility({
    ...fields,
    slug: slugify(fields.name),
    createdBy: req.user?.id,
  });

  const uploaded = await uploadEventFiles(req.files as Files, folderFor(facility.slug));
  facility.images = uploaded.images;
  facility.documents = uploaded.documents;

  try {
    await facility.save();
  } catch (err) {
    await deleteMedia(allMedia(uploaded));
    throw err;
  }
  await invalidate("facilities");
  void syncFacility(facility);
  res.status(201).json({ success: true, data: facility });
});

// GET /api/facilities  (public: published only)
export const getFacilities = asyncHandler(async (req, res) => {
  const { category, search } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));

  const validCategory =
    category && (FACILITY_CATEGORIES as readonly string[]).includes(category)
      ? category
      : undefined;
  const q = (search ?? "").trim().slice(0, 100);

  const filter: Record<string, any> = { isPublished: true };
  if (validCategory) filter.category = validCategory;
  if (q) {
    const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ name: rx }, { description: rx }, { location: rx }];
  }

  const load = async () => {
    const [data, total] = await Promise.all([
      Facility.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Facility.countDocuments(filter),
    ]);
    return { success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  };

  if (!q) {
    publicCache(res, 30);
    const key = `list:${validCategory ?? "all"}:${page}:${limit}`;
    return res.json(await cached("facilities", key, 300, load));
  }
  noStore(res);
  res.json(await load());
});

// GET /api/facilities/:idOrSlug  (public)
export const getFacility = asyncHandler(async (req, res) => {
  const key = req.params.idOrSlug as string;
  const ckey = `one:${key.slice(0, 200)}`;

  const hit = await cacheGet<{ success: boolean; data: unknown }>("facilities", ckey);
  if (hit) {
    publicCache(res, 30);
    return res.json(hit);
  }

  const facility = await Facility.findOne(
    isValidObjectId(key) ? { _id: key, isPublished: true } : { slug: key, isPublished: true }
  );
  if (!facility) throw new ApiError(404, "Facility not found");

  const body = { success: true, data: facility };
  await cacheSet("facilities", ckey, body, 300);
  publicCache(res, 30);
  res.json(body);
});

// PATCH /api/facilities/:id  (admin, multipart)
export const updateFacility = asyncHandler(async (req, res) => {
  const facility = await Facility.findById(req.params.id);
  if (!facility) throw new ApiError(404, "Facility not found");

  Object.assign(facility, pickFields(req.body));

  const removeIds = new Set(toArray(req.body.removeMedia));
  const removed: IMedia[] = [];
  for (const key of ["images", "documents"] as const) {
    const keep: IMedia[] = [];
    for (const m of facility[key])
      (removeIds.has(String(m._id)) ? removed : keep).push(m);
    facility[key] = keep as any;
  }

  const uploaded = await uploadEventFiles(req.files as Files, folderFor(facility.slug));
  facility.images.push(...(uploaded.images as any));
  facility.documents.push(...(uploaded.documents as any));

  try {
    await facility.save();
  } catch (err) {
    await deleteMedia([...uploaded.images, ...uploaded.documents]);
    throw err;
  }
  await deleteMedia(removed);
  await invalidate("facilities");
  void syncFacility(facility);
  res.json({ success: true, data: facility });
});

// DELETE /api/facilities/:id  (admin)
export const deleteFacility = asyncHandler(async (req, res) => {
  const facility = await Facility.findByIdAndDelete(req.params.id);
  if (!facility) throw new ApiError(404, "Facility not found");
  await deleteMedia(allMedia(facility));
  await invalidate("facilities");
  void removeFacility(String(facility._id));
  res.json({ success: true, message: "Facility deleted" });
});
