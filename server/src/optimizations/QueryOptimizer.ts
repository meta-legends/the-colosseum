import { prisma } from '../db';
import { Battle, BettingPool, Character, Bet } from '@prisma/client';

/**
 * Query optimizer for reducing database round trips and improving performance.
 * Consolidates multiple queries into single, efficient operations.
 */
export class QueryOptimizer {
  
  /**
   * Get battle data with all related information in a single query.
   * Reduces multiple database calls to one optimized query.
   */
  static async getBattleWithDetails(battleId: string) {
    return prisma.battle.findUnique({
      where: { id: battleId },
      include: {
        participants: {
          select: {
            id: true,
            name: true,
            owner: {
              select: {
                id: true,
                username: true
              }
            }
          }
        },
        bettingPools: {
          select: {
            characterId: true,
            totalVolume: true
          }
        },
        bets: {
          select: {
            id: true,
            userId: true,
            characterId: true,
            amount: true,
            odds: true,
            status: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 100 // Limit to recent bets for performance
        }
      }
    });
  }

  /**
   * Get user data with current bets and balance in a single query.
   */
  static async getUserWithBettingInfo(userId: string, battleId?: string) {
    const whereClause: any = { userId };
    if (battleId) {
      whereClause.battleId = battleId;
    }

    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        bets: {
          where: whereClause,
          include: {
            battle: {
              select: {
                id: true,
                title: true,
                status: true,
                startTime: true
              }
            },
            character: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 50 // Limit for performance
        }
      }
    });
  }

  /**
   * Get multiple battles with minimal data for listing pages.
   */
  static async getBattlesList(status?: string[], limit: number = 20) {
    const whereClause: any = {};
    if (status && status.length > 0) {
      whereClause.status = { in: status };
    }

    return prisma.battle.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        startTime: true,
        _count: {
          select: {
            bets: true,
            participants: true
          }
        }
      },
      orderBy: { startTime: 'desc' },
      take: limit
    });
  }

  /**
   * Get betting statistics for a battle in a single query.
   */
  static async getBattleStats(battleId: string) {
    const [battle, bettingStats, recentBets] = await Promise.all([
      prisma.battle.findUnique({
        where: { id: battleId },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          startTime: true
        }
      }),
      prisma.bettingPool.groupBy({
        by: ['characterId'],
        where: { battleId },
        _sum: {
          totalVolume: true
        },
        _count: {
          totalVolume: true
        }
      }),
      prisma.bet.groupBy({
        by: ['characterId', 'status'],
        where: { battleId },
        _sum: {
          amount: true
        },
        _count: {
          amount: true
        }
      })
    ]);

    return {
      battle,
      bettingStats,
      recentBets
    };
  }

  /**
   * Batch update multiple betting pools efficiently.
   */
  static async batchUpdateBettingPools(updates: Array<{
    battleId: string;
    characterId: string;
    volumeChange: string;
  }>) {
    if (updates.length === 0) return [];

    const results = await Promise.all(
      updates.map(update =>
        prisma.bettingPool.upsert({
          where: {
            battleId_characterId: {
              battleId: update.battleId,
              characterId: update.characterId
            }
          },
          update: {
            totalVolume: {
              increment: update.volumeChange
            }
          },
          create: {
            battleId: update.battleId,
            characterId: update.characterId,
            totalVolume: update.volumeChange
          }
        })
      )
    );

    return results;
  }

  /**
   * Get odds for multiple battles in a single query.
   */
  static async getMultipleBattlesOdds(battleIds: string[]) {
    if (battleIds.length === 0) return new Map();

    const battles = await prisma.battle.findMany({
      where: {
        id: { in: battleIds }
      },
      include: {
        participants: {
          select: { id: true, name: true }
        },
        bettingPools: {
          select: {
            characterId: true,
            totalVolume: true
          }
        }
      }
    });

    const oddsMap = new Map();
    battles.forEach(battle => {
      const pools = new Map();
      battle.participants.forEach(participant => {
        const pool = battle.bettingPools.find(bp => bp.characterId === participant.id);
        pools.set(participant.id, pool ? pool.totalVolume : '0');
      });
      oddsMap.set(battle.id, pools);
    });

    return oddsMap;
  }

  /**
   * Get user betting history with pagination.
   */
  static async getUserBettingHistory(
    userId: string,
    page: number = 1,
    pageSize: number = 20
  ) {
    const skip = (page - 1) * pageSize;

    const [bets, totalCount] = await Promise.all([
      prisma.bet.findMany({
        where: { userId },
        include: {
          battle: {
            select: {
              id: true,
              title: true,
              status: true,
              startTime: true
            }
          },
          character: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      }),
      prisma.bet.count({
        where: { userId }
      })
    ]);

    return {
      bets,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNext: page * pageSize < totalCount,
        hasPrev: page > 1
      }
    };
  }
}
