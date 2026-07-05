import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import { BacktestService } from '../src/services/backtest/backtest.service';

const prisma = new PrismaClient();

async function runVariant(variant: 'baseline' | 'no_vdu_weighted') {
  const symbols = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY',
    'ITC', 'SBIN', 'BHARTIARTL', 'HINDUNILVR', 'LT',
    'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'KOTAKBANK'
  ];

  const startDate = '2024-01-01';
  const endDate = '2024-12-31';
  const runName = `TASK_O_${variant.toUpperCase()}`;

  console.log(`\n=========================================`);
  console.log(`RUNNING VARIANT: ${variant.toUpperCase()}`);
  console.log(`=========================================`);
  
  const { jobId } = await BacktestService.submitRun({
    name: runName,
    universe: symbols.join(','),
    startDate,
    endDate,
    capital: 1000000,
    executionMode: 'sync',
    strategyMode: 'BTST_STBT_DRIVEN',
    strategyVariant: variant
  });

  await BacktestService.processRun(jobId!);

  const run = await prisma.backtestRun.findUnique({
    where: { id: jobId! },
    include: { metrics: true }
  });

  if (!run || !run.metrics) {
    console.error('Failed to retrieve metrics for run');
    return;
  }

  const trades = await prisma.trade.findMany({
    where: { backtestRunId: run.id }
  });
  
  const closedTrades = trades.filter(t => t.status.startsWith('CLOSED'));

  console.log(`\n--- RESULTS FOR ${variant.toUpperCase()} ---`);
  const wins = closedTrades.filter(t => t.pnl && t.pnl > 0).length;
  const losses = closedTrades.filter(t => t.pnl && t.pnl <= 0).length;
  console.log(`Total Trades Triggered/Closed: ${closedTrades.length}`);
  console.log(`Wins: ${wins}, Losses: ${losses}`);
  console.log(`Win Rate: ${run.metrics.winRate.toFixed(2)}%`);
  console.log(`Expectancy: Rs ${(run.metrics.expectancy * 1000).toFixed(2)} / ${run.metrics.expectancy.toFixed(4)}R`);

  console.log(`\n--- BY SCORE BAND ---`);
  for (const band of [10, 25, 40, 45]) {
    const bandTrades = closedTrades.filter(t => (t.score || 0) >= band);
    const bandWins = bandTrades.filter(t => t.pnl && t.pnl > 0).length;
    let bandPnl = 0;
    for (const t of bandTrades) bandPnl += t.pnl || 0;
    const exp = bandTrades.length > 0 ? bandPnl / bandTrades.length : 0;
    
    console.log(`Score >= ${band}: ${bandWins}/${bandTrades.length} (${bandTrades.length > 0 ? (bandWins / bandTrades.length * 100).toFixed(2) : 0}%) | Exp: Rs ${exp.toFixed(2)}`);
  }
}

async function main() {
  await runVariant('baseline');
  await runVariant('no_vdu_weighted');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
