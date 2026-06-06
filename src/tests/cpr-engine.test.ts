import test from 'node:test';
import assert from 'node:assert';
import { calculateCPR } from '../lib/cpr-engine';
import { CPRInputSchema } from '../utils/validate';

test('CPR Engine Calculations', async (t) => {
  await t.test('calculates correct levels with balanced inputs', () => {
    // Input parameters
    const input = { high: 25000, low: 24800, close: 24900 };
    const result = calculateCPR(input);

    // Math check: P = (H + L + C) / 3 => (25000 + 24800 + 24900) / 3 = 24900
    assert.strictEqual(result.pivot, 24900);

    // BC = (H + L) / 2 => (25000 + 24800) / 2 = 24900
    // TC = (P - BC) + P => (24900 - 24900) + 24900 = 24900
    assert.strictEqual(result.bc, 24900);
    assert.strictEqual(result.tc, 24900);

    // Width % = (TC - BC) / P * 100 => 0% (NARROW)
    assert.strictEqual(result.width, 0);
    assert.strictEqual(result.classification, 'NARROW');
    assert.strictEqual(result.trend, 'Trending');

    // R1 = (2 * P) - L => (2 * 24900) - 24800 = 25000
    assert.strictEqual(result.r1, 25000);

    // S1 = (2 * P) - H => (2 * 24900) - 25000 = 24800
    assert.strictEqual(result.s1, 24800);
  });

  await t.test('handles normalization (TC and BC swap) correctly', () => {
    // Inputs where calculated TC < BC: High = 100, Low = 80, Close = 82
    // P = (100 + 80 + 82) / 3 = 262 / 3 = 87.33
    // BC = (100 + 80) / 2 = 90
    // TC_calc = (87.33 - 90) + 87.33 = 84.66
    // Since TC_calc (84.66) < BC (90), TC must swap with BC.
    // So TC_final should be 90, and BC_final should be 84.66.
    const input = { high: 100, low: 80, close: 82 };
    const result = calculateCPR(input);

    assert.ok(result.tc >= result.bc, 'TC must be greater than or equal to BC');
    assert.strictEqual(result.tc, 90);
    assert.strictEqual(Math.round(result.bc * 100) / 100, 84.67);
  });
});

test('CPR Inputs Schema Validation', async (t) => {
  await t.test('succeeds for valid inputs', () => {
    const input = { high: 150.5, low: 145.2, close: 147.8 };
    const parsed = CPRInputSchema.safeParse(input);
    assert.strictEqual(parsed.success, true);
  });

  await t.test('fails when High <= Low', () => {
    const input = { high: 140, low: 140, close: 140 };
    const parsed = CPRInputSchema.safeParse(input);
    assert.strictEqual(parsed.success, false);
    
    if (!parsed.success) {
      const issues = parsed.error.issues;
      const hasHighError = issues.some(
        (issue) => issue.path.includes('high') && issue.message.includes('greater than Low')
      );
      assert.strictEqual(hasHighError, true);
    }
  });

  await t.test('fails when Close is outside range', () => {
    const input = { high: 150, low: 140, close: 155 };
    const parsed = CPRInputSchema.safeParse(input);
    assert.strictEqual(parsed.success, false);

    if (!parsed.success) {
      const issues = parsed.error.issues;
      const hasCloseError = issues.some(
        (issue) => issue.path.includes('close') && issue.message.includes('within High-Low range')
      );
      assert.strictEqual(hasCloseError, true);
    }
  });
});
