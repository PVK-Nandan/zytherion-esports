-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'team_invitation_received',
  'tournament_registration_confirmed',
  'match_result_submitted',
  'match_result_approved',
  'match_result_disputed',
  'wallet_deposit_completed',
  'wallet_withdrawal_completed',
  'wallet_withdrawal_failed'
);

-- CreateTable
CREATE TABLE "Notification" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "type"      "NotificationType" NOT NULL,
    "title"     TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "metadata"  JSONB NOT NULL DEFAULT '{}',
    "read"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
