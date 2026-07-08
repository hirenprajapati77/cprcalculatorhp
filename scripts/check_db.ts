import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const entries = await prisma.tradeJournal.findMany({
    where: { symbol: 'MPHASIS' }
  });
  console.log("DB Entries for MPHASIS:");
  console.log(JSON.stringify(entries, null, 2));
  process.exit(0);
}

run();
