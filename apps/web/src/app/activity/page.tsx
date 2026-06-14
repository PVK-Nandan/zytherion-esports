"use client";

import { useAuth } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@/types/notification";

const activityIcons: Record<string, string> = {
  team_invitation_received: "🛡️",
  tournament_registration_confirmed: "🏆",
  match_result_submitted: "⚔️",
  match_result_approved: "✅",
  match_result_disputed: "⚠️",
  wallet_deposit_completed: "💰",
  wallet_withdrawal_completed: "💸",
  wallet_withdrawal_failed: "❌",
};

const activityColors: Record<string, string> = {
  team_invitation_received: "border-blue-500/30 bg-blue-500/5",
  tournament_registration_confirmed: "border-violet-500/30 bg-violet-500/5",
  match_result_submitted: "border-yellow-500/30 bg-yellow-500/5",
  match_result_approved: "border-emerald-500/30 bg-emerald-500/5",
  match_result_disputed: "border-red-500/30 bg-red-500/5",
  wallet_deposit_completed: "border-emerald-500/30 bg-emerald-500/5",
  wallet_withdrawal_completed: "border-cyan-500/30 bg-cyan-500/5",
  wallet_withdrawal_failed: "border-red-500/30 bg-red-500/5",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ActivityItem({ item, index }: { item: Notification; index: number }) {
  const icon = activityIcons[item.type] ?? "📌";
  const colorClass = activityColors[item.type] ?? "border-white/10 bg-white/3";

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`flex items-start gap-4 p-4 rounded-xl border ${colorClass} relative`}
    >
      {index < 5 && !item.read && (
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-violet-400 animate-pulse-slow" />
      )}
      <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-lg flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{item.title}</p>
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{item.body}</p>
      </div>
      <span className="text-xs text-slate-600 flex-shrink-0 mt-0.5">{timeAgo(item.createdAt)}</span>
    </motion.div>
  );
}

export default function ActivityPage() {
  const { isSignedIn } = useAuth();
  const { notifications, loading } = useNotifications();

  if (!isSignedIn) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="glass-card p-8 text-center">
          <p className="text-slate-400">Please sign in to view your activity feed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8">
        <h1 className="text-3xl font-black text-gradient-cyber">Activity</h1>
        <p className="text-slate-400 mt-1">Recent actions across your account and teams.</p>
      </motion.div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-12 text-center">
          <span className="text-4xl">📊</span>
          <p className="text-slate-400 mt-4">No activity yet.</p>
          <p className="text-slate-600 text-sm mt-1">
            Join a scrim, register for a tournament, or invite players to get started.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-4">
            {notifications.length} recent events
          </p>
          <AnimatePresence>
            {notifications.map((item, i) => (
              <ActivityItem key={item.id} item={item} index={i} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
