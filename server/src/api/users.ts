import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// This is a helper endpoint for testing purposes only.
// It retrieves the test user created by the seed script.
router.get('/users/test-user', async (req, res) => {
  try {
    const testUser = await prisma.user.findUnique({
      where: { walletAddress: '0xTEST_WALLET_ADDRESS' },
    });

    if (testUser) {
      // Return a simplified user object for the client
      res.json({
        id: testUser.id,
        walletAddress: testUser.walletAddress,
        balance: testUser.balance,
      });
    } else {
      res.status(404).json({ error: 'Test user not found. Please seed the database.' });
    }
  } catch (error) {
    console.error('Failed to fetch test user:', error);
    res.status(500).json({ error: 'Failed to fetch test user' });
  }
});

export default router; 