import { Router, Request, Response } from 'express';
import { supabase } from '../supabase';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { verifyMessage } from 'ethers';

const router = Router();

// In-memory nonce store (address -> { nonce, expiresAt })
const nonceStore: Map<string, { nonce: string; expiresAt: number }> = new Map();

// Helper to build the message that is signed by the wallet
function buildSiweMessage(nonce: string): string {
  return `Sign in to The Colosseum\n\nNonce: ${nonce}`;
}

// GET /api/auth/nonce - issue a short-lived nonce for an address
router.get('/nonce', async (req: Request, res: Response) => {
  try {
    const address = (req.query.address as string | undefined)?.toLowerCase();
    if (!address) {
      return res.status(400).json({ error: 'address query param is required' });
    }
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    nonceStore.set(address, { nonce, expiresAt });
    res.json({ nonce, message: buildSiweMessage(nonce), expiresAt });
  } catch (e) {
    res.status(500).json({ error: 'Failed to issue nonce' });
  }
});

// POST /api/auth/verify - verify signature and create Supabase session
router.post('/verify', async (req: Request, res: Response) => {
  const { address, signature, nonce } = req.body as {
    address?: string; signature?: string; nonce?: string;
  };
  if (!address || !signature || !nonce) {
    return res.status(400).json({ error: 'address, signature, and nonce are required' });
  }
  const normalized = address.toLowerCase();
  try {
    const stored = nonceStore.get(normalized);
    if (!stored || stored.nonce !== nonce || stored.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired nonce' });
    }
    const message = buildSiweMessage(nonce);
    const recovered = verifyMessage(message, signature).toLowerCase();
    if (recovered !== normalized) {
      return res.status(401).json({ error: 'Signature does not match address' });
    }

    // Clear nonce after use
    nonceStore.delete(normalized);

    // Create/find supabase user and create a session
    const email = `${normalized}@colosseum.app`;
    const password = `siwe:${normalized}`; // server-side only

    // Try to sign in with our deterministic password
    let { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error && error.message === 'Invalid login credentials') {
      // Create user via admin with email confirmed
      const admin = supabase.auth.admin;
      const { data: created, error: createErr } = await admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { walletAddress: normalized }
      });

      if (createErr) {
        // If the user already exists, reset password and continue
        const alreadyExists = createErr.message?.toLowerCase().includes('already') || createErr.message?.toLowerCase().includes('exists');
        if (!alreadyExists) {
          return res.status(500).json({ error: createErr.message || 'Failed to create user' });
        }
        // Find existing user and update password
        const listed = await admin.listUsers();
        const existing = listed.data?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!existing) {
          return res.status(500).json({ error: 'User exists but could not be fetched' });
        }
        const { error: updateErr } = await admin.updateUserById(existing.id, { password, email_confirm: true });
        if (updateErr) {
          return res.status(500).json({ error: updateErr.message || 'Failed to update user password' });
        }
      }

      // Sign in to obtain a session
      const signInResult = await supabase.auth.signInWithPassword({ email, password });
      if (signInResult.error || !signInResult.data.session || !signInResult.data.user) {
        return res.status(500).json({ error: signInResult.error?.message || 'Failed to create session' });
      }
      data = signInResult.data;

      // Insert profile row using the authenticated user context (RLS)
      const supabaseUrl = process.env.SUPABASE_URL as string;
      const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY) as string;
      const authed = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }
      });
      // Ensure we have a profile row; insert if missing
      const { data: existingProfile } = await authed.from('User').select('id').eq('id', data.user.id).maybeSingle();
      if (!existingProfile) {
        const now = new Date().toISOString();
        await authed.from('User').insert({ 
          id: data.user.id, 
          walletAddress: normalized,
          updatedAt: now
        }).throwOnError();
      }
    } else if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data?.user || !data?.session) {
      return res.status(500).json({ error: 'Login did not return user and session' });
    }

    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Verification failed' });
  }
});

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

      // Use the authenticated session to perform the insert (RLS: role = authenticated)
      if (!signUpData.session) {
        throw new Error('User registration did not return a session object.');
      }

      const supabaseUrl = process.env.SUPABASE_URL as string;
      const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY as string;
      const authed = createClient(supabaseUrl, anonKey, {
        global: {
          headers: { Authorization: `Bearer ${signUpData.session.access_token}` }
        }
      });

      // Also create a record in our public User table using the user's auth context
      const { error: userProfileError } = await authed
        .from('User')
        .insert({ id: signUpData.user.id, walletAddress: walletAddress });

      if (userProfileError) {
        throw userProfileError;
      }
      // Assign the sign-up data to be returned
      data = { user: signUpData.user, session: signUpData.session };

    } else if (error) {
      // Handle other sign-in errors
      throw error;
    }

    res.json(data);

  } catch (error) {
    console.error('🚨 Supabase login/signup failed:', error);
    console.error('🚨 Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      name: error instanceof Error ? error.name : 'Unknown',
    });
    
    const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
    res.status(500).json({ error: errorMessage });
  }
});

export default router;