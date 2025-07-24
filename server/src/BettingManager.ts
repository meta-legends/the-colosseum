import { PrismaClient, Battle, BattleType, Bet } from '@prisma/client';
import BigNumber from './utils/bignumber';
import { MarketMakingEngine } from './MarketMakingEngine';
import { BOOTSTRAP_LIQUIDITY, SAFETY_BUFFER } from './constants';

const prisma = new PrismaClient();

export class BettingManager {

  /**
   * Validates if a new bet can be accepted based on liquidity constraints.
   * @param battle - The battle object.
   * @param characterId - The ID of the character being bet on.
   * @param amount - The amount of the bet.
   * @param odds - The current odds for this character.
   * @param pools - The current betting pools for the battle.
   * @returns A boolean indicating if the bet is valid.
   */
  private static async isBetValid(
    battle: Battle,
    characterId: string,
    amount: BigNumber,
    odds: BigNumber,
    pools: Map<string, BigNumber>
  ): Promise<boolean> {
    const netPayout = amount.times(odds);
    const requiredLiquidity = netPayout.minus(amount);

    let opposingVolume: BigNumber;
    const totalVolume = Array.from(pools.values()).reduce((sum, vol) => sum.plus(vol), new BigNumber(0));

    // COLD START LOGIC: If the market is empty, use bootstrap liquidity.
    if (totalVolume.isZero()) {
      opposingVolume = BOOTSTRAP_LIQUIDITY;
    } else {
      // NORMAL LOGIC: Use real liquidity from the opposing pool.
      if (battle.type === BattleType.TEAM_BATTLE) {
        const opposingCharacterId = Array.from(pools.keys()).find(id => id !== characterId);
        opposingVolume = pools.get(opposingCharacterId!) || new BigNumber(0);
      } else { // BATTLE_ROYALE
        const currentCharacterVolume = pools.get(characterId) || new BigNumber(0);
        opposingVolume = totalVolume.minus(currentCharacterVolume);
      }
    }

    const availableLiquidity = opposingVolume.times(SAFETY_BUFFER);

    return requiredLiquidity.isLessThanOrEqualTo(availableLiquidity);
  }

  /**
   * Gets the current odds for a specific battle.
   * @param battleId - The ID of the battle.
   * @returns A map of characterId to their current odds.
   */
  static async getOdds(battleId: string): Promise<Map<string, BigNumber>> {
    const battle = await prisma.battle.findUnique({
      where: { id: battleId },
      include: { participants: true, bettingPools: true },
    });

    if (!battle) {
      throw new Error('Battle not found');
    }

    const pools = new Map<string, BigNumber>();
    battle.participants.forEach(p => {
      const pool = battle.bettingPools.find(bp => bp.characterId === p.id);
      pools.set(p.id, pool ? new BigNumber(pool.totalVolume.toString()) : new BigNumber(0));
    });

    if (battle.type === 'TEAM_BATTLE') {
      if (battle.participants.length !== 2) throw new Error("Team battle must have exactly 2 participants");
      
      const pool_a = battle.bettingPools.find(p => p.characterId === battle.participants[0].id)?.totalVolume ?? 0;
      const pool_b = battle.bettingPools.find(p => p.characterId === battle.participants[1].id)?.totalVolume ?? 0;

      const { odds_a, odds_b } = MarketMakingEngine.calculateTeamBattleOdds(
        new BigNumber(pool_a.toString()),
        new BigNumber(pool_b.toString())
      );

      const oddsMap = new Map<string, BigNumber>();
      oddsMap.set(battle.participants[0].id, odds_a);
      oddsMap.set(battle.participants[1].id, odds_b);
      return oddsMap;
    } else {
      return MarketMakingEngine.calculateBattleRoyaleOdds(pools);
    }
  }

  /**
   * Places a bet for a user on a specific character in a battle.
   * @param userId - The ID of the user placing the bet.
   * @param battleId - The ID of the battle.
   * @param characterId - The ID of the character to bet on.
   * @param amount - The amount to bet.
   * @returns The newly created Bet object.
   */
  static async placeBet(
    userId: string,
    battleId: string,
    characterId: string,
    amount: BigNumber
  ): Promise<Bet> {
    
    return prisma.$transaction(async (tx) => {
      // 1. Fetch battle data and check time
      const battle = await tx.battle.findUnique({ where: { id: battleId }, include: { participants: true, bettingPools: true } });
      if (!battle) throw new Error("Battle not found");

      const now = new Date();
      const twoMinutesBeforeStart = new Date(battle.startTime.getTime() - 2 * 60 * 1000);

      if (now >= twoMinutesBeforeStart) {
        throw new Error("Betting is closed for this battle. The fight is about to start.");
      }

      // 2. Fetch user data
      const user = await tx.user.findUnique({ where: { id: userId } });

      if (!user) throw new Error("User not found");
      if (battle.status !== 'ACTIVE') throw new Error("Betting is not active for this battle");
      if (!battle.participants.some(p => p.id === characterId)) throw new Error("Character is not a participant in this battle");
      
      const userBalance = new BigNumber(user.balance.toString());
      if (userBalance.isLessThan(amount)) {
        throw new Error("Insufficient balance");
      }

      // 3. Get current odds
      const currentOdds = await this.getOdds(battleId);
      const oddsForCharacter = currentOdds.get(characterId);
      if (!oddsForCharacter) throw new Error("Could not calculate odds for the selected character");

      // 4. Validate the bet
      const pools = new Map<string, BigNumber>();
      battle.participants.forEach(p => {
        const pool = battle.bettingPools.find(bp => bp.characterId === p.id);
        pools.set(p.id, pool ? new BigNumber(pool.totalVolume.toString()) : new BigNumber(0));
      });

      const isValid = await this.isBetValid(battle, characterId, amount, oddsForCharacter, pools);
      if (!isValid) {
        throw new Error("Bet is not valid due to liquidity constraints");
      }

      // 5. Execute the bet
      // a. Debit user's balance
      const newBalance = userBalance.minus(amount);
      await tx.user.update({
        where: { id: userId },
        data: { balance: newBalance.toString() },
      });

      // b. Create the bet record
      const newBet = await tx.bet.create({
        data: {
          userId,
          battleId,
          characterId,
          amount: amount.toString(),
          odds: oddsForCharacter.toString(),
          status: 'PENDING',
        }
      });

      // c. Update the betting pool volume
      await tx.bettingPool.upsert({
        where: { battleId_characterId: { battleId, characterId } },
        update: { totalVolume: { increment: amount.toString() } },
        create: { battleId, characterId, totalVolume: amount.toString() },
      });

      return newBet;
    });
  }
} 