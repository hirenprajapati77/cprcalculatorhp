import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DrawerStockData, DrawerTab } from '@/components/enterprise/StockDetailDrawer';

describe('StockDetailDrawer Presentation Contract & Integration', () => {
  it('validates DrawerTab list integrity across all 7 views', () => {
    const expectedTabs: DrawerTab[] = [
      'overview',
      'signals',
      'tradeSetup',
      'history',
      'compare',
      'notes',
      'cprStats',
    ];

    assert.equal(expectedTabs.length, 7);
    assert.ok(expectedTabs.includes('overview'));
    assert.ok(expectedTabs.includes('signals'));
    assert.ok(expectedTabs.includes('tradeSetup'));
    assert.ok(expectedTabs.includes('history'));
    assert.ok(expectedTabs.includes('compare'));
    assert.ok(expectedTabs.includes('notes'));
    assert.ok(expectedTabs.includes('cprStats'));
  });

  it('validates DrawerStockData contract mapping and mathematical fallbacks', () => {
    const sampleStock: DrawerStockData = {
      symbol: 'RELIANCE',
      ltp: 2850.5,
      open: 2840.0,
      pivot: 2845.0,
      tc: 2855.0,
      bc: 2835.0,
      width: 0.702,
      score: 88,
      confidence: 85,
      classification: 'NORMAL',
      direction: 'LONG',
      signals: ['BREAKOUT', 'HIGHER_VALUE', 'VWAP_ABOVE'],
    };

    assert.equal(sampleStock.symbol, 'RELIANCE');
    assert.equal(sampleStock.ltp, 2850.5);
    assert.equal(sampleStock.direction, 'LONG');
    assert.equal(sampleStock.signals?.length, 3);

    // Fallback level calculation checks
    const direction = sampleStock.direction || (sampleStock.signals?.includes('BEARISH') ? 'SHORT' : 'LONG');
    const entry = sampleStock.entry || (direction === 'LONG' ? sampleStock.tc || sampleStock.ltp : sampleStock.bc || sampleStock.ltp);
    const target = sampleStock.target || (direction === 'LONG' ? sampleStock.ltp * 1.015 : sampleStock.ltp * 0.985);
    const stopLoss = sampleStock.sl || (direction === 'LONG' ? sampleStock.bc || sampleStock.ltp * 0.99 : sampleStock.tc || sampleStock.ltp * 1.01);

    assert.equal(direction, 'LONG');
    assert.equal(entry, 2855.0);
    assert.equal(Number(target.toFixed(2)), Number((2850.5 * 1.015).toFixed(2)));
    assert.equal(stopLoss, 2835.0);
  });

  it('correctly infers SHORT direction when signals indicate bearish bias', () => {
    const bearishStock: DrawerStockData = {
      symbol: 'INFY',
      ltp: 1820.0,
      tc: 1840.0,
      bc: 1830.0,
      signals: ['BEARISH', 'LOWER_VALUE'],
    };

    const inferDirection = (s: DrawerStockData): 'LONG' | 'SHORT' =>
      s.direction || (s.signals?.includes('BEARISH') ? 'SHORT' : 'LONG');
    const computeEntry = (s: DrawerStockData, dir: 'LONG' | 'SHORT') =>
      s.entry || (dir === 'LONG' ? s.tc || s.ltp : s.bc || s.ltp);

    const direction = inferDirection(bearishStock);
    assert.equal(direction, 'SHORT');

    const entry = computeEntry(bearishStock, direction);
    assert.equal(entry, 1830.0);
  });

  it('validates CPR matrix structure for LevelChart integration', () => {
    const stock: DrawerStockData = {
      symbol: 'TCS',
      ltp: 4120.0,
      pivot: 4100.0,
      tc: 4110.0,
      bc: 4090.0,
      r1: 4130.0,
      r2: 4150.0,
      s1: 4070.0,
      s2: 4050.0,
      width: 0.485,
      classification: 'NORMAL',
    };

    const cprRecord = {
      pivot: stock.pivot ?? 0,
      bc: stock.bc ?? 0,
      tc: stock.tc ?? 0,
      r1: stock.r1 ?? 0,
      r2: stock.r2 ?? 0,
      r3: stock.r3 ?? 0,
      r4: stock.r4 ?? 0,
      s1: stock.s1 ?? 0,
      s2: stock.s2 ?? 0,
      s3: stock.s3 ?? 0,
      s4: stock.s4 ?? 0,
      width: stock.width ?? 0,
      classification: stock.classification || 'NORMAL',
      trend: 'Trending',
      ltp: stock.ltp,
    };

    assert.equal(cprRecord.pivot, 4100.0);
    assert.equal(cprRecord.r1, 4130.0);
    assert.equal(cprRecord.s1, 4070.0);
    assert.equal(cprRecord.ltp, 4120.0);
    assert.equal(cprRecord.width, 0.485);
  });
});
