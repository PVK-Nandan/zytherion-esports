export interface TeamMember {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: "owner" | "member";
  joinedAt: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  ownerId: string;
  maxMembers: number;
  createdAt: string;
  memberCount: number;
}

export interface TeamWithRoster extends Team {
  members: TeamMember[];
}

export interface Invitation {
  id: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
  teamLogoUrl: string | null;
  invitedByUsername: string;
  expiresAt: string;
  createdAt: string;
}

export interface CreateTeamPayload {
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
}

export interface UpdateTeamPayload {
  name?: string;
  description?: string;
  logoUrl?: string;
}
