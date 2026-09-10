import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GapProbabilityService } from '../../services/overnight/gap-probability.service';
import { MarketStockData } from '../../services/market.service';

describe('GapProbabilityService (Tier 2 coverage)', () => {
  const baseStock: MarketStockData = {
    symbol: 'MOCK',
    market: 'NSE',
    sector: 'IT',
    open: 100,
    high: 105,
    low: 95,
    close: 100,
    ltp: 100,
    volume: 100000,
    avgVolume: 100000,
    marketCap: 10000,
    history: [],
  };

  it('handles empty history gracefully', () => {
    const stock: MarketStockData = {
      ...baseStock,
      symbol: 'EMPTY',
      history: [],
    };
    const res = GapProbabilityService.calculateGapProbability(stock, 'LONG');
    assert.equal(res.expectedGap, 0);
    assert.equal(res.gapConfidence, 0);
    assert.equal(res.gapProbability, 0);
  });

  it('calculates LONG gap probability and expected gap with large sample', () => {
    // 30 days of history, 15 gap-ups > 0.2%
    const history = [];
    for (let i = 0; i < 30; i++) {
      const close = 100;
      // alternate between gap-up of 1% and flat open
      const open = i % 2 === 1 ? 101 : 100;
      history.push({
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        open,
        high: 102,
        low: 99,
        close,
        volume: 100000,
      });
    }

    const stock: MarketStockData = {
      ...baseStock,
      symbol: 'TEST_LONG',
      history,
    };

    const res = GapProbabilityService.calculateGapProbability(stock, 'LONG');
    assert.ok(res.expectedGap > 0);
    assert.ok(res.gapProbability != null && res.gapProbability > 0);
    // totalCandles = 29 >= 20 -> confidence can go up to 95
    assert.ok(res.gapConfidence > 0);
  });

  it('calculates SHORT gap probability and returns negative expectedGap', () => {
    const history = [];
    for (let i = 0; i < 30; i++) {
      const close = 100;
      // alternate between gap-down of -1% and flat open
      const open = i % 2 === 1 ? 99 : 100;
      history.push({
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        open,
        high: 101,
        low: 98,
        close,
        volume: 100000,
      });
    }

    const stock: MarketStockData = {
      ...baseStock,
      symbol: 'TEST_SHORT',
      history,
    };

    const res = GapProbabilityService.calculateGapProbability(stock, 'SHORT');
    assert.ok(res.expectedGap < 0, 'Expected gap for SHORT must be negative');
    assert.ok(res.gapProbability != null && res.gapProbability > 0);
  });

  it('caps gapConfidence at 50 for small samples (< 20 candles)', () => {
    const history = [];
    for (let i = 0; i < 10; i++) {
      history.push({
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        open: 102, // 100% gap ups
        high: 103,
        low: 99,
        close: 100,
        volume: 100000,
      });
    }

    const stock: MarketStockData = {
      ...baseStock,
      symbol: 'TEST_SMALL',
      history,
    };

    const res = GapProbabilityService.calculateGapProbability(stock, 'LONG');
    assert.equal(res.gapConfidence, 50, 'Confidence must be capped at 50 for sample size < 20');
  });
});
