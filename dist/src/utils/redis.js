"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREFIX = exports.redis = void 0;
require("dotenv/config");
const redis_1 = require("@upstash/redis");
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
exports.redis = url && token ? new redis_1.Redis({ url, token }) : null;
exports.PREFIX = "IIC_RDC-Protal"; // same prefix you already use
if (!exports.redis)
    console.warn("[redis] UPSTASH_* variables missing: rate limit uses memory, caching is OFF");
