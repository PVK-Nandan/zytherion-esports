import { Prisma } from "@prisma/client";

const DEFAULT_POINTS = { first: 10, second: 6, third: 3, killPoint: 1 };

type PointsConfig = typeof DEFAULT_POINTS;

function resolveConfig(raw: Prisma.JsonValue): PointsConfig {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...DEFAULT_POINTS, ...(raw as Partial<PointsConfig>) };
  }
  return { ...DEFAULT_POINTS };
}

export async function upsertLeaderboardOnApproval(
  tx: Prisma.TransactionClient,
  params: {
    tournamentId: string;
    winnerTeamId: string;
    loserTeamId: string;
    winnerKills: number;
    loserKills: number;
    pointsConfig: Prisma.JsonValue;
  }
): Promise<void> {
  const cfg = resolveConfig(params.pointsConfig);

  const winnerPoints = cfg.first + params.winnerKills * cfg.killPoint;
  const loserPoints = cfg.second + params.loserKills * cfg.killPoint;

  await Promise.all([
    tx.leaderboardEntry.upsert({
      where: { tournamentId_teamId: { tournamentId: params.tournamentId, teamId: params.winnerTeamId } },
      create: {
        tournamentId: params.tournamentId,
        teamId: params.winnerTeamId,
        points: winnerPoints,
        kills: params.winnerKills,
        matchesPlayed: 1,
      },
      update: {
        points: { increment: winnerPoints },
        kills: { increment: params.winnerKills },
        matchesPlayed: { increment: 1 },
      },
    }),
    tx.leaderboardEntry.upsert({
      where: { tournamentId_teamId: { tournamentId: params.tournamentId, teamId: params.loserTeamId } },
      create: {
        tournamentId: params.tournamentId,
        teamId: params.loserTeamId,
        points: loserPoints,
        kills: params.loserKills,
        matchesPlayed: 1,
      },
      update: {
        points: { increment: loserPoints },
        kills: { increment: params.loserKills },
        matchesPlayed: { increment: 1 },
      },
    }),
  ]);
}
