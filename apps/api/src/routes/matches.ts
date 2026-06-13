import { getAuth } from "@clerk/express";
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../middleware/auth";
import { banCheck } from "../middleware/ban-check";
import { generateSignedUploadParams, isValidCloudinaryPublicId } from "../lib/cloudinary";
import { notifications } from "../services/notifications";

const router = Router();

const SCREENSHOT_FOLDER = "match-screenshots";

// GET /matches/:id — match details (public)
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const match = await prisma.tournamentMatch.findUnique({
      where: { id: req.params["id"] as string },
      include: {
        tournament: { select: { id: true, title: true, slug: true, prizePoolPaise: true, format: true } },
        team1: { select: { id: true, name: true, slug: true, logoUrl: true } },
        team2: { select: { id: true, name: true, slug: true, logoUrl: true } },
        winner: { select: { id: true, name: true, slug: true } },
        results: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            winnerTeamId: true,
            adminNotes: true,
            createdAt: true,
            screenshots: { select: { id: true, cloudinaryUrl: true, cloudinaryPublicId: true } },
          },
        },
      },
    });

    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    res.json(match);
  })
);

// GET /matches/:id/cloudinary-sign — get signed upload params (auth required, must be team member)
router.get(
  "/:id/cloudinary-sign",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const matchId = req.params["id"] as string;

    const match = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      select: { id: true, team1Id: true, team2Id: true, status: true },
    });

    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const isTeamMember = await prisma.teamMember.findFirst({
      where: {
        userId: userId!,
        teamId: { in: [match.team1Id, match.team2Id].filter(Boolean) as string[] },
      },
    });

    if (!isTeamMember) {
      res.status(403).json({ error: "Only team members can upload screenshots for this match" });
      return;
    }

    const folder = `${SCREENSHOT_FOLDER}/match-${matchId}`;
    res.json(generateSignedUploadParams(folder));
  })
);

// POST /matches/:id/results — submit match result (team captain/owner only)
router.post(
  "/:id/results",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const matchId = req.params["id"] as string;
    const body = req.body as {
      winnerTeamId?: string;
      cloudinaryUrl?: string;
      cloudinaryPublicId?: string;
      winnerKills?: unknown;
      loserKills?: unknown;
    };

    const { winnerTeamId, cloudinaryUrl, cloudinaryPublicId } = body;

    if (!winnerTeamId || !cloudinaryUrl || !cloudinaryPublicId) {
      res.status(400).json({ error: "winnerTeamId, cloudinaryUrl, and cloudinaryPublicId are required" });
      return;
    }

    const winnerKills = Math.max(0, Number(body.winnerKills ?? 0));
    const loserKills = Math.max(0, Number(body.loserKills ?? 0));

    // Validate cloudinary public_id is in our expected folder
    const expectedFolder = `${SCREENSHOT_FOLDER}/match-${matchId}`;
    if (!isValidCloudinaryPublicId(cloudinaryPublicId, expectedFolder)) {
      res.status(400).json({ error: "Invalid screenshot: public_id must be in the match's upload folder" });
      return;
    }

    const match = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        team1Id: true,
        team2Id: true,
        status: true,
        tournamentId: true,
        tournament: { select: { prizePoolPaise: true } },
      },
    });

    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    if (match.status === "completed" || match.status === "disputed") {
      res.status(409).json({ error: "Cannot submit result for a match that is already completed or disputed" });
      return;
    }

    // winnerTeamId must be one of the match's teams
    const validTeamIds = [match.team1Id, match.team2Id].filter(Boolean) as string[];
    if (!validTeamIds.includes(winnerTeamId)) {
      res.status(400).json({ error: "winnerTeamId must be one of the teams in this match" });
      return;
    }

    // Submitter must be the owner (captain) of one of the match teams
    const captainedTeam = await prisma.team.findFirst({
      where: { ownerId: userId!, id: { in: validTeamIds } },
      select: { id: true },
    });

    if (!captainedTeam) {
      res.status(403).json({ error: "Only the team captain (owner) can submit a result for this match" });
      return;
    }

    // Block re-submission if there's already an active (pending/approved/disputed) result
    const existingActive = await prisma.matchResult.findFirst({
      where: { matchId, status: { in: ["pending_review", "approved", "disputed"] } },
    });

    if (existingActive) {
      if (existingActive.status === "approved" || existingActive.status === "disputed") {
        res.status(409).json({ error: "A result for this match has already been approved or is under dispute" });
        return;
      }
      res.status(409).json({ error: "A result for this match is already awaiting admin review" });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const mr = await tx.matchResult.create({
        data: {
          matchId,
          submittedBy: userId!,
          winnerTeamId,
          winnerKills,
          loserKills,
          status: "pending_review",
          screenshots: {
            create: { cloudinaryUrl, cloudinaryPublicId },
          },
        },
        include: {
          screenshots: true,
          match: {
            select: {
              team1: { select: { id: true, name: true, ownerId: true, members: { select: { userId: true } } } },
              team2: { select: { id: true, name: true, ownerId: true, members: { select: { userId: true } } } },
            },
          },
        },
      });
      return mr;
    });

    // Notify the opposing team captain that a result was submitted
    const { team1, team2 } = result.match;
    const submitterTeam = [team1, team2].find((t) => t?.id === captainedTeam.id);
    const opposingTeam = [team1, team2].find((t) => t?.id !== captainedTeam.id);

    if (opposingTeam?.ownerId) {
      notifications
        .matchResultSubmitted(opposingTeam.ownerId, matchId, submitterTeam?.name ?? "opponent")
        .catch((err) => console.error("[matches] notification failed:", err));
    }

    res.status(201).json({
      id: result.id,
      matchId: result.matchId,
      winnerTeamId: result.winnerTeamId,
      status: result.status,
      screenshots: result.screenshots,
      createdAt: result.createdAt,
    });
  })
);

// GET /matches/:id/results — list results for a match
router.get(
  "/:id/results",
  asyncHandler(async (req: Request, res: Response) => {
    const matchId = req.params["id"] as string;

    const match = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      select: { id: true },
    });

    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const results = await prisma.matchResult.findMany({
      where: { matchId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        winnerTeamId: true,
        adminNotes: true,
        reviewedAt: true,
        createdAt: true,
        submitter: { select: { id: true, username: true } },
        winnerTeam: { select: { id: true, name: true, slug: true } },
        screenshots: { select: { id: true, cloudinaryUrl: true, cloudinaryPublicId: true } },
      },
    });

    res.json(results);
  })
);

export default router;
