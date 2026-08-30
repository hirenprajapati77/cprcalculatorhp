/**
 * Pure gap / entry-chase checks shared by Telegram gate, CPR journal, and scanner UI.
 * Keep this module free of Node/Prisma/MarketService so client components can import it.
 */

/** Absolute day-return / chase cap (%) for CPR/Telegram breakout alerts.
 *  Deliberately tighter than the shared BTST EXTENSION_LIMITS.MAX_DAY_RETURN_PCT
 *  (3.5%) -- verified live that a 2.66% gap between alert-delivery-time LTP and
 *  the CPR entry level still produced an unfillable "stale" alert (AMBER,
 *  27 Aug 2026). Tightened from 3.5 -> 1.5. Revisit after a week of live
 *  observation if this suppresses too many legitimate signals. */
export const CPR_ENTRY_EXTENSION_PCT = 1.5;

/** Buffer so tick noise at the day extreme does not false-trigger gap invalidation. */
export const BREAKOUT_GAP_BUFFER = 0.002;

/**
 * ATR-scaled chase cap in percent. `atrPct` is percent (2.5 = 2.5%), bounded
 * 1-3 (tightened from 2-6 alongside CPR_ENTRY_EXTENSION_PCT -- see above).
 */
export function atrScaledExtensionCap(atrPct?: number): number {
  if (!(atrPct && Number.isFinite(atrPct) && atrPct > 0)) return CPR_ENTRY_EXTENSION_PCT;
  return Math.min(3.0, Math.max(1.0, atrPct * 1.5));
}

export type CprSetupStaleReason = 'GAP_INVALIDATED' | 'EXTENDED' | 'AGAINST_PRIOR_CLOSE';

/**
 * LONG breakout while still red vs prior close, or SHORT breakdown while still green.
 * Tick-through-CPR on the wrong side of the day is a failed-breakout / bull-trap pattern
 * (LICI 13 Aug 2026: LTP 415.35 vs prev close 417).
 */
export function isBreakoutAgainstPriorClose(args: {
  ltp: number;
  previousClose: number;
  direction: 'LONG' | 'SHORT';
}): boolean {
  const { ltp, previousClose, direction } = args;
  if (!(ltp > 0 && previousClose > 0)) return false;
  if (direction === 'LONG') return ltp < previousClose;
  return ltp > previousClose;
}

/**
 * Entry unreachable given today's observed range (gapped away from CPR entry).
 * True when entry sits outside [todayLow×(1−buffer), todayHigh×(1+buffer)].
 */
export function isBreakoutEntryGapInvalidated(args: {
  entry: number;
  todayHigh: number;
  todayLow: number;
  direction: 'LONG' | 'SHORT';
  buffer?: number;
}): boolean {
  const { entry, todayHigh, todayLow, direction } = args;
  const buffer = args.buffer ?? BREAKOUT_GAP_BUFFER;
  if (!(entry > 0 && todayHigh > 0 && todayLow > 0)) return false;

  if (direction === 'LONG') {
    return todayLow > entry * (1 + buffer);
  } else {
    return todayHigh < entry * (1 - buffer);
  }
}

/**
 * LTP already chased past entry by more than the extension cap
 * (default CPR_ENTRY_EXTENSION_PCT, 1.5%, or ATR-scaled if atrPct provided).
 */
export function isBreakoutEntryExtended(args: {
  entry: number;
  ltp: number;
  direction: 'LONG' | 'SHORT';
  maxExtensionPct?: number | undefined;
  atrPct?: number | undefined;
}): boolean {
  const { entry, ltp, direction, atrPct } = args;
  const dynamicCap = atrScaledExtensionCap(atrPct);
  const cap = args.maxExtensionPct ?? dynamicCap;
  if (!(entry > 0 && ltp > 0)) return false;
  const pctPastEntry = ((ltp - entry) / entry) * 100;
  if (direction === 'LONG') {
    return pctPastEntry >= cap;
  }
  return pctPastEntry <= -cap;
}

/**
 * Client-safe staleness check (gap, against prior close, entry chase).
 * Server Telegram/journal also run EntryManager ATR extension when prevClose is available.
 */
export function evaluateCprSetupPriceStalenessBasic(args: {
  entry: number;
  ltp: number;
  direction: 'LONG' | 'SHORT';
  todayHigh?: number | undefined;
  todayLow?: number | undefined;
  previousClose?: number | undefined;
  maxExtensionPct?: number | undefined;
  atrPct?: number | undefined;
}): { stale: true; reason: CprSetupStaleReason; detail: string } | { stale: false } {
  const {
    entry,
    ltp,
    direction,
    todayHigh = 0,
    todayLow = 0,
    previousClose,
    maxExtensionPct,
    atrPct,
  } = args;

  if (
    todayHigh > 0 &&
    todayLow > 0 &&
    isBreakoutEntryGapInvalidated({ entry, todayHigh, todayLow, direction })
  ) {
    return {
      stale: true,
      reason: 'GAP_INVALIDATED',
      detail: `entry ${entry} outside today range [${todayLow}, ${todayHigh}]`,
    };
  }

  if (
    previousClose != null &&
    previousClose > 0 &&
    isBreakoutAgainstPriorClose({ ltp, previousClose, direction })
  ) {
    const side = direction === 'LONG' ? 'below' : 'above';
    return {
      stale: true,
      reason: 'AGAINST_PRIOR_CLOSE',
      detail: `ltp ${ltp} is ${side} prior close ${previousClose} (${direction})`,
    };
  }

  if (isBreakoutEntryExtended({ entry, ltp, direction, maxExtensionPct, atrPct })) {
    const pct = (((ltp - entry) / entry) * 100).toFixed(2);
    const cap = maxExtensionPct ?? atrScaledExtensionCap(atrPct);
    return {
      stale: true,
      reason: 'EXTENDED',
      detail: `ltp ${ltp} is ${pct}% from entry ${entry} (limit ±${cap.toFixed(1)}%)`,
    };
  }

  return { stale: false };
}
