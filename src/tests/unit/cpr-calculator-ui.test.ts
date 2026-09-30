import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CPRInputSchema } from '@/utils/validate';
import type { CPRClassification, CPRResult } from '@/types/cpr.types';
import type { DrawerStockData } from '@/components/enterprise/StockDetailDrawer';

describe('Multi-Timeframe CPR Calculator Presentation & Invariants (Phase 7)', () => {
  it('validates CPR formula invariants and width percentage derivation', () => {
    const high = 25150.0;
    const low = 24920.0;
    const close = 25080.0;

    const pivot = Number(((high + low + close) / 3).toFixed(2));
    const bc = Number(((high + low) / 2).toFixed(2));
    const tc = Number(((pivot - bc) + pivot).toFixed(2));

    // Verify mathematical invariants
    assert.equal(pivot, 25050.0);
    assert.equal(bc, 25035.0);
    assert.equal(tc, 25065.0);

    const width = Math.abs(tc - bc) / pivot * 100;
    assert.ok(width > 0);
    assert.ok(width < 0.5); // Should be Narrow

    const classification: CPRClassification = width < 0.5 ? 'NARROW' : width > 1.0 ? 'WIDE' : 'NORMAL';
    assert.equal(classification, 'NARROW');
  });

  it('validates directional positioning logic relative to CPR bands', () => {
    const tc = 25065.0;
    const bc = 25035.0;

    const getPositioning = (c: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
      const upper = Math.max(tc, bc);
      const lower = Math.min(tc, bc);
      if (c > upper) return 'BULLISH';
      if (c < lower) return 'BEARISH';
      return 'NEUTRAL';
    };

    assert.equal(getPositioning(25080.0), 'BULLISH'); // Above TC
    assert.equal(getPositioning(25020.0), 'BEARISH'); // Below BC
    assert.equal(getPositioning(25050.0), 'NEUTRAL'); // Inside band
  });

  it('validates 11-level hierarchy sorting and distance from close', () => {
    const levels: CPRResult = {
      pivot: 25050.0,
      bc: 25035.0,
      tc: 25065.0,
      r1: 25180.0,
      r2: 25280.0,
      r3: 25410.0,
      r4: 25540.0,
      s1: 24950.0,
      s2: 24820.0,
      s3: 24690.0,
      s4: 24560.0,
      width: 0.12,
      classification: 'NARROW',
      trend: 'Trending',
    };

    const orderedPrices = [
      levels.r4,
      levels.r3,
      levels.r2,
      levels.r1,
      Math.max(levels.tc, levels.bc),
      levels.pivot,
      Math.min(levels.tc, levels.bc),
      levels.s1,
      levels.s2,
      levels.s3,
      levels.s4,
    ];

    // Every level must be strictly decreasing from R4 to S4
    for (let i = 0; i < orderedPrices.length - 1; i++) {
      assert.ok(
        orderedPrices[i]! >= orderedPrices[i + 1]!,
        `Level price at index ${i} (${orderedPrices[i]}) must be >= next level (${orderedPrices[i + 1]})`
      );
    }

    // Distance calculation relative to reference Close
    const close = 25080.0;
    const r1Distance = levels.r1 - close;
    const r1DistancePct = (r1Distance / close) * 100;
    assert.equal(r1Distance, 100.0);
    assert.equal(Number(r1DistancePct.toFixed(2)), 0.40);
  });

  it('validates Multi-Timeframe Confluence detection logic', () => {
    const weeklyS1 = 24800.0;
    const monthlyS1 = 24820.0; // within 0.5% (20 / 24820 = 0.08%)

    const isAligned = Math.abs(weeklyS1 - monthlyS1) / monthlyS1 < 0.005;
    assert.equal(isAligned, true);

    const nonAlignedWeeklyR1 = 25500.0;
    const nonAlignedMonthlyR1 = 26000.0; // 500 / 26000 = 1.92% (not within 0.5%)
    const isR1Aligned = Math.abs(nonAlignedWeeklyR1 - nonAlignedMonthlyR1) / nonAlignedMonthlyR1 < 0.005;
    assert.equal(isR1Aligned, false);
  });

  it('validates CPRInputSchema validation bounds', () => {
    // Valid inputs
    const valid = CPRInputSchema.safeParse({
      symbol: 'RELIANCE',
      high: 2980.0,
      low: 2910.0,
      close: 2935.0,
    });
    assert.equal(valid.success, true);

    // Invalid: High <= Low
    const invalidHighLow = CPRInputSchema.safeParse({
      high: 2900.0,
      low: 2950.0,
      close: 2920.0,
    });
    assert.equal(invalidHighLow.success, false);

    // Invalid: Close outside High-Low range
    const invalidClose = CPRInputSchema.safeParse({
      high: 3000.0,
      low: 2900.0,
      close: 3050.0,
    });
    assert.equal(invalidClose.success, false);
  });

  it('validates DrawerStockData adaptation from calculator state', () => {
    const symbol = 'INFY';
    const close = 1850.0;
    const levels: CPRResult = {
      pivot: 1840.0,
      tc: 1845.0,
      bc: 1835.0,
      r1: 1860.0,
      r2: 1875.0,
      r3: 1890.0,
      r4: 1905.0,
      s1: 1825.0,
      s2: 1810.0,
      s3: 1795.0,
      s4: 1780.0,
      width: 0.54,
      classification: 'NORMAL',
      trend: 'Trending',
    };

    const isBullish = close > levels.tc;
    const drawerStock: DrawerStockData = {
      symbol,
      ltp: close,
      high: 1855.0,
      low: 1830.0,
      close,
      pivot: levels.pivot,
      tc: levels.tc,
      bc: levels.bc,
      r1: levels.r1,
      r2: levels.r2,
      r3: levels.r3,
      r4: levels.r4,
      s1: levels.s1,
      s2: levels.s2,
      s3: levels.s3,
      s4: levels.s4,
      width: levels.width,
      classification: levels.classification,
      direction: isBullish ? 'LONG' : 'SHORT',
      entry: isBullish ? levels.tc : levels.bc,
      target: isBullish ? levels.r1 : levels.s1,
      sl: isBullish ? levels.bc : levels.tc,
    };

    assert.equal(drawerStock.symbol, 'INFY');
    assert.equal(drawerStock.direction, 'LONG');
    assert.equal(drawerStock.entry, 1845.0);
    assert.equal(drawerStock.target, 1860.0);
    assert.equal(drawerStock.sl, 1835.0);
  });
});
