"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { getTeamBySlug, updateTeam, kickMember, invitePlayer } from "@/lib/teams";
import { TeamRoster } from "@/components/teams/TeamRoster";
import type { TeamWithRoster } from "@/types/team";

interface Props {
  params: { slug: string };
}

export default function ManageTeamPage({ params }: Props) {
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();
  const [team, setTeam] = useState<TeamWithRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Invite form state
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    try {
      const data = await getTeamBySlug(params.slug);
      setTeam(data);
      setEditName(data.name);
      setEditDescription(data.description ?? "");
      setEditLogoUrl(data.logoUrl ?? "");
    } catch {
      setError("Team not found");
    } finally {
      setLoading(false);
    }
  }, [params.slug]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const currentUserId = user?.id;
  const isOwner = team ? team.ownerId === currentUserId : false;

  if (!isSignedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-gray-400">Please sign in to manage your team.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  if (error || !team) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-red-400">{error ?? "Something went wrong"}</p>
      </main>
    );
  }

  if (!isOwner) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-gray-400">Only the team owner can manage this team.</p>
      </main>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!team) return;
    try {
      setSaving(true);
      const token = await getToken();
      if (!token) return;
      await updateTeam(team.id, {
        ...(editName.trim() ? { name: editName.trim() } : {}),
        ...(editDescription.trim() ? { description: editDescription.trim() } : {}),
        ...(editLogoUrl.trim() ? { logoUrl: editLogoUrl.trim() } : {}),
      }, token);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 2500);
      void loadTeam();
    } catch {
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleKick(userId: string, username: string) {
    if (!team) return;
    if (!confirm(`Remove ${username} from the team?`)) return;
    try {
      const token = await getToken();
      if (!token) return;
      await kickMember(team.id, userId, token);
      void loadTeam();
    } catch {
      setError(`Failed to remove ${username}`);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !inviteUsername.trim()) return;
    setInviteError(null);
    setInviteSuccess(null);
    try {
      setInviting(true);
      const token = await getToken();
      if (!token) return;
      await invitePlayer(team.id, inviteUsername.trim(), token);
      setInviteSuccess(`Invitation sent to ${inviteUsername.trim()}`);
      setInviteUsername("");
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0d0f14] text-white">
      <div className="mx-auto max-w-lg px-4 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/10 overflow-hidden flex-shrink-0">
            {team.logoUrl ? (
              <img src={team.logoUrl} alt={team.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white/60">
                {team.name.charAt(0).toUpperCase() || "?"}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold">{team.name}</h1>
            <p className="text-sm text-gray-400">Manage team</p>
          </div>
        </div>

        {/* Edit details */}
        <section className="bg-white/5 rounded-xl border border-white/10 p-5">
          <h2 className="text-sm font-semibold mb-4">Team details</h2>
          <form
  onSubmit={(e) => {
    void handleSave(e);
  }}
  className="space-y-4"
>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Team name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={200}
                rows={3}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Logo URL</label>
              <input
                type="url"
                value={editLogoUrl}
                onChange={(e) => setEditLogoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 text-sm transition-colors"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saveSuccess && <span className="text-sm text-green-400">Saved!</span>}
            </div>
          </form>
        </section>

        {/* Invite player */}
        <section className="bg-white/5 rounded-xl border border-white/10 p-5">
          <h2 className="text-sm font-semibold mb-1">Invite player</h2>
          <p className="text-xs text-gray-500 mb-4">
            {team.memberCount}/{team.maxMembers} members — invite by username
          </p>
          <form
            onSubmit={(e) => {
              void handleInvite(e);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              placeholder="username"
              maxLength={32}
              className="flex-1 rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 min-w-0"
            />
            <button
              type="submit"
              disabled={inviting || !inviteUsername.trim() || team.memberCount >= team.maxMembers}
              className="rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 text-sm transition-colors flex-shrink-0"
            >
              {inviting ? "…" : "Invite"}
            </button>
          </form>
          {inviteError && <p className="mt-2 text-xs text-red-400">{inviteError}</p>}
          {inviteSuccess && <p className="mt-2 text-xs text-green-400">{inviteSuccess}</p>}
        </section>

        {/* Roster */}
        <section className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold">Roster</h2>
          </div>
          <div className="px-5">
            <TeamRoster
              members={team.members}
              ownerId={team.ownerId}
              currentUserId={currentUserId}
              isOwner={isOwner}
              onKick={(userId, username) => {
                void handleKick(userId, username);
            }}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
