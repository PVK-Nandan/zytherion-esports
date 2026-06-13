import Link from "next/link";
import type { Team } from "@/types/team";

interface Props {
  team: Team;
}

export function TeamCard({ team }: Props) {
  return (
    <Link
      href={`/teams/${team.slug}`}
      className="flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
    >
      <div className="w-12 h-12 rounded-lg bg-white/10 flex-shrink-0 overflow-hidden">
        {team.logoUrl ? (
          <img
            src={team.logoUrl}
            alt={team.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white/60">
            {team.name.charAt(0).toUpperCase() || "?"}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{team.name}</p>
        <p className="text-xs text-gray-400 truncate">@{team.slug}</p>
      </div>
      <span className="text-xs text-gray-500 flex-shrink-0">
        {team.memberCount}/{team.maxMembers}
      </span>
    </Link>
  );
}
