import { getAuth } from "@clerk/express";
import { BgmiTier } from "@prisma/client";
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { banCheck } from "../middleware/ban-check";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

// GET /users/:username — public profile
router.get(
  "/:username",
  asyncHandler(async (req: Request, res: Response) => {
    const username = req.params["username"] as string;

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        kycStatus: true,
        createdAt: true,
        profile: {
          select: {
            bgmiIgn: true,
            bgmiTier: true,
            bio: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  })
);

// PATCH /users/me/profile — update own profile (auth + ban required)
router.patch(
  "/me/profile",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);

    const body = req.body as {
      bgmiUid?: string;
      bgmiIgn?: string;
      bgmiTier?: BgmiTier;
      bio?: string;
    };

    const { bgmiUid, bgmiIgn, bgmiTier, bio } = body;

    const validTiers = Object.values(BgmiTier);
    if (bgmiTier !== undefined && !validTiers.includes(bgmiTier)) {
      res.status(400).json({ error: `Invalid bgmiTier. Must be one of: ${validTiers.join(", ")}` });
      return;
    }

    const profile = await prisma.profile.upsert({
      where: { userId: userId! },
      update: {
        ...(bgmiUid !== undefined && { bgmiUid }),
        ...(bgmiIgn !== undefined && { bgmiIgn }),
        ...(bgmiTier !== undefined && { bgmiTier }),
        ...(bio !== undefined && { bio }),
      },
      create: {
        userId: userId!,
        bgmiUid: bgmiUid ?? null,
        bgmiIgn: bgmiIgn ?? null,
        bgmiTier: bgmiTier ?? null,
        bio: bio ?? null,
      },
    });

    res.json(profile);
  })
);

export default router;
