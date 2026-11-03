import { Schema, model, HydratedDocument } from "mongoose";
import { IMedia } from "./Event";

export const FACILITY_CATEGORIES = [
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
] as const;

export interface IFacility {
  name: string;
  slug: string;
  description: string;
  category: (typeof FACILITY_CATEGORIES)[number];
  location?: string;
  operatingHours?: string;
  contactDetails?: string;
  amenities: string[];
  images: IMedia[];
  documents: IMedia[];
  isPublished: boolean;
  createdBy?: string;
}

export type FacilityDoc = HydratedDocument<IFacility>;

const mediaSchema = new Schema<IMedia>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "video", "raw"], required: true },
    format: String,
    bytes: Number,
    originalName: String,
    width: Number,
    height: Number,
    duration: Number,
  },
  { _id: true }
);

const facilitySchema = new Schema<IFacility>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true },
    category: { type: String, enum: FACILITY_CATEGORIES, default: "other", index: true },
    location: String,
    operatingHours: String,
    contactDetails: String,
    amenities: { type: [String], default: [] },
    images: { type: [mediaSchema], default: [] },
    documents: { type: [mediaSchema], default: [] },
    isPublished: { type: Boolean, default: false, index: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

facilitySchema.virtual("coverImage").get(function () {
  return this.images?.[0]?.url ?? null;
});

export default model<IFacility>("Facility", facilitySchema);
