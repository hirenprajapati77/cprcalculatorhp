import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { getISTTime } from '@/lib/market-hours';

export type JournalSnapshotSlot = '916' | '930' | '945';

/** Resolve the active D+1 snapshot slot from IST clock (matches journal-snapshot cron). */
export function resolveJournalSnapshotSlot(date: Date = new Date()): JournalSnapshotSlot | null {
  const { hour, minute, isTradingDay } = getISTTime(date);
  if (!isTradingDay) return null;
  if (hour === 9 && minute >= 16 && minute < 20) return '916';
  if (hour === 9 && minute >= 30 && minute < 34) return '930';
  if (hour === 9 && minute >= 45 && minute < 49) return '945';
  return null;
}

export async function runJournalSnapshotJob(
  slot: JournalSnapshotSlot
): Promise<{ success: true; slot: JournalSnapshotSlot }> {
  await TradeJournalService.captureSnapshot(slot);
  return { success: true, slot };
}
