import "dotenv/config";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
export const PREFIX = "IIC_RDC-Protal"; // same prefix you already use

if (!redis) console.warn("[redis] UPSTASH_* variables missing: rate limit uses memory, caching is OFF");