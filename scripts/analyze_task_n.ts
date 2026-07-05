import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
process.env.DATABASE_URL = 'file:./dev.db';

function calculateMedian(pnls: number[]): number {
  if (pnls.length === 0) return 0;
  const sorted = [...pnls].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

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

  console.log(`Total Baseline Trades: ${trades.length}\n`);

  for (const targetScore of [50, 65]) {
    const bucketTrades = trades.filter(t => (t.score || 0) === targetScore);
    const n = bucketTrades.length;
    
    if (n === 0) continue;

    const pnls = bucketTrades.map(t => t.pnl);
    const sortedPnls = [...pnls].sort((a, b) => a - b);
    
    const mean = pnls.reduce((sum, val) => sum + val, 0) / n;
    const median = calculateMedian(pnls);
    
    const worstTrade = bucketTrades.reduce((worst, current) => current.pnl < worst.pnl ? current : worst, bucketTrades[0]);
    const totalPnl = pnls.reduce((sum, val) => sum + val, 0);
    const worstPercent = totalPnl < 0 ? (worstTrade.pnl / totalPnl) * 100 : 0; // percentage of total loss

    const pnlsWithoutWorst = [...pnls];
    pnlsWithoutWorst.splice(pnls.indexOf(worstTrade.pnl), 1);
    const meanWithoutWorst = pnlsWithoutWorst.reduce((sum, val) => sum + val, 0) / (n - 1);

    console.log(`=== Score ${targetScore} Bucket (n=${n}) ===`);
    console.log(`Mean PnL:   ₹${mean.toFixed(2)}`);
    console.log(`Median PnL: ₹${median.toFixed(2)}`);
    console.log(`Worst Trade: ₹${worstTrade.pnl.toFixed(2)} on ${worstTrade.symbol} at ${worstTrade.entryDate.toISOString()}`);
    console.log(`Worst Trade as % of Total Bucket Loss: ${worstPercent.toFixed(1)}%`);
    console.log(`Mean PnL (excluding worst trade): ₹${meanWithoutWorst.toFixed(2)}\n`);
  }
}

main().catch(console.error);
