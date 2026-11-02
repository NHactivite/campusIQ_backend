import multer from "multer";
import { ApiError } from "../utils/helpers";

const allowed: Record<string, RegExp> = {
  images: /^image\/(jpeg|png|webp|gif)$/,
  videos: /^video\/(mp4|webm|quicktime)$/,
  documents:
    /^application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)$/,
  files: /^(image\/(jpeg|png|webp)|application\/pdf)$/, // notices: PDF or photo
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB (Cloudinary free-plan video limit)
  fileFilter: (_req, file, cb) => {
    const rule = allowed[file.fieldname];
    if (!rule) return cb(new ApiError(400, `Unexpected field: ${file.fieldname}`));
    if (!rule.test(file.mimetype)) return cb(new ApiError(400, `Invalid file type for ${file.fieldname}: ${file.mimetype}`));
    cb(null, true);
  },
});

export const eventUpload = upload.fields([
  { name: "images", maxCount: 10 },
  { name: "videos", maxCount: 3 },
  { name: "documents", maxCount: 10 },
]);

export const noticeUpload = upload.fields([{ name: "files", maxCount: 10 }]);