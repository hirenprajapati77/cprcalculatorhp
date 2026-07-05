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

  console.log(`Total Matched Baseline Trades: ${trades.length}\n`);

  // New weights for the hypothesis
  // vdu: 0 (down from 20)
  // cprNarrow: 35 (up from 15)
  // higherValue: 20 (unchanged)
  // liquidity: 10 (unchanged)

  const newBucketStats = new Map<number, { count: number, wins: number, pnl: number, rr: number }>();

  for (const t of trades) {
    let newScore = 0;
    if (t.signalsJson) {
      try {
        const parsed = JSON.parse(t.signalsJson);
        if (parsed.scoreBreakdown) {
          if (parsed.scoreBreakdown.higherValue) newScore += 20;
          if (parsed.scoreBreakdown.liquidity) newScore += 10;
          if (parsed.scoreBreakdown.cprNarrow) newScore += 35; // up-weighted
          // VDU is ignored (0 points)
        }
      } catch (e) {}
    }

    const bWon = t.pnl > 0;
    const bRR = t.rr ? parseFloat(t.rr) : (t.pnl / t.riskAmount);

    if (!newBucketStats.has(newScore)) {
      newBucketStats.set(newScore, { count: 0, wins: 0, pnl: 0, rr: 0 });
    }

    const stats = newBucketStats.get(newScore)!;
    stats.count++;
    if (bWon) stats.wins++;
    stats.pnl += t.pnl;
    stats.rr += bRR;
  }

  console.log(`=== TASK O: NO-VDU-WEIGHTED BUCKET ANALYSIS ===`);
  console.log(`Score | Trades | Win Rate | Expectancy (Avg PnL) | Avg RR`);
  console.log(`-------------------------------------------------------------`);

  const sortedScores = Array.from(newBucketStats.keys()).sort((a, b) => a - b);
  for (const score of sortedScores) {
    const stats = newBucketStats.get(score)!;
    if (stats.count < 15) {
      console.log(`   ${String(score).padStart(2)} | (Skipped, MIN_SAMPLE=15 not met. n=${stats.count})`);
      continue;
    }

    const winRate = (stats.wins / stats.count) * 100;
    const avgPnl = stats.pnl / stats.count;
    const avgRR = stats.rr / stats.count;

    console.log(
      `${String(score).padStart(5)} | ` +
      `${String(stats.count).padStart(6)} | ` +
      `${winRate.toFixed(1).padStart(7)}% | ` +
      `₹${avgPnl.toFixed(2).padStart(19)} | ` +
      `${avgRR.toFixed(4).padStart(7)}R`
    );
  }

  console.log(`\n=== TASK O: THRESHOLD PERFORMANCE (>= Score) ===`);
  for (const threshold of [30, 45, 60, 65]) {
    let tCount = 0;
    let tWins = 0;
    let tPnl = 0;
    let tRR = 0;
    for (const [score, stats] of newBucketStats.entries()) {
      if (score >= threshold) {
        tCount += stats.count;
        tWins += stats.wins;
        tPnl += stats.pnl;
        tRR += stats.rr;
      }
    }

    if (tCount === 0) continue;

    const winRate = (tWins / tCount) * 100;
    const avgPnl = tPnl / tCount;
    const avgRR = tRR / tCount;

    console.log(`>= ${threshold}: n=${tCount}, Win Rate=${winRate.toFixed(1)}%, Exp=₹${avgPnl.toFixed(2)}, AvgRR=${avgRR.toFixed(4)}R`);
  }
}

main().catch(console.error);
