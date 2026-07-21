/**
 * ATR threshold audit — compares 14-period trailing ATR vs legacy whole-history average
 * on the backtest universe (NIFTY50 + HistoricalProvider) and reports downstream flip
 * rates for classifyCprWidth() and EXTENSION_LIMITS gates.
 *
 * Usage: npx tsx scripts/atr_threshold_audit.ts
 * Optional: HISTORICAL_MODE=live npx tsx scripts/atr_threshold_audit.ts
 */

// Env before imports that read HistoricalProvider mode
process.env.HISTORICAL_MODE = process.env.HISTORICAL_MODE || 'mock';
process.env.CACHE_PROVIDER = process.env.CACHE_PROVIDER || 'memory';

import { MarketService, MarketStockData } from '../src/services/market.service';
import { HistoricalProvider, OHLC } from '../src/services/backtest/historical.provider';
import { getAtrPct, HistoryCandle, DEFAULT_ATR_PERIOD } from '../src/lib/atr';
import { calculateCPR, classifyCprWidth } from '../src/lib/cpr-engine';
import { EXTENSION_LIMITS } from '../src/services/overnight/entry-manager.service';

const UNIVERSE = 'NIFTY50' as const;
const START_DATE = '2024-01-01';
const END_DATE = '2024-12-31';
const FETCH_DELAY_MS = 300;

/** Legacy whole-history TR average (pre-14-period fix). */
function calculateATRLegacy(history: HistoryCandle[], currentClose: number): number {
  let atr = currentClose * 0.02;
  const wlen = history.length;

  if (wlen >= 2) {
    let trueRangeSum = 0;
    for (let i = 1; i < wlen; i++) {
      const high = history[i].high;
      const low = history[i].low;
      const prevClose = history[i - 1].close;
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRangeSum += tr;
    }
    atr = trueRangeSum / (wlen - 1);
  }

  return atr;
}

function getAtrPctLegacy(history: HistoryCandle[], currentClose: number): number {
  const atr = calculateATRLegacy(history, currentClose);
  return currentClose > 0 ? atr / currentClose : 0.02;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function distStats(values: number[]) {
  if (values.length === 0) {
    return { min: 0, median: 0, mean: 0, max: 0 };
  }
  return {
    min: Math.min(...values),
    median: median(values),
    mean: mean(values),
    max: Math.max(...values),
  };
}

function toHistoryCandles(ohlc: OHLC[]): HistoryCandle[] {
  return ohlc.map((c) => ({ high: c.high, low: c.low, close: c.close, open: c.open }));
}

function buildStock(symbol: string, ohlc: OHLC[], dayIndex: number): MarketStockData {
  const today = ohlc[dayIndex];
  const yesterday = ohlc[dayIndex - 1];
  const historySlice = ohlc.slice(0, dayIndex + 1);
  const rollingWindow = ohlc.slice(Math.max(0, dayIndex - 19), dayIndex + 1);
  const avgVolume =
    rollingWindow.length > 0
      ? rollingWindow.reduce((sum, d) => sum + d.volume, 0) / rollingWindow.length
      : today.volume;

  return {
    symbol,
    market: 'NSE',
    sector: 'Unknown',
    open: today.open,
    high: today.high,
    low: today.low,
    close: today.close,
    volume: today.volume,
    avgVolume,
    marketCap: 0,
    ltp: today.close,
    previousClose: yesterday.close,
    history: historySlice.map((c) => ({
      date: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    })),
  };
}

/** Mirrors EntryManagerService.evaluateExtension but accepts explicit atrPct fraction. */
function evaluateExtensionWithAtrPct(
  stock: MarketStockData,
  direction: 'LONG' | 'SHORT',
  atrPctFrac: number
): { eligible: boolean } {
  const close = stock.ltp || stock.close || 0;
  if (!close || close <= 0 || !stock.high || !stock.low) {
    return { eligible: false };
  }

  const prevClose = stock.previousClose;
  if (!prevClose || prevClose <= 0) {
    return { eligible: true };
  }

  const dayReturnPct = ((close - prevClose) / prevClose) * 100;
  const dayRangePct = ((stock.high - stock.low) / close) * 100;
  const atrPct = atrPctFrac * 100;

  if (direction === 'LONG') {
    if (dayReturnPct >= EXTENSION_LIMITS.MAX_DAY_RETURN_PCT) return { eligible: false };
    if (atrPct > 0 && dayReturnPct >= atrPct * EXTENSION_LIMITS.MAX_RETURN_ATR_MULT) {
      return { eligible: false };
    }
    if (atrPct > 0 && dayRangePct >= atrPct * EXTENSION_LIMITS.MAX_RANGE_ATR_MULT) {
      return { eligible: false };
    }
  }

  if (direction === 'SHORT') {
    if (dayReturnPct <= -EXTENSION_LIMITS.MAX_DAY_DROP_PCT) return { eligible: false };
    if (atrPct > 0 && dayReturnPct <= -(atrPct * EXTENSION_LIMITS.MAX_RETURN_ATR_MULT)) {
      return { eligible: false };
    }
    if (atrPct > 0 && dayRangePct >= atrPct * EXTENSION_LIMITS.MAX_RANGE_ATR_MULT) {
      return { eligible: false };
    }
  }

  return { eligible: true };
}

function pct(n: number, total: number): string {
  if (total === 0) return '0.00%';
  return `${((n / total) * 100).toFixed(2)}%`;
}

function fmtDist(st: ReturnType<typeof distStats>): string {
  return `${st.min.toFixed(2)}/${st.median.toFixed(2)}/${st.mean.toFixed(2)}/${st.max.toFixed(2)}`;
}

interface SymbolStats {
  symbol: string;
  days: number;
  newAtrPct: number[];
  oldAtrPct: number[];
}

async function main() {
  const mode = process.env.HISTORICAL_MODE || 'mock';
  const startDate = new Date(START_DATE);
  const endDate = new Date(END_DATE);

  const universeStocks = MarketService.getUniverse(UNIVERSE);
  const symbols = universeStocks.map((s) => s.symbol.trim());

  console.log('='.repeat(80));
  console.log('ATR THRESHOLD AUDIT — 14-period vs legacy whole-history average');
  console.log('='.repeat(80));
  console.log(`Universe:     ${UNIVERSE} (${symbols.length} symbols)`);
  console.log(`Period:       ${START_DATE} → ${END_DATE}`);
  console.log(`Data source:  HistoricalProvider (HISTORICAL_MODE=${mode})`);
  console.log(`ATR period:   ${DEFAULT_ATR_PERIOD} (new) vs full history (legacy)`);
  console.log('='.repeat(80));
  console.log('');

  let totalSymbolDays = 0;
  let cprFlips = 0;
  let extLongFlips = 0;
  let extShortFlips = 0;
  let fetchErrors = 0;

  const perSymbol: SymbolStats[] = [];
  const allNewAtr: number[] = [];
  const allOldAtr: number[] = [];

  for (const symbol of symbols) {
    try {
      const ohlc = await HistoricalProvider.getHistory(symbol, startDate, endDate);
      if (mode === 'live') {
        await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
      }

      if (ohlc.length < 2) continue;

      const newSeries: number[] = [];
      const oldSeries: number[] = [];

      for (let i = 1; i < ohlc.length; i++) {
        const today = ohlc[i];
        const history = toHistoryCandles(ohlc.slice(0, i + 1));
        const close = today.close;

        const newAtrPct = getAtrPct(history, close);
        const oldAtrPct = getAtrPctLegacy(history, close);

        newSeries.push(newAtrPct * 100);
        oldSeries.push(oldAtrPct * 100);
        allNewAtr.push(newAtrPct * 100);
        allOldAtr.push(oldAtrPct * 100);

        const tomorrowCpr = calculateCPR({
          high: today.high,
          low: today.low,
          close: today.close,
        });
        const widthPct = tomorrowCpr.width;

        const classNew = classifyCprWidth(widthPct, newAtrPct);
        const classOld = classifyCprWidth(widthPct, oldAtrPct);
        if (classNew !== classOld) cprFlips++;

        const stock = buildStock(symbol, ohlc, i);
        const extLongNew = evaluateExtensionWithAtrPct(stock, 'LONG', newAtrPct).eligible;
        const extLongOld = evaluateExtensionWithAtrPct(stock, 'LONG', oldAtrPct).eligible;
        if (extLongNew !== extLongOld) extLongFlips++;

        const extShortNew = evaluateExtensionWithAtrPct(stock, 'SHORT', newAtrPct).eligible;
        const extShortOld = evaluateExtensionWithAtrPct(stock, 'SHORT', oldAtrPct).eligible;
        if (extShortNew !== extShortOld) extShortFlips++;

        totalSymbolDays++;
      }

      perSymbol.push({ symbol, days: newSeries.length, newAtrPct: newSeries, oldAtrPct: oldSeries });
    } catch (err) {
      fetchErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[WARN] ${symbol}: fetch failed — ${msg}`);
    }
  }

  console.log('── Per-symbol ATR% distribution (min / median / mean / max) ────────────────────');
  console.log(
    `${'Symbol'.padEnd(14)}${'Days'.padStart(5)}  ${'New ATR%'.padEnd(28)}${'Old ATR%'.padEnd(28)}${'Δ mean'.padStart(8)}`
  );
  console.log('-'.repeat(80));

  for (const s of perSymbol.sort((a, b) => a.symbol.localeCompare(b.symbol))) {
    const ns = distStats(s.newAtrPct);
    const os = distStats(s.oldAtrPct);
    const deltaMean = ns.mean - os.mean;
    const deltaStr = `${deltaMean >= 0 ? '+' : ''}${deltaMean.toFixed(3)}%`;

    console.log(
      `${s.symbol.padEnd(14)}${String(s.days).padStart(5)}  ` +
        `${fmtDist(ns).padEnd(28)}${fmtDist(os).padEnd(28)}${deltaStr.padStart(8)}`
    );
  }

  const poolNew = distStats(allNewAtr);
  const poolOld = distStats(allOldAtr);

  console.log('');
  console.log('── Pool-wide ATR% (all symbol-days) ────────────────────────────────────────────');
  console.log(`  New (14-period):  min=${poolNew.min.toFixed(3)}%  med=${poolNew.median.toFixed(3)}%  mean=${poolNew.mean.toFixed(3)}%  max=${poolNew.max.toFixed(3)}%`);
  console.log(`  Old (full hist):  min=${poolOld.min.toFixed(3)}%  med=${poolOld.median.toFixed(3)}%  mean=${poolOld.mean.toFixed(3)}%  max=${poolOld.max.toFixed(3)}%`);
  console.log(`  Mean delta (new − old): ${(poolNew.mean - poolOld.mean >= 0 ? '+' : '')}${(poolNew.mean - poolOld.mean).toFixed(3)}%`);

  console.log('');
  console.log('── Downstream decision flips (legacy ATR → new 14-period ATR) ──────────────────');
  console.log(`  Symbol-days analyzed:           ${totalSymbolDays}`);
  console.log(`  Symbols with data:              ${perSymbol.length} / ${symbols.length}`);
  console.log(`  Fetch errors:                   ${fetchErrors}`);
  console.log('');
  console.log(`  CPR classifyCprWidth flips:     ${cprFlips}  (${pct(cprFlips, totalSymbolDays)} of symbol-days)`);
  console.log(`  EXTENSION_LIMITS LONG flips:    ${extLongFlips}  (${pct(extLongFlips, totalSymbolDays)} of symbol-days)`);
  console.log(`  EXTENSION_LIMITS SHORT flips:   ${extShortFlips}  (${pct(extShortFlips, totalSymbolDays)} of symbol-days)`);
  console.log('');
  console.log('Note: Multipliers NOT adjusted — audit only. Recalibration is a separate step.');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
