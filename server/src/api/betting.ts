import prisma from '../db';
import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { getBettingLocked, triggerOddsRecalculation } from '../betting';


export default (io: Server) => {
  const router = Router();

  // GET /battle/current
  router.get('/battle/current', async (req: Request, res: Response) => {
  try {
    const battle = await prisma.battle.findFirst({
      where: {
        status: {
          in: ['ACTIVE', 'PENDING'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(battle);
  } catch (error) {
    console.error('Failed to fetch current battle', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// POST /bet
  // POST /bet
  router.post('/bet', async (req: Request, res: Response) => {
    if (getBettingLocked()) {
      return res.status(400).json({ error: 'Betting is currently locked' });
    }

    const { userId, battleId, constituent, amount } = req.body;

    if (!userId || !battleId || !constituent || amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const battle = await prisma.battle.findUnique({
        where: { id: battleId },
      });

      if (!battle || (battle.status !== 'ACTIVE' && battle.status !== 'PENDING')) {
        return res.status(400).json({ error: 'Battle not open for betting' });
      }

      const newBet = await prisma.bet.create({
        data: {
          userId,
          battleId,
          constituent,
          amount: parseFloat(amount),
        },
      });

      await triggerOddsRecalculation(io, battleId);

      res.status(201).json(newBet);
  } catch (error) {
    console.error('Failed to place bet', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
  });

  return router;
};