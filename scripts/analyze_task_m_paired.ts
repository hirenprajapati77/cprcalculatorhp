import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

process.env.DATABASE_URL = 'file:./dev.db';

async function main() {
  // 1. Get the most recent BASELINE and CPR_AWARE runs
  const runs = await prisma.backtestRun.findMany({
    where: { name: { startsWith: 'TASK_M_' } },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  const baselineRun = runs.find(r => r.name === 'TASK_M_BASELINE');
  const cprAwareRun = runs.find(r => r.name === 'TASK_M_CPR_AWARE');

  if (!baselineRun || !cprAwareRun) {
    console.error('Missing backtest runs for baseline or cpr_aware');
    return;
  }

  // 2. Fetch all closed trades
  const baselineTrades = await prisma.trade.findMany({
    where: { backtestRunId: baselineRun.id, status: { startsWith: 'CLOSED' } }
  });
  const cprTrades = await prisma.trade.findMany({
    where: { backtestRunId: cprAwareRun.id, status: { startsWith: 'CLOSED' } }
  });

  // Map by composite key: symbol_date
  const baselineMap = new Map();
  baselineTrades.forEach(t => {
    const key = `${t.symbol}_${t.entryDate.toISOString()}`;
    baselineMap.set(key, t);
  });

  const cprMap = new Map();
  cprTrades.forEach(t => {
    const key = `${t.symbol}_${t.entryDate.toISOString()}`;
    cprMap.set(key, t);
  });

  // Ensure same keys
  const keys = Array.from(baselineMap.keys());
  console.log(`Matched trades count: ${keys.length}\n`);

  // 3. Paired matrix
  let wonBoth = 0;
  let lostBoth = 0;
  let wonBaseLostCpr = 0;
  let lostBaseWonCpr = 0;

  let wonBothBasePnl = 0;
  let wonBothCprPnl = 0;
  let wonBothBaseRR = 0;
  let wonBothCprRR = 0;

  const bandStats = {
    baseline: { 50: { pnl: 0, w: 0, l: 0, rr: 0 }, 55: { pnl: 0, w: 0, l: 0, rr: 0 }, 60: { pnl: 0, w: 0, l: 0, rr: 0 }, 65: { pnl: 0, w: 0, l: 0, rr: 0 } },
    cpr: { 50: { pnl: 0, w: 0, l: 0, rr: 0 }, 55: { pnl: 0, w: 0, l: 0, rr: 0 }, 60: { pnl: 0, w: 0, l: 0, rr: 0 }, 65: { pnl: 0, w: 0, l: 0, rr: 0 } }
  };

  let totalBasePnl = 0;
  let totalCprPnl = 0;
  let totalBaseRR = 0;
  let totalCprRR = 0;

  for (const key of keys) {
    const bTrade = baselineMap.get(key);
    const cTrade = cprMap.get(key);

    const bWon = bTrade.pnl > 0;
    const cWon = cTrade.pnl > 0;

    totalBasePnl += bTrade.pnl;
    totalCprPnl += cTrade.pnl;

    const bRR = bTrade.rr ? parseFloat(bTrade.rr) : (bTrade.pnl / bTrade.riskAmount);
    const cRR = cTrade.rr ? parseFloat(cTrade.rr) : (cTrade.pnl / cTrade.riskAmount);
    totalBaseRR += bRR;
    totalCprRR += cRR;

    if (bWon && cWon) {
      wonBoth++;
      wonBothBasePnl += bTrade.pnl;
      wonBothCprPnl += cTrade.pnl;
      wonBothBaseRR += bRR;
      wonBothCprRR += cRR;
    } else if (!bWon && !cWon) {
      lostBoth++;
    } else if (bWon && !cWon) {
      wonBaseLostCpr++;
      console.log(`Flipped Trade (Won Base / Lost CPR): ${key} | Score: ${bTrade.score}`);
    } else if (!bWon && cWon) {
      lostBaseWonCpr++;
    }

    // Score bands
    const score = bTrade.score || 0;
    for (const band of [50, 55, 60, 65]) {
      if (score >= band) {
        bandStats.baseline[band].pnl += bTrade.pnl;
        bandStats.baseline[band].rr += bRR;
        if (bWon) bandStats.baseline[band].w++; else bandStats.baseline[band].l++;

        bandStats.cpr[band].pnl += cTrade.pnl;
        bandStats.cpr[band].rr += cRR;
        if (cWon) bandStats.cpr[band].w++; else bandStats.cpr[band].l++;
      }
    }
  }

  console.log(`=== PAIRED OUTCOME BREAKDOWN (2x2 Matrix) ===`);
  console.log(`Won Both: ${wonBoth}`);
  console.log(`Lost Both: ${lostBoth}`);
  console.log(`Won Baseline / Lost CPR: ${wonBaseLostCpr}`);
  console.log(`Lost Baseline / Won CPR: ${lostBaseWonCpr}`);
  console.log(`\n=== OVERALL EXPECTANCY & AVG RR ===`);
  const bAvgPnl = totalBasePnl / keys.length;
  const cAvgPnl = totalCprPnl / keys.length;
  const bAvgRR = totalBaseRR / keys.length;
  const cAvgRR = totalCprRR / keys.length;
  console.log(`Baseline Expectancy (Avg PnL): ₹${bAvgPnl.toFixed(2)} | Avg RR: ${bAvgRR.toFixed(4)}R`);
  console.log(`CPR-Aware Expectancy (Avg PnL): ₹${cAvgPnl.toFixed(2)} | Avg RR: ${cAvgRR.toFixed(4)}R`);

  console.log(`\n=== FOR "WON BOTH" TRADES (${wonBoth} trades) ===`);
  console.log(`Baseline Avg PnL: ₹${(wonBothBasePnl / wonBoth).toFixed(2)} | Avg RR: ${(wonBothBaseRR / wonBoth).toFixed(4)}R`);
  console.log(`CPR-Aware Avg PnL: ₹${(wonBothCprPnl / wonBoth).toFixed(2)} | Avg RR: ${(wonBothCprRR / wonBoth).toFixed(4)}R`);

  console.log(`\n=== EXPECTANCY BY SCORE BAND ===`);
  for (const band of [50, 55, 60, 65]) {
    const bStats = bandStats.baseline[band];
    const cStats = bandStats.cpr[band];
    const total = bStats.w + bStats.l;
    if (total === 0) continue;
    const bExp = bStats.pnl / total;
    const cExp = cStats.pnl / total;
    const bAvgRRBand = bStats.rr / total;
    const cAvgRRBand = cStats.rr / total;

    console.log(`Score >= ${band} (n=${total}):`);
    console.log(`  Baseline:  Win% ${(bStats.w/total*100).toFixed(1)}% | Exp ₹${bExp.toFixed(2)} | Avg RR ${bAvgRRBand.toFixed(4)}R`);
    console.log(`  CPR-Aware: Win% ${(cStats.w/total*100).toFixed(1)}% | Exp ₹${cExp.toFixed(2)} | Avg RR ${cAvgRRBand.toFixed(4)}R`);
  }
}

main().catch(console.error);
