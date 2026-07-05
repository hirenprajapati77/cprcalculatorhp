import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import { BacktestService } from '../src/services/backtest/backtest.service';

const prisma = new PrismaClient();

const SYMBOLS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 
  'BHARTIARTL', 'SBIN', 'ITC', 'HINDUNILVR', 
  'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'KOTAKBANK'
];

async function runVariant(variant: 'baseline' | 'no_vdu_weighted') {
  const startDate = '2024-01-01';
  const endDate = '2024-12-31';
  const runName = `TASK_P_${variant.toUpperCase()}`;

  console.log(`\n=========================================`);
  console.log(`RUNNING VARIANT: ${variant.toUpperCase()}`);
  console.log(`=========================================`);
  console.log(`Config Header:`);
  console.log(`- Universe: ${SYMBOLS.length} symbols (Legacy Task M list)`);
  console.log(`- Date Range: ${startDate} to ${endDate}`);
  console.log(`- Risk Model: Capital%`);
  console.log(`- Risk Value: 5.0`);
  console.log(`- Execution Mode: conservative`);
  console.log(`- Strategy Mode: BTST_STBT_DRIVEN`);
  console.log(`- Strategy Variant: ${variant}`);
  console.log(`=========================================\n`);

  // Force environment to match Task M execution
  process.env.HISTORICAL_MODE = 'live';

  const runCreated = await prisma.backtestRun.create({
    data: {
      name: runName,
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

  console.log(`\n--- BY SCORE BAND (MIN_SAMPLE=15) ---`);
  const bands = [10, 15, 20, 25, 30, 35, 40, 45, 50];
  for (let i = 0; i < bands.length - 1; i++) {
    const min = bands[i];
    const max = bands[i + 1] - 1;
    const bandTrades = closedTrades.filter(t => {
      const s = Math.floor(t.score || 0);
      return s >= min && s <= max;
    });

    if (bandTrades.length < 15) {
      console.log(`Score ${min}-${max}: <15 samples (${bandTrades.length})`);
      continue;
    }

    const bandWins = bandTrades.filter(t => t.pnl && t.pnl > 0).length;
    let bandPnl = 0;
    for (const t of bandTrades) bandPnl += t.pnl || 0;
    const exp = bandPnl / bandTrades.length;
    const wr = (bandWins / bandTrades.length) * 100;
    
    console.log(`Score ${min}-${max}: ${bandWins}/${bandTrades.length} (${wr.toFixed(2)}%) | Exp: Rs ${exp.toFixed(2)}`);
  }
}

async function main() {
  await runVariant('baseline');
  await runVariant('no_vdu_weighted');
}

main().catch(console.error).finally(async () => { await prisma.$disconnect(); });
