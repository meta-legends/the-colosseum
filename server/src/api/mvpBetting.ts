import express from 'express';
import { MvpBettingManager } from '../MvpBettingManager';
import BigNumber from '../utils/bignumber';
import { prisma } from '../db';

const router = express.Router();

// GET /api/mvp/battles/:battleId/pools
router.get('/battles/:battleId/pools', async (req, res) => {
  try {
    const { battleId } = req.params;
    const pools = await prisma.bettingPool.findMany({
      where: { battleId },
      include: { character: { select: { name: true } } },
    });
    res.json(pools);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch betting pools' });
  }
});

// POST /api/mvp/battles/:battleId/bet
router.post('/battles/:battleId/bet', async (req, res) => {
  try {
    const { battleId } = req.params;
    const { userId, characterId, amount } = req.body;

    if (!userId || !characterId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const betAmount = new BigNumber(amount);
    const newBet = await MvpBettingManager.placeBet(userId, battleId, characterId, betAmount);
    
    res.status(201).json(newBet);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
  }
});

// POST /api/mvp/battles/:battleId/settle (For testing purposes)
router.post('/battles/:battleId/settle', async (req, res) => {
  try {
    const { battleId } = req.params;
    const { winningCharacterId } = req.body;

    if (!winningCharacterId) {
      return res.status(400).json({ error: 'Missing required field: winningCharacterId' });
    }

    await MvpBettingManager.settleBattle(battleId, winningCharacterId);
    
    res.status(200).json({ message: `Battle ${battleId} settled successfully.` });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
  }
});

export default router; 