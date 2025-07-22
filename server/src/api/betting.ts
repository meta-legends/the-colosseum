import express from 'express';
import { BettingManager } from '../BettingManager';
import BigNumber from '../utils/bignumber';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/battles/current
router.get('/battles/current', async (req, res) => {
  try {
    const battle = await prisma.battle.findFirst({
      where: { status: { in: ['PENDING', 'ACTIVE'] } },
      orderBy: { startTime: 'asc' },
      include: { participants: true },
    });
    if (battle) {
      res.json(battle);
    } else {
      res.status(404).json({ error: 'No active battle found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch current battle' });
  }
});

// GET /api/battles/:battleId/bets?userId=...
router.get('/battles/:battleId/bets', async (req, res) => {
  try {
    const { battleId } = req.params;
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'A userId query parameter is required.' });
    }

    const bets = await prisma.bet.findMany({
      where: {
        battleId: battleId,
        userId: userId,
      },
      include: {
        character: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(bets);
  } catch (error) {
    console.error('Failed to fetch user bets:', error);
    res.status(500).json({ error: 'Failed to fetch user bets' });
  }
});


// GET /api/battles/:battleId/odds
router.get('/battles/:battleId/odds', async (req, res) => {
  try {
    const { battleId } = req.params;
    const oddsMap = await BettingManager.getOdds(battleId);
    // Convert map to a plain object for JSON serialization
    const oddsObject = Object.fromEntries(oddsMap.entries());
    res.json(oddsObject);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
  }
});

// POST /api/battles/:battleId/bet
router.post('/battles/:battleId/bet', async (req, res) => {
  try {
    const { battleId } = req.params;
    const { userId, characterId, amount } = req.body;

    if (!userId || !characterId || !amount) {
      return res.status(400).json({ error: 'Missing required fields: userId, characterId, amount' });
    }

    const betAmount = new BigNumber(amount);
    const newBet = await BettingManager.placeBet(userId, battleId, characterId, betAmount);
    
    res.status(201).json(newBet);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
  }
});

export default router;