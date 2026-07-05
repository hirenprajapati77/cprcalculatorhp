import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function printCounts(runName: string) {
  const run = await prisma.backtestRun.findFirst({
    where: { name: runName },
    orderBy: { createdAt: 'desc' },
    include: { metrics: true }
  });
  if (!run) {
    console.log(`Run ${runName} not found`);
    return;
  }
  
  const trades = await prisma.trade.findMany({ where: { backtestRunId: run.id } });
  const tags = { LONG: 0, SHORT: 0, NEUTRAL_CONFLICT: 0, WEAK: 0 };
  for (const t of trades) {
    if (t.signal === 'BTST_LONG') tags.LONG++;
    else if (t.signal === 'BTST_SHORT') tags.SHORT++;
    else if (t.signal === 'BTST_NEUTRAL_CONFLICT') tags.NEUTRAL_CONFLICT++;
    else if (t.signal === 'BTST_WEAK') tags.WEAK++;
  }
  console.log(`\n--- RUN: ${runName} ---`);
  console.log(`LONG: ${tags.LONG}`);
  console.log(`SHORT: ${tags.SHORT}`);
  console.log(`NEUTRAL_CONFLICT: ${tags.NEUTRAL_CONFLICT}`);
  console.log(`WEAK: ${tags.WEAK}`);
  console.log(`TOTAL ADMITTED (LONG+SHORT): ${tags.LONG + tags.SHORT}`);

  if (run.metrics) {
    const closed = trades.filter(t => t.status.startsWith('CLOSED'));
    const wins = closed.filter(t => t.pnl > 0).length;
    const losses = closed.filter(t => t.pnl <= 0).length;
    console.log(`Wins: ${wins}, Losses: ${losses}`);
    console.log(`Win Rate: ${run.metrics.winRate.toFixed(2)}%`);
    console.log(`Expectancy: Rs ${(run.metrics.expectancy * 1000).toFixed(2)} / ${run.metrics.expectancy.toFixed(4)}R`);
    
    console.log(`--- BY SCORE BAND ---`);
    for (const band of [10, 20, 25, 40]) {
      const bandTrades = closed.filter(t => (t.score || 0) >= band);
      const bandWins = bandTrades.filter(t => t.pnl > 0).length;
      let bandPnl = 0;
      for (const t of bandTrades) bandPnl += t.pnl || 0;
      const exp = bandTrades.length > 0 ? bandPnl / bandTrades.length : 0;
      console.log(`Score >= ${band}: ${bandWins}/${bandTrades.length} (${bandTrades.length > 0 ? (bandWins / bandTrades.length * 100).toFixed(2) : 0}%) | Exp: Rs ${exp.toFixed(2)}`);
    }
  }
}

async function main() {
  await printCounts('TASK_O_BASELINE');
  await printCounts('TASK_O_NO_VDU_WEIGHTED');
}
main().catch(console.error).finally(() => prisma.$disconnect());
