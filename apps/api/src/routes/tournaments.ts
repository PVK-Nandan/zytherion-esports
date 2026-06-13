import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireRole } from "../middleware/auth";
import { getWalletBalance } from "./wallets";

const router = Router();

const CreateTournamentSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z
    .string()
    .min(3)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional(),
  game: z.string().default("BGMI"),
  format: z.enum(["scrim", "tournament"]),
  bracketType: z
    .enum(["single_elimination", "double_elimination", "round_robin", "custom"])
    .default("single_elimination"),
  maxTeams: z.number().int().min(2).max(128),
  entryFeeInr: z.number().int().min(0).default(0),
  prizePoolInr: z.number().int().min(0).default(0),
  prizeDistribution: z.record(z.string(), z.number()).optional(),
  registrationStartsAt: z.string().datetime().optional(),
  registrationEndsAt: z.string().datetime().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  rules: z.string().max(5000).optional(),
});

const UpdateTournamentSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z
    .enum([
      "draft",
      "registration_open",
      "registration_closed",
      "in_progress",
      "completed",
      "cancelled",
    ])
    .optional(),
  maxTeams: z.number().int().min(2).max(128).optional(),
  entryFeeInr: z.number().int().min(0).optional(),
  prizePoolInr: z.number().int().min(0).optional(),
  prizeDistribution: z.record(z.string(), z.number()).optional(),
  registrationStartsAt: z.string().datetime().optional(),
  registrationEndsAt: z.string().datetime().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  rules: z.string().max(5000).optional(),
});

// Ordered status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["registration_open", "cancelled"],
  registration_open: ["registration_closed", "cancelled"],
  registration_closed: ["in_progress", "registration_open", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// GET /tournaments — list with filters
router.get("/", async (req, res) => {
  const status = req.query.status as string | undefined;
  const format = req.query.format as string | undefined;
  const game = req.query.game as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { deletedAt: null };
  if (status) where.status = status;
  if (format) where.format = format;
  if (game) where.game = game;

  const [tournaments, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      orderBy: [
        // registration_open first, then by creation
        { createdAt: "desc" },
      ],
      skip,
      take: limit,
      include: {
        _count: { select: { registrations: { where: { status: "confirmed" } } } },
      },
    }),
    prisma.tournament.count({ where }),
  ]);

  res.json({
    data: tournaments.map((t) => ({
      ...t,
      entryFeePaise: t.entryFeePaise.toString(),
      entryFeeInr: Number(t.entryFeePaise) / 100,
      prizePoolPaise: t.prizePoolPaise.toString(),
      prizePoolInr: Number(t.prizePoolPaise) / 100,
      registeredTeamsCount: t._count.registrations,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// POST /tournaments — create (organizer/admin only)
router.post(
  "/",
  requireAuth,
  requireRole("organizer", "admin"),
  async (req: AuthRequest, res) => {
    const parsed = CreateTournamentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const {
      title,
      slug,
      description,
      game,
      format,
      bracketType,
      maxTeams,
      entryFeeInr,
      prizePoolInr,
      prizeDistribution,
      registrationStartsAt,
      registrationEndsAt,
      startsAt,
      endsAt,
      rules,
    } = parsed.data;

    try {
      const tournament = await prisma.tournament.create({
        data: {
          title,
          slug,
          description,
          game,
          format,
          bracketType,
          maxTeams,
          entryFeePaise: BigInt(entryFeeInr * 100),
          prizePoolPaise: BigInt(prizePoolInr * 100),
          prizeDistribution: prizeDistribution ?? undefined,
          registrationStartsAt: registrationStartsAt
            ? new Date(registrationStartsAt)
            : undefined,
          registrationEndsAt: registrationEndsAt
            ? new Date(registrationEndsAt)
            : undefined,
          startsAt: startsAt ? new Date(startsAt) : undefined,
          endsAt: endsAt ? new Date(endsAt) : undefined,
          rules,
          organizerUserId: req.userId!,
        },
      });

      res.status(201).json({
        ...tournament,
        entryFeePaise: tournament.entryFeePaise.toString(),
        entryFeeInr,
        prizePoolPaise: tournament.prizePoolPaise.toString(),
        prizePoolInr,
      });
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === "P2002") {
        res.status(409).json({ error: "Tournament slug already taken" });
        return;
      }
      throw err;
    }
  }
);

// GET /tournaments/:slug — public detail
router.get("/:slug", async (req, res) => {
  const tournament = await prisma.tournament.findUnique({
    where: { slug: req.params.slug, deletedAt: null },
    include: {
      organizer: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
      _count: {
        select: { registrations: { where: { status: "confirmed" } } },
      },
    },
  });

  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  res.json({
    ...tournament,
    entryFeePaise: tournament.entryFeePaise.toString(),
    entryFeeInr: Number(tournament.entryFeePaise) / 100,
    prizePoolPaise: tournament.prizePoolPaise.toString(),
    prizePoolInr: Number(tournament.prizePoolPaise) / 100,
    registeredTeamsCount: tournament._count.registrations,
  });
});

// PATCH /tournaments/:id — update (organizer/admin only)
router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const isOrganizer = tournament.organizerUserId === req.userId;
  const isAdmin = req.userRole === "admin";

  if (!isOrganizer && !isAdmin) {
    res.status(403).json({ error: "Only organizer or admin can update tournament" });
    return;
  }

  const parsed = UpdateTournamentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Validate status transition
  if (parsed.data.status && parsed.data.status !== tournament.status) {
    const allowed = STATUS_TRANSITIONS[tournament.status] ?? [];
    if (!allowed.includes(parsed.data.status)) {
      res.status(422).json({
        error: `Invalid status transition: ${tournament.status} → ${parsed.data.status}`,
        allowedTransitions: allowed,
      });
      return;
    }
  }

  const { entryFeeInr, prizePoolInr, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (entryFeeInr !== undefined) updateData.entryFeePaise = BigInt(entryFeeInr * 100);
  if (prizePoolInr !== undefined) updateData.prizePoolPaise = BigInt(prizePoolInr * 100);

  const updated = await prisma.tournament.update({
    where: { id: req.params.id },
    data: updateData,
  });

  res.json({
    ...updated,
    entryFeePaise: updated.entryFeePaise.toString(),
    entryFeeInr: Number(updated.entryFeePaise) / 100,
    prizePoolPaise: updated.prizePoolPaise.toString(),
    prizePoolInr: Number(updated.prizePoolPaise) / 100,
  });
});

// DELETE /tournaments/:id — soft delete (organizer/admin only, draft status only)
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const isOrganizer = tournament.organizerUserId === req.userId;
  const isAdmin = req.userRole === "admin";

  if (!isOrganizer && !isAdmin) {
    res.status(403).json({ error: "Only organizer or admin can delete tournament" });
    return;
  }

  if (tournament.status !== "draft" && !isAdmin) {
    res.status(422).json({
      error: "Only draft tournaments can be deleted; use cancel instead",
    });
    return;
  }

  await prisma.tournament.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  res.status(204).send();
});

// POST /tournaments/:id/register — team registration with entry fee deduction
router.post("/:id/register", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({ teamId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id, deletedAt: null },
    include: {
      _count: { select: { registrations: { where: { status: "confirmed" } } } },
    },
  });

  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  if (tournament.status !== "registration_open") {
    res.status(422).json({
      error: `Registration is not open (current status: ${tournament.status})`,
    });
    return;
  }

  if (tournament._count.registrations >= tournament.maxTeams) {
    res.status(422).json({ error: "Tournament is full" });
    return;
  }

  // Verify requester is team owner
  const team = await prisma.team.findUnique({
    where: { id: parsed.data.teamId, deletedAt: null },
  });

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.ownerUserId !== req.userId) {
    res.status(403).json({ error: "Only team owner can register the team" });
    return;
  }

  // Check already registered
  const existing = await prisma.tournamentRegistration.findUnique({
    where: { tournamentId_teamId: { tournamentId: tournament.id, teamId: team.id } },
  });
  if (existing) {
    res.status(409).json({ error: "Team is already registered for this tournament" });
    return;
  }

  const entryFeePaise = Number(tournament.entryFeePaise);

  // If entry fee required, deduct atomically
  if (entryFeePaise > 0) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId! } });
    if (!wallet) {
      res.status(422).json({ error: "Wallet not found" });
      return;
    }

    const balance = await getWalletBalance(wallet.id);
    if (balance < BigInt(entryFeePaise)) {
      res.status(422).json({
        error: "Insufficient wallet balance",
        requiredPaise: entryFeePaise,
        requiredInr: entryFeePaise / 100,
        balancePaise: balance.toString(),
        balanceInr: Number(balance) / 100,
      });
      return;
    }

    const idempotencyKey = `tournament:${tournament.id}:entry_fee:${team.id}`;
    const balanceAfter = balance - BigInt(entryFeePaise);

    // Atomic: create wallet tx + registration in one transaction
    const result = await prisma.$transaction(async (tx) => {
      let feeTx;
      try {
        feeTx = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: "entry_fee_debit",
            amountPaise: BigInt(-entryFeePaise),
            balanceAfterPaise: balanceAfter,
            status: "completed",
            referenceType: "tournament",
            referenceId: tournament.id,
            idempotencyKey,
            description: `Entry fee for ${tournament.title}`,
          },
        });
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === "P2002") {
          // Idempotency key collision — already registered
          throw { code: "ALREADY_REGISTERED" };
        }
        throw err;
      }

      const registration = await tx.tournamentRegistration.create({
        data: {
          tournamentId: tournament.id,
          teamId: team.id,
          status: "confirmed",
          entryFeeTxId: feeTx.id,
        },
      });

      return { registration, feeTx };
    });

    res.status(201).json({
      registration: result.registration,
      entryFeeDeducted: { paise: entryFeePaise, inr: entryFeePaise / 100 },
    });
  } else {
    // No entry fee — register directly
    const registration = await prisma.tournamentRegistration.create({
      data: {
        tournamentId: tournament.id,
        teamId: team.id,
        status: "confirmed",
      },
    });

    res.status(201).json({ registration });
  }
});

// POST /tournaments/:id/registrations/:regId/withdraw — cancel registration
router.post(
  "/:id/registrations/:regId/withdraw",
  requireAuth,
  async (req: AuthRequest, res) => {
    const registration = await prisma.tournamentRegistration.findUnique({
      where: { id: req.params.regId },
      include: {
        team: true,
        tournament: true,
        entryFeeTx: true,
      },
    });

    if (!registration || registration.tournamentId !== req.params.id) {
      res.status(404).json({ error: "Registration not found" });
      return;
    }
    if (registration.team.ownerUserId !== req.userId) {
      res.status(403).json({ error: "Only team owner can withdraw registration" });
      return;
    }
    if (registration.status !== "confirmed") {
      res.status(422).json({ error: "Registration is not active" });
      return;
    }

    const tournament = registration.tournament;
    if (!["draft", "registration_open", "registration_closed"].includes(tournament.status)) {
      res.status(422).json({
        error: "Cannot withdraw after tournament has started",
      });
      return;
    }

    // Refund if within cancellation window (registration_open status only)
    const shouldRefund =
      registration.entryFeeTx &&
      registration.entryFeeTx.status === "completed" &&
      tournament.status === "registration_open";

    await prisma.$transaction(async (tx) => {
      await tx.tournamentRegistration.update({
        where: { id: registration.id },
        data: { status: "withdrawn" },
      });

      if (shouldRefund && registration.entryFeeTx) {
        const entryAmount = -registration.entryFeeTx.amountPaise; // make positive
        const wallet = await tx.wallet.findUnique({
          where: { userId: req.userId! },
        });
        if (!wallet) return;

        const currentBalance = await getWalletBalance(wallet.id);
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: "refund",
            amountPaise: entryAmount,
            balanceAfterPaise: currentBalance + entryAmount,
            status: "completed",
            referenceType: "tournament_registration",
            referenceId: registration.id,
            idempotencyKey: `tournament:${tournament.id}:refund:${registration.team.id}`,
            description: `Refund for withdrawal from ${tournament.title}`,
          },
        });
      }
    });

    res.json({
      message: "Registration withdrawn",
      refunded: shouldRefund
        ? {
            paise: Number(-registration.entryFeeTx!.amountPaise),
            inr: Number(-registration.entryFeeTx!.amountPaise) / 100,
          }
        : null,
    });
  }
);

// POST /tournaments/:id/brackets/generate — generate single-elimination bracket
router.post(
  "/:id/brackets/generate",
  requireAuth,
  async (req: AuthRequest, res) => {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id, deletedAt: null },
      include: {
        registrations: {
          where: { status: "confirmed" },
          include: { team: { select: { id: true, name: true, slug: true } } },
          orderBy: { registeredAt: "asc" },
        },
      },
    });

    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    const isOrganizer = tournament.organizerUserId === req.userId;
    const isAdmin = req.userRole === "admin";
    if (!isOrganizer && !isAdmin) {
      res.status(403).json({ error: "Only organizer or admin can generate brackets" });
      return;
    }

    if (
      !["registration_closed", "in_progress"].includes(tournament.status)
    ) {
      res.status(422).json({
        error: "Brackets can only be generated once registration is closed",
        currentStatus: tournament.status,
      });
      return;
    }

    // Check existing brackets
    const existingMatches = await prisma.match.count({
      where: { tournamentId: tournament.id },
    });
    if (existingMatches > 0) {
      res.status(409).json({ error: "Brackets already generated for this tournament" });
      return;
    }

    const teams = tournament.registrations.map((r) => r.team);
    if (teams.length < 2) {
      res.status(422).json({ error: "Need at least 2 registered teams to generate brackets" });
      return;
    }

    if (tournament.bracketType !== "single_elimination") {
      res.status(422).json({
        error: "Only single_elimination bracket generation is supported in Phase 1",
      });
      return;
    }

    const matches = generateSingleElimination(tournament.id, teams);

    await prisma.match.createMany({ data: matches });

    const created = await prisma.match.findMany({
      where: { tournamentId: tournament.id },
      include: {
        team1: { select: { id: true, name: true, slug: true } },
        team2: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
    });

    res.status(201).json({
      matches: created,
      totalRounds: Math.ceil(Math.log2(teams.length)),
      totalMatches: created.length,
    });
  }
);

// GET /tournaments/:id/brackets — bracket tree
router.get("/:id/brackets", async (req, res) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const matches = await prisma.match.findMany({
    where: { tournamentId: tournament.id },
    include: {
      team1: { select: { id: true, name: true, slug: true, logoUrl: true } },
      team2: { select: { id: true, name: true, slug: true, logoUrl: true } },
      winner: { select: { id: true, name: true, slug: true } },
      result: {
        select: { status: true, scoreTeam1: true, scoreTeam2: true },
      },
    },
    orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
  });

  if (matches.length === 0) {
    res.json({ rounds: [], totalRounds: 0 });
    return;
  }

  // Group by round
  const roundMap = new Map<number, typeof matches>();
  for (const m of matches) {
    if (!roundMap.has(m.round)) roundMap.set(m.round, []);
    roundMap.get(m.round)!.push(m);
  }

  const rounds = Array.from(roundMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, roundMatches]) => ({ round, matches: roundMatches }));

  res.json({ rounds, totalRounds: rounds.length });
});

// GET /tournaments/:id/registrations — list registered teams
router.get("/:id/registrations", async (req, res) => {
  const tournament = await prisma.tournament.findUnique({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!tournament) {
    res.status(404).json({ error: "Tournament not found" });
    return;
  }

  const registrations = await prisma.tournamentRegistration.findMany({
    where: { tournamentId: tournament.id, status: "confirmed" },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          members: { select: { user: { select: { username: true, displayName: true } } } },
        },
      },
    },
    orderBy: { registeredAt: "asc" },
  });

  res.json(registrations);
});

/**
 * Generate single-elimination bracket.
 * Teams are seeded in registration order. BYE slots left as team1_id/team2_id = null.
 * Round 1 pairs: (0,1), (2,3), (4,5), ... up to next power-of-2 size.
 */
function generateSingleElimination(
  tournamentId: string,
  teams: { id: string }[]
): Array<{
  tournamentId: string;
  round: number;
  matchNumber: number;
  team1Id: string | null;
  team2Id: string | null;
  status: "scheduled";
}> {
  const n = teams.length;
  // Round up to nearest power of 2
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  const totalRounds = Math.ceil(Math.log2(bracketSize));

  // Pad with BYEs
  const seeded: (string | null)[] = [...teams.map((t) => t.id)];
  while (seeded.length < bracketSize) seeded.push(null);

  const matches: ReturnType<typeof generateSingleElimination> = [];
  let matchNumber = 1;

  // Round 1 — pair up teams
  for (let i = 0; i < bracketSize; i += 2) {
    matches.push({
      tournamentId,
      round: 1,
      matchNumber,
      team1Id: seeded[i],
      team2Id: seeded[i + 1],
      status: "scheduled",
    });
    matchNumber++;
  }

  // Subsequent rounds — TBD matches (no teams assigned yet)
  let matchesInPreviousRound = bracketSize / 2;
  for (let round = 2; round <= totalRounds; round++) {
    matchesInPreviousRound = matchesInPreviousRound / 2;
    for (let j = 0; j < matchesInPreviousRound; j++) {
      matches.push({
        tournamentId,
        round,
        matchNumber,
        team1Id: null,
        team2Id: null,
        status: "scheduled",
      });
      matchNumber++;
    }
  }

  return matches;
}

export default router;
