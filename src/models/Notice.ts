import { Schema, model } from "mongoose";
import { IMedia } from "./Event";

export const NOTICE_CATEGORIES = [
  "notices", "regulations", "exams", "scholarships", "admission", "facilities", "other",
] as const;

export interface INotice {
  title: string;
  category: (typeof NOTICE_CATEGORIES)[number];
  noticeDate?: Date;
  text: string;
  files: IMedia[];
  isPublished: boolean;
  createdBy?: string;
}

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

const noticeSchema = new Schema<INotice>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, enum: NOTICE_CATEGORIES, default: "notices", index: true },
    noticeDate: Date,
    text: { type: String, default: "" },
    files: { type: [mediaSchema], default: [] },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true }
);

export default model<INotice>("Notice", noticeSchema);