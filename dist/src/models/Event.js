"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_CATEGORIES = void 0;
const mongoose_1 = require("mongoose");
exports.EVENT_CATEGORIES = ["RDC", "IIC", "Learning", "Incubation", "Linkages", "IPR", "Other"];
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
const eventSchema = new mongoose_1.Schema({
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true },
    category: { type: String, enum: exports.EVENT_CATEGORIES, default: "Other", index: true },
    eventDate: { type: Date, required: true, index: true },
    endDate: Date,
    venue: String,
    organiser: String,
    participants: { type: Number, min: 0 },
    outcome: String,
    isPublished: { type: Boolean, default: true },
    images: { type: [mediaSchema], default: [] },
    videos: { type: [mediaSchema], default: [] },
    documents: { type: [mediaSchema], default: [] },
    createdBy: { type: String, index: true },
}, { timestamps: true, toJSON: { virtuals: true } });
// First image is used as the cover
eventSchema.virtual("coverImage").get(function () {
    return this.images?.[0]?.url ?? null;
});
exports.default = (0, mongoose_1.model)("Event", eventSchema);
