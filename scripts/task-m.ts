import { PrismaClient } from '@prisma/client';
import { BacktestService } from '../src/services/backtest/backtest.service';
import { MetricsService } from '../src/services/backtest/metrics.service';
import { MarketService } from '../src/services/market.service';

const prisma = new PrismaClient();

const SYMBOLS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 
  'BHARTIARTL', 'SBIN', 'ITC', 'HINDUNILVR', 
  'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'KOTAKBANK'
];

async function runTest(variant: string) {
  console.log(`\n=========================================`);
  console.log(`RUNNING VARIANT: ${variant.toUpperCase()}`);
  console.log(`=========================================`);

  process.env.BTST_VARIANT = variant;
  process.env.HISTORICAL_MODE = 'live';
  process.env.BACKTEST_EXECUTION_MODE = 'sync';
  process.env.DATABASE_URL = 'file:./dev.db';

  const run = await prisma.backtestRun.create({
    data: {
      name: `TASK_M_${variant.toUpperCase()}`,
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
      where: { backtestRunId: run.id }
    });

    const completedTrades = trades.filter(t => t.status && t.status.startsWith('CLOSED'));
    const wins = completedTrades.filter(t => t.pnl > 0).length;
    const losses = completedTrades.filter(t => t.pnl <= 0).length;
    const total = completedTrades.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    
    let totalRr = 0;
    completedTrades.forEach(t => {
      // average RR
      if (t.rr && typeof t.rr === 'string') {
        const rr = parseFloat(t.rr.replace('1:', ''));
        if (!isNaN(rr)) {
          totalRr += rr;
        }
      }
    });

    console.log(`--- RESULTS FOR ${variant.toUpperCase()} ---`);
    console.log(`Total Trades Triggered/Closed: ${total}`);
    console.log(`Wins: ${wins}, Losses: ${losses}`);
    console.log(`Win Rate: ${winRate.toFixed(2)}%`);
    console.log(`Average Expected RR String: 1:${total > 0 ? (totalRr/total).toFixed(2) : 0}`);

    // Band analysis (score bands)
    const bands = [50, 55, 60, 65];
    console.log('\n--- BY SCORE BAND ---');
    for (const b of bands) {
      const bandTrades = completedTrades.filter(t => t.score >= b);
      const bTotal = bandTrades.length;
      if (bTotal >= 15) {
        const bWins = bandTrades.filter(t => t.pnl > 0).length;
        const bWinRate = (bWins / bTotal) * 100;
        console.log(`Score >= ${b}: ${bWins}/${bTotal} (${bWinRate.toFixed(2)}%)`);
      } else {
        console.log(`Score >= ${b}: ${bTotal} trades (ignoring, MIN_SAMPLE=15 not met)`);
      }
    }

  } finally {
    MarketService.getUniverse = originalGetUniverse;
  }
}

async function main() {
  // Add Kotak to make it 15 large caps
  await runTest('baseline');
  await runTest('cpr_aware');
}

main().catch(console.error);
