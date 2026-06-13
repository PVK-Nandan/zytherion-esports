-- AlterTable: add isAdmin to User
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterEnum: add disputed to MatchStatus
ALTER TYPE "MatchStatus" ADD VALUE 'disputed';

-- CreateEnum: MatchResultStatus
CREATE TYPE "MatchResultStatus" AS ENUM ('pending_review', 'approved', 'rejected', 'disputed');

-- CreateTable: MatchResult
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "winnerTeamId" TEXT NOT NULL,
    "status" "MatchResultStatus" NOT NULL DEFAULT 'pending_review',
    "adminNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MatchScreenshot
CREATE TABLE "MatchScreenshot" (
    "id" TEXT NOT NULL,
    "matchResultId" TEXT NOT NULL,
    "cloudinaryUrl" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchResult_matchId_status_idx" ON "MatchResult"("matchId", "status");

-- CreateIndex
CREATE INDEX "MatchResult_status_createdAt_idx" ON "MatchResult"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MatchScreenshot_matchResultId_idx" ON "MatchScreenshot"("matchResultId");

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchScreenshot" ADD CONSTRAINT "MatchScreenshot_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "MatchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
