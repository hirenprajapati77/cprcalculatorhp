/**
 * Canonical BTST / overnight IST windows — single source of truth.
 * Values are minute-of-day (hour * 60 + minute) in Asia/Kolkata.
 *
 * DISCOVERY_START → DISCOVERY_END : DISCOVERING (preview scan)
 * DISCOVERY_END   → ACTIVE_END    : ACTIVE (confirm / entry)
 * ACTIVE_END      → JOURNAL_END   : journal cron (inclusive end)
 * Live discovery gate is [DISCOVERY_START, ACTIVE_END).
 */
import { getISTTime } from '@/lib/market-hours';

export const DISCOVERY_START = 15 * 60 + 10;
export const DISCOVERY_END = 15 * 60 + 20;
export const ACTIVE_END = 15 * 60 + 25;
export const JOURNAL_END = 15 * 60 + 30;

export type BtstPhase = 'DISCOVERING' | 'ACTIVE' | 'FROZEN';

/** Format minute-of-day as HH:MM (derived from constants — do not hardcode clock strings elsewhere). */
export function formatIstHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getBtstPhase(date: Date = new Date()): BtstPhase {
  const { isTradingDay, totalMinutes } = getISTTime(date);
  if (!isTradingDay) return 'FROZEN';
  if (totalMinutes >= DISCOVERY_START && totalMinutes < DISCOVERY_END) return 'DISCOVERING';
  if (totalMinutes >= DISCOVERY_END && totalMinutes < ACTIVE_END) return 'ACTIVE';
  return 'FROZEN';
}

/** True for DISCOVERING or ACTIVE ([DISCOVERY_START, ACTIVE_END)). */
export function isDiscoveryWindowOpen(date: Date = new Date()): boolean {
  const { isTradingDay, totalMinutes } = getISTTime(date);
  if (!isTradingDay) return false;
  return totalMinutes >= DISCOVERY_START && totalMinutes < ACTIVE_END;
}

/** True for journal cron ([ACTIVE_END, JOURNAL_END]). */
export function isJournalWindowOpen(date: Date = new Date()): boolean {
  const { isTradingDay, totalMinutes } = getISTTime(date);
  if (!isTradingDay) return false;
  return totalMinutes >= ACTIVE_END && totalMinutes <= JOURNAL_END;
}
