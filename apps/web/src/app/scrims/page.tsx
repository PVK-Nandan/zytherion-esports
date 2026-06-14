"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Tournament {
  id: string;
  title: string;
  slug: string;
  status: string;
  entryFeePaise: number;
  prizePoolPaise: number;
  scheduledAt: string | null;
  format: string;
  _count?: { registrations: number };
}

interface TournamentsResponse {
  data: Tournament[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const SCRIM_TIERS = [
  {
    label: "Normal Scrim",
    entryFee: 30,
    color: "from-blue-600/20 to-blue-500/5",
    border: "border-blue-500/30",
    badge: "text-blue-400",
    glow: "shadow-neon-blue",
    icon: "🎮",
    active: true,
  },
  {
    label: "Pro Scrim",
    entryFee: 60,
    color: "from-violet-600/20 to-violet-500/5",
    border: "border-violet-500/30",
    badge: "text-violet-400",
    glow: "shadow-neon-violet",
    icon: "⚔️",
    active: true,
  },
  {
    label: "Elite Scrim",
    entryFee: 100,
    color: "from-yellow-600/20 to-yellow-500/5",
    border: "border-yellow-500/30",
    badge: "text-yellow-400",
    glow: "",
    icon: "👑",
    active: false,
  },
];

const MAPS = [
  {
    name: "Erangel",
    desc: "The classic battleground. 8×8 km of diverse terrain.",
    image: "🌾",
    color: "from-green-600/20 to-emerald-500/5",
    border: "border-green-500/30",
  },
  {
    name: "Miramar",
    desc: "Vast desert with long-range engagements.",
    image: "🏜️",
    color: "from-yellow-600/20 to-amber-500/5",
    border: "border-yellow-500/30",
  },
  {
    name: "Rondo",
    desc: "Urban cityscape with vertical combat.",
    image: "🏙️",
    color: "from-cyan-600/20 to-blue-500/5",
    border: "border-cyan-500/30",
  },
];

function ScrimCard({
  tier,
  tournaments,
  index,
}: {
  tier: (typeof SCRIM_TIERS)[number];
  tournaments: Tournament[];
  index: number;
}) {
  const matching = tournaments.filter(
    (t) => Math.round(t.entryFeePaise / 100) === tier.entryFee
  );
  const latest = matching[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ y: -4, scale: 1.01 }}
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${tier.color} ${tier.border} p-6 cursor-pointer transition-shadow ${tier.active ? tier.glow : ""}`}
    >
      {!tier.active && (
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/20 border border-yellow-500/40 text-yellow-400">
          Coming Soon
        </div>
      )}

      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-3xl">{tier.icon}</span>
          <h3 className="text-lg font-black text-white mt-2">{tier.label}</h3>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black ${tier.badge}`}>₹{tier.entryFee}</p>
          <p className="text-xs text-slate-500">entry fee</p>
        </div>
      </div>

      {latest ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Prize Pool</span>
            <span className="font-bold text-emerald-400">₹{(latest.prizePoolPaise / 100).toFixed(0)}</span>
          </div>
          {latest.scheduledAt && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Date</span>
              <span className="text-white">
                {new Date(latest.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            </div>
          )}
          {latest.scheduledAt && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Time</span>
              <span className="text-white">
                {new Date(latest.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Status</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              latest.status === "registration_open"
                ? "bg-emerald-500/20 text-emerald-400"
                : latest.status === "in_progress"
                ? "bg-violet-500/20 text-violet-400"
                : "bg-slate-500/20 text-slate-400"
            }`}>
              {latest.status.replace(/_/g, " ")}
            </span>
          </div>
          {latest._count !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Registered</span>
              <span className="text-white">{latest._count.registrations} teams</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 opacity-50">
          <div className="h-4 rounded bg-white/5" />
          <div className="h-4 rounded bg-white/5 w-3/4" />
          <div className="h-4 rounded bg-white/5 w-1/2" />
        </div>
      )}

      {tier.active && (
        <div className="mt-5">
          <button
            disabled={!latest || latest.status !== "registration_open"}
            className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all ${
              latest?.status === "registration_open"
                ? "bg-neon-gradient text-white hover:opacity-90"
                : "bg-white/5 text-slate-500 cursor-not-allowed"
            }`}
          >
            {latest?.status === "registration_open" ? "Register Now" : "Not Open"}
          </button>
        </div>
      )}
    </motion.div>
  );
}

function MapCard({ map, index }: { map: (typeof MAPS)[number]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.08 }}
      whileHover={{ y: -4 }}
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${map.color} ${map.border} p-6 text-center cursor-pointer transition-all`}
    >
      <div className="text-5xl mb-3">{map.image}</div>
      <h3 className="text-base font-black text-white">{map.name}</h3>
      <p className="text-xs text-slate-400 mt-1">{map.desc}</p>
    </motion.div>
  );
}

export default function ScrimsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScrims() {
      try {
        const res = await fetch(`${API_URL}/tournaments?format=scrim&limit=50`);
        if (!res.ok) throw new Error("Failed");
        const data = await res.json() as TournamentsResponse;
        setTournaments(data.data ?? []);
      } catch {
        // fallback: fetch all and filter
        try {
          const res2 = await fetch(`${API_URL}/tournaments?limit=50`);
          const data2 = await res2.json() as TournamentsResponse;
          setTournaments(data2.data ?? []);
        } catch { /* ignore */ }
      } finally {
        setLoading(false);
      }
    }
    void fetchScrims();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8">
        <h1 className="text-3xl font-black text-gradient-cyber">Daily Scrims</h1>
        <p className="text-slate-400 mt-1">Pick your tier. Enter the battlefield. Dominate.</p>
      </motion.div>

      {/* Scrim Tier Cards */}
      <section className="mb-12">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Scrim Tiers</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {SCRIM_TIERS.map((tier, i) => (
              <ScrimCard key={tier.label} tier={tier} tournaments={tournaments} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* Match Maps */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Battle Maps</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {MAPS.map((map, i) => (
            <MapCard key={map.name} map={map} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
