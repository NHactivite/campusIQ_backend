import { Response } from "express";
import { redis, PREFIX } from "./redis.js";

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

const versions = new Map<string, { v: number; exp: number }>();
const l1 = new Map<string, { value: unknown; exp: number }>();
const inflight = new Map<string, Promise<unknown>>();

async function version(ns: string): Promise<string | null> {
  if (!redis) return null;
  const hit = versions.get(ns);
  if (hit && hit.exp > Date.now()) return String(hit.v);
  try {
    const v = Number(await redis.get<number>(`${PREFIX}:ver:${ns}`)) || 0;
    versions.set(ns, { v, exp: Date.now() + VERSION_TTL_MS });
    return String(v);
  } catch (err) {
    console.error("[cache] version read failed:", err);
    return null; // caller skips the cache
  }
}

const fullKey = (ns: string, v: string, key: string) => `${PREFIX}:c:${ns}:${v}:${key}`;

function remember(k: string, value: unknown) {
  if (l1.size >= L1_MAX) l1.delete(l1.keys().next().value as string); // drop the oldest
  l1.set(k, { value, exp: Date.now() + L1_TTL_MS });
}

export async function cacheGet<T>(ns: string, key: string): Promise<T | null> {
  const v = await version(ns);
  if (v === null) return null;
  const k = fullKey(ns, v, key);

  const mem = l1.get(k);
  if (mem && mem.exp > Date.now()) return mem.value as T;

  try {
    const value = await redis!.get<T>(k);
    if (value !== null && value !== undefined) {
      remember(k, value);
      return value;
    }
  } catch (err) {
    console.error("[cache] read failed:", err);
  }
  return null;
}

export async function cacheSet(ns: string, key: string, value: unknown, ttlSec: number) {
  const v = await version(ns);
  if (v === null) return;
  const k = fullKey(ns, v, key);
  const plain = JSON.parse(JSON.stringify(value)); // mongoose documents -> plain JSON
  remember(k, plain);
  try {
    await redis!.set(k, plain, { ex: ttlSec });
  } catch (err) {
    console.error("[cache] write failed:", err);
  }
}

/** Get from cache, or run `loader` and store its result. Concurrent misses share one loader run. */
export async function cached<T>(ns: string, key: string, ttlSec: number, loader: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(ns, key);
  if (hit !== null) return hit;

  const id = `${ns}:${key}`;
  const pending = inflight.get(id) as Promise<T> | undefined;
  if (pending) return pending;

  const run = (async () => {
    const value = await loader();
    await cacheSet(ns, key, value, ttlSec);
    return value;
  })().finally(() => inflight.delete(id));
  inflight.set(id, run);
  return run;
}

/** Call after any write. Bumps the version so every cached entry in the namespace is dropped. */
export async function invalidate(...namespaces: string[]) {
  l1.clear();
  if (!redis) return;
  await Promise.all(
    namespaces.map(async (ns) => {
      versions.delete(ns);
      try {
        await redis!.incr(`${PREFIX}:ver:${ns}`);
      } catch (err) {
        console.error("[cache] invalidate failed (entries expire on their own):", err);
      }
    }),
  );
}

/** Lets a CDN / proxy in front of the API keep public responses for a short while. */
export const publicCache = (res: Response, sec = 30) =>
  res.set("Cache-Control", `public, max-age=0, s-maxage=${sec}, stale-while-revalidate=${sec * 5}`);

export const noStore = (res: Response) => res.set("Cache-Control", "no-store");