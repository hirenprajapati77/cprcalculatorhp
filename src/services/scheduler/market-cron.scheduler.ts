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

let started = false;

export function shouldCompleteClaimedJob(result: unknown): boolean {
  if (!result || typeof result !== 'object') return true;
  const r = result as Record<string, unknown>;

  if (r.success === false) return false;
  if (r.sent === false && r.reason !== 'already sent today') return false;

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

async function runClaimedJob<T>(
  claimKey: string,
  job: () => Promise<T>,
  label: string,
  retainClaim = true
): Promise<void> {
  if (!tryClaimCronRun(claimKey)) return;
  try {
    const result = await job();
    if (shouldCompleteClaimedJob(result)) {
      completeCronRun(claimKey, retainClaim);
    } else {
      releaseCronRun(claimKey);
    }
    console.log(`[MarketCronScheduler] ${label} completed`, summarizeResult(result));
  } catch (err) {
    releaseCronRun(claimKey);
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
    const istTime = getISTTime();
    if (!istTime.isTradingDay) return;

    const dateKey = getISTDateString();

    if (isMarketOpen()) {
      // Time-bucketed claim key: retainClaim=true blocks re-entry within the same
      // N-minute bucket; the next bucket key allows the next fire. Do NOT use
      // retainClaim=false here — that would re-run on every 60s poll tick.
      const intervalMinutes = Math.max(1, env.CPR_SCAN_INTERVAL_MINUTES || 5);
      const timeBucket = Math.floor(istTime.totalMinutes / intervalMinutes);
      const cprScanKey = `cpr-scan:${dateKey}:${timeBucket}`;
      await runClaimedJob(cprScanKey, () => runCprScanJob('NIFTY_FNO', 'NSE'), 'cpr-scan', true);
    }

    if (isBtstDiscoveryOpen()) {
      await runClaimedJob(`btst-alert:${dateKey}`, runBtstAlertJob, 'btst-alert');
    }

    if (isCprJournalWindowOpen()) {
      await runClaimedJob(`cpr-journal:${dateKey}`, runCprJournalJob, 'cpr-journal');
    }

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
  };

  setInterval(() => {
    void tick();
  }, 60_000);

  void tick();

  console.log(
    `[MarketCronScheduler] Started (60s poll): cpr-scan (every ${env.CPR_SCAN_INTERVAL_MINUTES || 5}m), ` +
    'btst-alert 15:10–15:25, cpr-journal 15:20–15:29, btst-journal 15:25–15:30, snapshots 09:16/09:30/09:45 IST'
  );
}
