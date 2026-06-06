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
 * Formats a percentage value to 3 decimal places with trailing % symbol.
 */
export function formatPct(n: number): string {
  if (n === undefined || n === null || isNaN(n)) return '—%';
  return `${n.toFixed(3)}%`;
}

/**
 * Formats a date string or Date object into a readable Indian standard format (DD/MM/YYYY HH:MM:SS).
 */
export function formatDate(d: Date | string): string {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return '—';
  
  return dateObj.toLocaleString('en-IN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
