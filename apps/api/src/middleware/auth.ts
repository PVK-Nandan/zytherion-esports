import { clerkMiddleware, getAuth, requireAuth as clerkRequireAuth } from "@clerk/express";
import { NextFunction, Request, Response } from "express";

export const clerkAuth = clerkMiddleware();

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export { clerkRequireAuth };
