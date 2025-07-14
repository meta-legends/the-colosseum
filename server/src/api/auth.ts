import prisma from '../db';
import { Router, Request, Response } from 'express';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress is required' });
  }

  try {
    let user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { walletAddress },
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Login/create user failed', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

export default router;