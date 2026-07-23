/**
 * scripts/analyse_depth1_vs_depth2.js
 *
 * Throwaway — do NOT commit to main app.
 *
 * Compares itmDepth=1 (original) vs itmDepth=2 (new INDEX_BTST_PREFER_DEEPER_ITM=true)
 * option cost and option-adjusted expectancy over the same 844-trade 2-year window.
 *
 * [MODELED] throughout — BS theta with 20-day realised vol as IV proxy.
 * Historical bid/ask not available. See analyse_option_cost_bs_model.js for full disclaimer.
 *
 * CE strike model (mirrors OptionSuggestionService ITM candidate pool):
 *   depth=1 → highest strike below spot  (1 increment below ATM)
 *   depth=2 → second strike below spot   (2 increments below ATM)
 *
 * P&L model: 0.50 × raw_underlying_pct − cost_pct
 *   (delta=0.50 applied uniformly; see note at bottom re: actual delta difference)
 *
 * Run: node scripts/analyse_depth1_vs_depth2.js
 */

'use strict';
const https = require('https');

const INDIA_VIX_CALM_MAX     = 20.0;
const INDIA_VIX_ELEVATED_MIN = 25.0;
const SCORE_FLOOR            = 59;
const DELTA                  = 0.50;
const INC                    = { NIFTY: 50, BANKNIFTY: 100, SENSEX: 100 };
const SPREAD_PCT_OF_PREMIUM  = { NIFTY: 0.005, BANKNIFTY: 0.005, SENSEX: 0.010 };
const MIN_TICK               = 0.05;

const INSTRUMENTS = [
  { symbol: 'NIFTY',     yahooSymbol: '^NSEI'   },
  { symbol: 'BANKNIFTY', yahooSymbol: '^NSEBANK' },
  { symbol: 'SENSEX',    yahooSymbol: '^BSESN'  },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const a = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * p;
  return x >= 0 ? a : 1 - a;
}

function bsCall(S, K, T, sigma) {
  if (T <= 0) return Math.max(S - K, 0);
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  return S * normCdf(d1) - K * normCdf(d1 - sigma * Math.sqrt(T));
}

function bsTheta(S, K, T, sigma) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  const pdf = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return -(S * pdf * sigma) / (2 * Math.sqrt(T)) / 365;
}

function bsDelta(S, K, T, sigma) {
  if (T <= 0) return S > K ? 1 : 0;
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  return normCdf(d1);
}

function daysToExpiry(symbol, dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay();
  const targetDow = symbol === 'SENSEX' ? 5 : 4;
  let daysAhead = (targetDow - dow + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  return daysAhead;
}

function buildVolMap(ohlc) {
  const logRets = [];
  const volMap  = new Map();
  for (let i = 1; i < ohlc.length; i++) {
    logRets.push(Math.log(ohlc[i].close / ohlc[i - 1].close));
    if (logRets.length >= 20) {
      const w    = logRets.slice(-20);
      const mean = w.reduce((s, r) => s + r, 0) / 20;
      const va   = w.reduce((s, r) => s + (r - mean) ** 2, 0) / 19;
      volMap.set(ohlc[i].date, Math.sqrt(va * 252));
    }
  }
  return volMap;
}

/**
 * Estimate option cost for a CE at given ITM depth.
 * depth=1: nearest strike below spot (1 inc)
 * depth=2: second strike below spot (2 inc)
 * Returns { theta, spread, total, prem, K, delta } all as % of spot unless noted.
 */
function estimateCost(symbol, spot, dateStr, iv, depth) {
  const inc = INC[symbol];
  const dte = daysToExpiry(symbol, dateStr);
  const T   = dte / 365;

  // ATM strike floor (nearest round multiple below spot)
  const atmK = Math.floor(spot / inc) * inc;
  // ITM CE: strike is below spot. depth=1 → atmK, depth=2 → atmK - inc
  // (spot is between atmK and atmK+inc, so atmK is 1-increment ITM)
  const K = atmK - (depth - 1) * inc;

  const prem    = bsCall(spot, K, T, iv);
  const premPct = prem / spot * 100;

  // Theta (overnight hold, 3 days for Friday signal)
  const isWeekend = new Date(dateStr + 'T00:00:00Z').getUTCDay() === 5;
  const holdDays  = isWeekend ? 3 : 1;
  const thetaPct  = Math.abs(bsTheta(spot, K, T, iv)) * holdDays / spot * 100;

  // Spread [MODELED]
  const tick      = MIN_TICK / spot * 100;
  const spreadPct = Math.max(tick, SPREAD_PCT_OF_PREMIUM[symbol] * premPct) * 2;

  // Delta (for information — not used in P&L model which fixes delta=0.50)
  const delta = bsDelta(spot, K, T, iv);

  return { theta: thetaPct, spread: spreadPct, total: thetaPct + spreadPct, prem: premPct, K, delta, dte };
}

function fetchYahooChart(sym, p1, p2) {
  return new Promise((resolve, reject) => {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(sym) + '?period1=' + p1 + '&period2=' + p2 + '&interval=1d';
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => {
        try {
          const j  = JSON.parse(b);
          const r  = j && j.chart && j.chart.result && j.chart.result[0];
          if (!r || !r.timestamp) return resolve([]);
          const ts = r.timestamp;
          const q  = r.indicators && r.indicators.quote && r.indicators.quote[0];
          const out = [];
          for (let i = 0; i < ts.length; i++) {
            if (q && q.close && q.close[i] !== null)
              out.push({ date: new Date(ts[i]*1000).toISOString().split('T')[0],
                open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] });
          }
          resolve(out);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function calculateCPR(d) {
  const pivot = (d.high + d.low + d.close) / 3;
  const bc    = (d.high + d.low) / 2;
  const tc    = (pivot - bc) + pivot;
  const tcF   = tc < bc ? bc : tc;
  const bcF   = tc < bc ? tc : bc;
  const width = Math.abs(tcF - bcF) / pivot * 100;
  return { bc: bcF, tc: tcF, classification: width < 0.3 ? 'NARROW' : 'WIDE' };
}

function adjPnl(rawPnlPct, cost) {
  return DELTA * rawPnlPct - (cost !== null ? cost : 0.40);
}

function stats(pnls) {
  if (!pnls || pnls.length === 0) return null;
  const wins   = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);
  const n      = pnls.length;
  const aw     = wins.length   > 0 ? wins.reduce((s,p)=>s+p,0)/wins.length   : 0;
  const al     = losses.length > 0 ? losses.reduce((s,p)=>s+p,0)/losses.length : 0;
  const exp    = (wins.length/n)*aw + (losses.length/n)*al;
  let peak=0, cum=0, maxDD=0;
  pnls.forEach(p => { cum+=p; if(cum>peak)peak=cum; const dd=peak-cum; if(dd>maxDD)maxDD=dd; });
  return {
    n, wr: (wins.length/n*100).toFixed(1),
    aw: aw.toFixed(3), al: al.toFixed(3),
    exp: exp.toFixed(3), rr: al!==0?(aw/Math.abs(al)).toFixed(2):'N/A', maxDD: maxDD.toFixed(3)
  };
}

function pr(label, m) {
  if (!m) { console.log('  ' + label + ': n=0'); return; }
  const cols = [
    label.padEnd(38),
    'n=' + String(m.n).padStart(4),
    'WR=' + m.wr + '%',
    'AvgW=+' + m.aw + '%',
    'AvgL=' + m.al + '%',
    'EXP=' + m.exp + '%',
    'RR=' + m.rr,
    'MaxDD=' + m.maxDD + '%',
  ];
  console.log('  ' + cols.join('  '));
}

async function main() {
  const p1 = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000);
  const p2 = Math.floor(new Date('2026-07-01T00:00:00Z').getTime() / 1000);

  console.log('');
  console.log('INDEX BTST: itmDepth=1 vs itmDepth=2 OPTION COST COMPARISON [MODELED]');
  console.log('Window: 2024-01-01 → 2026-07-01  |  n=844 (same signal set)');
  console.log('');
  console.log('CE strike selection:');
  console.log('  depth=1 (original):  1st strike below spot  (nearest ITM, more extrinsic)');
  console.log('  depth=2 (new):       2nd strike below spot  (deeper ITM, more intrinsic)');
  console.log('');
  console.log('Cost model [MODELED]: BS theta (20d HV as IV proxy) + modeled bid-ask spread.');
  console.log('P&L model: delta=0.50 × raw_underlying_pct − cost_pct.');
  console.log('NOTE: Real delta(depth=2) ≈ 0.65-0.80 > 0.50 — P&L capture understated for depth=2.');
  console.log('');

  process.stdout.write('Fetching ^INDIAVIX...');
  const vixHistory = await fetchYahooChart('^INDIAVIX', p1, p2);
  const vixMap = new Map();
  vixHistory.forEach(v => vixMap.set(v.date, v.close));
  console.log(' ' + vixHistory.length + ' candles.');

  const bySymbol = { NIFTY: [], BANKNIFTY: [], SENSEX: [] };

  for (const inst of INSTRUMENTS) {
    await sleep(500);
    process.stdout.write('Fetching ' + inst.yahooSymbol + '...');
    const ohlc   = await fetchYahooChart(inst.yahooSymbol, p1, p2);
    const volMap = buildVolMap(ohlc);
    console.log(' ' + ohlc.length + ' candles.');

    for (let i = 1; i < ohlc.length - 1; i++) {
      const yesterday = ohlc[i-1], today = ohlc[i], nextDay = ohlc[i+1];

      const vixClose = vixMap.get(today.date);
      if (vixClose === undefined || vixClose === null) continue;
      if (vixClose >= INDIA_VIX_ELEVATED_MIN) continue;

      const sessionChg = (today.close - yesterday.close) / yesterday.close;
      if (sessionChg <= -0.001) continue;

      const todayCpr    = calculateCPR(yesterday);
      const tomorrowCpr = calculateCPR(today);

      const vixCalmPts    = vixClose <= INDIA_VIX_CALM_MAX ? 25 : 0;
      const cprNarrowPts  = tomorrowCpr.classification === 'NARROW' ? 30 : 0;
      const higherValPts  = (tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc) ? 20 : 0;
      const clStrPts      = (today.high > today.low &&
                            (today.close - today.low) / (today.high - today.low) > 0.70) ? 15 : 0;
      const score = vixCalmPts + cprNarrowPts + higherValPts + clStrPts;
      if (score < SCORE_FLOOR) continue;

      const entry  = today.close * 1.0005;
      const sl     = Math.min(today.low, tomorrowCpr.bc);
      const risk   = entry - sl;
      if (risk <= 0) continue;
      const target = entry + risk * 2.0;

      let exitPrice, exitReason;
      if      (nextDay.low  <= sl)     { exitPrice = sl;           exitReason = 'SL_HIT';     }
      else if (nextDay.high >= target) { exitPrice = target;       exitReason = 'TARGET_HIT'; }
      else                             { exitPrice = nextDay.close; exitReason = 'EOD_EXIT';   }

      const rawPnlPct = (exitPrice - entry) / entry * 100;
      const iv        = volMap.get(today.date) || null;
      const yr        = today.date.slice(0,4) === '2024' ? '2024' : today.date.slice(0,4) === '2025' ? '2025' : '2026-H1';

      const cd1 = iv ? estimateCost(inst.symbol, today.close, today.date, iv, 1) : null;
      const cd2 = iv ? estimateCost(inst.symbol, today.close, today.date, iv, 2) : null;

      bySymbol[inst.symbol].push({
        rawPnlPct, exitReason, yr,
        costD1:   cd1 ? cd1.total : null,
        costD2:   cd2 ? cd2.total : null,
        thetaD1:  cd1 ? cd1.theta : null,
        thetaD2:  cd2 ? cd2.theta : null,
        premD1:   cd1 ? cd1.prem  : null,
        premD2:   cd2 ? cd2.prem  : null,
        deltaD1:  cd1 ? cd1.delta : null,
        deltaD2:  cd2 ? cd2.delta : null,
        dte:      cd1 ? cd1.dte   : null,
      });
    }
  }

  // ── Cost distribution comparison ──────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('COST DISTRIBUTION COMPARISON [MODELED]  (as % of underlying spot)');
  console.log('═══════════════════════════════════════════════════════════════════════════');

  for (const sym of ['NIFTY', 'BANKNIFTY', 'SENSEX']) {
    const all    = bySymbol[sym];
    const withIV = all.filter(t => t.costD1 !== null);
    const n      = withIV.length;
    if (n === 0) continue;

    const avgCost1  = withIV.reduce((s,t)=>s+t.costD1,0)/n;
    const avgCost2  = withIV.reduce((s,t)=>s+t.costD2,0)/n;
    const avgTheta1 = withIV.reduce((s,t)=>s+t.thetaD1,0)/n;
    const avgTheta2 = withIV.reduce((s,t)=>s+t.thetaD2,0)/n;
    const avgPrem1  = withIV.reduce((s,t)=>s+t.premD1,0)/n;
    const avgPrem2  = withIV.reduce((s,t)=>s+t.premD2,0)/n;
    const avgDelta1 = withIV.reduce((s,t)=>s+t.deltaD1,0)/n;
    const avgDelta2 = withIV.reduce((s,t)=>s+t.deltaD2,0)/n;
    const avgDte    = withIV.reduce((s,t)=>s+t.dte,0)/n;

    console.log('');
    console.log('[' + sym + ']  n=' + all.length + '  (with IV estimate: ' + n + ')  mean DTE=' + avgDte.toFixed(1));
    console.log('            Cost%   Theta%  Spread%  Prem%  Delta');
    console.log('  depth=1:  ' +
      avgCost1.toFixed(4).padStart(6) + '  ' +
      avgTheta1.toFixed(4).padStart(7) + '  ' +
      (avgCost1-avgTheta1).toFixed(4).padStart(7) + '  ' +
      avgPrem1.toFixed(4).padStart(5) + '  ' +
      avgDelta1.toFixed(3));
    console.log('  depth=2:  ' +
      avgCost2.toFixed(4).padStart(6) + '  ' +
      avgTheta2.toFixed(4).padStart(7) + '  ' +
      (avgCost2-avgTheta2).toFixed(4).padStart(7) + '  ' +
      avgPrem2.toFixed(4).padStart(5) + '  ' +
      avgDelta2.toFixed(3));
    console.log('  delta_cost(d2-d1): ' + (avgCost2 - avgCost1).toFixed(4) + '%  (negative = cheaper at depth=2)');
  }

  // ── Expectancy comparison table ───────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('EXPECTANCY COMPARISON: depth=1 (original) vs depth=2 (new) [MODELED]');
  console.log('Option P&L = 0.50 × raw_pct − cost_pct  |  flat-0.40% shown for reference');
  console.log('═══════════════════════════════════════════════════════════════════════════');

  const allTrades = [...bySymbol['NIFTY'], ...bySymbol['BANKNIFTY'], ...bySymbol['SENSEX']];
  const years     = ['2024', '2025', '2026-H1'];

  for (const sym of ['NIFTY', 'BANKNIFTY', 'SENSEX', '_ALL']) {
    const trades = sym === '_ALL' ? allTrades : bySymbol[sym];
    const label  = sym === '_ALL' ? 'ALL COMBINED' : sym;
    console.log('');
    console.log('[' + label + ']  n=' + trades.length);
    pr('ALL  flat-0.40%  ', stats(trades.map(t => adjPnl(t.rawPnlPct, 0.40))));
    pr('ALL  depth=1 [MODELED]', stats(trades.map(t => adjPnl(t.rawPnlPct, t.costD1))));
    pr('ALL  depth=2 [MODELED]', stats(trades.map(t => adjPnl(t.rawPnlPct, t.costD2))));

    for (const yr of years) {
      const yt = trades.filter(t => t.yr === yr);
      if (yt.length === 0) continue;
      pr(yr + '  flat-0.40%  ', stats(yt.map(t => adjPnl(t.rawPnlPct, 0.40))));
      pr(yr + '  depth=1 [MODELED]', stats(yt.map(t => adjPnl(t.rawPnlPct, t.costD1))));
      pr(yr + '  depth=2 [MODELED]', stats(yt.map(t => adjPnl(t.rawPnlPct, t.costD2))));
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('[MODELED] caveats:');
  console.log('  1. All costs are Black-Scholes with 20d HV as IV proxy (likely < actual IV).');
  console.log('  2. delta=0.50 applied to both depths. Actual delta(depth=2) ≈ 0.65-0.80.');
  console.log('     This means depth=2 wins capture MORE underlying move in reality.');
  console.log('     The P&L improvement from depth=2 is understated by this model.');
  console.log('  3. Depth=2 has higher intrinsic/lower extrinsic — reduces theta drag.');
  console.log('     But bid-ask spread on depth=2 is modeled only; real BSE SENSEX spread');
  console.log('     on deeper ITM can be meaningfully wider and partially offsets theta saving.');
  console.log('═══════════════════════════════════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
