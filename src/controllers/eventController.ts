import { Request, Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import Event, { IMedia, EVENT_CATEGORIES } from "../models/Event";
import { uploadEventFiles, deleteMedia } from "../utils/cloudinary";
import { asyncHandler, ApiError, slugify, toArray } from "../utils/helpers";
import { cached, cacheGet, cacheSet, invalidate, publicCache, noStore } from "../utils/cache";
import { removeEvent, syncEvent, generateEventReport } from "../utils/chatbotSync";

type Files = { [field: string]: Express.Multer.File[] } | undefined;
const folderFor = (slug: string) => `iic/events/${slug}`;
const allMedia = (e: { images: IMedia[]; videos: IMedia[]; documents: IMedia[] }) =>
  [...e.images, ...e.videos, ...e.documents];

const pickFields = (b: Request["body"]) => {
  const out: Record<string, any> = {};
  for (const k of ["title", "description", "category", "venue", "organiser", "outcome"]) if (b[k] !== undefined) out[k] = b[k];
  if (b.eventDate) out.eventDate = new Date(b.eventDate);
  if (b.endDate) out.endDate = new Date(b.endDate);
  if (b.participants !== undefined && b.participants !== "") out.participants = Number(b.participants);
  if (b.isPublished !== undefined) out.isPublished = b.isPublished === true || b.isPublished === "true";
  return out;
};

// POST /api/events  (admin, multipart/form-data)
export const createEvent = asyncHandler(async (req, res) => {
  const fields = pickFields(req.body);
  if (!fields.title) throw new ApiError(400, "Title is required");

  const event = new Event({ ...fields, slug: slugify(fields.title), createdBy: req.user?.id });
  const uploaded = await uploadEventFiles(req.files as Files, folderFor(event.title));
  event.images = uploaded.images;
  event.videos = uploaded.videos;
  event.documents = uploaded.documents;

  try {
    await event.save();
  } catch (err) {
    await deleteMedia(allMedia(uploaded)); // don't leave orphan files in Cloudinary
    throw err;
  }
  await invalidate("events");
  void syncEvent(event);
  res.status(201).json({ success: true, data: event });
});

// GET /api/events  (public: published only)
// ?category=IIC&search=hackathon&status=upcoming|past&page=1&limit=12
export const getEvents = asyncHandler(async (req, res) => buildList(req, res, true));

// GET /api/events/admin/all  (admin: includes drafts)
// extra admin filter: ?published=true|false
export const getAdminEvents = asyncHandler(async (req, res) => buildList(req, res, false));

async function buildList(req: Request, res: Response, publicOnly: boolean) {
  const { category, search, status, published } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));

  // only accept known values, so junk query strings can't create endless cache keys
  const validCategory = category && (EVENT_CATEGORIES as readonly string[]).includes(category) ? category : undefined;
  const validStatus = status === "upcoming" || status === "past" ? status : undefined;

  const filter: Record<string, any> = {};
  if (publicOnly) filter.isPublished = true;
  else if (published === "true") filter.isPublished = true;    // admin only
  else if (published === "false") filter.isPublished = false;  // admin only
  if (validCategory) filter.category = validCategory;
  if (search) filter.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (validStatus === "upcoming") filter.eventDate = { $gte: new Date() };
  if (validStatus === "past") filter.eventDate = { $lt: new Date() };

  const load = async () => {
    const [items, total] = await Promise.all([
      Event.find(filter).sort({ eventDate: -1 }).skip((page - 1) * limit).limit(limit),
      Event.countDocuments(filter),
    ]);
    return { success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  };

  // Only the public list is cached. Searches are skipped (every query is different),
  // and the admin list is never cached so admins always see their latest edits.
  if (publicOnly && !search) {
    publicCache(res, 30);
    const key = `list:${validCategory ?? ""}:${validStatus ?? ""}:${page}:${limit}`;
    return res.json(await cached("events", key, 120, load));
  }
  noStore(res);
  res.json(await load());
}

// GET /api/events/admin/stats  (admin) – exact counts, however many events exist
export const getEventStats = asyncHandler(async (_req, res) => {
  const now = new Date();
  const [total, upcoming, drafts, byCategory, recent] = await Promise.all([
    Event.countDocuments(),
    Event.countDocuments({ eventDate: { $gte: now } }),
    Event.countDocuments({ isPublished: false }),
    Event.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
    Event.find().sort({ eventDate: -1 }).limit(5),
  ]);

  noStore(res);
  res.json({
    success: true,
    data: {
      total,
      upcoming,
      past: total - upcoming,
      drafts,
      byCategory: Object.fromEntries(byCategory.map((c) => [c._id, c.count])),
      recent,
    },
  });
});

// GET /api/events/:idOrSlug  (public)
export const getEvent = asyncHandler(async (req, res) => {
  const key = req.params.idOrSlug as string;
  const ckey = `one:${key.slice(0, 200)}`;

  const hit = await cacheGet<{ success: boolean; data: unknown }>("events", ckey);
  if (hit) {
    publicCache(res, 30);
    return res.json(hit);
  }

  const event = await Event.findOne(isValidObjectId(key) ? { _id: key } : { slug: key });
  if (!event || (!event.isPublished && req.user?.role !== "admin")) throw new ApiError(404, "Event not found");

  const body = { success: true, data: event };
  if (event.isPublished) {
    // only published events are stored, so a draft (visible to admins) never leaks to the public
    await cacheSet("events", ckey, body, 300);
    publicCache(res, 30);
  } else {
    noStore(res);
  }
  res.json(body);
});

// PATCH /api/events/:id  (admin, multipart) – edit fields, add files, remove files via `removeMedia`
export const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  Object.assign(event, pickFields(req.body));

  // remove selected media (ids of the media subdocuments)
  const removeIds = new Set(toArray(req.body.removeMedia));
  const removed: IMedia[] = [];
  for (const key of ["images", "videos", "documents"] as const) {
    const keep: IMedia[] = [];
    for (const m of event[key]) (removeIds.has(String(m._id)) ? removed : keep).push(m);
    event[key] = keep as any;
  }

  // add newly uploaded media
  const uploaded = await uploadEventFiles(req.files as Files, folderFor(event.slug));
  event.images.push(...(uploaded.images as any));
  event.videos.push(...(uploaded.videos as any));
  event.documents.push(...(uploaded.documents as any));

  try {
    await event.save();
  } catch (err) {
    await deleteMedia(allMedia(uploaded));
    throw err;
  }
  await deleteMedia(removed); // only after the DB save succeeded
  await invalidate("events");
  void syncEvent(event);
  res.json({ success: true, data: event });
});

// DELETE /api/events/:id  (admin)
export const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findByIdAndDelete(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");
  await deleteMedia(allMedia(event));
  await invalidate("events");
  void removeEvent(String(event._id));
  res.json({ success: true, message: "Event deleted" });
});

// DELETE /api/events/:id/media/:mediaId  (admin)
export const deleteEventMedia = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  const mediaId = req.params.mediaId as string;
  let removed: IMedia | undefined;
  for (const key of ["images", "videos", "documents"] as const) {
    const found = event[key].find((m) => String(m._id) === mediaId);
    if (found) { removed = found; event[key] = event[key].filter((m) => String(m._id) !== mediaId) as any; break; }
  }
  if (!removed) throw new ApiError(404, "Media not found");

  await event.save();
  await deleteMedia([removed]);
  await invalidate("events");
  void syncEvent(event); 
  res.json({ success: true, data: event });
});



// GET /api/events/:id/report  (admin) – PDF report written by the chatbot
export const getEventReport = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");
  let pdf: Buffer;
  try {
    pdf = await generateEventReport(event);
  } catch (err: any) {
    throw new ApiError(502, `Could not generate the report: ${err.message}`);
  }
  noStore(res);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${event.slug}-report.pdf"`,
  });
  res.send(pdf);
});