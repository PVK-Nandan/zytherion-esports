import { apiRequest } from "./api";
import type {
  Team,
  TeamWithRoster,
  TeamMember,
  CreateTeamPayload,
  UpdateTeamPayload,
  Invitation,
} from "@/types/team";

export function createTeam(payload: CreateTeamPayload, token: string) {
  return apiRequest<Team>("/teams", {
    method: "POST",
    body: JSON.stringify(payload),
    token,
  });
}

export function getTeamBySlug(slug: string) {
  return apiRequest<TeamWithRoster>(`/teams/${slug}`);
}

export function updateTeam(id: string, payload: UpdateTeamPayload, token: string) {
  return apiRequest<Team>(`/teams/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    token,
  });
}

export function deleteTeam(id: string, token: string) {
  return apiRequest<void>(`/teams/${id}`, { method: "DELETE", token });
}

export function getTeamMembers(id: string, token: string) {
  return apiRequest<TeamMember[]>(`/teams/${id}/members`, { token });
}

export function kickMember(teamId: string, userId: string, token: string) {
  return apiRequest<void>(`/teams/${teamId}/members/${userId}`, {
    method: "DELETE",
    token,
  });
}

export function invitePlayer(teamId: string, username: string, token: string) {
  return apiRequest<Invitation>(`/teams/${teamId}/invitations`, {
    method: "POST",
    body: JSON.stringify({ username }),
    token,
  });
}

export function getMyInvitations(token: string) {
  return apiRequest<Invitation[]>("/users/me/invitations", { token });
}

export function acceptInvitation(id: string, token: string) {
  return apiRequest<void>(`/invitations/${id}/accept`, { method: "POST", token });
}

export function declineInvitation(id: string, token: string) {
  return apiRequest<void>(`/invitations/${id}/decline`, { method: "POST", token });
}
