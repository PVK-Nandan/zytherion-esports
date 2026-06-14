"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/api";

const BGMI_TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Crown", "Ace", "Conqueror"] as const;

interface UserProfile {
  bgmiIgn: string | null;
  bgmiTier: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bgmiUid: string | null;
}

interface Invitation {
  id: string;
  team: { name: string; slug: string };
  inviter: { username: string };
  expiresAt: string;
}

const tierColors: Record<string, string> = {
  Bronze: "text-amber-700",
  Silver: "text-slate-300",
  Gold: "text-yellow-400",
  Platinum: "text-cyan-300",
  Diamond: "text-blue-400",
  Crown: "text-violet-400",
  Ace: "text-orange-400",
  Conqueror: "text-red-400",
};

export default function ProfilePage() {
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [ign, setIgn] = useState("");
  const [tier, setTier] = useState("");
  const [bio, setBio] = useState("");
  const [uid, setUid] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const fetchProfile = useCallback(async () => {
    const token = await getToken();
    if (!token || !user?.username) return;
    try {
      const [profileData, invData] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/users/${user.username}`)
          .then((r) => r.json())
          .then((d: { profile?: UserProfile }) => d.profile ?? null),
        apiRequest<Invitation[]>("/users/me/invitations", { token }),
      ]);
      setProfile(profileData as UserProfile | null);
      setInvitations(invData);
      if (profileData) {
        setIgn(profileData.bgmiIgn ?? "");
        setTier(profileData.bgmiTier ?? "");
        setBio(profileData.bio ?? "");
        setUid(profileData.bgmiUid ?? "");
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [getToken, user?.username]);

  useEffect(() => {
    if (isSignedIn) void fetchProfile();
  }, [isSignedIn, fetchProfile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    try {
      const token = await getToken();
      await apiRequest("/users/me/profile", {
        method: "PATCH",
        token: token!,
        body: JSON.stringify({
          bgmiIgn: ign || undefined,
          bgmiTier: tier || undefined,
          bio: bio || undefined,
          bgmiUid: uid || undefined,
        }),
      });
      setSaveMsg("Profile updated!");
      setEditing(false);
      void fetchProfile();
    } catch (err: unknown) {
      setSaveMsg(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleInvitation(id: string, action: "accept" | "decline") {
    const token = await getToken();
    if (!token) return;
    try {
      await apiRequest(`/invitations/${id}/${action}`, { method: "POST", token });
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    } catch { /* ignore */ }
  }

  if (!isSignedIn) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="glass-card p-8 text-center">
          <p className="text-slate-400">Please sign in to view your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8">
        <h1 className="text-3xl font-black text-gradient-cyber">Profile</h1>
        <p className="text-slate-400 mt-1">Your account, BGMI stats, and team info.</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Avatar + basic info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6 text-center md:col-span-1">
          <div className="w-20 h-20 rounded-full mx-auto bg-neon-gradient flex items-center justify-center text-3xl font-black text-white mb-4">
            {user?.username?.[0]?.toUpperCase() ?? "?"}
          </div>
          <h2 className="text-lg font-bold text-white">{user?.username ?? user?.fullName}</h2>
          {profile?.bgmiIgn && (
            <p className="text-sm text-violet-300 mt-1">{profile.bgmiIgn}</p>
          )}
          {profile?.bgmiTier && (
            <p className={`text-xs font-bold mt-1 ${tierColors[profile.bgmiTier] ?? "text-slate-400"}`}>
              {profile.bgmiTier}
            </p>
          )}
          {profile?.bio && (
            <p className="text-xs text-slate-400 mt-3 line-clamp-3">{profile.bio}</p>
          )}
          <button
            onClick={() => setEditing(!editing)}
            className="mt-4 w-full py-2 rounded-lg text-xs font-semibold bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/30 transition-colors"
          >
            {editing ? "Cancel Edit" : "Edit Profile"}
          </button>
        </motion.div>

        {/* Stats + Edit */}
        <div className="md:col-span-2 space-y-5">
          {/* Stats summary */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-5">
            <h3 className="text-sm font-bold text-white mb-4">Stats Summary</h3>
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded-lg bg-white/5 animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "BGMI IGN", value: profile?.bgmiIgn ?? "—", icon: "🎮" },
                  { label: "Tier", value: profile?.bgmiTier ?? "—", icon: "🏅" },
                  { label: "BGMI UID", value: profile?.bgmiUid ?? "—", icon: "🔢" },
                  { label: "Pending Invites", value: invitations.length, icon: "📨" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white/3 rounded-lg p-3">
                    <p className="text-xl">{stat.icon}</p>
                    <p className="text-sm font-bold text-white mt-1 truncate">{stat.value}</p>
                    <p className="text-xs text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Edit form */}
          {editing && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="glass-card p-5 overflow-hidden">
              <h3 className="text-sm font-bold text-white mb-4">Edit Profile</h3>
              <form onSubmit={(e) => { void handleSave(e); }} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">BGMI IGN</label>
                    <input type="text" value={ign} onChange={(e) => setIgn(e.target.value)} placeholder="Your IGN" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">BGMI UID</label>
                    <input type="text" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="UID" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">BGMI Tier</label>
                  <select value={tier} onChange={(e) => setTier(e.target.value)} className="w-full rounded-lg bg-cyber-bg border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors">
                    <option value="">Select tier…</option>
                    {BGMI_TIERS.map((t) => <option key={t} value={t} className="bg-cyber-bg">{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Bio</label>
                  <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us about yourself…" rows={2} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors resize-none" />
                </div>
                {saveMsg && (
                  <p className={`text-xs px-2 py-1.5 rounded ${saveMsg.includes("updated") ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>
                    {saveMsg}
                  </p>
                )}
                <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-bold bg-neon-gradient text-white hover:opacity-90 disabled:opacity-40 transition-opacity">
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </form>
            </motion.div>
          )}

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
              <h3 className="text-sm font-bold text-white mb-4">Team Invitations ({invitations.length})</h3>
              <div className="space-y-3">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-violet-600/10 border border-violet-500/20">
                    <div>
                      <p className="text-sm font-semibold text-white">{inv.team.name}</p>
                      <p className="text-xs text-slate-400">Invited by {inv.inviter.username}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void handleInvitation(inv.id, "accept")} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                        Accept
                      </button>
                      <button onClick={() => void handleInvitation(inv.id, "decline")} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors">
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
