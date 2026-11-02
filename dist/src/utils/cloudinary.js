"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMedia = exports.destroyAsset = exports.uploadBuffer = void 0;
exports.uploadEventFiles = uploadEventFiles;
require("dotenv/config");
const cloudinary_1 = require("cloudinary");
const stream_1 = require("stream");
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});
const uploadBuffer = (file, folder, resourceType) => new Promise((resolve, reject) => {
    const stream = cloudinary_1.v2.uploader.upload_stream({
        folder,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
        filename_override: file.originalname,
    }, (err, result) => (err || !result ? reject(err) : resolve(result)));
    stream_1.Readable.from(file.buffer).pipe(stream);
});
exports.uploadBuffer = uploadBuffer;
const destroyAsset = (publicId, resourceType) => cloudinary_1.v2.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
exports.destroyAsset = destroyAsset;
const toMedia = (r, f, type) => ({
    url: r.secure_url,
    publicId: r.public_id,
    resourceType: type,
    format: r.format,
    bytes: r.bytes,
    originalName: f.originalname,
    width: r.width,
    height: r.height,
    duration: r.duration,
});
// Uploads every file on the request and returns the media records
async function uploadEventFiles(files, folder) {
    const out = { images: [], videos: [], documents: [] };
    if (!files)
        return out;
    const plan = [
        ["images", "image"],
        ["videos", "video"],
        ["documents", "raw"],
    ];
    try {
        for (const [field, type] of plan) {
            const list = files[field] ?? [];
            const results = await Promise.all(list.map((f) => (0, exports.uploadBuffer)(f, folder, type)));
            results.forEach((r, i) => out[field].push(toMedia(r, list[i], type)));
        }
        return out;
    }
    catch (err) {
        await (0, exports.deleteMedia)([...out.images, ...out.videos, ...out.documents]); // roll back partial uploads
        throw err;
    }
}
const deleteMedia = async (items) => {
    await Promise.allSettled(items.map((m) => (0, exports.destroyAsset)(m.publicId, m.resourceType)));
};
exports.deleteMedia = deleteMedia;
