import { getAuth } from "@clerk/express";
import { TransactionType, TournamentStatus, MatchStatus } from "@prisma/client";
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { banCheck } from "../middleware/ban-check";
import { asyncHandler } from "../lib/async-handler";
import { notifications } from "../services/notifications";
import { upsertLeaderboardOnApproval } from "../services/leaderboard";

const router = Router();

const STATUS_ORDER: TournamentStatus[] = [
  "draft",
  "registration_open",
  "registration_closed",
  "in_progress",
  "completed",
  "cancelled",
];

function nextStatus(current: TournamentStatus): TournamentStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx >= STATUS_ORDER.length - 2) return null; // can't advance past completed, cancelled is separate
  return STATUS_ORDER[idx + 1]!;
}

function paiseToInr(paise: number): string {
  return (paise / 100).toFixed(2);
}

async function computeWalletBalance(walletId: string): Promise<number> {
  const txs = await prisma.walletTransaction.findMany({
    where: { walletId, status: "completed" },
    select: { type: true, amountPaise: true },
  });
  return txs.reduce((acc, tx) => (tx.type === "credit" ? acc + tx.amountPaise : acc - tx.amountPaise), 0);
}

const tournamentPublicSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  rules: true,
  format: true,
  bracketType: true,
  game: true,
  status: true,
  maxTeams: true,
  entryFeePaise: true,
  prizePoolPaise: true,
  prizeDistribution: true,
  scheduledAt: true,
  registrationDeadline: true,
  cancellationWindowHours: true,
  createdAt: true,
  organizer: { select: { id: true, username: true } },
  _count: { select: { registrations: { where: { withdrawn: false } } } },
};

// ─── CRUD ────────────────────────────────────────────────────────────────────

// POST /tournaments — organizer/admin creates tournament
router.post(
  "/",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const body = req.body as {
      title?: string;
      slug?: string;
      description?: string;
      rules?: string;
      format?: string;
      bracketType?: string;
      game?: string;
      maxTeams?: unknown;
      entryFeePaise?: unknown;
      prizePoolPaise?: unknown;
      scheduledAt?: string;
      registrationDeadline?: string;
    };

    if (!body.title || !body.slug) {
      res.status(400).json({ error: "title and slug are required" });
      return;
    }

    const slug = body.slug.toLowerCase().trim();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: "slug may only contain lowercase letters, numbers, and hyphens" });
      return;
    }

    const maxTeams = Number(body.maxTeams);
    if (!Number.isInteger(maxTeams) || maxTeams < 2) {
      res.status(400).json({ error: "maxTeams must be an integer >= 2" });
      return;
    }

    // maxTeams must be power of 2 for single elimination
    if ((maxTeams & (maxTeams - 1)) !== 0) {
      res.status(400).json({ error: "maxTeams must be a power of 2 for single_elimination brackets (e.g. 4, 8, 16, 32)" });
      return;
    }

    const entryFeePaise = Number(body.entryFeePaise ?? 0);
    if (!Number.isInteger(entryFeePaise) || entryFeePaise < 0) {
      res.status(400).json({ error: "entryFeePaise must be a non-negative integer" });
      return;
    }

    const prizePoolPaise = Number(body.prizePoolPaise ?? 0);
    if (!Number.isInteger(prizePoolPaise) || prizePoolPaise < 0) {
      res.status(400).json({ error: "prizePoolPaise must be a non-negative integer" });
      return;
    }

    const validFormats = ["tournament", "scrim"];
    const format = body.format ?? "tournament";
    if (!validFormats.includes(format)) {
      res.status(400).json({ error: `format must be one of: ${validFormats.join(", ")}` });
      return;
    }

    try {
      const tournament = await prisma.tournament.create({
        data: {
          title: body.title.trim(),
          slug,
          description: body.description ?? null,
          rules: body.rules ?? null,
          format: format as "tournament" | "scrim",
          bracketType: "single_elimination",
          game: body.game ?? "bgmi",
          maxTeams,
          entryFeePaise,
          prizePoolPaise,
          organizerId: userId!,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          registrationDeadline: body.registrationDeadline ? new Date(body.registrationDeadline) : null,
        },
        select: tournamentPublicSelect,
      });
      res.status(201).json(tournament);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
        res.status(409).json({ error: "Tournament slug already taken" });
        return;
      }
      throw err;
    }
  })
);

// GET /tournaments — list with filters
router.get(
  "/",
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
        select: tournamentPublicSelect,
        orderBy: [
          { status: "asc" }, // registration_open sorts naturally after draft alphabetically — handled client-side
          { createdAt: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.tournament.count({ where }),
    ]);

    // Promote registration_open to top
    const sorted = [
      ...tournaments.filter((t) => t.status === "registration_open"),
      ...tournaments.filter((t) => t.status !== "registration_open"),
    ];

    res.json({
      data: sorted,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  })
);

// GET /tournaments/:slug — public detail
router.get(
  "/:slug",
  asyncHandler(async (req: Request, res: Response) => {
    const tournament = await prisma.tournament.findUnique({
      where: { slug: req.params["slug"] as string },
      select: {
        ...tournamentPublicSelect,
        registrations: {
          where: { withdrawn: false },
          select: {
            id: true,
            teamId: true,
            createdAt: true,
            team: { select: { id: true, name: true, slug: true, logoUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    res.json(tournament);
  })
);

// PATCH /tournaments/:id — organizer/admin updates
router.patch(
  "/:id",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const tournamentId = req.params["id"] as string;

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }
    if (tournament.organizerId !== userId) {
      res.status(403).json({ error: "Only the organizer can update this tournament" });
      return;
    }

    const body = req.body as {
      title?: string;
      description?: string;
      rules?: string;
      game?: string;
      scheduledAt?: string | null;
      registrationDeadline?: string | null;
      prizePoolPaise?: unknown;
      advanceStatus?: boolean;
    };

    // Status advancement
    if (body.advanceStatus) {
      const next = nextStatus(tournament.status);
      if (!next) {
        res.status(422).json({ error: "Tournament cannot be advanced further" });
        return;
      }
      const updated = await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: next },
        select: tournamentPublicSelect,
      });
      res.json(updated);
      return;
    }

    const updated = await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        ...(body.title !== undefined && { title: body.title.trim() }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.rules !== undefined && { rules: body.rules }),
        ...(body.game !== undefined && { game: body.game }),
        ...(body.scheduledAt !== undefined && { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null }),
        ...(body.registrationDeadline !== undefined && {
          registrationDeadline: body.registrationDeadline ? new Date(body.registrationDeadline) : null,
        }),
        ...(body.prizePoolPaise !== undefined && { prizePoolPaise: Number(body.prizePoolPaise) }),
      },
      select: tournamentPublicSelect,
    });

    res.json(updated);
  })
);

// DELETE /tournaments/:id — organizer only, only while draft
router.delete(
  "/:id",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const tournamentId = req.params["id"] as string;

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }
    if (tournament.organizerId !== userId) {
      res.status(403).json({ error: "Only the organizer can delete this tournament" });
      return;
    }
    if (tournament.status !== "draft") {
      res.status(422).json({ error: "Only draft tournaments can be deleted" });
      return;
    }

    await prisma.tournament.delete({ where: { id: tournamentId } });
    res.status(204).send();
  })
);

// ─── Registration ─────────────────────────────────────────────────────────────

// POST /tournaments/:id/register — team registers (owner of team)
router.post(
  "/:id/register",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const tournamentId = req.params["id"] as string;
    const body = req.body as { teamId?: string };

    if (!body.teamId) {
      res.status(400).json({ error: "teamId is required" });
      return;
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }
    if (tournament.status !== TournamentStatus.registration_open) {
      res.status(422).json({ error: "Tournament is not open for registration" });
      return;
    }

    if (tournament.registrationDeadline && new Date() > tournament.registrationDeadline) {
      res.status(422).json({ error: "Registration deadline has passed" });
      return;
    }

    // Verify requester is team owner
    const team = await prisma.team.findUnique({ where: { id: body.teamId } });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (team.ownerId !== userId) {
      res.status(403).json({ error: "Only the team owner can register the team" });
      return;
    }

    // Check max teams
    const activeRegCount = await prisma.tournamentRegistration.count({
      where: { tournamentId, withdrawn: false },
    });
    if (activeRegCount >= tournament.maxTeams) {
      res.status(422).json({ error: "Tournament is full" });
      return;
    }

    // Check duplicate registration
    const existing = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_teamId: { tournamentId, teamId: body.teamId } },
    });
    if (existing && !existing.withdrawn) {
      res.status(409).json({ error: "Team is already registered for this tournament" });
      return;
    }

    const entryFeePaise = tournament.entryFeePaise;

    // Atomic: deduct entry fee + create registration
    const registration = await prisma.$transaction(async (tx) => {
      let walletTxId: string | null = null;

      if (entryFeePaise > 0) {
        const wallet = await tx.wallet.findUnique({
          where: { userId: userId! },
          include: {
            transactions: {
              where: { status: "completed" },
              select: { type: true, amountPaise: true },
            },
          },
        });

        if (!wallet) {
          throw Object.assign(new Error("Wallet not found"), { status: 404 });
        }

        const completedBalance = wallet.transactions.reduce(
          (acc, t) => (t.type === "credit" ? acc + t.amountPaise : acc - t.amountPaise),
          0
        );
        const pendingDebits = await tx.walletTransaction.aggregate({
          where: { walletId: wallet.id, type: TransactionType.debit, status: "pending" },
          _sum: { amountPaise: true },
        });
        const available = completedBalance - (pendingDebits._sum.amountPaise ?? 0);

        if (available < entryFeePaise) {
          throw Object.assign(new Error("Insufficient wallet balance"), { status: 422 });
        }

        const idempotencyKey = `tournament:${tournamentId}:team:${body.teamId}:entry_fee`;
        const walletTx = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: TransactionType.debit,
            amountPaise: entryFeePaise,
            status: "completed",
            idempotencyKey,
            description: `Entry fee for tournament: ${tournament.title}`,
          },
        });
        walletTxId = walletTx.id;
      }

      // Upsert: re-register if previously withdrawn
      if (existing && existing.withdrawn) {
        return tx.tournamentRegistration.update({
          where: { id: existing.id },
          data: {
            withdrawn: false,
            withdrawnAt: null,
            refundTxId: null,
            entryFeePaise,
            walletTxId,
            registeredById: userId!,
          },
          include: { team: { select: { id: true, name: true, slug: true } } },
        });
      }

      return tx.tournamentRegistration.create({
        data: {
          tournamentId,
          teamId: body.teamId!,
          registeredById: userId!,
          entryFeePaise,
          walletTxId,
        },
        include: { team: { select: { id: true, name: true, slug: true } } },
      });
    });

    notifications.tournamentRegistered(userId!, tournament.title, tournamentId).catch(
      (err) => console.error("[notifications] tournamentRegistered failed:", err),
    );

    res.status(201).json(registration);
  })
);

// POST /tournaments/:id/registrations/:regId/withdraw — cancel registration
router.post(
  "/:id/registrations/:regId/withdraw",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const tournamentId = req.params["id"] as string;
    const regId = req.params["regId"] as string;

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    const registration = await prisma.tournamentRegistration.findUnique({
      where: { id: regId },
      include: { team: true },
    });
    if (!registration || registration.tournamentId !== tournamentId) {
      res.status(404).json({ error: "Registration not found" });
      return;
    }
    if (registration.withdrawn) {
      res.status(409).json({ error: "Registration already withdrawn" });
      return;
    }

    // Only team owner or tournament organizer can withdraw
    if (registration.team.ownerId !== userId && tournament.organizerId !== userId) {
      res.status(403).json({ error: "Not authorized to withdraw this registration" });
      return;
    }

    // Check cancellation window
    const windowMs = tournament.cancellationWindowHours * 60 * 60 * 1000;
    const registeredAt = registration.createdAt.getTime();
    const withinWindow = Date.now() - registeredAt <= windowMs;

    const updated = await prisma.$transaction(async (tx) => {
      let refundTxId: string | null = null;

      if (registration.entryFeePaise > 0 && registration.walletTxId && withinWindow) {
        const wallet = await tx.wallet.findUnique({ where: { userId: registration.team.ownerId } });
        if (wallet) {
          const refundKey = `tournament:${tournamentId}:team:${registration.teamId}:refund`;
          const refundTx = await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: TransactionType.credit,
              amountPaise: registration.entryFeePaise,
              status: "completed",
              idempotencyKey: refundKey,
              description: `Entry fee refund: ${tournament.title}`,
            },
          });
          refundTxId = refundTx.id;
        }
      }

      return tx.tournamentRegistration.update({
        where: { id: regId },
        data: { withdrawn: true, withdrawnAt: new Date(), refundTxId },
      });
    });

    const refunded = updated.refundTxId !== null;
    res.json({ ...updated, refunded, refundAmountPaise: refunded ? registration.entryFeePaise : 0 });
  })
);

// ─── Brackets ─────────────────────────────────────────────────────────────────

// POST /tournaments/:id/brackets/generate — generate single-elimination bracket
router.post(
  "/:id/brackets/generate",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const tournamentId = req.params["id"] as string;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: { withdrawn: false },
          orderBy: { createdAt: "asc" },
          select: { teamId: true },
        },
      },
    });
    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }
    if (tournament.organizerId !== userId) {
      res.status(403).json({ error: "Only the organizer can generate brackets" });
      return;
    }
    if (tournament.status !== TournamentStatus.registration_closed) {
      res.status(422).json({ error: "Brackets can only be generated when registration is closed" });
      return;
    }

    const existingMatches = await prisma.tournamentMatch.count({ where: { tournamentId } });
    if (existingMatches > 0) {
      res.status(409).json({ error: "Bracket has already been generated" });
      return;
    }

    const teams = tournament.registrations.map((r) => r.teamId);
    const numTeams = teams.length;

    if (numTeams < 2) {
      res.status(422).json({ error: "At least 2 teams required to generate a bracket" });
      return;
    }

    // Pad to next power of 2 with byes
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(numTeams)));
    const numRounds = Math.log2(bracketSize);

    // Shuffle teams for seeding
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    while (shuffled.length < bracketSize) shuffled.push(""); // empty string = bye slot

    // Build match tree bottom-up
    // Round 1: bracketSize/2 matches, Round 2: bracketSize/4, ... Final: 1 match
    const matchData: {
      tournamentId: string;
      round: number;
      matchNumber: number;
      team1Id: string | null;
      team2Id: string | null;
      status: MatchStatus;
    }[] = [];

    for (let round = 1; round <= numRounds; round++) {
      const matchesInRound = bracketSize / Math.pow(2, round);
      for (let m = 1; m <= matchesInRound; m++) {
        if (round === 1) {
          const i1 = (m - 1) * 2;
          const i2 = i1 + 1;
          const t1 = shuffled[i1] || null;
          const t2 = shuffled[i2] || null;

          // Auto-advance bye matches
          let status: MatchStatus = MatchStatus.pending;
          if (!t1 || !t2) status = MatchStatus.bye;

          matchData.push({
            tournamentId,
            round,
            matchNumber: m,
            team1Id: t1 || null,
            team2Id: t2 || null,
            status,
          });
        } else {
          matchData.push({
            tournamentId,
            round,
            matchNumber: m,
            team1Id: null,
            team2Id: null,
            status: MatchStatus.pending,
          });
        }
      }
    }

    // Create all matches and wire up nextMatchId
    const created = await prisma.$transaction(async (tx) => {
      const matches = await Promise.all(matchData.map((m) => tx.tournamentMatch.create({ data: m })));

      // Map round+matchNumber → id for linking
      const matchMap = new Map<string, string>();
      for (const m of matches) {
        matchMap.set(`${m.round}:${m.matchNumber}`, m.id);
      }

      // Wire nextMatchId: round R match M feeds into round R+1 match ceil(M/2)
      const updates: Promise<unknown>[] = [];
      for (let round = 1; round < numRounds; round++) {
        const matchesInRound = bracketSize / Math.pow(2, round);
        for (let m = 1; m <= matchesInRound; m++) {
          const currentId = matchMap.get(`${round}:${m}`);
          const nextMatchNumber = Math.ceil(m / 2);
          const nextId = matchMap.get(`${round + 1}:${nextMatchNumber}`);
          if (currentId && nextId) {
            updates.push(tx.tournamentMatch.update({ where: { id: currentId }, data: { nextMatchId: nextId } }));
          }
        }
      }
      await Promise.all(updates);

      // Auto-advance byes: if t2 is null, winner = t1 and advance to next round
      const byeMatches = matches.filter((m) => m.status === MatchStatus.bye);
      for (const bye of byeMatches) {
        const winnerId = bye.team1Id;
        if (!winnerId) continue;

        await tx.tournamentMatch.update({ where: { id: bye.id }, data: { winnerId, status: MatchStatus.completed } });

        if (bye.nextMatchId) {
          const nextMatch = await tx.tournamentMatch.findUnique({ where: { id: bye.nextMatchId } });
          if (nextMatch) {
            if (!nextMatch.team1Id) {
              await tx.tournamentMatch.update({ where: { id: bye.nextMatchId }, data: { team1Id: winnerId } });
            } else {
              await tx.tournamentMatch.update({ where: { id: bye.nextMatchId }, data: { team2Id: winnerId } });
            }
          }
        }
      }

      return matches;
    });

    res.status(201).json({ message: "Bracket generated", matchCount: created.length });
  })
);

// GET /tournaments/:id/brackets — return match tree
router.get(
  "/:id/brackets",
  asyncHandler(async (req: Request, res: Response) => {
    const tournamentId = req.params["id"] as string;

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    const matches = await prisma.tournamentMatch.findMany({
      where: { tournamentId },
      orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
      select: {
        id: true,
        round: true,
        matchNumber: true,
        status: true,
        nextMatchId: true,
        team1: { select: { id: true, name: true, slug: true, logoUrl: true } },
        team2: { select: { id: true, name: true, slug: true, logoUrl: true } },
        winner: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });

    // Group by round
    const rounds: Record<number, typeof matches> = {};
    for (const m of matches) {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round]!.push(m);
    }

    res.json({ tournamentId, rounds });
  })
);

// ─── Match Results ────────────────────────────────────────────────────────────

async function getTeamMemberIds(teamId: string): Promise<string[]> {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

// POST /tournaments/:id/matches/:matchId/result — submit match result
router.post(
  "/:id/matches/:matchId/result",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const tournamentId = req.params["id"] as string;
    const matchId = req.params["matchId"] as string;
    const body = req.body as {
      winnerTeamId?: string;
      screenshots?: { url: string; publicId: string }[];
      winnerKills?: unknown;
      loserKills?: unknown;
    };

    if (!body.winnerTeamId) {
      res.status(400).json({ error: "winnerTeamId is required" });
      return;
    }

    const winnerKills = Math.max(0, Number(body.winnerKills ?? 0));
    const loserKills = Math.max(0, Number(body.loserKills ?? 0));

    const match = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      include: {
        team1: { include: { members: { select: { userId: true } } } },
        team2: { include: { members: { select: { userId: true } } } },
      },
    });

    if (!match || match.tournamentId !== tournamentId) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    if (match.status === MatchStatus.completed || match.status === MatchStatus.bye) {
      res.status(422).json({ error: "Match result already finalised" });
      return;
    }
    if (!match.team1Id || !match.team2Id) {
      res.status(422).json({ error: "Match does not have two teams yet" });
      return;
    }

    // Requester must be a member of one of the teams
    const team1MemberIds = (match.team1?.members ?? []).map((m) => m.userId);
    const team2MemberIds = (match.team2?.members ?? []).map((m) => m.userId);
    const isParticipant = team1MemberIds.includes(userId!) || team2MemberIds.includes(userId!);
    if (!isParticipant) {
      res.status(403).json({ error: "You are not a participant in this match" });
      return;
    }

    if (body.winnerTeamId !== match.team1Id && body.winnerTeamId !== match.team2Id) {
      res.status(400).json({ error: "winnerTeamId must be one of the match teams" });
      return;
    }

    // Only one active result per match
    const existing = await prisma.matchResult.findFirst({
      where: { matchId, status: { in: ["pending_review", "disputed"] } },
    });
    if (existing) {
      res.status(409).json({ error: "A result is already pending review or disputed for this match" });
      return;
    }

    const screenshotData = body.screenshots?.length
      ? { create: body.screenshots.map((s) => ({ cloudinaryUrl: s.url, cloudinaryPublicId: s.publicId })) }
      : {};

    const result = await prisma.matchResult.create({
      data: {
        matchId,
        submittedBy: userId!,
        winnerTeamId: body.winnerTeamId,
        winnerKills,
        loserKills,
        status: "pending_review",
        ...screenshotData,
      },
      include: { screenshots: true },
    });

    // Notify opposing team members that a result was submitted
    const submittingTeamId = team1MemberIds.includes(userId!) ? match.team1Id : match.team2Id;
    const opposingTeamId = submittingTeamId === match.team1Id ? match.team2Id : match.team1Id;
    const opposingTeamName =
      submittingTeamId === match.team1Id ? match.team2?.name ?? "opponent" : match.team1?.name ?? "opponent";
    const submittingTeamName =
      submittingTeamId === match.team1Id ? match.team1?.name ?? "your team" : match.team2?.name ?? "your team";

    const opposingMemberIds = await getTeamMemberIds(opposingTeamId!);
    await Promise.allSettled(
      opposingMemberIds.map((uid) =>
        notifications.matchResultSubmitted(uid, matchId, submittingTeamName).catch(
          (err) => console.error("[notifications] matchResultSubmitted failed:", err),
        ),
      ),
    );

    res.status(201).json(result);
  })
);

// POST /tournaments/:id/matches/:matchId/result/approve — organizer approves result
router.post(
  "/:id/matches/:matchId/result/approve",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const tournamentId = req.params["id"] as string;
    const matchId = req.params["matchId"] as string;
    const body = req.body as { adminNotes?: string };

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId! }, select: { isAdmin: true } });
    if (tournament.organizerId !== userId && !user?.isAdmin) {
      res.status(403).json({ error: "Only the tournament organizer or an admin can approve results" });
      return;
    }

    const match = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      select: { id: true, tournamentId: true, status: true, nextMatchId: true, team1Id: true, team2Id: true },
    });
    if (!match || match.tournamentId !== tournamentId) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const pendingResult = await prisma.matchResult.findFirst({
      where: { matchId, status: { in: ["pending_review", "disputed"] } },
    });
    if (!pendingResult) {
      res.status(404).json({ error: "No pending result found for this match" });
      return;
    }

    const prizePoolPaise = tournament.prizePoolPaise;

    const approvedResult = await prisma.$transaction(async (tx) => {
      const result = await tx.matchResult.update({
        where: { id: pendingResult.id },
        data: { status: "approved", reviewedBy: userId!, reviewedAt: new Date(), adminNotes: body.adminNotes ?? null },
      });

      await tx.tournamentMatch.update({
        where: { id: matchId },
        data: { winnerId: pendingResult.winnerTeamId, status: MatchStatus.completed },
      });

      // Upsert leaderboard for both match participants
      const loserTeamId = pendingResult.winnerTeamId === match.team1Id ? match.team2Id : match.team1Id;
      if (loserTeamId) {
        await upsertLeaderboardOnApproval(tx, {
          tournamentId,
          winnerTeamId: pendingResult.winnerTeamId,
          loserTeamId,
          winnerKills: pendingResult.winnerKills,
          loserKills: pendingResult.loserKills,
          pointsConfig: tournament.pointsConfig,
        });
      }

      return result;
    });

    // Advance winner to next match slot if bracket continues
    if (match.nextMatchId) {
      const nextMatch = await prisma.tournamentMatch.findUnique({ where: { id: match.nextMatchId } });
      if (nextMatch) {
        await prisma.tournamentMatch.update({
          where: { id: match.nextMatchId },
          data: nextMatch.team1Id ? { team2Id: pendingResult.winnerTeamId } : { team1Id: pendingResult.winnerTeamId },
        });
      }
    }

    // Notify all participants
    const [team1Members, team2Members] = await Promise.all([
      match.team1Id ? getTeamMemberIds(match.team1Id) : Promise.resolve([]),
      match.team2Id ? getTeamMemberIds(match.team2Id) : Promise.resolve([]),
    ]);

    const prizeAmountStr = prizePoolPaise > 0 ? paiseToInr(prizePoolPaise) : undefined;

    await Promise.allSettled([
      ...team1Members.map((uid) =>
        notifications
          .matchResultApproved(uid, matchId, pendingResult.winnerTeamId === match.team1Id, prizeAmountStr)
          .catch((err) => console.error("[notifications] matchResultApproved failed:", err)),
      ),
      ...team2Members.map((uid) =>
        notifications
          .matchResultApproved(uid, matchId, pendingResult.winnerTeamId === match.team2Id, prizeAmountStr)
          .catch((err) => console.error("[notifications] matchResultApproved failed:", err)),
      ),
    ]);

    res.json(approvedResult);
  })
);

// POST /tournaments/:id/matches/:matchId/result/dispute — team member disputes result
router.post(
  "/:id/matches/:matchId/result/dispute",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const tournamentId = req.params["id"] as string;
    const matchId = req.params["matchId"] as string;

    const match = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      select: { id: true, tournamentId: true, team1Id: true, team2Id: true },
    });
    if (!match || match.tournamentId !== tournamentId) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const [team1Members, team2Members] = await Promise.all([
      match.team1Id ? getTeamMemberIds(match.team1Id) : Promise.resolve([]),
      match.team2Id ? getTeamMemberIds(match.team2Id) : Promise.resolve([]),
    ]);

    const isParticipant = [...team1Members, ...team2Members].includes(userId!);
    if (!isParticipant) {
      res.status(403).json({ error: "You are not a participant in this match" });
      return;
    }

    const pendingResult = await prisma.matchResult.findFirst({
      where: { matchId, status: "pending_review" },
    });
    if (!pendingResult) {
      res.status(404).json({ error: "No result pending review for this match" });
      return;
    }

    const disputed = await prisma.matchResult.update({
      where: { id: pendingResult.id },
      data: { status: "disputed" },
    });

    // Notify all participants from both teams
    await Promise.allSettled(
      [...team1Members, ...team2Members].map((uid) =>
        notifications
          .matchResultDisputed(uid, matchId)
          .catch((err) => console.error("[notifications] matchResultDisputed failed:", err)),
      ),
    );

    res.json(disputed);
  })
);

// GET /tournaments/:id/leaderboard — public ranked standings for a tournament
router.get(
  "/:id/leaderboard",
  asyncHandler(async (req: Request, res: Response) => {
    const tournamentId = req.params["id"] as string;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });
    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    const entries = await prisma.leaderboardEntry.findMany({
      where: { tournamentId },
      orderBy: [{ points: "desc" }, { kills: "desc" }],
      select: {
        teamId: true,
        points: true,
        kills: true,
        matchesPlayed: true,
        team: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });

    const ranked = entries.map((entry, idx) => ({
      rank: idx + 1,
      team: entry.team,
      points: entry.points,
      kills: entry.kills,
      matchesPlayed: entry.matchesPlayed,
    }));

    res.json({ tournamentId, entries: ranked });
  })
);

export default router;
