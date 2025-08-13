import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Rate limiting for profile operations
const profileCreationAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_PROFILE_ATTEMPTS = 5; // Max 5 attempts per hour
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

// Rate limiting middleware
function checkRateLimit(walletAddress: string): boolean {
  const now = Date.now();
  const attempts = profileCreationAttempts.get(walletAddress);
  
  if (!attempts) {
    profileCreationAttempts.set(walletAddress, { count: 1, lastAttempt: now });
    return true;
  }
  
  // Reset if window has passed
  if (now - attempts.lastAttempt > RATE_LIMIT_WINDOW) {
    profileCreationAttempts.set(walletAddress, { count: 1, lastAttempt: now });
    return true;
  }
  
  // Check if limit exceeded
  if (attempts.count >= MAX_PROFILE_ATTEMPTS) {
    return false;
  }
  
  // Increment attempt count
  attempts.count++;
  attempts.lastAttempt = now;
  return true;
}

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of profileCreationAttempts.entries()) {
    if (now - value.lastAttempt > RATE_LIMIT_WINDOW) {
      profileCreationAttempts.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW);

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
    
    // Check rate limit
    if (!checkRateLimit(walletAddress)) {
      return res.status(429).json({ 
        error: 'Too many profile creation attempts. Please wait before trying again.' 
      });
    }
    
    // Validate username
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
    }

    const validPattern = /^[a-zA-Z0-9_]+$/;
    if (!validPattern.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    // Check if username is already taken (with retry logic for concurrent requests)
    let retries = 3;
    let existingUser = null;
    
    while (retries > 0) {
      try {
        existingUser = await prisma.user.findUnique({
          where: { username: username.toLowerCase() },
        });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay before retry
      }
    }
    
    if (existingUser && existingUser.walletAddress !== walletAddress) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    
    // Check if user exists by wallet address
    let user = await prisma.user.findUnique({
      where: { walletAddress },
    });
    
    let updatedUser = null;
    
    if (!user) {
      // User doesn't exist - CREATE them
      console.log('Creating new user profile for wallet:', walletAddress);
      updatedUser = await prisma.user.create({
        data: {
          walletAddress,
          username: username.toLowerCase(),
          balance: 0,
        },
      });
    } else {
      // User exists - UPDATE them
      console.log('Updating existing user profile for wallet:', walletAddress);
      retries = 3;
      
      while (retries > 0) {
        try {
          updatedUser = await prisma.user.update({
            where: { walletAddress },
            data: { username: username.toLowerCase() },
          });
          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay before retry
        }
      }
    }
    
    if (!updatedUser) {
      throw new Error('Failed to create/update user profile after retries');
    }
    
    res.json({
      id: updatedUser.id,
      walletAddress: updatedUser.walletAddress,
      username: updatedUser.username,
      balance: updatedUser.balance,
    });
  } catch (error: any) {
    console.error('Failed to update profile:', error);
    
    // Handle specific database errors
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.status(500).json({ error: 'Failed to update profile. Please try again.' });
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