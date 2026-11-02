"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LINKAGE_STATUSES = void 0;
const mongoose_1 = require("mongoose");
exports.LINKAGE_STATUSES = ["Completed", "Initiated", "Linked", "Planned"];
const linkageSchema = new mongoose_1.Schema({
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 80 },
    status: { type: String, enum: exports.LINKAGE_STATUSES, required: [true, "Status is required"], index: true },
    text: { type: String, required: [true, "Text is required"], trim: true, maxlength: 400 },
    order: { type: Number, default: 0, index: true },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: String },
}, { timestamps: true });
exports.default = (0, mongoose_1.model)("Linkage", linkageSchema);
