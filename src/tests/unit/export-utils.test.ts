import test from 'node:test';
import assert from 'node:assert';
import { escapeCsvCell, generateCsvContent } from '../../lib/export-utils';

test('export-utils: escapeCsvCell and generateCsvContent', async (t) => {
  await t.test('handles standard types correctly', () => {
    assert.strictEqual(escapeCsvCell(null), '');
    assert.strictEqual(escapeCsvCell(undefined), '');
    assert.strictEqual(escapeCsvCell(123), '123');
    assert.strictEqual(escapeCsvCell(true), 'true');
    assert.strictEqual(escapeCsvCell(false), 'false');
    assert.strictEqual(escapeCsvCell('RELIANCE'), 'RELIANCE');
  });

  await t.test('preserves legitimate numeric values without single-quote prefix', () => {
    assert.strictEqual(escapeCsvCell(-15.5), '-15.5');
    assert.strictEqual(escapeCsvCell(0), '0');
    assert.strictEqual(escapeCsvCell(100.25), '100.25');
  });

  await t.test('neutralizes CSV formula injection (CWE-1236) on dangerous prefix characters', () => {
    // Starts with = (formula execution)
    assert.strictEqual(escapeCsvCell('=1+1'), "'=1+1");
    assert.strictEqual(escapeCsvCell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");

    // Starts with + or -
    assert.strictEqual(escapeCsvCell('+5.2%'), "'+5.2%");
    assert.strictEqual(escapeCsvCell('-12.4%'), "'-12.4%");

    // Starts with @ (e.g. @SUM)
    assert.strictEqual(escapeCsvCell('@SUM(A1:A10)'), "'@SUM(A1:A10)");

    // Starts with tab or carriage return
    assert.strictEqual(escapeCsvCell('\tmalicious'), "'\tmalicious");
    assert.strictEqual(escapeCsvCell('\rmalicious'), "\"'\rmalicious\"");
  });

  await t.test('properly escapes quotes, commas, and newlines per RFC 4180', () => {
    assert.strictEqual(escapeCsvCell('Hello, World'), '"Hello, World"');
    assert.strictEqual(escapeCsvCell('He said "Hello"'), '"He said ""Hello"""');
    assert.strictEqual(escapeCsvCell('Line1\nLine2'), '"Line1\nLine2"');
  });

  await t.test('generates valid UTF-8 BOM CSV with generateCsvContent', () => {
    const headers = ['Symbol', 'Formula', 'Change', 'LTP'];
    const rows = [
      ['RELIANCE', '=SUM(1,2)', '+2.5%', 2950.5],
      ['TCS', 'Normal text', -1.2, 4100],
    ];

    const csv = generateCsvContent(headers, rows);
    // Starts with UTF-8 BOM
    assert.ok(csv.startsWith('\uFEFF'));

    // Verify row contents: =SUM(1,2) has comma, so it is quoted per RFC 4180
    assert.ok(csv.includes('RELIANCE,"\'=SUM(1,2)",\'+2.5%,2950.5'));
    assert.ok(csv.includes('TCS,Normal text,-1.2,4100'));
  });
});
