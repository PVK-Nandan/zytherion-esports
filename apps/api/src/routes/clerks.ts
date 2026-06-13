import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import crypto from "crypto";

const router = Router();

function verifyClerkSignature(payload: string, headers: Record<string, string>): boolean {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) return false;

  const svixId = headers["svix-id"];
  const svixTimestamp = headers["svix-timestamp"];
  const svixSignature = headers["svix-signature"];

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const secretBytes = Buffer.from(webhookSecret.replace("whsec_", ""), "base64");
  const hmac = crypto.createHmac("sha256", secretBytes);
  hmac.update(signedContent);
  const signature = `v1,${hmac.digest("base64")}`;

  return svixSignature.split(" ").some((sig) => sig === signature);
}

// POST /webhooks/clerk — handle user lifecycle events
router.post("/clerk", async (req: Request, res: Response) => {
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? "";

  const headers: Record<string, string> = {};
  ["svix-id", "svix-timestamp", "svix-signature"].forEach((key) => {
    const val = req.headers[key];
    if (typeof val === "string") headers[key] = val;
  });

  if (!verifyClerkSignature(rawBody, headers)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const event = req.body as {
    type: string;
    data: {
      id: string;
      email_addresses?: Array<{ email_address: string; id: string }>;
      username?: string;
      first_name?: string;
      last_name?: string;
      image_url?: string;
    };
  };

  const clerkUserId = event.data.id;

  if (event.type === "user.created") {
    const primaryEmail = event.data.email_addresses?.[0]?.email_address ?? "";
    const username = event.data.username ?? primaryEmail.split("@")[0];
    const displayName =
      [event.data.first_name, event.data.last_name].filter(Boolean).join(" ") || null;

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { clerkUserId },
        create: {
          clerkUserId,
          email: primaryEmail,
          username,
          displayName,
          avatarUrl: event.data.image_url ?? null,
        },
        update: {},
      });

      await tx.wallet.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });

      await tx.profile.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });
    });
  } else if (event.type === "user.updated") {
    const primaryEmail = event.data.email_addresses?.[0]?.email_address;
    const displayName =
      [event.data.first_name, event.data.last_name].filter(Boolean).join(" ") || null;

    await prisma.user.updateMany({
      where: { clerkUserId },
      data: {
        ...(primaryEmail ? { email: primaryEmail } : {}),
        ...(event.data.username ? { username: event.data.username } : {}),
        displayName,
        avatarUrl: event.data.image_url ?? undefined,
      },
    });
  } else if (event.type === "user.deleted") {
    await prisma.user.updateMany({
      where: { clerkUserId },
      data: { deletedAt: new Date() },
    });
  }

  res.json({ ok: true });
});

export default router;
