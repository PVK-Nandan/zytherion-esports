import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { createOrder, createPayout } from "../lib/razorpay";

const router = Router();

function paisToInr(paise: bigint): number {
  return Number(paise) / 100;
}

async function getWalletBalance(walletId: string): Promise<bigint> {
  const result = await prisma.walletTransaction.aggregate({
    where: { walletId, status: "completed" },
    _sum: { amountPaise: true },
  });
  return result._sum.amountPaise ?? BigInt(0);
}

// GET /wallets/me/balance
router.get("/me/balance", requireAuth, async (req: AuthRequest, res) => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: req.userId! },
  });

  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const balancePaise = await getWalletBalance(wallet.id);
  res.json({ amountPaise: balancePaise.toString(), amountInr: paisToInr(balancePaise) });
});

// POST /wallets/me/deposits — create Razorpay order
router.post(
  "/me/deposits",
  requireAuth,
  async (req: AuthRequest, res) => {
    const parsed = z
      .object({ amountInr: z.number().int().min(1).max(100000) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const amountPaise = parsed.data.amountInr * 100;
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId! } });
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const receipt = `dep_${Date.now()}`;
    const order = await createOrder(amountPaise, receipt);

    // Pending credit — completed by webhook
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "deposit",
        amountPaise: BigInt(amountPaise),
        balanceAfterPaise: BigInt(0), // will be updated by webhook
        status: "pending",
        referenceType: "razorpay_order",
        referenceId: order.id,
        idempotencyKey: `razorpay:${order.id}:deposit`,
        description: "Wallet deposit via Razorpay",
      },
    });

    res.status(201).json({
      orderId: order.id,
      amountPaise,
      amountInr: parsed.data.amountInr,
    });
  }
);

// POST /wallets/me/withdrawals — initiate Razorpay payout
router.post(
  "/me/withdrawals",
  requireAuth,
  async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId!, deletedAt: null },
      select: { kycStatus: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.kycStatus !== "verified") {
      res.status(403).json({ error: "KYC verification required before withdrawal" });
      return;
    }

    const parsed = z
      .object({
        amountInr: z.number().int().min(100),
        fundAccountId: z.string().min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const amountPaise = parsed.data.amountInr * 100;
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId! } });
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    // Balance = completed credits - all debits (pending debits counted to prevent overdraft)
    const balance = await getWalletBalance(wallet.id);
    const pendingDebits = await prisma.walletTransaction.aggregate({
      where: {
        walletId: wallet.id,
        status: "pending",
        amountPaise: { lt: 0 },
      },
      _sum: { amountPaise: true },
    });
    const available = balance + (pendingDebits._sum.amountPaise ?? BigInt(0));

    if (available < BigInt(amountPaise)) {
      res.status(422).json({
        error: "Insufficient balance",
        availablePaise: available.toString(),
        availableInr: paisToInr(available),
      });
      return;
    }

    const referenceId = `wdl_${Date.now()}_${req.userId!.slice(0, 8)}`;
    const payout = await createPayout(
      amountPaise,
      parsed.data.fundAccountId,
      referenceId,
      "Zytaa wallet withdrawal"
    );

    const balanceAfter = balance - BigInt(amountPaise);
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "withdrawal",
        amountPaise: BigInt(-amountPaise),
        balanceAfterPaise: balanceAfter,
        status: "pending",
        referenceType: "razorpay_payout",
        referenceId: payout.id,
        idempotencyKey: `razorpay:${payout.id}:withdrawal`,
        description: "Wallet withdrawal via Razorpay",
      },
    });

    res.status(201).json({ payoutId: payout.id, status: payout.status });
  }
);

// GET /wallets/me/transactions — paginated history
router.get("/me/transactions", requireAuth, async (req: AuthRequest, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;

  const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId! } });
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
  ]);

  res.json({
    data: transactions.map((t) => ({
      ...t,
      amountPaise: t.amountPaise.toString(),
      amountInr: paisToInr(t.amountPaise),
      balanceAfterPaise: t.balanceAfterPaise.toString(),
      balanceAfterInr: paisToInr(t.balanceAfterPaise),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export { getWalletBalance };
export default router;
