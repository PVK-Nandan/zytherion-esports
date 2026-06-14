"use client";

import { motion } from "framer-motion";

interface StatsBarProps {
  liveCount: number;
  openCount: number;
  totalCount: number;
}

const stats = (live: number, open: number, total: number) => [
  {
    label: "Live Now",
    value: live,
    icon: "⚡",
    color: "from-violet-600 to-violet-400",
    glow: "shadow-neon-violet",
    border: "border-violet-500/30",
    bg: "bg-violet-500/10",
  },
  {
    label: "Open Registration",
    value: open,
    icon: "🎯",
    color: "from-blue-600 to-blue-400",
    glow: "shadow-neon-blue",
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
  },
  {
    label: "Total Tournaments",
    value: total,
    icon: "🏆",
    color: "from-cyan-600 to-cyan-400",
    glow: "shadow-neon-cyan",
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/10",
  },
];

export function StatsBar({ liveCount, openCount, totalCount }: StatsBarProps) {
  const items = stats(liveCount, openCount, totalCount);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {items.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            whileHover={{ scale: 1.03, y: -2 }}
            className={`glass-card p-5 border ${stat.border} ${stat.glow} flex items-center gap-4 cursor-default`}
          >
            <div className={`w-12 h-12 rounded-lg ${stat.bg} flex items-center justify-center text-2xl flex-shrink-0`}>
              {stat.icon}
            </div>
            <div>
              <div className={`text-3xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                {stat.value}
              </div>
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                {stat.label}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
