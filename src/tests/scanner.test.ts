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
    const todayStr = new Date().toISOString().split('T')[0];
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
      ltp: 112,
      history: [
        {
          date: '2-days-ago',
          open: 85,
          high: 90,
          low: 80,
          close: 85,
          volume: 100000,
        },
        {
          date: 'yesterday',
          open: 100,
          high: 105,
          low: 95,
          close: 101,
          volume: 100000,
        },
        {
          date: todayStr,
          open: 110,
          high: 112,
          low: 110,
          close: 112,
          volume: 100000,
        }
      ]
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

    // Entry = tomorrow's TC (approx 101.33)
    assert.ok(Math.abs(result.entry - 101.33) < 0.05, 'entry should be tomorrow TC');

    // SL = min(dayLow=95, entry×0.995=100.67×0.995≈100.17) → dayLow=95 wins
    assert.strictEqual(result.sl, 95);

    assert.ok(result.target > result.entry, 'target should be above entry for BULLISH');
    assert.ok(result.sl < result.entry, 'sl should be below entry for BULLISH');
    const rrNum = parseFloat(result.rr.split(':')[1]);
    assert.ok(rrNum >= 1.5, 'RR should be at least 1:1.5 for BULLISH');
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

    // Entry = tomorrow's BC (approx 98.67)
    assert.ok(Math.abs(result.entry - 98.67) < 0.05, 'entry should be tomorrow BC');

    // SL = max(dayHigh=105, entry×1.005=100×1.005=100.5) → dayHigh=105 wins
    assert.strictEqual(result.sl, 105);

    assert.ok(result.target < result.entry, 'target should be below entry for BEARISH');
    assert.ok(result.sl > result.entry, 'sl should be above entry for BEARISH');
    const rrNum = parseFloat(result.rr.split(':')[1]);
    assert.ok(rrNum >= 1.5, 'RR should be at least 1:1.5 for BEARISH');
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

test('KGS CPR Theory Signal and Scoring Tests', async (t) => {
  const todayStr = new Date().toISOString().split('T')[0];

  await t.test('KGS_ASC_CPR fires when 3 consecutive rising TC days', () => {
    const mockStock: MarketStockData = {
      symbol: 'ASCSTOCK',
      market: 'NSE',
      sector: 'Technology',
      open: 100,
      high: 110,
      low: 90,
      close: 100,
      volume: 100000,
      avgVolume: 100000,
      marketCap: 100000,
      ltp: 100,
      history: [
        { date: '3-days-ago', open: 80, high: 82, low: 78, close: 80, volume: 100000 },
        { date: '2-days-ago', open: 90, high: 92, low: 88, close: 90, volume: 100000 },
        { date: 'yesterday', open: 100, high: 102, low: 98, close: 100, volume: 100000 },
        { date: todayStr, open: 110, high: 112, low: 108, close: 110, volume: 100000 }
      ]
    };

    const scanResult = ScannerService.scanStock(mockStock);
    assert.ok(scanResult.signals.includes('KGS_ASC_CPR'));
    assert.ok(!scanResult.signals.includes('KGS_DESC_CPR'));
  });

  await t.test('KGS_DESC_CPR fires when 3 consecutive falling TC days', () => {
    const mockStock: MarketStockData = {
      symbol: 'DESCSTOCK',
      market: 'NSE',
      sector: 'Technology',
      open: 100,
      high: 110,
      low: 90,
      close: 100,
      volume: 100000,
      avgVolume: 100000,
      marketCap: 100000,
      ltp: 100,
      history: [
        { date: '3-days-ago', open: 120, high: 122, low: 118, close: 120, volume: 100000 },
        { date: '2-days-ago', open: 110, high: 112, low: 108, close: 110, volume: 100000 },
        { date: 'yesterday', open: 100, high: 102, low: 98, close: 100, volume: 100000 },
        { date: todayStr, open: 90, high: 92, low: 88, close: 90, volume: 100000 }
      ]
    };

    const scanResult = ScannerService.scanStock(mockStock);
    assert.ok(scanResult.signals.includes('KGS_DESC_CPR'));
    assert.ok(!scanResult.signals.includes('KGS_ASC_CPR'));
  });

  await t.test('KGS_INSIDE_CPR fires when today fully inside yesterday', () => {
    const mockStock: MarketStockData = {
      symbol: 'INSIDECPR',
      market: 'NSE',
      sector: 'Technology',
      open: 100,
      high: 110,
      low: 90,
      close: 100,
      volume: 100000,
      avgVolume: 100000,
      marketCap: 100000,
      ltp: 100,
      history: [
        { date: '2-days-ago', open: 100, high: 110, low: 90, close: 105, volume: 100000 },
        { date: 'yesterday', open: 100, high: 103, low: 101, close: 101.5, volume: 100000 },
        { date: todayStr, open: 100, high: 102, low: 98, close: 100, volume: 100000 }
      ]
    };

    const scanResult = ScannerService.scanStock(mockStock);
    assert.ok(scanResult.signals.includes('KGS_INSIDE_CPR'));
    assert.ok(!scanResult.signals.includes('KGS_OUTSIDE_CPR'));
  });

  await t.test('KGS_OUTSIDE_CPR fires when today fully contains yesterday', () => {
    const mockStock: MarketStockData = {
      symbol: 'OUTSIDECPR',
      market: 'NSE',
      sector: 'Technology',
      open: 100,
      high: 110,
      low: 90,
      close: 100,
      volume: 100000,
      avgVolume: 100000,
      marketCap: 100000,
      ltp: 100,
      history: [
        { date: '2-days-ago', open: 100, high: 103, low: 101, close: 101.5, volume: 100000 },
        { date: 'yesterday', open: 100, high: 110, low: 90, close: 105, volume: 100000 },
        { date: todayStr, open: 100, high: 108, low: 92, close: 100, volume: 100000 }
      ]
    };

    const scanResult = ScannerService.scanStock(mockStock);
    assert.ok(scanResult.signals.includes('KGS_OUTSIDE_CPR'));
    assert.ok(!scanResult.signals.includes('KGS_INSIDE_CPR'));
  });

  await t.test('KGS_RTP fires when SMA20/SMA50 slopes match sign', () => {
    const mockStock: MarketStockData = {
      symbol: 'RTPSTOCK',
      market: 'NSE',
      sector: 'Technology',
      open: 100,
      high: 110,
      low: 90,
      close: 100,
      volume: 100000,
      avgVolume: 100000,
      marketCap: 100000,
      ltp: 100,
      sma20Slope: 1.5,
      sma50Slope: 0.8,
      history: []
    };

    const scanResult = ScannerService.scanStock(mockStock);
    assert.ok(scanResult.signals.includes('KGS_RTP'));
  });

  await t.test('Existing INSIDE_VALUE logic remains functional and unaffected', () => {
    const mockStock: MarketStockData = {
      symbol: 'INSIDEVAL',
      market: 'NSE',
      sector: 'Technology',
      open: 100,
      high: 105,
      low: 95,
      close: 101,
      volume: 100000,
      avgVolume: 100000,
      marketCap: 100000,
      ltp: 102,
      history: [
        {
          date: 'yesterday',
          open: 100,
          high: 105,
          low: 95,
          close: 101,
          volume: 100000,
        },
        {
          date: todayStr,
          open: 101,
          high: 101,
          low: 100,
          close: 100.5,
          volume: 100000,
        }
      ]
    };
    const scanResult = ScannerService.scanStock(mockStock);
    assert.ok(scanResult.signals.includes('INSIDE_VALUE'));
  });
});
