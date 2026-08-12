import { BreakoutWatcherService, type BreakoutScanResult, breakoutAlertClaimKey } from '@/services/alert/breakout-watcher.service';
import { TelegramService } from '@/services/alert/telegram.service';
import { MarketSessionResolver } from '@/config/market-profile';
import { getISTDateString, shouldFreezeBreakouts } from '@/lib/market-hours';
import { MarketService } from '@/services/market.service';
import type { OptionSuggestion } from '@/services/option-suggestion.service';
import { filterBreakoutsForPriceActionability } from '@/services/alert/breakout-price-gate';

/**
 * Cap concurrent option-chain lookups for confirmed breakout alerts.
 * Typical new-alert set is 0–3 (debounce + cooldown). Batch of 2 matches the
 * Fyers-cooldown scan batch and avoids the unbounded Promise.all that previously
 * lived inside sendBreakoutAlert.
 */
export const BREAKOUT_OPTION_ENRICH_BATCH_SIZE = 2;

/**
 * OptionChainService chain fetches have no AbortSignal timeout (only the lot-size
 * CSV download uses 5s). Race each suggestOption so a hung Fyers call cannot delay
 * Telegram indefinitely.
 */
export const BREAKOUT_OPTION_SUGGESTION_TIMEOUT_MS = 8_000;

/** Minimal scan row shape needed to evaluate breakout Telegram alerts. */
export type ScanResultForBreakoutAlert = {
  symbol: string;
  signals?: string[] | null;
  ltp: number;
  entry?: number | null;
  tc?: number | null;
  sl?: number | null;
  bc?: number | null;
  target?: number | null;
  r1?: number | null;
  rr?: string | null;
  target2?: number | null;
  rr2?: string | null;
  score?: number | null;
  sector?: string | null;
  eventRiskScore?: number | null;
  degenerateData?: boolean | null;
  high?: number | null;
  low?: number | null;
  open?: number | null;
  previousClose?: number | null;
};

export function mapScanResultsForBreakoutAlert(
  results: ScanResultForBreakoutAlert[]
): BreakoutScanResult[] {
  return results.map((r) => {
    const signals = r.signals || [];
    const isBreakdown = signals.includes('BREAKDOWN') && !signals.includes('BREAKOUT');
    // Direction-aware level fallbacks when entry/sl/target missing from scan row.
    const entry = r.entry ?? (isBreakdown ? (r.bc ?? r.ltp) : (r.tc ?? r.ltp));
    const sl = r.sl ?? (isBreakdown ? (r.tc ?? r.ltp * 1.01) : (r.bc ?? r.ltp * 0.99));
    const target = r.target ?? (isBreakdown ? (r.ltp * 0.98) : (r.r1 ?? r.ltp * 1.02));
    return {
      symbol: r.symbol,
      signals,
      ltp: r.ltp,
      entry,
      sl,
      target,
      rr: r.rr ?? '1:1.5',
      target2: r.target2 ?? null,
      rr2: r.rr2 ?? null,
      score: r.score ?? 0,
      sector: r.sector ?? 'Other',
      eventRiskScore: r.eventRiskScore ?? 0,
      ...(r.high != null ? { high: r.high } : {}),
      ...(r.low != null ? { low: r.low } : {}),
      ...(r.open != null ? { open: r.open } : {}),
      ...(r.previousClose != null ? { previousClose: r.previousClose } : {}),
    };
  });
}

function buildFnOLookup(): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const s of MarketService.getRawUniverse()) {
    map.set(s.symbol.trim().toUpperCase(), s.isFnO === true);
  }
  return map;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Attach optionSuggestion onto confirmed new-breakout rows only.
 * Batched (not unbounded Promise.all); per-stock failures are swallowed so Telegram still sends.
 */
export async function enrichBreakoutsWithOptionSuggestions(
  breakouts: BreakoutScanResult[],
  opts?: {
    batchSize?: number;
    timeoutMs?: number;
    suggestOption?: (
      symbol: string,
      ltp: number,
      bias: 'BULLISH' | 'BEARISH',
      entry: number,
      sl: number,
      target: number,
      signalDate?: string
    ) => Promise<OptionSuggestion>;
  }
): Promise<BreakoutScanResult[]> {
  if (breakouts.length === 0) return breakouts;

  const batchSize = opts?.batchSize ?? BREAKOUT_OPTION_ENRICH_BATCH_SIZE;
  const timeoutMs = opts?.timeoutMs ?? BREAKOUT_OPTION_SUGGESTION_TIMEOUT_MS;
  const signalDate = getISTDateString();

  let suggest =
    opts?.suggestOption;
  if (!suggest) {
    const { OptionSuggestionService } = await import('@/services/option-suggestion.service');
    suggest = OptionSuggestionService.suggestOption.bind(OptionSuggestionService);
  }

  const out: BreakoutScanResult[] = [];
  for (let i = 0; i < breakouts.length; i += batchSize) {
    const batch = breakouts.slice(i, i + batchSize);
    const enrichedBatch = await Promise.all(
      batch.map(async (b) => {
        const isBreakdown =
          b.alertKind === 'BREAKDOWN' || b.signals?.includes('BREAKDOWN');
        const bias: 'BULLISH' | 'BEARISH' = isBreakdown ? 'BEARISH' : 'BULLISH';
        try {
          const suggestion = await withTimeout(
            suggest!(b.symbol, b.ltp, bias, b.entry, b.sl, b.target, signalDate),
            timeoutMs,
            `optionSuggestion(${b.symbol})`
          );
          if (suggestion && !suggestion.error && suggestion.formattedName) {
            return { ...b, optionSuggestion: suggestion };
          }
        } catch (err) {
          console.warn(
            `[BreakoutWatcher] Option suggestion skipped for ${b.symbol}:`,
            err instanceof Error ? err.message : err
          );
        }
        return { ...b };
      })
    );
    out.push(...enrichedBatch);
  }
  return out;
}

/**
 * Cron-only breakout → Telegram pipeline. Fire-and-forget; never blocks the scan response.
 * Must not be called from UI-triggered `/api/scanner/refresh`.
 *
 * Under CLOSING_AUCTION, continuous breakout alerts are frozen after cashContinuousEnd
 * for symbols where MarketSessionResolver.supportsClosingAuction is true.
 */
export function notifyBreakoutsFromScan(
  results: ScanResultForBreakoutAlert[],
  label = 'cron'
): void {
  const fnOBySymbol = buildFnOLookup();
  const eligible = results.filter((r) => {
    if (r.degenerateData) return false;
    if (r.signals?.includes('DEGENERATE_DATA')) return false;
    const ctx = MarketSessionResolver.resolve(r.symbol, {
      isFnO: fnOBySymbol.get(r.symbol.trim().toUpperCase()) === true,
    });
    return !shouldFreezeBreakouts(new Date(), ctx);
  });

  if (eligible.length === 0) {
    if (results.length > 0) {
      console.log(
        `[BreakoutWatcher] ${label}: skipped ${results.length} row(s) — CAS continuous freeze`
      );
    }
    return;
  }

  let claimedKeys: string[] = [];
  BreakoutWatcherService.detectNewBreakouts(mapScanResultsForBreakoutAlert(eligible))
    .then(async (newBreakouts) => {
      if (newBreakouts.length === 0) return;
      claimedKeys = newBreakouts.map((b) =>
        breakoutAlertClaimKey(b.symbol, b.alertKind ?? 'BREAKOUT')
      );

      // Pre-send gate: gap-invalidated / extended entries never hit Telegram.
      // Release claims for suppressed rows so a later pullback into the entry
      // zone can still alert (unlike a real delivered alert which keeps cooldown).
      const { actionable, suppressed } = filterBreakoutsForPriceActionability(newBreakouts);
      if (suppressed.length > 0) {
        const suppressKeys = suppressed.map((b) =>
          breakoutAlertClaimKey(b.symbol, b.alertKind ?? 'BREAKOUT')
        );
        await BreakoutWatcherService.releaseClaims(suppressKeys);
        claimedKeys = claimedKeys.filter((k) => !suppressKeys.includes(k));
        console.log(
          `[BreakoutWatcher] ${label}: suppressed ${suppressed.length} stale-price alert(s): ` +
            suppressed.map((s) => `${s.symbol}:${s.gateReason}`).join(', ')
        );
      }
      if (actionable.length === 0) return;

      const enriched = await enrichBreakoutsWithOptionSuggestions(actionable);
      const result = await TelegramService.sendBreakoutAlert(enriched);
      if (!result.ok) {
        console.error(
          `[BreakoutWatcher] ${label} Telegram send failed (${result.reason ?? 'unknown'}) — releasing claims`
        );
        await BreakoutWatcherService.releaseClaims(claimedKeys);
        claimedKeys = [];
      }
    })
    .catch(async (err) => {
      console.error(`[BreakoutWatcher] ${label} alert pipeline failed:`, err);
      if (claimedKeys.length > 0) {
        await BreakoutWatcherService.releaseClaims(claimedKeys);
      }
    });
}
