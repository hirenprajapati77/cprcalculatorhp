import yahooFinance from 'yahoo-finance2';
import { calculateCPR } from '@/lib/cpr-engine';

export interface MtfCprLevels {
  daily?: any;
  weekly: any;
  monthly: any;
  confluence: {
    strongSupport: number[];
    strongResistance: number[];
  };
}

export class MtfCprService {
  static async getLevels(symbol: string): Promise<MtfCprLevels> {
    const yfSymbol = symbol === 'NIFTY50' || symbol === 'NIFTY' ? '^NSEI' : \`\${symbol}.NS\`;

    // We fetch a bit of history to ensure we get the last completed week and month
    const endDate = new Date();
    
    // Weekly OHLC (last completed week)
    const weekQueryOptions = { period1: new Date(endDate.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(), interval: '1wk' as const };
    const weekHistory = await yahooFinance.historical(yfSymbol, weekQueryOptions);
    
    // Monthly OHLC (last completed month)
    const monthQueryOptions = { period1: new Date(endDate.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(), interval: '1mo' as const };
    const monthHistory = await yahooFinance.historical(yfSymbol, monthQueryOptions);

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
    const wClass = wWidth <= 0.5 ? 'NARROW' : wWidth > 0.8 ? 'WIDE' : 'NORMAL';

    const mWidth = Math.abs(monthlyCPR.tc - monthlyCPR.bc) / monthlyCPR.pivot * 100;
    const mClass = mWidth <= 0.5 ? 'NARROW' : mWidth > 0.8 ? 'WIDE' : 'NORMAL';

    const weekly = { ...weeklyCPR, width: wWidth, classification: wClass };
    const monthly = { ...monthlyCPR, width: mWidth, classification: mClass };

    // Placeholder for confluence (will be calculated fully in UI if daily is known, or we can fetch daily here)
    const confluence = { strongSupport: [], strongResistance: [] };

    return { weekly, monthly, confluence };
  }
}
