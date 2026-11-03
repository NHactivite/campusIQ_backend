"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatStats = exports.getUnanswered = exports.getThreadMessages = exports.getThreads = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const express_1 = require("@clerk/express");
const helpers_1 = require("../utils/helpers");
const cache_1 = require("../utils/cache");
// collections written by the chatbot
const threads = () => mongoose_1.default.connection.collection("chat_threads");
const messages = () => mongoose_1.default.connection.collection("chat_messages");
const page = (req, def = 20) => {
    const p = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || def));
    return { p, limit, skip: (p - 1) * limit };
};
// userId -> email, so admins see who asked
async function emails(ids) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length)
        return {};
    try {
        const res = await express_1.clerkClient.users.getUserList({ userId: unique, limit: unique.length });
        return Object.fromEntries(res.data.map((u) => [u.id, u.primaryEmailAddress?.emailAddress ?? u.id]));
    }
    catch {
        return {};
    }
}
const esc = (s) => s.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// GET /api/chats/admin/threads?search=&lang=&page=
exports.getThreads = (0, helpers_1.asyncHandler)(async (req, res) => {
    const { search, lang } = req.query;
    const { p, limit, skip } = page(req);
    const filter = {};
    if (search)
        filter.title = { $regex: esc(search), $options: "i" };
    if (lang === "en" || lang === "as")
        filter.lang = lang;
    const [rows, total] = await Promise.all([
        threads().find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).toArray(),
        threads().countDocuments(filter),
    ]);
    const mail = await emails(rows.map((r) => r.userId));
    (0, cache_1.noStore)(res);
    res.json({
        success: true,
        data: rows.map((r) => ({
            userId: r.userId, email: mail[r.userId] ?? r.userId, threadId: r.threadId,
            title: r.title, count: r.count ?? 0, lang: r.lang, updatedAt: r.updatedAt,
        })),
        pagination: { page: p, limit, total, pages: Math.ceil(total / limit) },
    });
});
// GET /api/chats/admin/threads/:userId/:threadId
exports.getThreadMessages = (0, helpers_1.asyncHandler)(async (req, res) => {
    const rows = await messages()
        .find({ userId: String(req.params.userId), threadId: String(req.params.threadId) })
        .sort({ ts: 1 })
        .toArray();
    (0, cache_1.noStore)(res);
    res.json({
        success: true,
        data: rows.map((m) => ({ role: m.role, text: m.text, sources: m.sources ?? [], ts: m.ts, answered: m.answered })),
    });
});
// GET /api/chats/admin/unanswered?page=   questions the documents could not answer
exports.getUnanswered = (0, helpers_1.asyncHandler)(async (req, res) => {
    const { p, limit, skip } = page(req);
    const filter = { role: "user", answered: false, text: { $regex: ".{12,}" } }; // skip "hi", "thanks"
    const [rows, total] = await Promise.all([
        messages().find(filter).sort({ ts: -1 }).skip(skip).limit(limit).toArray(),
        messages().countDocuments(filter),
    ]);
    const mail = await emails(rows.map((r) => r.userId));
    (0, cache_1.noStore)(res);
    res.json({
        success: true,
        data: rows.map((r) => ({ question: r.text, lang: r.lang, ts: r.ts, email: mail[r.userId] ?? r.userId })),
        pagination: { page: p, limit, total, pages: Math.ceil(total / limit) },
    });
});
// GET /api/chats/admin/stats
exports.getChatStats = (0, helpers_1.asyncHandler)(async (_req, res) => {
    const q = { role: "user" };
    const [conversations, questions, answered, assamese] = await Promise.all([
        threads().countDocuments(),
        messages().countDocuments(q),
        messages().countDocuments({ ...q, answered: true }),
        messages().countDocuments({ ...q, lang: "as" }),
    ]);
    (0, cache_1.noStore)(res);
    res.json({
        success: true,
        data: { conversations, questions, answered, unanswered: questions - answered, assamese, english: questions - assamese },
    });
});
