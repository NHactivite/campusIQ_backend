"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEGREE_LEVELS = void 0;
const mongoose_1 = require("mongoose");
exports.DEGREE_LEVELS = [
    "undergraduate",
    "postgraduate",
    "doctoral",
    "diploma",
    "certificate",
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
const programmeSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, index: true },
    degreeLevel: { type: String, enum: exports.DEGREE_LEVELS, required: true, index: true },
    department: { type: String, required: true, trim: true, maxlength: 200 },
    duration: { type: String, required: true, trim: true },
    eligibilityCriteria: String,
    admissionRequirements: String,
    courseOverview: String,
    availableSeats: { type: Number, min: 0 },
    syllabus: { type: [mediaSchema], default: [] },
    isPublished: { type: Boolean, default: false, index: true },
    createdBy: { type: String, index: true },
}, { timestamps: true, toJSON: { virtuals: true } });
exports.default = (0, mongoose_1.model)("Programme", programmeSchema);
