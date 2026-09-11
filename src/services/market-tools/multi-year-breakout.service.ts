import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { withTimeout } from '@/lib/with-timeout';
import { executeGuardedQuery } from '@/lib/db-query-guard';
import { MARKET_TOOLS_QUERY_TIMEOUTS } from '@/config/trading-constants';
import {
  tryAcquireDistributedLock,
  releaseDistributedLock,
  handleLockContentionWithStaleFallback,
} from '@/lib/distributed-lock';
import { getSymbolSector } from './market-breadth.service';
import { isLikelyEtfOrFund } from '@/lib/nse-fund-exclusion';
import { isValidOhlcvGeometry } from './historical-window-validation';
import {
  MARKET_TOOLS_CACHE_TTL_MS,
  MARKET_TOOLS_CACHE_TTL_SEC,
  checkCachedReportFreshness,
} from '@/lib/cache-freshness';
import {
  computeRvol,
  computeClv,
  computeRangePct,
  classifyBreakoutVpa,
  type BreakoutVpaFootprint,
} from '@/services/vpa/vpa.math';

export type BreakoutWindow = '1Y' | '2Y' | '3Y' | '5Y' | '10Y' | 'ATH';

export interface BreakoutStock {
  symbol: string;
  sector: string;
  close: number;
  prevClose: number;
  changePct: number;
  volume: number;
  rvol20d: number | null;
  clv: number | null;
  historyDays: number;
  breakout1Y: boolean | null;
  high1Y: number | null;
  gain1YPct: number | null;
  breakout2Y: boolean | null;
  high2Y: number | null;
  gain2YPct: number | null;
  breakout3Y: boolean | null;
  high3Y: number | null;
  gain3YPct: number | null;
  breakout5Y: boolean | null;
  high5Y: number | null;
  gain5YPct: number | null;
  breakout10Y: boolean | null;
  high10Y: number | null;
  gain10YPct: number | null;
  breakoutATH: boolean | null;
  highATH: number | null;
  gainATHPct: number | null;
  strongestBreakout: 'ATH' | '10Y' | '5Y' | '3Y' | '2Y' | '1Y' | null;
  breakoutPrice: number | null;
  breakoutGainPct: number | null;
  vpaFootprint: BreakoutVpaFootprint;
}

export interface WindowAvailabilityInfo {
  available: boolean;
  requiredDays: number;
  availableDays: number;
  label: string;
}

export interface MultiYearBreakoutReport {
  date: string;
  tradingDaysAvailable: number;
  totalScanned: number;
  breakoutCounts: {
    '1Y': number;
    '2Y': number | null;
    '3Y': number | null;
    '5Y': number | null;
    '10Y': number | null;
    'ATH': number;
  };
  windowAvailability: Record<BreakoutWindow, WindowAvailabilityInfo>;
  stocks: BreakoutStock[];
  computedAt: string;
  /**
   * 'pending' when Redis cache is cold and no report has been computed yet.
   * Optional for backward compatibility with reports cached before this
   * field existed -- absence should be treated as 'ready' by consumers.
   */
  status?: 'ready' | 'pending';
}

let cachedReport: MultiYearBreakoutReport | null = null;
let lastComputedTime = 0;
let inFlightCompute: Promise<MultiYearBreakoutReport> | null = null;
const CACHE_TTL_MS = MARKET_TOOLS_CACHE_TTL_MS; // 7-day safety window (ISSUE-008)
const REDIS_TTL_SEC = MARKET_TOOLS_CACHE_TTL_SEC; // 7 days (prevents weekend cold cache)

export class MultiYearBreakoutService {
  /**
   * Compute multi-year breakout metrics across DailyOhlcv history with strict history-depth guards.
   */
  static async getBreakoutReport(forceRefresh = false): Promise<MultiYearBreakoutReport> {
    const now = Date.now();

    if (!forceRefresh) {
      // M-06 fix: query Redis first so web workers pick up reports precomputed by background jobs
      try {
        const redisCached = await cache.get('market_tools:breakout:report');
        if (redisCached) {
          const parsed = JSON.parse(redisCached) as MultiYearBreakoutReport;
          cachedReport = parsed;
          const parsedTime = parsed.computedAt ? new Date(parsed.computedAt).getTime() : NaN;
          lastComputedTime = Number.isFinite(parsedTime) ? parsedTime : now;

          const freshness = await checkCachedReportFreshness(parsed.date, lastComputedTime);
          if (freshness === 'STALE') {
            console.log(
              `[MultiYearBreakoutService] Serving STALE cached report (date: ${parsed.date}) while background precompute refreshes`
            );
          }
          return parsed;
        }
      } catch {
        // Ignore cache lookup errors
      }

      // Memory fallback if Redis is temporarily unreachable
      if (cachedReport && now - lastComputedTime < CACHE_TTL_MS) {
        const freshness = await checkCachedReportFreshness(cachedReport.date, lastComputedTime);
        if (freshness === 'STALE') {
          console.log(
            `[MultiYearBreakoutService] Serving STALE in-memory report (date: ${cachedReport.date}) while background precompute refreshes`
          );
        }
        return cachedReport;
      }

      // ISSUE-001 fix: if compute is currently in flight (e.g. from an authorized refresh or precompute job), await it.
      if (inFlightCompute) {
        return await inFlightCompute;
      }

      // Cold cache protection: do NOT trigger expensive DB queries for unauthenticated / normal page requests.
      return MultiYearBreakoutService.getPendingBreakoutReport();
    }

    // If forceRefresh=true, compute with single-flight and distributed lock deduplication
    if (inFlightCompute) {
      return await inFlightCompute;
    }

    // Acquire distributed lock for multi-worker concurrency protection
    const { acquired, token } = await tryAcquireDistributedLock('lock:market_tools:breakout', 180);
    if (!acquired) {
      return await handleLockContentionWithStaleFallback<MultiYearBreakoutReport>({
        cacheKey: 'market_tools:breakout:report',
        getCachedMemory: () => cachedReport,
        getPendingReport: MultiYearBreakoutService.getPendingBreakoutReport,
      });
    }

    inFlightCompute = (async () => {
      try {
        const report = await withTimeout(
          MultiYearBreakoutService.computeBreakoutReport(now),
          120_000,
          'MultiYearBreakoutService.computeBreakoutReport'
        );
        cachedReport = report;
        lastComputedTime = Date.now();
        return report;
      } finally {
        inFlightCompute = null;
        await releaseDistributedLock('lock:market_tools:breakout', token);
      }
    })();

    return await inFlightCompute;
  }

  /**
   * Pending report returned when cache is cold before background precompute runs.
   */
  static getPendingBreakoutReport(): MultiYearBreakoutReport {
    return {
      date: new Date().toISOString().slice(0, 10),
      tradingDaysAvailable: 0,
      totalScanned: 0,
      breakoutCounts: {
        '1Y': 0,
        '2Y': 0,
        '3Y': 0,
        '5Y': 0,
        '10Y': 0,
        'ATH': 0,
      },
      windowAvailability: {
        '1Y': { available: false, requiredDays: 250, availableDays: 0, label: 'Pending precompute' },
        '2Y': { available: false, requiredDays: 500, availableDays: 0, label: 'Pending precompute' },
        '3Y': { available: false, requiredDays: 750, availableDays: 0, label: 'Pending precompute' },
        '5Y': { available: false, requiredDays: 1250, availableDays: 0, label: 'Pending precompute' },
        '10Y': { available: false, requiredDays: 2500, availableDays: 0, label: 'Pending precompute' },
        'ATH': { available: false, requiredDays: 20, availableDays: 0, label: 'Pending precompute' },
      },
      stocks: [],
      computedAt: new Date().toISOString(),
      status: 'pending',
    };
  }

  /**
   * Invalidate cached breakout report in Redis and process memory.
   */
  static async invalidateCache(): Promise<void> {
    cachedReport = null;
    lastComputedTime = 0;
    try {
      await cache.del('market_tools:breakout:report');
    } catch {
      // Non-critical eviction error
    }
  }

  /**
   * Reset in-memory cache and in-flight promise for test isolation.
   */
  static _resetCacheForTesting(): void {
    cachedReport = null;
    lastComputedTime = 0;
    inFlightCompute = null;
  }

  private static async computeBreakoutReport(now: number): Promise<MultiYearBreakoutReport> {

    // 1. Fetch available trading dates sorted descending
    const dateRows = await withTimeout(
      prisma.$queryRaw<Array<{ date: string }>>`
        SELECT DISTINCT date FROM "DailyOhlcv" WHERE series = 'EQ' ORDER BY date DESC LIMIT 2500
      `,
      MARKET_TOOLS_QUERY_TIMEOUTS.DATE_DISCOVERY_MS,
      'MultiYearBreakout.dateDiscovery'
    );

    if (dateRows.length === 0) {
      throw new Error('No data available in DailyOhlcv table');
    }

    const latestDate = dateRows[0]!.date;
    const oldestDate = dateRows[dateRows.length - 1]!.date;
    const tradingDaysAvailable = dateRows.length;

    // 2. Fetch today's records with trailing max high calculations for 1Y/2Y/3Y/5Y/10Y/ATH
    // Note: Excludes current day using ROWS BETWEEN N PRECEDING AND 1 PRECEDING to prevent self-comparison
    // H-06 fix: bound CTE with date >= oldestDate to prevent full-table scan across unbounded historical dates
    // Protected database-side via SET LOCAL statement_timeout (ISSUE-007)
    const rawStocks = await executeGuardedQuery(
      (tx) =>
        tx.$queryRaw<
          Array<{
            symbol: string;
            open: number;
            high: number;
            low: number;
            close: number;
            prevClose: number;
            volume: bigint | number;
            avgVol20: number | null;
            historyDays: bigint | number;
            high1Y: number | null;
            high2Y: number | null;
            high3Y: number | null;
            high5Y: number | null;
            high10Y: number | null;
            highATH: number | null;
          }>
        >`
          WITH RankedHistory AS (
            SELECT 
              symbol,
              series,
              date,
              open,
              high,
              low,
              close,
              "prevClose",
              volume,
              COUNT(*) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as "historyDays",
              AVG(volume) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) as "avgVol20",
              MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 249 PRECEDING AND 1 PRECEDING) as "high1Y",
              MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 499 PRECEDING AND 1 PRECEDING) as "high2Y",
              MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 749 PRECEDING AND 1 PRECEDING) as "high3Y",
              MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 1249 PRECEDING AND 1 PRECEDING) as "high5Y",
              MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 2499 PRECEDING AND 1 PRECEDING) as "high10Y",
              MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) as "highATH",
              ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) as rn
            FROM "DailyOhlcv"
            WHERE series = 'EQ' AND date >= ${oldestDate}
          )
          SELECT 
            symbol,
            open,
            high,
            low,
            close,
            "prevClose",
            volume,
            "avgVol20",
            "historyDays",
            "high1Y",
            "high2Y",
            "high3Y",
            "high5Y",
            "high10Y",
            "highATH"
          FROM RankedHistory
          WHERE date = ${latestDate} AND rn = 1
        `,
      {
        statementTimeoutMs: MARKET_TOOLS_QUERY_TIMEOUTS.MULTI_YEAR_BREAKOUT_MS,
        label: 'MultiYearBreakout.rawStocks',
      }
    );

    // Exclude ETFs/liquid/debt funds -- see nse-fund-exclusion.ts for rationale.
    // Filtering rawStocks directly (rather than inside the loop below) keeps
    // totalScanned = rawStocks.length accurate to the real operating-company
    // universe rather than the raw series='EQ' row count.
    const rawStocksFiltered = rawStocks.filter((r: { symbol: string }) => !isLikelyEtfOrFund(r.symbol));

    const WINDOW_SPECS: Record<BreakoutWindow, number> = {
      '1Y': 250,
      '2Y': 500,
      '3Y': 750,
      '5Y': 1250,
      '10Y': 2500,
      'ATH': 20, // minimum 20 days history required to qualify for ATH
    };

    const windowAvailability: Record<BreakoutWindow, WindowAvailabilityInfo> = {
      '1Y': {
        available: tradingDaysAvailable >= WINDOW_SPECS['1Y'],
        requiredDays: WINDOW_SPECS['1Y'],
        availableDays: tradingDaysAvailable,
        label: tradingDaysAvailable >= WINDOW_SPECS['1Y'] ? 'Available' : `Insufficient history (${tradingDaysAvailable}/${WINDOW_SPECS['1Y']} days)`,
      },
      '2Y': {
        available: tradingDaysAvailable >= WINDOW_SPECS['2Y'],
        requiredDays: WINDOW_SPECS['2Y'],
        availableDays: tradingDaysAvailable,
        label: tradingDaysAvailable >= WINDOW_SPECS['2Y'] ? 'Available' : `Insufficient history (${tradingDaysAvailable}/${WINDOW_SPECS['2Y']} days)`,
      },
      '3Y': {
        available: tradingDaysAvailable >= WINDOW_SPECS['3Y'],
        requiredDays: WINDOW_SPECS['3Y'],
        availableDays: tradingDaysAvailable,
        label: tradingDaysAvailable >= WINDOW_SPECS['3Y'] ? 'Available' : `Insufficient history (${tradingDaysAvailable}/${WINDOW_SPECS['3Y']} days)`,
      },
      '5Y': {
        available: tradingDaysAvailable >= WINDOW_SPECS['5Y'],
        requiredDays: WINDOW_SPECS['5Y'],
        availableDays: tradingDaysAvailable,
        label: tradingDaysAvailable >= WINDOW_SPECS['5Y'] ? 'Available' : `Insufficient history (${tradingDaysAvailable}/${WINDOW_SPECS['5Y']} days)`,
      },
      '10Y': {
        available: tradingDaysAvailable >= WINDOW_SPECS['10Y'],
        requiredDays: WINDOW_SPECS['10Y'],
        availableDays: tradingDaysAvailable,
        label: tradingDaysAvailable >= WINDOW_SPECS['10Y'] ? 'Available' : `Insufficient history (${tradingDaysAvailable}/${WINDOW_SPECS['10Y']} days)`,
      },
      'ATH': {
        available: tradingDaysAvailable >= WINDOW_SPECS['ATH'],
        requiredDays: WINDOW_SPECS['ATH'],
        availableDays: tradingDaysAvailable,
        label: tradingDaysAvailable >= WINDOW_SPECS['ATH'] ? 'Available' : `Insufficient history (${tradingDaysAvailable}/${WINDOW_SPECS['ATH']} days)`,
      },
    };

    const processedStocks: BreakoutStock[] = [];
    let count1Y = 0;
    let count2Y: number | null = windowAvailability['2Y'].available ? 0 : null;
    let count3Y: number | null = windowAvailability['3Y'].available ? 0 : null;
    let count5Y: number | null = windowAvailability['5Y'].available ? 0 : null;
    let count10Y: number | null = windowAvailability['10Y'].available ? 0 : null;
    let countATH = 0;

    for (const raw of rawStocksFiltered) {
      const historyDays = Number(raw.historyDays || 0);
      const close = Number(raw.close || 0);
      const _open = Number(raw.open || 0);
      const high = Number(raw.high || 0);
      const low = Number(raw.low || 0);
      const prevCloseRaw = raw.prevClose != null ? Number(raw.prevClose) : null;
      const volume = Number(raw.volume || 0);

      if (!isValidOhlcvGeometry({
        open: _open,
        high,
        low,
        close,
        volume,
        prevClose: prevCloseRaw,
      })) {
        continue;
      }

      const prevClose = prevCloseRaw ?? 0;
      const changePct = prevClose > 0 ? Math.round(((close - prevClose) / prevClose) * 10000) / 100 : 0;
      const avgVol20 = Number(raw.avgVol20 || 0);
      const sector = getSymbolSector(raw.symbol);

      const rvol20dRaw = avgVol20 > 0 ? computeRvol(volume, avgVol20) : null;
      const rvol20d = rvol20dRaw !== null ? Number(rvol20dRaw.toFixed(2)) : null;
      const clvRaw = (high > low) ? computeClv(close, high, low) : null;
      const clv = clvRaw !== null ? Number(clvRaw.toFixed(2)) : null;
      const rangePct = (close > 0 && high > low) ? computeRangePct(high, low, close) : null;
      const vpaFootprint = classifyBreakoutVpa(rvol20d, clv, rangePct);

      // --- 1Y Window ---
      let breakout1Y: boolean | null = null;
      let high1Y: number | null = null;
      let gain1YPct: number | null = null;
      if (historyDays >= WINDOW_SPECS['1Y'] && raw.high1Y !== null) {
        high1Y = Math.round(Number(raw.high1Y) * 100) / 100;
        breakout1Y = close >= high1Y;
        gain1YPct = high1Y > 0 ? Math.round(((close - high1Y) / high1Y) * 10000) / 100 : 0;
        if (breakout1Y) count1Y++;
      }

      // --- 2Y Window ---
      let breakout2Y: boolean | null = null;
      let high2Y: number | null = null;
      let gain2YPct: number | null = null;
      if (historyDays >= WINDOW_SPECS['2Y'] && raw.high2Y !== null) {
        high2Y = Math.round(Number(raw.high2Y) * 100) / 100;
        breakout2Y = close >= high2Y;
        gain2YPct = high2Y > 0 ? Math.round(((close - high2Y) / high2Y) * 10000) / 100 : 0;
        if (breakout2Y && count2Y !== null) count2Y++;
      }

      // --- 3Y Window ---
      let breakout3Y: boolean | null = null;
      let high3Y: number | null = null;
      let gain3YPct: number | null = null;
      if (historyDays >= WINDOW_SPECS['3Y'] && raw.high3Y !== null) {
        high3Y = Math.round(Number(raw.high3Y) * 100) / 100;
        breakout3Y = close >= high3Y;
        gain3YPct = high3Y > 0 ? Math.round(((close - high3Y) / high3Y) * 10000) / 100 : 0;
        if (breakout3Y && count3Y !== null) count3Y++;
      }

      // --- 5Y Window ---
      let breakout5Y: boolean | null = null;
      let high5Y: number | null = null;
      let gain5YPct: number | null = null;
      if (historyDays >= WINDOW_SPECS['5Y'] && raw.high5Y !== null) {
        high5Y = Math.round(Number(raw.high5Y) * 100) / 100;
        breakout5Y = close >= high5Y;
        gain5YPct = high5Y > 0 ? Math.round(((close - high5Y) / high5Y) * 10000) / 100 : 0;
        if (breakout5Y && count5Y !== null) count5Y++;
      }

      // --- 10Y Window ---
      let breakout10Y: boolean | null = null;
      let high10Y: number | null = null;
      let gain10YPct: number | null = null;
      if (historyDays >= WINDOW_SPECS['10Y'] && raw.high10Y !== null) {
        high10Y = Math.round(Number(raw.high10Y) * 100) / 100;
        breakout10Y = close >= high10Y;
        gain10YPct = high10Y > 0 ? Math.round(((close - high10Y) / high10Y) * 10000) / 100 : 0;
        if (breakout10Y && count10Y !== null) count10Y++;
      }

      // --- ATH Window ---
      let breakoutATH: boolean | null = null;
      let highATH: number | null = null;
      let gainATHPct: number | null = null;
      if (historyDays >= WINDOW_SPECS['ATH'] && raw.highATH !== null) {
        highATH = Math.round(Number(raw.highATH) * 100) / 100;
        breakoutATH = close >= highATH;
        gainATHPct = highATH > 0 ? Math.round(((close - highATH) / highATH) * 10000) / 100 : 0;
        if (breakoutATH) countATH++;
      }

      // Determine Strongest Breakout Category & Breakout Reference Price
      let strongestBreakout: BreakoutStock['strongestBreakout'] = null;
      let breakoutPrice: number | null = null;
      let breakoutGainPct: number | null = null;

      if (breakout10Y) {
        strongestBreakout = '10Y';
        breakoutPrice = high10Y;
        breakoutGainPct = gain10YPct;
      } else if (breakout5Y) {
        strongestBreakout = '5Y';
        breakoutPrice = high5Y;
        breakoutGainPct = gain5YPct;
      } else if (breakout3Y) {
        strongestBreakout = '3Y';
        breakoutPrice = high3Y;
        breakoutGainPct = gain3YPct;
      } else if (breakout2Y) {
        strongestBreakout = '2Y';
        breakoutPrice = high2Y;
        breakoutGainPct = gain2YPct;
      } else if (breakout1Y) {
        strongestBreakout = '1Y';
        breakoutPrice = high1Y;
        breakoutGainPct = gain1YPct;
      } else if (breakoutATH) {
        strongestBreakout = 'ATH';
        breakoutPrice = highATH;
        breakoutGainPct = gainATHPct;
      }

      // H-07 fix: If stock has ATH breakout alongside a multi-year breakout,
      // upgrade label to ATH only if history covers full available history and at least 2Y (500 days),
      // preventing recent IPOs with limited data from falsely overriding established 1Y/2Y breakouts.
      if (breakoutATH && historyDays >= tradingDaysAvailable && historyDays >= WINDOW_SPECS['2Y']) {
        strongestBreakout = 'ATH';
        breakoutPrice = highATH;
        breakoutGainPct = gainATHPct;
      }

      // Include all stocks that have at least one valid breakout
      if (strongestBreakout !== null) {
        processedStocks.push({
          symbol: raw.symbol,
          sector,
          close,
          prevClose,
          changePct,
          volume,
          rvol20d,
          clv,
          historyDays,
          breakout1Y,
          high1Y,
          gain1YPct,
          breakout2Y,
          high2Y,
          gain2YPct,
          breakout3Y,
          high3Y,
          gain3YPct,
          breakout5Y,
          high5Y,
          gain5YPct,
          breakout10Y,
          high10Y,
          gain10YPct,
          breakoutATH,
          highATH,
          gainATHPct,
          strongestBreakout,
          breakoutPrice,
          breakoutGainPct,
          vpaFootprint,
        });
      }
    }

    // Sort by breakoutGainPct descending
    processedStocks.sort((a, b) => (b.breakoutGainPct || 0) - (a.breakoutGainPct || 0));

    const report: MultiYearBreakoutReport = {
      date: latestDate,
      tradingDaysAvailable,
      totalScanned: rawStocksFiltered.length,
      breakoutCounts: {
        '1Y': count1Y,
        '2Y': count2Y,
        '3Y': count3Y,
        '5Y': count5Y,
        '10Y': count10Y,
        'ATH': countATH,
      },
      windowAvailability,
      stocks: processedStocks,
      computedAt: new Date().toISOString(),
      status: 'ready',
    };

    cachedReport = report;
    lastComputedTime = now;

    try {
      await cache.set('market_tools:breakout:report', JSON.stringify(report), REDIS_TTL_SEC);
    } catch {
      // Ignore cache write errors
    }

    return report;
  }
}

// ─── Pure helper exports (used by unit tests via B5 fix) ─────────────────────
//
// B5 fix: these were previously inline anonymous logic inside the for-loop of
// getBreakoutReport(). By extracting and exporting them we let the test file
// import and exercise the REAL production logic rather than locally-redefined mocks.

/**
 * Determines whether a stock has broken out above its prior N-year high.
 * Returns `null` when there is insufficient history (availableDays < requiredDays)
 * or no prior high data, `true` for a breakout, `false` for no breakout.
 */
export function computeWindowBreakout(
  close: number,
  priorHigh: number | null,
  requiredDays: number,
  availableDays: number
): boolean | null {
  if (availableDays < requiredDays || priorHigh === null) {
    return null;
  }
  return close >= priorHigh;
}

/**
 * Returns the label of the strongest (longest) window a stock has broken out of,
 * with ATH acting as an upgrade when present alongside any multi-year breakout.
 */
export function getStrongestBreakout(flags: {
  is10Y: boolean | null;
  is5Y: boolean | null;
  is3Y: boolean | null;
  is2Y: boolean | null;
  is1Y: boolean | null;
  isATH: boolean | null;
}): 'ATH' | '10Y' | '5Y' | '3Y' | '2Y' | '1Y' | null {
  // Priority order matches the inline service logic:
  // longer windows win; ATH only applies when no multi-year window is broken.
  if (flags.is10Y) return '10Y';
  if (flags.is5Y) return '5Y';
  if (flags.is3Y) return '3Y';
  if (flags.is2Y) return '2Y';
  // 1Y alongside ATH: ATH wins (a symbol can't be at a 1Y high without also being at ATH;
  // the label ATH is more informative when breakoutATH is also set)
  if (flags.is1Y && flags.isATH) return 'ATH';
  if (flags.is1Y) return '1Y';
  if (flags.isATH) return 'ATH';
  return null;
}
