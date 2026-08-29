import { PrismaClient } from '@prisma/client';
import { cache } from '@/lib/redis';
import { getSymbolSector } from './market-breadth.service';
import { isLikelyEtfOrFund } from '@/lib/nse-fund-exclusion';

const prisma = new PrismaClient();

export type BreakoutWindow = '1Y' | '2Y' | '3Y' | '5Y' | '10Y' | 'ATH';

export interface BreakoutStock {
  symbol: string;
  sector: string;
  close: number;
  prevClose: number;
  changePct: number;
  volume: number;
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
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class MultiYearBreakoutService {
  /**
   * Compute multi-year breakout metrics across DailyOhlcv history with strict history-depth guards.
   */
  static async getBreakoutReport(forceRefresh = false): Promise<MultiYearBreakoutReport> {
    const now = Date.now();
    if (!forceRefresh && cachedReport && now - lastComputedTime < CACHE_TTL_MS) {
      return cachedReport;
    }

    if (!forceRefresh) {
      try {
        const redisCached = await cache.get('market_tools:breakout:report');
        if (redisCached) {
          const parsed = JSON.parse(redisCached) as MultiYearBreakoutReport;
          cachedReport = parsed;
          lastComputedTime = now;
          return parsed;
        }
      } catch {
        // Ignore cache lookup errors
      }

      // Memory fallback if Redis is temporarily unreachable
      if (cachedReport) {
        return cachedReport;
      }

      // If cache is missing and forceRefresh=false, do NOT trigger heavy live compute on HTTP thread.
      // Return empty baseline report until background precompute job runs.
      const defaultWin = { label: '1Y', available: false, requiredDays: 250, availableDays: 0 };
      return {
        date: new Date().toISOString().split('T')[0],
        tradingDaysAvailable: 0,
        windowAvailability: {
          '1Y': { ...defaultWin, label: '1Y', requiredDays: 250 },
          '2Y': { ...defaultWin, label: '2Y', requiredDays: 500 },
          '3Y': { ...defaultWin, label: '3Y', requiredDays: 750 },
          '5Y': { ...defaultWin, label: '5Y', requiredDays: 1250 },
          '10Y': { ...defaultWin, label: '10Y', requiredDays: 2500 },
          ATH: { ...defaultWin, label: 'ATH', requiredDays: 2500 },
        },
        totalScanned: 0,
        breakoutCounts: { '1Y': 0, '2Y': 0, '3Y': 0, '5Y': 0, '10Y': 0, ATH: 0 },
        stocks: [],
        computedAt: new Date().toISOString(),
        status: 'pending',
      };
    }

    // 1. Fetch available trading dates sorted descending
    const dateRows = await prisma.$queryRaw<Array<{ date: string }>>`
      SELECT DISTINCT date FROM "DailyOhlcv" WHERE series = 'EQ' ORDER BY date DESC LIMIT 2500
    `;

    if (dateRows.length === 0) {
      throw new Error('No data available in DailyOhlcv table');
    }

    const latestDate = dateRows[0]!.date;
    const tradingDaysAvailable = dateRows.length;

    // 2. Fetch today's records with trailing max high calculations for 1Y/2Y/3Y/5Y/10Y/ATH
    // Note: Excludes current day using ROWS BETWEEN N PRECEDING AND 1 PRECEDING to prevent self-comparison
    const rawStocks = await prisma.$queryRaw<
      Array<{
        symbol: string;
        close: number;
        prevClose: number;
        volume: bigint | number;
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
          close,
          "prevClose",
          volume,
          COUNT(*) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as "historyDays",
          MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 249 PRECEDING AND 1 PRECEDING) as "high1Y",
          MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 499 PRECEDING AND 1 PRECEDING) as "high2Y",
          MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 749 PRECEDING AND 1 PRECEDING) as "high3Y",
          MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 1249 PRECEDING AND 1 PRECEDING) as "high5Y",
          MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 2499 PRECEDING AND 1 PRECEDING) as "high10Y",
          MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) as "highATH",
          ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) as rn
        FROM "DailyOhlcv"
        WHERE series = 'EQ'
      )
      SELECT 
        symbol,
        close,
        "prevClose",
        volume,
        "historyDays",
        "high1Y",
        "high2Y",
        "high3Y",
        "high5Y",
        "high10Y",
        "highATH"
      FROM RankedHistory
      WHERE date = ${latestDate} AND rn = 1
    `;

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
      const prevClose = Number(raw.prevClose || 0);
      const changePct = prevClose > 0 ? Math.round(((close - prevClose) / prevClose) * 10000) / 100 : 0;
      const volume = Number(raw.volume || 0);
      const sector = getSymbolSector(raw.symbol);

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

      // If stock has ATH breakout alongside a multi-year breakout, upgrade label to ATH if history is full
      if (breakoutATH && strongestBreakout !== null) {
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
      await cache.set('market_tools:breakout:report', JSON.stringify(report), 3600);
    } catch {
      // Ignore cache write errors
    }

    return report;
  }
}
