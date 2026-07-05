import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
process.env.DATABASE_URL = 'file:./dev.db';

async function main() {
  const runs = await prisma.backtestRun.findMany({
    where: { name: 'TASK_M_BASELINE' },
    orderBy: { createdAt: 'desc' },
    take: 1
  });

  if (runs.length === 0) {
    console.error('Missing baseline run');
    return;
  }

  const baselineRun = runs[0];

  const trades = await prisma.trade.findMany({
    where: { backtestRunId: baselineRun.id, status: { startsWith: 'CLOSED' } }
  });

  console.log(`Total Baseline Trades: ${trades.length}`);

  // Calculate distinct scores
  const scores = Array.from(new Set(trades.map(t => t.score || 0))).sort((a, b) => a - b);
  
  console.log(`\n=== SCORE THRESHOLD ANALYSIS (>= Threshold) ===`);
  console.log(`Threshold | Trades | Win Rate | Expectancy (Avg PnL) | Avg RR`);
  console.log(`-------------------------------------------------------------`);

  for (const threshold of scores) {
    const validTrades = trades.filter(t => (t.score || 0) >= threshold);
    const total = validTrades.length;
    if (total === 0) continue;

    const wins = validTrades.filter(t => t.pnl > 0).length;
    const winRate = (wins / total) * 100;
    
    let totalPnl = 0;
    let totalRR = 0;

    for (const t of validTrades) {
      totalPnl += t.pnl;
      const rr = t.rr ? parseFloat(t.rr) : (t.pnl / t.riskAmount);
      totalRR += rr;
    }

    const avgPnl = totalPnl / total;
    const avgRR = totalRR / total;

    console.log(
      `${String(threshold).padStart(9)} | ` +
      `${String(total).padStart(6)} | ` +
      `${winRate.toFixed(1).padStart(7)}% | ` +
      `₹${avgPnl.toFixed(2).padStart(19)} | ` +
      `${avgRR.toFixed(4).padStart(7)}R`
    );
  }
}

main().catch(console.error);
