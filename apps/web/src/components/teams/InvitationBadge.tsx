"use client";

import Link from "next/link";
import { useInvitations } from "@/hooks/useInvitations";

export function InvitationBadge() {
  const { invitations } = useInvitations();
  const count = invitations.length;

  return (
    <Link
      href="/invitations"
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors"
      aria-label={count > 0 ? `${count} pending team invitation${count !== 1 ? "s" : ""}` : "Team invitations"}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-gray-300">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
