import { PrismaClient, Bet, BetStatus, Battle, Character, User, BattleStatus } from '@prisma/client';
import BigNumber from './utils/bignumber';
import { F_PLATFORM_IMMEDIATE, F_PLATFORM_PENDING } from './constants';

const prisma = new PrismaClient();
const F_PLATFORM = F_PLATFORM_IMMEDIATE.plus(F_PLATFORM_PENDING);

/**
 * Manages the logic for the simplified Parimutuel (MVP) betting system.
 */
export class MvpBettingManager {
  /**
   * Places a bet for a user in a Parimutuel battle.
   */
  static async placeBet(
    userId: string,
    battleId: string,
    characterId: string,
    amount: BigNumber
  ): Promise<Bet> {
    
    return prisma.$transaction(async (tx) => {
      // 1. Fetch all necessary data
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

      // 2. Check for opposing liquidity
      const opposingCharacterId = battle.participants.find(p => p.id !== characterId)?.id;
      if (!opposingCharacterId) throw new Error("Opposing character not found");
      
      const opposingPool = battle.bettingPools.find(p => p.characterId === opposingCharacterId);
      const opposingLiquidityExists = opposingPool && new BigNumber(opposingPool.totalVolume.toString()).isGreaterThan(0);

      const poolContribution = amount.minus(amount.times(F_PLATFORM));
      let betStatus: BetStatus;
      
      if (opposingLiquidityExists) {
        betStatus = 'ACTIVE';
        const pendingBetsToActivate = await tx.bet.findMany({
          where: { battleId, status: 'PENDING_LIQUIDITY' }
        });

        if (pendingBetsToActivate.length > 0) {
          await tx.bet.updateMany({
            where: { id: { in: pendingBetsToActivate.map(b => b.id) } },
            data: { status: 'ACTIVE' },
          });
        }
      } else {
        if (amount.isGreaterThan(1000)) throw new Error("First bet cannot exceed 1000 points.");
        betStatus = 'PENDING_LIQUIDITY';
      }

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
      if (battle.status !== 'PENDING') throw new Error("Battle has already been settled.");

      // 1. Refund PENDING_LIQUIDITY bets
      const pendingBets = battle.bets.filter(b => b.status === 'PENDING_LIQUIDITY');
      for (const bet of pendingBets) {
        const betAmount = new BigNumber(bet.amount.toString());
        const refundAmount = betAmount.minus(betAmount.times(F_PLATFORM_IMMEDIATE));
        const contributionToRemove = betAmount.minus(betAmount.times(F_PLATFORM));

        await tx.user.update({
          where: { id: bet.userId },
          data: { balance: { increment: refundAmount.toString() } },
        });

        await tx.bettingPool.update({
            where: { battleId_characterId: { battleId, characterId: bet.characterId } },
            data: { totalVolume: { decrement: contributionToRemove.toString() } },
        });

        await tx.bet.update({ where: { id: bet.id }, data: { status: 'CANCELLED' } });
      }

      // 2. Payout ACTIVE bets
      const activeBets = battle.bets.filter(b => b.status === 'ACTIVE');
      if (activeBets.length > 0) {
        const totalPot = battle.bettingPools.reduce(
          (sum, pool) => sum.plus(new BigNumber(pool.totalVolume.toString())),
          new BigNumber(0)
        );

        const winningBets = activeBets.filter(b => b.characterId === winningCharacterId);
        const losingBets = activeBets.filter(b => b.characterId !== winningCharacterId);
        
        const totalWageredOnWinner = winningBets.reduce(
          (sum, bet) => sum.plus(new BigNumber(bet.amount.toString())),
          new BigNumber(0)
        );

        if (totalWageredOnWinner.isGreaterThan(0)) {
            for (const bet of winningBets) {
                const betAmount = new BigNumber(bet.amount.toString());
                const payoutRatio = betAmount.dividedBy(totalWageredOnWinner);
                const payoutAmount = payoutRatio.times(totalPot);

                await tx.user.update({
                    where: { id: bet.userId },
                    data: { balance: { increment: payoutAmount.toString() } },
                });
                await tx.bet.update({ where: { id: bet.id }, data: { status: 'WON' } });
            }
        }

        for (const bet of losingBets) {
          await tx.bet.update({ where: { id: bet.id }, data: { status: 'LOST' } });
        }
      }

      // 3. Mark battle as complete
      await tx.battle.update({ where: { id: battleId }, data: { status: 'COMPLETED', winnerId: winningCharacterId } });
    });
  }
} 