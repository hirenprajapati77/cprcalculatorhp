import { BreakoutWatcherService, type BreakoutScanResult } from '@/services/alert/breakout-watcher.service';
import { TelegramService } from '@/services/alert/telegram.service';

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

/**
 * Cron-only breakout → Telegram pipeline. Fire-and-forget; never blocks the scan response.
 * Must not be called from UI-triggered `/api/scanner/refresh`.
 */
export function notifyBreakoutsFromScan(
  results: ScanResultForBreakoutAlert[],
  label = 'cron'
): void {
  BreakoutWatcherService.detectNewBreakouts(mapScanResultsForBreakoutAlert(results))
    .then((newBreakouts) => {
      if (newBreakouts.length > 0) {
        return TelegramService.sendBreakoutAlert(newBreakouts);
      }
    })
    .catch((err) => {
      console.error(`[BreakoutWatcher] ${label} alert pipeline failed:`, err);
    });
}
