import { Router, Request, Response } from 'express';
import { supabase } from '../supabase';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress is required' });
  }

  try {
    // Treat the wallet address as an email for Supabase auth
    const email = `${walletAddress}@colosseum.app`;
    const password = walletAddress; // Use the address as the password for simplicity

    // First, try to sign in the user
    let { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // If user does not exist, sign them up
    if (error && error.message === 'Invalid login credentials') {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        throw signUpError;
      }
      
      if (!signUpData.user) {
        throw new Error("User registration did not return a user object.");
      }

      // Also create a record in our public 'User' table
      const { error: userProfileError } = await supabase
        .from('User')
        .insert({ id: signUpData.user.id, walletAddress: walletAddress });

      if (userProfileError) {
        throw userProfileError;
      }
      
      if (!signUpData.session) {
        throw new Error("User registration did not return a session object.");
      }

      // Assign the sign-up data to be returned
      data = { user: signUpData.user, session: signUpData.session };

    } else if (error) {
      // Handle other sign-in errors
      throw error;
    }

    res.json(data);

  } catch (error) {
    console.error('Supabase login/signup failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
    res.status(500).json({ error: errorMessage });
  }
});

export default router;