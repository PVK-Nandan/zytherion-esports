import { getAuth } from "@clerk/express";
import { KycStatus, TransactionType } from "@prisma/client";
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../middleware/auth";
import { banCheck } from "../middleware/ban-check";
import {
  createRazorpayOrder,
  createRazorpayContact,
  createRazorpayFundAccount,
  createRazorpayPayout,
} from "../lib/razorpay";

const router = Router();

router.use(requireAuth, banCheck);

function computeBalance(
  transactions: { type: TransactionType; amountPaise: number }[]
): number {
  return transactions.reduce((acc, tx) => {
    return tx.type === TransactionType.credit ? acc + tx.amountPaise : acc - tx.amountPaise;
  }, 0);
}

function paiseToInr(paise: number): string {
  return (paise / 100).toFixed(2);
}

// GET /wallets/me/balance
router.get(
  "/me/balance",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);

    const wallet = await prisma.wallet.findUnique({
      where: { userId: userId! },
      include: {
        transactions: {
          where: { status: "completed" },
          select: { type: true, amountPaise: true },
        },
      },
    });

    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const balancePaise = computeBalance(wallet.transactions);
    res.json({ balanceInr: paiseToInr(balancePaise) });
  })
);

// POST /wallets/me/deposits — create Razorpay order and a pending credit transaction
router.post(
  "/me/deposits",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const body = req.body as { amountPaise?: unknown };
    const amountPaise = Number(body.amountPaise);

    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      res.status(400).json({ error: "amountPaise must be an integer of at least 100 (INR 1.00)" });
      return;
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: userId! } });
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const order = await createRazorpayOrder(amountPaise, `dep_${wallet.id}`);

    // Create a pending credit transaction to track this order
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: TransactionType.credit,
        amountPaise: order.amount,
        status: "pending",
        idempotencyKey: `razorpay:${order.id}:deposit`,
        razorpayOrderId: order.id,
        description: "Wallet deposit via Razorpay",
      },
    });

    res.status(201).json({
      orderId: order.id,
      amountPaise: order.amount,
      amountInr: paiseToInr(order.amount),
      currency: order.currency,
    });
  })
);

// POST /wallets/me/withdrawals
router.post(
  "/me/withdrawals",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);

    const user = await prisma.user.findUnique({
      where: { id: userId! },
      include: {
        wallet: {
          include: {
            transactions: {
              where: { status: "completed" },
              select: { type: true, amountPaise: true },
            },
          },
        },
      },
    });

    if (!user || !user.wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    if (user.kycStatus !== KycStatus.approved) {
      res.status(403).json({ error: "KYC verification required before withdrawals" });
      return;
    }

    const body = req.body as {
      amountPaise?: unknown;
      accountNumber?: unknown;
      ifscCode?: unknown;
      accountHolderName?: unknown;
    };
    const amountPaise = Number(body.amountPaise);

    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      res.status(400).json({ error: "amountPaise must be an integer of at least 100 (INR 1.00)" });
      return;
    }

    const accountNumber = String(body.accountNumber ?? "").trim();
    const ifscCode = String(body.ifscCode ?? "").trim();
    const accountHolderName = String(body.accountHolderName ?? "").trim();

    if (!accountNumber || !ifscCode || !accountHolderName) {
      res.status(400).json({ error: "accountNumber, ifscCode, and accountHolderName are required" });
      return;
    }

    // Available balance = completed credits - completed debits - pending debits
    const completedBalancePaise = computeBalance(user.wallet.transactions);
    const pendingDebits = await prisma.walletTransaction.aggregate({
      where: { walletId: user.wallet.id, type: TransactionType.debit, status: "pending" },
      _sum: { amountPaise: true },
    });
    const availablePaise = completedBalancePaise - (pendingDebits._sum.amountPaise ?? 0);

    if (availablePaise < amountPaise) {
      res.status(422).json({ error: "Insufficient balance" });
      return;
    }

    const contact = await createRazorpayContact(user.username, user.email);
    const fundAccount = await createRazorpayFundAccount(
      contact.id,
      accountNumber,
      ifscCode,
      accountHolderName
    );
    const referenceId = `wdraw_${user.wallet.id}_${Date.now()}`;
    const payout = await createRazorpayPayout(fundAccount.id, amountPaise, referenceId);

    const tx = await prisma.walletTransaction.create({
      data: {
        walletId: user.wallet.id,
        type: TransactionType.debit,
        amountPaise,
        status: "pending",
        idempotencyKey: `razorpay:${payout.id}:withdrawal`,
        razorpayPayoutId: payout.id,
        description: `Withdrawal to ${accountHolderName}`,
      },
    });

    res.status(201).json({
      transactionId: tx.id,
      payoutId: payout.id,
      amountPaise,
      amountInr: paiseToInr(amountPaise),
      status: "pending",
    });
  })
);

// GET /wallets/me/transactions
router.get(
  "/me/transactions",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
    const skip = (page - 1) * limit;

    const wallet = await prisma.wallet.findUnique({ where: { userId: userId! } });
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
        select: {
          id: true,
          type: true,
          amountPaise: true,
          status: true,
          description: true,
          razorpayOrderId: true,
          razorpayPaymentId: true,
          razorpayPayoutId: true,
          createdAt: true,
        },
      }),
      prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    res.json({
      data: transactions.map((tx) => ({ ...tx, amountInr: paiseToInr(tx.amountPaise) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  })
);

export default router;
