import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// POST /invitations/:id/accept
router.post("/:id/accept", requireAuth, async (req: AuthRequest, res) => {
  const invitation = await prisma.teamInvitation.findUnique({
    where: { id: req.params.id },
    include: { team: { include: { members: true } } },
  });

  if (!invitation) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  if (invitation.inviteeUserId !== req.userId) {
    res.status(403).json({ error: "Not your invitation" });
    return;
  }
  if (invitation.status !== "pending") {
    res.status(409).json({ error: `Invitation is already ${invitation.status}` });
    return;
  }
  if (invitation.expiresAt < new Date()) {
    await prisma.teamInvitation.update({
      where: { id: req.params.id },
      data: { status: "expired" },
    });
    res.status(410).json({ error: "Invitation has expired" });
    return;
  }

  const team = invitation.team;
  if (team.members.length >= team.maxMembers) {
    res.status(422).json({ error: "Team is at maximum capacity" });
    return;
  }
  if (team.deletedAt) {
    res.status(410).json({ error: "Team no longer exists" });
    return;
  }

  await prisma.$transaction([
    prisma.teamInvitation.update({
      where: { id: req.params.id },
      data: { status: "accepted" },
    }),
    prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: req.userId!,
        role: "member",
      },
    }),
  ]);

  res.json({ message: "Invitation accepted" });
});

// POST /invitations/:id/decline
router.post("/:id/decline", requireAuth, async (req: AuthRequest, res) => {
  const invitation = await prisma.teamInvitation.findUnique({
    where: { id: req.params.id },
  });

  if (!invitation) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  if (invitation.inviteeUserId !== req.userId) {
    res.status(403).json({ error: "Not your invitation" });
    return;
  }
  if (invitation.status !== "pending") {
    res.status(409).json({ error: `Invitation is already ${invitation.status}` });
    return;
  }

  await prisma.teamInvitation.update({
    where: { id: req.params.id },
    data: { status: "declined" },
  });

  res.json({ message: "Invitation declined" });
});

export default router;
