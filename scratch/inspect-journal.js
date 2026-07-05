const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '/home/ubuntu/cpr-calculator-platform/.env' });

async function main() {
  const p = new PrismaClient();
  const r = await p.tradeJournal.findMany({
    orderBy: { tradeDate: 'desc' },
    take: 10
  });
  console.log('Last 10 entries:');
  console.log(r.map(t => ({
    id: t.id,
    symbol: t.symbol,
    tradeDate: t.tradeDate,
    optionContract: t.optionContract,
    entryCmp: t.entryCmp
  })));
  
  // Also clear today's records if we find them
  const targetDate = new Date('2026-06-28T18:30:00.000Z');
  const deleted = await p.tradeJournal.deleteMany({
    where: {
      tradeDate: targetDate
    }
  });
  console.log('Deleted entries matching targetDate:', deleted.count);
  
  await p.$disconnect();
}

main().catch(console.error);
