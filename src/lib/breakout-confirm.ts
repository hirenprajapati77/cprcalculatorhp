import { VOLUME_THRESHOLDS, BREAKOUT_CONFIRMATION } from '@/config/trading-constants';

/**
 * Breakout / breakdown confirmation beyond a raw LTP tick across TC/BC.
 *
 * Priority:
 *  1. Last 15m candle hold (close beyond level) — preferred when 15m exists (Fyers/Yahoo)
 *  2. Session reclaim + RECLAIM_HOLD_MINUTES (traded through level, still holding)
 *  3. Gap continuation + HOLD_MINUTES (never tagged the level)
 *
 * Live scans pass holdMinutes from DirectionSetupState age. Historical asOfDate
 * scans should pass holdMinutes >= HOLD_MINUTES so end-of-day structure confirms.
 */

export const BREAKOUT_CONFIRM = BREAKOUT_CONFIRMATION;

export type BreakoutDirection = 'UP' | 'DOWN';

export interface BreakoutConfirmInput {
  direction: BreakoutDirection;
  ltp: number;
  /** TC for UP, BC for DOWN. */
  level: number;
  open: number;
  high: number;
  low: number;
  candle15m?: { open: number; high: number; low: number; close: number } | null;
  /** Minutes since LTP first crossed into this directional state (optional). */
  holdMinutes?: number | null;
  /**
   * When false, only 15m close can confirm (used by SignalService first pass).
   * ScannerService uses true after setup age is known.
   */
  allowSessionReclaim?: boolean;
}

/** Volume + LTP cross candidate (unconfirmed). */
export function getBreakoutCandidate(
  volumeRatio: number,
  ltp: number,
  tc: number,
  bc: number
): BreakoutDirection | null {
  if (volumeRatio < VOLUME_THRESHOLDS.BREAKOUT_RATIO) return null;
  if (ltp > tc) return 'UP';
  if (ltp < bc) return 'DOWN';
  return null;
}

/**
 * True when the candidate breakout is confirmed (hold / reclaim / 15m close).
 *
 * A 15m close beyond the level confirms immediately. A 15m close still inside
 * the CPR band does NOT hard-reject: we fall through to session-reclaim / gap-
 * continuation so a valid 5m hold is not killed by a stale previous 15m bar.
 * SignalService first pass sets allowSessionReclaim=false, so that path still
 * requires a 15m close beyond the level.
 */
export function isBreakoutConfirmed(input: BreakoutConfirmInput): boolean {
  const {
    direction,
    ltp,
    level,
    open,
    high,
    low,
    candle15m,
    holdMinutes,
    allowSessionReclaim = true,
  } = input;
  if (!Number.isFinite(level) || level <= 0) return false;

  const held = holdMinutes ?? 0;

  if (direction === 'UP') {
    if (!(ltp > level)) return false;

    // 15m candle can CONFIRM early (close above level) but must NOT hard-reject.
    // If the last formed 15m close is below level we still fall through to the
    // session-hold checks — a valid 5-min reclaim should not be killed by a
    // stale 15m close from the previous bar.
    if (candle15m && Number.isFinite(candle15m.close) && candle15m.close > 0) {
      if (candle15m.close > level) return true;
      // fall through — let session reclaim decide
    }

    if (!allowSessionReclaim) return false;

    // Session reclaim: traded at/below TC, now holding above for RECLAIM_HOLD
    if (
      low <= level &&
      ltp > level &&
      held >= BREAKOUT_CONFIRM.RECLAIM_HOLD_MINUTES
    ) {
      return true;
    }

    // Gap continuation above TC — longer hold
    if (open > level && held >= BREAKOUT_CONFIRM.HOLD_MINUTES) {
      return true;
    }

    return false;
  }

  // DOWN / breakdown
  if (!(ltp < level)) return false;

  // Same logic as UP: 15m close below level confirms early, but a close above
  // level must not kill a valid session reclaim — fall through instead.
  if (candle15m && Number.isFinite(candle15m.close) && candle15m.close > 0) {
    if (candle15m.close < level) return true;
    // fall through — let session reclaim decide
  }

  if (!allowSessionReclaim) return false;

  if (
    high >= level &&
    ltp < level &&
    held >= BREAKOUT_CONFIRM.RECLAIM_HOLD_MINUTES
  ) {
    return true;
  }

  if (open < level && held >= BREAKOUT_CONFIRM.HOLD_MINUTES) {
    return true;
  }

  return false;
}

/** Apply confirmed BREAKOUT / BREAKDOWN tags onto a signals array (mutates). */
export function applyBreakoutSignals(
  signals: string[],
  volumeRatio: number,
  ltp: number,
  tc: number,
  bc: number,
  session: {
    open: number;
    high: number;
    low: number;
    candle15m?: BreakoutConfirmInput['candle15m'];
    holdMinutes?: number | null;
    allowSessionReclaim?: boolean;
  }
): void {
  const candidate = getBreakoutCandidate(volumeRatio, ltp, tc, bc);
  if (!candidate) return;

  const confirmInput: BreakoutConfirmInput = {
    direction: candidate,
    ltp,
    level: candidate === 'UP' ? tc : bc,
    open: session.open,
    high: session.high,
    low: session.low,
  };
  if (session.candle15m !== undefined) confirmInput.candle15m = session.candle15m;
  if (session.holdMinutes !== undefined) confirmInput.holdMinutes = session.holdMinutes;
  if (session.allowSessionReclaim !== undefined) {
    confirmInput.allowSessionReclaim = session.allowSessionReclaim;
  }

  const confirmed = isBreakoutConfirmed(confirmInput);

  if (!confirmed) return;

  if (candidate === 'UP' && !signals.includes('BREAKOUT')) {
    signals.push('BREAKOUT');
  } else if (candidate === 'DOWN' && !signals.includes('BREAKDOWN')) {
    signals.push('BREAKDOWN');
  }
}
