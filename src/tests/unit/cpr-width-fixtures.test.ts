import test from 'node:test';
import assert from 'node:assert';
import { calculateCPR, classifyCprWidth, calculateAtrCompressionRatio } from '../../lib/cpr-engine';

/**
 * M-1 CPR Width Golden Fixtures
 * Locks deterministic CPR width classification into NARROW / NORMAL / WIDE categories
 * across tight compression, mid-band, expansion, and boundary thresholds for both
 * ATR-aware and fixed-% fallback paths.
 *
 * Contract:
 * - Fixed fallback (atrPct omitted): NARROW < 0.30%, NORMAL < 0.80%, WIDE >= 0.80%
 * - ATR-aware (atrPct passed): NARROW < 0.15 * ATR%, NORMAL < 0.40 * ATR%, WIDE >= 0.40 * ATR%
 */
test('M-1 CPR Width Golden Fixtures — classifyCprWidth pure classification', async (t) => {
  await t.test('Fixed-% fallback thresholds (atrPct undefined)', () => {
    // Tight compression (< 0.30%)
    assert.strictEqual(classifyCprWidth(0.00), 'NARROW');
    assert.strictEqual(classifyCprWidth(0.12), 'NARROW');
    assert.strictEqual(classifyCprWidth(0.25), 'NARROW');
    assert.strictEqual(classifyCprWidth(0.2999), 'NARROW');

    // Threshold boundary at 0.30%
    assert.strictEqual(classifyCprWidth(0.30), 'NORMAL');
    assert.strictEqual(classifyCprWidth(0.3001), 'NORMAL');

    // Mid-band (0.30% <= width < 0.80%)
    assert.strictEqual(classifyCprWidth(0.45), 'NORMAL');
    assert.strictEqual(classifyCprWidth(0.60), 'NORMAL');
    assert.strictEqual(classifyCprWidth(0.7999), 'NORMAL');

    // Threshold boundary at 0.80%
    assert.strictEqual(classifyCprWidth(0.80), 'WIDE');
    assert.strictEqual(classifyCprWidth(0.8001), 'WIDE');

    // Expansion (>= 0.80%)
    assert.strictEqual(classifyCprWidth(1.20), 'WIDE');
    assert.strictEqual(classifyCprWidth(2.50), 'WIDE');
    assert.strictEqual(classifyCprWidth(5.00), 'WIDE');
  });

  await t.test('ATR-aware scaling — Standard 2% ATR baseline (atrPct = 0.02)', () => {
    // For 2% ATR: narrowThresh = 0.15 * 0.02 * 100 = 0.30%, normalThresh = 0.40 * 0.02 * 100 = 0.80%
    const atr2Pct = 0.02;

    assert.strictEqual(classifyCprWidth(0.15, atr2Pct), 'NARROW');
    assert.strictEqual(classifyCprWidth(0.299, atr2Pct), 'NARROW');
    assert.strictEqual(classifyCprWidth(0.30, atr2Pct), 'NORMAL');
    assert.strictEqual(classifyCprWidth(0.55, atr2Pct), 'NORMAL');
    assert.strictEqual(classifyCprWidth(0.799, atr2Pct), 'NORMAL');
    assert.strictEqual(classifyCprWidth(0.80, atr2Pct), 'WIDE');
    assert.strictEqual(classifyCprWidth(1.40, atr2Pct), 'WIDE');
  });

  await t.test('ATR-aware scaling — Low volatility 1.5% ATR regime (atrPct = 0.015)', () => {
    // For 1.5% ATR: narrowThresh = 0.15 * 1.5 = 0.225%, normalThresh = 0.40 * 1.5 = 0.600%
    const atr1_5Pct = 0.015;

    // Below 0.225%
    assert.strictEqual(classifyCprWidth(0.10, atr1_5Pct), 'NARROW');
    assert.strictEqual(classifyCprWidth(0.224, atr1_5Pct), 'NARROW');

    // Boundaries & Mid-band: 0.25% would be NARROW under 0.3% fallback, but is NORMAL under 1.5% ATR
    assert.strictEqual(classifyCprWidth(0.225, atr1_5Pct), 'NORMAL');
    assert.strictEqual(classifyCprWidth(0.25, atr1_5Pct), 'NORMAL');
    assert.strictEqual(classifyCprWidth(0.50, atr1_5Pct), 'NORMAL');
    assert.strictEqual(classifyCprWidth(0.599, atr1_5Pct), 'NORMAL');

    // Boundaries & Expansion: 0.65% would be NORMAL under 0.8% fallback, but is WIDE under 1.5% ATR
    assert.strictEqual(classifyCprWidth(0.60, atr1_5Pct), 'WIDE');
    assert.strictEqual(classifyCprWidth(0.65, atr1_5Pct), 'WIDE');
    assert.strictEqual(classifyCprWidth(1.10, atr1_5Pct), 'WIDE');
  });

  await t.test('ATR-aware scaling — High volatility 3.0% ATR regime (atrPct = 0.03)', () => {
    // For 3.0% ATR: narrowThresh = 0.15 * 3.0 = 0.45%, normalThresh = 0.40 * 3.0 = 1.20%
    const atr3Pct = 0.03;

    // 0.35% is NORMAL under 0.3% fallback, but qualifies as NARROW under 3.0% ATR regime
    assert.strictEqual(classifyCprWidth(0.20, atr3Pct), 'NARROW');
    assert.strictEqual(classifyCprWidth(0.35, atr3Pct), 'NARROW');
    assert.strictEqual(classifyCprWidth(0.449, atr3Pct), 'NARROW');

    // Boundaries & Mid-band: 0.85% is WIDE under 0.8% fallback, but is NORMAL under 3.0% ATR regime
    assert.strictEqual(classifyCprWidth(0.45, atr3Pct), 'NORMAL');
    assert.strictEqual(classifyCprWidth(0.85, atr3Pct), 'NORMAL');
    assert.strictEqual(classifyCprWidth(1.199, atr3Pct), 'NORMAL');

    // Expansion
    assert.strictEqual(classifyCprWidth(1.20, atr3Pct), 'WIDE');
    assert.strictEqual(classifyCprWidth(1.50, atr3Pct), 'WIDE');
  });
});

test('M-1 CPR Width Golden Fixtures — calculateCPR end-to-end OHLC scenarios', async (t) => {
  await t.test('Case 1: Tight compression fixture (NARROW -> Trending)', () => {
    // Symmetrical tight candle: H=1000.5, L=999.5, C=1000.2
    // Pivot = 3000.2 / 3 = 1000.0667, BC = 1000.0, TC = 1000.1333
    // width = (1000.1333 - 1000.0) / 1000.0667 * 100 ≈ 0.0133%
    const cpr = calculateCPR({ high: 1000.5, low: 999.5, close: 1000.2 });

    assert.strictEqual(cpr.classification, 'NARROW');
    assert.strictEqual(cpr.trend, 'Trending');
    assert.ok(cpr.width < 0.30, `Width ${cpr.width}% should be < 0.30%`);
    assert.strictEqual(cpr.width.toFixed(4), '0.0133');
  });

  await t.test('Case 2: Zero width fixture (NARROW -> Trending)', () => {
    // Symmetrical candle where Close == (High + Low)/2
    const cpr = calculateCPR({ high: 25000, low: 24800, close: 24900 });

    assert.strictEqual(cpr.classification, 'NARROW');
    assert.strictEqual(cpr.trend, 'Trending');
    assert.strictEqual(cpr.width, 0);
  });

  await t.test('Case 3: Mid-band fixture (NORMAL -> Balanced)', () => {
    // H=1010, L=990, C=1007.5
    // Pivot = 3007.5 / 3 = 1002.5, BC = 1000, TC = 1005
    // width = 5 / 1002.5 * 100 ≈ 0.4988%
    const cpr = calculateCPR({ high: 1010, low: 990, close: 1007.5 });

    assert.strictEqual(cpr.classification, 'NORMAL');
    assert.strictEqual(cpr.trend, 'Balanced');
    assert.ok(cpr.width >= 0.30 && cpr.width < 0.80, `Width ${cpr.width}% should be between 0.30% and 0.80%`);
    assert.strictEqual(cpr.width.toFixed(4), '0.4988');
  });

  await t.test('Case 4: Expansion fixture (WIDE -> Ranging)', () => {
    // H=1020, L=980, C=1018
    // Pivot = 3018 / 3 = 1006, BC = 1000, TC = 1012
    // width = 12 / 1006 * 100 ≈ 1.1928%
    const cpr = calculateCPR({ high: 1020, low: 980, close: 1018 });

    assert.strictEqual(cpr.classification, 'WIDE');
    assert.strictEqual(cpr.trend, 'Ranging');
    assert.ok(cpr.width >= 0.80, `Width ${cpr.width}% should be >= 0.80%`);
    assert.strictEqual(cpr.width.toFixed(4), '1.1928');
  });

  await t.test('Case 5: calculateCPR with explicit ATR scaling', () => {
    // Same candle as Case 3: width ≈ 0.4988%
    // Under fixed fallback: NORMAL
    // Under ATR 4% (atrPct = 0.04): narrowThresh = 0.15 * 4 = 0.60% -> becomes NARROW!
    const cprWideAtr = calculateCPR({ high: 1010, low: 990, close: 1007.5 }, 0.04);
    assert.strictEqual(cprWideAtr.classification, 'NARROW');
    assert.strictEqual(cprWideAtr.trend, 'Trending');

    // Under ATR 1% (atrPct = 0.01): normalThresh = 0.40 * 1 = 0.40% -> becomes WIDE!
    const cprNarrowAtr = calculateCPR({ high: 1010, low: 990, close: 1007.5 }, 0.01);
    assert.strictEqual(cprNarrowAtr.classification, 'WIDE');
    assert.strictEqual(cprNarrowAtr.trend, 'Ranging');
  });
});

test('M-1 CPR Width Golden Fixtures — calculateAtrCompressionRatio', async (t) => {
  await t.test('compression ratio math and guards', () => {
    // undefined or 0 atrPct returns undefined
    assert.strictEqual(calculateAtrCompressionRatio(0.3, undefined), undefined);
    assert.strictEqual(calculateAtrCompressionRatio(0.3, 0), undefined);

    // widthPct = 0.3%, atrPct = 0.02 (2.0% ATR) -> ratio = 0.3 / 2.0 = 0.15
    const ratio1 = calculateAtrCompressionRatio(0.3, 0.02);
    assert.ok(ratio1 !== undefined);
    assert.strictEqual(Number(ratio1.toFixed(4)), 0.15);

    // widthPct = 0.15%, atrPct = 0.02 (2.0% ATR) -> ratio = 0.15 / 2.0 = 0.075 (< 0.15 narrow compression)
    const ratioNarrow = calculateAtrCompressionRatio(0.15, 0.02);
    assert.ok(ratioNarrow !== undefined);
    assert.strictEqual(Number(ratioNarrow.toFixed(4)), 0.075);
    assert.ok(ratioNarrow < 0.15, 'Compression ratio should be < 0.15 for narrow compression');

    // widthPct = 0.8%, atrPct = 0.02 (2.0% ATR) -> ratio = 0.8 / 2.0 = 0.40
    const ratioWide = calculateAtrCompressionRatio(0.8, 0.02);
    assert.ok(ratioWide !== undefined);
    assert.strictEqual(Number(ratioWide.toFixed(4)), 0.40);
  });
});
