import { BreakoutWatcherService, type BreakoutScanResult, breakoutAlertClaimKey } from '@/services/alert/breakout-watcher.service';
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
  degenerateData?: boolean | null;
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
      score: r.score ?? 0,
      sector: r.sector ?? 'Other',
      eventRiskScore: r.eventRiskScore ?? 0,
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
      const result = await TelegramService.sendBreakoutAlert(newBreakouts);
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
