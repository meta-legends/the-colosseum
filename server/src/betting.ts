import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let bettingLocked = false;

const recalculateOdds = async (io: Server, battleId: string) => {
  const bets = await prisma.bet.findMany({ where: { battleId } });
  const poolA = bets.filter(b => b.constituent === 'A').reduce((acc, b) => acc + b.amount, 0);
  const poolB = bets.filter(b => b.constituent === 'B').reduce((acc, b) => acc + b.amount, 0);

  const totalPool = poolA + poolB;
  const oddsA = totalPool > 0 ? totalPool / poolA : 1;
  const oddsB = totalPool > 0 ? totalPool / poolB : 1;

  io.emit('oddsUpdate', {
    battleId,
    poolA,
    poolB,
    oddsA: isFinite(oddsA) ? oddsA : 1,
    oddsB: isFinite(oddsB) ? oddsB : 1,
  });
};

export const initializeBetting = (io: Server) => {
  // We need a way to trigger this from the API route
};

export const triggerOddsRecalculation = async (io: Server, battleId: string) => {
  await recalculateOdds(io, battleId);
};

export const getBettingLocked = () => bettingLocked;

const setupBettingLockTimer = (io: Server) => {
  setInterval(async () => {
    const battle = await prisma.battle.findFirst({
      where: { status: { in: ['ACTIVE', 'PENDING'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (battle) {
      const now = new Date();
      const startTime = new Date(battle.startTime);
      const diff = startTime.getTime() - now.getTime();

      if (diff <= 30000 && !bettingLocked) {
        bettingLocked = true;
        io.emit('bettingLocked', { battleId: battle.id });
        console.log(`Betting locked for battle ${battle.id}`);
      } else if (diff > 30000 && bettingLocked) {
        bettingLocked = false; // Reset for next battle
        console.log(`Betting unlocked for battle ${battle.id}`);
      }
    }
  }, 5000); // Check every 5 seconds
};

export default (io: Server) => {
  initializeBetting(io);
  setupBettingLockTimer(io);
};