import { getAuth } from "@clerk/express";
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { notifications } from "../services/notifications";

const router = Router();

function paiseToInr(paise: number): string {
  return (paise / 100).toFixed(2);
}

// PATCH /match-results/:id/review — admin approve, reject, or dispute a result
router.patch(
  "/:id/review",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const resultId = req.params["id"] as string;
    const body = req.body as { decision?: string; adminNotes?: string };

    const decision = body.decision as string | undefined;
    if (!decision || !["approved", "rejected", "disputed"].includes(decision)) {
      res.status(400).json({ error: "decision must be one of: approved, rejected, disputed" });
      return;
    }

    const matchResult = await prisma.matchResult.findUnique({
      where: { id: resultId },
      include: {
        match: {
          include: {
            tournament: { select: { id: true, title: true, prizePoolPaise: true } },
            team1: {
              select: {
                id: true,
                name: true,
                ownerId: true,
                members: { select: { userId: true } },
              },
            },
            team2: {
              select: {
                id: true,
                name: true,
                ownerId: true,
                members: { select: { userId: true } },
              },
            },
          },
        },
        screenshots: true,
      },
    });

    if (!matchResult) {
      res.status(404).json({ error: "Match result not found" });
      return;
    }

    if (matchResult.status !== "pending_review") {
      res.status(409).json({ error: "Only pending_review results can be reviewed" });
      return;
    }

    const { match } = matchResult;
    const team1 = match.team1;
    const team2 = match.team2;
    const allTeamIds = [team1?.id, team2?.id].filter(Boolean) as string[];
    const allMembers = [
      ...(team1?.members ?? []).map((m) => ({ ...m, teamId: team1!.id })),
      ...(team2?.members ?? []).map((m) => ({ ...m, teamId: team2!.id })),
    ];

    if (decision === "approved") {
      await prisma.$transaction(async (tx) => {
        // Update result status
        await tx.matchResult.update({
          where: { id: resultId },
          data: {
            status: "approved",
            adminNotes: body.adminNotes ?? null,
            reviewedBy: userId!,
            reviewedAt: new Date(),
          },
        });

        // Update match — set winner and status completed
        await tx.tournamentMatch.update({
          where: { id: match.id },
          data: { winnerId: matchResult.winnerTeamId, status: "completed" },
        });

        // Prize distribution — credit winning team members
        const prizePool = match.tournament.prizePoolPaise;
        if (prizePool > 0) {
          const winningMembers = allMembers.filter((m) => m.teamId === matchResult.winnerTeamId);
          if (winningMembers.length > 0) {
            const prizePerMember = Math.floor(prizePool / winningMembers.length);

            for (const member of winningMembers) {
              const wallet = await tx.wallet.findUnique({ where: { userId: member.userId } });
              if (!wallet) continue;

              await tx.walletTransaction.create({
                data: {
                  walletId: wallet.id,
                  type: "credit",
                  amountPaise: prizePerMember,
                  status: "completed",
                  idempotencyKey: `prize:${resultId}:${member.userId}`,
                  description: `Prize for winning match in ${match.tournament.title}`,
                },
              });
            }
          }
        }
      });

      // Notify both teams
      const prizePool = match.tournament.prizePoolPaise;
      const winningMembers = allMembers.filter((m) => m.teamId === matchResult.winnerTeamId);
      const prizePerMember = prizePool > 0 && winningMembers.length > 0
        ? paiseToInr(Math.floor(prizePool / winningMembers.length))
        : undefined;

      for (const member of allMembers) {
        const won = member.teamId === matchResult.winnerTeamId;
        notifications
          .matchResultApproved(member.userId, match.id, won, won ? prizePerMember : undefined)
          .catch((err) => console.error("[match-results] approval notification failed:", err));
      }

      const updated = await prisma.matchResult.findUnique({
        where: { id: resultId },
        include: { screenshots: true },
      });
      res.json(updated);
      return;
    }

    if (decision === "disputed") {
      await prisma.$transaction(async (tx) => {
        await tx.matchResult.update({
          where: { id: resultId },
          data: {
            status: "disputed",
            adminNotes: body.adminNotes ?? null,
            reviewedBy: userId!,
            reviewedAt: new Date(),
          },
        });

        await tx.tournamentMatch.update({
          where: { id: match.id },
          data: { status: "disputed" },
        });
      });

      // Notify both teams
      for (const member of allMembers) {
        notifications
          .matchResultDisputed(member.userId, match.id)
          .catch((err) => console.error("[match-results] dispute notification failed:", err));
      }

      const updated = await prisma.matchResult.findUnique({
        where: { id: resultId },
        include: { screenshots: true },
      });
      res.json(updated);
      return;
    }

    // decision === "rejected" — allow re-submission
    await prisma.matchResult.update({
      where: { id: resultId },
      data: {
        status: "rejected",
        adminNotes: body.adminNotes ?? null,
        reviewedBy: userId!,
        reviewedAt: new Date(),
      },
    });

    // Notify submitting team captain so they can re-submit
    const submitterTeam = allTeamIds.includes(team1?.id ?? "")
      ? [team1, team2].find((t) => allMembers.some((m) => m.userId === matchResult.submittedBy && m.teamId === t?.id))
      : null;

    if (submitterTeam?.ownerId) {
      notifications
        .matchResultDisputed(submitterTeam.ownerId, match.id)
        .catch((err) => console.error("[match-results] rejection notification failed:", err));
    }

    const updated = await prisma.matchResult.findUnique({
      where: { id: resultId },
      include: { screenshots: true },
    });
    res.json(updated);
  })
);

export default router;
