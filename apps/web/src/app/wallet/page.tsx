"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/api";

interface WalletTransaction {
  id: string;
  type: "credit" | "debit";
  amountPaise: number;
  amountInr: string;
  status: "pending" | "completed" | "failed";
  description: string;
  createdAt: string;
}

interface TransactionsResponse {
  data: WalletTransaction[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function BalanceCard({ balance, loading }: { balance: string; loading: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden glass-card p-8 neon-border-violet"
    >
      <div className="absolute inset-0 bg-neon-gradient-subtle pointer-events-none" />
      <div className="relative z-10">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Available Balance</p>
        {loading ? (
          <div className="h-12 w-40 rounded-lg bg-white/5 animate-pulse" />
        ) : (
          <p className="text-5xl font-black text-gradient-cyber">₹{balance}</p>
        )}
        <p className="text-xs text-slate-500 mt-3">Zytherion Wallet • INR</p>
      </div>
      <div className="absolute top-4 right-4 text-4xl opacity-10">💎</div>
    </motion.div>
  );
}

function TransactionRow({ tx, index }: { tx: WalletTransaction; index: number }) {
  const isCredit = tx.type === "credit";
  const statusColors = {
    completed: "text-emerald-400",
    pending: "text-yellow-400",
    failed: "text-red-400",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-4 py-3 border-b border-white/5 last:border-0"
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
        isCredit ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
      }`}>
        {isCredit ? "↓" : "↑"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{tx.description || (isCredit ? "Deposit" : "Withdrawal")}</p>
        <p className="text-xs text-slate-500 mt-0.5">{new Date(tx.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${isCredit ? "text-emerald-400" : "text-red-400"}`}>
          {isCredit ? "+" : "-"}₹{tx.amountInr}
        </p>
        <p className={`text-xs ${statusColors[tx.status]}`}>{tx.status}</p>
      </div>
    </motion.div>
  );
}

export default function WalletPage() {
  const { getToken, isSignedIn } = useAuth();
  const [balance, setBalance] = useState("0.00");
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAccount, setWithdrawAccount] = useState("");
  const [withdrawIfsc, setWithdrawIfsc] = useState("");
  const [withdrawName, setWithdrawName] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState("");

  const fetchData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const [balanceData, txData] = await Promise.all([
        apiRequest<{ balanceInr: string }>("/wallets/me/balance", { token }),
        apiRequest<TransactionsResponse>("/wallets/me/transactions?limit=20", { token }),
      ]);
      setBalance(balanceData.balanceInr);
      setTransactions(txData.data);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isSignedIn) void fetchData();
  }, [isSignedIn, fetchData]);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const amountPaise = Math.round(parseFloat(withdrawAmount) * 100);
    if (!amountPaise || amountPaise < 100) { setWithdrawMsg("Minimum withdrawal is ₹1."); return; }
    setWithdrawing(true);
    setWithdrawMsg("");
    try {
      const token = await getToken();
      await apiRequest("/wallets/me/withdrawals", {
        method: "POST",
        token: token!,
        body: JSON.stringify({ amountPaise, accountNumber: withdrawAccount, ifscCode: withdrawIfsc, accountHolderName: withdrawName }),
      });
      setWithdrawMsg("Withdrawal request submitted.");
      setWithdrawAmount("");
      void fetchData();
    } catch (err: unknown) {
      setWithdrawMsg(err instanceof Error ? err.message : "Withdrawal failed.");
    } finally {
      setWithdrawing(false);
    }
  }

  if (!isSignedIn) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="glass-card p-8 text-center">
          <p className="text-slate-400">Please sign in to view your wallet.</p>
        </div>
      </div>
    );
  }

  const deposits = transactions.filter((t) => t.type === "credit");
  const withdrawals = transactions.filter((t) => t.type === "debit");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8">
        <h1 className="text-3xl font-black text-gradient-cyber">Wallet</h1>
        <p className="text-slate-400 mt-1">Manage your balance, deposits and withdrawals.</p>
      </motion.div>

      <div className="grid grid-cols-1 gap-6">
        <BalanceCard balance={balance} loading={loading} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Deposit History */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-5">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">↓</span>
              Deposits
            </h2>
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />)}</div>
            ) : deposits.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No deposits yet.</p>
            ) : (
              <div>{deposits.map((tx, i) => <TransactionRow key={tx.id} tx={tx} index={i} />)}</div>
            )}
          </motion.div>

          {/* Withdrawal Form */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs">↑</span>
              Withdraw
            </h2>
            <form onSubmit={(e) => { void handleWithdraw(e); }} className="space-y-3">
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Amount (₹)"
                min="1"
                step="0.01"
                required
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors"
              />
              <input
                type="text"
                value={withdrawName}
                onChange={(e) => setWithdrawName(e.target.value)}
                placeholder="Account Holder Name"
                required
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors"
              />
              <input
                type="text"
                value={withdrawAccount}
                onChange={(e) => setWithdrawAccount(e.target.value)}
                placeholder="Account Number"
                required
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors"
              />
              <input
                type="text"
                value={withdrawIfsc}
                onChange={(e) => setWithdrawIfsc(e.target.value)}
                placeholder="IFSC Code"
                required
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors"
              />
              {withdrawMsg && (
                <p className={`text-xs px-2 py-1.5 rounded ${withdrawMsg.includes("submitted") ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>
                  {withdrawMsg}
                </p>
              )}
              <button
                type="submit"
                disabled={withdrawing}
                className="w-full rounded-lg py-2.5 text-sm font-bold bg-neon-gradient text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {withdrawing ? "Processing…" : "Request Withdrawal"}
              </button>
            </form>
          </motion.div>
        </div>

        {/* Full Transaction History */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-5">
          <h2 className="text-base font-bold text-white mb-4">Full Transaction History</h2>
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />)}</div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No transactions yet.</p>
          ) : (
            <div>{transactions.map((tx, i) => <TransactionRow key={tx.id} tx={tx} index={i} />)}</div>
          )}
          {withdrawals.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-400 mb-3">Withdrawal History</h3>
              {withdrawals.map((tx, i) => <TransactionRow key={tx.id} tx={tx} index={i} />)}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
