import { PrismaClient } from '@prisma/client';
import { BacktestService } from '../src/services/backtest/backtest.service';
import { MetricsService } from '../src/services/backtest/metrics.service';
import { MarketService } from '../src/services/market.service';

const prisma = new PrismaClient();

// ============================================================================
// SMOKE TEST CONFIGURATION
// ============================================================================
export const SYMBOLS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 
  'BHARTIARTL', 'SBIN', 'ITC', 'LTIM', 'HINDUNILVR', 
  'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA'
];
export const START_DATE = '2024-01-01';
export const END_DATE = '2024-12-31';
export const CAPITAL = 1000000;
export const RISK_MODEL = 'Capital%';
export const RISK_VALUE = 5.0; // 5% allocation per trade, no leverage
// ============================================================================

async function main() {
  console.log('=== BACKTEST SMOKE TEST CONFIGURATION ===');
  console.log(`Symbols:      ${SYMBOLS.join(', ')}`);
  console.log(`Start Date:   ${START_DATE}`);
  console.log(`End Date:     ${END_DATE}`);
  console.log(`Capital:      ${CAPITAL}`);
  console.log(`Risk Model:   ${RISK_MODEL}`);
  console.log(`Risk Value:   ${RISK_VALUE}`);
  console.log('=========================================\n');

  const run = await prisma.backtestRun.create({
    data: {
      name: 'TASK_F_SMOKE_TEST',
      universe: 'NIFTY50',
      startDate: new Date(START_DATE),
      endDate: new Date(END_DATE),
      capital: CAPITAL,
      riskModel: RISK_MODEL,
      executionMode: 'conservative',
      riskValue: RISK_VALUE,
      status: 'QUEUED',
      strategyMode: 'SCANNER_DRIVEN',
      metricsVersion: 1
    }
  });

  console.log(`Created temporary BacktestRun: ${run.id}`);

  // Override MarketService.getUniverse to use only the configured symbols
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
    process.env.HISTORICAL_MODE = 'live';
    console.log('Processing run with Yahoo Finance live data...');
    await BacktestService.processRun(run.id);

    console.log('Fetching trades...');
    const trades = await prisma.trade.findMany({
      where: { backtestRunId: run.id }
    });

    const total = trades.length;
    const neverTriggered = trades.filter(t => t.status === 'NEVER_TRIGGERED').length;
    const triggered = total - neverTriggered;

    // Trigger Delay Histogram
    const delayHistogram: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    trades.forEach(t => {
      if (t.status !== 'NEVER_TRIGGERED' && t.triggerDelayDays !== null) {
        delayHistogram[t.triggerDelayDays] = (delayHistogram[t.triggerDelayDays] || 0) + 1;
      }
    });

    // Exit Reason Breakdown
    const exitReasons: Record<string, number> = {};
    trades.forEach(t => {
      if (t.status !== 'NEVER_TRIGGERED') {
        const reason = t.exitReason || 'Unknown';
        exitReasons[reason] = (exitReasons[reason] || 0) + 1;
      }
    });

    // Advanced Metrics
    const metricsResult = MetricsService.computeMetricsFromTrades(trades, CAPITAL);

    console.log('\n======================================');
    console.log('       SIGNAL TRIGGER STATISTICS      ');
    console.log('======================================');
    console.log(`Total Setup Candidates:  ${total}`);
    console.log(`Triggered / Filled:      ${triggered} (${total > 0 ? ((triggered / total) * 100).toFixed(2) : 0}%)`);
    console.log(`NEVER_TRIGGERED:         ${neverTriggered} (${total > 0 ? ((neverTriggered / total) * 100).toFixed(2) : 0}%)`);
    
    console.log('\n--- Trigger Delay Histogram (Days to Fill) ---');
    for (let day = 1; day <= 5; day++) {
      const count = delayHistogram[day] || 0;
      const pct = triggered > 0 ? ((count / triggered) * 100).toFixed(2) : '0.00';
      console.log(`  Day ${day}: ${count.toString().padEnd(3)} (${pct}%)`);
    }

    console.log('\n--- EXIT REASON BREAKDOWN (20-day safety valve) ---');
    for (const [reason, count] of Object.entries(exitReasons)) {
      console.log(`  ${reason.padEnd(45)}: ${count} (${((count / triggered) * 100).toFixed(2)}%)`);
    }

    console.log('\n======================================');
    console.log('      VALIDATION ANALYSIS (TASK C)    ');
    console.log('======================================');
    console.log('General Execution Metrics (excluding NEVER_TRIGGERED):');
    console.log(JSON.stringify(metricsResult.metrics, null, 2));

    console.log('\n--- Win Rate & Expectancy by Signal Tag ---');
    console.log(JSON.stringify(metricsResult.signalAnalysis, null, 2));

    console.log('\n--- Win Rate & Expectancy by Score Band ---');
    console.log(JSON.stringify(metricsResult.scoreBandAnalysis, null, 2));
    console.log('======================================\n');

  } catch (error) {
    console.error('Smoke test failed:', error);
  } finally {
    // Clean up
    console.log('Cleaning up temporary BacktestRun and Trades...');
    await prisma.trade.deleteMany({ where: { backtestRunId: run.id } });
    await prisma.backtestRun.delete({ where: { id: run.id } });
    MarketService.getUniverse = originalGetUniverse;
    await prisma.$disconnect();
  }
}

main();
