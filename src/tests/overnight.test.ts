import { describe, test } from 'node:test';
import assert from 'node:assert';
import { OvernightService } from '../services/overnight/overnight.service';

describe('Overnight Engine Tests', () => {
  const testTime = new Date('2026-06-17T15:20:00+05:30'); // 15:20 IST (within market hours)

  test('Case 1: longScore=85, shortScore=40 -> tag LONG', async () => {
    const mockStock = {
      symbol: 'RELIANCE',
      market: 'NSE' as const,
      sector: 'Energy',
      open: 2500,
      high: 2550,
      low: 2490,
      close: 2540,
      volume: 1000000,
      avgVolume: 800000,
      marketCap: 1500000,
      ltp: 2540,
      longScoreOverride: 85,
      shortScoreOverride: 40,
      history: []
    };

    const signals = await OvernightService.discover('BOTH', testTime, [mockStock]);
    assert.strictEqual(signals.length, 1);
    assert.strictEqual(signals[0].symbol, 'RELIANCE');
    assert.strictEqual(signals[0].direction, 'LONG');
    assert.strictEqual(signals[0].overnightScore, 85);
  });

  test('Case 2: longScore=40, shortScore=82 -> tag SHORT', async () => {
    const mockStock = {
      symbol: 'TCS',
      market: 'NSE' as const,
      sector: 'IT',
      open: 3500,
      high: 3520,
      low: 3450,
      close: 3460,
      volume: 500000,
      avgVolume: 400000,
      marketCap: 1200000,
      ltp: 3460,
      longScoreOverride: 40,
      shortScoreOverride: 82,
      history: []
    };

    const signals = await OvernightService.discover('BOTH', testTime, [mockStock]);
    assert.strictEqual(signals.length, 1);
    assert.strictEqual(signals[0].symbol, 'TCS');
    assert.strictEqual(signals[0].direction, 'SHORT');
    assert.strictEqual(signals[0].overnightScore, 82);
  });

  test('Case 3: longScore=75, shortScore=72 -> NEUTRAL_CONFLICT', async () => {
    const mockStock = {
      symbol: 'INFY',
      market: 'NSE' as const,
      sector: 'IT',
      open: 1500,
      high: 1520,
      low: 1480,
      close: 1510,
      volume: 1200000,
      avgVolume: 1000000,
      marketCap: 600000,
      ltp: 1510,
      longScoreOverride: 75,
      shortScoreOverride: 72,
      history: []
    };

    const signals = await OvernightService.discover('BOTH', testTime, [mockStock]);
    assert.strictEqual(signals.length, 1);
    assert.strictEqual(signals[0].symbol, 'INFY');
    assert.strictEqual(signals[0].classification, 'NEUTRAL_CONFLICT');
  });
});
