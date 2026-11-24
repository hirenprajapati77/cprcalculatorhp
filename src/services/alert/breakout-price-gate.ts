import { EntryManagerService } from '@/services/overnight/entry-manager.service';
import type { BreakoutScanResult, BreakoutAlertKind } from '@/services/alert/breakout-watcher.service';
import type { MarketStockData } from '@/services/market.service';
import {
  evaluateCprSetupPriceStalenessBasic,
  isBreakoutEntryExtended,
  evaluateOrbSetupStaleness,
  atrScaledExtensionCap,
  CPR_ENTRY_EXTENSION_PCT,
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
  /** ATR as percent (2.5 = 2.5%). Used by L3 chase cap when no explicit override. */
  atrPct?: number;
  /** Step 3: Opening range high (from 15m candle). When provided with orLow, uses OR-aware staleness. */
  orHigh?: number;
  /** Step 3: Opening range low (from 15m candle). When provided with orHigh, uses OR-aware staleness. */
  orLow?: number;
  /** Step 3: ORB entry level (orHigh for LONG, orLow for SHORT). Defaults to entry when not provided. */
  orEntry?: number;
  /** Step 3: Setup type. When ORB_BREAKOUT, routes to evaluateOrbSetupStaleness. */
  setupType?: 'CPR_PULLBACK' | 'ORB_BREAKOUT';
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
    atrPct,
    orHigh,
    orLow,
    orEntry,
    setupType,
  } = args;

  // Step 3: When setup is ORB_BREAKOUT (or opted in) and opening range is provided, use OR-aware staleness checks
  // (gap vs OR boundary, extension from OR entry) instead of CPR-based checks.
  // CPR_PULLBACK setups continue through standard CPR gap/extension checks.
  const isOrb = setupType === 'ORB_BREAKOUT' || (setupType === undefined && orEntry != null);
  if (isOrb && orHigh != null && orLow != null && todayHigh > 0 && todayLow > 0) {
    const orbEntry = orEntry ?? entry;
    return evaluateOrbSetupStaleness({
      orEntry: orbEntry,
      orHigh,
      orLow,
      ltp,
      direction,
      todayHigh,
      todayLow,
      previousClose,
      maxExtensionPct: entryExtensionPct,
      atrPct,
    });
  }

  const basic = evaluateCprSetupPriceStalenessBasic({
    entry,
    ltp,
    direction,
    todayHigh,
    todayLow,
    ...(previousClose != null ? { previousClose } : {}),
    ...(entryExtensionPct != null ? { maxExtensionPct: entryExtensionPct } : {}),
    ...(atrPct != null ? { atrPct } : {}),
  });
  if (
    basic.stale &&
    (basic.reason === 'GAP_INVALIDATED' || basic.reason === 'AGAINST_PRIOR_CLOSE')
  ) {
    return basic;
  }

  if (todayHigh > 0 && todayLow > 0 && (previousClose ?? 0) > 0) {
    // M-09 fix: If atrPct is available, synthesize a historical candle reflecting the stock's
    // true ATR% so EntryManagerService.evaluateExtension evaluates true ATR multiples instead
    // of defaulting to a 1-day range from todayHigh - todayLow.
    const history =
      atrPct && atrPct > 0
        ? [
            {
              date: 'historical_atr',
              open: ltp,
              high: ltp * (1 + (atrPct / 100) / 2),
              low: ltp * (1 - (atrPct / 100) / 2),
              close: ltp,
              volume: 100000,
            },
          ]
        : [];

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
      history,
      ...(previousClose != null ? { previousClose } : {}),
    };
    const ext = EntryManagerService.evaluateExtension(stock, direction, undefined, {
      maxDayReturnPct: entryExtensionPct ?? CPR_ENTRY_EXTENSION_PCT,
      maxDayDropPct: entryExtensionPct ?? CPR_ENTRY_EXTENSION_PCT,
    });
    if (!ext.eligible) {
      return { stale: true, reason: 'EXTENDED', detail: ext.reason ?? 'EXTENDED' };
    }
  }

  if (basic.stale) return basic;

  // D3-1 fix: Pass entryExtensionPct (if explicitly configured) and atrPct so
  // volatile stocks are evaluated against their natural ATR-scaled cap instead
  // of being unconditionally overridden by the static CPR_ENTRY_EXTENSION_PCT.
  if (isBreakoutEntryExtended({ entry, ltp, direction, maxExtensionPct: entryExtensionPct, atrPct })) {
    const pct = (((ltp - entry) / entry) * 100).toFixed(2);
    const cap = entryExtensionPct ?? atrScaledExtensionCap(atrPct);
    return {
      stale: true,
      reason: 'EXTENDED',
      detail: `ltp ${ltp} is ${pct}% from entry ${entry} (limit ±${cap.toFixed(1)}%)`,
    };
  }

  return { stale: false };
}

/**
 * Pre-send gate for CPR breakout/breakdown Telegram alerts.
 * Suppresses (does not send) gap-invalidated, against-prior-close, and
 * extended/chase setups — same hard-reject posture as EntryManagerService for BTST.
 * Flagging still publishes stale RR into the group and trains traders to ignore alerts.
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
      ...(b.orHigh != null ? { orHigh: b.orHigh } : {}),
      ...(b.orLow != null ? { orLow: b.orLow } : {}),
      ...(b.orEntry != null ? { orEntry: b.orEntry } : {}),
      ...(b.setupType != null ? { setupType: b.setupType } : {}),
      symbol: b.symbol,
      sector: b.sector,
      ...(entryExtensionPct != null ? { entryExtensionPct } : {}),
      ...(b.atrPct != null ? { atrPct: b.atrPct } : {}),
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
