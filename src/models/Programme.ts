import { Schema, model, HydratedDocument } from "mongoose";
import { IMedia } from "./Event";

export const DEGREE_LEVELS = [
  "undergraduate",
  "postgraduate",
  "doctoral",
  "diploma",
  "certificate",
] as const;

export interface IProgramme {
  name: string;
  slug: string;
  degreeLevel: (typeof DEGREE_LEVELS)[number];
  department: string;
  duration: string;
  eligibilityCriteria?: string;
  admissionRequirements?: string;
  courseOverview?: string;
  availableSeats?: number;
  syllabus: IMedia[];
  isPublished: boolean;
  createdBy?: string;
}

export type ProgrammeDoc = HydratedDocument<IProgramme>;

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

const programmeSchema = new Schema<IProgramme>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, index: true },
    degreeLevel: { type: String, enum: DEGREE_LEVELS, required: true, index: true },
    department: { type: String, required: true, trim: true, maxlength: 200 },
    duration: { type: String, required: true, trim: true },
    eligibilityCriteria: String,
    admissionRequirements: String,
    courseOverview: String,
    availableSeats: { type: Number, min: 0 },
    syllabus: { type: [mediaSchema], default: [] },
    isPublished: { type: Boolean, default: false, index: true },
    createdBy: { type: String, index: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

export default model<IProgramme>("Programme", programmeSchema);
