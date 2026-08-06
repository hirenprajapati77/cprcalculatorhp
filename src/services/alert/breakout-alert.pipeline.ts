import { BreakoutWatcherService, type BreakoutScanResult } from '@/services/alert/breakout-watcher.service';
import { TelegramService } from '@/services/alert/telegram.service';
import { MarketSessionResolver } from '@/config/market-profile';
import { shouldFreezeBreakouts } from '@/lib/market-hours';
import { MarketService } from '@/services/market.service';

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
  score?: number | null;
  sector?: string | null;
  eventRiskScore?: number | null;
};

export function mapScanResultsForBreakoutAlert(
  results: ScanResultForBreakoutAlert[]
): BreakoutScanResult[] {
  return results.map((r) => ({
    symbol: r.symbol,
    signals: r.signals || [],
    ltp: r.ltp,
    entry: r.entry ?? r.tc ?? r.ltp,
    sl: r.sl ?? r.bc ?? r.ltp * 0.99,
    target: r.target ?? r.r1 ?? r.ltp * 1.02,
    rr: r.rr ?? '1:1.5',
    score: r.score ?? 0,
    sector: r.sector ?? 'Other',
    eventRiskScore: r.eventRiskScore ?? 0,
  }));
}

function buildFnOLookup(): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const s of MarketService.getRawUniverse()) {
    map.set(s.symbol.trim().toUpperCase(), s.isFnO === true);
  }
  return map;
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

  let claimedSymbols: string[] = [];
  BreakoutWatcherService.detectNewBreakouts(mapScanResultsForBreakoutAlert(eligible))
    .then(async (newBreakouts) => {
      if (newBreakouts.length === 0) return;
      claimedSymbols = newBreakouts.map((b) => b.symbol);
      const result = await TelegramService.sendBreakoutAlert(newBreakouts);
      if (!result.ok) {
        console.error(
          `[BreakoutWatcher] ${label} Telegram send failed (${result.reason ?? 'unknown'}) — releasing claims`
        );
        await BreakoutWatcherService.releaseClaims(claimedSymbols);
        claimedSymbols = [];
      }
    })
    .catch(async (err) => {
      console.error(`[BreakoutWatcher] ${label} alert pipeline failed:`, err);
      if (claimedSymbols.length > 0) {
        await BreakoutWatcherService.releaseClaims(claimedSymbols);
      }
    });
}
