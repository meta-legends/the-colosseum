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
        username: testUser.username,
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

// Check if username is available
router.get('/users/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    // Basic validation
    if (!username || username.length < 3 || username.length > 20) {
      return res.status(400).json({ 
        available: false, 
        error: 'Username must be between 3 and 20 characters' 
      });
    }
    
    // Check for valid characters (alphanumeric and underscores only)
    const validPattern = /^[a-zA-Z0-9_]+$/;
    if (!validPattern.test(username)) {
      return res.status(400).json({ 
        available: false, 
        error: 'Username can only contain letters, numbers, and underscores' 
      });
    }
    
    const existingUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    
    res.json({ 
      available: !existingUser,
      username: username.toLowerCase()
    });
  } catch (error) {
    console.error('Failed to check username:', error);
    res.status(500).json({ error: 'Failed to check username availability' });
  }
});

// Update user profile (username)
router.post('/users/update-profile', async (req, res) => {
  try {
    const { walletAddress, username } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    // Validate username
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
    }
    
    const validPattern = /^[a-zA-Z0-9_]+$/;
    if (!validPattern.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }
    
    // Check if username is already taken
    const existingUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    
    if (existingUser && existingUser.walletAddress !== walletAddress) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    
    // Update the user
    const updatedUser = await prisma.user.update({
      where: { walletAddress },
      data: { username: username.toLowerCase() },
    });
    
    res.json({
      id: updatedUser.id,
      walletAddress: updatedUser.walletAddress,
      username: updatedUser.username,
      balance: updatedUser.balance,
    });
  } catch (error) {
    console.error('Failed to update profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user profile by wallet address
router.get('/users/profile/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { walletAddress },
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      walletAddress: user.walletAddress,
      username: user.username,
      balance: user.balance,
      hasUsername: !!user.username,
    });
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

export default router; 