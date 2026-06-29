/**
 * Formats a number to 2 decimal places with local numbering style (en-IN).
 */
export function fmt(n: number): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return parseFloat(n.toFixed(2)).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats a number as INR currency (₹) with en-IN local style.
 */
export function fmtINR(n: number): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return `₹${fmt(n)}`;
}

/**
 * Formats a percentage value to 3 decimal places with trailing % symbol.
 */
export function formatPct(n: number): string {
  if (n === undefined || n === null || isNaN(n)) return '—%';
  return `${n.toFixed(3)}%`;
}

/**
 * Formats a date string or Date object into a readable Indian standard format (DD/MM/YYYY HH:MM:SS) using manual UTC offset.
 */
export function formatIST(
  d: Date | string | number | null | undefined,
  options: {
    includeTime?: boolean;
    timeOnly?: boolean;
    dateOnly?: boolean;
    shortTime?: boolean;
  } = {}
): string {
  try {
    if (d === undefined || d === null) return '—';
    const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return '—';

    // Shift UTC time by +5.5 hours (330 minutes) to get IST
    const istTime = new Date(dateObj.getTime() + 330 * 60 * 1000);

    const day = String(istTime.getUTCDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthStr = months[istTime.getUTCMonth()];
    const year = istTime.getUTCFullYear();

    const hours = String(istTime.getUTCHours()).padStart(2, '0');
    const minutes = String(istTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istTime.getUTCSeconds()).padStart(2, '0');

    if (options.timeOnly) {
      return `${hours}:${minutes}:${seconds}`;
    }
    if (options.shortTime) {
      return `${hours}:${minutes}`;
    }
    if (options.dateOnly) {
      return `${day} ${monthStr} ${year}`;
    }
    if (options.includeTime) {
      return `${day} ${monthStr} ${year}, ${hours}:${minutes}:${seconds}`;
    }
    return `${day} ${monthStr}`;
  } catch (err) {
    console.error('Error formatting IST date:', err);
    return '—';
  }
}

export function formatDate(d: Date | string): string {
  return formatIST(d, { includeTime: true });
}
