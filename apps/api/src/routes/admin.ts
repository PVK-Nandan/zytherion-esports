import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin"));

async function logAdminAction(
  adminId: string,
  action: string,
  entityType: string,
  entityId: string
) {
  await prisma.adminAuditLog.create({
    data: { adminId, action, entityType, entityId },
  });
}

// GET /admin/dashboard — pending counts
router.get("/dashboard", async (_req, res) => {
  const [pendingReviews, disputes, pendingKyc, pendingWithdrawals] =
    await Promise.all([
      prisma.matchResult.count({ where: { status: "pending_review" } }),
      prisma.matchResult.count({ where: { status: "disputed" } }),
      prisma.user.count({ where: { kycStatus: "submitted", deletedAt: null } }),
      prisma.walletTransaction.count({
        where: { type: "withdrawal", status: "pending" },
      }),
    ]);
  res.json({ pendingReviews, disputes, pendingKyc, pendingWithdrawals });
});

// GET /admin/users — list users with filters
router.get("/users", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const search = req.query.q as string | undefined;

  const where = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { username: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        isBanned: true,
        kycStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, page, limit });
});

// PATCH /admin/users/:id/ban
const BanSchema = z.object({ banned: z.boolean() });

router.patch("/users/:id/ban", async (req: AuthRequest, res) => {
  const parsed = BanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isBanned: parsed.data.banned },
    select: { id: true, username: true, isBanned: true },
  });
  await logAdminAction(
    req.userId!,
    parsed.data.banned ? "ban_user" : "unban_user",
    "user",
    req.params.id
  );
  res.json(user);
});

// PATCH /admin/users/:id/kyc-status
const KycSchema = z.object({
  kycStatus: z.enum(["pending", "submitted", "verified", "rejected"]),
});

router.patch("/users/:id/kyc-status", async (req: AuthRequest, res) => {
  const parsed = KycSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { kycStatus: parsed.data.kycStatus },
    select: { id: true, username: true, kycStatus: true },
  });
  await logAdminAction(
    req.userId!,
    "update_kyc_status",
    "user",
    req.params.id
  );
  res.json(user);
});

// GET /admin/wallets
router.get("/wallets", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const userId = req.query.userId as string | undefined;

  const where = userId ? { userId } : {};
  const [wallets, total] = await Promise.all([
    prisma.wallet.findMany({
      where,
      include: {
        user: { select: { username: true, email: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.wallet.count({ where }),
  ]);
  res.json({ wallets, total, page, limit });
});

// GET /admin/wallet-transactions
router.get("/wallet-transactions", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (req.query.walletId) where.walletId = req.query.walletId;
  if (req.query.type) where.type = req.query.type;
  if (req.query.status) where.status = req.query.status;
  if (req.query.from || req.query.to) {
    where.createdAt = {
      ...(req.query.from ? { gte: new Date(req.query.from as string) } : {}),
      ...(req.query.to ? { lte: new Date(req.query.to as string) } : {}),
    };
  }

  const [txs, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.walletTransaction.count({ where }),
  ]);
  res.json({ transactions: txs, total, page, limit });
});

// GET /admin/tournaments
router.get("/tournaments", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;

  const where = { ...(status ? { status } : {}), deletedAt: null };
  const [tournaments, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      include: {
        organizer: { select: { username: true } },
        _count: { select: { registrations: true, matches: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.tournament.count({ where }),
  ]);
  res.json({ tournaments, total, page, limit });
});

// POST /admin/tournaments/:id/cancel
router.post("/tournaments/:id/cancel", async (req: AuthRequest, res) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id, deletedAt: null },
    include: {
      registrations: { include: { entryFeeTx: true } },
    },
  });

  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }
  if (["completed", "cancelled"].includes(tournament.status)) {
    res.status(409).json({ error: `Tournament already ${tournament.status}` });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.tournament.update({
      where: { id: req.params.id },
      data: { status: "cancelled" },
    });

    for (const reg of tournament.registrations) {
      if (
        reg.entryFeeTx &&
        reg.entryFeeTx.status === "completed" &&
        reg.entryFeeTx.amountPaise < 0n
      ) {
        const wallet = await tx.wallet.findUnique({
          where: { userId: reg.entryFeeTx.walletId },
        });
        if (wallet) {
          const balance = await tx.walletTransaction.aggregate({
            where: { walletId: wallet.id, status: "completed" },
            _sum: { amountPaise: true },
          });
          const currentBalance = balance._sum.amountPaise ?? 0n;
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: "refund",
              amountPaise: -reg.entryFeeTx.amountPaise,
              balanceAfterPaise: currentBalance - reg.entryFeeTx.amountPaise,
              status: "completed",
              idempotencyKey: `cancel-refund-${reg.id}`,
              description: `Refund for cancelled tournament: ${tournament.title}`,
            },
          });
        }
      }
    }
  });

  await logAdminAction(req.userId!, "cancel_tournament", "tournament", req.params.id);
  res.json({ success: true });
});

// GET /admin/match-results
router.get("/match-results", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;

  const where = status ? { status } : {};
  const [results, total] = await Promise.all([
    prisma.matchResult.findMany({
      where,
      include: {
        match: { include: { tournament: { select: { title: true } } } },
        submittedBy: { select: { username: true } },
        reviewedBy: { select: { username: true } },
      },
      orderBy: { submittedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.matchResult.count({ where }),
  ]);
  res.json({ results, total, page, limit });
});

// PATCH /admin/match-results/:id/review
const ReviewSchema = z.object({
  decision: z.enum(["approved", "rejected", "disputed"]),
  notes: z.string().optional(),
});

router.patch("/match-results/:id/review", async (req: AuthRequest, res) => {
  const parsed = ReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const result = await prisma.matchResult.findUnique({
    where: { id: req.params.id },
    include: {
      match: {
        include: {
          tournament: true,
          team1: true,
          team2: true,
        },
      },
    },
  });

  if (!result) {
    res.status(404).json({ error: "Match result not found" });
    return;
  }
  if (result.status !== "pending_review") {
    res.status(409).json({ error: `Result already ${result.status}` });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchResult.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.decision,
        reviewedByUserId: req.userId,
        reviewedAt: new Date(),
        reviewNotes: parsed.data.notes,
      },
    });

    if (parsed.data.decision === "approved") {
      await tx.match.update({
        where: { id: result.matchId },
        data: { status: "completed", winnerTeamId: result.winnerTeamId },
      });

      const tournament = result.match.tournament;
      if (tournament.prizePoolPaise > 0n && tournament.prizeDistribution) {
        const dist = tournament.prizeDistribution as Record<string, number>;
        const winnerShare = dist["1"] ?? 0;
        if (winnerShare > 0) {
          const prizeAmount = BigInt(
            Math.floor((Number(tournament.prizePoolPaise) * winnerShare) / 100)
          );
          const winnerWallet = await tx.wallet.findFirst({
            where: {
              user: {
                teamMemberships: { some: { teamId: result.winnerTeamId, role: "owner" } },
              },
            },
          });
          if (winnerWallet) {
            const balance = await tx.walletTransaction.aggregate({
              where: { walletId: winnerWallet.id, status: "completed" },
              _sum: { amountPaise: true },
            });
            await tx.walletTransaction.create({
              data: {
                walletId: winnerWallet.id,
                type: "prize_credit",
                amountPaise: prizeAmount,
                balanceAfterPaise: (balance._sum.amountPaise ?? 0n) + prizeAmount,
                status: "completed",
                idempotencyKey: `prize-${result.matchId}-${result.winnerTeamId}`,
                description: `Prize for winning match in ${tournament.title}`,
              },
            });
          }
        }
      }
    }
  });

  await logAdminAction(req.userId!, `review_match_${parsed.data.decision}`, "match_result", req.params.id);
  res.json({ success: true });
});

// PATCH /admin/match-results/:id/reassign-winner
const ReassignSchema = z.object({ winnerTeamId: z.string() });

router.patch("/match-results/:id/reassign-winner", async (req: AuthRequest, res) => {
  const parsed = ReassignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const result = await prisma.matchResult.findUnique({
    where: { id: req.params.id },
    include: { match: { include: { tournament: true } } },
  });

  if (!result) {
    res.status(404).json({ error: "Match result not found" });
    return;
  }
  if (result.status !== "disputed") {
    res.status(409).json({ error: "Can only reassign winner for disputed results" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchResult.update({
      where: { id: req.params.id },
      data: {
        winnerTeamId: parsed.data.winnerTeamId,
        status: "approved",
        reviewedByUserId: req.userId,
        reviewedAt: new Date(),
      },
    });
    await tx.match.update({
      where: { id: result.matchId },
      data: { status: "completed", winnerTeamId: parsed.data.winnerTeamId },
    });
  });

  await logAdminAction(req.userId!, "reassign_match_winner", "match_result", req.params.id);
  res.json({ success: true });
});

// GET /admin/audit-logs
router.get("/audit-logs", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (req.query.adminId) where.adminId = req.query.adminId;
  if (req.query.action) where.action = { contains: req.query.action };
  if (req.query.entityType) where.entityType = req.query.entityType;
  if (req.query.entityId) where.entityId = req.query.entityId;
  if (req.query.from || req.query.to) {
    where.createdAt = {
      ...(req.query.from ? { gte: new Date(req.query.from as string) } : {}),
      ...(req.query.to ? { lte: new Date(req.query.to as string) } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      include: { admin: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);
  res.json({ logs, total, page, limit });
});

export default router;
