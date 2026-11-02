import { Schema, model } from "mongoose";

export const FEATURE_SECTIONS = ["rdc", "iic"] as const;
export type FeatureSection = (typeof FEATURE_SECTIONS)[number];

export interface IFeature {
  section: FeatureSection;
  icon: string;          // lucide-react icon name, e.g. "Landmark"
  title: string;
  text: string;
  tags: string[];
  order: number;         // display position within the section
  isPublished: boolean;
  createdBy?: string;    // Clerk user id
}

const featureSchema = new Schema<IFeature>(
  {
    section: { type: String, enum: FEATURE_SECTIONS, default: "rdc", index: true },
    icon: { type: String, default: "Landmark", trim: true },
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 120 },
    text: { type: String, required: [true, "Text is required"], trim: true, maxlength: 600 },
    tags: {
      type: [{ type: String, trim: true, maxlength: 30 }],
      default: [],
      validate: [(v: string[]) => v.length <= 6, "Maximum 6 tags"],
    },
    order: { type: Number, default: 0, index: true },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: String },
  },
  { timestamps: true }
);

featureSchema.index({ section: 1, order: 1 });

export default model<IFeature>("Feature", featureSchema);