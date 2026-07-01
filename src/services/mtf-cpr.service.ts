import yahooFinance from 'yahoo-finance2';
import { calculateCPR, classifyCprWidth } from '@/lib/cpr-engine';
import { CPRResult } from '@/types/cpr.types';

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
    
    // Weekly OHLC (last completed week)
    const weekQueryOptions = { period1: new Date(endDate.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(), interval: '1wk' as const };
    const weekHistory: any[] = await yahooFinance.historical(yfSymbol, weekQueryOptions); // eslint-disable-line @typescript-eslint/no-explicit-any
    
    // Monthly OHLC (last completed month)
    const monthQueryOptions = { period1: new Date(endDate.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(), interval: '1mo' as const };
    const monthHistory: any[] = await yahooFinance.historical(yfSymbol, monthQueryOptions); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (weekHistory.length < 2 || monthHistory.length < 2) {
      throw new Error('Not enough MTF data');
    }

    // The last element is usually the current incomplete week/month, so we take the second to last
    const lastCompletedWeek = weekHistory[weekHistory.length - 2];
    const lastCompletedMonth = monthHistory[monthHistory.length - 2];

    const weeklyCPR = calculateCPR({
      high: lastCompletedWeek.high,
      low: lastCompletedWeek.low,
      close: lastCompletedWeek.close
    });

    const monthlyCPR = calculateCPR({
      high: lastCompletedMonth.high,
      low: lastCompletedMonth.low,
      close: lastCompletedMonth.close
    });

    const wWidth = Math.abs(weeklyCPR.tc - weeklyCPR.bc) / weeklyCPR.pivot * 100;
    const wClass = classifyCprWidth(wWidth);

    const mWidth = Math.abs(monthlyCPR.tc - monthlyCPR.bc) / monthlyCPR.pivot * 100;
    const mClass = classifyCprWidth(mWidth);

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
