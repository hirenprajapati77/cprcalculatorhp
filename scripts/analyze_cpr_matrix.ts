import { PrismaClient } from '@prisma/client';
import { BacktestService } from '../src/services/backtest/backtest.service';
import { MarketService } from '../src/services/market.service';

const prisma = new PrismaClient();

const SYMBOLS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 
  'BHARTIARTL', 'SBIN', 'ITC', 'HINDUNILVR', 
  'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'KOTAKBANK'
];

async function runTest(cprWeight: number) {
  process.env.BTST_VARIANT = 'no_vdu_weighted';
  process.env.CPR_WEIGHT = String(cprWeight);
  process.env.HISTORICAL_MODE = 'live';
  process.env.BACKTEST_EXECUTION_MODE = 'sync';
  process.env.DATABASE_URL = 'file:./dev.db';

  const runName = `TASK_O_CPR_WEIGHT_${cprWeight}`;
  
  // Clean up any old runs with this name to avoid bloating DB
  await prisma.trade.deleteMany({
    where: { run: { name: runName } }
  });
  await prisma.backtestRun.deleteMany({
    where: { name: runName }
  });

  const run = await prisma.backtestRun.create({
    data: {
      name: runName,
      universe: 'NIFTY50',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      capital: 1000000,
      riskModel: 'Capital%',
      executionMode: 'conservative',
      riskValue: 5.0,
      status: 'QUEUED',
      strategyMode: 'BTST_STBT_DRIVEN',
      metricsVersion: 1
    }
  });

  const originalGetUniverse = MarketService.getUniverse;
  MarketService.getUniverse = function() {
    return SYMBOLS.map(sym => ({
      symbol: sym,
      name: `${sym} Industries`,
      sector: 'General',
      marketCap: 1000000,
      isNifty50: true,
      isNifty200: true,
      isFnO: true
    }));
  };

  try {
    await BacktestService.processRun(run.id);

    const trades = await prisma.trade.findMany({
      where: { backtestRunId: run.id, status: { startsWith: 'CLOSED' } }
    });

    // Score analysis
    const scores = Array.from(new Set(trades.map(t => t.score || 0))).sort((a, b) => a - b);
    
    console.log(`\n================================================================================`);
    console.log(`CPR WEIGHT = ${cprWeight} | Total trades: ${trades.length}`);
    console.log(`================================================================================`);
    console.log(`Score | Trades | Win Rate | Expectancy | Avg RR | Components`);
    console.log(`--------------------------------------------------------------------------------`);

    const bucketData: { score: number; expectancy: number; count: number }[] = [];

    for (const score of scores) {
      const exactTrades = trades.filter(t => (t.score || 0) === score);
      const total = exactTrades.length;
      if (total === 0) continue;

      if (total < 15) {
        console.log(`  ${String(score).padStart(3)} | (n=${total} < 15, skipped)`);
        continue;
      }

      const wins = exactTrades.filter(t => (t.pnl ?? 0) > 0).length;
      const winRate = (wins / total) * 100;
      
      let totalPnl = 0;
      let totalRR = 0;
      const componentCounts = new Map<string, number>();

      for (const t of exactTrades) {
        const pnlVal = t.pnl ?? 0;
        totalPnl += pnlVal;
        const rr = t.rr ?? (t.riskAmount > 0 ? pnlVal / t.riskAmount : 0);
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
          } catch (e) {}
        }
        componentCounts.set(componentsStr, (componentCounts.get(componentsStr) || 0) + 1);
      }

      const expectancy = totalPnl / total;
      const avgRR = totalRR / total;
      const topCompStr = Array.from(componentCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];

      bucketData.push({ score, expectancy, count: total });

      console.log(
        `  ${String(score).padStart(3)} | ` +
        `${String(total).padStart(6)} | ` +
        `${winRate.toFixed(1).padStart(7)}% | ` +
        `₹${expectancy.toFixed(2).padStart(9)} | ` +
        `${avgRR.toFixed(4).padStart(7)}R | ` +
        `${topCompStr}`
      );
    }

    // Monotonicity Check & Correlation
    if (bucketData.length >= 2) {
      // Monotonicity
      let isMonotonic = true;
      for (let i = 1; i < bucketData.length; i++) {
        if (bucketData[i].expectancy < bucketData[i - 1].expectancy) {
          isMonotonic = false;
        }
      }
      console.log(`Monotonicity Validation: ${isMonotonic ? 'PASSED' : 'FAILED'}`);

      // Pearson correlation between score and expectancy
      const n = bucketData.length;
      const sumX = bucketData.reduce((acc, curr) => acc + curr.score, 0);
      const sumY = bucketData.reduce((acc, curr) => acc + curr.expectancy, 0);
      const sumXY = bucketData.reduce((acc, curr) => acc + (curr.score * curr.expectancy), 0);
      const sumX2 = bucketData.reduce((acc, curr) => acc + (curr.score * curr.score), 0);
      const sumY2 = bucketData.reduce((acc, curr) => acc + (curr.expectancy * curr.expectancy), 0);

      const num = (n * sumXY) - (sumX * sumY);
      const den = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
      const corr = den === 0 ? 0 : num / den;
      console.log(`Score-Expectancy Correlation: ${corr.toFixed(4)}`);
    } else {
      console.log(`Monotonicity Check & Correlation: N/A (too few valid buckets)`);
    }

  } finally {
    MarketService.getUniverse = originalGetUniverse;
  }
}

async function main() {
  const weights = [10, 15, 20, 25, 30, 35, 40];
  for (const w of weights) {
    await runTest(w);
  }
}

main().catch(console.error);
