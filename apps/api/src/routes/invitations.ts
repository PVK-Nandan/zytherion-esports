import { getAuth } from "@clerk/express";
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { banCheck } from "../middleware/ban-check";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

const invitationSelect = {
  id: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  team: { select: { id: true, name: true, slug: true, logoUrl: true } },
  inviter: { select: { username: true } },
};

// POST /invitations/:id/accept
router.post(
  "/:id/accept",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const invitationId = req.params["id"] as string;

    const invitation = await prisma.teamInvitation.findUnique({
      where: { id: invitationId },
      include: { team: { include: { _count: { select: { members: true } } } } },
    });

    if (!invitation) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    if (invitation.invitedId !== userId) {
      res.status(403).json({ error: "This invitation is not for you" });
      return;
    }
    if (invitation.status !== "pending") {
      res.status(409).json({ error: `Invitation is already ${invitation.status}` });
      return;
    }
    if (invitation.expiresAt < new Date()) {
      await prisma.teamInvitation.update({ where: { id: invitationId }, data: { status: "expired" } });
      res.status(410).json({ error: "Invitation has expired" });
      return;
    }

    const team = invitation.team;
    if (team._count.members >= team.maxMembers) {
      res.status(422).json({ error: `Team is full (max ${team.maxMembers} members)` });
      return;
    }

    // Atomic: mark accepted + add member, guard against race with unique constraint
    try {
      await prisma.$transaction([
        prisma.teamInvitation.update({ where: { id: invitationId }, data: { status: "accepted" } }),
        prisma.teamMember.create({ data: { teamId: team.id, userId: userId! } }),
      ]);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
        res.status(409).json({ error: "You are already a member of this team" });
        return;
      }
      throw err;
    }

    res.json({ message: "Invitation accepted", teamSlug: team.slug });
  })
);

// POST /invitations/:id/decline
router.post(
  "/:id/decline",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const invitationId = req.params["id"] as string;

    const invitation = await prisma.teamInvitation.findUnique({ where: { id: invitationId } });

    if (!invitation) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    if (invitation.invitedId !== userId) {
      res.status(403).json({ error: "This invitation is not for you" });
      return;
    }
    if (invitation.status !== "pending") {
      res.status(409).json({ error: `Invitation is already ${invitation.status}` });
      return;
    }

    await prisma.teamInvitation.update({ where: { id: invitationId }, data: { status: "declined" } });
    res.json({ message: "Invitation declined" });
  })
);

export { invitationSelect };
export default router;
