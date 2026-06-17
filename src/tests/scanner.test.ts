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
    // BULLISH: LTP > TC. Entry = TC, SL = min(dayLow, entry×0.995), Target = entry + 2×slDist, RR = 1:2.0
    const mockStock: MarketStockData = {
      symbol: 'BULLSTOCK',
      market: 'NSE',
      sector: 'IT',
      open: 100,
      high: 105,
      low: 95,
      close: 101, // P = 100.33, BC = 100, TC = 100.67
      volume: 100000,
      avgVolume: 100000,
      marketCap: 50000,
      ltp: 102, // Bullish (ltp > TC)
    };

    const result = ScannerService.scanStock(mockStock);

    // Entry = TC
    assert.strictEqual(result.entry, result.tc);

    // SL = min(dayLow=95, entry×0.995=100.67×0.995≈100.17) → dayLow=95 wins
    assert.strictEqual(result.sl, 95);

    // slDist = 100.67 - 95 = 5.67, target = 100.67 + 2×5.67 = 112.01
    const expectedTarget = parseFloat((result.entry + (result.entry - result.sl) * 2).toFixed(10));
    assert.ok(Math.abs(result.target - expectedTarget) < 0.01, `Target mismatch: got ${result.target}, expected ~${expectedTarget}`);

    // RR is always 1:2.0
    assert.strictEqual(result.rr, '1:2.0');
  });

  await t.test('calculates correct trade setups for BEARISH bias', () => {
    // BEARISH: LTP < BC. Entry = BC, SL = max(dayHigh, entry×1.005), Target = entry - 2×slDist, RR = 1:2.0
    const mockStock: MarketStockData = {
      symbol: 'BEARSTOCK',
      market: 'NSE',
      sector: 'IT',
      open: 100,
      high: 105,
      low: 95,
      close: 101, // P = 100.33, BC = 100, TC = 100.67
      volume: 100000,
      avgVolume: 100000,
      marketCap: 50000,
      ltp: 98, // Bearish (ltp < BC)
    };

    const result = ScannerService.scanStock(mockStock);

    // Entry = BC
    assert.strictEqual(result.entry, result.bc);

    // SL = max(dayHigh=105, entry×1.005=100×1.005=100.5) → dayHigh=105 wins
    assert.strictEqual(result.sl, 105);

    // slDist = 105 - 100 = 5, target = 100 - 2×5 = 90
    const expectedTarget = parseFloat((result.entry - (result.sl - result.entry) * 2).toFixed(10));
    assert.ok(Math.abs(result.target - expectedTarget) < 0.01, `Target mismatch: got ${result.target}, expected ~${expectedTarget}`);

    // RR is always 1:2.0
    assert.strictEqual(result.rr, '1:2.0');
  });
});

test('Ranking Service V2 Scoring & Classifications', async (t) => {
  await t.test('assigns correct classification labels based on score ranges', () => {
    assert.strictEqual(RankingService.getClassification(95), 'A+');
    assert.strictEqual(RankingService.getClassification(90), 'A+');
    
    assert.strictEqual(RankingService.getClassification(85), 'A');
    assert.strictEqual(RankingService.getClassification(70), 'A');
    
    assert.strictEqual(RankingService.getClassification(65), 'B');
    assert.strictEqual(RankingService.getClassification(50), 'B');
    
    assert.strictEqual(RankingService.getClassification(40), 'Ignore');
    assert.strictEqual(RankingService.getClassification(35), 'Ignore');
    assert.strictEqual(RankingService.getClassification(10), 'Ignore');
  });

  await t.test('calculates correct score sum and caps at 100', () => {
    // Compression (Narrow) (+25) + Higher Value (+20) + Breakout (+20) + Vol Ratio (+10) + Momentum (+10) + Liquidity (+10) + Hot Zone (+5) = 100
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
      signals: ['NARROW', 'BREAKOUT', 'BULLISH', 'MOMENTUM', 'HIGHER_VALUE', 'HOT_ZONE'],
      entry: 0,
      sl: 0,
      target: 0,
      rr: '1:1',
    };

    const score = RankingService.calculateScore(result);
    assert.strictEqual(score, 100);
  });
});
