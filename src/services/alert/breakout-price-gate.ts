import { EXTENSION_LIMITS, EntryManagerService } from '@/services/overnight/entry-manager.service';
import type { BreakoutScanResult, BreakoutAlertKind } from '@/services/alert/breakout-watcher.service';
import type { MarketStockData } from '@/services/market.service';
import {
  evaluateCprSetupPriceStalenessBasic,
  isBreakoutEntryExtended,
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

export type BreakoutPriceGateOptions = {
  /** Override entry-chase cap (%) — e.g. 2.0 when India VIX is in tighten band. */
  entryExtensionPct?: number;
};

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
  entryExtensionPct?: number;
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
    entryExtensionPct,
  } = args;

  const basic = evaluateCprSetupPriceStalenessBasic({
    entry,
    ltp,
    direction,
    todayHigh,
    todayLow,
    ...(entryExtensionPct != null ? { maxExtensionPct: entryExtensionPct } : {}),
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
  const chaseCap = entryExtensionPct ?? EXTENSION_LIMITS.MAX_DAY_RETURN_PCT;
  if (isBreakoutEntryExtended({ entry, ltp, direction, maxExtensionPct: chaseCap })) {
    const pct = (((ltp - entry) / entry) * 100).toFixed(2);
    return {
      stale: true,
      reason: 'EXTENDED',
      detail: `ltp ${ltp} is ${pct}% from entry ${entry} (limit ±${chaseCap}%)`,
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
  breakouts: BreakoutScanResult[],
  opts?: BreakoutPriceGateOptions
): BreakoutPriceGateResult {
  const actionable: BreakoutScanResult[] = [];
  const suppressed: BreakoutPriceGateResult['suppressed'] = [];
  const entryExtensionPct = opts?.entryExtensionPct;

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
      ...(entryExtensionPct != null ? { entryExtensionPct } : {}),
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
