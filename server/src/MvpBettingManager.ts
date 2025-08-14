import { Bet, BetStatus, BattleStatus } from '@prisma/client';
import BigNumber from './utils/bignumber';
import { F_HOUSE, F_PLATFORM_IMMEDIATE } from './constants';
import { prisma } from './db';

/**
 * Manages the logic for the simplified Parimutuel (MVP) betting system.
 */
export class MvpBettingManager {
  /**
   * Places a bet for a user in a Parimutuel battle using the Split-Fee Refund model.
   */
  static async placeBet(
    userId: string,
    battleId: string,
    characterId: string,
    amount: BigNumber
  ): Promise<Bet> {
    
    return prisma.$transaction(async (tx) => {
      // 1. Fetch data and perform initial checks
      const user = await tx.user.findUnique({ where: { id: userId } });
      const battle = await tx.battle.findUnique({
        where: { id: battleId },
        include: { participants: true, bettingPools: true },
      });

      if (!user || !battle) throw new Error("User or Battle not found");
      
      const now = new Date();
      const twoMinutesBeforeStart = new Date(battle.startTime.getTime() - 2 * 60 * 1000);
      if (now >= twoMinutesBeforeStart) throw new Error("Betting is closed for this battle.");
      
      const userBalance = new BigNumber(user.balance.toString());
      if (userBalance.isLessThan(amount)) throw new Error("Insufficient balance");

      // 2. Determine bet status based on opposing liquidity
      const opposingCharacterId = battle.participants.find(p => p.id !== characterId)?.id;
      if (!opposingCharacterId) throw new Error("Opposing character not found");
      
      const opposingPool = battle.bettingPools.find(p => p.characterId === opposingCharacterId);
      const opposingLiquidityExists = opposingPool && new BigNumber(opposingPool.totalVolume.toString()).isGreaterThan(0);

      const poolContribution = amount.minus(amount.times(F_HOUSE));
      let betStatus: BetStatus = BetStatus.PENDING_LIQUIDITY;
      
      if (opposingLiquidityExists) {
        betStatus = BetStatus.PENDING; // Use PENDING for active, unsettled bets
        // Activate all previously pending bets for this battle
        await tx.bet.updateMany({
          where: { battleId, status: BetStatus.PENDING_LIQUIDITY },
          data: { status: BetStatus.PENDING },
        });
      } else {
        // This is the first bet on this side of the market
        if (amount.isGreaterThan(1000)) throw new Error("First bet on a market side cannot exceed 1000 points.");
        betStatus = BetStatus.PENDING_LIQUIDITY;
      }

      // 3. Execute database operations
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: amount.toString() } },
      });

      const newBet = await tx.bet.create({
        data: {
          userId,
          battleId,
          characterId,
          amount: amount.toString(),
          odds: 1, 
          status: betStatus,
        }
      });

      await tx.bettingPool.upsert({
        where: { battleId_characterId: { battleId, characterId } },
        update: { totalVolume: { increment: poolContribution.toString() } },
        create: { battleId, characterId, totalVolume: poolContribution.toString() },
      });

      return newBet;
    });
  }

  /**
   * Settles a finished Parimutuel battle, refunding pending bets and paying out winners.
   */
  static async settleBattle(battleId: string, winningCharacterId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const battle = await tx.battle.findUnique({
        where: { id: battleId },
        include: { bets: true, bettingPools: true },
      });

      if (!battle) throw new Error("Battle not found for settlement.");
      if (battle.status !== BattleStatus.ACTIVE) throw new Error("Battle is not active or has already been settled.");

      // 1. Refund PENDING_LIQUIDITY bets
      const pendingBets = battle.bets.filter(b => b.status === BetStatus.PENDING_LIQUIDITY);
      for (const bet of pendingBets) {
        const betAmount = new BigNumber(bet.amount.toString());
        const refundAmount = betAmount.minus(betAmount.times(F_PLATFORM_IMMEDIATE));
        
        await tx.user.update({
          where: { id: bet.userId },
          data: { balance: { increment: refundAmount.toString() } },
        });

        const contributionToRemove = betAmount.minus(betAmount.times(F_HOUSE));
        await tx.bettingPool.update({
            where: { battleId_characterId: { battleId, characterId: bet.characterId } },
            data: { totalVolume: { decrement: contributionToRemove.toString() } },
        });

        await tx.bet.update({ where: { id: bet.id }, data: { status: BetStatus.CANCELLED } });
      }

      // 2. Payout PENDING bets
      const activeBets = battle.bets.filter(b => b.status === BetStatus.PENDING);
      const winningBets = activeBets.filter(b => b.characterId === winningCharacterId);
      const losingBets = activeBets.filter(b => b.characterId !== winningCharacterId);

      if (winningBets.length > 0 && losingBets.length > 0) {
        // Pools are tracked net of fees. Use net pools for pro‑rata and return only net stakes.
        const totalLosingNetPool = battle.bettingPools
          .filter(p => p.characterId !== winningCharacterId)
          .reduce((sum, pool) => sum.plus(new BigNumber(pool.totalVolume.toString())), new BigNumber(0));

        const winningPool = battle.bettingPools.find(p => p.characterId === winningCharacterId);
        const totalWinningNetPool = winningPool
          ? new BigNumber(winningPool.totalVolume.toString())
          : new BigNumber(0);

        if (totalWinningNetPool.isGreaterThan(0)) {
          for (const bet of winningBets) {
            const grossBetAmount = new BigNumber(bet.amount.toString());
            const netBetAmount = grossBetAmount.minus(grossBetAmount.times(F_HOUSE));
            const proRataShare = netBetAmount.dividedBy(totalWinningNetPool);
            const winningsFromLosers = proRataShare.times(totalLosingNetPool);
            const payoutAmount = netBetAmount.plus(winningsFromLosers);

            await tx.user.update({
              where: { id: bet.userId },
              data: { balance: { increment: payoutAmount.toString() } },
            });
            await tx.bet.update({ where: { id: bet.id }, data: { status: BetStatus.WON } });
          }
        }
      } else if (winningBets.length > 0 && losingBets.length === 0) {
        // Everyone bet on the winner: return only net stakes (fees are not returned)
        for (const bet of winningBets) {
          const grossBetAmount = new BigNumber(bet.amount.toString());
          const netBetAmount = grossBetAmount.minus(grossBetAmount.times(F_HOUSE));
          await tx.user.update({
            where: { id: bet.userId },
            data: { balance: { increment: netBetAmount.toString() } },
          });
          await tx.bet.update({ where: { id: bet.id }, data: { status: BetStatus.WON } });
        }
      }

      for (const bet of losingBets) {
        await tx.bet.update({ where: { id: bet.id }, data: { status: BetStatus.LOST } });
      }

      // 3. Mark battle as complete
      await tx.battle.update({ where: { id: battleId }, data: { status: BattleStatus.FINISHED, winnerId: winningCharacterId } });
    });
  }
} 