import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exportToCSV } from '@/lib/export';
import type { CalculationRecord } from '@/types/cpr.types';

describe('exportToCSV (Tier 1)', () => {
  const baseRecord: Omit<CalculationRecord, 'id' | 'createdAt'> = {
    high: 105.5,
    low: 95.0,
    close: 100.0,
    pivot: 100.17,
    tc: 102.75,
    bc: 97.58,
    width: 5.16,
    classification: 'NORMAL',
    trend: 'Trending',
    s1: 94.83,
    s2: 89.67,
    s3: 84.33,
    s4: 79.17,
    r1: 105.33,
    r2: 110.67,
    r3: 115.83,
    r4: 121.17,
  };

  it('generates structured CSV with default date when createdAt is missing', () => {
    const csv = exportToCSV(baseRecord);
    assert.ok(csv.includes('Central Pivot Range (CPR) Analysis Report'));
    assert.ok(csv.includes('Generated At'));
    assert.ok(csv.includes('Previous High,105.5'));
    assert.ok(csv.includes('Previous Low,95'));
    assert.ok(csv.includes('Previous Close,100'));
    assert.ok(csv.includes('Pivot Point (P),100.17'));
    assert.ok(csv.includes('Top Central (TC),102.75'));
    assert.ok(csv.includes('Bottom Central (BC),97.58'));
    assert.ok(csv.includes('Classification,NORMAL'));
    assert.ok(csv.includes('Trend Bias,Trending'));
  });

  it('formats custom createdAt timestamp', () => {
    const customDate = new Date('2026-09-08T10:00:00.000Z');
    const csv = exportToCSV({ ...baseRecord, createdAt: customDate });
    assert.ok(csv.includes('Central Pivot Range (CPR) Analysis Report'));
    assert.ok(csv.includes('Width %,5.160%'));
  });

  it('escapes cells containing commas, quotes, or newlines', () => {
    const recordWithSpecialChars = {
      ...baseRecord,
      classification: 'WIDE, "EXTREME"\nRANGE' as any,
    };
    const csv = exportToCSV(recordWithSpecialChars);
    assert.ok(csv.includes('"WIDE, ""EXTREME""\nRANGE"'));
  });
});
