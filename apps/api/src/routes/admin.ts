import { getAuth } from "@clerk/express";
import { KycStatus, Prisma, TransactionType } from "@prisma/client";
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { notifications } from "../services/notifications";
import { distributePrizes } from "../services/prize-distribution";

const router = Router();

router.use(requireAuth, asyncHandler(requireAdmin));

function paiseToInr(paise: number): string {
  return (paise / 100).toFixed(2);
}

async function auditLog(
  adminId: string,
  action: string,
  entityType: string,
  entityId: string,
  notes?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.adminAuditLog.create({
    data: { adminId, action, entityType, entityId, notes: notes ?? null, metadata: (metadata ?? {}) as Prisma.InputJsonValue },
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

// GET /admin/dashboard — aggregate counts for the ops dashboard home
router.get(
  "/dashboard",
  asyncHandler(async (_req: Request, res: Response) => {
    const [pendingReview, disputed, pendingKyc, pendingWithdrawals] = await Promise.all([
      prisma.matchResult.count({ where: { status: "pending_review" } }),
      prisma.matchResult.count({ where: { status: "disputed" } }),
      prisma.user.count({ where: { kycStatus: "pending" } }),
      prisma.walletTransaction.count({ where: { type: "debit", status: "pending" } }),
    ]);

    res.json({ pendingReview, disputed, pendingKyc, pendingWithdrawals });
  }),
);

// ─── Users ────────────────────────────────────────────────────────────────────

// GET /admin/users — list users with search and filters
router.get(
  "/users",
  asyncHandler(async (req: Request, res: Response) => {
    const { q, banned, kycStatus } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (q) {
      where["OR"] = [
        { username: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }
    if (banned !== undefined) where["isBanned"] = banned === "true";
    if (kycStatus && ["pending", "approved", "rejected"].includes(kycStatus)) {
      where["kycStatus"] = kycStatus as KycStatus;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          username: true,
          isBanned: true,
          isAdmin: true,
          kycStatus: true,
          createdAt: true,
          profile: { select: { bgmiIgn: true, bgmiTier: true, avatarUrl: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ data: users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  }),
);

// PATCH /admin/users/:id/ban — ban or unban a user
router.patch(
  "/users/:id/ban",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId: adminId } = getAuth(req);
    const targetUserId = req.params["id"] as string;
    const body = req.body as { banned?: unknown };

    if (typeof body.banned !== "boolean") {
      res.status(400).json({ error: "banned must be a boolean" });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isAdmin: true },
    });
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (target.isAdmin) {
      res.status(403).json({ error: "Cannot ban an admin user" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { isBanned: body.banned },
      select: { id: true, username: true, email: true, isBanned: true, kycStatus: true, createdAt: true },
    });

    await auditLog(adminId!, body.banned ? "ban_user" : "unban_user", "user", targetUserId);

    res.json(updated);
  }),
);

// PATCH /admin/users/:id/kyc-status — update KYC status
router.patch(
  "/users/:id/kyc-status",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId: adminId } = getAuth(req);
    const targetUserId = req.params["id"] as string;
    const body = req.body as { kycStatus?: string };

    const validStatuses = ["pending", "approved", "rejected"];
    if (!body.kycStatus || !validStatuses.includes(body.kycStatus)) {
      res.status(400).json({ error: `kycStatus must be one of: ${validStatuses.join(", ")}` });
      return;
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { kycStatus: body.kycStatus as KycStatus },
      select: { id: true, username: true, email: true, isBanned: true, kycStatus: true },
    });

    await auditLog(adminId!, `kyc_${body.kycStatus}`, "user", targetUserId);

    res.json(updated);
  }),
);

// ─── Wallets ──────────────────────────────────────────────────────────────────

// GET /admin/wallets — list wallets with user info and computed balance
router.get(
  "/wallets",
  asyncHandler(async (req: Request, res: Response) => {
    const { q } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (q) {
      where["user"] = {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      };
    }

    const [wallets, total] = await Promise.all([
      prisma.wallet.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          createdAt: true,
          user: { select: { id: true, username: true, email: true, kycStatus: true, isBanned: true } },
          transactions: { where: { status: "completed" }, select: { type: true, amountPaise: true } },
        },
      }),
      prisma.wallet.count({ where }),
    ]);

    const data = wallets.map((w) => {
      const { transactions, ...rest } = w;
      const balancePaise = transactions.reduce(
        (acc, tx) => (tx.type === "credit" ? acc + tx.amountPaise : acc - tx.amountPaise),
        0,
      );
      return { ...rest, balancePaise, balanceInr: paiseToInr(balancePaise) };
    });

    res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  }),
);

// GET /admin/wallet-transactions — list all transactions with filters
router.get(
  "/wallet-transactions",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, type, status, from, to } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (userId) {
      const wallet = await prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
      if (!wallet) {
        res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
        return;
      }
      where["walletId"] = wallet.id;
    }

    if (type && ["credit", "debit", "prize_credit"].includes(type)) where["type"] = type;
    if (status && ["pending", "completed", "failed"].includes(status)) where["status"] = status;

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter["gte"] = new Date(from);
      if (to) dateFilter["lte"] = new Date(to);
      where["createdAt"] = dateFilter;
    }

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          walletId: true,
          type: true,
          amountPaise: true,
          status: true,
          description: true,
          idempotencyKey: true,
          razorpayOrderId: true,
          razorpayPaymentId: true,
          razorpayPayoutId: true,
          createdAt: true,
          wallet: { select: { userId: true, user: { select: { username: true, email: true } } } },
        },
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    res.json({
      data: transactions.map((tx) => ({ ...tx, amountInr: paiseToInr(tx.amountPaise) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }),
);

// ─── Tournaments ──────────────────────────────────────────────────────────────

// GET /admin/tournaments — list all tournaments for admin oversight
router.get(
  "/tournaments",
  asyncHandler(async (req: Request, res: Response) => {
    const { status, format, game, q } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where["status"] = status;
    if (format) where["format"] = format;
    if (game) where["game"] = game;
    if (q) where["title"] = { contains: q, mode: "insensitive" };

    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          slug: true,
          format: true,
          status: true,
          maxTeams: true,
          entryFeePaise: true,
          prizePoolPaise: true,
          scheduledAt: true,
          createdAt: true,
          organizer: { select: { id: true, username: true, email: true } },
          _count: { select: { registrations: { where: { withdrawn: false } } } },
        },
      }),
      prisma.tournament.count({ where }),
    ]);

    res.json({
      data: tournaments.map((t) => ({ ...t, entryFeeInr: paiseToInr(t.entryFeePaise), prizePoolInr: paiseToInr(t.prizePoolPaise) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }),
);

// POST /admin/tournaments/:id/cancel — cancel a tournament and refund all active registrations
router.post(
  "/tournaments/:id/cancel",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId: adminId } = getAuth(req);
    const tournamentId = req.params["id"] as string;
    const body = req.body as { adminNotes?: string };

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: { withdrawn: false },
          include: { team: { select: { ownerId: true } } },
        },
      },
    });

    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }
    if (tournament.status === "cancelled") {
      res.status(409).json({ error: "Tournament is already cancelled" });
      return;
    }
    if (tournament.status === "completed") {
      res.status(422).json({ error: "Cannot cancel a completed tournament" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.tournament.update({ where: { id: tournamentId }, data: { status: "cancelled" } });

      for (const reg of tournament.registrations) {
        if (reg.entryFeePaise > 0 && reg.walletTxId) {
          const wallet = await tx.wallet.findUnique({
            where: { userId: reg.team.ownerId },
            select: { id: true },
          });
          if (wallet) {
            const refundKey = `admin:cancel:${tournamentId}:team:${reg.teamId}:refund`;
            const refundTx = await tx.walletTransaction.create({
              data: {
                walletId: wallet.id,
                type: TransactionType.credit,
                amountPaise: reg.entryFeePaise,
                status: "completed",
                idempotencyKey: refundKey,
                description: `Refund: tournament "${tournament.title}" cancelled by admin`,
              },
            });
            await tx.tournamentRegistration.update({
              where: { id: reg.id },
              data: { withdrawn: true, withdrawnAt: new Date(), refundTxId: refundTx.id },
            });
          }
        } else {
          await tx.tournamentRegistration.update({
            where: { id: reg.id },
            data: { withdrawn: true, withdrawnAt: new Date() },
          });
        }
      }
    });

    await auditLog(adminId!, "tournament_cancel", "tournament", tournamentId, body.adminNotes);

    res.json({ message: "Tournament cancelled and refunds issued", tournamentId, refundCount: tournament.registrations.length });
  }),
);

// ─── Match Results ────────────────────────────────────────────────────────────

// GET /admin/match-results — review queue with pagination and status filter
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
  }),
);

// PATCH /admin/match-results/:id/review — approve, reject, or mark as disputed; logs audit
router.patch(
  "/match-results/:id/review",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId: adminId } = getAuth(req);
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
            team1: { select: { id: true, name: true, ownerId: true, members: { select: { userId: true } } } },
            team2: { select: { id: true, name: true, ownerId: true, members: { select: { userId: true } } } },
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
    const allMembers = [
      ...(match.team1?.members ?? []).map((m) => ({ ...m, teamId: match.team1!.id })),
      ...(match.team2?.members ?? []).map((m) => ({ ...m, teamId: match.team2!.id })),
    ];

    if (decision === "approved") {
      const loserTeamId = matchResult.winnerTeamId === match.team1?.id ? match.team2?.id : match.team1?.id;

      await prisma.$transaction(async (tx) => {
        await tx.matchResult.update({
          where: { id: resultId },
          data: { status: "approved", adminNotes: body.adminNotes ?? null, reviewedBy: adminId!, reviewedAt: new Date() },
        });
        await tx.tournamentMatch.update({
          where: { id: match.id },
          data: { winnerId: matchResult.winnerTeamId, status: "completed" },
        });

        if (loserTeamId) {
          await distributePrizes(match.id, matchResult.winnerTeamId, loserTeamId, tx);
        }
      });

      // Advance winner to next bracket slot if applicable
      if (match.nextMatchId) {
        const nextMatch = await prisma.tournamentMatch.findUnique({ where: { id: match.nextMatchId } });
        if (nextMatch) {
          await prisma.tournamentMatch.update({
            where: { id: match.nextMatchId },
            data: nextMatch.team1Id ? { team2Id: matchResult.winnerTeamId } : { team1Id: matchResult.winnerTeamId },
          });
        }
      }

      for (const member of allMembers) {
        const won = member.teamId === matchResult.winnerTeamId;
        notifications
          .matchResultApproved(member.userId, match.id, won, undefined)
          .catch((err) => console.error("[admin] matchResultApproved notification failed:", err));
      }

      await auditLog(adminId!, "match_result_approve", "match_result", resultId, body.adminNotes);
    } else if (decision === "disputed") {
      await prisma.$transaction([
        prisma.matchResult.update({
          where: { id: resultId },
          data: { status: "disputed", adminNotes: body.adminNotes ?? null, reviewedBy: adminId!, reviewedAt: new Date() },
        }),
        prisma.tournamentMatch.update({ where: { id: match.id }, data: { status: "disputed" } }),
      ]);

      for (const member of allMembers) {
        notifications
          .matchResultDisputed(member.userId, match.id)
          .catch((err) => console.error("[admin] matchResultDisputed notification failed:", err));
      }

      await auditLog(adminId!, "match_result_dispute", "match_result", resultId, body.adminNotes);
    } else {
      // rejected — allow re-submission
      await prisma.matchResult.update({
        where: { id: resultId },
        data: { status: "rejected", adminNotes: body.adminNotes ?? null, reviewedBy: adminId!, reviewedAt: new Date() },
      });

      await auditLog(adminId!, "match_result_reject", "match_result", resultId, body.adminNotes);
    }

    const updated = await prisma.matchResult.findUnique({ where: { id: resultId }, include: { screenshots: true } });
    res.json(updated);
  }),
);

// PATCH /admin/match-results/:id/reassign-winner — override winner on a disputed match
router.patch(
  "/match-results/:id/reassign-winner",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId: adminId } = getAuth(req);
    const resultId = req.params["id"] as string;
    const body = req.body as { winnerTeamId?: string; adminNotes?: string };

    if (!body.winnerTeamId) {
      res.status(400).json({ error: "winnerTeamId is required" });
      return;
    }

    const matchResult = await prisma.matchResult.findUnique({
      where: { id: resultId },
      include: {
        match: {
          select: {
            id: true,
            nextMatchId: true,
            team1Id: true,
            team2Id: true,
            tournament: { select: { id: true, title: true, prizePoolPaise: true } },
            team1: { select: { id: true, members: { select: { userId: true } } } },
            team2: { select: { id: true, members: { select: { userId: true } } } },
          },
        },
      },
    });

    if (!matchResult) {
      res.status(404).json({ error: "Match result not found" });
      return;
    }
    if (matchResult.status !== "disputed") {
      res.status(409).json({ error: "Only disputed match results can have their winner reassigned" });
      return;
    }

    const { match } = matchResult;
    if (body.winnerTeamId !== match.team1Id && body.winnerTeamId !== match.team2Id) {
      res.status(400).json({ error: "winnerTeamId must be one of the match teams" });
      return;
    }

    const allMembers = [
      ...(match.team1?.members ?? []).map((m) => ({ ...m, teamId: match.team1!.id })),
      ...(match.team2?.members ?? []).map((m) => ({ ...m, teamId: match.team2!.id })),
    ];

    const reassignLoserTeamId = body.winnerTeamId === match.team1Id ? match.team2Id : match.team1Id;

    await prisma.$transaction(async (tx) => {
      await tx.matchResult.update({
        where: { id: resultId },
        data: {
          winnerTeamId: body.winnerTeamId!,
          status: "approved",
          adminNotes: body.adminNotes ?? null,
          reviewedBy: adminId!,
          reviewedAt: new Date(),
        },
      });
      await tx.tournamentMatch.update({
        where: { id: match.id },
        data: { winnerId: body.winnerTeamId!, status: "completed" },
      });

      if (reassignLoserTeamId) {
        await distributePrizes(match.id, body.winnerTeamId!, reassignLoserTeamId, tx);
      }
    });

    // Advance winner to next bracket slot if applicable
    if (match.nextMatchId) {
      const nextMatch = await prisma.tournamentMatch.findUnique({ where: { id: match.nextMatchId } });
      if (nextMatch) {
        await prisma.tournamentMatch.update({
          where: { id: match.nextMatchId },
          data: nextMatch.team1Id ? { team2Id: body.winnerTeamId } : { team1Id: body.winnerTeamId },
        });
      }
    }

    // Notify participants of the resolution
    for (const member of allMembers) {
      const won = member.teamId === body.winnerTeamId;
      notifications
        .matchResultApproved(member.userId, match.id, won, undefined)
        .catch((err) => console.error("[admin] reassign winner notification failed:", err));
    }

    await auditLog(
      adminId!,
      "match_winner_reassign",
      "match_result",
      resultId,
      body.adminNotes,
      { previousWinnerId: matchResult.winnerTeamId, newWinnerId: body.winnerTeamId },
    );

    const updated = await prisma.matchResult.findUnique({ where: { id: resultId }, include: { screenshots: true } });
    res.json(updated);
  }),
);

// GET /admin/tournaments/entry-fee-gaps — tournaments where collected fees < prize pool
router.get(
  "/tournaments/entry-fee-gaps",
  asyncHandler(async (_req: Request, res: Response) => {
    const tournaments = await prisma.tournament.findMany({
      where: { prizePoolPaise: { gt: 0 }, status: { notIn: ["cancelled", "completed"] } },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        prizePoolPaise: true,
        registrations: {
          where: { withdrawn: false },
          select: { entryFeePaise: true },
        },
      },
    });

    const gaps = tournaments
      .map((t) => {
        const totalCollected = t.registrations.reduce((sum, r) => sum + r.entryFeePaise, 0);
        const shortfall = t.prizePoolPaise - totalCollected;
        return {
          id: t.id,
          title: t.title,
          slug: t.slug,
          status: t.status,
          prizePoolPaise: t.prizePoolPaise,
          prizePoolInr: paiseToInr(t.prizePoolPaise),
          totalCollectedPaise: totalCollected,
          totalCollectedInr: paiseToInr(totalCollected),
          shortfallPaise: shortfall,
          shortfallInr: paiseToInr(shortfall),
        };
      })
      .filter((t) => t.shortfallPaise > 0);

    res.json({ data: gaps, count: gaps.length });
  }),
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

// GET /admin/audit-logs — list admin actions with filters
router.get(
  "/audit-logs",
  asyncHandler(async (req: Request, res: Response) => {
    const { adminId, action, entityType, from, to } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (adminId) where["adminId"] = adminId;
    if (action) where["action"] = action;
    if (entityType) where["entityType"] = entityType;
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter["gte"] = new Date(from);
      if (to) dateFilter["lte"] = new Date(to);
      where["createdAt"] = dateFilter;
    }

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    res.json({ data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  }),
);

export default router;
