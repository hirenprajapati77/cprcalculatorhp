/**
 * Comprehensive unit tests for centralized friction models and calculators.
 *
 * Verifies:
 * 1. Default tiers preserve 100% exact numerical identity with legacy baseline magic numbers.
 * 2. Side-specific statutory levies (STT on sell, stamp duty on buy) are correctly applied.
 * 3. Direction-aware treatment for LONG and SHORT trades.
 * 4. Realistic futures, cash delivery, and option premium itemized breakdowns.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateIndexBtstFriction,
  calculateStockBtstFriction,
  calculateIntradayFriction,
  estimateOptionPremiumFriction,
} from '@/lib/friction-calculator';

function closeTo(actual: number, expected: number, epsilon = 1e-4): boolean {
  return Math.abs(actual - expected) < epsilon;
}

describe('Centralized Friction Calculator — Named Tiers & Statutory Schedules', () => {

  describe('1. Index BTST Tiers & Continuity', () => {
    it('default tier (EXCHANGE_TURNOVER_ONLY) matches legacy 0.00002 baseline identically', () => {
      const entry = 25000;
      const exit = 25100;
      const qty = 50;

      const res = calculateIndexBtstFriction(entry, exit, qty);

      // (25000 + 25100) * 50 * 0.00002 = 50.10
      assert.equal(res.tierId, 'EXCHANGE_TURNOVER_ONLY');
      assert.equal(res.turnover, 2505000);
      assert.equal(res.grossPnl, 5000); // (25100 - 25000) * 50
      assert.equal(res.totalFriction, 50.1);
      assert.equal(res.netPnl, 4949.9);
      assert.equal(res.effectiveBps, 0.2); // 0.2 bps
      assert.equal(res.stt, 0); // Omitted in legacy exchange-only baseline
      assert.equal(res.brokerage, 0);
    });

    it('STATUTORY_FUTURES tier correctly models side-specific statutory levies', () => {
      const entry = 25000;
      const exit = 25100;
      const qty = 50;

      const res = calculateIndexBtstFriction(entry, exit, qty, 'STATUTORY_FUTURES', 'LONG');

      assert.equal(res.tierId, 'STATUTORY_FUTURES');
      // LONG: Buy turnover = 25,000 * 50 = 1,250,000; Sell turnover = 25,100 * 50 = 1,255,000
      // STT on sell leg: 1,255,000 * 0.0005 (0.05%) = ₹627.50
      assert.ok(closeTo(res.stt, 627.50));
      // Stamp duty on buy leg: 1,250,000 * 0.00002 (0.002%) = ₹25.00
      assert.ok(closeTo(res.stampDuty, 25.00));
      // Exchange fee: 2,505,000 * 0.0000173 (0.00173% per leg) = ₹43.34
      assert.ok(closeTo(res.exchangeCharges, 43.34));
      // SEBI fee: 2,505,000 * 0.000001 = ₹2.51
      assert.ok(closeTo(res.sebiCharges, 2.51));
      // Brokerage: ₹20 * 2 = ₹40.00
      assert.equal(res.brokerage, 40.00);
      // GST: 18% on (40.00 + 43.34 + 2.51) = ₹15.45
      assert.ok(closeTo(res.gst, 15.45));

      // Total statutory friction = 627.50 + 25.00 + 43.34 + 2.51 + 40.00 + 15.45 = ₹753.80
      assert.ok(closeTo(res.totalFriction, 753.80, 0.1));
      assert.ok(closeTo(res.netPnl, 5000 - 753.80, 0.1));
      // Effective friction is ~3.0 bps
      assert.ok(res.effectiveBps > 2.9 && res.effectiveBps < 3.1);
    });

    it('STATUTORY_FUTURES tier correctly inverts buy/sell legs for SHORT trades', () => {
      const entry = 25000;
      const exit = 24900;
      const qty = 50;

      // SHORT trade: Entry is SELL (25,000 * 50), Exit is BUY (24,900 * 50)
      const res = calculateIndexBtstFriction(entry, exit, qty, 'STATUTORY_FUTURES', 'SHORT');

      assert.equal(res.grossPnl, 5000); // (25000 - 24900) * 50
      // STT on sell leg (entry): 25,000 * 50 * 0.0005 = ₹625.00
      assert.ok(closeTo(res.stt, 625.00));
      // Stamp duty on buy leg (exit): 24,900 * 50 * 0.00002 = ₹24.90
      assert.ok(closeTo(res.stampDuty, 24.90));
      assert.equal(res.brokerage, 40.00);
      assert.ok(res.totalFriction > 700);
      assert.ok(res.netPnl > 4200 && res.netPnl < 4300);
    });

    it('CONSERVATIVE tier applies 5 bps turnover buffer', () => {
      const entry = 25000;
      const exit = 25100;
      const qty = 50;

      const res = calculateIndexBtstFriction(entry, exit, qty, 'CONSERVATIVE');

      assert.equal(res.tierId, 'CONSERVATIVE');
      // 2,505,000 * 0.0005 = 1252.50
      assert.equal(res.totalFriction, 1252.50);
      assert.equal(res.netPnl, 5000 - 1252.50);
      assert.equal(res.effectiveBps, 5.0);
    });
  });

  describe('2. Stock BTST Tiers & Continuity', () => {
    it('default tier (FUTURES_PROXY) matches existing 0.00030 baseline identically', () => {
      const entry = 1000;
      const exit = 1020;
      const qty = 100;

      const res = calculateStockBtstFriction(entry, exit, qty);

      assert.equal(res.tierId, 'FUTURES_PROXY');
      assert.equal(res.turnover, 202000);
      assert.equal(res.grossPnl, 2000);
      assert.equal(res.totalFriction, 60.6); // 202,000 * 0.0003
      assert.equal(res.netPnl, 1939.4);
      assert.equal(res.effectiveBps, 3.0);
    });

    it('STATUTORY_CASH_DELIVERY tier applies full delivery STT and DP charges', () => {
      const entry = 1000;
      const exit = 1020;
      const qty = 100;

      const res = calculateStockBtstFriction(entry, exit, qty, 'STATUTORY_CASH_DELIVERY', 'LONG');

      assert.equal(res.tierId, 'STATUTORY_CASH_DELIVERY');
      // Delivery STT: 0.1% on buy (100,000 * 0.001 = ₹100) + 0.1% on sell (102,000 * 0.001 = ₹102) = ₹202.00
      assert.ok(closeTo(res.stt, 202.00));
      // Stamp duty on buy: 100,000 * 0.00015 = ₹15.00
      assert.ok(closeTo(res.stampDuty, 15.00));
      // DP charges on sell: ₹15.93
      assert.equal(res.dpCharges, 15.93);
      // Exchange fee: 202,000 * 0.0000297 = ₹6.00
      assert.ok(closeTo(res.exchangeCharges, 6.00, 0.05));

      // Total cash delivery friction is ~₹240 (vs ₹60.60 futures proxy)
      assert.ok(res.totalFriction > 235 && res.totalFriction < 245);
      // Effective friction is ~11.9 bps
      assert.ok(res.effectiveBps > 11.5 && res.effectiveBps < 12.5);
    });
  });

  describe('3. Intraday CPR Swing Continuity', () => {
    it('EQUITY_SWING tier matches existing 0.00030 baseline identically', () => {
      const entry = 500;
      const exit = 490;
      const qty = 200;

      const res = calculateIntradayFriction(entry, exit, qty);

      assert.equal(res.tierId, 'EQUITY_SWING');
      assert.equal(res.turnover, 198000);
      assert.equal(res.grossPnl, -2000);
      assert.equal(res.totalFriction, 59.4);
      assert.equal(res.netPnl, -2059.4);
    });
  });

  describe('4. Option Premium Journal Estimated Charges', () => {
    it('estimates retail option buying charges accurately without mutating gross P&L', () => {
      const entryPremium = 100;
      const exitPremium = 130;
      const lotQty = 50; // 1 lot NIFTY option

      const res = estimateOptionPremiumFriction(entryPremium, exitPremium, lotQty);

      assert.equal(res.tierId, 'RETAIL_STATUTORY');
      // Premium turnover: buy = 5,000, sell = 6,500, total = 11,500
      assert.equal(res.turnover, 11500);
      assert.equal(res.grossPnl, 1500); // (130 - 100) * 50
      // STT on sell premium: 6,500 * 0.001 (0.10%) = ₹6.50
      assert.equal(res.stt, 6.50);
      // Stamp duty on buy premium: 5,000 * 0.00003 = ₹0.15
      assert.equal(res.stampDuty, 0.15);
      // Exchange fee: 11,500 * 0.0005 = ₹5.75
      assert.equal(res.exchangeCharges, 5.75);
      // Brokerage: ₹20 * 2 = ₹40.00
      assert.equal(res.brokerage, 40.00);
      // GST: 18% on (40.00 + 5.75 + 0.01) = ₹8.24
      assert.ok(closeTo(res.gst, 8.24, 0.05));

      // Total option friction: ~₹60.65
      assert.ok(closeTo(res.totalFriction, 60.65, 0.1));
      assert.ok(closeTo(res.netPnl, 1500 - 60.65, 0.1));
    });

    it('verifies that a flat option trade incurs negative net P&L due to statutory drag', () => {
      const entryPremium = 50;
      const exitPremium = 50; // Flat trade
      const lotQty = 50;

      const res = estimateOptionPremiumFriction(entryPremium, exitPremium, lotQty);

      assert.equal(res.grossPnl, 0);
      // Brokerage ₹40 + GST + exchange + STT yields ~₹48 in drag
      assert.ok(res.totalFriction > 45 && res.totalFriction < 55);
      assert.ok(res.netPnl < -45);
    });
  });

  describe('5. Edge Cases & Robustness', () => {
    it('handles zero quantity gracefully', () => {
      const res = calculateIndexBtstFriction(25000, 25100, 0);
      assert.equal(res.turnover, 0);
      assert.equal(res.grossPnl, 0);
      assert.equal(res.totalFriction, 0);
      assert.equal(res.netPnl, 0);
      assert.equal(res.effectiveBps, 0);
    });

    it('handles negative / fractional numbers without NaN', () => {
      const res = calculateStockBtstFriction(100.5, 95.25, 10);
      assert.ok(Number.isFinite(res.grossPnl));
      assert.ok(Number.isFinite(res.totalFriction));
      assert.ok(Number.isFinite(res.netPnl));
      assert.ok(Number.isFinite(res.effectiveBps));
    });
  });
});
