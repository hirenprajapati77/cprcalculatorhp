import {
  getISTDateString,
  getISTTime,
  isBtstDiscoveryOpen,
  isBtstJournalWindowOpen,
  isMarketOpen,
} from '@/lib/market-hours';
import { env } from '@/config/env';
import { CPR_JOURNAL_WINDOW } from '@/config/trading-constants';
import { runBtstAlertJob } from '@/services/scheduler/btst-alert.job';
import { runBtstJournalJob } from '@/services/scheduler/btst-journal.job';
import { runCprJournalJob } from '@/services/scheduler/cpr-journal.job';
import { runCprScanJob } from '@/services/scheduler/cpr-scan.job';
import {
  resolveJournalSnapshotSlot,
  runJournalSnapshotJob,
} from '@/services/scheduler/journal-snapshot.job';
import {
  tryClaimCronRun,
  completeCronRun,
  releaseCronRun,
} from '@/services/scheduler/cron-run-claim';
import { EarningsPopulatorService } from '@/services/earnings-populator.service';

let started = false;
/** Prevent overlapping 60s ticks when a prior tick is still running overnight/scan work. */
let tickInFlight = false;

/**
 * Decide whether a claimed cron job should retain its claim (done) or release for retry.
 *
 * Terminal empty outcomes must retainClaim — previously success:false / sent:false+"no setups"
 * released the lock every 60s and re-ran OvernightService.discover (full F&O), which OOM'd
 * the 1GB Oracle box and caused nginx 502s during the close window.
 */
export function shouldCompleteClaimedJob(result: unknown): boolean {
  if (!result || typeof result !== 'object') return true;
  const r = result as Record<string, unknown>;

  // Journal finished its overnight ensure + selection even if nothing was logged.
  if (r.overnightEnsured === true) return true;

  // Alert window: no tradable setups is terminal for this claim key (next 5m bucket is a new key).
  if (r.sent === false && r.reason === 'no setups') return true;
  if (r.sent === false && r.reason === 'already sent today') return true;

  // CPR journal: empty board is terminal for the day — retrying won't create score>=75 rows.
  if (
    r.success === false &&
    typeof r.message === 'string' &&
    /no cpr signals/i.test(r.message)
  ) {
    return true;
  }

  if (r.success === false) return false;
  if (r.sent === false) return false;

  return true;
}

function isCprJournalWindowOpen(date: Date = new Date()): boolean {
  const { hour, minute, isTradingDay } = getISTTime(date);
  if (!isTradingDay) return false;
  const timeValue = hour * 100 + minute;
  return (
    timeValue >= CPR_JOURNAL_WINDOW.START_HHMM &&
    timeValue <= CPR_JOURNAL_WINDOW.END_HHMM
  );
}

function isEarningsPopulateWindowOpen(date: Date = new Date()): boolean {
  const { hour, minute, isTradingDay } = getISTTime(date);
  if (!isTradingDay) return false;
  const timeValue = hour * 100 + minute;
  // 14:15 - 14:25 IST window (matches the OS-level 14:15 IST / 08:45 UTC cron)
  return timeValue >= 1415 && timeValue <= 1425;
}

async function runClaimedJob<T>(
  claimKey: string,
  job: () => Promise<T>,
  label: string,
  retainClaim = true
): Promise<void> {
  if (!await tryClaimCronRun(claimKey)) return;
  try {
    const result = await job();
    if (shouldCompleteClaimedJob(result)) {
      await completeCronRun(claimKey, retainClaim);
    } else {
      await releaseCronRun(claimKey);
    }
    console.log(`[MarketCronScheduler] ${label} completed`, summarizeResult(result));
  } catch (err) {
    await releaseCronRun(claimKey);
    console.error(`[MarketCronScheduler] ${label} failed:`, err);
  }
}

function summarizeResult(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const r = result as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof r.sent === 'boolean') parts.push(`sent=${r.sent}`);
  if (typeof r.success === 'boolean') parts.push(`success=${r.success}`);
  if (typeof r.count === 'number') parts.push(`count=${r.count}`);
  if (typeof r.universe === 'string') parts.push(`universe=${r.universe}`);
  if (Array.isArray(r.logged)) parts.push(`logged=${r.logged.length}`);
  if (Array.isArray(r.skipped)) parts.push(`skipped=${r.skipped.length}`);
  if (typeof r.reason === 'string') parts.push(`reason=${r.reason}`);
  if (typeof r.message === 'string') parts.push(`message=${r.message}`);
  if (typeof r.slot === 'string') parts.push(`slot=${r.slot}`);
  return parts.length ? `(${parts.join(', ')})` : '';
}

/**
 * In-process fallback for production market crons when host crontab is missing.
 * Polls every 60s and runs each job at most once per IST day (per snapshot slot).
 */
export function startMarketCronScheduler(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    if (tickInFlight) {
      console.warn('[MarketCronScheduler] Previous tick still running — skipping overlapping poll');
      return;
    }
    tickInFlight = true;
    try {
      const istTime = getISTTime();
      if (!istTime.isTradingDay) return;

      const dateKey = getISTDateString();
      const inCloseWorkflow =
        isBtstDiscoveryOpen() || isBtstJournalWindowOpen() || isCprJournalWindowOpen();

      // Intentional: cpr-scan is NIFTY_FNO-only, so the aggregate cash-session gate
      // from MARKET_SESSION.CLOSE is the correct clock. Under CLOSING_AUCTION this
      // closes at 15:15 for F&O names and must not extend to 15:30.
      // Skip during BTST/CPR close workflow so overnight discover + scan never stack on 1GB.
      if (isMarketOpen() && !inCloseWorkflow) {
        // Time-bucketed claim key: retainClaim=true blocks re-entry within the same
        // N-minute bucket; the next bucket key allows the next fire. Do NOT use
        // retainClaim=false here — that would re-run on every 60s poll tick.
        const intervalMinutes = Math.max(1, env.CPR_SCAN_INTERVAL_MINUTES || 5);
        const timeBucket = Math.floor(istTime.totalMinutes / intervalMinutes);
        const cprScanKey = `cpr-scan:${dateKey}:${timeBucket}`;
        await runClaimedJob(cprScanKey, () => runCprScanJob('NIFTY_FNO', 'NSE'), 'cpr-scan', true);
      }

      // btst-alert selects overnight/index tradable picks (F&O-only legs for stock
      // options; index legs are derivative products). It should follow profile BTST
      // windows (15:10–15:25 CONTINUOUS, 15:10–15:15 CLOSING_AUCTION).
      if (isBtstDiscoveryOpen()) {
        // Time-bucketed key (5-min buckets) — mirrors cpr-scan pattern so the
        // scheduler re-checks every 5 minutes across the 15:10–15:25 window.
        // Double-send is prevented by BtstAlertState DB unique constraint inside
        // runBtstAlertJob itself (returns sent:false, reason:'already sent today').
        const btstBucket = Math.floor(istTime.totalMinutes / 5);
        await runClaimedJob(`btst-alert:${dateKey}:${btstBucket}`, runBtstAlertJob, 'btst-alert');
      }

      // cpr-journal window is profile-derived via CPR_JOURNAL_WINDOW and intentionally
      // separate from the scanner route's mixed-universe live recompute behavior.
      if (isCprJournalWindowOpen()) {
        await runClaimedJob(`cpr-journal:${dateKey}`, runCprJournalJob, 'cpr-journal');
      }

      // btst-journal is tied to overnight/derivatives workflow and should track
      // profile BTST journal windows (including CAS extension profile clocks).
      if (isBtstJournalWindowOpen()) {
        await runClaimedJob(`btst-journal:${dateKey}`, runBtstJournalJob, 'btst-journal');
      }

      const snapshotSlot = resolveJournalSnapshotSlot();
      if (snapshotSlot) {
        await runClaimedJob(
          `journal-snapshot:${snapshotSlot}:${dateKey}`,
          () => runJournalSnapshotJob(snapshotSlot),
          `journal-snapshot-${snapshotSlot}`
        );
      }

      if (isEarningsPopulateWindowOpen()) {
        await runClaimedJob(
          `earnings-populate:${dateKey}`,
          () => EarningsPopulatorService.populate(),
          'earnings-populate'
        );
      }
    } finally {
      tickInFlight = false;
    }
  };

  setInterval(() => {
    void tick();
  }, 60_000);

  void tick();

  console.log(
    `[MarketCronScheduler] Started (60s poll): cpr-scan (every ${env.CPR_SCAN_INTERVAL_MINUTES || 5}m), ` +
    'btst-alert 15:10–15:25, cpr-journal 15:20–15:24, btst-journal 15:25–15:30, ' +
    'snapshots 09:16/09:30/09:45 IST, earnings-populate 14:15–14:25 IST'
  );
}
