export interface Tournament {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  game: string;
  format: "scrim" | "tournament";
  bracketType: string;
  status: "draft" | "registration_open" | "registration_closed" | "in_progress" | "completed" | "cancelled";
  maxTeams: number;
  entryFeeInr: number;
  prizePoolInr: number;
  registeredTeamsCount: number;
  startsAt?: string | null;
  endsAt?: string | null;
  registrationStartsAt?: string | null;
  registrationEndsAt?: string | null;
  createdAt: string;
}

export interface TournamentsResponse {
  data: Tournament[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
