import { Ratelimit } from "@upstash/ratelimit";
import { redis, PREFIX } from "./redis.js";

type Result = { success: boolean; limit: number; remaining: number; reset: number };
export type Limiter = { limit: (key: string) => Promise<Result> };

// per-instance fallback, used only when Redis isn't configured
function memoryLimiter(max: number, windowMs: number): Limiter {
  const hits = new Map<string, { count: number; reset: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, 60_000).unref();

  return {
    async limit(key) {
      const now = Date.now();
      let h = hits.get(key);
      if (!h || h.reset < now) {
        h = { count: 0, reset: now + windowMs };
        hits.set(key, h);
      }
      h.count++;
      return { success: h.count <= max, limit: max, remaining: Math.max(0, max - h.count), reset: h.reset };
    },
  };
}

function make(name: string, max: number, windowSec: number): Limiter {
  if (!redis) return memoryLimiter(max, windowSec * 1000);
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
    prefix: `${PREFIX}:rl:${name}`,
    ephemeralCache: new Map(), // remembers blocked IPs in memory, so a flood doesn't cost Redis commands
    analytics: false,          // analytics writes extra commands
  });
}

export const apiLimiter = make("api", 100, 60);   // every /api request, per IP
export const writeLimiter = make("write", 30, 60); // admin writes, per admin user