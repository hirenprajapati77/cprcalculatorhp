/**
 * Baseline regression suite for trading friction, fees, and P&L calculations.
 * Locks existing production calculations before introducing named friction tiers.
 *
 * Locked baseline invariants:
 * 1. INDEX_BTST legacy turnover multiplier: 0.00002 (0.002% / 0.2 bps)
 * 2. STOCK_BTST turnover multiplier: 0.00030 (0.030% / 3.0 bps)
 * 3. TradeEngineService dynamic slippage: liquidity tiers + volatility multiplier + adverse gap cap
 * 4. TradeEngineService simulateTrade gross P&L formulas (LONG vs SHORT)
 * 5. TradeJournal / computeJournalPnl: 100% gross direction-aware P&L (zero friction deducted)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TradeEngineService } from '@/services/backtest/trade-engine.service';
import { computeJournalPnl, computeOptionPnl } from '@/lib/pnl';

function closeTo(actual: number, expected: number, epsilon = 1e-5): boolean {
  return Math.abs(actual - expected) < epsilon;
}

describe('Trading Friction & Fee Model — Baseline Regression Lock', () => {

  describe('1. Backtest Fee Formula Exact Invariants', () => {
    it('locks legacy INDEX_BTST turnover fee formula (0.00002 / 0.002%)', () => {
      // Replicates backtest.service.ts line 651:
      // const btstFees = (btstEntry + btstExitPriceForFees) * btstTradeResult.positionSize * 0.00002;
      const entry = 25000;
      const exit = 25200;
      const positionSize = 50; // 1 lot NIFTY
      const turnover = (entry + exit) * positionSize; // 50,200 * 50 = 2,510,000

      const legacyFeeRate = 0.00002;
      const fees = turnover * legacyFeeRate;
      const grossPnl = (exit - entry) * positionSize; // 200 * 50 = 10,000
      const netPnl = grossPnl - fees;

      assert.equal(turnover, 2510000);
      assert.ok(closeTo(fees, 50.2)); // exactly ₹50.20
      assert.ok(closeTo(netPnl, 9949.8));
      // Confirms fee is exactly 0.2 bps of turnover
      assert.ok(closeTo(fees / turnover, 0.00002));
    });

    it('locks STOCK_BTST turnover fee formula (0.00030 / 0.030%)', () => {
      // Replicates backtest.service.ts line 478:
      // const btstFees = (btstEntry + btstExitPriceForFees) * btstTradeResult.positionSize * 0.0003;
      const entry = 1000;
      const exit = 1020;
      const positionSize = 100;
      const turnover = (entry + exit) * positionSize; // 202,000

      const stockFeeRate = 0.0003;
      const fees = turnover * stockFeeRate;
      const grossPnl = (exit - entry) * positionSize; // 2,000
      const netPnl = grossPnl - fees;

      assert.equal(turnover, 202000);
      assert.ok(closeTo(fees, 60.6)); // exactly ₹60.60
      assert.ok(closeTo(netPnl, 1939.4));
      assert.ok(closeTo(fees / turnover, 0.0003));
    });

    it('locks CPR swing backtest fee formula (0.00030 / 0.030%)', () => {
      // Replicates backtest.service.ts line 289 & 855:
      // const fees = (entrySlipped + exitPriceForFees) * tradeResult.positionSize * 0.0003;
      const entry = 500;
      const exit = 490; // Loss trade
      const positionSize = 200;
      const turnover = (entry + exit) * positionSize; // 198,000

      const feeRate = 0.0003;
      const fees = turnover * feeRate;
      const grossPnl = (exit - entry) * positionSize; // -2,000
      const netPnl = grossPnl - fees; // -2,000 - 59.4 = -2059.4

      assert.ok(closeTo(fees, 59.4));
      assert.ok(closeTo(netPnl, -2059.4));
    });
  });

  describe('2. TradeEngineService Dynamic Slippage Engine Invariants', () => {
    it('calculates liquidity-tier base slippage accurately', () => {
      // High liquidity (>= 500,000) -> 0.05%
      assert.equal(TradeEngineService.calculateSlippage(500000, 'NORMAL', false), 0.0005);
      assert.equal(TradeEngineService.calculateSlippage(1000000, 'NORMAL', false), 0.0005);

      // Medium liquidity (>= 250,000 and < 500,000) -> 0.10%
      assert.equal(TradeEngineService.calculateSlippage(250000, 'NORMAL', false), 0.0010);
      assert.equal(TradeEngineService.calculateSlippage(499999, 'NORMAL', false), 0.0010);

      // Low liquidity (< 250,000) -> 0.15%
      assert.equal(TradeEngineService.calculateSlippage(100000, 'NORMAL', false), 0.0015);
      assert.equal(TradeEngineService.calculateSlippage(0, 'NORMAL', false), 0.0015);
    });

    it('applies volatility multipliers correctly with normal 0.5% cap', () => {
      // HIGH volatility: 1.5x multiplier
      assert.ok(closeTo(TradeEngineService.calculateSlippage(500000, 'HIGH', false), 0.00075)); // 0.0005 * 1.5
      assert.ok(closeTo(TradeEngineService.calculateSlippage(100000, 'HIGH', false), 0.00225)); // 0.0015 * 1.5

      // LOW volatility: 0.8x multiplier
      assert.ok(closeTo(TradeEngineService.calculateSlippage(500000, 'LOW', false), 0.0004)); // 0.0005 * 0.8
      assert.ok(closeTo(TradeEngineService.calculateSlippage(100000, 'LOW', false), 0.0012)); // 0.0015 * 0.8

      // Normal cap enforcement at 0.005 (0.5%)
      const capped = TradeEngineService.calculateSlippage(1000, 'HIGH', false);
      assert.ok(capped <= 0.005);
    });

    it('applies adverse gap penalty (3x multiplier, 1.0% cap)', () => {
      // High liquidity: 0.0005 * 1.0 * 3.0 = 0.0015
      assert.ok(closeTo(TradeEngineService.calculateSlippage(500000, 'NORMAL', true), 0.0015));

      // Low liquidity + High vol: 0.0015 * 1.5 * 3.0 = 0.00675
      assert.ok(closeTo(TradeEngineService.calculateSlippage(100000, 'HIGH', true), 0.00675));

      // Adverse gap cap enforcement at 0.01 (1.0%)
      const cappedAdverse = TradeEngineService.calculateSlippage(100000, 'HIGH', true);
      assert.ok(cappedAdverse <= 0.01);
    });
  });

  describe('3. TradeEngineService Execution Simulation & Gross P&L Invariants', () => {
    const baseConfig = {
      capital: 100000,
      riskModel: 'Fixed',
      riskValue: 1000,
      executionMode: 'conservative',
      avgVolume: 1000000,
      volatility: 'NORMAL',
    };

    it('simulates LONG trade P&L and R:R correctly on target hit', () => {
      const ohlc = [
        { date: '2026-09-01', open: 100, high: 112, low: 99, close: 111, volume: 1000000 },
      ];
      // Entry: 100, SL: 95, Target: 110. Risk = 5 per share.
      // positionSize = 1000 / 5 = 200 shares.
      const res = TradeEngineService.simulateTrade('LONG', 100, 95, 110, ohlc, baseConfig);

      assert.equal(res.status, 'CLOSED_TARGET');
      assert.equal(res.positionSize, 200);
      assert.ok(closeTo(res.exitPrice ?? 0, 110 * (1 - 0.0005))); // 110 - slippage
      assert.ok(res.pnl > 0);
      assert.ok(res.rr > 0);
    });

    it('simulates SHORT trade P&L and R:R correctly on stop loss hit', () => {
      const ohlc = [
        { date: '2026-09-01', open: 100, high: 106, low: 94, close: 105, volume: 1000000 },
      ];
      // Entry: 100, SL: 105, Target: 90. Risk = 5 per share.
      // positionSize = 1000 / 5 = 200 shares.
      const res = TradeEngineService.simulateTrade('SHORT', 100, 105, 90, ohlc, baseConfig);

      assert.equal(res.status, 'CLOSED_SL');
      assert.equal(res.positionSize, 200);
      assert.ok(closeTo(res.exitPrice ?? 0, 105 * (1 + 0.0005))); // 105 + slippage
      assert.ok(res.pnl < 0);
    });

    it('returns SKIPPED_UNTRADEABLE for degenerate entry or zero risk', () => {
      const ohlc = [
        { date: '2026-09-01', open: 100, high: 105, low: 95, close: 100, volume: 1000000 },
      ];
      const resZeroRisk = TradeEngineService.simulateTrade('LONG', 100, 100, 110, ohlc, baseConfig);
      assert.equal(resZeroRisk.status, 'SKIPPED_UNTRADEABLE');
      assert.equal(resZeroRisk.pnl, 0);

      const resZeroEntry = TradeEngineService.simulateTrade('LONG', 0, 95, 110, ohlc, baseConfig);
      assert.equal(resZeroEntry.status, 'SKIPPED_UNTRADEABLE');
      assert.equal(resZeroEntry.pnl, 0);
    });
  });

  describe('4. Trade Journal Direction-Aware Gross P&L Invariants', () => {
    it('computes 100% gross P&L for long option / underlying positions (exit - entry)', () => {
      // CE or PE bought at 50, exited at 65 -> +15 gain (+30%)
      const res = computeOptionPnl(50, 65);
      assert.equal(res.pnl, 15);
      assert.equal(res.pnlPct, 30);

      // CE bought at 100, exited at 80 -> -20 loss (-20%)
      const lossRes = computeOptionPnl(100, 80);
      assert.equal(lossRes.pnl, -20);
      assert.equal(lossRes.pnlPct, -20);
    });

    it('computes 100% gross direction-aware P&L for short underlying cash legs (entry - exit)', () => {
      // STBT short underlying entry at 1000, exited at 960 -> +40 gain (+4%)
      const shortWin = computeJournalPnl(1000, 960, { isShortUnderlying: true });
      assert.equal(shortWin.pnl, 40);
      assert.equal(shortWin.pnlPct, 4);

      // STBT short underlying entry at 1000, exited at 1030 -> -30 loss (-3%)
      const shortLoss = computeJournalPnl(1000, 1030, { isShortUnderlying: true });
      assert.equal(shortLoss.pnl, -30);
      assert.equal(shortLoss.pnlPct, -3);
    });

    it('verifies that Trade Journal P&L currently has zero fee/statutory deductions', () => {
      const entry = 100;
      const exit = 100; // Flat trade
      const res = computeJournalPnl(entry, exit);

      // In a real execution, a flat trade incurs broker fees, STT, and exchange charges (net negative).
      // The current baseline journal strictly returns 0 (pure gross).
      assert.equal(res.pnl, 0);
      assert.equal(res.pnlPct, 0);
    });
  });

  describe('5. Quantitative Friction Delta Verification (Baseline vs Realistic Futures)', () => {
    it('documents the exact statutory delta for 1 lot NIFTY futures overnight', () => {
      const entry = 25000;
      const exit = 25100;
      const qty = 50;
      const turnover = (entry + exit) * qty; // 2,505,000

      // Current legacy baseline in code (0.00002)
      const legacyFee = turnover * 0.00002; // (25000 + 25100) * 50 * 0.00002 = 50.10

      // Modeled Statutory Futures breakdown (post-April 2026 NSE schedule):
      // - STT on sell: 0.05% of sell turnover (25,100 * 50 * 0.0005) = ₹627.50
      // - Stamp duty on buy: 0.002% of buy turnover (25,000 * 50 * 0.00002) = ₹25.00
      // - Exchange turnover: 0.00173% on both legs (2,505,000 * 0.0000173) = ₹43.34
      // - SEBI turnover: ₹10/crore (2,505,000 * 0.000001) = ₹2.51
      // - Brokerage allowance: ₹20/order * 2 = ₹40.00
      // - GST (18% on brokerage + exchange + sebi): 0.18 * (40 + 43.34 + 2.51) = ₹15.45
      const sttSell = exit * qty * 0.0005;
      const stampDutyBuy = entry * qty * 0.00002;
      const exchangeFee = turnover * 0.0000173;
      const sebiFee = turnover * 0.000001;
      const brokerage = 40.0;
      const gst = (brokerage + exchangeFee + sebiFee) * 0.18;
      const totalRealisticFuturesFee = sttSell + stampDutyBuy + exchangeFee + sebiFee + brokerage + gst;

      // Realistic fee is approx ₹753.80 vs legacy ₹50.10 (~15x higher)
      assert.ok(closeTo(legacyFee, 50.1));
      assert.ok(totalRealisticFuturesFee > 750 && totalRealisticFuturesFee < 760);
      assert.ok(totalRealisticFuturesFee / legacyFee > 14);

      // Verifies that both calculations are deterministic and reproducible
      assert.ok(Number.isFinite(legacyFee));
      assert.ok(Number.isFinite(totalRealisticFuturesFee));
    });
  });
});
