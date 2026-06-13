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
    
    // 1. Calculate Today's CPR using yesterday's OHLC
    const cprToday = calculateCPR({
      high: stock.high,
      low: stock.low,
      close: stock.close,
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

    // We need at least 2 historical daily candles to compare today's CPR with yesterday's CPR
    if (stock.history && stock.history.length >= 2) {
      // history[length - 1] is yesterday's candle (used for today's CPR)
      // history[length - 2] is the day before yesterday's candle (used for yesterday's CPR)
      const prevCandle = stock.history[stock.history.length - 2];
      const cprYesterday = calculateCPR({
        high: prevCandle.high,
        low: prevCandle.low,
        close: prevCandle.close,
      });

      const tcYesterday = cprYesterday.tc;
      const bcYesterday = cprYesterday.bc;

      // Inside Value Relationship
      insideValue = bc >= bcYesterday && tc <= tcYesterday;
      
      // Higher Value Relationship
      higherValue = bc > bcYesterday && tc > tcYesterday;
      
      // Lower Value Relationship
      lowerValue = bc < bcYesterday && tc < tcYesterday;
      
      // Overlapping Value Relationship
      overlappingValue = !insideValue && !higherValue && !lowerValue && 
                         (bc <= tcYesterday && tc >= bcYesterday);

      if (insideValue) signals.push('INSIDE_VALUE');
      if (higherValue) signals.push('HIGHER_VALUE');
      if (lowerValue) signals.push('LOWER_VALUE');
      if (overlappingValue) signals.push('OVERLAPPING_VALUE');
    }

    // 3. Virgin CPR Check
    // If price during today's session did not cross the CPR levels (TC/BC range)
    const todayMinPrice = Math.min(stock.open, ltp);
    const todayMaxPrice = Math.max(stock.open, ltp);
    const virginCPR = todayMinPrice > tc || todayMaxPrice < bc;
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
