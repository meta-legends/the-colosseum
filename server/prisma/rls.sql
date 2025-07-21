-- This script saves and reapplies all RLS policies.

-- First, enable Row Level Security on all relevant tables
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Battle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Bet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Character" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BettingPool" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MarketSnapshot" ENABLE ROW LEVEL SECURITY;


-- Drop existing policies to avoid conflicts, then recreate them.

-- Policies for "User" table
DROP POLICY IF EXISTS "Allow public read access to user profiles" ON public."User";
CREATE POLICY "Allow public read access to user profiles" ON public."User" FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow users to update their own info, but not role (Optimized)" ON public."User";
CREATE POLICY "Allow users to update their own info, but not role (Optimized)" ON public."User" FOR UPDATE USING ((auth.uid() = id::uuid));


-- Policies for "Battle" table
DROP POLICY IF EXISTS "Allow public read access to battles" ON public."Battle";
CREATE POLICY "Allow public read access to battles" ON public."Battle" FOR SELECT USING (true);


-- Policies for "Bet" table
DROP POLICY IF EXISTS "Allow authenticated users to place bets" ON public."Bet";
CREATE POLICY "Allow authenticated users to place bets" ON public."Bet" FOR INSERT WITH CHECK ((auth.uid() = "userId"::uuid));

DROP POLICY IF EXISTS "Allow public read access to bets" ON public."Bet";
CREATE POLICY "Allow public read access to bets" ON public."Bet" FOR SELECT USING (true);


-- Policies for "ChatMessage" table
DROP POLICY IF EXISTS "Allow authenticated users to send messages (Optimized)" ON public."ChatMessage";
CREATE POLICY "Allow authenticated users to send messages (Optimized)" ON public."ChatMessage" FOR INSERT WITH CHECK ((auth.uid() = "userId"::uuid));

DROP POLICY IF EXISTS "Allow public read access" ON public."ChatMessage";
CREATE POLICY "Allow public read access" ON public."ChatMessage" FOR SELECT USING (true); 