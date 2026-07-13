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
    '2026-09-14', // Ganesh Chaturthi
    '2026-10-02', // Mahatma Gandhi Jayanti
    '2026-10-20', // Dussehra
    '2026-11-10', // Diwali-Balipratipada
    '2026-11-24', // Prakash Gurpurb Sri Guru Nanak Dev
    '2026-12-25', // Christmas
  ]
};

/**
 * Returns the current date string (YYYY-MM-DD) in IST.
 * This is used to align candle dates which are keyed by the NSE trading day,
 * avoiding the 5.5 hour mismatch window when UTC date rolls over before IST.
 */
export function getISTDateString(date: Date = new Date()): string {
  const istTime = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return istTime.toISOString().split('T')[0];
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
    hour12: false
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

export function isMarketOpen(date: Date = new Date()): boolean {
  const { totalMinutes, isTradingDay } = getISTTime(date);
  if (!isTradingDay) return false;
  return totalMinutes >= 555 && totalMinutes < 930; // 09:15 to 15:30 IST
}

export function isTodayCandleClosed(date: Date = new Date()): boolean {
  const { isTradingDay, totalMinutes } = getISTTime(date);
  if (!isTradingDay) return false;
  return totalMinutes >= 930; // After 15:30 IST
}
