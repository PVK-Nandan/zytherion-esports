"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface LeaderboardEntry {
  rank: number;
  team: { id: string; name: string; slug: string; logoUrl: string | null };
  points: number;
  kills: number;
  matchesPlayed: number;
}

interface Tournament {
  id: string;
  title: string;
  status: string;
  prizePoolPaise: number;
}

interface TournamentsResponse {
  data: Tournament[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-600"];
const rankBg = ["bg-yellow-500/10 border-yellow-500/30", "bg-slate-400/10 border-slate-400/30", "bg-amber-700/10 border-amber-700/30"];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const medals = ["🥇", "🥈", "🥉"];
    return <span className="text-xl">{medals[rank - 1]}</span>;
  }
  return <span className="text-sm font-bold text-slate-500">#{rank}</span>;
}

export default function LeaderboardsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);

  useEffect(() => {
    async function fetchTournaments() {
      try {
        const res = await fetch(`${API_URL}/tournaments?limit=50`);
        const data = await res.json() as TournamentsResponse;
        const withLeaderboard = (data.data ?? []).filter(
          (t) => t.status === "completed" || t.status === "in_progress"
        );
        setTournaments(withLeaderboard);
        if (withLeaderboard.length > 0 && withLeaderboard[0]) {
          setSelectedId(withLeaderboard[0].id);
        }
      } catch {
        // silently ignore
      } finally {
        setLoadingTournaments(false);
      }
    }
    void fetchTournaments();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingEntries(true);
    setEntries([]);
    fetch(`${API_URL}/tournaments/${selectedId}/leaderboard`)
      .then((r) => r.json())
      .then((d: { entries: LeaderboardEntry[] }) => setEntries(d.entries ?? []))
      .catch(() => {})
      .finally(() => setLoadingEntries(false));
  }, [selectedId]);

  const selected = tournaments.find((t) => t.id === selectedId);
  const totalPrize = selected ? (selected.prizePoolPaise / 100).toFixed(0) : "0";
  const totalKills = entries.reduce((s, e) => s + e.kills, 0);
  const totalMatches = entries.reduce((s, e) => s + e.matchesPlayed, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8">
        <h1 className="text-3xl font-black text-gradient-cyber">Leaderboards</h1>
        <p className="text-slate-400 mt-1">Tournament standings and team rankings.</p>
      </motion.div>

      {/* Tournament selector */}
      {loadingTournaments ? (
        <div className="h-10 w-64 rounded-lg bg-white/5 animate-pulse mb-6" />
      ) : tournaments.length === 0 ? (
        <div className="glass-card p-8 text-center mb-6">
          <p className="text-slate-400">No completed tournaments yet. Check back after matches are played.</p>
        </div>
      ) : (
        <div className="mb-6">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Select Tournament</label>
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors"
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id} className="bg-cyber-bg">
                {t.title} ({t.status})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats summary */}
      {entries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
        >
          {[
            { label: "Teams", value: entries.length, icon: "🛡️" },
            { label: "Total Kills", value: totalKills, icon: "⚔️" },
            { label: "Matches", value: totalMatches, icon: "🎮" },
            { label: "Prize Pool", value: `₹${totalPrize}`, icon: "💰" },
          ].map((stat) => (
            <div key={stat.label} className="glass-card p-4 text-center">
              <span className="text-2xl">{stat.icon}</span>
              <p className="text-xl font-black text-white mt-1">{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* Team rankings table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-bold text-white">Team Rankings</h2>
        </div>

        {loadingEntries ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-slate-500">No leaderboard data for this tournament.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Rank</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Team</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Points</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Kills</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Matches</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <motion.tr
                    key={entry.team.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors ${
                      entry.rank <= 3 ? rankBg[entry.rank - 1] + " border" : ""
                    }`}
                  >
                    <td className="px-5 py-4 w-16">
                      <div className="flex items-center justify-center w-8 h-8">
                        <RankBadge rank={entry.rank} />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center text-sm font-bold text-violet-300 flex-shrink-0">
                          {entry.team.name.charAt(0).toUpperCase()}
                        </div>
                        <span className={`font-semibold text-sm ${entry.rank <= 3 ? rankColors[entry.rank - 1] : "text-white"}`}>
                          {entry.team.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="text-sm font-bold text-violet-300">{entry.points}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="text-sm text-slate-300">{entry.kills}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="text-sm text-slate-400">{entry.matchesPlayed}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
