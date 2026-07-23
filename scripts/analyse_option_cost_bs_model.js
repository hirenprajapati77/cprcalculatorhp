/**
 * scripts/analyse_option_cost_bs_model.js
 *
 * Throwaway — do NOT commit to main app.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DATA AVAILABILITY NOTICE — READ BEFORE INTERPRETING OUTPUT
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Historical option chain data (bid/ask/OI/volume at a past timestamp) is NOT
 * available through any endpoint in this codebase or via the Fyers public API.
 *
 * OptionChainService.getOptionChain() calls Fyers options-chain-v3 live (with
 * a 10-minute cache). It has no historical mode.
 *
 * NSE Bhavcopy provides daily settlement price + OI only — no intraday
 * bid-ask, no time-stamped snapshot.
 *
 * Yahoo Finance provides equity/index OHLC only — no option chain history.
 *
 * THEREFORE: every number in this script is a BLACK-SCHOLES MODEL OUTPUT,
 * not an empirical measurement. It is labelled [MODELED] throughout.
 * Do not treat it as observed market data.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *
 * What this script does model (per symbol, per signal day):
 *
 *   Strike selection: mirrors OptionSuggestionService — picks the nearest
 *     ITM-1 CE strike above spot (same strike increment as production:
 *     NIFTY=50, BANKNIFTY/SENSEX=100).
 *
 *   Historical IV proxy: uses realised 20-day rolling volatility of the
 *     underlying as a proxy for implied volatility on each signal date.
 *     This understates IV on high-stress days (IV > HV) and can overstate
 *     it on quiet days. The bias direction is noted per year cohort.
 *
 *   Expiry DTE: uses production expiry selection logic — nearest weekly expiry
 *     (Thursday for NSE, Friday for BSE/SENSEX), clamped to next week if
 *     signal date is the expiry day itself. DTE = calendar days to expiry.
 *
 *   Theta (overnight) [MODELED]:
 *     Uses Black-Scholes theta formula for European call at the selected
 *     strike/DTE/IV. Overnight hold = 1 calendar day of theta decay.
 *     Weekend signals (Friday) apply 3 calendar days of theta.
 *     Expressed as % of underlying spot.
 *
 *   Bid-ask spread [MODELED]:
 *     NSE index options (NIFTY/BANKNIFTY): spread estimated as max(1 tick,
 *       0.5% of option premium). 1 tick = ₹0.05. Nifty options are highly
 *       liquid; this is a conservative lower-bound estimate.
 *     BSE index options (SENSEX): spread estimated as max(1 tick, 1.0% of
 *       option premium). SENSEX options are thinner; this adds a 2x penalty
 *       vs NSE. Still modeled — actual spread can be wider on illiquid strikes.
 *     Expressed as % of underlying spot (both legs: entry + exit).
 *
 *   Per-trade fixed cost = theta_pct + spread_pct (in underlying % terms).
 *
 * Run: node scripts/analyse_option_cost_bs_model.js
 *
 * The comparison table at the end shows:
 *   Original flat-0.40% haircut vs per-symbol modeled cost,
 *   broken out by symbol and year cohort.
 */

'use strict';
const https = require('https');

// ── Signal constants (must match backtest) ────────────────────────────────────
const INDIA_VIX_CALM_MAX     = 20.0;
const INDIA_VIX_ELEVATED_MIN = 25.0;
const SCORE_FLOOR            = 59;

// ── Strike increments matching OptionSuggestionService ───────────────────────
const STRIKE_INC = { NIFTY: 50, BANKNIFTY: 100, SENSEX: 100 };

// ── Spread model [MODELED] ────────────────────────────────────────────────────
// NSE (NIFTY/BANKNIFTY): max(₹0.05, 0.5% of premium) × 2 legs, as % of spot
// BSE (SENSEX): max(₹0.05, 1.0% of premium) × 2 legs, as % of spot
const SPREAD_PCT_OF_PREMIUM = { NIFTY: 0.005, BANKNIFTY: 0.005, SENSEX: 0.010 };
const MIN_TICK = 0.05; // ₹

// ── Calendar: NIFTY/BANKNIFTY expire Thursday, SENSEX expires Friday ─────────
// DTE to nearest weekly expiry from signal date (signal day = Wednesday close)
function daysToNextExpiry(symbol, dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun,1=Mon,...,4=Thu,5=Fri,6=Sat
  const targetDow = symbol === 'SENSEX' ? 5 : 4; // Fri for SENSEX, Thu for others

  let daysAhead = (targetDow - dow + 7) % 7;
  if (daysAhead === 0) daysAhead = 7; // if today IS expiry, roll to next week
  return daysAhead; // calendar days
}

// ── Black-Scholes normal CDF ──────────────────────────────────────────────────
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
               t * (-1.821255978 + t * 1.330274429))));
  const approx = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  return x >= 0 ? approx : 1 - approx;
}

// ── Black-Scholes theta for a European call [MODELED] ────────────────────────
// Returns theta in underlying-point terms per calendar day.
function bsTheta(S, K, T, sigma) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const pdf_d1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  // r=0 (short-dated index options, r contribution is small)
  const theta_annual = -(S * pdf_d1 * sigma) / (2 * Math.sqrt(T));
  return theta_annual / 365; // per calendar day
}

// ── Black-Scholes call price [MODELED] ───────────────────────────────────────
function bsCall(S, K, T, sigma) {
  if (T <= 0) return Math.max(S - K, 0);
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * normCdf(d1) - K * normCdf(d2);
}

// ── Rolling 20-day realised vol as IV proxy [MODELED] ────────────────────────
function buildVolMap(ohlc) {
  const logRets = [];
  const volMap  = new Map();
  for (let i = 1; i < ohlc.length; i++) {
    logRets.push(Math.log(ohlc[i].close / ohlc[i - 1].close));
    if (logRets.length >= 20) {
      const window = logRets.slice(-20);
      const mean   = window.reduce((s, r) => s + r, 0) / 20;
      const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / 19;
      // Annualise: ×√252 (trading days)
      const annVol = Math.sqrt(variance * 252);
      volMap.set(ohlc[i].date, annVol);
    }
  }
  return volMap;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchYahooChart(sym, p1, p2) {
  return new Promise((resolve, reject) => {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(sym) + '?period1=' + p1 + '&period2=' + p2 + '&interval=1d';
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          const r = j && j.chart && j.chart.result && j.chart.result[0];
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

// ── Per-trade option cost estimator [MODELED] ─────────────────────────────────
function estimateCost(symbol, spot, signalDate, iv) {
  if (!iv || iv <= 0) return null; // can't model without vol

  const inc  = STRIKE_INC[symbol];
  const dte  = daysToNextExpiry(symbol, signalDate); // calendar days
  const T    = dte / 365;

  // ITM-1 CE: first strike above spot
  const atmStrike = Math.round(spot / inc) * inc;
  const K = spot > atmStrike ? atmStrike + inc : atmStrike + inc; // 1 strike ITM (just OTM, typical for BTST CE)

  const premium  = bsCall(spot, K, T, iv);
  const premPct  = premium / spot * 100; // % of underlying

  // Theta overnight (1 cal day; 3 cal days for Friday → Monday hold)
  const d         = new Date(signalDate + 'T00:00:00Z');
  const isWeekend = d.getUTCDay() === 5; // signal on Friday → holds over weekend
  const holdDays  = isWeekend ? 3 : 1;
  const thetaPerDay = bsTheta(spot, K, T, iv); // negative number in ₹/day
  const thetaPct  = Math.abs(thetaPerDay) * holdDays / spot * 100;

  // Bid-ask spread [MODELED]
  const spreadPctOfPremium = SPREAD_PCT_OF_PREMIUM[symbol];
  const tickSpread         = MIN_TICK / spot * 100;
  const spreadPct          = Math.max(tickSpread, spreadPctOfPremium * premPct) * 2; // both legs

  const totalCost = thetaPct + spreadPct;

  return { thetaPct, spreadPct, totalCost, premPct, dte, iv, K };
}

// ── Metrics with per-trade cost ───────────────────────────────────────────────
function computeMetrics(trades, costKey) {
  if (!trades || trades.length === 0) return null;

  // Use per-trade modeled cost if available; fall back to flat 0.40%
  const FLAT = 0.40;
  const DELTA = 0.50;

  const adjPnls = trades.map(t => {
    const rawPnl = t.rawPnlPct;
    const cost   = costKey === 'model' ? (t.modeledCost !== null ? t.modeledCost : FLAT) : FLAT;
    return DELTA * rawPnl - cost;
  });

  const wins    = adjPnls.filter(p => p > 0);
  const losses  = adjPnls.filter(p => p <= 0);
  const avgWin  = wins.length   > 0 ? wins.reduce((s,p)=>s+p,0)/wins.length   : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s,p)=>s+p,0)/losses.length : 0;
  const exp     = (wins.length/adjPnls.length)*avgWin + (losses.length/adjPnls.length)*avgLoss;
  const realRR  = avgLoss !== 0 ? (avgWin/Math.abs(avgLoss)).toFixed(2) : 'N/A';
  let peak=0, cum=0, maxDD=0;
  adjPnls.forEach(p => { cum+=p; if(cum>peak)peak=cum; const dd=peak-cum; if(dd>maxDD)maxDD=dd; });
  const n = adjPnls.length;

  // Cost distribution (modeled only)
  const costs = trades.map(t => t.modeledCost).filter(c => c !== null);
  const costMean   = costs.length > 0 ? costs.reduce((s,c)=>s+c,0)/costs.length : null;
  const costsSorted = [...costs].sort((a,b)=>a-b);
  const costMedian = costs.length > 0 ? costsSorted[Math.floor(costs.length/2)] : null;
  const costMin    = costs.length > 0 ? Math.min(...costs) : null;
  const costMax    = costs.length > 0 ? Math.max(...costs) : null;

  return {
    n, wins: wins.length, losses: losses.length,
    winRate: (wins.length/n*100).toFixed(1),
    avgWin: avgWin.toFixed(3), avgLoss: avgLoss.toFixed(3),
    exp: exp.toFixed(3), realRR, maxDD: maxDD.toFixed(3),
    costMean, costMedian, costMin, costMax,
    noCostEstimate: trades.filter(t=>t.modeledCost===null).length,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const p1 = Math.floor(new Date('2024-01-01T00:00:00Z').getTime()/1000);
  const p2 = Math.floor(new Date('2026-07-01T00:00:00Z').getTime()/1000);

  console.log('');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('INDEX BTST — PER-SYMBOL OPTION COST ANALYSIS  (2024-01-01 → 2026-07-01)');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('DATA SOURCE: [MODELED] — Black-Scholes with 20-day realised vol as IV proxy.');
  console.log('  Historical option chain snapshots (bid/ask at a past timestamp) are NOT');
  console.log('  available via Fyers options-chain-v3, NSE Bhavcopy, or Yahoo Finance.');
  console.log('  Every cost figure below is a model output, not an empirical measurement.');
  console.log('');
  console.log('COST MODEL:');
  console.log('  Strike:  ITM-1 CE (first strike above spot; NIFTY inc=50, BNK/SNS inc=100)');
  console.log('  IV:      20-day realised vol (annualised). Likely < actual IV on stress days.');
  console.log('  Theta:   BS theta × hold days (1 day Mon-Thu; 3 days Fri for weekend gap).');
  console.log('  Spread:  NIFTY/BANKNIFTY: max(tick, 0.5% of premium) × 2 legs.');
  console.log('           SENSEX: max(tick, 1.0% of premium) × 2 legs (thinner BSE book).');
  console.log('  Total:   theta_pct + spread_pct, expressed as % of underlying spot.');
  console.log('  Option P&L: 0.50 × raw_pct − per_trade_cost  (delta=0.50, same as before).');
  console.log('');
  console.log('COMPARISON BASELINE: flat 0.40%/trade cost used in prior analysis.');
  console.log('════════════════════════════════════════════════════════════════════════════');

  const INSTRUMENTS = [
    { symbol: 'NIFTY',     yahooSymbol: '^NSEI'   },
    { symbol: 'BANKNIFTY', yahooSymbol: '^NSEBANK' },
    { symbol: 'SENSEX',    yahooSymbol: '^BSESN'  },
  ];

  process.stdout.write('\nFetching ^INDIAVIX...');
  const vixHistory = await fetchYahooChart('^INDIAVIX', p1, p2);
  const vixMap = new Map();
  vixHistory.forEach(v => vixMap.set(v.date, v.close));
  console.log(' ' + vixHistory.length + ' candles.');

  const bySymbol = { NIFTY: [], BANKNIFTY: [], SENSEX: [] };

  for (const inst of INSTRUMENTS) {
    await sleep(500);
    process.stdout.write('Fetching ' + inst.yahooSymbol + '...');
    const ohlc = await fetchYahooChart(inst.yahooSymbol, p1, p2);
    console.log(' ' + ohlc.length + ' candles.');

    const volMap = buildVolMap(ohlc);

    for (let i = 1; i < ohlc.length - 1; i++) {
      const yesterday = ohlc[i - 1], today = ohlc[i], nextDay = ohlc[i + 1];

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
                            (today.close - today.low)/(today.high - today.low) > 0.70) ? 15 : 0;
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

      // Option cost estimate [MODELED]
      const iv          = volMap.get(today.date);
      const costDetails = iv ? estimateCost(inst.symbol, today.close, today.date, iv) : null;
      const modeledCost = costDetails ? costDetails.totalCost : null;

      bySymbol[inst.symbol].push({
        date: today.date, rawPnlPct, exitReason, score,
        modeledCost, costDetails,
        yr: today.date.slice(0,4) === '2024' ? '2024' : today.date.slice(0,4) === '2025' ? '2025' : '2026-H1'
      });
    }
  }

  // ── Cost distribution per symbol ──────────────────────────────────────────
  console.log('');
  console.log('──────────────────────────────────────────────────────────────────────────');
  console.log('COST DISTRIBUTION PER SYMBOL [MODELED]  (as % of underlying spot)');
  console.log('  theta + spread combined; delta=0.50 applied separately in P&L calc');
  console.log('──────────────────────────────────────────────────────────────────────────');

  const years = ['2024', '2025', '2026-H1'];
  for (const sym of ['NIFTY', 'BANKNIFTY', 'SENSEX']) {
    const all  = bySymbol[sym];
    const costs = all.map(t=>t.modeledCost).filter(c=>c!==null);
    const mean   = costs.reduce((s,c)=>s+c,0)/costs.length;
    const sorted = [...costs].sort((a,b)=>a-b);
    const med    = sorted[Math.floor(sorted.length/2)];
    const noEst  = all.filter(t=>t.modeledCost===null).length;

    console.log('');
    console.log('  [' + sym + ']  n=' + all.length + '  (no-IV-estimate: ' + noEst + ' — earliest 20 candles lack rolling vol)');
    console.log('    Mean cost:   ' + mean.toFixed(4) + '%  (flat-0.40% baseline for comparison)');
    console.log('    Median cost: ' + med.toFixed(4) + '%');
    console.log('    Min cost:    ' + Math.min(...costs).toFixed(4) + '%');
    console.log('    Max cost:    ' + Math.max(...costs).toFixed(4) + '%');

    // Theta vs spread breakdown (mean)
    const thetaMean  = all.filter(t=>t.costDetails).reduce((s,t)=>s+t.costDetails.thetaPct,0)/all.filter(t=>t.costDetails).length;
    const spreadMean = all.filter(t=>t.costDetails).reduce((s,t)=>s+t.costDetails.spreadPct,0)/all.filter(t=>t.costDetails).length;
    const dteMean    = all.filter(t=>t.costDetails).reduce((s,t)=>s+t.costDetails.dte,0)/all.filter(t=>t.costDetails).length;
    const ivMean     = all.filter(t=>t.costDetails).reduce((s,t)=>s+t.costDetails.iv,0)/all.filter(t=>t.costDetails).length;
    console.log('    Breakdown:   theta=' + thetaMean.toFixed(4) + '%  spread=' + spreadMean.toFixed(4) + '%');
    console.log('    Mean DTE:    ' + dteMean.toFixed(1) + ' cal days to expiry');
    console.log('    Mean IV:     ' + (ivMean*100).toFixed(1) + '% annualised realised vol [MODELED proxy for IV]');
  }

  // ── Comparison table ──────────────────────────────────────────────────────
  console.log('');
  console.log('──────────────────────────────────────────────────────────────────────────');
  console.log('EXPECTANCY COMPARISON:  flat-0.40% haircut  vs  per-symbol modeled cost');
  console.log('Option P&L = (0.50 × raw_pct) − cost  |  [MODELED] throughout');
  console.log('──────────────────────────────────────────────────────────────────────────');

  function hdr(label) {
    return label.padEnd(24) + '  n     WR%    AvgW%    AvgL%    EXP%   RR    MaxDD%';
  }
  function row(label, m) {
    if (!m) return label.padEnd(24) + '  n=0';
    return [
      label.padEnd(24),
      String(m.n).padStart(3),
      m.winRate.padStart(7),
      m.avgWin.padStart(9),
      m.avgLoss.padStart(9),
      m.exp.padStart(8),
      m.realRR.padStart(5),
      m.maxDD.padStart(8),
    ].join('  ');
  }

  for (const sym of ['NIFTY', 'BANKNIFTY', 'SENSEX']) {
    const all = bySymbol[sym];
    console.log('');
    console.log('  ┌─ ' + sym + ' ─────────────────────────────────────────────────────────┐');
    console.log('  ' + hdr(''));
    console.log('  flat-0.40%              ' + row('', computeMetrics(all, 'flat')).slice(24));
    console.log('  modeled [BS/HV]         ' + row('', computeMetrics(all, 'model')).slice(24));

    for (const yr of years) {
      const yTrades = all.filter(t => t.yr === yr);
      if (yTrades.length === 0) continue;
      console.log('');
      console.log('    ' + yr);
      console.log('    flat-0.40%            ' + row('', computeMetrics(yTrades, 'flat')).slice(24));
      console.log('    modeled [BS/HV]       ' + row('', computeMetrics(yTrades, 'model')).slice(24));
    }
    console.log('  └────────────────────────────────────────────────────────────────┘');
  }

  // Combined ALL
  const allTrades = [...bySymbol['NIFTY'], ...bySymbol['BANKNIFTY'], ...bySymbol['SENSEX']];
  console.log('');
  console.log('  ┌─ ALL COMBINED ──────────────────────────────────────────────────────┐');
  console.log('  ' + hdr(''));
  console.log('  flat-0.40%              ' + row('', computeMetrics(allTrades, 'flat')).slice(24));
  console.log('  modeled [BS/HV]         ' + row('', computeMetrics(allTrades, 'model')).slice(24));
  console.log('  └────────────────────────────────────────────────────────────────────┘');

  console.log('');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('ALL NUMBERS ABOVE ARE [MODELED]. Historical bid/ask not available.');
  console.log('IV proxy = 20-day realised vol. Likely understates actual IV by 5-15pp on');
  console.log('stress days, which means theta cost is understated on exactly the days');
  console.log('where the signal is most likely to fire after a drawdown recovery.');
  console.log('════════════════════════════════════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
