"use client";

import { motion } from "framer-motion";
import type { Tournament } from "@/types/tournament";

interface TournamentCardProps {
  tournament: Tournament;
  index: number;
}

const STATUS_CONFIG = {
  in_progress: {
    label: "Live",
    dot: "bg-green-400 animate-pulse",
    badge: "bg-green-500/15 text-green-300 border-green-500/30",
    accent: "border-l-green-500",
  },
  registration_open: {
    label: "Open",
    dot: "bg-blue-400 animate-pulse",
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    accent: "border-l-blue-500",
  },
  registration_closed: {
    label: "Closed",
    dot: "bg-yellow-400",
    badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    accent: "border-l-yellow-500",
  },
  completed: {
    label: "Completed",
    dot: "bg-slate-400",
    badge: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    accent: "border-l-slate-500",
  },
  draft: {
    label: "Draft",
    dot: "bg-slate-600",
    badge: "bg-slate-700/30 text-slate-400 border-slate-600/30",
    accent: "border-l-slate-600",
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-red-500",
    badge: "bg-red-500/15 text-red-300 border-red-500/30",
    accent: "border-l-red-500",
  },
} as const;

function formatDate(dateStr?: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TournamentCard({ tournament, index }: TournamentCardProps) {
  const cfg = STATUS_CONFIG[tournament.status] ?? STATUS_CONFIG.draft;
  const fillPct = tournament.maxTeams > 0
    ? Math.round((tournament.registeredTeamsCount / tournament.maxTeams) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07 }}
      whileHover={{ scale: 1.02, y: -3 }}
      className={`glass-card border-l-2 ${cfg.accent} p-5 flex flex-col gap-3 cursor-default group`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-sm leading-tight truncate group-hover:text-gradient-cyber transition-all">
            {tournament.title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-wider">
            {tournament.game} · {tournament.format}
          </p>
        </div>
        <span className={`status-badge border ${cfg.badge} flex-shrink-0 text-[10px]`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* Prize pool + entry fee */}
      <div className="flex items-center gap-3">
        {tournament.prizePoolInr > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">Prize</span>
            <span className="text-sm font-black neon-text-violet">
              ₹{tournament.prizePoolInr.toLocaleString("en-IN")}
            </span>
          </div>
        )}
        {tournament.prizePoolInr > 0 && tournament.entryFeeInr >= 0 && (
          <span className="text-slate-700">·</span>
        )}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500">Entry</span>
          <span className="text-sm font-semibold text-slate-300">
            {tournament.entryFeeInr === 0 ? "Free" : `₹${tournament.entryFeeInr}`}
          </span>
        </div>
      </div>

      {/* Team slots + progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-500">
          <span>{tournament.registeredTeamsCount} / {tournament.maxTeams} teams</span>
          <span>{fillPct}% full</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${fillPct}%` }}
            transition={{ duration: 0.8, delay: index * 0.07 + 0.3, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-blue-500"
          />
        </div>
      </div>

      {/* Start date */}
      {tournament.startsAt && (
        <div className="text-xs text-slate-600 flex items-center gap-1">
          <span>🗓</span>
          <span>{formatDate(tournament.startsAt)}</span>
        </div>
      )}
    </motion.div>
  );
}
