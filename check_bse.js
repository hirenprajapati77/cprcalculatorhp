const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('=== BSE OVERNIGHT SIGNALS ===');
  const signals = await prisma.overnightSignal.findMany({
    where: { symbol: { contains: 'BSE' } },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  for (const s of signals) {
    console.log(s.symbol, '| Date:', s.signalDate, '| Time:', s.signalTime, '| Dir:', s.direction, '| Score:', s.overnightScore, '| Quality:', s.qualityBucket, '| Created:', s.createdAt.toISOString());
  }

  console.log('\n=== BSE TRADE JOURNAL ENTRIES ===');
  const journal = await prisma.tradeJournal.findMany({
    where: { symbol: { contains: 'BSE' } },
    orderBy: { tradeDate: 'desc' },
    take: 10
  });
  for (const j of journal) {
    console.log(j.symbol, '| TradeDate:', j.tradeDate.toISOString(), '| Type:', j.signalType, '| Dir:', j.direction, '| Contract:', j.optionContract, '| Entry:', j.entryCmp, '| 916:', j.cmp916, '| 930:', j.cmp930, '| Exit:', j.exitCmp, '| PnL%:', j.pnlPct, '| Outcome:', j.executionOutcome);
  }

  console.log('\n=== ALL RECENT TRADE JOURNAL ENTRIES (Last 10) ===');
  const recentJournal = await prisma.tradeJournal.findMany({
    orderBy: { tradeDate: 'desc' },
    take: 10
  });
  for (const j of recentJournal) {
    console.log(j.symbol, '| TradeDate:', j.tradeDate.toISOString(), '| Type:', j.signalType, '| Dir:', j.direction, '| Contract:', j.optionContract, '| Entry:', j.entryCmp, '| 916:', j.cmp916, '| 930:', j.cmp930, '| Exit:', j.exitCmp, '| PnL%:', j.pnlPct, '| Outcome:', j.executionOutcome);
  }
  await prisma['']();
}

run();
