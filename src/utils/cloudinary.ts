import "dotenv/config";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { Readable } from "stream";
import { IMedia, ResourceType } from "../models/Event";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const uploadBuffer = (
  file: Express.Multer.File,
  folder: string,
  resourceType: ResourceType
) =>
  new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
        filename_override: file.originalname,
      },
      (err, result) => (err || !result ? reject(err) : resolve(result))
    );
    Readable.from(file.buffer).pipe(stream);
  });

export const destroyAsset = (publicId: string, resourceType: ResourceType) =>
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });

const toMedia = (r: UploadApiResponse, f: Express.Multer.File, type: ResourceType): IMedia => ({
  url: r.secure_url,
  publicId: r.public_id,
  resourceType: type,
  format: r.format,
  bytes: r.bytes,
  originalName: f.originalname,
  width: r.width,
  height: r.height,
  duration: (r as any).duration,
});

export type UploadedFiles = { images: IMedia[]; videos: IMedia[]; documents: IMedia[] };

export const deleteMedia = async (items: IMedia[]) => {
  await Promise.allSettled(items.map((m) => destroyAsset(m.publicId, m.resourceType)));
};

// Events: uploads every file on the request and returns the media records
export async function uploadEventFiles(
  files: { [field: string]: Express.Multer.File[] } | undefined,
  folder: string
): Promise<UploadedFiles> {
  const out: UploadedFiles = { images: [], videos: [], documents: [] };
  if (!files) return out;

  const plan: [keyof UploadedFiles, ResourceType][] = [
    ["images", "image"],
    ["videos", "video"],
    ["documents", "raw"],
  ];
  try {
    for (const [field, type] of plan) {
      const list = files[field] ?? [];
      const results = await Promise.all(list.map((f) => uploadBuffer(f, folder, type)));
      results.forEach((r, i) => out[field].push(toMedia(r, list[i], type)));
    }
    return out;
  } catch (err) {
    await deleteMedia([...out.images, ...out.videos, ...out.documents]); // roll back partial uploads
    throw err;
  }
}

// Notices: uploads a flat list. Photos go up as "image", everything else (PDF) as "raw"
export async function uploadFlatFiles(
  files: Express.Multer.File[] | undefined,
  folder: string
): Promise<IMedia[]> {
  if (!files?.length) return [];
  const done: IMedia[] = [];
  try {
    return await Promise.all(
      files.map(async (f) => {
        const type: ResourceType = f.mimetype.startsWith("image/") ? "image" : "raw";
        const m = toMedia(await uploadBuffer(f, folder, type), f, type);
        done.push(m);
        return m;
      })
    );
  } catch (err) {
    await deleteMedia(done); // roll back partial uploads
    throw err;
  }
}