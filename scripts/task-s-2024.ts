import { BacktestService } from '../src/services/backtest/backtest.service';
import { prisma } from '../src/lib/db';

const runName = `TASK_S_2024_${Date.now()}`;
const startDate = '2024-01-01';
const endDate = '2024-12-31';
const SYMBOLS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'BHARTIARTL', 'SBIN', 'ITC', 'HINDUNILVR', 'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'KOTAKBANK'];

async function runVariant(variant: 'clv_hybrid') {
  process.env.DATABASE_URL = 'file:./task-s-2024.db';
  process.env.HISTORICAL_MODE = 'live';

  const runCreated = await prisma.backtestRun.create({
    data: {
      name: runName + '_' + variant.toUpperCase(),
      universe: SYMBOLS.join(','),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      capital: 1000000,
      executionMode: 'conservative',
      riskModel: 'Capital%',
      riskValue: 5.0,
      strategyMode: 'BTST_STBT_DRIVEN',
      status: 'QUEUED',
      metricsVersion: 1
    }
  });

  // Since prisma schema added clv_hybrid to the union implicitly? No, prisma schema doesn't have an enum for strategyMode, it's just String. But we need to pass variant explicitly!
  // Wait, `processRun` gets strategyMode from the database!
  // It passes `run.strategyMode` to evaluateOvernight. Oh no.
  // Currently, `strategyMode` is 'BTST_STBT_DRIVEN', which maps to evaluateOvernight's `strategyVariant` which defaults to 'baseline' if not passed explicitly in task-p.
  // Wait, let's look at `backtest.service.ts` to see how it calls `evaluateOvernight`.
  
  await BacktestService.processRun(runCreated.id);
}

async function main() {
  await runVariant('clv_hybrid');
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
