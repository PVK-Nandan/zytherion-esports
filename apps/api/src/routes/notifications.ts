import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /notifications/me — paginated, with unread count
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const cursor = req.query.cursor as string | undefined;

  const where = { userId: req.userId! };

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        ...where,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    }),
    prisma.notification.count({ where: { ...where, isRead: false } }),
  ]);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  res.json({
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id : null,
    unreadCount,
  });
});

// POST /notifications/me/read-all — bulk mark read
router.post("/me/read-all", requireAuth, async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.userId!, isRead: false },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

// PATCH /notifications/:id/read — mark single as read
router.patch("/:id/read", requireAuth, async (req: AuthRequest, res) => {
  const notification = await prisma.notification.findUnique({
    where: { id: req.params.id },
  });

  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  if (notification.userId !== req.userId) {
    res.status(403).json({ error: "Not your notification" });
    return;
  }

  await prisma.notification.update({
    where: { id: req.params.id },
    data: { isRead: true },
  });

  res.json({ ok: true });
});

export default router;
