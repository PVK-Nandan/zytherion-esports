-- Add pointsConfig to Tournament
ALTER TABLE "Tournament" ADD COLUMN "pointsConfig" JSONB NOT NULL DEFAULT '{}';

-- Add kills tracking to MatchResult
ALTER TABLE "MatchResult" ADD COLUMN "winnerKills" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchResult" ADD COLUMN "loserKills" INTEGER NOT NULL DEFAULT 0;

-- Create LeaderboardEntry table
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaderboardEntry_tournamentId_teamId_key" ON "LeaderboardEntry"("tournamentId", "teamId");
CREATE INDEX "LeaderboardEntry_tournamentId_points_idx" ON "LeaderboardEntry"("tournamentId", "points" DESC);

ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
