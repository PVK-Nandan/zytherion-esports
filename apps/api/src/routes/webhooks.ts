import crypto from "crypto";
import { Router, Request, Response } from "express";
import { Webhook } from "svix";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

// ── Clerk webhook types ──────────────────────────────────────────────────────

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

// POST /webhooks/clerk
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

    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json({ error: "Invalid body format" });
      return;
    }

    let event: ClerkWebhookEvent;
    try {
      const wh = new Webhook(secret);
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
        await tx.wallet.create({ data: { userId: user.id } });
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

// ── Razorpay webhook types ────────────────────────────────────────────────────

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
}

interface RazorpayPayoutEntity {
  id: string;
  amount: number;
  status: string;
}

interface RazorpayWebhookEvent {
  event: string;
  payload: {
    payment?: { entity: RazorpayPaymentEntity };
    payout?: { entity: RazorpayPayoutEntity };
  };
}

// POST /webhooks/razorpay
router.post(
  "/razorpay",
  asyncHandler(async (req: Request, res: Response) => {
    const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
    if (!secret) {
      res.status(500).json({ error: "Razorpay webhook secret not configured" });
      return;
    }

    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json({ error: "Invalid body format" });
      return;
    }

    // Verify HMAC signature before any DB write
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    if (!signature) {
      res.status(400).json({ error: "Missing X-Razorpay-Signature header" });
      return;
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    let event: RazorpayWebhookEvent;
    try {
      event = JSON.parse(rawBody.toString()) as RazorpayWebhookEvent;
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    if (event.event === "payment.captured") {
      const payment = event.payload.payment?.entity;
      if (!payment) {
        res.status(400).json({ error: "Missing payment entity" });
        return;
      }

      // Update the pending deposit transaction → completed (idempotent: skip if already set)
      await prisma.walletTransaction.updateMany({
        where: {
          razorpayOrderId: payment.order_id,
          status: "pending",
          razorpayPaymentId: null,
        },
        data: {
          status: "completed",
          razorpayPaymentId: payment.id,
        },
      });
    } else if (event.event === "payout.processed") {
      const payout = event.payload.payout?.entity;
      if (!payout) {
        res.status(400).json({ error: "Missing payout entity" });
        return;
      }

      await prisma.walletTransaction.updateMany({
        where: {
          razorpayPayoutId: payout.id,
          status: "pending",
        },
        data: { status: "completed" },
      });
    } else if (event.event === "payout.failed") {
      const payout = event.payload.payout?.entity;
      if (!payout) {
        res.status(400).json({ error: "Missing payout entity" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        // Mark the withdrawal as failed
        const updated = await tx.walletTransaction.findFirst({
          where: { razorpayPayoutId: payout.id },
        });
        if (!updated) return;

        await tx.walletTransaction.update({
          where: { id: updated.id },
          data: { status: "failed" },
        });

        // Append a reversal credit so the balance is restored
        await tx.walletTransaction.upsert({
          where: { idempotencyKey: `razorpay:${payout.id}:reversal` },
          update: {},
          create: {
            walletId: updated.walletId,
            type: "credit",
            amountPaise: updated.amountPaise,
            status: "completed",
            idempotencyKey: `razorpay:${payout.id}:reversal`,
            razorpayPayoutId: payout.id,
            description: "Withdrawal reversal (payout failed)",
          },
        });
      });
    }

    res.json({ received: true });
  })
);

export default router;
