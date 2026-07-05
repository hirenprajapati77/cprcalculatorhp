import { BacktestService } from '../src/services/backtest/backtest.service';
import { prisma } from '../src/lib/db';

const runName = `TASK_S_2023_${Date.now()}`;
const startDate = '2023-01-01';
const endDate = '2023-12-31';
const SYMBOLS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'BHARTIARTL', 'SBIN', 'ITC', 'HINDUNILVR', 'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'KOTAKBANK'];

async function runVariant(variant: 'clv_hybrid') {
  process.env.DATABASE_URL = 'file:./task-s-2023.db';
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

  await BacktestService.processRun(runCreated.id);
}

async function main() {
  await runVariant('clv_hybrid');
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
