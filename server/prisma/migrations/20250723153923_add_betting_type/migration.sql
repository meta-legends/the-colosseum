-- CreateEnum
CREATE TYPE "BettingType" AS ENUM ('AMM', 'PARIMUTUEL');

-- AlterTable
ALTER TABLE "Battle" ADD COLUMN     "bettingType" "BettingType" NOT NULL DEFAULT 'PARIMUTUEL';
