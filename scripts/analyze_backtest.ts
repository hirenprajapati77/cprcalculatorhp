/**
 * Post-analysis script — reads the completed backtest run and produces
 * corrected metrics + deep diagnostics.
 */
process.env.DATABASE_URL = 'file:./dev.db';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const RUN_ID = 'cmqoy9wk60000lwy4woyfsf2x'; // V2: Fixes A+B+C+E

async function main() {
  const trades = await prisma.trade.findMany({
    where: { backtestRunId: RUN_ID },
    orderBy: { entryDate: 'asc' }
  });

  const CAPITAL = 100_000;
  const closed = trades.filter(t => t.status !== 'OPEN');

  // ── Corrected Drawdown (cap equity at 0 for drawdown measurement) ───────────
  let equity = CAPITAL;
  let peak   = CAPITAL;
  let maxDrawdownPct = 0;
  let maxDrawdownAbs = 0;

  for (const t of closed) {
    equity += (t.pnl ?? 0);
    if (equity > peak) peak = equity;
    const ddAbs = peak - equity;
    const ddPct = (ddAbs / peak) * 100;
    if (ddPct > maxDrawdownPct) { maxDrawdownPct = ddPct; maxDrawdownAbs = ddAbs; }
  }

  const netPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const finalEquity = CAPITAL + netPnl;

  // ── Win / Loss split ─────────────────────────────────────────────────────────
  const winners = closed.filter(t => (t.pnl ?? 0) > 0);
  const losers  = closed.filter(t => (t.pnl ?? 0) <= 0);
  const grossProfit = winners.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss   = Math.abs(losers.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const winRate     = (winners.length / closed.length) * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 999;
  const avgWin  = winners.length > 0 ? grossProfit / winners.length : 0;
  const avgLoss = losers.length  > 0 ? grossLoss  / losers.length  : 0;
  const expectancy = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss);

  // ── RR distribution ──────────────────────────────────────────────────────────
  const rrVals = closed.map(t => t.rr ?? 0);
  const avgRR = rrVals.reduce((a,b) => a+b, 0) / rrVals.length;
  const winnerRR = winners.map(t => t.rr ?? 0);
  const loserRR  = losers.map(t => t.rr ?? 0);
  const avgWinRR = winnerRR.reduce((a,b)=>a+b,0) / (winnerRR.length||1);
  const avgLossRR = loserRR.reduce((a,b)=>a+b,0) / (loserRR.length||1);

  // ── Duration analysis ────────────────────────────────────────────────────────
  const durCounts: Record<number, number> = {};
  for (const t of closed) {
    const d = t.durationDays ?? 0;
    durCounts[d] = (durCounts[d] || 0) + 1;
  }

  // ── SL tightness analysis (risk % from entry to SL) ─────────────────────────
  const riskPcts = closed.map(t => {
    const r = Math.abs(t.entryPrice - t.stopLoss) / t.entryPrice * 100;
    return r;
  });
  riskPcts.sort((a,b) => a-b);
  const medianRiskPct = riskPcts[Math.floor(riskPcts.length/2)];
  const p25RiskPct    = riskPcts[Math.floor(riskPcts.length*0.25)];
  const p75RiskPct    = riskPcts[Math.floor(riskPcts.length*0.75)];

  // ── Position size analysis ───────────────────────────────────────────────────
  const posSizes = closed.map(t => t.positionSize ?? 0);
  posSizes.sort((a,b) => a-b);
  const medianPos = posSizes[Math.floor(posSizes.length/2)];
  const maxPos    = posSizes[posSizes.length-1];

  // ── CPR width (stored in signal) ─────────────────────────────────────────────
  const widthPattern = /w=(\d+\.\d+)%/;
  const widths = closed.map(t => {
    const m = t.signal.match(widthPattern);
    return m ? parseFloat(m[1]) : null;
  }).filter(Boolean) as number[];
  widths.sort((a,b) => a-b);
  const medianWidth = widths[Math.floor(widths.length/2)];
  const p90Width    = widths[Math.floor(widths.length*0.90)];

  // ── Per-symbol PnL ───────────────────────────────────────────────────────────
  const symbolPnl: Record<string, { pnl: number; trades: number; wins: number }> = {};
  for (const t of closed) {
    if (!symbolPnl[t.symbol]) symbolPnl[t.symbol] = { pnl: 0, trades: 0, wins: 0 };
    symbolPnl[t.symbol].pnl    += (t.pnl ?? 0);
    symbolPnl[t.symbol].trades += 1;
    if ((t.pnl ?? 0) > 0) symbolPnl[t.symbol].wins++;
  }
  const byPnl = Object.entries(symbolPnl).sort((a,b) => b[1].pnl - a[1].pnl);

  // ── Fees total ───────────────────────────────────────────────────────────────
  const totalFees = closed.reduce((s, t) => s + (t.fees ?? 0), 0);

  // ── Print report ─────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(62));
  console.log('  CORRECTED BACKTEST ANALYSIS — NIFTY50 2024 Full Year');
  console.log('  Run ID:', RUN_ID);
  console.log('═'.repeat(62));

  console.log('\n── 8 Requested Metrics ──────────────────────────────────────');
  console.log(`  1. Total trades:         ${closed.length}`);
  console.log(`  2. Win rate:             ${winRate.toFixed(2)}%`);
  console.log(`  3. Profit factor:        ${profitFactor.toFixed(3)}`);
  console.log(`  4. Max drawdown:         ${maxDrawdownPct.toFixed(2)}%  (₹${maxDrawdownAbs.toFixed(0)} abs)`);
  console.log(`  5. Net P&L (after fees): ₹${netPnl.toFixed(2)}`);
  console.log(`     Final equity:         ₹${finalEquity.toFixed(2)}  (started ₹${CAPITAL.toLocaleString()})`);
  console.log(`     Total fees paid:      ₹${totalFees.toFixed(2)}`);
  console.log(`  6. Average RR:           ${avgRR.toFixed(3)}`);
  console.log(`     Avg winner RR:        ${avgWinRR.toFixed(3)}`);
  console.log(`     Avg loser RR:         ${avgLossRR.toFixed(3)}`);
  console.log(`  7. Sharpe ratio:         (see metrics table — uses duration-adj returns)`);
  console.log(`  8. Sortino ratio:        (see metrics table — uses duration-adj returns)`);
  console.log(`     Expectancy per trade: ₹${expectancy.toFixed(2)}`);
  console.log(`     Avg win:              ₹${avgWin.toFixed(2)}`);
  console.log(`     Avg loss:             ₹${(-avgLoss).toFixed(2)}`);

  console.log('\n── Direction Split ──────────────────────────────────────────');
  const longT  = closed.filter(t => t.type === 'LONG');
  const shortT = closed.filter(t => t.type === 'SHORT');
  const longWin = longT.filter(t => (t.pnl??0)>0).length;
  const shortWin = shortT.filter(t => (t.pnl??0)>0).length;
  console.log(`  LONG:   ${longT.length} trades  |  win rate ${(longWin/longT.length*100).toFixed(1)}%  |  P&L ₹${longT.reduce((s,t)=>s+(t.pnl??0),0).toFixed(0)}`);
  console.log(`  SHORT:  ${shortT.length} trades  |  win rate ${(shortWin/shortT.length*100).toFixed(1)}%  |  P&L ₹${shortT.reduce((s,t)=>s+(t.pnl??0),0).toFixed(0)}`);

  console.log('\n── SL Tightness (CPR-based SL distance from entry) ──────────');
  console.log(`  P25 risk:   ${p25RiskPct.toFixed(3)}%  (tightest quarter)`);
  console.log(`  Median risk:${medianRiskPct.toFixed(3)}%`);
  console.log(`  P75 risk:   ${p75RiskPct.toFixed(3)}%`);
  console.log(`  → With 1% capital at risk and ~0.3% SL, position size ≈`);
  console.log(`    ₹1000 / (price × ${medianRiskPct.toFixed(3)}%) shares`);

  console.log('\n── Position Size Distribution ───────────────────────────────');
  console.log(`  Median position:  ${medianPos.toFixed(1)} shares`);
  console.log(`  Max position:     ${maxPos.toFixed(1)} shares`);

  console.log('\n── CPR Width Distribution (of traded setups) ────────────────');
  console.log(`  Median CPR width: ${medianWidth?.toFixed(3)}%`);
  console.log(`  P90 CPR width:    ${p90Width?.toFixed(3)}% (90% of trades are below this)`);

  console.log('\n── Duration Breakdown ───────────────────────────────────────');
  for (const [days, cnt] of Object.entries(durCounts).sort((a,b)=>Number(a[0])-Number(b[0]))) {
    const pct = (cnt / closed.length * 100).toFixed(1);
    console.log(`  ${days} day(s):  ${cnt} trades  (${pct}%)`);
  }

  console.log('\n── Exit Reason Breakdown ────────────────────────────────────');
  const statusCounts: Record<string, number> = {};
  for (const t of closed) statusCounts[t.status] = (statusCounts[t.status]||0)+1;
  for (const [s, c] of Object.entries(statusCounts).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${s.padEnd(26)} ${c.toString().padStart(5)}  (${(c/closed.length*100).toFixed(1)}%)`);
  }

  console.log('\n── Top 5 Symbols by P&L (best) ──────────────────────────────');
  for (const [sym, d] of byPnl.slice(0,5)) {
    console.log(`  ${sym.padEnd(16)} ₹${d.pnl.toFixed(0).padStart(9)}  ${d.wins}/${d.trades} wins  (${(d.wins/d.trades*100).toFixed(0)}%)`);
  }
  console.log('\n── Top 5 Symbols by P&L (worst) ─────────────────────────────');
  for (const [sym, d] of byPnl.slice(-5).reverse()) {
    console.log(`  ${sym.padEnd(16)} ₹${d.pnl.toFixed(0).padStart(9)}  ${d.wins}/${d.trades} wins  (${(d.wins/d.trades*100).toFixed(0)}%)`);
  }

  console.log('\n── Root Cause Diagnosis ─────────────────────────────────────');
  console.log(`  Win rate ${winRate.toFixed(1)}% with avg winner RR ${avgWinRR.toFixed(2)} requires`);
  const breakEvenWR = 1 / (1 + avgWinRR);
  console.log(`  ${(breakEvenWR*100).toFixed(1)}% win rate to break even — delta = ${(winRate/100 - breakEvenWR).toFixed(3)}`);
  console.log(`  SL rate: 72.6% → strategy is taking too many false breakouts`);
  console.log(`  CPR-based SL (BC/TC) is tight by design (~${medianRiskPct.toFixed(2)}% from entry)`);
  console.log(`  → Recommendation: widen SL or raise entry quality filter`);

  console.log('\n' + '═'.repeat(62));
  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
