import type { TeamMember } from "@/types/team";

interface Props {
  members: TeamMember[];
  ownerId: string;
  currentUserId?: string | undefined;
  isOwner?: boolean | undefined;
  onKick?: ((userId: string, username: string) => void) | undefined;
}

export function TeamRoster({
  members,
  ownerId,
  currentUserId: _currentUserId,
  isOwner,
  onKick,
}: Props) {
  return (
    <ul className="divide-y divide-white/5">
      {members.map((member) => (
        <li key={member.userId} className="flex items-center gap-3 py-3">
          <div className="w-9 h-9 rounded-full bg-white/10 flex-shrink-0 overflow-hidden">
            {member.avatarUrl ? (
              <img
                src={member.avatarUrl}
                alt={member.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-white/60">
                {member.username.charAt(0).toUpperCase() || "?"}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {member.username}
            </p>

            {member.userId === ownerId && (
              <p className="text-xs text-orange-400">Owner</p>
            )}
          </div>

          {isOwner && member.userId !== ownerId && onKick && (
            <button
              onClick={() => onKick(member.userId, member.username)}
              className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-900/30"
            >
              Kick
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}