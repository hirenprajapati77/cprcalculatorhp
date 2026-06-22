export function getISTTime(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'long',
    hour12: false
  }).formatToParts(date);
  
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  
  return {
    hour,
    minute,
    weekday,
    totalMinutes: hour * 60 + minute,
    isWeekend: weekday === 'Saturday' || weekday === 'Sunday'
  };
}

export function isMarketOpen(date: Date = new Date()): boolean {
  const { totalMinutes, isWeekend } = getISTTime(date);
  if (isWeekend) return false;
  return totalMinutes >= 555 && totalMinutes < 930; // 09:15 to 15:30 IST
}

export function isTodayCandleClosed(date: Date = new Date()): boolean {
  const { isWeekend, totalMinutes } = getISTTime(date);
  if (isWeekend) return false;
  return totalMinutes >= 930; // After 15:30 IST
}
