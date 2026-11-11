import { isValidObjectId } from "mongoose";
import Event from "../models/Event";
import Notice from "../models/Notice";
import Feature from "../models/Feature";
import Glance from "../models/Glance";
import Linkage from "../models/Linkage";
import Facility from "../models/Facility";
import { asyncHandler, ApiError } from "../utils/helpers";
import { noStore } from "../utils/cache";
import {
  getIndex,
  syncEvent,
  syncNotice,
  syncFeature,
  syncGlance,
  syncLinkage,
  syncFacility,
  syncProgramme,
} from "../utils/chatbotSync";

type Kind =
  | "event"
  | "notice"
  | "feature"
  | "glance"
  | "linkage"
  | "facility";
type PartStatus = "ok" | "missing" | "skipped" | "no_text";
type Part = { label: string; status: PartStatus; note?: string };
type Row = {
  kind: Kind;
  id: string;
  title: string;
  category?: string;
  updatedAt?: string;
  published: boolean;
  status: "indexed" | "partial" | "missing" | "draft";
  parts: Part[];
};

const syncers: Record<Kind, { model: any; sync: (d: any) => Promise<void> }> = {
  event: { model: Event, sync: syncEvent },
  notice: { model: Notice, sync: syncNotice },
  feature: { model: Feature, sync: syncFeature },
  glance: { model: Glance, sync: syncGlance },
  linkage: { model: Linkage, sync: syncLinkage },
  facility: { model: Facility, sync: syncFacility },
};

const isPdf = (m: any) => /\.pdf$/i.test(m.originalName ?? m.url ?? "");

async function buildRows(): Promise<Row[]> {
  const { ids, cache, empty } = await getIndex();
  const indexed = new Set(ids);
  const emptySet = new Set(empty ?? []); // `?? []` keeps this safe if the Node side deploys before the Python side
  const hasPrefix = (p: string) =>
    ids.some((i) => i === p || i.startsWith(p + ":"));
  const rows: Row[] = [];
  const finish = (base: Omit<Row, "status">): Row => {
    const missing = base.parts.filter((p) => p.status === "missing").length;
    const ok = base.parts.filter((p) => p.status === "ok").length;
    const status = !base.published
      ? "draft"
      : missing === 0
        ? "indexed"
        : ok === 0
          ? "missing"
          : "partial";
    return { ...base, status };
  };

  const photo = (name: string, docId: string, cacheKey: string): Part => {
    if (indexed.has(docId)) return { label: `Photo: ${name}`, status: "ok" };
    if (emptySet.has(docId) || cache[`${cacheKey}.txt`] === 0)
      return {
        label: `Photo: ${name}`,
        status: "no_text",
        note: "No readable text in this photo (normal)",
      };
    return {
      label: `Photo: ${name}`,
      status: "missing",
      note: "OCR failed or has not run",
    };
  };
  for (const e of await Event.find().lean()) {
    const id = String(e._id);
    const parts: Part[] = [
      {
        label: "Event details",
        status: indexed.has(`event:${id}`) ? "ok" : "missing",
      },
    ];
    for (const m of e.documents ?? []) {
      const name = m.originalName ?? "document";
      parts.push(
        isPdf(m)
          ? {
              label: `PDF: ${name}`,
              status: indexed.has(`event:${id}:doc:${m._id}`)
                ? "ok"
                : "missing",
            }
          : {
              label: `File: ${name}`,
              status: "skipped",
              note: "Only PDF files are read",
            },
      );
    }
    for (const m of e.images ?? [])
      parts.push(
        photo(
          m.originalName ?? "photo",
          `event:${id}:img:${m._id}`,
          `event_${id}_${m._id}`,
        ),
      );
    if (e.videos?.length)
      parts.push({
        label: `${e.videos.length} video(s)`,
        status: "skipped",
        note: "Videos are never read",
      });
    rows.push(
      finish({
        kind: "event",
        id,
        title: e.title,
        category: e.category,
        updatedAt: String((e as any).updatedAt ?? ""),
        published: e.isPublished !== false,
        parts,
      }),
    );
  }

  for (const n of await Notice.find().lean()) {
    const id = String(n._id);
    const parts: Part[] = [];
    if (n.text?.trim())
      parts.push({
        label: "Typed text",
        status: indexed.has(`kb:notice:${id}:text`) ? "ok" : "missing",
      });
    for (const m of n.files ?? []) {
      const name = m.originalName ?? "file";
      const docId = `kb:notice:${id}:${m._id}`;
      parts.push(
        m.resourceType === "image"
          ? photo(name, docId, `kb_notice_${id}_${m._id}`)
          : {
              label: `PDF: ${name}`,
              status: indexed.has(docId) ? "ok" : "missing",
            },
      );
    }
    rows.push(
      finish({
        kind: "notice",
        id,
        title: n.title,
        category: n.category,
        updatedAt: String((n as any).updatedAt ?? ""),
        published: n.isPublished !== false,
        parts,
      }),
    );
  }

  const simple = (
    kind: "feature" | "glance" | "linkage" | "facility",
    list: any[],
    title: (d: any) => string,
  ) => {
    for (const d of list) {
      const id = String(d._id);
      rows.push(
        finish({
          kind,
          id,
          title: title(d),
          updatedAt: String(d.updatedAt ?? ""),
          published: d.isPublished !== false,
          parts: [
            {
              label: "Content",
              status: hasPrefix(`kb:${kind}:${id}`) ? "ok" : "missing",
            },
          ],
        }),
      );
    }
  };
  simple("feature", await Feature.find().lean(), (d) => d.title);
  simple("glance", await Glance.find().lean(), (d) => d.label);
  simple("linkage", await Linkage.find().lean(), (d) => d.title);
  simple("facility", await Facility.find().lean(), (d) => d.name);

  const order = { missing: 0, partial: 1, indexed: 2, draft: 3 };
  return rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] || a.title.localeCompare(b.title),
  );
}

// GET /api/index/status   (admin)
export const getIndexStatus = asyncHandler(async (_req, res) => {
  let rows: Row[];
  try {
    rows = await buildRows();
  } catch (err: any) {
    throw new ApiError(502, `Could not reach the chatbot: ${err.message}`);
  }
  const count = (s: Row["status"]) => rows.filter((r) => r.status === s).length;
  noStore(res);
  res.json({
    success: true,
    data: {
      summary: {
        total: rows.length,
        indexed: count("indexed"),
        partial: count("partial"),
        missing: count("missing"),
        draft: count("draft"),
      },
      items: rows,
    },
  });
});

// POST /api/index/resync/:kind/:id   (admin)
export const resyncOne = asyncHandler(async (req, res) => {
  const kind = req.params.kind as Kind;
  const id = String(req.params.id);
  const entry = syncers[kind];
  if (!entry) throw new ApiError(400, "Unknown kind");
  if (!isValidObjectId(id)) throw new ApiError(400, "Invalid id");

  const doc = await entry.model.findById(id);
  if (!doc) throw new ApiError(404, "Item not found");
  await entry.sync(doc);
  res.json({
    success: true,
    message: "Re-sync queued. Refresh in a minute to see the result.",
  });
});

// POST /api/index/resync-missing   (admin) – every published item that is missing or partial
export const resyncMissing = asyncHandler(async (_req, res) => {
  let rows: Row[];
  try {
    rows = await buildRows();
  } catch (err: any) {
    throw new ApiError(502, `Could not reach the chatbot: ${err.message}`);
  }
  const todo = rows.filter(
    (r) => r.status === "missing" || r.status === "partial",
  );
  for (const r of todo) {
    const doc = await syncers[r.kind].model.findById(r.id);
    if (doc) await syncers[r.kind].sync(doc); // only queues the job, the chatbot works through them one by one
  }
  res.json({ success: true, queued: todo.length });
});
