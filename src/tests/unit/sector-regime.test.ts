import test from 'node:test';
import assert from 'node:assert';
import { SectorRegimeService } from '../../services/sector-regime.service';

type Row = { sector: string; signals: string[] };

function stock(sector: string, signals: string[]): Row {
  return { sector, signals: [...signals] };
}

test('SectorRegimeService.applySectorDivergence', async (t) => {
  await t.test('tags BULLISH stock when sector is net-bearish with enough sample', () => {
    const rows = [
      stock('Banking', ['BULLISH']),
      stock('Banking', ['BEARISH']),
      stock('Banking', ['BEARISH']),
    ];
    SectorRegimeService.applySectorDivergence(rows);
    assert.ok(rows[0].signals.includes('SECTOR_DIVERGENCE'), 'bullish stock in net-bearish sector must be tagged');
    assert.ok(!rows[1].signals.includes('SECTOR_DIVERGENCE'), 'bearish stocks are never tagged');
  });

  await t.test('does NOT tag on a bull/bear tie (strict > required)', () => {
    const rows = [
      stock('IT', ['BULLISH']),
      stock('IT', ['BULLISH']),
      stock('IT', ['BEARISH']),
      stock('IT', ['BEARISH']),
    ];
    SectorRegimeService.applySectorDivergence(rows);
    assert.ok(
      rows.every((r) => !r.signals.includes('SECTOR_DIVERGENCE')),
      'a 2-bull / 2-bear tie is not net-bearish and must not tag'
    );
  });

  await t.test('does NOT tag when sector sample is below minimum (3)', () => {
    const rows = [
      stock('Telecom', ['BULLISH']),
      stock('Telecom', ['BEARISH']),
    ];
    SectorRegimeService.applySectorDivergence(rows);
    assert.ok(
      rows.every((r) => !r.signals.includes('SECTOR_DIVERGENCE')),
      'thin sectors (sample < 3) must be ignored'
    );
  });

  await t.test('ignores fallback buckets Other / Unknown / empty sector', () => {
    for (const bucket of ['Other', 'Unknown', '']) {
      const rows = [
        stock(bucket, ['BULLISH']),
        stock(bucket, ['BEARISH']),
        stock(bucket, ['BEARISH']),
        stock(bucket, ['BEARISH']),
      ];
      SectorRegimeService.applySectorDivergence(rows);
      assert.ok(
        rows.every((r) => !r.signals.includes('SECTOR_DIVERGENCE')),
        `fallback bucket "${bucket}" groups unrelated stocks and must never produce divergence tags`
      );
    }
  });

  await t.test('neutral stocks do not count toward the sector sample', () => {
    // 1 bull + 2 bears = sample 3 (qualifies); the 5 neutral rows are noise.
    const rows = [
      stock('Auto', ['BULLISH']),
      stock('Auto', ['BEARISH']),
      stock('Auto', ['BEARISH']),
      stock('Auto', ['NORMAL']),
      stock('Auto', ['NORMAL']),
      stock('Auto', []),
      stock('Auto', []),
      stock('Auto', []),
    ];
    SectorRegimeService.applySectorDivergence(rows);
    assert.ok(rows[0].signals.includes('SECTOR_DIVERGENCE'), 'bull/bear counts alone decide the regime');
  });

  await t.test('sectors are judged independently', () => {
    const rows = [
      stock('Banking', ['BULLISH']),
      stock('Banking', ['BEARISH']),
      stock('Banking', ['BEARISH']),
      stock('Pharma', ['BULLISH']),
      stock('Pharma', ['BULLISH']),
      stock('Pharma', ['BEARISH']),
    ];
    SectorRegimeService.applySectorDivergence(rows);
    assert.ok(rows[0].signals.includes('SECTOR_DIVERGENCE'), 'Banking is net-bearish');
    assert.ok(!rows[3].signals.includes('SECTOR_DIVERGENCE'), 'Pharma is net-bullish, no tag');
  });
});
