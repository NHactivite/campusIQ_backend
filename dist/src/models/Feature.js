"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEATURE_SECTIONS = void 0;
const mongoose_1 = require("mongoose");
exports.FEATURE_SECTIONS = ["rdc", "iic"];
const featureSchema = new mongoose_1.Schema({
    section: { type: String, enum: exports.FEATURE_SECTIONS, default: "rdc", index: true },
    icon: { type: String, default: "Landmark", trim: true },
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 120 },
    text: { type: String, required: [true, "Text is required"], trim: true, maxlength: 600 },
    tags: {
        type: [{ type: String, trim: true, maxlength: 30 }],
        default: [],
        validate: [(v) => v.length <= 6, "Maximum 6 tags"],
    },
    order: { type: Number, default: 0, index: true },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: String },
}, { timestamps: true });
featureSchema.index({ section: 1, order: 1 });
exports.default = (0, mongoose_1.model)("Feature", featureSchema);
