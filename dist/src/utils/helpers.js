"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toArray = exports.slugify = exports.ApiError = exports.asyncHandler = void 0;
const asyncHandler = (fn) => (req, res, next) => { fn(req, res, next).catch(next); };
exports.asyncHandler = asyncHandler;
class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.ApiError = ApiError;
const slugify = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) +
    "-" + Math.random().toString(36).slice(2, 7);
exports.slugify = slugify;
// accepts ["a","b"], '["a","b"]' or "a"
const toArray = (v) => {
    if (!v)
        return [];
    if (Array.isArray(v))
        return v.map(String);
    if (typeof v === "string") {
        try {
            const p = JSON.parse(v);
            return Array.isArray(p) ? p.map(String) : [v];
        }
        catch {
            return [v];
        }
    }
    return [];
};
exports.toArray = toArray;
