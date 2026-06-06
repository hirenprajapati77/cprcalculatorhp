import test from 'node:test';
import assert from 'node:assert';
import { ScannerService } from '../services/scanner.service';
import { RankingService } from '../services/ranking.service';
import { MarketStockData } from '../services/market.service';

test('Scanner Service Signals Evaluation', async (t) => {
  await t.test('evaluates NORMAL and BULLISH signals correctly', () => {
    const mockStock: MarketStockData = {
      symbol: 'TESTSTOCK',
      market: 'NSE',
      sector: 'Technology',
      open: 100,
      high: 105,
      low: 95,
      close: 101, // P = 100.33, BC = 100, TC = 100.67. Width = 0.67% (NORMAL)
      volume: 100000,
      avgVolume: 100000,
      marketCap: 120000,
      ltp: 102, // LTP > TC => BULLISH
    };

    const scanResult = ScannerService.scanStock(mockStock);
    
    assert.strictEqual(scanResult.classification, 'NORMAL');
    assert.ok(scanResult.signals.includes('NORMAL'));
    assert.ok(scanResult.signals.includes('BULLISH'));
  });

  await t.test('detects GAPS and VIRGIN CPR correctly', () => {
    const mockStock: MarketStockData = {
      symbol: 'TESTSTOCK3',
      market: 'NSE',
      sector: 'Financial Services',
      open: 110, // open > yesterday high of 105 (GAP UP)
      high: 105,
      low: 95,
      close: 101, // P = 100.33, BC = 100, TC = 100.67
      volume: 100000,
      avgVolume: 100000,
      marketCap: 450000,
      ltp: 112, // today's min price is 110. 110 > TC 100.67 => VIRGIN CPR
    };

    const scanResult = ScannerService.scanStock(mockStock);

    assert.ok(scanResult.signals.includes('GAP_UP'));
    assert.ok(scanResult.signals.includes('VIRGIN'));
  });
});

test('Scanner Service V2 Entry, Target, Stop Loss, and Risk-Reward (RR)', async (t) => {
  await t.test('calculates correct trade setups for BULLISH bias', () => {
    // Bullish: LTP > TC. Entry = TC, SL = BC, Target = R2
    const mockStock: MarketStockData = {
      symbol: 'BULLSTOCK',
      market: 'NSE',
      sector: 'IT',
      open: 100,
      high: 105,
      low: 95,
      close: 101, // P = 100.33, BC = 100, TC = 100.67, R2 = P + (H - L) = 100.33 + 10 = 110.33
      volume: 100000,
      avgVolume: 100000,
      marketCap: 50000,
      ltp: 102, // Bullish
    };

    const result = ScannerService.scanStock(mockStock);

    assert.strictEqual(result.entry, result.tc);
    assert.strictEqual(result.sl, result.bc);
    assert.strictEqual(result.target, result.r2);
    
    // Risk = Entry - SL = 100.67 - 100 = 0.67
    // Reward = Target - Entry = 110.33 - 100.67 = 9.66
    // RR Ratio = Reward / Risk = 9.66 / 0.67 = 14.4
    assert.strictEqual(result.rr, '1:14.5');
  });

  await t.test('calculates correct trade setups for BEARISH bias', () => {
    // Bearish: LTP < BC. Entry = BC, SL = TC, Target = S2
    const mockStock: MarketStockData = {
      symbol: 'BEARSTOCK',
      market: 'NSE',
      sector: 'IT',
      open: 100,
      high: 105,
      low: 95,
      close: 101, // P = 100.33, BC = 100, TC = 100.67, S2 = P - (H - L) = 100.33 - 10 = 90.33
      volume: 100000,
      avgVolume: 100000,
      marketCap: 50000,
      ltp: 98, // Bearish
    };

    const result = ScannerService.scanStock(mockStock);

    assert.strictEqual(result.entry, result.bc);
    assert.strictEqual(result.sl, result.tc);
    assert.strictEqual(result.target, result.s2);
    
    // Risk = SL - Entry = 100.67 - 100 = 0.67
    // Reward = Entry - Target = 100 - 90.33 = 9.67
    // RR Ratio = Reward / Risk = 9.67 / 0.67 = 14.4
    assert.strictEqual(result.rr, '1:14.5');
  });
});

test('Ranking Service V2 Scoring & Classifications', async (t) => {
  await t.test('assigns correct classification labels based on score ranges', () => {
    assert.strictEqual(RankingService.getClassification(95), 'Strong Buy');
    assert.strictEqual(RankingService.getClassification(90), 'Strong Buy');
    
    assert.strictEqual(RankingService.getClassification(85), 'Opportunity');
    assert.strictEqual(RankingService.getClassification(70), 'Opportunity');
    
    assert.strictEqual(RankingService.getClassification(65), 'Watch');
    assert.strictEqual(RankingService.getClassification(40), 'Watch');
    
    assert.strictEqual(RankingService.getClassification(35), 'Ignore');
    assert.strictEqual(RankingService.getClassification(10), 'Avoid');
  });

  await t.test('calculates correct score sum and caps at 100', () => {
    // Narrow (+30) + Breakout (+25) + Bullish (+20) + Vol (+15) + Momentum (+10) = 100
    const result = {
      symbol: 'TEST1',
      market: 'NSE' as const,
      sector: 'IT',
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 200000,
      avgVolume: 100000,
      marketCap: 50000,
      ltp: 105,
      pivot: 100,
      bc: 100,
      tc: 100,
      r1: 102,
      r2: 103,
      r3: 104,
      r4: 105,
      s1: 98,
      s2: 97,
      s3: 96,
      s4: 95,
      width: 0,
      classification: 'NARROW' as const,
      signals: ['NARROW', 'BREAKOUT', 'BULLISH', 'MOMENTUM'],
      entry: 0,
      sl: 0,
      target: 0,
      rr: '1:1',
    };

    const score = RankingService.calculateScore(result);
    assert.strictEqual(score, 100);
  });
});
