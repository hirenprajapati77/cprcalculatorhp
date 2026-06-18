import { calculateCPR } from '@/lib/cpr-engine';
import { MarketStockData } from './market.service';

export interface SignalResult {
  signals: string[];
  insideValue: boolean;
  higherValue: boolean;
  lowerValue: boolean;
  overlappingValue: boolean;
  virginCPR: boolean;
  hotZone: boolean;
  moneyZone: {
    vah: number;
    val: number;
    poc: number;
  };
}

export class SignalService {
  /**
   * Computes CPR-based PivotBoss and F&O price-action signals.
   */
  static getSignals(stock: MarketStockData): SignalResult {
    const signals: string[] = [];
    const ltp = stock.ltp;
    
    // Differentiate yesterday's and today's daily candles robustly
    const todayStr = new Date().toISOString().split('T')[0];
    let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
    let todayCandle = { high: stock.high, low: stock.low, close: stock.ltp };

    if (stock.history && stock.history.length > 0) {
      const lastCandle = stock.history[stock.history.length - 1];
      const isLastToday = lastCandle.date === todayStr;
      
      todayCandle = isLastToday ? lastCandle : {
        high: stock.high,
        low: stock.low,
        close: stock.ltp
      };
      
      yesterdayCandle = isLastToday 
        ? (stock.history.length >= 2 ? stock.history[stock.history.length - 2] : lastCandle)
        : lastCandle;
    }

    // 1. Calculate Today's CPR using yesterday's OHLC
    const cprToday = calculateCPR({
      high: yesterdayCandle.high,
      low: yesterdayCandle.low,
      close: yesterdayCandle.close,
    });

    // Calculate Tomorrow's CPR using today's OHLC
    const cprTomorrow = calculateCPR({
      high: todayCandle.high,
      low: todayCandle.low,
      close: todayCandle.close,
    });

    const tc = cprToday.tc;
    const bc = cprToday.bc;
    const pivot = cprToday.pivot;
    const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1;

    // 2. Initialize Value Relationships
    let insideValue = false;
    let higherValue = false;
    let lowerValue = false;
    let overlappingValue = false;

    // Compare tomorrow's CPR to today's CPR
    insideValue = cprTomorrow.bc >= cprToday.bc && cprTomorrow.tc <= cprToday.tc;
    higherValue = cprTomorrow.bc > cprToday.bc && cprTomorrow.tc > cprToday.tc;
    lowerValue = cprTomorrow.bc < cprToday.bc && cprTomorrow.tc < cprToday.tc;
    overlappingValue = !insideValue && !higherValue && !lowerValue && 
                       (cprTomorrow.bc <= cprToday.tc && cprTomorrow.tc >= cprToday.bc);

    if (insideValue) signals.push('INSIDE_VALUE');
    if (higherValue) signals.push('HIGHER_VALUE');
    if (lowerValue) signals.push('LOWER_VALUE');
    if (overlappingValue) signals.push('OVERLAPPING_VALUE');

    // 3. Virgin CPR Check
    // If today's actual range (stock.low to stock.high) did not touch today's CPR range
    const virginCPR = todayCandle.low > Math.max(cprToday.tc, cprToday.bc) || todayCandle.high < Math.min(cprToday.tc, cprToday.bc);
    if (virginCPR) {
      signals.push('VIRGIN');
    }

    // 4. Hot Zone (Confluence Zone)
    // Defined if CPR is Narrow AND previous close or LTP is within 0.15% of CPR Pivot
    const closeDistance = Math.abs(stock.close - pivot) / pivot;
    const hotZone = cprToday.classification === 'NARROW' && closeDistance <= 0.0015;
    if (hotZone) {
      signals.push('HOT_ZONE');
    }

    // 5. Money Zone Proxy (VAH, VAL, POC)
    // Value Area High (VAH) and Value Area Low (VAL) are approximated using typical price (POC) and standard deviation proxy
    const poc = pivot;
    const range = stock.high - stock.low;
    const vah = poc + range * 0.25;
    const val = poc - range * 0.25;

    // 6. CPR Classifications
    if (cprToday.classification === 'NARROW') {
      signals.push('NARROW');
    } else if (cprToday.classification === 'WIDE') {
      signals.push('WIDE');
    } else {
      signals.push('NORMAL');
    }

    // 7. Bullish / Bearish / Inside
    if (ltp > tc) {
      signals.push('BULLISH');
    } else if (ltp < bc) {
      signals.push('BEARISH');
    } else {
      signals.push('INSIDE');
    }

    // 8. Gap Up / Gap Down
    if (stock.open > stock.high) {
      signals.push('GAP_UP');
    } else if (stock.open < stock.low) {
      signals.push('GAP_DOWN');
    }

    // 9. Volume Spike
    if (volumeRatio >= 2.0) {
      signals.push('VOLUME_SPIKE');
    }

    // 10. Breakout
    if (volumeRatio >= 1.5 && ltp > tc) {
      signals.push('BREAKOUT');
    }

    // 11. Momentum
    if (ltp > cprToday.r1 || ltp < cprToday.s1) {
      signals.push('MOMENTUM');
    }

    // 12. F&O Build-up Proxies
    const priceChangePct = (ltp - stock.close) / stock.close;
    if (priceChangePct > 0.015 && volumeRatio >= 1.5) {
      signals.push('LONG_BUILD');
    } else if (priceChangePct < -0.015 && volumeRatio >= 1.5) {
      signals.push('SHORT_BUILD');
    } else if (priceChangePct < -0.010 && volumeRatio < 1.0) {
      signals.push('LONG_UNWIND');
    } else if (priceChangePct > 0.010 && volumeRatio < 1.0) {
      signals.push('SHORT_COVER');
    }

    return {
      signals,
      insideValue,
      higherValue,
      lowerValue,
      overlappingValue,
      virginCPR,
      hotZone,
      moneyZone: { vah, val, poc },
    };
  }
}
