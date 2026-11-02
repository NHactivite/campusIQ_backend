import { Request } from "express";
import Notice, { NOTICE_CATEGORIES } from "../models/Notice";
import { IMedia } from "../models/Event";
import { uploadFlatFiles, deleteMedia } from "../utils/cloudinary";
import { asyncHandler, ApiError, toArray } from "../utils/helpers";
import { noStore, publicCache, cached, invalidate } from "../utils/cache";
import { syncNotice, removeNotice } from "../utils/chatbotSync";
import { isValidObjectId } from "mongoose";
const FOLDER = "iic/notices";
const uploadedFiles = (req: Request) =>
  (req.files as { files?: Express.Multer.File[] } | undefined)?.files;

const pickFields = (b: Request["body"]) => {
  const out: Record<string, any> = {};
  if (b.title !== undefined) out.title = String(b.title).trim();
  if (b.text !== undefined) out.text = String(b.text);
  if (b.category !== undefined) {
    if (!(NOTICE_CATEGORIES as readonly string[]).includes(b.category))
      throw new ApiError(400, `category must be one of: ${NOTICE_CATEGORIES.join(", ")}`);
    out.category = b.category;
  }
  if (b.noticeDate !== undefined) out.noticeDate = b.noticeDate ? new Date(b.noticeDate) : undefined;
  if (b.isPublished !== undefined) out.isPublished = b.isPublished === true || b.isPublished === "true";
  return out;
};

// GET /api/notices/admin/all  (admin)
export const getAdminNotices = asyncHandler(async (_req, res) => {
  const data = await Notice.find().sort({ createdAt: -1 });
  noStore(res);
  res.json({ success: true, data });
});

// POST /api/notices  (admin, multipart: files[])
export const createNotice = asyncHandler(async (req, res) => {
  const fields = pickFields(req.body);
  if (!fields.title) throw new ApiError(400, "Title is required");
  const incoming = uploadedFiles(req);
  if (!fields.text?.trim() && !incoming?.length) throw new ApiError(400, "Add some text or at least one file");

  const files = await uploadFlatFiles(incoming, FOLDER);
  let notice;
  try {
    notice = await Notice.create({ ...fields, files, createdBy: req.user?.id });
  } catch (err) {
    await deleteMedia(files); // no orphan files in Cloudinary
    throw err;
  }
  void syncNotice(notice); // not awaited: the admin doesn't wait for indexing
  await invalidate("notices"); 
  res.status(201).json({ success: true, data: notice });
});

// PATCH /api/notices/:id  (admin, multipart) – edit, add files, remove files via `removeMedia`
export const updateNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.findById(req.params.id);
  if (!notice) throw new ApiError(404, "Notice not found");

  Object.assign(notice, pickFields(req.body));

  const removeIds = new Set(toArray(req.body.removeMedia));
  const removed: IMedia[] = [];
  const keep: IMedia[] = [];
  for (const m of notice.files) (removeIds.has(String(m._id)) ? removed : keep).push(m);
  notice.files = keep as any;

  const added = await uploadFlatFiles(uploadedFiles(req), FOLDER);
  notice.files.push(...(added as any));

  if (!notice.text?.trim() && notice.files.length === 0) {
    await deleteMedia(added);
    throw new ApiError(400, "A notice needs some text or at least one file");
  }

  try {
    await notice.save();
  } catch (err) {
    await deleteMedia(added);
    throw err;
  }
  await deleteMedia(removed); // only after the DB save succeeded
  void syncNotice(notice);
  await invalidate("notices"); 
  res.json({ success: true, data: notice });
});

// DELETE /api/notices/:id  (admin)
export const deleteNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.findByIdAndDelete(req.params.id);
  if (!notice) throw new ApiError(404, "Notice not found");
  await deleteMedia(notice.files);
  void removeNotice(String(notice._id));
  await invalidate("notices");
  res.json({ success: true, message: "Notice deleted" });
});


// GET /api/notices?category=exams&search=fee&page=1&limit=10   (public: published only)
export const getNotices = asyncHandler(async (req, res) => {
  const { category, search } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  const validCategory =
    category && (NOTICE_CATEGORIES as readonly string[]).includes(category) ? category : undefined;
  const q = (search ?? "").trim().slice(0, 100);

  const filter: Record<string, any> = { isPublished: true };
  if (validCategory) filter.category = validCategory;
  if (q) {
    const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ title: rx }, { text: rx }];
  }

  const load = async () => {
    const [data, total] = await Promise.all([
      Notice.find(filter)
        .select("-createdBy")
        .sort({ noticeDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notice.countDocuments(filter),
    ]);
    return { success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  };

  publicCache(res, 30);

  // Searches are skipped (every query is different, so they would only fill Redis).
  // Category, page and limit are validated, so the number of cache keys stays small.
  if (!q) {
    const key = `list:${validCategory ?? "all"}:${page}:${limit}`;
    return res.json(await cached("notices", key, 300, load));
  }
  res.json(await load());
});

// GET /api/notices/:id   (public: published only)
export const getNotice = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw new ApiError(400, "Invalid id");

  publicCache(res, 30);

  // only published notices are cached, so a draft can never leak to the public
  const body = await cached("notices", `one:${id}`, 300, async () => {
    const notice = await Notice.findOne({ _id: id, isPublished: true }).select("-createdBy");
    return notice ? { success: true, data: notice } : null;
  });
  if (!body) throw new ApiError(404, "Notice not found");
  res.json(body);
});