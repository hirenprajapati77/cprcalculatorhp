/**
 * Unit tests for non-destructive Trade Journal estimated friction and net P&L.
 *
 * Verifies Step 4 of the P2 Trading-Friction Model:
 * 1. Gross P&L remains 100% untouched and matches stored journal records.
 * 2. Estimated charges are calculated dynamically without mutating stored database fields.
 * 3. Direction-aware behavior:
 *    - Long option / cash legs: exit - entry
 *    - Short cash underlying legs: entry - exit
 * 4. Flat trades incur strictly negative net P&L due to statutory & broker drag.
 * 5. Returns are clearly flagged with isModelEstimate: true.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeJournalPnl,
  computeOptionPnl,
  computeJournalEstimatedFriction,
} from '@/lib/pnl';

function closeTo(actual: number, expected: number, epsilon = 0.02): boolean {
  return Math.abs(actual - expected) < epsilon;
}

describe('Trade Journal Estimated Friction & Net P&L (Step 4 Non-Destructive Layer)', () => {

  describe('1. Gross P&L Baseline Invariants Preserved', () => {
    it('computeJournalPnl returns unchanged gross P&L for long option trades', () => {
      const res = computeJournalPnl(100, 130);
      assert.equal(res.pnl, 30);
      assert.equal(res.pnlPct, 30);
    });

    it('computeJournalPnl returns unchanged direction-aware gross P&L for short underlying', () => {
      const res = computeJournalPnl(1000, 960, { isShortUnderlying: true });
      assert.equal(res.pnl, 40);
      assert.equal(res.pnlPct, 4);
    });

    it('computeOptionPnl delegates to computeJournalPnl identically', () => {
      const res = computeOptionPnl(50, 75);
      assert.equal(res.pnl, 25);
      assert.equal(res.pnlPct, 50);
    });
  });

  describe('2. Option Contract Estimated Friction (RETAIL_STATUTORY)', () => {
    it('computes modeled net P&L on winning NIFTY option trade without modifying gross P&L', () => {
      const entryCmp = 100;
      const exitCmp = 130;
      const res = computeJournalEstimatedFriction({
        entryCmp,
        exitCmp,
        symbol: 'NIFTY',
        optionContract: '26JUL25000CE',
      });

      // 1. Gross invariants intact
      assert.equal(res.grossPnl, 30);
      assert.equal(res.grossPnlPct, 30);

      // 2. Model estimate flags
      assert.equal(res.isModelEstimate, true);
      assert.equal(res.tierId, 'RETAIL_STATUTORY');
      assert.equal(res.lotSize, 65); // NIFTY lot size

      // 3. Estimated charges
      assert.ok(res.estimatedChargesTotal > 0);
      assert.ok(res.estimatedChargesPerUnit > 0);
      assert.ok(closeTo(res.estimatedChargesPerUnit, res.estimatedChargesTotal / res.lotSize));

      // 4. Net P&L = Gross - Charges
      assert.ok(closeTo(res.estimatedNetPnl, res.grossPnl - res.estimatedChargesPerUnit));
      assert.ok(res.estimatedNetPnl < res.grossPnl);
      assert.ok(res.estimatedNetPnl > 28); // ~₹28.80
      assert.ok(res.estimatedNetPnlPct > 28 && res.estimatedNetPnlPct < 30);
    });

    it('computes modeled net P&L on losing option trade (loss expands due to friction)', () => {
      const entryCmp = 100;
      const exitCmp = 80;
      const res = computeJournalEstimatedFriction({
        entryCmp,
        exitCmp,
        symbol: 'BANKNIFTY',
        optionContract: '26JUL52000PE',
      });

      assert.equal(res.grossPnl, -20);
      assert.equal(res.grossPnlPct, -20);
      assert.equal(res.lotSize, 30); // BANKNIFTY lot size

      // Net loss is strictly worse than gross loss
      assert.ok(res.estimatedNetPnl < res.grossPnl);
      assert.ok(res.estimatedNetPnlPct < -20);
    });

    it('proves flat option trade incurs strictly negative net P&L due to statutory & broker drag', () => {
      const entryCmp = 100;
      const exitCmp = 100; // Zero gross gain
      const res = computeJournalEstimatedFriction({
        entryCmp,
        exitCmp,
        symbol: 'NIFTY',
        optionContract: '26JUL25000CE',
      });

      assert.equal(res.grossPnl, 0);
      assert.equal(res.grossPnlPct, 0);
      assert.ok(res.estimatedChargesPerUnit > 0);
      assert.ok(res.estimatedNetPnl < 0);
      assert.ok(res.estimatedNetPnlPct < 0);
    });
  });

  describe('3. Cash Underlying Leg Estimated Friction (UNDERLYING CE / PE)', () => {
    it('models long cash underlying leg correctly', () => {
      const res = computeJournalEstimatedFriction({
        entryCmp: 1000,
        exitCmp: 1030,
        symbol: 'RELIANCE',
        optionContract: 'UNDERLYING CE',
        isShortUnderlying: false,
      });

      assert.equal(res.grossPnl, 30);
      assert.equal(res.grossPnlPct, 3);
      assert.equal(res.tierId, 'FUTURES_PROXY');
      assert.ok(res.estimatedChargesPerUnit > 0);
      assert.ok(res.estimatedNetPnl < 30 && res.estimatedNetPnl > 29);
      assert.ok(closeTo(res.estimatedNetPnl, res.grossPnl - res.estimatedChargesPerUnit));
    });

    it('models short cash underlying leg (STBT) with direction-aware profit', () => {
      // Stock fell from 1000 to 960 -> Short profit of +40
      const res = computeJournalEstimatedFriction({
        entryCmp: 1000,
        exitCmp: 960,
        symbol: 'SBIN',
        optionContract: 'UNDERLYING PE',
        isShortUnderlying: true,
      });

      assert.equal(res.grossPnl, 40);
      assert.equal(res.grossPnlPct, 4);
      assert.equal(res.tierId, 'FUTURES_PROXY');
      assert.ok(res.estimatedChargesPerUnit > 0);
      assert.ok(res.estimatedNetPnl > 39 && res.estimatedNetPnl < 40);
      assert.ok(closeTo(res.estimatedNetPnl, 40 - res.estimatedChargesPerUnit));
    });

    it('models short cash underlying leg (STBT) with direction-aware loss', () => {
      // Stock rose from 1000 to 1040 against short -> Loss of -40
      const res = computeJournalEstimatedFriction({
        entryCmp: 1000,
        exitCmp: 1040,
        symbol: 'SBIN',
        optionContract: 'UNDERLYING PE',
        isShortUnderlying: true,
      });

      assert.equal(res.grossPnl, -40);
      assert.equal(res.grossPnlPct, -4);
      assert.ok(res.estimatedNetPnl < -40);
    });
  });

  describe('4. Robustness & Fallback Handling', () => {
    it('handles unknown symbols with safe default lot size', () => {
      const res = computeJournalEstimatedFriction({
        entryCmp: 50,
        exitCmp: 60,
        symbol: 'UNKNOWN_EQUITY',
        optionContract: '26JUL50CE',
      });

      assert.equal(res.grossPnl, 10);
      assert.equal(res.lotSize, 1); // Safe fallback
      assert.ok(Number.isFinite(res.estimatedNetPnl));
      assert.ok(Number.isFinite(res.estimatedNetPnlPct));
    });

    it('handles custom lotSize override when supplied', () => {
      const res = computeJournalEstimatedFriction({
        entryCmp: 100,
        exitCmp: 120,
        symbol: 'NIFTY',
        optionContract: '26JUL25000CE',
        lotSize: 100, // Custom override
      });

      assert.equal(res.lotSize, 100);
      assert.equal(res.grossPnl, 20);
    });

    it('handles zero or degenerate price gracefully without NaN', () => {
      const res = computeJournalEstimatedFriction({
        entryCmp: 0,
        exitCmp: 0,
        symbol: 'NIFTY',
        optionContract: '26JUL25000CE',
      });

      assert.equal(res.grossPnl, 0);
      assert.equal(res.grossPnlPct, 0);
      assert.ok(Number.isFinite(res.estimatedNetPnl));
      assert.ok(Number.isFinite(res.estimatedNetPnlPct));
    });
  });
});
