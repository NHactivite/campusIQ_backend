import { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { ApiError } from "../utils/helpers";

// remembers the role check for 60 s, so each request doesn't call Clerk
const cache = new Map<string, { admin: boolean; at: number }>();
const TTL = 60_000;

const isAdminUser = async (userId: string, claims: any): Promise<boolean> => {
  if (claims?.metadata?.role) return claims.metadata.role === "admin"; // only if you customised the session token

  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.admin;

  const user = await clerkClient.users.getUser(userId);
  const admin = (user.publicMetadata as { role?: string })?.role === "admin";
  cache.set(userId, { admin, at: Date.now() });
  return admin;
};

export const requireAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const { userId, sessionClaims } = getAuth(req);
    if (!userId) throw new ApiError(401, "Not authenticated");
    if (!(await isAdminUser(userId, sessionClaims))) throw new ApiError(403, "Admin access required");
    req.user = { id: userId, role: "admin" };
    next();
  } catch (err) {
    next(err);
  }
};

// never blocks: sets req.user only when the caller is a signed-in admin (used on public routes)
export const optionalAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const { userId, sessionClaims } = getAuth(req);
    if (userId && (await isAdminUser(userId, sessionClaims))) req.user = { id: userId, role: "admin" };
  } catch {
    /* treat as public */
  }
  next();
};