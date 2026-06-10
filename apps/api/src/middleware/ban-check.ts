import { getAuth } from "@clerk/express";
import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function banCheck(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) {
    next();
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isBanned: true },
  });

  if (user?.isBanned) {
    res.status(403).json({ error: "Account is banned" });
    return;
  }

  next();
}
