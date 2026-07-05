import { BacktestService } from '../src/services/backtest/backtest.service';
import { prisma } from '../src/lib/db';

/**
 * TASK R CONFIGURATION
 * Date Range: 2023-01-01 to 2023-12-31 (Out of sample test)
 * Universe: 15 Legacy Symbols
 * Capital: 1,000,000
 * Execution Mode: conservative
 * Risk Model: Capital%
 * Risk Value: 5.0
 * Strategy Mode: BTST_STBT_DRIVEN
 * Feature: clv_continuous only
 */

const runName = `TASK_R_${Date.now()}`;
const startDate = '2023-01-01';
const endDate = '2023-12-31';
const SYMBOLS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'BHARTIARTL', 'SBIN', 'ITC', 'HINDUNILVR', 'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'KOTAKBANK'];

async function runVariant(variant: 'clv_continuous') {
  process.env.DATABASE_URL = 'file:./task-r.db';
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
  
  const run = await prisma.backtestRun.findUnique({
    where: { id: runCreated.id },
    include: { metrics: true }
  });

  if (!run || !run.metrics) {
    console.log(`Failed to retrieve metrics for ${variant}`);
    return;
  }
}

async function main() {
  await runVariant('clv_continuous');
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
