-- AlterEnum: add prize_credit to TransactionType
ALTER TYPE "TransactionType" ADD VALUE 'prize_credit';

-- AlterTable: add prizeDistribution to Tournament
ALTER TABLE "Tournament" ADD COLUMN "prizeDistribution" JSONB;
