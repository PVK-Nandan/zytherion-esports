import { notFound } from "next/navigation";
import Link from "next/link";
import { getTeamBySlug } from "@/lib/teams";
import { TeamRoster } from "@/components/teams/TeamRoster";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props) {
  try {
    const team = await getTeamBySlug(params.slug);
    return { title: `${team.name} — Zytherion Esports` };
  } catch {
    return { title: "Team not found — Zytherion Esports" };
  }
}

export default async function TeamProfilePage({ params }: Props) {
  let team;
  try {
    team = await getTeamBySlug(params.slug);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#0d0f14] text-white">
      {/* Hero */}
      <div className="bg-gradient-to-b from-orange-900/20 to-transparent">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-white/10 flex-shrink-0 overflow-hidden">
              {team.logoUrl ? (
                <img
                  src={team.logoUrl}
                  alt={team.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white/60">
                  {team.name.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{team.name}</h1>
              <p className="text-sm text-gray-400">@{team.slug}</p>
              {team.description && (
                <p className="text-sm text-gray-300 mt-1">{team.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 mt-6 text-sm text-gray-400">
            <span>
              <span className="font-semibold text-white">{team.memberCount}</span> / {team.maxMembers} members
            </span>
          </div>
        </div>
      </div>

      {/* Roster */}
      <div className="mx-auto max-w-2xl px-4 pb-10">
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold">Roster</h2>
            <Link
              href={`/teams/${team.slug}/manage`}
              className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
            >
              Manage
            </Link>
          </div>
          <div className="px-5">
            <TeamRoster members={team.members} ownerId={team.ownerId} />
          </div>
        </div>
      </div>
    </main>
  );
}
