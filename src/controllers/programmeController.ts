import { Request } from "express";
import { isValidObjectId } from "mongoose";
import Programme, { DEGREE_LEVELS } from "../models/Programme";
import { IMedia } from "../models/Event";
import { uploadFlatFiles, deleteMedia } from "../utils/cloudinary";
import { asyncHandler, ApiError, slugify, toArray } from "../utils/helpers";
import { cached, cacheGet, cacheSet, invalidate, publicCache, noStore } from "../utils/cache";
import { syncProgramme, removeProgramme } from "../utils/chatbotSync";

const FOLDER = "campusiq/programmes";
const uploadedFiles = (req: Request) =>
  (req.files as { syllabus?: Express.Multer.File[] } | undefined)?.syllabus;

const pickFields = (b: Request["body"]) => {
  const out: Record<string, any> = {};
  for (const k of ["name", "degreeLevel", "department", "duration", "eligibilityCriteria", "admissionRequirements", "courseOverview"])
    if (b[k] !== undefined) out[k] = b[k];
  if (b.availableSeats !== undefined && b.availableSeats !== "")
    out.availableSeats = Number(b.availableSeats);
  if (b.isPublished !== undefined)
    out.isPublished = b.isPublished === true || b.isPublished === "true";
  return out;
};

// GET /api/programmes/admin/all  (admin)
export const getAdminProgrammes = asyncHandler(async (_req, res) => {
  const data = await Programme.find().sort({ createdAt: -1 });
  noStore(res);
  res.json({ success: true, data });
});

// POST /api/programmes  (admin, multipart)
export const createProgramme = asyncHandler(async (req, res) => {
  const fields = pickFields(req.body);
  if (!fields.name) throw new ApiError(400, "Name is required");
  if (!fields.degreeLevel || !(DEGREE_LEVELS as readonly string[]).includes(fields.degreeLevel))
    throw new ApiError(400, `degreeLevel must be one of: ${DEGREE_LEVELS.join(", ")}`);
  if (!fields.department) throw new ApiError(400, "Department is required");
  if (!fields.duration) throw new ApiError(400, "Duration is required");

  const syllabus = await uploadFlatFiles(uploadedFiles(req), FOLDER);
  let programme;
  try {
    programme = await Programme.create({
      ...fields,
      slug: slugify(fields.name),
      syllabus,
      createdBy: req.user?.id,
    });
  } catch (err) {
    await deleteMedia(syllabus);
    throw err;
  }
  await invalidate("programmes");
  void syncProgramme(programme);
  res.status(201).json({ success: true, data: programme });
});

// GET /api/programmes  (public: published only)
export const getProgrammes = asyncHandler(async (req, res) => {
  const { degreeLevel, department, search } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));

  const validLevel =
    degreeLevel && (DEGREE_LEVELS as readonly string[]).includes(degreeLevel)
      ? degreeLevel
      : undefined;
  const q = (search ?? "").trim().slice(0, 100);

  const filter: Record<string, any> = { isPublished: true };
  if (validLevel) filter.degreeLevel = validLevel;
  if (department) {
    filter.department = { $regex: department.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }
  if (q) {
    const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ name: rx }, { department: rx }, { courseOverview: rx }];
  }

  const load = async () => {
    const [data, total] = await Promise.all([
      Programme.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Programme.countDocuments(filter),
    ]);
    return { success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  };

  if (!q && !department) {
    publicCache(res, 30);
    const key = `list:${validLevel ?? "all"}:${page}:${limit}`;
    return res.json(await cached("programmes", key, 300, load));
  }
  noStore(res);
  res.json(await load());
});

// GET /api/programmes/:idOrSlug  (public)
export const getProgramme = asyncHandler(async (req, res) => {
  const key = req.params.idOrSlug as string;
  const ckey = `one:${key.slice(0, 200)}`;

  const hit = await cacheGet<{ success: boolean; data: unknown }>("programmes", ckey);
  if (hit) {
    publicCache(res, 30);
    return res.json(hit);
  }

  const programme = await Programme.findOne(
    isValidObjectId(key) ? { _id: key, isPublished: true } : { slug: key, isPublished: true }
  );
  if (!programme) throw new ApiError(404, "Programme not found");

  const body = { success: true, data: programme };
  await cacheSet("programmes", ckey, body, 300);
  publicCache(res, 30);
  res.json(body);
});

// PATCH /api/programmes/:id  (admin, multipart)
export const updateProgramme = asyncHandler(async (req, res) => {
  const programme = await Programme.findById(req.params.id);
  if (!programme) throw new ApiError(404, "Programme not found");

  Object.assign(programme, pickFields(req.body));

  const removeIds = new Set(toArray(req.body.removeMedia));
  const removed: IMedia[] = [];
  const keep: IMedia[] = [];
  for (const m of programme.syllabus)
    (removeIds.has(String(m._id)) ? removed : keep).push(m);
  programme.syllabus = keep as any;

  const added = await uploadFlatFiles(uploadedFiles(req), FOLDER);
  programme.syllabus.push(...(added as any));

  try {
    await programme.save();
  } catch (err) {
    await deleteMedia(added);
    throw err;
  }
  await deleteMedia(removed);
  await invalidate("programmes");
  void syncProgramme(programme);
  res.json({ success: true, data: programme });
});

// DELETE /api/programmes/:id  (admin)
export const deleteProgramme = asyncHandler(async (req, res) => {
  const programme = await Programme.findByIdAndDelete(req.params.id);
  if (!programme) throw new ApiError(404, "Programme not found");
  await deleteMedia(programme.syllabus);
  await invalidate("programmes");
  void removeProgramme(String(programme._id));
  res.json({ success: true, message: "Programme deleted" });
});
