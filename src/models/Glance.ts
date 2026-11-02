import { Schema, model } from "mongoose";

export interface IGlance {
  // interface IGlance
  category?: string; // badge + filter tab, e.g. "Governance & Policy"
  footnote?: string; // small line at the bottom of the card
  highlight: boolean; // amber featured card
  value: string; // text, so "2025", "6th", "10+3+4" all work
  label: string;
  text: string;
  order: number;
  isPublished: boolean;
  createdBy?: string; // Clerk user id
}

const glanceSchema = new Schema<IGlance>(
  {
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
  },
  { timestamps: true },
);

export default model<IGlance>("Glance", glanceSchema);
