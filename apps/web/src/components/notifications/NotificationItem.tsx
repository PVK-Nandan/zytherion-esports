"use client";

import Link from "next/link";
import type { Notification, NotificationType } from "@/types/notification";

function getRoute(type: NotificationType, metadata: Record<string, unknown>): string {
  switch (type) {
    case "team_invitation_received":
      return "/invitations";
    case "tournament_registration_confirmed":
      return metadata.tournamentId ? `/tournaments/${metadata.tournamentId}` : "/tournaments";
    case "match_result_submitted":
    case "match_result_approved":
    case "match_result_disputed":
      return metadata.matchId ? `/matches/${metadata.matchId}` : "/matches";
    case "wallet_deposit_completed":
    case "wallet_withdrawal_completed":
    case "wallet_withdrawal_failed":
      return "/wallet";
    default:
      return "/";
  }
}

function TypeIcon({ type }: { type: NotificationType }) {
  const cls = "w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0";

  if (type.startsWith("team_")) {
    return (
      <span className={`${cls} bg-blue-500/20 text-blue-400`}>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z" />
        </svg>
      </span>
    );
  }
  if (type.startsWith("tournament_")) {
    return (
      <span className={`${cls} bg-yellow-500/20 text-yellow-400`}>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      </span>
    );
  }
  if (type.startsWith("match_")) {
    return (
      <span className={`${cls} bg-green-500/20 text-green-400`}>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }
  // wallet
  return (
    <span className={`${cls} bg-purple-500/20 text-purple-400`}>
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
        <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
      </svg>
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  notification: Notification;
  onRead: (id: string) => void;
  onClose: () => void;
}

export function NotificationItem({ notification, onRead, onClose }: Props) {
  const href = getRoute(notification.type, notification.metadata);

  const handleClick = () => {
    if (!notification.read) onRead(notification.id);
    onClose();
  };

  return (
    <div className={`relative flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors ${!notification.read ? "bg-white/[0.03]" : ""}`}>
      {!notification.read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-orange-400" />
      )}
      <TypeIcon type={notification.type} />
      <Link href={href} onClick={handleClick} className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${notification.read ? "text-gray-300" : "text-white font-medium"}`}>
          {notification.title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{notification.body}</p>
        <p className="text-xs text-gray-600 mt-1">{timeAgo(notification.createdAt)}</p>
      </Link>
      {!notification.read && (
        <button
          onClick={(e) => { e.stopPropagation(); onRead(notification.id); }}
          className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors mt-0.5"
          aria-label="Mark as read"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
