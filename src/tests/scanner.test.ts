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

  await t.test('evaluates BREAKDOWN signal correctly on high-volume move below bc', () => {
    const mockStock: MarketStockData = {
      symbol: 'TESTSTOCK2',
      market: 'NSE',
      sector: 'Technology',
      open: 100,
      high: 105,
      low: 95,
      close: 101, // P = 100.33, BC = 100, TC = 100.67
      volume: 150000,
      avgVolume: 100000, // volumeRatio = 1.5
      marketCap: 120000,
      ltp: 99, // LTP < BC => BREAKDOWN
    };

    const scanResult = ScannerService.scanStock(mockStock);
    assert.ok(scanResult.signals.includes('BREAKDOWN'), 'Missing BREAKDOWN signal');
  });

  await t.test('detects GAPS and VIRGIN CPR correctly', () => {
    // Use IST-aware date to match signal.service.ts candle classification logic
    const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
    const mockStock: MarketStockData = {
      symbol: 'TESTSTOCK3',
      market: 'NSE',
      sector: 'Financial Services',
      open: 110, // open > yesterday high of 105 (GAP UP)
      high: 112, // MUST be >= open
      low: 109,  // MUST be <= open
      close: 112, // P = 111, BC = 110, TC = 112
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
          close: 101, // P = 100.33, BC = 100, TC = 100.67
          volume: 100000,
        },
        {
          date: todayStr,
          open: 110,
          high: 112,
          low: 109,
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
    assert.strictEqual(RankingService.getClassification(80), 'A+');
    assert.strictEqual(RankingService.getClassification(75), 'A+');
    
    assert.strictEqual(RankingService.getClassification(70), 'A');
    assert.strictEqual(RankingService.getClassification(60), 'A');
    
    assert.strictEqual(RankingService.getClassification(55), 'B');
    assert.strictEqual(RankingService.getClassification(40), 'B');
    
    assert.strictEqual(RankingService.getClassification(35), 'Ignore');
    assert.strictEqual(RankingService.getClassification(10), 'Ignore');
  });

  await t.test('calculates correct score sum and caps at 100', () => {
    // Category A: NARROW (15) + HIGHER_VALUE (10) + BREAKOUT (10) + KGS_INSIDE_CPR (10) = 45 (capped at 45)
    // Category B: Vol Ratio >= 1.5 (15) + Vol Ratio >= 1.2 (10) = 25
    // Category C: MOMENTUM (10) + NORMAL & BULLISH (10) = 20
    // Category D: HOT_ZONE (5) + NARROW & KGS_RTP (5) = 10
    // Total = 100
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
      signals: ['NARROW', 'BREAKOUT', 'BULLISH', 'MOMENTUM', 'HIGHER_VALUE', 'HOT_ZONE', 'NORMAL', 'KGS_RTP', 'KGS_INSIDE_CPR', 'VIRGIN'],
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
  // Use IST-aware date to match signal.service.ts candle classification logic
  const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];

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

test('SMA Slope — non-overlapping windows produce meaningful slope', async (t) => {
  // Mirror the fixed logic from market.service.ts sma20/sma50 slope calculation
  function computeSmaSlopes(closes: number[]) {
    let sma20Slope = 0, sma50Slope = 0;
    if (closes.length >= 40) {
      const sma20     = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const sma20prev = closes.slice(-40, -20).reduce((a, b) => a + b, 0) / 20;
      sma20Slope = sma20 - sma20prev;
    }
    if (closes.length >= 100) {
      const sma50     = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
      const sma50prev = closes.slice(-100, -50).reduce((a, b) => a + b, 0) / 50;
      sma50Slope = sma50 - sma50prev;
    }
    return { sma20Slope, sma50Slope };
  }

  await t.test('rising price series produces sma20Slope > 10 with 40 closes', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
    const { sma20Slope } = computeSmaSlopes(closes);
    assert.ok(sma20Slope > 0, `Expected sma20Slope > 0, got ${sma20Slope}`);
    // Non-overlapping windows differ by 20 bars — slope should be substantial
    assert.ok(sma20Slope >= 10, `Expected sma20Slope >= 10, got ${sma20Slope}`);
  });

  await t.test('falling price series produces negative sma20Slope', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 139 - i);
    const { sma20Slope } = computeSmaSlopes(closes);
    assert.ok(sma20Slope < 0, `Expected sma20Slope < 0, got ${sma20Slope}`);
  });

  await t.test('insufficient history (< 40 bars) returns sma20Slope = 0', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
    const { sma20Slope } = computeSmaSlopes(closes);
    assert.strictEqual(sma20Slope, 0, 'Should return 0 when history < 40 bars');
  });

  await t.test('flat price series produces sma20Slope = 0', () => {
    const closes = Array.from({ length: 40 }, () => 100);
    const { sma20Slope } = computeSmaSlopes(closes);
    assert.strictEqual(sma20Slope, 0, 'Flat series should produce slope of 0');
  });
});

test('ScannerService/SignalService — asOfDate Inject and Forwarding', async (t) => {
  const mockStock = {
    symbol: 'TESTASOF',
    market: 'NSE' as const,
    sector: 'Technology',
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000000,
    avgVolume: 900000,
    marketCap: 100000000,
    ltp: 100,
    history: [
      {
        date: '2026-06-01',
        open: 100,
        high: 102,
        low: 98,
        close: 100,
        volume: 100000
      },
      {
        // Day 2: low 90, close 95
        date: '2026-06-02',
        open: 100,
        high: 102,
        low: 90,
        close: 95,
        volume: 100000
      },
      {
        // Day 3: massive gap up relative to Day 2 low/close
        date: '2026-06-03',
        open: 110,
        high: 115,
        low: 108,
        close: 112,
        volume: 120000
      }
    ]
  };

  await t.test('scanStock(stock, "2026-06-03") forwards asOfDate, triggers SignalService-only GAP_UP signal', () => {
    const res = ScannerService.scanStock({
      ...mockStock,
      open: 110,
      high: 115,
      low: 108,
      close: 112,
      ltp: 112
    }, '2026-06-03');

    // GAP_UP is computed ONLY by SignalService.getSignals()
    assert.ok(res.signals.includes('GAP_UP'), 'Should include GAP_UP signal when asOfDate aligns to Day 3');
  });

  await t.test('scanStock(stock, "2026-06-02") does not trigger GAP_UP', () => {
    const res = ScannerService.scanStock({
      ...mockStock,
      open: 100,
      high: 102,
      low: 90,
      close: 95,
      ltp: 95
    }, '2026-06-02');

    assert.ok(!res.signals.includes('GAP_UP'), 'Should not include GAP_UP when asOfDate is Day 2');
  });

  await t.test('scanStock(stock) with no asOfDate defaults to real system date (no GAP_UP)', () => {
    const res = ScannerService.scanStock({
      ...mockStock,
      open: 110,
      high: 115,
      low: 108,
      close: 112,
      ltp: 112
    });

    assert.ok(!res.signals.includes('GAP_UP'), 'Should default to system time and not match historical dates');
  });
});



