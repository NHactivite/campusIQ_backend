"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noStore = exports.publicCache = void 0;
exports.cacheGet = cacheGet;
exports.cacheSet = cacheSet;
exports.cached = cached;
exports.invalidate = invalidate;
const redis_js_1 = require("./redis.js");
/**
 * Two layers, both optional:
 *   L1  a small in-memory map inside this server instance
 *   L2  Upstash Redis, shared by every instance
 *
 * Invalidation uses a version number per namespace ("events", "features"...).
 * The version is part of every cache key, so one INCR makes all old keys
 * unreachable at once (no SCAN, no key lists). They simply expire on their own.
 *
 * Everything fails open: if Redis is missing or erroring, requests just go to
 * the database, nothing breaks.
 */
const VERSION_TTL_MS = 3_000; // how long an instance trusts its copy of a version
const L1_TTL_MS = 60_000;
const L1_MAX = 500;
const versions = new Map();
const l1 = new Map();
const inflight = new Map();
async function version(ns) {
    if (!redis_js_1.redis)
        return null;
    const hit = versions.get(ns);
    if (hit && hit.exp > Date.now())
        return String(hit.v);
    try {
        const v = Number(await redis_js_1.redis.get(`${redis_js_1.PREFIX}:ver:${ns}`)) || 0;
        versions.set(ns, { v, exp: Date.now() + VERSION_TTL_MS });
        return String(v);
    }
    catch (err) {
        console.error("[cache] version read failed:", err);
        return null; // caller skips the cache
    }
}
const fullKey = (ns, v, key) => `${redis_js_1.PREFIX}:c:${ns}:${v}:${key}`;
function remember(k, value) {
    if (l1.size >= L1_MAX)
        l1.delete(l1.keys().next().value); // drop the oldest
    l1.set(k, { value, exp: Date.now() + L1_TTL_MS });
}
async function cacheGet(ns, key) {
    const v = await version(ns);
    if (v === null)
        return null;
    const k = fullKey(ns, v, key);
    const mem = l1.get(k);
    if (mem && mem.exp > Date.now())
        return mem.value;
    try {
        const value = await redis_js_1.redis.get(k);
        if (value !== null && value !== undefined) {
            remember(k, value);
            return value;
        }
    }
    catch (err) {
        console.error("[cache] read failed:", err);
    }
    return null;
}
async function cacheSet(ns, key, value, ttlSec) {
    const v = await version(ns);
    if (v === null)
        return;
    const k = fullKey(ns, v, key);
    const plain = JSON.parse(JSON.stringify(value)); // mongoose documents -> plain JSON
    remember(k, plain);
    try {
        await redis_js_1.redis.set(k, plain, { ex: ttlSec });
    }
    catch (err) {
        console.error("[cache] write failed:", err);
    }
}
/** Get from cache, or run `loader` and store its result. Concurrent misses share one loader run. */
async function cached(ns, key, ttlSec, loader) {
    const hit = await cacheGet(ns, key);
    if (hit !== null)
        return hit;
    const id = `${ns}:${key}`;
    const pending = inflight.get(id);
    if (pending)
        return pending;
    const run = (async () => {
        const value = await loader();
        await cacheSet(ns, key, value, ttlSec);
        return value;
    })().finally(() => inflight.delete(id));
    inflight.set(id, run);
    return run;
}
/** Call after any write. Bumps the version so every cached entry in the namespace is dropped. */
async function invalidate(...namespaces) {
    l1.clear();
    if (!redis_js_1.redis)
        return;
    await Promise.all(namespaces.map(async (ns) => {
        versions.delete(ns);
        try {
            await redis_js_1.redis.incr(`${redis_js_1.PREFIX}:ver:${ns}`);
        }
        catch (err) {
            console.error("[cache] invalidate failed (entries expire on their own):", err);
        }
    }));
}
/** Lets a CDN / proxy in front of the API keep public responses for a short while. */
const publicCache = (res, sec = 30) => res.set("Cache-Control", `public, max-age=0, s-maxage=${sec}, stale-while-revalidate=${sec * 5}`);
exports.publicCache = publicCache;
const noStore = (res) => res.set("Cache-Control", "no-store");
exports.noStore = noStore;
