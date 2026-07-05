import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
process.env.DATABASE_URL = 'file:./dev.db';

async function main() {
  const runs = await prisma.backtestRun.findMany({
    where: { name: 'TASK_M_NO_VDU_WEIGHTED' },
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

  // Calculate distinct scores exactly
  const scores = Array.from(new Set(trades.map(t => t.score || 0))).sort((a, b) => a - b);
  
  console.log(`\n=== EXACT SCORE BUCKET ANALYSIS ===`);
  console.log(`Score | Trades | Win Rate | Expectancy (Avg PnL) | Avg RR | Components`);
  console.log(`-------------------------------------------------------------------------`);

  for (const score of scores) {
    const exactTrades = trades.filter(t => (t.score || 0) === score);
    const total = exactTrades.length;
    if (total === 0) continue;
    if (total < 15) {
      console.log(`   ${String(score).padStart(2)} | (Skipped, MIN_SAMPLE=15 not met. n=${total})`);
      continue;
    }

    const wins = exactTrades.filter(t => t.pnl > 0).length;
    const winRate = (wins / total) * 100;
    
    let totalPnl = 0;
    let totalRR = 0;

    // Component combinations
    const componentCounts = new Map<string, number>();

    for (const t of exactTrades) {
      totalPnl += t.pnl;
      const rr = t.rr ? parseFloat(t.rr) : (t.pnl / t.riskAmount);
      totalRR += rr;

      let componentsStr = 'Unknown';
      if (t.signalsJson) {
        try {
          const parsed = JSON.parse(t.signalsJson);
          if (parsed.scoreBreakdown) {
            const comps = [];
            if (parsed.scoreBreakdown.vdu) comps.push('VDU');
            if (parsed.scoreBreakdown.higherValue) comps.push('HV');
            if (parsed.scoreBreakdown.cprNarrow) comps.push('CPR');
            if (parsed.scoreBreakdown.liquidity) comps.push('LIQ');
            componentsStr = comps.join(' + ') || 'None';
          }
        } catch (e) {
          // ignore parsing error
        }
      }
      componentCounts.set(componentsStr, (componentCounts.get(componentsStr) || 0) + 1);
    }

    const avgPnl = totalPnl / total;
    const avgRR = totalRR / total;

    // Sort component strings by frequency
    const sortedComps = Array.from(componentCounts.entries()).sort((a, b) => b[1] - a[1]);
    const topCompStr = sortedComps[0][0];

    console.log(
      `${String(score).padStart(5)} | ` +
      `${String(total).padStart(6)} | ` +
      `${winRate.toFixed(1).padStart(7)}% | ` +
      `₹${avgPnl.toFixed(2).padStart(19)} | ` +
      `${avgRR.toFixed(4).padStart(7)}R | ` +
      `${topCompStr}`
    );
    
    // Print all combinations if there is more than 1 that makes up this score
    if (sortedComps.length > 1) {
      for (let i = 1; i < sortedComps.length; i++) {
        console.log(`      |        |          |                      |          | + ${sortedComps[i][1]} trades: ${sortedComps[i][0]}`);
      }
    }
  }
}

main().catch(console.error);
