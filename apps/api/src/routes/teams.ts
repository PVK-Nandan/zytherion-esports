import { getAuth } from "@clerk/express";
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { banCheck } from "../middleware/ban-check";
import { asyncHandler } from "../lib/async-handler";
import { notifications } from "../services/notifications";

const router = Router();

const MAX_MEMBERS = 6;
const INVITATION_TTL_HOURS = 48;

const teamPublicSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  maxMembers: true,
  createdAt: true,
  owner: { select: { id: true, username: true } },
  members: {
    select: {
      userId: true,
      joinedAt: true,
      user: { select: { username: true, profile: { select: { avatarUrl: true, bgmiIgn: true, bgmiTier: true } } } },
    },
  },
};

// POST /teams — create a team (auth required)
router.post(
  "/",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const body = req.body as { name?: string; slug?: string; description?: string; logoUrl?: string };

    if (!body.name || !body.slug) {
      res.status(400).json({ error: "name and slug are required" });
      return;
    }

    const slug = body.slug.toLowerCase().trim();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: "slug may only contain lowercase letters, numbers, and hyphens" });
      return;
    }

    // A user can only own one team at a time
    const existingOwned = await prisma.team.findFirst({ where: { ownerId: userId! } });
    if (existingOwned) {
      res.status(409).json({ error: "You already own a team" });
      return;
    }

    try {
      const team = await prisma.$transaction(async (tx) => {
        const t = await tx.team.create({
          data: {
            name: body.name!.trim(),
            slug,
            description: body.description ?? null,
            logoUrl: body.logoUrl ?? null,
            ownerId: userId!,
            maxMembers: MAX_MEMBERS,
          },
        });
        // Auto-add owner as first member
        await tx.teamMember.create({ data: { teamId: t.id, userId: userId! } });
        return t;
      });

      const full = await prisma.team.findUnique({ where: { id: team.id }, select: teamPublicSelect });
      res.status(201).json(full);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
        res.status(409).json({ error: "Team name or slug already taken" });
        return;
      }
      throw err;
    }
  })
);

// GET /teams/:slug — public team profile
router.get(
  "/:slug",
  asyncHandler(async (req: Request, res: Response) => {
    const team = await prisma.team.findUnique({
      where: { slug: req.params["slug"] as string },
      select: teamPublicSelect,
    });

    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    res.json(team);
  })
);

// PATCH /teams/:id — update team details (owner only)
router.patch(
  "/:id",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const teamId = req.params["id"] as string;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (team.ownerId !== userId) {
      res.status(403).json({ error: "Only the team owner can update team details" });
      return;
    }

    const body = req.body as { name?: string; description?: string; logoUrl?: string };

    try {
      const updated = await prisma.team.update({
        where: { id: teamId },
        data: {
          ...(body.name !== undefined && { name: body.name.trim() }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
        },
        select: teamPublicSelect,
      });
      res.json(updated);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
        res.status(409).json({ error: "Team name already taken" });
        return;
      }
      throw err;
    }
  })
);

// DELETE /teams/:id — delete team (owner only)
router.delete(
  "/:id",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const teamId = req.params["id"] as string;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (team.ownerId !== userId) {
      res.status(403).json({ error: "Only the team owner can delete the team" });
      return;
    }

    await prisma.team.delete({ where: { id: teamId } });
    res.status(204).send();
  })
);

// GET /teams/:id/members — list team members (public)
router.get(
  "/:id/members",
  asyncHandler(async (req: Request, res: Response) => {
    const team = await prisma.team.findUnique({ where: { id: req.params["id"] as string } });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const members = await prisma.teamMember.findMany({
      where: { teamId: team.id },
      select: {
        userId: true,
        joinedAt: true,
        user: { select: { username: true, profile: { select: { avatarUrl: true, bgmiIgn: true, bgmiTier: true } } } },
      },
      orderBy: { joinedAt: "asc" },
    });

    res.json(members);
  })
);

// DELETE /teams/:id/members/:userId — kick a member (owner only)
router.delete(
  "/:id/members/:userId",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId: requesterId } = getAuth(req);
    const teamId = req.params["id"] as string;
    const targetUserId = req.params["userId"] as string;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (team.ownerId !== requesterId) {
      res.status(403).json({ error: "Only the team owner can remove members" });
      return;
    }
    if (targetUserId === team.ownerId) {
      res.status(400).json({ error: "Cannot remove the team owner" });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });
    if (!member) {
      res.status(404).json({ error: "Member not found in this team" });
      return;
    }

    await prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId: targetUserId } } });
    res.status(204).send();
  })
);

// POST /teams/:id/invitations — invite a player by username (owner only)
router.post(
  "/:id/invitations",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const teamId = req.params["id"] as string;
    const body = req.body as { username?: string };

    if (!body.username) {
      res.status(400).json({ error: "username is required" });
      return;
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { _count: { select: { members: true } } },
    });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (team.ownerId !== userId) {
      res.status(403).json({ error: "Only the team owner can send invitations" });
      return;
    }

    if (team._count.members >= team.maxMembers) {
      res.status(422).json({ error: `Team is full (max ${team.maxMembers} members)` });
      return;
    }

    const invitee = await prisma.user.findUnique({ where: { username: body.username } });
    if (!invitee) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (invitee.id === userId) {
      res.status(400).json({ error: "Cannot invite yourself" });
      return;
    }

    // Check if already a member
    const alreadyMember = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: invitee.id } },
    });
    if (alreadyMember) {
      res.status(409).json({ error: "User is already a member of this team" });
      return;
    }

    // Check for an existing pending invitation
    const existingInvitation = await prisma.teamInvitation.findFirst({
      where: { teamId, invitedId: invitee.id, status: "pending" },
    });
    if (existingInvitation) {
      res.status(409).json({ error: "A pending invitation already exists for this user" });
      return;
    }

    const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
    const invitation = await prisma.teamInvitation.create({
      data: { teamId, invitedId: invitee.id, invitedBy: userId!, status: "pending", expiresAt },
      select: {
        id: true,
        teamId: true,
        invitedId: true,
        invitedBy: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        team: { select: { name: true, slug: true } },
        invited: { select: { username: true } },
      },
    });

    notifications.teamInvitation(invitee.id, team.name, teamId).catch(
      (err) => console.error("[notifications] teamInvitation failed:", err),
    );

    res.status(201).json(invitation);
  })
);

export default router;
