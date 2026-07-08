const fs = require('fs');
const content = import { prisma } from '../src/lib/db';

async function report(variant: string) {
  process.env.DATABASE_URL = 'file:./task-q.db';
  const runs = await prisma.backtestRun.findMany({
    where: { name: { contains: variant.toUpperCase() } },
    include: { metrics: true }
  });
  const run = runs[0];
  if (!run) return;
  const trades = await prisma.trade.findMany({ where: { backtestRunId: run.id } });
  
  const closedTrades = trades.filter(t => t.status !== 'OPEN' && t.status !== 'NEVER_TRIGGERED');
  const wins = closedTrades.filter(t => t.pnl && t.pnl > 0).length;
  const losses = closedTrades.filter(t => t.pnl && t.pnl <= 0).length;

  console.log('\\n--- RESULTS FOR ' + variant.toUpperCase() + ' ---');
  console.log('Total Trades Triggered/Closed: ' + closedTrades.length);
  console.log('Wins: ' + wins + ', Losses: ' + losses);
  console.log('Win Rate: ' + run.metrics.winRate.toFixed(2) + '%');
  console.log('Expectancy: Rs ' + run.metrics.expectancy.toFixed(2) + ' / ' + run.metrics.avgRR.toFixed(4) + 'R');

  console.log('\\n--- BY SCORE BAND (MIN_SAMPLE=15) ---');
  const bands = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 101];
  for (let i = 0; i < bands.length - 1; i++) {
    const min = bands[i];
    const max = bands[i + 1] - 1;
    const bandTrades = closedTrades.filter(t => {
      const s = Math.floor(t.score || 0);
      return s >= min && s <= max;
    });

    if (bandTrades.length < 15) {
      console.log('Score ' + min + '-' + max + ': <15 samples (' + bandTrades.length + ')');
      continue;
    }

    const bandWins = bandTrades.filter(t => t.pnl && t.pnl > 0).length;
    const bandWr = (bandWins / bandTrades.length) * 100;

    let bandTotalRR = 0;
    for (const bt of bandTrades) {
      bandTotalRR += (bt.rr || 0);
    }
    const bandAvgRR = bandTotalRR / bandTrades.length;

    console.log('Score ' + min + '-' + max + ': ' + bandTrades.length + ' trades | Win Rate: ' + bandWr.toFixed(2) + '% | Exp: ' + bandAvgRR.toFixed(4) + 'R');
  }
}

async function main() {
  await report('baseline');
  await report('clv_continuous');
}
main();;
fs.writeFileSync('scripts/report.ts', content);
