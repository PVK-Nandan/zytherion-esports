import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@clerk/backend";
import { prisma } from "../lib/prisma";

export interface AuthRequest extends Request {
  userId?: string;
  clerkUserId?: string;
  userRole?: string;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    const clerkUserId = payload.sub;

    const user = await prisma.user.findUnique({
      where: { clerkUserId, deletedAt: null },
      select: { id: true, role: true, isBanned: true },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    if (user.isBanned) {
      res.status(403).json({ error: "Account is banned" });
      return;
    }

    req.userId = user.id;
    req.clerkUserId = clerkUserId;
    req.userRole = user.role;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
