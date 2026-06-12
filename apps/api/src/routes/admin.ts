import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";

const router = Router();

router.use(requireAuth, requireAdmin);

// GET /admin/match-results — pending review queue with screenshots
router.get(
  "/match-results",
  asyncHandler(async (req: Request, res: Response) => {
    const status = (req.query["status"] as string) ?? "pending_review";
    const validStatuses = ["pending_review", "approved", "rejected", "disputed"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
      return;
    }

    const page = Math.max(1, Number(req.query["page"]) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      prisma.matchResult.findMany({
        where: { status: status as "pending_review" | "approved" | "rejected" | "disputed" },
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
        select: {
          id: true,
          matchId: true,
          status: true,
          adminNotes: true,
          reviewedAt: true,
          createdAt: true,
          submitter: { select: { id: true, username: true } },
          winnerTeam: { select: { id: true, name: true, slug: true } },
          reviewer: { select: { id: true, username: true } },
          screenshots: { select: { id: true, cloudinaryUrl: true, cloudinaryPublicId: true } },
          match: {
            select: {
              id: true,
              round: true,
              matchNumber: true,
              status: true,
              tournament: { select: { id: true, title: true, slug: true } },
              team1: { select: { id: true, name: true, slug: true } },
              team2: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      }),
      prisma.matchResult.count({
        where: { status: status as "pending_review" | "approved" | "rejected" | "disputed" },
      }),
    ]);

    res.json({
      data: results,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  })
);

export default router;
