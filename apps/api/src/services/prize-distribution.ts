import { Prisma } from "@prisma/client";

/**
 * prize_distribution format: { "1": 50, "2": 30, "3": 20 }
 * Keys are finish positions as strings; values are percentage of prize pool (0-100).
 * Percentages need not sum to 100 — only defined positions are paid out.
 */
type PrizeDistributionConfig = Record<string, number>;

/**
 * Determine the finish position for the loser of a match.
 *
 * In single-elimination:
 *   - Final (round == maxRound, nextMatchId null): loser = 2nd, winner = 1st
 *   - Semi-final (round == maxRound - 1): losers = 3rd  (shared)
 *   - Quarter-final (round == maxRound - 2): losers = 5th (shared)
 *   - etc. Formula: 2^(maxRound - round) + 1
 */
function loserFinishPosition(round: number, maxRound: number): number {
  return Math.pow(2, maxRound - round) + 1;
}

/**
 * Distribute prizes for an approved match result.
 *
 * Rules:
 * - For every match: the eliminated team (loser) receives their finish-position prize.
 * - For the final only: the winning team additionally receives the 1st-place prize.
 * - Idempotency key: `match:{matchId}:prize:{finishPosition}:{userId}`
 * - Uses upsert so double-calling for the same match is safe.
 */
export async function distributePrizes(
  matchId: string,
  winnerTeamId: string,
  loserTeamId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const match = await tx.tournamentMatch.findUnique({
    where: { id: matchId },
    select: {
      round: true,
      nextMatchId: true,
      tournamentId: true,
      tournament: {
        select: {
          prizePoolPaise: true,
          prizeDistribution: true,
          title: true,
        },
      },
    },
  });

  if (!match || match.tournament.prizePoolPaise === 0) return;

  const { tournament } = match;

  // Max round in this tournament bracket
  const maxRoundAgg = await tx.tournamentMatch.aggregate({
    where: { tournamentId: match.tournamentId },
    _max: { round: true },
  });
  const maxRound = maxRoundAgg._max.round ?? match.round;

  const isFinal = match.nextMatchId === null && match.round === maxRound;

  // Prize distribution config — default: 100% to 1st place (winner takes all in final)
  const dist: PrizeDistributionConfig = tournament.prizeDistribution
    ? (tournament.prizeDistribution as PrizeDistributionConfig)
    : { "1": 100 };

  const prizePoolPaise = tournament.prizePoolPaise;

  // Build list of (position, teamId) pairs to pay out this match
  const payouts: Array<{ position: number; teamId: string }> = [];

  const loserPos = isFinal ? 2 : loserFinishPosition(match.round, maxRound);
  if (dist[String(loserPos)] !== undefined) {
    payouts.push({ position: loserPos, teamId: loserTeamId });
  }

  if (isFinal && dist["1"] !== undefined) {
    payouts.push({ position: 1, teamId: winnerTeamId });
  }

  for (const { position, teamId } of payouts) {
    const percentage = dist[String(position)];
    if (!percentage || percentage <= 0) continue;

    const teamPrizePaise = Math.floor((prizePoolPaise * percentage) / 100);
    if (teamPrizePaise === 0) continue;

    const members = await tx.teamMember.findMany({
      where: { teamId },
      select: { userId: true },
    });
    if (members.length === 0) continue;

    const perMemberPaise = Math.floor(teamPrizePaise / members.length);
    if (perMemberPaise === 0) continue;

    for (const member of members) {
      const wallet = await tx.wallet.findUnique({ where: { userId: member.userId } });
      if (!wallet) continue;

      const idempotencyKey = `match:${matchId}:prize:${position}:${member.userId}`;

      await tx.walletTransaction.upsert({
        where: { idempotencyKey },
        // No-op update — existing row already credits the right amount
        update: {},
        create: {
          walletId: wallet.id,
          type: "prize_credit",
          amountPaise: perMemberPaise,
          status: "completed",
          idempotencyKey,
          description: `Prize (position ${position}) in ${tournament.title}`,
        },
      });
    }
  }
}
