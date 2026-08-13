/**
 * Pure gap / entry-chase checks shared by Telegram gate, CPR journal, and scanner UI.
 * Keep this module free of Node/Prisma/MarketService so client components can import it.
 */

/** Absolute day-return / chase cap (%). Matches EntryManager EXTENSION_LIMITS. */
export const CPR_ENTRY_EXTENSION_PCT = 3.5;

/** Buffer so tick noise at the day extreme does not false-trigger gap invalidation. */
export const BREAKOUT_GAP_BUFFER = 0.002;

/**
 * ATR-scaled chase cap in percent. `atrPct` is percent (2.5 = 2.5%), bounded 2–6.
 */
export function atrScaledExtensionCap(atrPct?: number): number {
  if (!(atrPct && Number.isFinite(atrPct) && atrPct > 0)) return CPR_ENTRY_EXTENSION_PCT;
  return Math.min(6.0, Math.max(2.0, atrPct * 1.5));
}

export type CprSetupStaleReason = 'GAP_INVALIDATED' | 'EXTENDED';

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
 * LTP already chased past entry by more than the extension cap (default 3.5%, or ATR-scaled if atrPct provided).
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
 * Client-safe staleness check (gap when H/L present + entry chase).
 * Server Telegram/journal also run EntryManager ATR extension when prevClose is available.
 */
export function evaluateCprSetupPriceStalenessBasic(args: {
  entry: number;
  ltp: number;
  direction: 'LONG' | 'SHORT';
  todayHigh?: number | undefined;
  todayLow?: number | undefined;
  maxExtensionPct?: number | undefined;
  atrPct?: number | undefined;
}): { stale: true; reason: CprSetupStaleReason; detail: string } | { stale: false } {
  const { entry, ltp, direction, todayHigh = 0, todayLow = 0, maxExtensionPct, atrPct } = args;

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
