"use client";

import { SignedIn, UserButton } from "@clerk/nextjs";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { InvitationBadge } from "@/components/teams/InvitationBadge";

export function HeaderAuth() {
  return (
    <SignedIn>
      <NotificationBell />
      <InvitationBadge />
      <UserButton afterSignOutUrl="/" />
    </SignedIn>
  );
}
