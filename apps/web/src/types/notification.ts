export type NotificationType =
  | "team_invitation_received"
  | "tournament_registration_confirmed"
  | "match_result_submitted"
  | "match_result_approved"
  | "match_result_disputed"
  | "wallet_deposit_completed"
  | "wallet_withdrawal_completed"
  | "wallet_withdrawal_failed";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}
