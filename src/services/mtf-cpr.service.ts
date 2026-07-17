import yahooFinance from 'yahoo-finance2';
import { calculateCPR } from '@/lib/cpr-engine';
import { CPRResult } from '@/types/cpr.types';
import { getISTTime } from '@/lib/market-hours';

export interface MtfCprLevels {
  weekly: CPRResult & { width: number; classification: "NARROW" | "NORMAL" | "WIDE" };
  monthly: CPRResult & { width: number; classification: "NARROW" | "NORMAL" | "WIDE" };
  confluence: {
    strongSupport: number[];
    strongResistance: number[];
  };
}

export class MtfCprService {
  static async getLevels(symbol: string): Promise<MtfCprLevels> {
    const yfSymbol = symbol === 'NIFTY50' || symbol === 'NIFTY' ? '^NSEI' : `${symbol}.NS`;

    // We fetch a bit of history to ensure we get the last completed week and month
    const endDate = new Date();
    
    interface YahooCandle {
      date: Date | string;
      high: number;
      low: number;
      close: number;
    }
    
    // Weekly OHLC (last completed week) - fetching ~150 days to guarantee at least 15 weekly bars for 14-period ATR
    const weekQueryOptions = { period1: new Date(endDate.getTime() - 150 * 24 * 60 * 60 * 1000).toISOString(), interval: '1wk' as const };
    const weekHistory: YahooCandle[] = await yahooFinance.historical(yfSymbol, weekQueryOptions) as unknown as YahooCandle[];
    
    // Monthly OHLC (last completed month) - fetching ~500 days to guarantee at least 15 monthly bars for 14-period ATR
    const monthQueryOptions = { period1: new Date(endDate.getTime() - 500 * 24 * 60 * 60 * 1000).toISOString(), interval: '1mo' as const };
    const monthHistory: YahooCandle[] = await yahooFinance.historical(yfSymbol, monthQueryOptions) as unknown as YahooCandle[];

    if (weekHistory.length < 2 || monthHistory.length < 2) {
      throw new Error('Not enough MTF data');
    }

    // Helper to robustly find the LAST index of a completed period using IST calendar
    // (avoids UTC Sunday midnight treating Monday 00:30 IST as still "last week").
    const getLastCompletedIndex = (history: { date: Date | string }[], isMonthly: boolean) => {
      const ist = getISTTime();
      const [y, m, d] = ist.dateString.split('-').map(Number);
      // Construct IST calendar date as a UTC noon anchor to avoid DST edge cases
      const startOfCurrentPeriod = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      
      if (isMonthly) {
        startOfCurrentPeriod.setUTCDate(1);
      } else {
        // Monday-start week in IST
        const weekdayMap: Record<string, number> = {
          Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
          Thursday: 4, Friday: 5, Saturday: 6,
        };
        const day = weekdayMap[ist.weekday] ?? startOfCurrentPeriod.getUTCDay();
        const diff = day === 0 ? -6 : 1 - day;
        startOfCurrentPeriod.setUTCDate(startOfCurrentPeriod.getUTCDate() + diff);
      }
      startOfCurrentPeriod.setUTCHours(0, 0, 0, 0);

      let lastCompletedIndex = -1;
      for (let i = history.length - 1; i >= 0; i--) {
        if (new Date(history[i].date) < startOfCurrentPeriod) {
          lastCompletedIndex = i;
          break;
        }
      }
      return lastCompletedIndex;
    };

    const wIdx = getLastCompletedIndex(weekHistory, false);
    const mIdx = getLastCompletedIndex(monthHistory, true);

    if (wIdx === -1 || mIdx === -1) {
      throw new Error('Could not identify completed MTF periods');
    }

    const lastCompletedWeek = weekHistory[wIdx];
    const lastCompletedMonth = monthHistory[mIdx];

    const { getAtrPct } = await import('@/lib/atr');
    // Calculate ATR% using all available history up to the last completed candle explicitly using its index
    const wAtrPct = getAtrPct(weekHistory.slice(0, wIdx + 1), lastCompletedWeek.close);
    const mAtrPct = getAtrPct(monthHistory.slice(0, mIdx + 1), lastCompletedMonth.close);

    const weeklyCPR = calculateCPR({
      high: lastCompletedWeek.high,
      low: lastCompletedWeek.low,
      close: lastCompletedWeek.close
    }, wAtrPct);

    const monthlyCPR = calculateCPR({
      high: lastCompletedMonth.high,
      low: lastCompletedMonth.low,
      close: lastCompletedMonth.close
    }, mAtrPct);

    const wWidth = weeklyCPR.width;
    const wClass = weeklyCPR.classification;

    const mWidth = monthlyCPR.width;
    const mClass = monthlyCPR.classification;

    const weekly = { ...weeklyCPR, width: wWidth, classification: wClass as "NARROW" | "NORMAL" | "WIDE" };
    const monthly = { ...monthlyCPR, width: mWidth, classification: mClass as "NARROW" | "NORMAL" | "WIDE" };

    // Confluence logic: check if weekly and monthly pivots align closely
    const confluence: { strongSupport: number[], strongResistance: number[] } = { strongSupport: [], strongResistance: [] };
    
    // Check if Weekly S1 and Monthly S1 are within 0.5%
    if (Math.abs(weeklyCPR.s1 - monthlyCPR.s1) / monthlyCPR.s1 < 0.005) {
      confluence.strongSupport.push(Math.round(weeklyCPR.s1));
    }
    // Check if Weekly R1 and Monthly R1 are within 0.5%
    if (Math.abs(weeklyCPR.r1 - monthlyCPR.r1) / monthlyCPR.r1 < 0.005) {
      confluence.strongResistance.push(Math.round(weeklyCPR.r1));
    }

    return { weekly, monthly, confluence };
  }
}
