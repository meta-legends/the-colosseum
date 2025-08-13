import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function applyRLS() {
  try {
    console.log('Applying RLS policies...');
    
    // Enable RLS on all tables
    await prisma.$executeRaw`ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY`;
    await prisma.$executeRaw`ALTER TABLE public."Battle" ENABLE ROW LEVEL SECURITY`;
    await prisma.$executeRaw`ALTER TABLE public."Bet" ENABLE ROW LEVEL SECURITY`;
    await prisma.$executeRaw`ALTER TABLE public."ChatMessage" ENABLE ROW LEVEL SECURITY`;
    await prisma.$executeRaw`ALTER TABLE public."Character" ENABLE ROW LEVEL SECURITY`;
    await prisma.$executeRaw`ALTER TABLE public."BettingPool" ENABLE ROW LEVEL SECURITY`;
    await prisma.$executeRaw`ALTER TABLE public."MarketSnapshot" ENABLE ROW LEVEL SECURITY`;

    // Grant schema usage
    await prisma.$executeRaw`GRANT USAGE ON SCHEMA public TO anon, authenticated`;

    // Grant table privileges
    await prisma.$executeRaw`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`;
    await prisma.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated`;

    // Set default privileges
    await prisma.$executeRaw`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon`;
    await prisma.$executeRaw`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated`;

    // Grant sequence privileges
    await prisma.$executeRaw`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated`;
    await prisma.$executeRaw`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated`;

    // Drop existing policies
    await prisma.$executeRaw`DROP POLICY IF EXISTS "Allow public read access to user profiles" ON public."User"`;
    await prisma.$executeRaw`DROP POLICY IF EXISTS "Allow users to update their own info, but not role (Optimized)" ON public."User"`;
    await prisma.$executeRaw`DROP POLICY IF EXISTS "Allow users to insert their own profile" ON public."User"`;
    await prisma.$executeRaw`DROP POLICY IF EXISTS "Allow public read access to battles" ON public."Battle"`;
    await prisma.$executeRaw`DROP POLICY IF EXISTS "Allow authenticated users to place bets" ON public."Bet"`;
    await prisma.$executeRaw`DROP POLICY IF EXISTS "Allow public read access to bets" ON public."Bet"`;
    await prisma.$executeRaw`DROP POLICY IF EXISTS "Allow authenticated users to send messages (Optimized)" ON public."ChatMessage"`;
    await prisma.$executeRaw`DROP POLICY IF EXISTS "Allow public read access" ON public."ChatMessage"`;
    await prisma.$executeRaw`DROP POLICY IF EXISTS "chat_delete_moderators_only" ON public."ChatMessage"`;

    // Create User policies
    await prisma.$executeRaw`CREATE POLICY "Allow public read access to user profiles" ON public."User" FOR SELECT USING (true)`;
    await prisma.$executeRaw`CREATE POLICY "Allow users to update their own info, but not role (Optimized)" ON public."User" FOR UPDATE USING (auth.uid() = id)`;
    await prisma.$executeRaw`CREATE POLICY "Allow users to insert their own profile" ON public."User" FOR INSERT WITH CHECK (auth.uid() = id)`;

    // Create Battle policies
    await prisma.$executeRaw`CREATE POLICY "Allow public read access to battles" ON public."Battle" FOR SELECT USING (true)`;

    // Create Bet policies
    await prisma.$executeRaw`CREATE POLICY "Allow authenticated users to place bets" ON public."Bet" FOR INSERT WITH CHECK (auth.uid() = "userId")`;
    await prisma.$executeRaw`CREATE POLICY "Allow public read access to bets" ON public."Bet" FOR SELECT USING (true)`;

    // Create ChatMessage policies
    await prisma.$executeRaw`CREATE POLICY "Allow authenticated users to send messages (Optimized)" ON public."ChatMessage" FOR INSERT WITH CHECK (auth.uid() = "userId")`;
    await prisma.$executeRaw`CREATE POLICY "Allow public read access" ON public."ChatMessage" FOR SELECT USING (true)`;
    await prisma.$executeRaw`CREATE POLICY "chat_delete_moderators_only" ON public."ChatMessage" FOR DELETE TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public."User"
        WHERE public."User".id = auth.uid()
        AND public."User".role IN ('moderator', 'admin')
      )
    )`;

    console.log('✅ RLS policies applied successfully!');
  } catch (error) {
    console.error('❌ Error applying RLS policies:', error);
  } finally {
    await prisma.$disconnect();
  }
}

applyRLS();
