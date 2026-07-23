/**
 * scripts/analyse_index_btst_vix_split.js
 *
 * Throwaway analysis — do NOT commit to main app.
 *
 * Re-derives the same 74 trades from the 3-month INDEX_BTST smoke-test
 * window (2026-04-01 → 2026-07-01) using the identical signal logic as
 * backtest.service.ts, then segments by:
 *
 *   Group A: vixCalm === 25  (India VIX was genuinely calm, ≤ 20.0)
 *   Group B: vixCalm === 0   (setup passed 59-pt floor on CPR structure
 *                             alone; VIX was 20.0 < vix < 25.0)
 *
 * Reports per symbol + combined, no rounding of small-sample groups.
 * No conclusions drawn — raw numbers only.
 *
 * Run: node scripts/analyse_index_btst_vix_split.js
 */

'use strict';
const https = require('https');

// ── Constants matching production thresholds ─────────────────────────────────
const INDIA_VIX_CALM_MAX     = 20.0;
const INDIA_VIX_ELEVATED_MIN = 25.0;
const SCORE_FLOOR            = 59;   // out of 90 (vwap+liquidity excluded)

const INSTRUMENTS = [
  { symbol: 'NIFTY',     yahooSymbol: '^NSEI'   },
  { symbol: 'BANKNIFTY', yahooSymbol: '^NSEBANK' },
  { symbol: 'SENSEX',    yahooSymbol: '^BSESN'  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchYahooChart(symbol, period1, period2) {
  return new Promise((resolve, reject) => {
    const url =
      'https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(symbol) +
      '?period1=' + period1 + '&period2=' + period2 + '&interval=1d';

    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try {
          const json   = JSON.parse(body);
          const result = json && json.chart && json.chart.result && json.chart.result[0];
          if (!result || !result.timestamp) return resolve([]);
          const ts     = result.timestamp;
          const quotes = result.indicators && result.indicators.quote && result.indicators.quote[0];
          const out    = [];
          for (let i = 0; i < ts.length; i++) {
            if (quotes && quotes.close && quotes.close[i] !== null && quotes.close[i] !== undefined) {
              out.push({
                date:   new Date(ts[i] * 1000).toISOString().split('T')[0],
                open:   quotes.open[i],
                high:   quotes.high[i],
                low:    quotes.low[i],
                close:  quotes.close[i],
                volume: quotes.volume[i] || 0,
              });
            }
          }
          resolve(out);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

/** Mirrors production calculateCPR (pivot / bc / tc / classification). */
function calculateCPR(d) {
  const pivot = (d.high + d.low + d.close) / 3;
  const bc    = (d.high + d.low) / 2;
  const tc    = (pivot - bc) + pivot;
  const tcF   = tc < bc ? bc : tc;
  const bcF   = tc < bc ? tc : bc;
  const width = Math.abs(tcF - bcF) / pivot * 100;
  return { pivot, bc: bcF, tc: tcF, classification: width < 0.3 ? 'NARROW' : 'WIDE' };
}

// ── Metrics printer ───────────────────────────────────────────────────────────
function printTable(label, trades) {
  const n   = trades.length;
  const col = w => String(label).padEnd(20) + ' | ' + w;

  if (n === 0) {
    console.log(col(label) + ': 0 trades — (no data)');
    return;
  }

  const wins   = trades.filter(t => t.pnlPct > 0);
  const losses = trades.filter(t => t.pnlPct <= 0);

  const avgWin  = wins.length   > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length   : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
  const exp     = (wins.length / n) * avgWin + (losses.length / n) * avgLoss;
  const realRR  = avgLoss !== 0 ? (avgWin / Math.abs(avgLoss)).toFixed(2) : 'N/A';

  const dist = {};
  trades.forEach(t => { dist[t.exitReason] = (dist[t.exitReason] || 0) + 1; });

  console.log('Trades:           ' + n + '  (' + wins.length + 'W / ' + losses.length + 'L)');
  console.log('Win Rate:         ' + (wins.length / n * 100).toFixed(1) + '%');
  console.log('Avg Win:          +' + avgWin.toFixed(3) + '%');
  console.log('Avg Loss:         ' + avgLoss.toFixed(3) + '%');
  console.log('Expectancy:       ' + exp.toFixed(3) + '% per trade');
  console.log('Realized R:R:     ' + realRR + '  (target formula = 1:2.0)');
  const slH  = dist['SL_HIT']     || 0;
  const eod  = dist['EOD_EXIT']   || 0;
  const tgtH = dist['TARGET_HIT'] || 0;
  console.log('Exit Distribution: SL_HIT=' + slH + '  EOD_EXIT=' + eod + '  TARGET_HIT=' + tgtH);
}

function printGroup(groupLabel, tradesBySymbol) {
  const symbols = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
  const all = [];

  console.log('');
  console.log('━━━ ' + groupLabel + ' ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const sym of symbols) {
    const rows = tradesBySymbol[sym] || [];
    all.push(...rows);
    console.log('');
    console.log('  [' + sym + '] (n=' + rows.length + ')');
    printTable(sym, rows);
  }

  console.log('');
  console.log('  [ALL COMBINED] (n=' + all.length + ')');
  printTable('ALL', all);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const START = '2026-04-01T00:00:00Z';
  const END   = '2026-07-01T00:00:00Z';
  const p1    = Math.floor(new Date(START).getTime() / 1000);
  const p2    = Math.floor(new Date(END).getTime()   / 1000);

  console.log('');
  console.log('INDEX BTST VIX-SPLIT ANALYSIS');
  console.log('Window: ' + START.split('T')[0] + ' → ' + END.split('T')[0]);
  console.log('Group A: vixCalm=25  (India VIX ≤ 20.0 on signal day)');
  console.log('Group B: vixCalm=0   (20.0 < India VIX < 25.0 — CPR structure only passed floor)');
  console.log('Score floor: ' + SCORE_FLOOR + '/90  |  Target formula: entry + risk × 2.0');

  // Prefetch VIX
  process.stdout.write('\nFetching ^INDIAVIX...');
  const vixHistory = await fetchYahooChart('^INDIAVIX', p1, p2);
  const vixMap = new Map();
  vixHistory.forEach(v => vixMap.set(v.date, v.close));
  console.log(' ' + vixHistory.length + ' candles loaded.');

  // Per-group buckets: { NIFTY: [], BANKNIFTY: [], SENSEX: [] }
  const groupA = { NIFTY: [], BANKNIFTY: [], SENSEX: [] };
  const groupB = { NIFTY: [], BANKNIFTY: [], SENSEX: [] };

  for (const inst of INSTRUMENTS) {
    await sleep(400);
    process.stdout.write('Fetching ' + inst.yahooSymbol + '...');
    const ohlc = await fetchYahooChart(inst.yahooSymbol, p1, p2);
    console.log(' ' + ohlc.length + ' candles.');

    let vixMiss = 0;

    for (let i = 1; i < ohlc.length - 1; i++) {
      const yesterday = ohlc[i - 1];
      const today     = ohlc[i];
      const nextDay   = ohlc[i + 1];

      // ── Gate 1: Missing VIX → score invalid → skip ───────────────────────
      const vixClose = vixMap.get(today.date);
      if (vixClose === undefined || vixClose === null) { vixMiss++; continue; }

      // ── Gate 2: Elevated VIX → forced IGNORE ─────────────────────────────
      if (vixClose >= INDIA_VIX_ELEVATED_MIN) continue;

      // ── Gate 3: Red session (<= -0.10%) ──────────────────────────────────
      const sessionChangePct = (today.close - yesterday.close) / yesterday.close;
      if (sessionChangePct <= -0.001) continue;

      // ── Score ─────────────────────────────────────────────────────────────
      const todayCpr    = calculateCPR(yesterday);
      const tomorrowCpr = calculateCPR(today);

      const vixCalmPts    = vixClose <= INDIA_VIX_CALM_MAX ? 25 : 0;
      const cprNarrowPts  = tomorrowCpr.classification === 'NARROW' ? 30 : 0;
      const higherValPts  = (tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc) ? 20 : 0;
      const clStrengthPts = (today.high > today.low &&
                            (today.close - today.low) / (today.high - today.low) > 0.70) ? 15 : 0;
      const totalScore    = vixCalmPts + cprNarrowPts + higherValPts + clStrengthPts;

      if (totalScore < SCORE_FLOOR) continue;

      // ── Entry / SL / Target (exact production formula) ────────────────────
      const entry  = today.close * 1.0005;          // 0.05% slippage proxy
      const sl     = Math.min(today.low, tomorrowCpr.bc);
      const risk   = entry - sl;
      if (risk <= 0) continue;
      const target = entry + risk * 2.0;

      // ── Exit simulation ───────────────────────────────────────────────────
      let exitPrice, exitReason;
      if      (nextDay.low  <= sl)     { exitPrice = sl;     exitReason = 'SL_HIT';     }
      else if (nextDay.high >= target) { exitPrice = target; exitReason = 'TARGET_HIT'; }
      else                             { exitPrice = nextDay.close; exitReason = 'EOD_EXIT'; }

      const pnlPct = (exitPrice - entry) / entry * 100;

      const trade = {
        symbol:     inst.symbol,
        date:       today.date,
        score:      totalScore,
        vixCalmPts,
        vixClose,
        pnlPct,
        exitReason,
      };

      if (vixCalmPts === 25) groupA[inst.symbol].push(trade);
      else                   groupB[inst.symbol].push(trade);
    }

    if (vixMiss > 0) {
      console.log('  → ' + vixMiss + ' candle(s) for ' + inst.symbol + ' had no VIX match (skipped — score invalid)');
    }
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  const totalA = Object.values(groupA).reduce((s, a) => s + a.length, 0);
  const totalB = Object.values(groupB).reduce((s, a) => s + a.length, 0);
  console.log('');
  console.log('Total trades: ' + (totalA + totalB) + '  →  Group A (vixCalm=25): ' + totalA + '  |  Group B (vixCalm=0): ' + totalB);

  printGroup('GROUP A — vixCalm=25  (India VIX ≤ 20.0)', groupA);
  printGroup('GROUP B — vixCalm=0   (20.0 < India VIX < 25.0)', groupB);

  console.log('');
  console.log('━━━ END OF ANALYSIS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(err => { console.error(err); process.exit(1); });
