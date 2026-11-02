import { Request, Response, NextFunction } from "express";
import { apiLimiter, writeLimiter, Limiter } from "../utils/ratelimit.js";

const make =
  (limiter: Limiter, keyOf: (req: Request) => string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS") return next();

    try {
      const { success, limit, remaining, reset } = await limiter.limit(keyOf(req));
      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(reset / 1000)));

      if (!success) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))));
        return res.status(429).json({ success: false, message: "Too many requests. Please try again later." });
      }
    } catch (err) {
      console.error("Rate limit error:", err); // fail open: a Redis hiccup must not lock everyone out
    }
    next();
  };

export const rateLimitMiddleware = make(apiLimiter, (req) => req.ip ?? "unknown");
export const writeRateLimit = make(writeLimiter, (req) => req.user?.id ?? req.ip ?? "unknown");