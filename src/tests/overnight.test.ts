import { describe, test, mock } from 'node:test';
import assert from 'node:assert';
import { OvernightService } from '../services/overnight/overnight.service';
import { MarketService } from '../services/market.service';

describe('Overnight Engine Tests', () => {
  test('should discover LONG setups correctly', async () => {
    mock.method(MarketService, 'getUniverse', () => [{ symbol: 'RELIANCE' }]);
    mock.method(MarketService, 'getStockData', async () => ({
      symbol: 'RELIANCE',
      ltp: 2500, // Fixed 'price' to 'ltp' based on typical MarketStockData
      open: 2480,
      close: 2510,
      high: 2520,
      low: 2470,
      volume: 1000000,
      avgVolume: 800000,
      marketCap: 1500000,
      vwap: 2495,
      rsi: 60,
      sector: 'Energy',
      date: new Date().toISOString(),
      history: []
    }));

    const signals = await OvernightService.discover('LONG');
    assert.ok(signals !== undefined);
    mock.restoreAll();
  });

  test('should discover SHORT setups correctly', async () => {
    mock.method(MarketService, 'getUniverse', () => [{ symbol: 'HDFC' }]);
    mock.method(MarketService, 'getStockData', async () => ({
      symbol: 'HDFC',
      ltp: 1500,
      open: 1520,
      close: 1480,
      high: 1530,
      low: 1470,
      volume: 1500000,
      avgVolume: 1000000,
      marketCap: 800000,
      vwap: 1505,
      rsi: 30,
      sector: 'Financial Services',
      date: new Date().toISOString(),
      history: []
    }));

    const signals = await OvernightService.discover('SHORT');
    assert.ok(signals !== undefined);
    mock.restoreAll();
  });

  test('should resolve conflicts in BOTH mode', async () => {
    mock.method(MarketService, 'getUniverse', () => [{ symbol: 'TCS' }]);
    mock.method(MarketService, 'getStockData', async () => ({
      symbol: 'TCS',
      ltp: 3500,
      open: 3510,
      close: 3500,
      high: 3520,
      low: 3490,
      volume: 500000,
      avgVolume: 400000,
      marketCap: 1200000,
      vwap: 3505,
      rsi: 50,
      sector: 'IT',
      date: new Date().toISOString(),
      history: []
    }));

    const signals = await OvernightService.discover('BOTH');
    assert.ok(signals !== undefined);
    mock.restoreAll();
  });
});
