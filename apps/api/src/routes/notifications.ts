import { getAuth } from "@clerk/express";
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { banCheck } from "../middleware/ban-check";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

// GET /notifications/me — paginated, unread first
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const cursor = req.query["cursor"] as string | undefined;
    const limit = Math.min(Number(req.query["limit"] ?? 20), 50);

    const notifications = await prisma.notification.findMany({
      where: { userId: userId! },
      orderBy: [{ read: "asc" }, { createdAt: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        metadata: true,
        read: true,
        createdAt: true,
      },
    });

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    const unreadCount = await prisma.notification.count({
      where: { userId: userId!, read: false },
    });

    res.json({ items, nextCursor, unreadCount });
  }),
);

// POST /notifications/me/read-all — mark all as read
router.post(
  "/me/read-all",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);

    const result = await prisma.notification.updateMany({
      where: { userId: userId!, read: false },
      data: { read: true },
    });

    res.json({ updated: result.count });
  }),
);

// PATCH /notifications/:id/read — mark single notification as read
router.patch(
  "/:id/read",
  requireAuth,
  banCheck,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const id = req.params["id"] as string;

    const notification = await prisma.notification.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    if (notification.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
      select: { id: true, read: true },
    });

    res.json(updated);
  }),
);

export default router;
