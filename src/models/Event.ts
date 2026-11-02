import { Schema, model, Types, HydratedDocument } from "mongoose";

export type ResourceType = "image" | "video" | "raw";

export interface IMedia {
  _id?: Types.ObjectId;
  url: string;
  publicId: string;
  resourceType: ResourceType;
  format?: string;
  bytes?: number;
  originalName?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export const EVENT_CATEGORIES = ["RDC", "IIC", "Learning", "Incubation", "Linkages", "IPR", "Other"] as const;

export interface IEvent {
  title: string;
  slug: string;
  description: string;
  category: (typeof EVENT_CATEGORIES)[number];
  eventDate: Date;
  endDate?: Date;
  venue?: string;
  organiser?: string;
  participants?: number;
  outcome?: string;
  isPublished: boolean;
  images: IMedia[];
  videos: IMedia[];
  documents: IMedia[];
  createdBy?: string;
}
export type EventDoc = HydratedDocument<IEvent>;

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

const eventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true },
    category: { type: String, enum: EVENT_CATEGORIES, default: "Other", index: true },
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
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

// First image is used as the cover
eventSchema.virtual("coverImage").get(function () {
  return this.images?.[0]?.url ?? null;
});

export default model<IEvent>("Event", eventSchema);