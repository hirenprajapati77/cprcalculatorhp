import { calculateCPR, isCprVirgin } from '@/lib/cpr-engine';
import { MarketStockData } from './market.service';
import { calculateATR } from '@/lib/atr';
import { safeRatio } from '@/lib/math';
import { getISTDateString, isTodayCandleClosed } from '@/lib/market-hours';

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

/**
 * Fallback ATR% (2%) used only when close price is zero/unavailable.
 * Intentionally conservative — pending backtest confirmation of a better default.
 */
const DEFAULT_ATR_PCT = 0.02;

/**
 * Returns today's date as YYYY-MM-DD in IST (UTC+5:30).
 * Using UTC (toISOString) is unsafe for NSE candle selection because NSE closes
 * at 3:30 PM IST, but UTC date flips 5.5 hours earlier — causing the last
 * history candle to be misclassified between ~9:30 PM UTC and midnight UTC.
 */

export class SignalService {
  /**
   * Computes CPR-based PivotBoss and F&O price-action signals.
   */
  static getSignals(stock: MarketStockData, asOfDate?: string): SignalResult {
    const signals: string[] = [];
    const ltp = stock.ltp;

    // ── Candle Resolution ──────────────────────────────────────────────────────
    // Use IST-aware date to avoid UTC boundary misclassification.
    // NSE market closes at 3:30 PM IST; the UTC date flips at 6:30 PM IST,
    // so using new Date().toISOString() would misclassify candles for 3 hours daily.
    const todayStr = asOfDate ?? getISTDateString();

    let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
    let todayCandle = { high: stock.high, low: stock.low, close: stock.ltp };
    // These are null when distinct historical candles don't exist —
    // signals that depend on them are skipped rather than fabricated.
    let dayBeforeYesterdayCandle: { high: number; low: number; close: number } | null = null;
    let threeDaysAgoCandle: { high: number; low: number; close: number } | null = null;
    let fourDaysAgoCandle: { high: number; low: number; close: number } | null = null;

    if (stock.history && stock.history.length > 0) {
      const lastCandle = stock.history[stock.history.length - 1];
      const isLastToday = lastCandle.date === todayStr;
      
      const isTodayCandleFinal = asOfDate 
        ? isLastToday 
        : (isLastToday && isTodayCandleClosed());

      todayCandle = isTodayCandleFinal
        ? lastCandle
        : { high: stock.high, low: stock.low, close: stock.ltp };

      yesterdayCandle = isTodayCandleFinal
        ? (stock.history.length >= 2 ? stock.history[stock.history.length - 2] : lastCandle)
        : lastCandle;

      // Only assign when a genuinely distinct (older) candle exists.
      // Previously these fell back to yesterdayCandle, which could fabricate
      // fake ascending/descending CPR patterns on short history.
      dayBeforeYesterdayCandle = isTodayCandleFinal
        ? (stock.history.length >= 3 ? stock.history[stock.history.length - 3] : null)
        : (stock.history.length >= 2 ? stock.history[stock.history.length - 2] : null);

      threeDaysAgoCandle = isTodayCandleFinal
        ? (stock.history.length >= 4 ? stock.history[stock.history.length - 4] : null)
        : (stock.history.length >= 3 ? stock.history[stock.history.length - 3] : null);

      fourDaysAgoCandle = isTodayCandleFinal
        ? (stock.history.length >= 5 ? stock.history[stock.history.length - 5] : null)
        : (stock.history.length >= 4 ? stock.history[stock.history.length - 4] : null);
    }

    // ── ATR% ──────────────────────────────────────────────────────────────────
    const atr = calculateATR(stock.history || [], stock.close);
    const atrPct = stock.close > 0 ? atr / stock.close : DEFAULT_ATR_PCT;

    // ── CPR Calculations ─────────────────────────────────────────────────────
    // cprYesterday requires dayBeforeYesterdayCandle — skip dependent signals when null.
    const cprYesterday = dayBeforeYesterdayCandle
      ? calculateCPR(
          { high: dayBeforeYesterdayCandle.high, low: dayBeforeYesterdayCandle.low, close: dayBeforeYesterdayCandle.close },
          atrPct
        )
      : null;

    // Today's CPR is derived from yesterday's candle (standard CPR convention).
    const cprToday = calculateCPR(
      { high: yesterdayCandle.high, low: yesterdayCandle.low, close: yesterdayCandle.close },
      atrPct
    );

    // Tomorrow's CPR is derived from today's candle (used for value relationship).
    const cprTomorrow = calculateCPR(
      { high: todayCandle.high, low: todayCandle.low, close: todayCandle.close },
      atrPct
    );

    const tc = cprToday.tc;
    const bc = cprToday.bc;
    const pivot = cprToday.pivot;

    // volumeRatio = 1 when avgVolume is unavailable — intentionally neutral:
    // 1 < 1.5 so all volume-gated signals (BREAKOUT, BREAKDOWN, VOLUME_SPIKE,
    // BUILD_UP) are suppressed for new listings or data-incomplete symbols.
    const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1;

    // ── Value Relationships ───────────────────────────────────────────────────
    let insideValue = false;
    let higherValue = false;
    let lowerValue = false;
    let overlappingValue = false;

    insideValue = cprTomorrow.bc >= cprToday.bc && cprTomorrow.tc <= cprToday.tc;
    higherValue = cprTomorrow.bc > cprToday.bc && cprTomorrow.tc > cprToday.tc;
    lowerValue  = cprTomorrow.bc < cprToday.bc && cprTomorrow.tc < cprToday.tc;
    overlappingValue = !insideValue && !higherValue && !lowerValue &&
                       cprTomorrow.bc <= cprToday.tc && cprTomorrow.tc >= cprToday.bc;

    if (insideValue)     signals.push('INSIDE_VALUE');
    if (higherValue)     signals.push('HIGHER_VALUE');
    if (lowerValue)      signals.push('LOWER_VALUE');
    if (overlappingValue) signals.push('OVERLAPPING_VALUE');

    // ── Virgin CPR ───────────────────────────────────────────────────────────
    // Skip when cprYesterday is unavailable (insufficient history).
    const virginCPR = cprYesterday
      ? isCprVirgin(yesterdayCandle.high, yesterdayCandle.low, cprYesterday.tc, cprYesterday.bc)
      : false;
    if (virginCPR) signals.push('VIRGIN');

    // ── KGS Features ─────────────────────────────────────────────────────────
    // Ascending/Descending CPR: requires 3 distinct prior CPR periods (cprYesterday + threeDaysAgoCandle).
    if (cprYesterday && threeDaysAgoCandle) {
      const d1 = calculateCPR(
        { high: threeDaysAgoCandle.high, low: threeDaysAgoCandle.low, close: threeDaysAgoCandle.close },
        atrPct
      );
      const d2 = cprYesterday;
      const d3 = cprToday;

      // KGS Rule: For Ascending CPR, "PDL will not be broken; if broken and market closes below PDL, expect trend reversal"
      // Therefore, if today's close is below yesterday's low, the expected ASC trend is invalidated.
      if (d3.tc > d2.tc && d2.tc > d1.tc) {
        if (todayCandle.close >= yesterdayCandle.low) {
          signals.push('KGS_ASC_CPR');
        }
      }
      
      // Mirror rule: For Descending CPR, if today's close is above yesterday's high, the DESC trend is invalidated.
      if (d3.tc < d2.tc && d2.tc < d1.tc) {
        if (todayCandle.close <= yesterdayCandle.high) {
          signals.push('KGS_DESC_CPR');
        }
      }

      // Reversals: evaluate whether yesterday triggered a valid ASC/DESC setup, and today's action rejected it.
      if (fourDaysAgoCandle && dayBeforeYesterdayCandle) {
        const d0 = calculateCPR(
          { high: fourDaysAgoCandle.high, low: fourDaysAgoCandle.low, close: fourDaysAgoCandle.close },
          atrPct
        );

        // Yesterday's ASC CPR was valid: 3-day rising TC sequence leading up to yesterday, and yesterday's close respected its PDL.
        const yesterdayValidAsc = d2.tc > d1.tc && d1.tc > d0.tc && yesterdayCandle.close >= dayBeforeYesterdayCandle.low;
        // Today's rejection: close breaks below yesterday's low.
        if (yesterdayValidAsc && todayCandle.close < yesterdayCandle.low) {
          signals.push('KGS_ASC_REVERSAL');
        }

        // Yesterday's DESC CPR was valid: 3-day falling TC sequence leading up to yesterday, and yesterday's close respected its PDH.
        const yesterdayValidDesc = d2.tc < d1.tc && d1.tc < d0.tc && yesterdayCandle.close <= dayBeforeYesterdayCandle.high;
        // Today's rejection: close breaks above yesterday's high.
        if (yesterdayValidDesc && todayCandle.close > yesterdayCandle.high) {
          signals.push('KGS_DESC_REVERSAL');
        }
      }
    }

    // KGS Inside/Outside CPR: requires cprYesterday.
    if (cprYesterday) {
      if (cprToday.tc < cprYesterday.tc && cprToday.bc > cprYesterday.bc) {
        signals.push('KGS_INSIDE_CPR');
      }
      if (cprToday.tc > cprYesterday.tc && cprToday.bc < cprYesterday.bc) {
        signals.push('KGS_OUTSIDE_CPR');
      }
    }

    // KGS RTP (Running Trend Pattern)
    const hasRTP =
      stock.sma20Slope !== undefined && stock.sma50Slope !== undefined &&
      stock.sma20Slope !== 0 && stock.sma50Slope !== 0 &&
      Math.sign(stock.sma20Slope) === Math.sign(stock.sma50Slope);
    if (hasRTP) signals.push('KGS_RTP');

    // KGS High Probability RTP (HP-RTP)
    // 1. Guard: sma200 must be present
    if (stock.sma200 !== undefined && todayCandle && yesterdayCandle) {
      // 2. Precondition: RTP must be active
      if (hasRTP && stock.sma20Slope !== undefined) {
        const sma200 = stock.sma200; // Using today's cached sma200 as a stand-in for yesterday's 200 SMA level since it is extremely slow-moving

        // 3. Crossing Event & 4. Direction Match
        const isBullishCross = yesterdayCandle.close <= sma200 && todayCandle.close > sma200;
        const isBearishCross = yesterdayCandle.close >= sma200 && todayCandle.close < sma200;

        if (isBullishCross && stock.sma20Slope > 0) {
          signals.push('KGS_HP_RTP');
        } else if (isBearishCross && stock.sma20Slope < 0) {
          signals.push('KGS_HP_RTP');
        }
      }
    }

    // ── Hot Zone (Confluence Zone) ────────────────────────────────────────────
    // safeRatio returns 1 (far) when pivot is 0, preventing hotZone from firing on bad data.
    const closeDistance = safeRatio(Math.abs(stock.ltp - pivot), pivot, 1);
    // PROVISIONAL: threshold derived from assumed 2% avg ATR, pending backtest confirmation.
    const hotZoneThreshold = 0.10 * atrPct;
    const hotZone = cprToday.classification === 'NARROW' && closeDistance <= hotZoneThreshold;
    if (hotZone) signals.push('HOT_ZONE');

    // ── Money Zone Proxy (VAH, VAL, POC) ─────────────────────────────────────
    // Range-based proxy — not true Market Profile volume distribution.
    // See SignalResult.moneyZone JSDoc for caveats.
    const poc = pivot;
    const range = stock.high - stock.low;
    const vah = poc + range * 0.25;
    const val = poc - range * 0.25;

    // ── CPR Classification ────────────────────────────────────────────────────
    if (cprToday.classification === 'NARROW') signals.push('NARROW');
    else if (cprToday.classification === 'WIDE') signals.push('WIDE');
    else signals.push('NORMAL');

    // ── Directional ───────────────────────────────────────────────────────────
    if (ltp > tc)      signals.push('BULLISH');
    else if (ltp < bc) signals.push('BEARISH');
    else               signals.push('INSIDE');

    // ── Gap ───────────────────────────────────────────────────────────────────
    if (stock.open > yesterdayCandle.high)      signals.push('GAP_UP');
    else if (stock.open < yesterdayCandle.low)  signals.push('GAP_DOWN');

    // ── Volume Spike ──────────────────────────────────────────────────────────
    if (volumeRatio >= 2.0) signals.push('VOLUME_SPIKE');

    // ── Breakout / Breakdown ──────────────────────────────────────────────────
    if (volumeRatio >= 1.5 && ltp > tc) signals.push('BREAKOUT');
    if (volumeRatio >= 1.5 && ltp < bc) signals.push('BREAKDOWN');

    // ── Momentum ──────────────────────────────────────────────────────────────
    if (ltp > cprToday.r1 || ltp < cprToday.s1) signals.push('MOMENTUM');

    // ── F&O Build-up Proxies ──────────────────────────────────────────────────
    // safeRatio returns 0 when close is 0, preventing Infinity/NaN from
    // propagating into build/unwind threshold comparisons.
    const priceChangePct = safeRatio(ltp - stock.close, stock.close, 0);
    // PROVISIONAL: thresholds derived from assumed 2% avg ATR, pending backtest confirmation.
    const buildThreshold  = 0.75 * atrPct;
    const unwindThreshold = 0.50 * atrPct;

    if (priceChangePct > buildThreshold && volumeRatio >= 1.5)        signals.push('LONG_BUILD');
    else if (priceChangePct < -buildThreshold && volumeRatio >= 1.5)  signals.push('SHORT_BUILD');
    else if (priceChangePct < -unwindThreshold && volumeRatio < 1.0)  signals.push('LONG_UNWIND');
    else if (priceChangePct > unwindThreshold && volumeRatio < 1.0)   signals.push('SHORT_COVER');

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
