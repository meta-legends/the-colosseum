import { PrismaClient, BattleType, BattleStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // Clean up existing data to make the seed idempotent
  console.log('Deleting existing data...');
  await prisma.chatMessage.deleteMany({}); // Delete chat messages first
  await prisma.bet.deleteMany({});
  await prisma.bettingPool.deleteMany({});
  await prisma.battle.deleteMany({});
  await prisma.character.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('Existing data deleted.');


  // 1. Create a test user
  const user = await prisma.user.create({
    data: {
      walletAddress: '0xTEST_WALLET_ADDRESS',
      balance: new Decimal(1000),
    },
  });
  console.log(`Created user: ${user.walletAddress} with 1000 points`);

  // 2. Create characters
  const maximus = await prisma.character.create({
    data: {
      name: 'Maximus',
      ownerId: user.id,
    },
  });
  console.log(`Created character: ${maximus.name}`);
  
  const commodus = await prisma.character.create({
    data: {
      name: 'Commodus',
      ownerId: user.id, // Or a different user
    },
  });
  console.log(`Created character: ${commodus.name}`);

  // 3. Create a battle scheduled for 15 minutes in the future
  const startTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago (battle is live)
  const battle = await prisma.battle.create({
    data: {
      title: 'Final Duel',
      type: BattleType.TEAM_BATTLE,
      status: BattleStatus.ACTIVE, // Active for betting
      startTime: startTime,
      participants: {
        connect: [{ id: maximus.id }, { id: commodus.id }],
      },
    },
  });
  console.log(`Created battle: "${battle.title}" starting at ${battle.startTime.toLocaleTimeString()}`);

  // 4. Create initial betting pools for the battle
  await prisma.bettingPool.createMany({
    data: [
      { battleId: battle.id, characterId: maximus.id, totalVolume: new Decimal(0) },
      { battleId: battle.id, characterId: commodus.id, totalVolume: new Decimal(0) },
    ],
  });
  console.log('Created initial betting pools.');

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 