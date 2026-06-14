"use client";

import { motion } from "framer-motion";
import { TournamentCard } from "./TournamentCard";
import type { Tournament } from "@/types/tournament";

interface TournamentSectionProps {
  title: string;
  subtitle?: string;
  tournaments: Tournament[];
  accentColor: "violet" | "blue" | "cyan";
  emptyMessage?: string;
}

const ACCENT = {
  violet: {
    heading: "text-violet-400",
    bar: "bg-violet-500",
    glow: "shadow-neon-violet",
    empty: "border-violet-500/20 text-violet-400/60",
  },
  blue: {
    heading: "text-blue-400",
    bar: "bg-blue-500",
    glow: "shadow-neon-blue",
    empty: "border-blue-500/20 text-blue-400/60",
  },
  cyan: {
    heading: "text-cyan-400",
    bar: "bg-cyan-500",
    glow: "shadow-neon-cyan",
    empty: "border-cyan-500/20 text-cyan-400/60",
  },
};

export function TournamentSection({
  title,
  subtitle,
  tournaments,
  accentColor,
  emptyMessage = "No tournaments in this category.",
}: TournamentSectionProps) {
  const acc = ACCENT[accentColor];

  return (
    <section className="max-w-6xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-3 mb-6"
      >
        <div className={`w-1 h-8 ${acc.bar} rounded-full ${acc.glow}`} />
        <div>
          <h2 className={`text-xl font-black tracking-tight uppercase ${acc.heading}`}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </motion.div>

      {tournaments.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className={`glass-card border ${acc.empty} border-dashed p-8 text-center text-sm`}
        >
          {emptyMessage}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((t, i) => (
            <TournamentCard key={t.id} tournament={t} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
