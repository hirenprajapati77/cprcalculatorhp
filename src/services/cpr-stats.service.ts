import { HistoricalProvider } from './backtest/historical.provider';
import { calculateCPR } from '@/lib/cpr-engine';
import { DEFAULT_ATR_PERIOD, getAtrPct } from '@/lib/atr';

export interface CprWidthStats {
  symbol: string;
  lookbackDays: number;
  narrowDays: number;
  normalDays: number;
  wideDays: number;
  narrowTrendRate: number;
  normalTrendRate: number;
  wideTrendRate: number;
  avgNarrowWidth: number;
  currentWidth: number;
  currentClassification: 'NARROW' | 'NORMAL' | 'WIDE';
  historicalPercentile: number;
}

/** Candles needed for a full DEFAULT_ATR_PERIOD average (period TRs need period+1 bars). */
const ATR_WINDOW_BARS = DEFAULT_ATR_PERIOD + 1;

export class CprStatsService {
  static async getWidthStats(symbol: string, lookback: 90 | 180 | 365 = 90): Promise<CprWidthStats> {
    const endDate = new Date();
    const startDate = new Date();
    // Calendar padding for weekends/holidays + ATR warmup trading days.
    startDate.setDate(endDate.getDate() - (lookback + 30 + ATR_WINDOW_BARS));

    const ohlc = await HistoricalProvider.getHistory(symbol, startDate, endDate);
    if (ohlc.length < 2) {
      throw new Error(`Insufficient historical data for ${symbol}`);
    }

    // Keep lookback CPR days plus ATR warmup bars so early classifications
    // are not forced onto the 2% ATR fallback.
    const recentOhlc = ohlc.slice(-(lookback + ATR_WINDOW_BARS));

    let narrowDays = 0, normalDays = 0, wideDays = 0;
    let narrowTrend = 0, normalTrend = 0, wideTrend = 0;
    let totalNarrowWidth = 0;
    
    let currentWidth = 0;
    let currentClassification: 'NARROW' | 'NORMAL' | 'WIDE' = 'NORMAL';
    
    const allWidths: number[] = [];

    // First index that contributes to lookback stats (prior bars are ATR warmup only).
    const firstStatsIdx = Math.max(1, recentOhlc.length - lookback);

    for (let i = 1; i < recentOhlc.length; i++) {
      const yesterday = recentOhlc[i - 1];
      const today = recentOhlc[i];

      // Rolling ATR% — need period+1 bars for a full period-TR average.
      const atrWindow = recentOhlc.slice(Math.max(0, i - ATR_WINDOW_BARS), i);
      const atrPct = getAtrPct(atrWindow, yesterday.close);

      const cpr = calculateCPR({
        high: yesterday.high,
        low: yesterday.low,
        close: yesterday.close,
      }, atrPct);

      const widthPct = (Math.abs(cpr.tc - cpr.bc) / cpr.pivot) * 100;

      // Warmup-only bars: compute ATR path but do not include in stats rates.
      if (i < firstStatsIdx) {
        continue;
      }

      allWidths.push(widthPct);

      const isNarrow = cpr.classification === 'NARROW';
      const isWide = cpr.classification === 'WIDE';

      // Trend condition: absolute body size > 0.5% of open
      const bodyPct = (Math.abs(today.close - today.open) / today.open) * 100;
      const isTrending = bodyPct > 0.5;

      if (isNarrow) {
        narrowDays++;
        if (isTrending) narrowTrend++;
        totalNarrowWidth += widthPct;
      } else if (isWide) {
        wideDays++;
        if (isTrending) wideTrend++;
      } else {
        normalDays++;
        if (isTrending) normalTrend++;
      }

      // If this is the last day in the loop, record it as current
      if (i === recentOhlc.length - 1) {
        currentWidth = widthPct;
        currentClassification = isNarrow ? 'NARROW' : isWide ? 'WIDE' : 'NORMAL';
      }
    }

    // Calculate percentiles
    allWidths.sort((a, b) => a - b);
    const index = allWidths.length === 0 ? 0 : allWidths.findIndex(w => w >= currentWidth);
    const historicalPercentile =
      allWidths.length === 0 ? 50 : Math.round((Math.max(0, index) / allWidths.length) * 100);

    return {
      symbol,
      lookbackDays: lookback,
      narrowDays,
      normalDays,
      wideDays,
      narrowTrendRate: narrowDays > 0 ? (narrowTrend / narrowDays) * 100 : 0,
      normalTrendRate: normalDays > 0 ? (normalTrend / normalDays) * 100 : 0,
      wideTrendRate: wideDays > 0 ? (wideTrend / wideDays) * 100 : 0,
      avgNarrowWidth: narrowDays > 0 ? totalNarrowWidth / narrowDays : 0,
      currentWidth,
      currentClassification,
      historicalPercentile,
    };
  }
}
