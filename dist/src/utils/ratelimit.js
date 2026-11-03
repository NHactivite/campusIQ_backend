"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeLimiter = exports.apiLimiter = void 0;
const ratelimit_1 = require("@upstash/ratelimit");
const redis_js_1 = require("./redis.js");
// per-instance fallback, used only when Redis isn't configured
function memoryLimiter(max, windowMs) {
    const hits = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of hits)
            if (v.reset < now)
                hits.delete(k);
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
function make(name, max, windowSec) {
    if (!redis_js_1.redis)
        return memoryLimiter(max, windowSec * 1000);
    return new ratelimit_1.Ratelimit({
        redis: redis_js_1.redis,
        limiter: ratelimit_1.Ratelimit.slidingWindow(max, `${windowSec} s`),
        prefix: `${redis_js_1.PREFIX}:rl:${name}`,
        ephemeralCache: new Map(), // remembers blocked IPs in memory, so a flood doesn't cost Redis commands
        analytics: false, // analytics writes extra commands
    });
}
exports.apiLimiter = make("api", 100, 60); // every /api request, per IP
exports.writeLimiter = make("write", 30, 60); // admin writes, per admin user
