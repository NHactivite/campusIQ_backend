"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFound = void 0;
const multer_1 = __importDefault(require("multer"));
const helpers_1 = require("../utils/helpers");
const notFound = (_req, res) => res.status(404).json({ success: false, message: "Route not found" });
exports.notFound = notFound;
const errorHandler = (err, _req, res, _next) => {
    let status = 500;
    let message = err.message || "Server error";
    if (err instanceof helpers_1.ApiError)
        status = err.status;
    else if (err instanceof multer_1.default.MulterError)
        status = 400;
    else if (err.name === "ValidationError") {
        status = 400;
        message = Object.values(err.errors).map((e) => e.message).join(", ");
    }
    else if (err.name === "CastError") {
        status = 400;
        message = "Invalid id";
    }
    if (status === 500)
        console.error(err);
    res.status(status).json({ success: false, message });
};
exports.errorHandler = errorHandler;
