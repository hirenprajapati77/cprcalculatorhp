import {
  getISTDateString,
  getISTTime,
  isBtstDiscoveryOpen,
  isBtstJournalWindowOpen,
} from '@/lib/market-hours';
import { CPR_JOURNAL_WINDOW } from '@/config/trading-constants';
import { runBtstAlertJob } from '@/services/scheduler/btst-alert.job';
import { runBtstJournalJob } from '@/services/scheduler/btst-journal.job';
import { runCprJournalJob } from '@/services/scheduler/cpr-journal.job';
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
  label: string
): Promise<void> {
  if (!tryClaimCronRun(claimKey)) return;
  try {
    const result = await job();
    completeCronRun(claimKey, true);
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
    const { isTradingDay } = getISTTime();
    if (!isTradingDay) return;

    const dateKey = getISTDateString();

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
    '[MarketCronScheduler] Started (60s poll): btst-alert 15:10–15:25, ' +
    'cpr-journal 15:15–15:29, btst-journal 15:25–15:30, snapshots 09:16/09:30/09:45 IST'
  );
}
