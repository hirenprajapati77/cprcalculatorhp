import { BTST_WINDOWS, MARKET_SESSION } from '@/config/trading-constants';
import {
  clocksForContext,
  toProfileTotalMinutes,
  type MarketSessionContext,
} from '@/config/market-profile';

// NSE Trading Holidays mapped by year
const NSE_HOLIDAYS_BY_YEAR: Record<string, string[]> = {
  '2026': [
    '2026-01-26', // Republic Day
    '2026-03-03', // Holi
    '2026-03-26', // Shri Ram Navami
    '2026-03-31', // Shri Mahavir Jayanti
    '2026-04-03', // Good Friday
    '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-05-28', // Bakri Id
    '2026-06-26', // Muharram
    '2026-08-25', // Ganesh Chaturthi (corrected from Sep 14 — 2026 Ganesh Chaturthi is Aug 25 per Panchang)
    '2026-10-02', // Mahatma Gandhi Jayanti + Dussehra (Vijaya Dashami) — both fall on Oct 2, 2026
    // L-1 fix: removed erroneous duplicate '2026-10-20' Dussehra entry.
    // Vijaya Dashami 2026 is Oct 2, not Oct 20. Two entries caused Oct 20 to be
    // treated as a trading holiday, freezing cron jobs on a live trading day.
    '2026-11-03', // Diwali — Laxmi Puja (NSE closed; Muhurat trading may be held separately)
    '2026-11-04', // Diwali — Balipratipada
    '2026-11-10', // Prakash Gurpurb Sri Guru Nanak Dev
    '2026-12-25', // Christmas
    // NOTE: Always cross-check with official NSE holiday circular at
    // https://www.nseindia.com/resources/exchange-communication-holidays
    // Diwali dates above are based on Panchang; NSE may vary by one day.
  ]
};

/**
 * Returns the current date string (YYYY-MM-DD) in IST.
 * Uses Intl.DateTimeFormat (en-CA locale) to match the same approach as getISTTime()
 * and avoid the midnight boundary disagreement that manual UTC+5:30 arithmetic can cause.
 */
export function getISTDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getISTTime(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  
  const dateString = `${year}-${month}-${day}`;
  
  if (!NSE_HOLIDAYS_BY_YEAR[year]) {
    // Every trading-day check in the app (BTST execution window, journal snapshot
    // backfill, overnight signal freeze state) silently degrades to "every day is a
    // trading day" when this fires. NSE typically publishes next year's holiday circular
    // in Nov/Dec of the prior year — check https://www.nseindia.com/resources/exchange-communication-holidays
    // and add a new entry to NSE_HOLIDAYS_BY_YEAR above when it's out.
    console.warn(`[WARNING] No holiday list defined for year ${year}. Holiday calculations will be inaccurate.`);
  }
  const holidays = NSE_HOLIDAYS_BY_YEAR[year] || [];
  const isHoliday = holidays.includes(dateString);
  const isWeekend = weekday === 'Saturday' || weekday === 'Sunday';
  const isTradingDay = !isWeekend && !isHoliday;
  
  return {
    hour,
    minute,
    weekday,
    dateString,
    totalMinutes: hour * 60 + minute,
    isWeekend,
    isHoliday,
    isTradingDay
  };
}

function toTotalMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/** Format minute-of-day as HH:MM (values must come from BTST_WINDOWS / MARKET_SESSION). */
export function formatIstHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatIstClock(parts: { hour: number; minute: number }): string {
  return formatIstHm(toTotalMinutes(parts.hour, parts.minute));
}

const MARKET_PRE_OPEN_MIN = toTotalMinutes(
  MARKET_SESSION.PRE_OPEN.hour,
  MARKET_SESSION.PRE_OPEN.minute
);
const MARKET_OPEN_MIN = toTotalMinutes(MARKET_SESSION.OPEN.hour, MARKET_SESSION.OPEN.minute);
const MARKET_CLOSE_MIN = toTotalMinutes(MARKET_SESSION.CLOSE.hour, MARKET_SESSION.CLOSE.minute);

const DISCOVERY_START_MIN = toTotalMinutes(
  BTST_WINDOWS.DISCOVERY_START.hour,
  BTST_WINDOWS.DISCOVERY_START.minute
);
const CLOSING_WINDOW_START_MIN = toTotalMinutes(
  BTST_WINDOWS.CLOSING_WINDOW_START.hour,
  BTST_WINDOWS.CLOSING_WINDOW_START.minute
);
const RULE5_END_EXCLUSIVE_MIN = toTotalMinutes(
  BTST_WINDOWS.RULE5_END_EXCLUSIVE.hour,
  BTST_WINDOWS.RULE5_END_EXCLUSIVE.minute
);
const CONFIRM_START_MIN = toTotalMinutes(
  BTST_WINDOWS.CONFIRM_START.hour,
  BTST_WINDOWS.CONFIRM_START.minute
);
const DISCOVERY_END_MIN = toTotalMinutes(
  BTST_WINDOWS.DISCOVERY_END_EXCLUSIVE.hour,
  BTST_WINDOWS.DISCOVERY_END_EXCLUSIVE.minute
);
const JOURNAL_START_MIN = toTotalMinutes(
  BTST_WINDOWS.JOURNAL_START.hour,
  BTST_WINDOWS.JOURNAL_START.minute
);
const JOURNAL_END_MIN = toTotalMinutes(
  BTST_WINDOWS.JOURNAL_END_INCLUSIVE.hour,
  BTST_WINDOWS.JOURNAL_END_INCLUSIVE.minute
);

/** Derived IST minute-of-day bounds (from trading-constants only). */
export const BTST_WINDOW_MINUTES = {
  MARKET_PRE_OPEN: MARKET_PRE_OPEN_MIN,
  MARKET_OPEN: MARKET_OPEN_MIN,
  MARKET_CLOSE: MARKET_CLOSE_MIN,
  DISCOVERY_START: DISCOVERY_START_MIN,
  CLOSING_WINDOW_START: CLOSING_WINDOW_START_MIN,
  CONFIRM_START: CONFIRM_START_MIN,
  DISCOVERY_END: DISCOVERY_END_MIN,
  JOURNAL_START: JOURNAL_START_MIN,
  JOURNAL_END: JOURNAL_END_MIN,
} as const;

/**
 * True when a 5m bar's IST open minute-of-day falls in the profile Rule5 window
 * [rule5Start, rule5EndExclusive) — EOD liquidity for BTST/STBT Rule 5.
 * Under CONTINUOUS this is [15:15, 15:30); under CLOSING_AUCTION [15:00, 15:15).
 * Uses RULE5_END_EXCLUSIVE (not MARKET_CLOSE) so CAS profile cutover stays correct.
 */
export function isInClosingLiquidityWindow(barOpenMinuteOfDay: number): boolean {
  return barOpenMinuteOfDay >= CLOSING_WINDOW_START_MIN && barOpenMinuteOfDay < RULE5_END_EXCLUSIVE_MIN;
}

/**
 * Exchange session state (CAS-aware). Prefer this for new code.
 * Pass MarketSessionContext so ineligible symbols keep a continuous cash day
 * even when MARKET_PROFILE=CLOSING_AUCTION.
 *
 * Under CONTINUOUS (or ineligible ctx): never emits CAS / FNO_ONLY.
 */
export type SessionState = 'PREOPEN' | 'LIVE' | 'CAS' | 'FNO_ONLY' | 'CLOSED';

export function getSessionState(
  date: Date = new Date(),
  ctx?: MarketSessionContext
): SessionState {
  const { totalMinutes, isTradingDay } = getISTTime(date);
  if (!isTradingDay) return 'CLOSED';

  const clocks = clocksForContext(ctx);
  const preOpen = toProfileTotalMinutes(clocks.preOpen);
  const open = toProfileTotalMinutes(clocks.cashOpen);
  const contEnd = toProfileTotalMinutes(clocks.cashContinuousEnd);
  const casEnd = toProfileTotalMinutes(clocks.casEnd);
  const fnoEnd = toProfileTotalMinutes(clocks.fnoSessionEnd);

  const useCasPhases =
    clocks.id === 'CLOSING_AUCTION' && (ctx == null || ctx.supportsClosingAuction);

  if (totalMinutes >= open && totalMinutes < contEnd) return 'LIVE';
  if (totalMinutes >= preOpen && totalMinutes < open) return 'PREOPEN';

  if (useCasPhases) {
    if (totalMinutes >= contEnd && totalMinutes < casEnd) return 'CAS';
    if (totalMinutes >= casEnd && totalMinutes < fnoEnd) return 'FNO_ONLY';
  }

  return 'CLOSED';
}

/**
 * True when continuous breakout Telegram should be suppressed for this context.
 * Only active under CLOSING_AUCTION for symbols with supportsClosingAuction.
 */
export function shouldFreezeBreakouts(
  date: Date = new Date(),
  ctx?: MarketSessionContext
): boolean {
  const clocks = clocksForContext(ctx);
  if (!clocks.freezeBreakoutsAfterContinuousEnd) return false;
  if (ctx && !ctx.supportsClosingAuction) return false;

  const { totalMinutes, isTradingDay } = getISTTime(date);
  if (!isTradingDay) return true;
  return totalMinutes >= toProfileTotalMinutes(clocks.cashContinuousEnd);
}

/** IST minute-of-day for a Unix timestamp (seconds). */
export function istMinuteOfDayFromUnixSec(unixSec: number): number {
  const d = new Date(unixSec * 1000);
  const parts = getISTTime(d);
  return parts.totalMinutes;
}

/** Preformatted HH:MM labels for UI/cron messages (derived — no clock literals here). */
export const BTST_CLOCK = {
  preOpen: formatIstHm(MARKET_PRE_OPEN_MIN),
  marketOpen: formatIstHm(MARKET_OPEN_MIN),
  marketClose: formatIstHm(MARKET_CLOSE_MIN),
  discoveryStart: formatIstHm(DISCOVERY_START_MIN),
  confirmStart: formatIstHm(CONFIRM_START_MIN),
  discoveryEnd: formatIstHm(DISCOVERY_END_MIN),
  journalStart: formatIstHm(JOURNAL_START_MIN),
  journalEnd: formatIstHm(JOURNAL_END_MIN),
} as const;

/** HHMM integer form for UI comparisons (e.g. hour*100+minute). */
export const BTST_HHMM = {
  preOpen: MARKET_SESSION.PRE_OPEN.hour * 100 + MARKET_SESSION.PRE_OPEN.minute,
  marketOpen: MARKET_SESSION.OPEN.hour * 100 + MARKET_SESSION.OPEN.minute,
  /** Exclusive end of cash session — matches isMarketOpen [open, close). */
  marketClose: MARKET_SESSION.CLOSE.hour * 100 + MARKET_SESSION.CLOSE.minute,
  discoveryStart: BTST_WINDOWS.DISCOVERY_START.hour * 100 + BTST_WINDOWS.DISCOVERY_START.minute,
  confirmStart: BTST_WINDOWS.CONFIRM_START.hour * 100 + BTST_WINDOWS.CONFIRM_START.minute,
  discoveryEnd: BTST_WINDOWS.DISCOVERY_END_EXCLUSIVE.hour * 100 + BTST_WINDOWS.DISCOVERY_END_EXCLUSIVE.minute,
  journalEnd: BTST_WINDOWS.JOURNAL_END_INCLUSIVE.hour * 100 + BTST_WINDOWS.JOURNAL_END_INCLUSIVE.minute,
} as const;

/**
 * Site-wide NSE cash-session phase (IST):
 * - CLOSED: weekend / holiday / before 09:00 / at-or-after 15:30
 * - PRESESSION: [09:00, 09:15)
 * - LIVE: [09:15, 15:30)
 */
export type CashSessionState = 'CLOSED' | 'PRESESSION' | 'LIVE';

export function getCashSessionState(date: Date = new Date()): CashSessionState {
  const { totalMinutes, isTradingDay } = getISTTime(date);
  if (!isTradingDay) return 'CLOSED';
  if (totalMinutes >= MARKET_OPEN_MIN && totalMinutes < MARKET_CLOSE_MIN) return 'LIVE';
  if (totalMinutes >= MARKET_PRE_OPEN_MIN && totalMinutes < MARKET_OPEN_MIN) return 'PRESESSION';
  return 'CLOSED';
}

/** True during pre-session [09:00, 09:15) IST on a trading day. */
export function isPreSession(date: Date = new Date()): boolean {
  return getCashSessionState(date) === 'PRESESSION';
}

export function isMarketOpen(date: Date = new Date()): boolean {
  return getCashSessionState(date) === 'LIVE';
}

export function isTodayCandleClosed(date: Date = new Date()): boolean {
  const { isTradingDay, totalMinutes } = getISTTime(date);
  if (!isTradingDay) return true;
  return totalMinutes >= MARKET_CLOSE_MIN;
}

export type BtstWindowState = 'DISCOVERING' | 'ACTIVE' | 'FROZEN';

/**
 * Overnight / BTST phase for a trading day (from BTST_WINDOWS):
 * - DISCOVERING: [DISCOVERY_START, CONFIRM_START)
 * - ACTIVE: [CONFIRM_START, DISCOVERY_END_EXCLUSIVE)
 * - FROZEN: otherwise (or non-trading day)
 */
export function getBtstWindowState(date: Date = new Date()): BtstWindowState {
  const { isTradingDay, totalMinutes } = getISTTime(date);
  if (!isTradingDay) return 'FROZEN';
  if (totalMinutes >= DISCOVERY_START_MIN && totalMinutes < CONFIRM_START_MIN) {
    return 'DISCOVERING';
  }
  if (totalMinutes >= CONFIRM_START_MIN && totalMinutes < DISCOVERY_END_MIN) {
    return 'ACTIVE';
  }
  return 'FROZEN';
}

/** True during [DISCOVERY_START, DISCOVERY_END_EXCLUSIVE) on a trading day. */
export function isBtstDiscoveryOpen(date: Date = new Date()): boolean {
  const state = getBtstWindowState(date);
  return state === 'DISCOVERING' || state === 'ACTIVE';
}

/** True during [CONFIRM_START, DISCOVERY_END_EXCLUSIVE) on a trading day. */
export function isBtstConfirmOpen(date: Date = new Date()): boolean {
  return getBtstWindowState(date) === 'ACTIVE';
}

/** True during [JOURNAL_START, JOURNAL_END_INCLUSIVE] on a trading day. */
export function isBtstJournalWindowOpen(date: Date = new Date()): boolean {
  const { isTradingDay, totalMinutes } = getISTTime(date);
  if (!isTradingDay) return false;
  return totalMinutes >= JOURNAL_START_MIN && totalMinutes <= JOURNAL_END_MIN;
}

/**
 * Returns history with the in-progress IST daily candle removed when the session
 * is still open. Completed-session ATR/CPR classification must not use today's
 * partial high/low/close.
 *
 * Historical replay (`asOfDate` provided): treats the asOfDate bar as final and
 * returns the full array unchanged. The early return is intentional — do NOT
 * remove it. The `todayStr` assignment above is kept for the live path's
 * end-of-function check only.
 */
export function getCompletedHistory<T extends { date: string }>(
  history: T[],
  asOfDate?: string
): T[] {
  if (!history.length) return history;
  const todayStr = asOfDate || getISTDateString();
  const last = history[history.length - 1];
  // H-2: Historical replay — asOfDate bar is the final candle; return as-is.
  // This is deliberate: backtests need the replay date's OHLC for CPR/ATR.
  if (asOfDate) return history;
  if (last.date === todayStr && !isTodayCandleClosed()) {
    return history.slice(0, -1);
  }
  return history;
}
