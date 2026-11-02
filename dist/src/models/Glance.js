"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const glanceSchema = new mongoose_1.Schema({
    value: {
        type: String,
        required: [true, "Value is required"],
        trim: true,
        maxlength: 20,
    },
    label: {
        type: String,
        required: [true, "Label is required"],
        trim: true,
        maxlength: 80,
    },
    text: {
        type: String,
        required: [true, "Text is required"],
        trim: true,
        maxlength: 300,
    },
    order: { type: Number, default: 0, index: true },
    isPublished: { type: Boolean, default: true },
    category: { type: String, trim: true, maxlength: 40 },
    footnote: { type: String, trim: true, maxlength: 80 },
    highlight: { type: Boolean, default: false },
    createdBy: { type: String },
}, { timestamps: true });
exports.default = (0, mongoose_1.model)("Glance", glanceSchema);
