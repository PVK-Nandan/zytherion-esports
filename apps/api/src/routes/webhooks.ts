import { Router, Request, Response } from "express";
import { Webhook } from "svix";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

interface ClerkEmailAddress {
  email_address: string;
  id: string;
  verification: { status: string } | null;
}

interface ClerkUserPayload {
  id: string;
  email_addresses: ClerkEmailAddress[];
  username: string | null;
  image_url: string | null;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserPayload;
}

function getPrimaryEmail(payload: ClerkUserPayload): string {
  const primary = payload.email_addresses.find((e) => e.verification?.status === "verified");
  return primary?.email_address ?? payload.email_addresses[0]?.email_address ?? "";
}

function deriveUsername(payload: ClerkUserPayload): string {
  if (payload.username) return payload.username;
  const email = getPrimaryEmail(payload);
  return email.split("@")[0] ?? payload.id;
}

router.post(
  "/clerk",
  asyncHandler(async (req: Request, res: Response) => {
    const secret = process.env["CLERK_WEBHOOK_SECRET"];
    if (!secret) {
      res.status(500).json({ error: "Webhook secret not configured" });
      return;
    }

    const svixId = req.headers["svix-id"] as string | undefined;
    const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
    const svixSignature = req.headers["svix-signature"] as string | undefined;

    if (!svixId || !svixTimestamp || !svixSignature) {
      res.status(400).json({ error: "Missing svix headers" });
      return;
    }

    // req.body is a Buffer from express.raw() applied in index.ts
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json({ error: "Invalid body format" });
      return;
    }

    let event: ClerkWebhookEvent;
    try {
      const wh = new Webhook(secret);
      // verify() returns unknown; we cast to our typed interface after verification
      const verified = wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
      event = verified as ClerkWebhookEvent;
    } catch {
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    const { type, data } = event;

    if (type === "user.created") {
      const email = getPrimaryEmail(data);
      const username = deriveUsername(data);

      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { id: data.id, email, username } });
        await tx.profile.create({ data: { userId: user.id, avatarUrl: data.image_url } });
        await tx.wallet.create({ data: { userId: user.id, balance: 0 } });
      });
    } else if (type === "user.updated") {
      const email = getPrimaryEmail(data);
      const username = deriveUsername(data);

      await prisma.user.update({ where: { id: data.id }, data: { email, username } });
      await prisma.profile.updateMany({
        where: { userId: data.id },
        data: { avatarUrl: data.image_url },
      });
    } else if (type === "user.deleted") {
      await prisma.user.delete({ where: { id: data.id } });
    }

    res.json({ received: true });
  })
);

export default router;
