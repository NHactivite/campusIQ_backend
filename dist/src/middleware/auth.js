"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAdmin = exports.requireAdmin = void 0;
const express_1 = require("@clerk/express");
const helpers_1 = require("../utils/helpers");
// remembers the role check for 60 s, so each request doesn't call Clerk
const cache = new Map();
const TTL = 60_000;
const isAdminUser = async (userId, claims) => {
    if (claims?.metadata?.role)
        return claims.metadata.role === "admin"; // only if you customised the session token
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < TTL)
        return hit.admin;
    const user = await express_1.clerkClient.users.getUser(userId);
    const admin = user.publicMetadata?.role === "admin";
    cache.set(userId, { admin, at: Date.now() });
    return admin;
};
const requireAdmin = async (req, _res, next) => {
    try {
        const { userId, sessionClaims } = (0, express_1.getAuth)(req);
        if (!userId)
            throw new helpers_1.ApiError(401, "Not authenticated");
        if (!(await isAdminUser(userId, sessionClaims)))
            throw new helpers_1.ApiError(403, "Admin access required");
        req.user = { id: userId, role: "admin" };
        next();
    }
    catch (err) {
        next(err);
    }
};
exports.requireAdmin = requireAdmin;
// never blocks: sets req.user only when the caller is a signed-in admin (used on public routes)
const optionalAdmin = async (req, _res, next) => {
    try {
        const { userId, sessionClaims } = (0, express_1.getAuth)(req);
        if (userId && (await isAdminUser(userId, sessionClaims)))
            req.user = { id: userId, role: "admin" };
    }
    catch {
        /* treat as public */
    }
    next();
};
exports.optionalAdmin = optionalAdmin;
