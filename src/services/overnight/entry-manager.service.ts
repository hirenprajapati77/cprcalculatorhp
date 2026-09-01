import { getAtrPct } from '@/lib/atr';
import { getCompletedHistory, getISTDateString } from '@/lib/market-hours';
import { VOLUME_THRESHOLDS } from '@/config/trading-constants';
import { MarketStockData } from '../market.service';
import { evaluateBtstScannerConflict } from '@/lib/cpr-breakout-conflict';

export interface ExclusionCheckResult {
  eligible: boolean;
  reason?: string | null;
}

/**
 * Hard caps for overnight extension / exhaustion.
 * DIXON-style +ATR blow-off days score well on HV/VDU/close strength but mean-revert next open —
 * that is the EXECUTION_SLIPPAGE cohort in the journal.
 */
export const EXTENSION_LIMITS = {
  /** Absolute day-return cap (%). Above this → reject BTST (LONG). */
  MAX_DAY_RETURN_PCT: 3.5,
  /** Absolute day-return cap (%) for STBT (SHORT) on large down days. */
  MAX_DAY_DROP_PCT: 3.5,
  /** Day range (H-L)/close as multiple of ATR%. */
  MAX_RANGE_ATR_MULT: 2.25,
  /** Day return as multiple of ATR%. */
  MAX_RETURN_ATR_MULT: 1.75,
};

export class EntryManagerService {
  /**
   * Validates if a stock is eligible for a BTST signal based on the universe filters and reject rules.
   */
  static evaluateEligibility(
    stock: MarketStockData,
    vwap: number | null | undefined,
    intradayVolume: number | null | undefined,
    hasIntraday: boolean
  ): ExclusionCheckResult {
    if (!hasIntraday) {
      return { eligible: false, reason: 'No intraday data' };
    }

    if (!stock || !stock.high || !stock.low) {
      console.log(`[EligibilityGate] ${stock?.symbol || 'UNKNOWN'} rejected: Insufficient market data`);
      return { eligible: false, reason: 'Insufficient market data' };
    }

    const volume = stock.volume || 0;
    const avgVolume = stock.avgVolume || 0;
    const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

    if (avgVolume < 100000) {
      console.log(`[EligibilityGate] ${stock.symbol} rejected: avgVolume ${avgVolume} < 100000`);
      return { eligible: false, reason: `avgVolume ${avgVolume} < 100000` };
    }

    if (volume < 100000) {
      console.log(`[EligibilityGate] ${stock.symbol} rejected: volume ${volume} < 100000`);
      return { eligible: false, reason: `volume ${volume} < 100000` };
    }

    if (volumeRatio < VOLUME_THRESHOLDS.BREAKOUT_RATIO) {
      console.log(`[EligibilityGate] ${stock.symbol} rejected: volumeRatio ${volumeRatio.toFixed(2)} < ${VOLUME_THRESHOLDS.BREAKOUT_RATIO} (VDU hard gate)`);
      return { eligible: false, reason: `volumeRatio ${volumeRatio.toFixed(2)} < ${VOLUME_THRESHOLDS.BREAKOUT_RATIO}` };
    }

    const intraVol = intradayVolume || 0;
    if (intraVol < 5000) {
      console.log(`[EligibilityGate] ${stock.symbol} rejected: intradayVolume ${intraVol} < 5000`);
      return { eligible: false, reason: `intradayVolume ${intraVol} < 5000` };
    }

    return { eligible: true, reason: null };
  }

  /**
   * Resolve prior session close for day-return / extension checks.
   * Prefer MarketStockData.previousClose; fall back to history with today-bar awareness
   * (do not use n-2 when the last bar is already the prior completed session).
   */
  static resolvePreviousClose(stock: MarketStockData, asOfDate?: string): number | null {
    const todayStr = getISTDateString();
    // Only prefer stock.previousClose if asOfDate is not provided or matches today's live session date
    if ((!asOfDate || asOfDate === todayStr) && stock.previousClose && stock.previousClose > 0) {
      return stock.previousClose;
    }
    const hist = stock.history || [];
    if (hist.length === 0) return stock.previousClose && stock.previousClose > 0 ? stock.previousClose : null;

    const targetDate = asOfDate || todayStr;
    const targetIdx = hist.findIndex((h) => h.date === targetDate);
    if (targetIdx > 0) {
      return hist[targetIdx - 1].close > 0 ? hist[targetIdx - 1].close : null;
    }

    const last = hist[hist.length - 1];
    if (last.date === targetDate) {
      return hist.length >= 2 ? hist[hist.length - 2].close : null;
    }
    // Last bar is a completed prior session (today not appended) — that close is
    // the correct reference for live LTP day-return.
    return last.close > 0 ? last.close : null;
  }

  /**
   * Directional extension / exhaustion gate.
   * Rejects BTST after vertical up days and STBT after vertical down days.
   *
   * @param override Optional caller-specific caps for the flat day-return
   *   checks (MAX_DAY_RETURN_PCT / MAX_DAY_DROP_PCT only — the ATR-multiple
   *   checks below remain shared with the default BTST/overnight limits).
   *   Omit to use the shared EXTENSION_LIMITS everywhere as before.
   */
  static evaluateExtension(
    stock: MarketStockData,
    direction: 'LONG' | 'SHORT',
    asOfDate?: string,
    override?: { maxDayReturnPct?: number; maxDayDropPct?: number }
  ): ExclusionCheckResult {
    const close = stock.ltp || stock.close || 0;
    if (!close || close <= 0 || !stock.high || !stock.low) {
      return { eligible: false, reason: 'Insufficient OHLC for extension check' };
    }

    const prevClose = EntryManagerService.resolvePreviousClose(stock, asOfDate);

    if (!prevClose || prevClose <= 0) {
      return { eligible: true, reason: null }; // cannot evaluate — do not hard-block
    }

    const dayReturnPct = ((close - prevClose) / prevClose) * 100;
    const dayRangePct = ((stock.high - stock.low) / close) * 100;
    const maxDayReturnPct = override?.maxDayReturnPct ?? EXTENSION_LIMITS.MAX_DAY_RETURN_PCT;
    const maxDayDropPct = override?.maxDayDropPct ?? EXTENSION_LIMITS.MAX_DAY_DROP_PCT;

    const completed = getCompletedHistory(stock.history || []);
    const atrPctFrac = getAtrPct(completed.length ? completed : [{ high: stock.high, low: stock.low, close }], close);
    const atrPct = atrPctFrac * 100;

    if (direction === 'LONG') {
      if (dayReturnPct >= maxDayReturnPct) {
        const reason = `EXTENDED_UP dayReturn=${dayReturnPct.toFixed(2)}% >= ${maxDayReturnPct}%`;
        console.log(`[ExtensionGate] ${stock.symbol} LONG rejected: ${reason}`);
        return { eligible: false, reason };
      }
      if (atrPct > 0 && dayReturnPct >= atrPct * EXTENSION_LIMITS.MAX_RETURN_ATR_MULT) {
        const reason = `EXTENDED_UP dayReturn=${dayReturnPct.toFixed(2)}% >= ${EXTENSION_LIMITS.MAX_RETURN_ATR_MULT}×ATR(${atrPct.toFixed(2)}%)`;
        console.log(`[ExtensionGate] ${stock.symbol} LONG rejected: ${reason}`);
        return { eligible: false, reason };
      }
      if (atrPct > 0 && dayRangePct >= atrPct * EXTENSION_LIMITS.MAX_RANGE_ATR_MULT) {
        const reason = `EXTENDED_RANGE dayRange=${dayRangePct.toFixed(2)}% >= ${EXTENSION_LIMITS.MAX_RANGE_ATR_MULT}×ATR(${atrPct.toFixed(2)}%)`;
        console.log(`[ExtensionGate] ${stock.symbol} LONG rejected: ${reason}`);
        return { eligible: false, reason };
      }
    }

    if (direction === 'SHORT') {
      if (dayReturnPct <= -maxDayDropPct) {
        const reason = `EXTENDED_DOWN dayReturn=${dayReturnPct.toFixed(2)}% <= -${maxDayDropPct}%`;
        console.log(`[ExtensionGate] ${stock.symbol} SHORT rejected: ${reason}`);
        return { eligible: false, reason };
      }
      if (atrPct > 0 && dayReturnPct <= -(atrPct * EXTENSION_LIMITS.MAX_RETURN_ATR_MULT)) {
        const reason = `EXTENDED_DOWN dayReturn=${dayReturnPct.toFixed(2)}% <= -${EXTENSION_LIMITS.MAX_RETURN_ATR_MULT}×ATR(${atrPct.toFixed(2)}%)`;
        console.log(`[ExtensionGate] ${stock.symbol} SHORT rejected: ${reason}`);
        return { eligible: false, reason };
      }
      if (atrPct > 0 && dayRangePct >= atrPct * EXTENSION_LIMITS.MAX_RANGE_ATR_MULT) {
        const reason = `EXTENDED_RANGE dayRange=${dayRangePct.toFixed(2)}% >= ${EXTENSION_LIMITS.MAX_RANGE_ATR_MULT}×ATR(${atrPct.toFixed(2)}%)`;
        console.log(`[ExtensionGate] ${stock.symbol} SHORT rejected: ${reason}`);
        return { eligible: false, reason };
      }
    }

    return { eligible: true, reason: null };
  }

  /**
   * Cross-engine breakout conflict gate.
   * Suppresses BTST LONG on confirmed intraday BREAKDOWN, and STBT SHORT on confirmed BREAKOUT.
   */
  static evaluateBreakoutConflict(
    stock: MarketStockData,
    direction: 'LONG' | 'SHORT',
    scannerSignals?: string[] | null
  ): ExclusionCheckResult {
    const conflict = evaluateBtstScannerConflict(direction, scannerSignals);
    if (conflict.conflicted) {
      console.log(`[BreakoutConflictGate] ${stock.symbol} ${direction} rejected: ${conflict.reason} (${conflict.detail})`);
      return { eligible: false, reason: conflict.reason ?? null };
    }
    return { eligible: true, reason: null };
  }
}

