import { EXTENSION_LIMITS, EntryManagerService } from '@/services/overnight/entry-manager.service';
import type { BreakoutScanResult, BreakoutAlertKind } from '@/services/alert/breakout-watcher.service';
import type { MarketStockData } from '@/services/market.service';
import {
  BREAKOUT_GAP_BUFFER,
  evaluateCprSetupPriceStalenessBasic,
  isBreakoutEntryExtended,
  isBreakoutEntryGapInvalidated,
  type CprSetupStaleReason,
} from '@/lib/cpr-setup-staleness';

export {
  BREAKOUT_GAP_BUFFER,
  isBreakoutEntryExtended,
  isBreakoutEntryGapInvalidated,
} from '@/lib/cpr-setup-staleness';

export type BreakoutPriceGateReason = CprSetupStaleReason;

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
 * Shared CPR/breakout price-staleness check (gap + extension/chase + ATR when available).
 * Used by Telegram pre-send gate and CPR journal.
 * Scanner UI should import evaluateCprSetupPriceStalenessBasic from `@/lib/cpr-setup-staleness`.
 */
export function evaluateCprSetupPriceStaleness(args: {
  entry: number;
  ltp: number;
  direction: 'LONG' | 'SHORT';
  todayHigh?: number;
  todayLow?: number;
  previousClose?: number;
  open?: number;
  symbol?: string;
  sector?: string;
}): { stale: true; reason: BreakoutPriceGateReason; detail: string } | { stale: false } {
  const {
    entry,
    ltp,
    direction,
    todayHigh = 0,
    todayLow = 0,
    previousClose,
    open,
    symbol = 'UNKNOWN',
    sector = 'Other',
  } = args;

  const basic = evaluateCprSetupPriceStalenessBasic({
    entry,
    ltp,
    direction,
    todayHigh,
    todayLow,
  });
  if (basic.stale && basic.reason === 'GAP_INVALIDATED') return basic;

  if (todayHigh > 0 && todayLow > 0 && (previousClose ?? 0) > 0) {
    const stock: MarketStockData = {
      symbol,
      market: 'NSE',
      sector,
      open: open ?? ltp,
      high: todayHigh,
      low: todayLow,
      close: ltp,
      ltp,
      volume: 0,
      avgVolume: 0,
      marketCap: 0,
      history: [],
      ...(previousClose != null ? { previousClose } : {}),
    };
    const ext = EntryManagerService.evaluateExtension(stock, direction);
    if (!ext.eligible) {
      return { stale: true, reason: 'EXTENDED', detail: ext.reason ?? 'EXTENDED' };
    }
  }

  if (basic.stale) return basic;

  // Defensive: keep detail wording aligned with EXTENSION_LIMITS if constants drift.
  if (isBreakoutEntryExtended({ entry, ltp, direction })) {
    const pct = (((ltp - entry) / entry) * 100).toFixed(2);
    return {
      stale: true,
      reason: 'EXTENDED',
      detail: `ltp ${ltp} is ${pct}% from entry ${entry} (limit ±${EXTENSION_LIMITS.MAX_DAY_RETURN_PCT}%)`,
    };
  }

  return { stale: false };
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
    const verdict = evaluateCprSetupPriceStaleness({
      entry: b.entry,
      ltp: b.ltp,
      direction,
      ...(b.high != null ? { todayHigh: b.high } : {}),
      ...(b.low != null ? { todayLow: b.low } : {}),
      ...(b.previousClose != null ? { previousClose: b.previousClose } : {}),
      ...(b.open != null ? { open: b.open } : {}),
      symbol: b.symbol,
      sector: b.sector,
    });
    if (verdict.stale) {
      console.warn(
        `[BreakoutPriceGate] ${b.symbol} ${verdict.reason} — ${verdict.detail}; suppressing alert`
      );
      suppressed.push({ ...b, gateReason: verdict.reason, gateDetail: verdict.detail });
      continue;
    }
    actionable.push(b);
  }

  return { actionable, suppressed };
}
