import { calculateCPR, isCprVirgin } from '@/lib/cpr-engine';
import { MarketStockData } from './market.service';
import { calculateATR } from '@/lib/atr';

export interface SignalResult {
  signals: string[];
  insideValue: boolean;
  higherValue: boolean;
  lowerValue: boolean;
  overlappingValue: boolean;
  virginCPR: boolean;
  hotZone: boolean;
  /**
   * NOTE: this is a range-based proxy (pivot ± range*0.25), not a true Market Profile
   * Value Area derived from volume distribution. Do not treat vah/val/poc here as
   * real VAH/VAL/POC — they're a placeholder until real volume-profile data is wired in.
   */
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
  static getSignals(stock: MarketStockData, asOfDate?: string): SignalResult {
    const signals: string[] = [];
    const ltp = stock.ltp;
    
    // Differentiate yesterday's and today's daily candles robustly
    const todayStr = asOfDate || new Date().toISOString().split('T')[0];
    let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
    let todayCandle = { high: stock.high, low: stock.low, close: stock.ltp };
    let dayBeforeYesterdayCandle = yesterdayCandle;
    let threeDaysAgoCandle = yesterdayCandle;

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

      dayBeforeYesterdayCandle = isLastToday
        ? (stock.history.length >= 3 ? stock.history[stock.history.length - 3] : yesterdayCandle)
        : (stock.history.length >= 2 ? stock.history[stock.history.length - 2] : yesterdayCandle);

      threeDaysAgoCandle = isLastToday
        ? (stock.history.length >= 4 ? stock.history[stock.history.length - 4] : dayBeforeYesterdayCandle)
        : (stock.history.length >= 3 ? stock.history[stock.history.length - 3] : dayBeforeYesterdayCandle);
    }

    // Calculate ATR% for dynamic thresholds
    const atr = calculateATR(stock.history || [], stock.close);
    const atrPct = stock.close > 0 ? atr / stock.close : 0.02;

    // Calculate Yesterday's CPR using day before yesterday's OHLC
    const cprYesterday = calculateCPR({
      high: dayBeforeYesterdayCandle.high,
      low: dayBeforeYesterdayCandle.low,
      close: dayBeforeYesterdayCandle.close,
    }, atrPct);

    // 1. Calculate Today's CPR using yesterday's OHLC
    const cprToday = calculateCPR({
      high: yesterdayCandle.high,
      low: yesterdayCandle.low,
      close: yesterdayCandle.close,
    }, atrPct);

    // Calculate Tomorrow's CPR using today's OHLC
    const cprTomorrow = calculateCPR({
      high: todayCandle.high,
      low: todayCandle.low,
      close: todayCandle.close,
    }, atrPct);

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
    // Check if YESTERDAY's CPR was virgin
    // (price never touched it during yesterday's session)
    const yesterdayTouchedCpr = 
      yesterdayCandle.low <= cprYesterday.tc &&
      yesterdayCandle.high >= cprYesterday.bc;
    
    // Virgin = yesterday's CPR untouched (not 
    // some arbitrary older CPR)
    const virginCPR = isCprVirgin(
      yesterdayCandle.high,
      yesterdayCandle.low,
      cprYesterday.tc,
      cprYesterday.bc
    );
    if (virginCPR) {
      signals.push('VIRGIN');
    }

    // Feature 1: Ascending/Descending CPR
    if (stock.history && stock.history.length >= 4) {
      const d1 = calculateCPR({ 
        high: threeDaysAgoCandle.high,
        low: threeDaysAgoCandle.low,
        close: threeDaysAgoCandle.close
      }, atrPct);
      const d2 = cprYesterday;
      const d3 = cprToday;

      if (d3.tc > d2.tc && d2.tc > d1.tc) {
        signals.push('KGS_ASC_CPR');
      }
      if (d3.tc < d2.tc && d2.tc < d1.tc) {
        signals.push('KGS_DESC_CPR');
      }
    }

    // Feature 2: KGS Inside CPR (distinct concept)
    const isKgsInsideCPR = 
      cprToday.tc < cprYesterday.tc &&
      cprToday.bc > cprYesterday.bc;

    if (isKgsInsideCPR) {
      signals.push('KGS_INSIDE_CPR');
    }

    // Feature 3: KGS Outside CPR
    const isKgsOutsideCPR =
      cprToday.tc > cprYesterday.tc &&
      cprToday.bc < cprYesterday.bc;

    if (isKgsOutsideCPR) {
      signals.push('KGS_OUTSIDE_CPR');
    }

    // Feature 4: RTP Filter (Running Trend Pattern)
    const hasRTP = 
      stock.sma20Slope !== undefined && stock.sma50Slope !== undefined &&
      stock.sma20Slope !== 0 && stock.sma50Slope !== 0 &&
      Math.sign(stock.sma20Slope) === Math.sign(stock.sma50Slope);
    
    if (hasRTP) {
      signals.push('KGS_RTP');
    }

    // 4. Hot Zone (Confluence Zone)
    // Defined if CPR is Narrow AND current LTP is within ATR-scaled distance of CPR Pivot
    const closeDistance = Math.abs(stock.ltp - pivot) / pivot;
    // PROVISIONAL: derived from assumed 2% avg ATR, pending backtest confirmation
    const hotZoneThreshold = 0.10 * atrPct;
    const hotZone = cprToday.classification === 'NARROW' && closeDistance <= hotZoneThreshold;
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
    if (stock.open > yesterdayCandle.high) {
      signals.push('GAP_UP');
    } else if (stock.open < yesterdayCandle.low) {
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

    // 10b. Breakdown (bearish mirror of Breakout)
    if (volumeRatio >= 1.5 && ltp < bc) {
      signals.push('BREAKDOWN');
    }

    // 11. Momentum
    if (ltp > cprToday.r1 || ltp < cprToday.s1) {
      signals.push('MOMENTUM');
    }

    // 12. F&O Build-up Proxies
    const priceChangePct = (ltp - stock.close) / stock.close;
    // PROVISIONAL: derived from assumed 2% avg ATR, pending backtest confirmation
    const buildThreshold = 0.75 * atrPct;
    const unwindThreshold = 0.50 * atrPct; // Originally 0.010 (1.0%), using 0.50 * ATR% for scaling

    if (priceChangePct > buildThreshold && volumeRatio >= 1.5) {
      signals.push('LONG_BUILD');
    } else if (priceChangePct < -buildThreshold && volumeRatio >= 1.5) {
      signals.push('SHORT_BUILD');
    } else if (priceChangePct < -unwindThreshold && volumeRatio < 1.0) {
      signals.push('LONG_UNWIND');
    } else if (priceChangePct > unwindThreshold && volumeRatio < 1.0) {
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
