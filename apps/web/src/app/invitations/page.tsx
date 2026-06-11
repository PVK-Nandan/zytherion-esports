"use client";

import Link from "next/link";
import { useInvitations } from "@/hooks/useInvitations";

function timeUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export default function InvitationsPage() {
  const { invitations, loading, error, accept, decline } = useInvitations();

  return (
    <main className="min-h-screen bg-[#0d0f14] text-white">
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-2xl font-bold mb-1">Team invitations</h1>
        <p className="text-sm text-gray-400 mb-8">Accept or decline pending team invitations.</p>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <p className="text-gray-500 text-sm">Loading…</p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        {!loading && !error && invitations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 text-gray-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <p className="text-gray-500 text-sm">No pending invitations</p>
            <Link href="/teams/create" className="text-sm text-orange-400 hover:text-orange-300 transition-colors mt-1">
              Create a team instead
            </Link>
          </div>
        )}

        {invitations.length > 0 && (
          <ul className="space-y-3">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="bg-white/5 border border-white/10 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  {/* Logo */}
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex-shrink-0 overflow-hidden mt-0.5">
                    {inv.teamLogoUrl ? (
                      <img src={inv.teamLogoUrl} alt={inv.teamName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white/60">
                        {inv.teamName.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">
                      <Link href={`/teams/${inv.teamSlug}`} className="hover:text-orange-300 transition-colors">
                        {inv.teamName}
                      </Link>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Invited by <span className="text-gray-300">{inv.invitedByUsername}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{timeUntil(inv.expiresAt)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => accept(inv.id)}
                    className="flex-1 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-semibold py-2 text-sm transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => decline(inv.id)}
                    className="flex-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold py-2 text-sm transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
