/**
 * Local backtest runner — bypasses HTTP API, calls BacktestService directly.
 * Runs against local SQLite dev.db with HISTORICAL_MODE=live (real Yahoo Finance data).
 *
 * Usage: npx tsx scripts/run_local_backtest.ts
 */

// Must set env vars BEFORE any imports that read them
process.env.HISTORICAL_MODE = 'live';
process.env.BACKTEST_EXECUTION_MODE = 'sync';
process.env.DATABASE_URL = 'file:./dev.db';

import { PrismaClient } from '@prisma/client';
import { BacktestService } from '../src/services/backtest/backtest.service';
import { MarketService } from '../src/services/market.service';

const prisma = new PrismaClient();

async function main() {
  const START_DATE = '2024-01-01';
  const END_DATE   = '2024-12-31';
  const UNIVERSE   = 'NIFTY50';
  const CAPITAL    = 100000;

  console.log('='.repeat(60));
  console.log('LOCAL BACKTEST RUNNER — Fixed Code Validation');
  console.log('='.repeat(60));
  console.log(`Universe:  ${UNIVERSE}`);
  console.log(`Period:    ${START_DATE} → ${END_DATE}`);
  console.log(`Capital:   ₹${CAPITAL.toLocaleString()}`);
  console.log(`Mode:      HISTORICAL_MODE=live (Yahoo Finance)`);
  console.log('='.repeat(60));

  // Get universe symbol count
  const universeStocks = MarketService.getUniverse(UNIVERSE as 'NIFTY50');
  console.log(`Symbols in universe: ${universeStocks.length}`);
  console.log('');

  // Create the run record directly (bypass submitRun to avoid queue)
  const run = await prisma.backtestRun.create({
    data: {
      name: `LOCAL_VALIDATION_V3_FIXES_ABCE_${START_DATE}_${END_DATE}`,
      universe: UNIVERSE,
      startDate: new Date(START_DATE),
      endDate:   new Date(END_DATE),
      capital:   CAPITAL,
      riskModel: 'Risk%',
      executionMode: 'conservative',
      riskValue: 1.0,
      status: 'QUEUED',
      metricsVersion: 2,
    }
  });

  console.log(`Run created: ${run.id}`);
  console.log('Processing... (fetching live Yahoo Finance data — may take 5-15 min)\n');

  const t0 = Date.now();

  // Track per-symbol outcomes by instrumenting around processRun
  // We read trades before and after per-symbol to detect zero-trade symbols
  const symbolsWithTrades = new Set<string>();
  const symbolErrors: string[] = [];

  // Monkey-patch console.error to capture symbol errors
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = args.map(a => String(a)).join(' ');
    if (msg.includes('failed backtest:')) {
      const match = msg.match(/Symbol (\S+) failed backtest/);
      if (match) symbolErrors.push(match[1]);
    }
    originalConsoleError(...args);
  };

  try {
    await BacktestService.processRun(run.id);
  } catch (err) {
    console.error('processRun threw:', err);
  } finally {
    console.error = originalConsoleError;
  }

  const elapsedMs = Date.now() - t0;
  console.log(`\nProcessing complete in ${(elapsedMs / 1000).toFixed(1)}s`);

  // ── Fetch results ──────────────────────────────────────────────────────────
  const completedRun = await prisma.backtestRun.findUnique({
    where: { id: run.id },
    include: { metrics: true }
  });

  const trades = await prisma.trade.findMany({
    where: { backtestRunId: run.id },
  });

  // Per-symbol trade counts
  const symbolTradeCounts: Record<string, number> = {};
  let longCount = 0;
  let shortCount = 0;
  let netPnl = 0;

  for (const t of trades) {
    symbolTradeCounts[t.symbol] = (symbolTradeCounts[t.symbol] || 0) + 1;
    symbolsWithTrades.add(t.symbol);
    if (t.type === 'LONG')  longCount++;
    if (t.type === 'SHORT') shortCount++;
    netPnl += (t.pnl ?? 0);
  }

  const allSymbols = universeStocks.map(s => s.symbol);
  const zeroTradeSymbols = allSymbols.filter(s => !symbolsWithTrades.has(s) && !symbolErrors.includes(s));

  const m = completedRun?.metrics;

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log('═'.repeat(60));
  console.log('  BACKTEST RESULTS');
  console.log('═'.repeat(60));

  console.log('\n── Core Metrics ──────────────────────────────────────────');
  console.log(`  1. Total trades:      ${trades.length}`);
  console.log(`  2. Win rate:          ${m?.winRate != null ? m.winRate.toFixed(2) + '%' : 'N/A'}`);
  console.log(`  3. Profit factor:     ${m?.profitFactor != null ? m.profitFactor.toFixed(3) : 'N/A'}`);
  console.log(`  4. Max drawdown:      ${m?.maxDrawdown != null ? m.maxDrawdown.toFixed(2) + '%' : 'N/A'}`);
  console.log(`  5. Net P&L (w/ fees): ₹${netPnl.toFixed(2)}`);
  console.log(`  6. Average RR:        ${m?.avgRR != null ? m.avgRR.toFixed(3) : 'N/A'}`);
  console.log(`  7. Sharpe ratio:      ${m?.sharpe != null ? m.sharpe.toFixed(2) : 'N/A'}`);
  console.log(`  8. Sortino ratio:     ${m?.sortino != null ? m.sortino.toFixed(2) : 'N/A'}`);
  console.log(`     Expectancy:        ${m?.expectancy != null ? m.expectancy.toFixed(2) : 'N/A'}`);

  console.log('\n── Direction Split ──────────────────────────────────────');
  console.log(`  LONG trades:          ${longCount}`);
  console.log(`  SHORT trades:         ${shortCount}`);

  console.log('\n── CPR Width Filter Diagnostics ─────────────────────────');
  console.log(`  Symbols with trades:  ${symbolsWithTrades.size} / ${allSymbols.length}`);
  console.log(`  Zero-trade symbols:   ${zeroTradeSymbols.length}`);
  if (zeroTradeSymbols.length > 0) {
    console.log(`    → ${zeroTradeSymbols.join(', ')}`);
  }

  console.log('\n── Data Fetch Errors ────────────────────────────────────');
  console.log(`  Symbols errored:      ${symbolErrors.length}`);
  if (symbolErrors.length > 0) {
    console.log(`    → ${symbolErrors.join(', ')}`);
  }

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  for (const t of trades) {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  }
  console.log('\n── Exit Reason Breakdown ────────────────────────────────');
  for (const [status, count] of Object.entries(statusCounts).sort((a,b) => b[1]-a[1])) {
    const pct = (count / trades.length * 100).toFixed(1);
    console.log(`  ${status.padEnd(24)} ${count.toString().padStart(4)}  (${pct}%)`);
  }

  // Top 5 winners and losers
  const sortedByPnl = [...trades].sort((a,b) => (b.pnl ?? 0) - (a.pnl ?? 0));
  console.log('\n── Top 5 Winners ────────────────────────────────────────');
  for (const t of sortedByPnl.slice(0, 5)) {
    console.log(`  ${t.symbol.padEnd(16)} ${t.type.padEnd(6)} ₹${(t.pnl ?? 0).toFixed(2).padStart(10)}  RR: ${(t.rr ?? 0).toFixed(2)}`);
  }
  console.log('\n── Top 5 Losers ─────────────────────────────────────────');
  for (const t of sortedByPnl.slice(-5).reverse()) {
    console.log(`  ${t.symbol.padEnd(16)} ${t.type.padEnd(6)} ₹${(t.pnl ?? 0).toFixed(2).padStart(10)}  RR: ${(t.rr ?? 0).toFixed(2)}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`Run ID: ${run.id}  (stored in local SQLite dev.db)`);
  console.log('═'.repeat(60));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
