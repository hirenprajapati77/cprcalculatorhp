import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeCsvCell,
  generateCsvContent,
} from '@/lib/export-utils';

describe('Export Utilities (CSV & Excel formatting)', () => {
  it('escapes standard numbers and strings without quotes when no special chars exist', () => {
    assert.equal(escapeCsvCell('RELIANCE'), 'RELIANCE');
    assert.equal(escapeCsvCell(2945.5), '2945.5');
    assert.equal(escapeCsvCell(true), 'true');
    assert.equal(escapeCsvCell(null), '');
    assert.equal(escapeCsvCell(undefined), '');
  });

  it('escapes commas, quotes, and newlines properly according to RFC 4180', () => {
    assert.equal(escapeCsvCell('Cup, and Handle'), '"Cup, and Handle"');
    assert.equal(escapeCsvCell('52W "Pivot" Breakout'), '"52W ""Pivot"" Breakout"');
    assert.equal(escapeCsvCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
  });

  it('generates compliant CSV with UTF-8 Byte Order Mark (BOM) for Excel', () => {
    const headers = ['Symbol', 'Price', 'Pattern'];
    const rows = [
      ['TATAMOTORS', 980.5, 'Cup & Handle'],
      ['INFY, TECH', 1850, '52W "ATH" Breakout'],
    ];

    const csv = generateCsvContent(headers, rows);

    // Verify UTF-8 BOM
    assert.ok(csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM (\\uFEFF)');

    // Verify row structure
    assert.ok(csv.includes('Symbol,Price,Pattern'));
    assert.ok(csv.includes('TATAMOTORS,980.5,Cup & Handle'));
    assert.ok(csv.includes('"INFY, TECH",1850,"52W ""ATH"" Breakout"'));
  });
});
