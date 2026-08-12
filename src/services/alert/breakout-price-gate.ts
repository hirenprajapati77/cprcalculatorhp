import { EXTENSION_LIMITS, EntryManagerService } from '@/services/overnight/entry-manager.service';
import type { BreakoutScanResult, BreakoutAlertKind } from '@/services/alert/breakout-watcher.service';
import type { MarketStockData } from '@/services/market.service';

/** Buffer so tick noise at the day extreme does not false-trigger gap invalidation. */
export const BREAKOUT_GAP_BUFFER = 0.002;

export type BreakoutPriceGateReason = 'GAP_INVALIDATED' | 'EXTENDED';

export type BreakoutPriceGateResult = {
  actionable: BreakoutScanResult[];
  suppressed: Array<BreakoutScanResult & { gateReason: BreakoutPriceGateReason; gateDetail: string }>;
};

function alertDirection(b: BreakoutScanResult): 'LONG' | 'SHORT' {
  const kind: BreakoutAlertKind =
    b.alertKind ??
    (b.signals?.includes('BREAKDOWN') && !b.signals?.includes('BREAKOUT')
      ? 'BREAKDOWN'
      : 'BREAKOUT');
  return kind === 'BREAKDOWN' ? 'SHORT' : 'LONG';
}

/**
 * Entry unreachable given today's observed range (gapped away from CPR entry).
 * True when entry sits outside [todayLow×(1−buffer), todayHigh×(1+buffer)] —
 * covers GODREJCP-style SHORT entries above the day high and the symmetric
 * LONG case below the day low (and the inverse gap directions).
 */
export function isBreakoutEntryGapInvalidated(args: {
  entry: number;
  todayHigh: number;
  todayLow: number;
  direction: 'LONG' | 'SHORT';
  buffer?: number;
}): boolean {
  const { entry, todayHigh, todayLow } = args;
  const buffer = args.buffer ?? BREAKOUT_GAP_BUFFER;
  if (!(entry > 0 && todayHigh > 0 && todayLow > 0)) return false;
  return entry > todayHigh * (1 + buffer) || entry < todayLow * (1 - buffer);
}

/**
 * LTP already chased past entry by more than BTST's extension day-return cap (3.5%).
 * Reuses EXTENSION_LIMITS — does not invent a new threshold.
 */
export function isBreakoutEntryExtended(args: {
  entry: number;
  ltp: number;
  direction: 'LONG' | 'SHORT';
}): boolean {
  const { entry, ltp, direction } = args;
  if (!(entry > 0 && ltp > 0)) return false;
  const pctPastEntry = ((ltp - entry) / entry) * 100;
  if (direction === 'LONG') {
    return pctPastEntry >= EXTENSION_LIMITS.MAX_DAY_RETURN_PCT;
  }
  return pctPastEntry <= -EXTENSION_LIMITS.MAX_DAY_DROP_PCT;
}

/**
 * Pre-send gate for CPR breakout/breakdown Telegram alerts.
 * Suppresses (does not send) gap-invalidated and extended/chase setups —
 * same hard-reject posture as EntryManagerService for BTST. Flagging still
 * publishes stale RR into the group and trains traders to ignore alerts.
 */
export function filterBreakoutsForPriceActionability(
  breakouts: BreakoutScanResult[]
): BreakoutPriceGateResult {
  const actionable: BreakoutScanResult[] = [];
  const suppressed: BreakoutPriceGateResult['suppressed'] = [];

  for (const b of breakouts) {
    const direction = alertDirection(b);
    const todayHigh = b.high ?? 0;
    const todayLow = b.low ?? 0;

    if (
      isBreakoutEntryGapInvalidated({
        entry: b.entry,
        todayHigh,
        todayLow,
        direction,
      })
    ) {
      const detail = `entry ${b.entry} outside today range [${todayLow}, ${todayHigh}]`;
      console.warn(`[BreakoutPriceGate] ${b.symbol} GAP_INVALIDATED — ${detail}; suppressing alert`);
      suppressed.push({ ...b, gateReason: 'GAP_INVALIDATED', gateDetail: detail });
      continue;
    }

    // Prefer full BTST extension gate when OHLC + previousClose are present.
    if (todayHigh > 0 && todayLow > 0 && (b.previousClose ?? 0) > 0) {
      const stock: MarketStockData = {
        symbol: b.symbol,
        market: 'NSE',
        sector: b.sector,
        open: b.open ?? b.ltp,
        high: todayHigh,
        low: todayLow,
        close: b.ltp,
        ltp: b.ltp,
        volume: 0,
        avgVolume: 0,
        marketCap: 0,
        history: [],
        ...(b.previousClose != null ? { previousClose: b.previousClose } : {}),
      };
      const ext = EntryManagerService.evaluateExtension(stock, direction);
      if (!ext.eligible) {
        const detail = ext.reason ?? 'EXTENDED';
        console.warn(`[BreakoutPriceGate] ${b.symbol} EXTENDED — ${detail}; suppressing alert`);
        suppressed.push({ ...b, gateReason: 'EXTENDED', gateDetail: detail });
        continue;
      }
    }

    if (isBreakoutEntryExtended({ entry: b.entry, ltp: b.ltp, direction })) {
      const pct = (((b.ltp - b.entry) / b.entry) * 100).toFixed(2);
      const detail = `ltp ${b.ltp} is ${pct}% from entry ${b.entry} (limit ±${EXTENSION_LIMITS.MAX_DAY_RETURN_PCT}%)`;
      console.warn(`[BreakoutPriceGate] ${b.symbol} EXTENDED — ${detail}; suppressing alert`);
      suppressed.push({ ...b, gateReason: 'EXTENDED', gateDetail: detail });
      continue;
    }

    actionable.push(b);
  }

  return { actionable, suppressed };
}
