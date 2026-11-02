"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const helpers_1 = require("../utils/helpers");
const allowed = {
    images: /^image\/(jpeg|png|webp|gif)$/,
    videos: /^video\/(mp4|webm|quicktime)$/,
    documents: /^application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)$/,
};
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB (Cloudinary free-plan video limit)
    fileFilter: (_req, file, cb) => {
        const rule = allowed[file.fieldname];
        if (!rule)
            return cb(new helpers_1.ApiError(400, `Unexpected field: ${file.fieldname}`));
        if (!rule.test(file.mimetype))
            return cb(new helpers_1.ApiError(400, `Invalid file type for ${file.fieldname}: ${file.mimetype}`));
        cb(null, true);
    },
});
exports.eventUpload = upload.fields([
    { name: "images", maxCount: 10 },
    { name: "videos", maxCount: 3 },
    { name: "documents", maxCount: 10 },
]);
