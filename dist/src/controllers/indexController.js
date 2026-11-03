"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resyncMissing = exports.resyncOne = exports.getIndexStatus = void 0;
const mongoose_1 = require("mongoose");
const Event_1 = __importDefault(require("../models/Event"));
const Notice_1 = __importDefault(require("../models/Notice"));
const Feature_1 = __importDefault(require("../models/Feature"));
const Glance_1 = __importDefault(require("../models/Glance"));
const Linkage_1 = __importDefault(require("../models/Linkage"));
const Facility_1 = __importDefault(require("../models/Facility"));
const Programme_1 = __importDefault(require("../models/Programme"));
const helpers_1 = require("../utils/helpers");
const cache_1 = require("../utils/cache");
const chatbotSync_1 = require("../utils/chatbotSync");
const syncers = {
    event: { model: Event_1.default, sync: chatbotSync_1.syncEvent },
    notice: { model: Notice_1.default, sync: chatbotSync_1.syncNotice },
    feature: { model: Feature_1.default, sync: chatbotSync_1.syncFeature },
    glance: { model: Glance_1.default, sync: chatbotSync_1.syncGlance },
    linkage: { model: Linkage_1.default, sync: chatbotSync_1.syncLinkage },
    facility: { model: Facility_1.default, sync: chatbotSync_1.syncFacility },
    programme: { model: Programme_1.default, sync: chatbotSync_1.syncProgramme },
};
const isPdf = (m) => /\.pdf$/i.test(m.originalName ?? m.url ?? "");
async function buildRows() {
    const { ids, cache } = await (0, chatbotSync_1.getIndex)();
    const indexed = new Set(ids);
    const hasPrefix = (p) => ids.some((i) => i === p || i.startsWith(p + ":"));
    const rows = [];
    const finish = (base) => {
        const missing = base.parts.filter((p) => p.status === "missing").length;
        const ok = base.parts.filter((p) => p.status === "ok").length;
        const status = !base.published ? "draft" : missing === 0 ? "indexed" : ok === 0 ? "missing" : "partial";
        return { ...base, status };
    };
    const photo = (name, docId, cacheKey) => {
        if (indexed.has(docId))
            return { label: `Photo: ${name}`, status: "ok" };
        if (cache[`${cacheKey}.txt`] === 0)
            return { label: `Photo: ${name}`, status: "no_text", note: "No readable text in this photo (normal)" };
        return { label: `Photo: ${name}`, status: "missing", note: "OCR failed or has not run" };
    };
    for (const e of await Event_1.default.find().lean()) {
        const id = String(e._id);
        const parts = [{ label: "Event details", status: indexed.has(`event:${id}`) ? "ok" : "missing" }];
        for (const m of e.documents ?? []) {
            const name = m.originalName ?? "document";
            parts.push(isPdf(m)
                ? { label: `PDF: ${name}`, status: indexed.has(`event:${id}:doc:${m._id}`) ? "ok" : "missing" }
                : { label: `File: ${name}`, status: "skipped", note: "Only PDF files are read" });
        }
        for (const m of e.images ?? [])
            parts.push(photo(m.originalName ?? "photo", `event:${id}:img:${m._id}`, `event_${id}_${m._id}`));
        if (e.videos?.length)
            parts.push({ label: `${e.videos.length} video(s)`, status: "skipped", note: "Videos are never read" });
        rows.push(finish({ kind: "event", id, title: e.title, category: e.category, updatedAt: String(e.updatedAt ?? ""), published: e.isPublished !== false, parts }));
    }
    for (const n of await Notice_1.default.find().lean()) {
        const id = String(n._id);
        const parts = [];
        if (n.text?.trim())
            parts.push({ label: "Typed text", status: indexed.has(`kb:notice:${id}:text`) ? "ok" : "missing" });
        for (const m of n.files ?? []) {
            const name = m.originalName ?? "file";
            const docId = `kb:notice:${id}:${m._id}`;
            parts.push(m.resourceType === "image"
                ? photo(name, docId, `kb_notice_${id}_${m._id}`)
                : { label: `PDF: ${name}`, status: indexed.has(docId) ? "ok" : "missing" });
        }
        rows.push(finish({ kind: "notice", id, title: n.title, category: n.category, updatedAt: String(n.updatedAt ?? ""), published: n.isPublished !== false, parts }));
    }
    const simple = (kind, list, title) => {
        for (const d of list) {
            const id = String(d._id);
            rows.push(finish({
                kind, id, title: title(d), updatedAt: String(d.updatedAt ?? ""), published: d.isPublished !== false,
                parts: [{ label: "Content", status: hasPrefix(`kb:${kind}:${id}`) ? "ok" : "missing" }],
            }));
        }
    };
    simple("feature", await Feature_1.default.find().lean(), (d) => d.title);
    simple("glance", await Glance_1.default.find().lean(), (d) => d.label);
    simple("linkage", await Linkage_1.default.find().lean(), (d) => d.title);
    simple("facility", await Facility_1.default.find().lean(), (d) => d.name);
    simple("programme", await Programme_1.default.find().lean(), (d) => d.name);
    const order = { missing: 0, partial: 1, indexed: 2, draft: 3 };
    return rows.sort((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title));
}
// GET /api/index/status   (admin)
exports.getIndexStatus = (0, helpers_1.asyncHandler)(async (_req, res) => {
    let rows;
    try {
        rows = await buildRows();
    }
    catch (err) {
        throw new helpers_1.ApiError(502, `Could not reach the chatbot: ${err.message}`);
    }
    const count = (s) => rows.filter((r) => r.status === s).length;
    (0, cache_1.noStore)(res);
    res.json({
        success: true,
        data: {
            summary: { total: rows.length, indexed: count("indexed"), partial: count("partial"), missing: count("missing"), draft: count("draft") },
            items: rows,
        },
    });
});
// POST /api/index/resync/:kind/:id   (admin)
exports.resyncOne = (0, helpers_1.asyncHandler)(async (req, res) => {
    const kind = req.params.kind;
    const id = String(req.params.id);
    const entry = syncers[kind];
    if (!entry)
        throw new helpers_1.ApiError(400, "Unknown kind");
    if (!(0, mongoose_1.isValidObjectId)(id))
        throw new helpers_1.ApiError(400, "Invalid id");
    const doc = await entry.model.findById(id);
    if (!doc)
        throw new helpers_1.ApiError(404, "Item not found");
    await entry.sync(doc);
    res.json({ success: true, message: "Re-sync queued. Refresh in a minute to see the result." });
});
// POST /api/index/resync-missing   (admin) – every published item that is missing or partial
exports.resyncMissing = (0, helpers_1.asyncHandler)(async (_req, res) => {
    let rows;
    try {
        rows = await buildRows();
    }
    catch (err) {
        throw new helpers_1.ApiError(502, `Could not reach the chatbot: ${err.message}`);
    }
    const todo = rows.filter((r) => r.status === "missing" || r.status === "partial");
    for (const r of todo) {
        const doc = await syncers[r.kind].model.findById(r.id);
        if (doc)
            await syncers[r.kind].sync(doc); // only queues the job, the chatbot works through them one by one
    }
    res.json({ success: true, queued: todo.length });
});
