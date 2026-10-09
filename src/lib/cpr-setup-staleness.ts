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
export const CPR_ENTRY_EXTENSION_PCT = 2.5;

/** Buffer so tick noise at the day extreme does not false-trigger gap invalidation. */
export const BREAKOUT_GAP_BUFFER = 0.002;

/**
 * ATR-scaled chase cap in percent. `atrPct` is percent (2.5 = 2.5%), bounded
 * 1-3.5 (aligned with CPR_ENTRY_EXTENSION_PCT = 2.5% to allow normal F&O momentum).
 */
export function atrScaledExtensionCap(atrPct?: number): number {
  if (!(atrPct && Number.isFinite(atrPct) && atrPct > 0)) return CPR_ENTRY_EXTENSION_PCT;
  return Math.min(3.5, Math.max(1.0, atrPct * 1.5));
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

export type SetupTradeabilityStatus =
  | 'READY'
  | 'EXTENDED'
  | 'GAP'
  | 'VS CLOSE'
  | 'TARGET MET'
  | 'DO NOT TRADE';

export interface SetupTradeabilityResult {
  status: SetupTradeabilityStatus;
  isExecutable: boolean;
  modelRr: string;
  executableRr: string;
  detail?: string;
}

/**
 * Pure evaluation of CPR Trade Setup executable tradeability.
 * Bridges theoretical Model R:R (from pivot entry) with real-time actionable status.
 *
 * When price has chased past the extension cap (default 1.5%), the theoretical Model R:R
 * is NOT currently executable without taking uncalibrated chase risk.
 */
export function evaluateSetupTradeability(args: {
  entry: number;
  ltp: number;
  target?: number | undefined;
  direction: 'LONG' | 'SHORT';
  modelRr: string;
  todayHigh?: number | undefined;
  todayLow?: number | undefined;
  previousClose?: number | undefined;
  maxExtensionPct?: number | undefined;
  atrPct?: number | undefined;
  isBreakoutOrBreakdown?: boolean | undefined;
  alertSuppressedReason?: string | null | undefined;
  alertSuppressedDetail?: string | null | undefined;
}): SetupTradeabilityResult {
  const {
    entry,
    ltp,
    target = 0,
    direction,
    modelRr,
    todayHigh,
    todayLow,
    previousClose,
    maxExtensionPct,
    atrPct,
    isBreakoutOrBreakdown = true,
    alertSuppressedReason,
    alertSuppressedDetail,
  } = args;

  if (alertSuppressedReason) {
    return {
      status: 'DO NOT TRADE',
      isExecutable: false,
      modelRr,
      executableRr: '—',
      detail: alertSuppressedDetail ?? alertSuppressedReason,
    };
  }

  const isTargetAchieved =
    target > 0 &&
    ((direction === 'LONG' && ltp >= target) ||
     (direction === 'SHORT' && ltp <= target));

  if (isTargetAchieved) {
    return {
      status: 'TARGET MET',
      isExecutable: false,
      modelRr,
      executableRr: '—',
      detail: `Target achieved (LTP ${ltp} reached target ${target})`,
    };
  }

  if (isBreakoutOrBreakdown) {
    const staleResult = evaluateCprSetupPriceStalenessBasic({
      entry,
      ltp,
      direction,
      todayHigh,
      todayLow,
      previousClose,
      maxExtensionPct,
      atrPct,
    });

    if (staleResult.stale) {
      const status: SetupTradeabilityStatus =
        staleResult.reason === 'EXTENDED'
          ? 'EXTENDED'
          : staleResult.reason === 'GAP_INVALIDATED'
            ? 'GAP'
            : 'VS CLOSE';

      return {
        status,
        isExecutable: false,
        modelRr,
        executableRr: '—',
        detail: staleResult.detail,
      };
    }
  }

  const executableRr = modelRr && modelRr !== '1:1.0' ? modelRr : '—';
  return {
    status: 'READY',
    isExecutable: true,
    modelRr,
    executableRr,
  };
}

export interface ActionableScannerTopCandidate {
  alertSuppressedReason?: string | null | undefined;
  alertSuppressedDetail?: string | null | undefined;
  signalSummary?: string | null | undefined;
  entry?: number | null | undefined;
  ltp?: number | null | undefined;
  target?: number | null | undefined;
  sl?: number | null | undefined;
  direction?: 'LONG' | 'SHORT' | null | undefined;
  signals?: string[] | null | undefined;
}

/**
 * Filter out setups that are non-actionable / dead from Top Algo Setups ranking.
 * Excludes:
 * 1. Any persisted alert suppression (e.g. GAP_INVALIDATED, EXTENDED, AGAINST_PRIOR_CLOSE, etc.)
 * 2. Dead / stale setups (e.g. STALE_SETUP in signalSummary or signals list)
 * 3. Setups that have already achieved their target (move is completed)
 */
export function isActionableScannerTopResult(row: ActionableScannerTopCandidate): boolean {
  // 1. Any persisted alert suppression (GAP_INVALIDATED, EXTENDED, AGAINST_PRIOR_CLOSE, etc.)
  if (row.alertSuppressedReason && row.alertSuppressedReason.trim().length > 0) {
    return false;
  }

  // 2. Dead / stale setups where move is already over or past freshness window
  if (row.signalSummary && row.signalSummary.includes('STALE_SETUP')) {
    return false;
  }
  if (row.signals && row.signals.includes('STALE_SETUP')) {
    return false;
  }

  // 3. Target already achieved (no longer actionable)
  const entry = row.entry ?? 0;
  const ltp = row.ltp ?? 0;
  const target = row.target ?? 0;
  if (entry > 0 && target > 0 && ltp > 0) {
    const direction = row.direction ?? (target >= entry ? 'LONG' : 'SHORT');
    if (direction === 'LONG' && ltp >= target) {
      return false;
    }
    if (direction === 'SHORT' && ltp <= target) {
      return false;
    }
  }

  return true;
}

