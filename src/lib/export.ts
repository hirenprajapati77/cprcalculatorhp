import { CalculationRecord } from '@/types/cpr.types';

/**
 * Converts a calculation record into a structured CSV string.
 */
export function exportToCSV(record: Omit<CalculationRecord, 'id' | 'createdAt'> & { createdAt?: Date }): string {
  const dateStr = record.createdAt 
    ? record.createdAt.toLocaleString('en-IN') 
    : new Date().toLocaleString('en-IN');

  const rows = [
    ['Central Pivot Range (CPR) Analysis Report', ''],
    ['Generated At', dateStr],
    ['', ''],
    ['Input Parameters', ''],
    ['Previous High', record.high],
    ['Previous Low', record.low],
    ['Previous Close', record.close],
    ['', ''],
    ['Calculated CPR Levels', ''],
    ['Pivot Point (P)', record.pivot.toFixed(2)],
    ['Top Central (TC)', record.tc.toFixed(2)],
    ['Bottom Central (BC)', record.bc.toFixed(2)],
    ['Width %', `${record.width.toFixed(3)}%`],
    ['Classification', record.classification],
    ['Trend Bias', record.trend],
    ['', ''],
    ['Support Levels', ''],
    ['S1', record.s1.toFixed(2)],
    ['S2', record.s2.toFixed(2)],
    ['S3', record.s3.toFixed(2)],
    ['S4', record.s4.toFixed(2)],
    ['', ''],
    ['Resistance Levels', ''],
    ['R1', record.r1.toFixed(2)],
    ['R2', record.r2.toFixed(2)],
    ['R3', record.r3.toFixed(2)],
    ['R4', record.r4.toFixed(2)],
  ];

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\n');
}
