"use client";

import { useAuth } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@/types/notification";

const iconMap: Record<string, string> = {
  team_invitation_received: "🛡️",
  tournament_registration_confirmed: "🏆",
  match_result_submitted: "⚔️",
  match_result_approved: "✅",
  match_result_disputed: "⚠️",
  wallet_deposit_completed: "💰",
  wallet_withdrawal_completed: "💸",
  wallet_withdrawal_failed: "❌",
};

function NotificationCard({ notification, onRead, index }: {
  notification: Notification;
  onRead: (id: string) => void;
  index: number;
}) {
  const icon = iconMap[notification.type] ?? "🔔";
  const isUnread = !notification.read;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ delay: index * 0.05 }}
      className={`flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 ${
        isUnread
          ? "bg-violet-600/10 border-violet-500/30 neon-border-violet"
          : "bg-white/3 border-white/8 opacity-70"
      }`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
        isUnread ? "bg-violet-600/20" : "bg-white/5"
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-semibold ${isUnread ? "text-white" : "text-slate-400"}`}>
            {notification.title}
          </p>
          {isUnread && (
            <span className="flex-shrink-0 w-2 h-2 mt-1 rounded-full bg-violet-400 animate-pulse-slow" />
          )}
        </div>
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{notification.body}</p>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-slate-600">
            {new Date(notification.createdAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {isUnread && (
            <button
              onClick={() => onRead(notification.id)}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Mark read
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function NotificationsPage() {
  const { isSignedIn } = useAuth();
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();

  if (!isSignedIn) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="glass-card p-8 text-center">
          <p className="text-slate-400">Please sign in to view your notifications.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-gradient-cyber">Notifications</h1>
            <p className="text-slate-400 mt-1">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => void markAllRead()}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/30 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>
      </motion.div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card p-12 text-center"
        >
          <span className="text-4xl">🔔</span>
          <p className="text-slate-400 mt-4">No notifications yet.</p>
          <p className="text-slate-600 text-sm mt-1">You&apos;ll see match results, team invites, and wallet updates here.</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {notifications.map((n, i) => (
              <NotificationCard key={n.id} notification={n} onRead={markRead} index={i} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
