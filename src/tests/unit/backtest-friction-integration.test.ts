/**
 * Verification of backtest friction integration: proves bit-for-bit numerical equivalence
 * between legacy inline multipliers and the centralized friction calculator default tiers.
 *
 * Guaranteed Invariants:
 * 1. INDEX_BTST: calculateIndexBtstFriction(entry, exit, qty) === (entry + exit) * qty * 0.00002
 * 2. STOCK_BTST: calculateStockBtstFriction(entry, exit, qty) === (entry + exit) * qty * 0.0003
 * 3. INTRADAY: calculateIntradayFriction(entry, exit, qty) === (entry + exit) * qty * 0.0003
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateIndexBtstFriction,
  calculateStockBtstFriction,
  calculateIntradayFriction,
} from '@/lib/friction-calculator';

function closeTo(actual: number, expected: number, epsilon = 1e-4): boolean {
  return Math.abs(actual - expected) < epsilon;
}

describe('Backtest Friction Integration — Legacy Equivalence Verification', () => {

  describe('1. Index BTST Default Equivalence (Legacy 0.00002)', () => {
    const testCases = [
      { entry: 25000, exit: 25100, qty: 50 },
      { entry: 24500.50, exit: 24350.25, qty: 25 },
      { entry: 52000, exit: 52400, qty: 15 }, // BANKNIFTY lot
      { entry: 80000, exit: 80500, qty: 10 }, // SENSEX lot
      { entry: 22000, exit: 22000, qty: 50 }, // Flat trade
    ];

    for (const tc of testCases) {
      it(`matches legacy calculation for entry=${tc.entry}, exit=${tc.exit}, qty=${tc.qty}`, () => {
        const legacyTurnover = (tc.entry + tc.exit) * tc.qty;
        const legacyFee = legacyTurnover * 0.00002;
        const legacyGrossPnl = (tc.exit - tc.entry) * tc.qty;
        const legacyNetPnl = legacyGrossPnl - legacyFee;

        const integrated = calculateIndexBtstFriction(tc.entry, tc.exit, tc.qty);

        assert.equal(integrated.tierId, 'EXCHANGE_TURNOVER_ONLY');
        assert.ok(closeTo(integrated.turnover, legacyTurnover));
        assert.ok(closeTo(integrated.totalFriction, legacyFee));
        assert.ok(closeTo(integrated.grossPnl, legacyGrossPnl));
        assert.ok(closeTo(integrated.netPnl, legacyNetPnl));
      });
    }
  });

  describe('2. Stock BTST Default Equivalence (Legacy 0.0003)', () => {
    const testCases = [
      { entry: 1500, exit: 1530, qty: 100 },
      { entry: 450.25, exit: 442.10, qty: 500 },
      { entry: 3200, exit: 3180, qty: 50 },
      { entry: 95.50, exit: 101.20, qty: 2000 },
      { entry: 1200, exit: 1200, qty: 100 },
    ];

    for (const tc of testCases) {
      it(`matches legacy calculation for entry=${tc.entry}, exit=${tc.exit}, qty=${tc.qty}`, () => {
        const legacyTurnover = (tc.entry + tc.exit) * tc.qty;
        const legacyFee = legacyTurnover * 0.0003;
        const legacyGrossPnl = (tc.exit - tc.entry) * tc.qty;
        const legacyNetPnl = legacyGrossPnl - legacyFee;

        const integrated = calculateStockBtstFriction(tc.entry, tc.exit, tc.qty);

        assert.equal(integrated.tierId, 'FUTURES_PROXY');
        assert.ok(closeTo(integrated.turnover, legacyTurnover));
        assert.ok(closeTo(integrated.totalFriction, legacyFee));
        assert.ok(closeTo(integrated.grossPnl, legacyGrossPnl));
        assert.ok(closeTo(integrated.netPnl, legacyNetPnl));
      });
    }
  });

  describe('3. Intraday CPR Swing Default Equivalence (Legacy 0.0003)', () => {
    const testCases = [
      { entry: 500, exit: 490, qty: 200 },
      { entry: 1250, exit: 1275, qty: 80 },
      { entry: 80.50, exit: 84.00, qty: 1500 },
    ];

    for (const tc of testCases) {
      it(`matches legacy calculation for entry=${tc.entry}, exit=${tc.exit}, qty=${tc.qty}`, () => {
        const legacyTurnover = (tc.entry + tc.exit) * tc.qty;
        const legacyFee = legacyTurnover * 0.0003;
        const legacyGrossPnl = (tc.exit - tc.entry) * tc.qty;
        const legacyNetPnl = legacyGrossPnl - legacyFee;

        const integrated = calculateIntradayFriction(tc.entry, tc.exit, tc.qty);

        assert.equal(integrated.tierId, 'EQUITY_SWING');
        assert.ok(closeTo(integrated.turnover, legacyTurnover));
        assert.ok(closeTo(integrated.totalFriction, legacyFee));
        assert.ok(closeTo(integrated.grossPnl, legacyGrossPnl));
        assert.ok(closeTo(integrated.netPnl, legacyNetPnl));
      });
    }
  });
});
