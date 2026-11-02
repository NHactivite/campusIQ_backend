import { Schema, model } from "mongoose";

export const LINKAGE_STATUSES = ["Completed", "Initiated", "Linked", "Planned"] as const;
export type LinkageStatus = (typeof LINKAGE_STATUSES)[number];

export interface ILinkage {
  title: string;          // partner name, e.g. "RFRI"
  status: LinkageStatus;
  text: string;           // one-line description of the collaboration
  order: number;
  isPublished: boolean;
  createdBy?: string;     // Clerk user id
}

const linkageSchema = new Schema<ILinkage>(
  {
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 80 },
    status: { type: String, enum: LINKAGE_STATUSES, required: [true, "Status is required"], index: true },
    text: { type: String, required: [true, "Text is required"], trim: true, maxlength: 400 },
    order: { type: Number, default: 0, index: true },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: String },
  },
  { timestamps: true }
);

export default model<ILinkage>("Linkage", linkageSchema);