import { HistoricalProvider } from './backtest/historical.provider';
import { calculateCPR } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';

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

export class CprStatsService {
  static async getWidthStats(symbol: string, lookback: 90 | 180 | 365 = 90): Promise<CprWidthStats> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (lookback + 30)); // Extra days to cover weekends

    const ohlc = await HistoricalProvider.getHistory(symbol, startDate, endDate);
    if (ohlc.length < 2) {
      throw new Error(`Insufficient historical data for ${symbol}`);
    }

    // We only need the last `lookback` trading days
    const recentOhlc = ohlc.slice(-lookback - 1); 

    let narrowDays = 0, normalDays = 0, wideDays = 0;
    let narrowTrend = 0, normalTrend = 0, wideTrend = 0;
    let totalNarrowWidth = 0;
    
    let currentWidth = 0;
    let currentClassification: 'NARROW' | 'NORMAL' | 'WIDE' = 'NORMAL';
    
    const allWidths: number[] = [];

    for (let i = 1; i < recentOhlc.length; i++) {
      const yesterday = recentOhlc[i - 1];
      const today = recentOhlc[i];

      // Rolling ATR% using up to the 14 candles prior to `today`, so each day's
      // classification only uses information available at that point in time.
      const atrWindow = recentOhlc.slice(Math.max(0, i - 14), i);
      const atrPct = getAtrPct(atrWindow, yesterday.close);

      const cpr = calculateCPR({
        high: yesterday.high,
        low: yesterday.low,
        close: yesterday.close,
      }, atrPct);

      const widthPct = (Math.abs(cpr.tc - cpr.bc) / cpr.pivot) * 100;
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
    const index = allWidths.findIndex(w => w >= currentWidth);
    const historicalPercentile = Math.round((index / allWidths.length) * 100);

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
      historicalPercentile
    };
  }
}
