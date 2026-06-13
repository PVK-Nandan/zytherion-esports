import { NotificationType, Prisma } from "@prisma/client";
import { Resend } from "resend";
import { prisma } from "../lib/prisma";

const resend = process.env["RESEND_API_KEY"]
  ? new Resend(process.env["RESEND_API_KEY"])
  : null;

const FROM_ADDRESS = "Zytaa <notifications@zytaa.gg>";
const APP_URL = process.env["APP_URL"] ?? "https://zytaa.gg";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  sendEmail(input.userId, input.type, input.title, input.body, input.metadata ?? {}).catch(
    (err) => console.error("[notifications] email send failed:", err),
  );

  return notification;
}

const EMAIL_TYPES = new Set<NotificationType>([
  "tournament_registration_confirmed",
  "match_result_approved",
  "wallet_deposit_completed",
  "wallet_withdrawal_completed",
  "wallet_withdrawal_failed",
]);

async function sendEmail(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  metadata: Record<string, unknown>,
) {
  if (!resend || !EMAIL_TYPES.has(type)) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, username: true },
  });
  if (!user) return;

  const html = buildEmailHtml(title, body, type, metadata);

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: user.email,
    subject: title,
    html,
  });
}

function buildEmailHtml(
  title: string,
  body: string,
  type: NotificationType,
  metadata: Record<string, unknown>,
): string {
  const tournamentId = typeof metadata["tournamentId"] === "string" ? metadata["tournamentId"] : "";
  const matchId = typeof metadata["matchId"] === "string" ? metadata["matchId"] : "";
  const ctaMap: Partial<Record<NotificationType, { label: string; path: string }>> = {
    tournament_registration_confirmed: { label: "View Tournament", path: `/tournaments/${tournamentId}` },
    match_result_approved: { label: "View Match", path: `/matches/${matchId}` },
    wallet_deposit_completed: { label: "View Wallet", path: "/wallet" },
    wallet_withdrawal_completed: { label: "View Wallet", path: "/wallet" },
    wallet_withdrawal_failed: { label: "View Wallet", path: "/wallet" },
  };

  const cta = ctaMap[type];
  const ctaHtml = cta
    ? `<p style="text-align:center;margin:24px 0;">
        <a href="${APP_URL}${cta.path}"
           style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
          ${cta.label}
        </a>
       </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#1a1a2e;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#7c3aed;padding:20px 32px;">
              <p style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Zytaa</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;color:#fff;font-size:20px;font-weight:600;">${title}</h1>
              <p style="margin:0 0 20px;color:#a1a1aa;font-size:15px;line-height:1.6;">${body}</p>
              ${ctaHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #2d2d3a;">
              <p style="margin:0;color:#52525b;font-size:12px;">
                You received this because you have an account on
                <a href="${APP_URL}" style="color:#7c3aed;text-decoration:none;">Zytaa</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const notifications = {
  teamInvitation: (userId: string, teamName: string, teamId: string) =>
    createNotification({
      userId,
      type: "team_invitation_received",
      title: `You've been invited to join ${teamName}`,
      body: `You have a pending invitation to join the team "${teamName}". Accept or decline from your team settings.`,
      metadata: { teamId },
    }),

  tournamentRegistered: (userId: string, tournamentName: string, tournamentId: string) =>
    createNotification({
      userId,
      type: "tournament_registration_confirmed",
      title: "Tournament Registration Confirmed",
      body: `Your registration for "${tournamentName}" has been confirmed. Good luck!`,
      metadata: { tournamentId },
    }),

  matchResultSubmitted: (userId: string, matchId: string, opponent: string) =>
    createNotification({
      userId,
      type: "match_result_submitted",
      title: "Match Result Submitted",
      body: `A result has been submitted for your match against ${opponent}. Review and confirm.`,
      metadata: { matchId },
    }),

  matchResultApproved: (
    userId: string,
    matchId: string,
    won: boolean,
    prizeAmount?: string,
  ) => {
    const prizeText = prizeAmount ? ` You've earned ₹${prizeAmount}.` : "";
    return createNotification({
      userId,
      type: "match_result_approved",
      title: `Match Result Approved — You ${won ? "Won" : "Lost"}`,
      body: `Your match result has been approved.${prizeText}`,
      metadata: { matchId, won, prizeAmount },
    });
  },

  matchResultDisputed: (userId: string, matchId: string) =>
    createNotification({
      userId,
      type: "match_result_disputed",
      title: "Match Result Disputed",
      body: "A dispute has been raised for your recent match. Our team will review and resolve it shortly.",
      metadata: { matchId },
    }),

  walletDeposit: (userId: string, amount: string) =>
    createNotification({
      userId,
      type: "wallet_deposit_completed",
      title: "Deposit Successful",
      body: `₹${amount} has been added to your Zytaa wallet.`,
      metadata: { amount },
    }),

  walletWithdrawalCompleted: (userId: string, amount: string) =>
    createNotification({
      userId,
      type: "wallet_withdrawal_completed",
      title: "Withdrawal Successful",
      body: `₹${amount} has been withdrawn from your Zytaa wallet.`,
      metadata: { amount },
    }),

  walletWithdrawalFailed: (userId: string, amount: string, reason?: string) =>
    createNotification({
      userId,
      type: "wallet_withdrawal_failed",
      title: "Withdrawal Failed",
      body: reason
        ? `Your withdrawal of ₹${amount} failed: ${reason}`
        : `Your withdrawal of ₹${amount} could not be processed. Please try again.`,
      metadata: { amount, reason },
    }),
};
