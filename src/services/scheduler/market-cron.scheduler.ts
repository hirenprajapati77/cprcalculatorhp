import { isBtstDiscoveryOpen, getISTTime } from '@/lib/market-hours';
import { runBtstAlertJob } from '@/services/scheduler/btst-alert.job';

let started = false;
let runningBtstAlert = false;

/**
 * In-process fallback for production BTST Telegram alerts when host crontab
 * is missing or misconfigured. Uses the same claim/send path as /api/cron/btst-alert.
 */
export function startMarketCronScheduler(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    const { isTradingDay } = getISTTime();
    if (!isTradingDay || !isBtstDiscoveryOpen()) return;
    if (runningBtstAlert) return;

    runningBtstAlert = true;
    try {
      const result = await runBtstAlertJob();
      if (result.sent) {
        console.log(`[BtstAlertScheduler] Telegram sent (${result.longs} long, ${result.shorts} short)`);
      } else if (result.reason !== 'already sent today') {
        console.warn(`[BtstAlertScheduler] Alert skipped: ${result.reason ?? 'unknown'}`);
      }
    } catch (err) {
      console.error('[BtstAlertScheduler] Job failed:', err);
    } finally {
      runningBtstAlert = false;
    }
  };

  // Check every minute during server uptime; claim table prevents duplicate sends.
  setInterval(() => {
    void tick();
  }, 60_000);

  // Run once on startup if we boot inside the discovery window.
  void tick();

  console.log('[BtstAlertScheduler] Started (60s poll during 15:10–15:25 IST trading days)');
}
