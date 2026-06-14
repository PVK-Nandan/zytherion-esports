"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { createTeam } from "@/lib/teams";

function TeamLookup() {
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [team, setTeam] = useState<{ name: string; slug: string; memberCount: number } | null>(null);
  const [err, setErr] = useState("");

  async function lookup() {
    if (!slug.trim()) return;
    setLoading(true);
    setErr("");
    setTeam(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${apiUrl}/teams/${slug.trim()}`);
      if (!res.ok) { setErr("Team not found."); return; }
      const data = await res.json() as { name: string; slug: string; memberCount: number };
      setTeam(data);
    } catch {
      setErr("Failed to fetch team.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-start gap-3 flex-wrap">
      <input
        type="text"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void lookup(); }}
        placeholder="Team slug (e.g. shadow-wolves)"
        className="flex-1 min-w-48 rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors"
      />
      <button
        onClick={() => void lookup()}
        disabled={loading}
        className="px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-40"
      >
        {loading ? "Looking up…" : "Find Team"}
      </button>
      {err && <p className="text-sm text-red-400 self-center">{err}</p>}
      {team && (
        <Link
          href={`/teams/${team.slug}`}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/30 transition-colors"
        >
          <span className="font-semibold">{team.name}</span>
          <span className="text-xs text-slate-400">{team.memberCount} members</span>
          <span>→</span>
        </Link>
      )}
    </div>
  );
}

export default function TeamsPage() {
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [players, setPlayers] = useState(["", "", "", "", ""]);
  const [captainIndex, setCaptainIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function deriveSlug(n: string) {
    return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugManual) setSlug(deriveSlug(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setError("");
    try {
      setSubmitting(true);
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const team = await createTeam(
        { name: name.trim(), slug: slug.trim(), ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}) },
        token,
      );
      router.push(`/teams/${team.slug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isSignedIn) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="glass-card p-8 text-center">
          <p className="text-slate-400">Please sign in to manage your teams.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-black text-gradient-cyber">Teams</h1>
        <p className="text-slate-400 mt-1">Build your squad and compete together.</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Team */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6"
        >
          <h2 className="text-lg font-bold text-white mb-1">Create a Team</h2>
          <p className="text-sm text-slate-400 mb-6">Set up your squad for BGMI scrims and tournaments.</p>
          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Team Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Shadow Wolves"
                maxLength={50}
                required
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Slug *</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
                placeholder="shadow-wolves"
                maxLength={30}
                required
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Logo URL</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting || !name.trim() || !slug.trim()}
              className="w-full rounded-lg py-3 text-sm font-bold bg-neon-gradient text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? "Creating…" : "Create Team"}
            </button>
          </form>
        </motion.div>

        {/* Squad Roster */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6"
        >
          <h2 className="text-lg font-bold text-white mb-1">Squad Roster</h2>
          <p className="text-sm text-slate-400 mb-6">Add players by BGMI IGN. Mark the captain.</p>
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-violet-600/10 border border-violet-500/20">
              <span className="text-slate-500 text-sm w-5 text-center">0</span>
              <span className="flex-1 text-sm text-violet-300 font-medium">{user?.username ?? "You"} (Owner)</span>
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600/30 border border-violet-500/60 text-violet-300">
                👑 Captain
              </span>
            </div>
            {players.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-3"
              >
                <span className="text-slate-500 text-sm w-5 text-center">{i + 1}</span>
                <input
                  type="text"
                  value={p}
                  onChange={(e) => setPlayers(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                  placeholder={`Player ${i + 1} BGMI IGN`}
                  className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setCaptainIndex(captainIndex === i + 1 ? 0 : i + 1)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    captainIndex === i + 1
                      ? "bg-violet-600/30 border-violet-500/60 text-violet-300"
                      : "bg-white/5 border-white/10 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {captainIndex === i + 1 ? "👑 Capt." : "Captain"}
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Find Team */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 lg:col-span-2"
        >
          <h2 className="text-lg font-bold text-white mb-1">Find Your Team</h2>
          <p className="text-sm text-slate-400 mb-4">Look up a team by its slug to view and manage it.</p>
          <TeamLookup />
        </motion.div>
      </div>
    </div>
  );
}
