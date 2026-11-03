"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FACILITY_CATEGORIES = void 0;
const mongoose_1 = require("mongoose");
exports.FACILITY_CATEGORIES = [
    "library",
    "sports",
    "laboratory",
    "canteen",
    "hostel",
    "medical",
    "transport",
    "it",
    "auditorium",
    "other",
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
const facilitySchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true },
    category: { type: String, enum: exports.FACILITY_CATEGORIES, default: "other", index: true },
    location: String,
    operatingHours: String,
    contactDetails: String,
    amenities: { type: [String], default: [] },
    images: { type: [mediaSchema], default: [] },
    documents: { type: [mediaSchema], default: [] },
    isPublished: { type: Boolean, default: false, index: true },
    createdBy: { type: String, index: true },
}, { timestamps: true, toJSON: { virtuals: true } });
facilitySchema.virtual("coverImage").get(function () {
    return this.images?.[0]?.url ?? null;
});
exports.default = (0, mongoose_1.model)("Facility", facilitySchema);
