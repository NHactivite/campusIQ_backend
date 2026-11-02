import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { ApiError } from "../utils/helpers";

export const notFound = (_req: Request, res: Response) =>
  res.status(404).json({ success: false, message: "Route not found" });

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  let status = 500;
  let message = err.message || "Server error";

  if (err instanceof ApiError) status = err.status;
  else if (err instanceof multer.MulterError) status = 400;
  else if (err.name === "ValidationError") { status = 400; message = Object.values<any>(err.errors).map((e) => e.message).join(", "); }
  else if (err.name === "CastError") { status = 400; message = "Invalid id"; }

  if (status === 500) console.error(err);
  res.status(status).json({ success: false, message });
};