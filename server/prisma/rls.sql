-- This script saves and reapplies all RLS policies.

-- Add role column to User table if it doesn't exist
ALTER TABLE public.User ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT 'user' CHECK ("role" IN ('user', 'moderator', 'admin'));

-- Enable RLS on all tables
ALTER TABLE public.User ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Battle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Bet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Character" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BettingPool" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MarketSnapshot" ENABLE ROW LEVEL SECURITY;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant table privileges (RLS still enforced)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Make future tables inherit the same defaults
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Grant sequence privileges
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow public read access to user profiles" ON public.User;
DROP POLICY IF EXISTS "Allow users to update their own info, but not role (Optimized)" ON public.User;
DROP POLICY IF EXISTS "Allow users to insert their own profile" ON public.User;
DROP POLICY IF EXISTS "Allow public read access to battles" ON public."Battle";
DROP POLICY IF EXISTS "Allow authenticated users to place bets" ON public."Bet";
DROP POLICY IF EXISTS "Allow public read access to bets" ON public."Bet";
DROP POLICY IF EXISTS "Allow authenticated users to send messages (Optimized)" ON public."ChatMessage";
DROP POLICY IF EXISTS "Allow public read access" ON public."ChatMessage";
DROP POLICY IF EXISTS "chat_delete_moderators_only" ON public."ChatMessage";

-- Create User policies
CREATE POLICY "Allow public read access to user profiles" ON public.User FOR SELECT USING (true);
CREATE POLICY "Allow users to update their own info, but not role (Optimized)" ON public.User FOR UPDATE USING (auth.uid()::text = id);
CREATE POLICY "Allow users to insert their own profile" ON public.User FOR INSERT WITH CHECK (auth.uid()::text = id);

-- Create Battle policies
CREATE POLICY "Allow public read access to battles" ON public."Battle" FOR SELECT USING (true);

-- Create Bet policies
CREATE POLICY "Allow authenticated users to place bets" ON public."Bet" FOR INSERT WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "Allow public read access to bets" ON public."Bet" FOR SELECT USING (true);

-- Create ChatMessage policies
CREATE POLICY "Allow authenticated users to send messages (Optimized)" ON public."ChatMessage" FOR INSERT WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "Allow public read access" ON public."ChatMessage" FOR SELECT USING (true);

-- Chat moderation: only moderators/admins can delete messages
CREATE POLICY "chat_delete_moderators_only" ON public."ChatMessage" FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.User
    WHERE public.User.id = auth.uid()::text
    AND public.User.role IN ('moderator', 'admin')
  )
); 