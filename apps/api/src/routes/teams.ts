import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const CreateTeamSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
});

const UpdateTeamSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
});

const InviteSchema = z.object({
  username: z.string().min(1),
});

// POST /teams — create team (auth required)
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreateTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, slug, description, logoUrl } = parsed.data;

  try {
    const team = await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name,
          slug,
          description,
          logoUrl,
          ownerUserId: req.userId!,
        },
      });
      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId: req.userId!,
          role: "owner",
        },
      });
      return team;
    });

    res.status(201).json(team);
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error.code === "P2002") {
      res.status(409).json({ error: "Team name or slug already taken" });
      return;
    }
    throw err;
  }
});

// GET /teams/:slug — public team profile
router.get("/:slug", async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { slug: req.params.slug, deletedAt: null },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  res.json(team);
});

// PATCH /teams/:id — update team (owner only)
router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.ownerUserId !== req.userId) {
    res.status(403).json({ error: "Only team owner can update team" });
    return;
  }

  const parsed = UpdateTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const updated = await prisma.team.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  res.json(updated);
});

// DELETE /teams/:id — delete team (owner only)
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.ownerUserId !== req.userId) {
    res.status(403).json({ error: "Only team owner can delete team" });
    return;
  }

  await prisma.team.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  res.status(204).send();
});

// GET /teams/:id/members — public member list
router.get("/:id/members", async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.id, deletedAt: null },
  });

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId: req.params.id },
    include: {
      user: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  res.json(members);
});

// DELETE /teams/:id/members/:userId — kick member (owner only)
router.delete(
  "/:id/members/:userId",
  requireAuth,
  async (req: AuthRequest, res) => {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id, deletedAt: null },
    });

    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (team.ownerUserId !== req.userId) {
      res.status(403).json({ error: "Only team owner can remove members" });
      return;
    }
    if (req.params.userId === req.userId) {
      res.status(400).json({ error: "Owner cannot remove themselves" });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId: req.params.id, userId: req.params.userId },
      },
    });

    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    await prisma.teamMember.delete({
      where: {
        teamId_userId: { teamId: req.params.id, userId: req.params.userId },
      },
    });

    res.status(204).send();
  }
);

// POST /teams/:id/invitations — invite player by username
router.post(
  "/:id/invitations",
  requireAuth,
  async (req: AuthRequest, res) => {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id, deletedAt: null },
      include: { members: true },
    });

    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (team.ownerUserId !== req.userId) {
      res.status(403).json({ error: "Only team owner can invite members" });
      return;
    }
    if (team.members.length >= team.maxMembers) {
      res.status(422).json({ error: "Team is at maximum capacity" });
      return;
    }

    const parsed = InviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const invitee = await prisma.user.findUnique({
      where: { username: parsed.data.username, deletedAt: null },
    });

    if (!invitee) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    // Check already a member
    const existingMember = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId: invitee.id } },
    });
    if (existingMember) {
      res.status(409).json({ error: "Player is already a team member" });
      return;
    }

    // Check pending invite
    const existingInvite = await prisma.teamInvitation.findFirst({
      where: {
        teamId: team.id,
        inviteeUserId: invitee.id,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });
    if (existingInvite) {
      res.status(409).json({ error: "Pending invitation already exists" });
      return;
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const invitation = await prisma.teamInvitation.create({
      data: {
        teamId: team.id,
        inviteeUserId: invitee.id,
        inviterUserId: req.userId!,
        expiresAt,
      },
    });

    res.status(201).json(invitation);
  }
);

export default router;
