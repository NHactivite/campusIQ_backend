"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTICE_CATEGORIES = void 0;
const mongoose_1 = require("mongoose");
exports.NOTICE_CATEGORIES = [
    "notices", "regulations", "exams", "scholarships", "admission", "facilities", "other",
];
const mediaSchema = new mongoose_1.Schema({
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "video", "raw"], required: true },
    format: String,
    bytes: Number,
    originalName: String,
    width: Number,
    height: Number,
    duration: Number,
}, { _id: true });
const noticeSchema = new mongoose_1.Schema({
    title: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, enum: exports.NOTICE_CATEGORIES, default: "notices", index: true },
    noticeDate: Date,
    text: { type: String, default: "" },
    files: { type: [mediaSchema], default: [] },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: String, index: true },
}, { timestamps: true });
exports.default = (0, mongoose_1.model)("Notice", noticeSchema);
