import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MomentumLeadersService,
  OhlcvCandleWithPrevClose,
  RawStockAnalysis,
} from '@/services/market-tools/momentum-leaders.service';
import { classifyBreakoutVpa } from '@/services/vpa/vpa.math';

describe('MomentumLeadersService - Unit Tests', () => {
  function createMockRawStock(symbol: string, r21d: number, changePct = 1.0): RawStockAnalysis {
    const circuitInfo = MomentumLeadersService.detectCircuitLock(changePct);
    return {
      symbol,
      sector: 'Technology',
      close: 100,
      prevClose: 100,
      changePct,
      volume: 500000,
      turnoverCr: 50.0,
      avgTurnoverCr20d: 50.0,
      rvol20d: 1.2,
      clv: 0.5,
      vpaFootprint: classifyBreakoutVpa(1.2, 0.5),
      r1d: 2.0,
      r5d: 4.0,
      r10d: 8.0,
      r21d,
      isCircuitLocked: circuitInfo.isCircuitLocked,
      circuitLimitPct: circuitInfo.circuitLimitPct,
    };
  }

  describe('Compounded Daily Return Calculation', () => {
    it('computes accurate 1-day return using close and prevClose', () => {
      const candles: OhlcvCandleWithPrevClose[] = [
        { date: '2026-08-28', open: 100, high: 102, low: 99, close: 100, prevClose: 98, volume: 100000 },
        { date: '2026-09-01', open: 101, high: 106, low: 100, close: 105, prevClose: 100, volume: 150000 },
      ];
      const r1 = MomentumLeadersService.computeCompoundedReturn(candles, 1);
      // (105 - 100) / 100 = +5.0%
      assert.equal(r1, 5.0);
    });

    it('compounds multi-day returns across k trading sessions', () => {
      // Day 1: 100 -> 102 (+2%)
      // Day 2: 102 -> 104.04 (+2%)
      // Day 3: 104.04 -> 107.1612 (+3%)
      // Cumulative: (1.02 * 1.02 * 1.03) - 1 = 1.071612 - 1 = +7.16%
      const candles: OhlcvCandleWithPrevClose[] = [
        { date: '2026-08-27', open: 98, high: 102, low: 98, close: 100, prevClose: 99, volume: 100000 },
        { date: '2026-08-28', open: 100, high: 103, low: 100, close: 102, prevClose: 100, volume: 100000 },
        { date: '2026-08-29', open: 102, high: 105, low: 101, close: 104.04, prevClose: 102, volume: 100000 },
        { date: '2026-09-01', open: 104, high: 108, low: 103, close: 107.1612, prevClose: 104.04, volume: 100000 },
      ];
      const r3 = MomentumLeadersService.computeCompoundedReturn(candles, 3);
      assert.equal(r3, 7.16);
    });

    it('immunizes return against stock splits via exchange-adjusted prevClose', () => {
      // 1:1 bonus / 2:1 stock split on Day 2:
      // Day 1: close = 1000, prevClose = 980 (+2.04%)
      // Day 2 (Ex-Date): NSE adjusts prevClose to 500. Stock closes at 510 (+2.0%)
      // Total return across the 2 days should be (1 + 0.0204) * (1 + 0.02) - 1 = +4.08%
      // A naive unadjusted close comparison (510 - 980)/980 would show a fake -47.96% crash!
      const candles: OhlcvCandleWithPrevClose[] = [
        { date: '2026-08-28', open: 980, high: 1010, low: 975, close: 1000, prevClose: 980, volume: 100000 },
        { date: '2026-09-01', open: 505, high: 520, low: 495, close: 510, prevClose: 500, volume: 200000 },
      ];
      const r2 = MomentumLeadersService.computeCompoundedReturn(candles, 2);
      assert.ok(r2 > 4.0 && r2 < 4.2, `Split-adjusted return must be ~+4.08%, received ${r2}%`);
    });

    it('returns 0 when candles length is less than requested window k', () => {
      const candles: OhlcvCandleWithPrevClose[] = [
        { date: '2026-09-01', open: 100, high: 105, low: 99, close: 102, prevClose: 100, volume: 50000 },
      ];
      const r5 = MomentumLeadersService.computeCompoundedReturn(candles, 5);
      assert.equal(r5, 0);
    });
  });

  describe('Bounded Additive Composite Scoring Formula', () => {
    it('scores Stock A (Persistent 4-window leader) at ~95 with CONFIRMED and ~90 with NEUTRAL', () => {
      // Percentiles: 95, 92, 96, 94
      // Base: 0.85 * (0.15*95 + 0.25*92 + 0.30*96 + 0.30*94) = 0.85 * 94.25 = 80.1125
      // Consistency: 4 windows >= 85 => 4 * 2.5 = +10.0
      // Dispersion: sample std = 1.7078 => penalty = 0.1708
      // Subtotal = 80.11 + 10.0 - 0.17 = 89.94
      // With CONFIRMED (+5): 89.94 + 5 = 94.94 => 95 (Tier A+)
      // With NEUTRAL (0): 89.94 => 90 (Tier A+)
      const resConfirmed = MomentumLeadersService.calculateCompositeScore({
        p1d: 95,
        p5d: 92,
        p10d: 96,
        p21d: 94,
        vpaModifier: 5,
      });

      assert.equal(resConfirmed.leaderWindowCount, 4);
      assert.equal(resConfirmed.compositeScore, 95);
      assert.equal(resConfirmed.tier, 'A+');

      const resNeutral = MomentumLeadersService.calculateCompositeScore({
        p1d: 95,
        p5d: 92,
        p10d: 96,
        p21d: 94,
        vpaModifier: 0,
      });
      assert.equal(resNeutral.compositeScore, 90);
      assert.equal(resNeutral.tier, 'A+');
    });

    it('penalizes Stock B (Single-day spike / dead-cat bounce) to Tier C', () => {
      // Percentiles: 98 (1D), 40 (5D), 25 (10D), 10 (21D)
      // Base: 0.85 * (0.15*98 + 0.25*40 + 0.30*25 + 0.30*10) = 0.85 * 35.2 = 29.92
      // Consistency: only 1 window >= 85 => 1 * 2.5 = +2.5
      // Dispersion penalty: sample std ~ 38.5 => 0.10 * 38.5 = 3.85
      // Pre-VPA subtotal = 29.92 + 2.5 - 3.85 = 28.57
      // With CONFIRMED (+5): 33.57 => 34 (Tier C)
      // With NO_DEMAND (-3): 25.57 => 26 (Tier C)
      const resConfirmed = MomentumLeadersService.calculateCompositeScore({
        p1d: 98,
        p5d: 40,
        p10d: 25,
        p21d: 10,
        vpaModifier: 5,
      });
      assert.equal(resConfirmed.leaderWindowCount, 1);
      assert.equal(resConfirmed.compositeScore, 34);
      assert.equal(resConfirmed.tier, 'C');

      const resNoDemand = MomentumLeadersService.calculateCompositeScore({
        p1d: 98,
        p5d: 40,
        p10d: 25,
        p21d: 10,
        vpaModifier: -3,
      });
      assert.equal(resNoDemand.compositeScore, 26);
      assert.equal(resNoDemand.tier, 'C');
    });

    it('scores Stock C (Steady 3-window leader) at Tier A (~87 with CONFIRMED)', () => {
      // Percentiles: 70 (1D), 92 (5D), 90 (10D), 94 (21D)
      const res = MomentumLeadersService.calculateCompositeScore({
        p1d: 70,
        p5d: 92,
        p10d: 90,
        p21d: 94,
        vpaModifier: 5,
      });
      assert.equal(res.leaderWindowCount, 3);
      assert.equal(res.compositeScore, 87);
      assert.equal(res.tier, 'A');
    });

    it('reaches exactly 100 for undisputed #1 leader without ceiling saturation', () => {
      // Rank 1 in every window (100th percentile) with CONFIRMED volume (+5)
      // Base: 0.85 * 100 = 85.0
      // Consistency: 4 * 2.5 = 10.0
      // Dispersion: 0
      // VPA: +5
      // Total = 85 + 10 + 5 = 100.0
      const res = MomentumLeadersService.calculateCompositeScore({
        p1d: 100,
        p5d: 100,
        p10d: 100,
        p21d: 100,
        vpaModifier: 5,
      });
      assert.equal(res.compositeScore, 100);
      assert.equal(res.tier, 'A+');

      // Crucial verification: a modest 4-window leader does NOT get clamped to 100!
      const modestLeader = MomentumLeadersService.calculateCompositeScore({
        p1d: 86,
        p5d: 86,
        p10d: 86,
        p21d: 86,
        vpaModifier: 5,
      });
      // Base: 0.85 * 86 = 73.1
      // Consistency: 4 * 2.5 = 10.0
      // Dispersion: 0
      // VPA: +5
      // Total = 73.1 + 10 + 5 = 88.1 => 88 (Tier A)
      assert.equal(modestLeader.compositeScore, 88);
      assert.ok(modestLeader.compositeScore < 100, 'Modest leader must not saturate to 100');
    });
  });

  describe('VPA Modifier Integration', () => {
    it('uses exact scoreModifiers from classifyBreakoutVpa', () => {
      // RVOL >= 1.5 and CLV >= 0.3 => CONFIRMED (+5)
      const confirmed = classifyBreakoutVpa(1.8, 0.4);
      assert.equal(confirmed.status, 'CONFIRMED');
      assert.equal(confirmed.scoreModifier, 5);

      // RVOL >= 1.2 and tight range <= 0.025 => ABSORPTION (+5)
      const absorption = classifyBreakoutVpa(1.3, 0.1, 0.02);
      assert.equal(absorption.status, 'ABSORPTION');
      assert.equal(absorption.scoreModifier, 5);

      // RVOL < 0.8 => NO_DEMAND (-3)
      const noDemand = classifyBreakoutVpa(0.5, 0.2);
      assert.equal(noDemand.status, 'NO_DEMAND');
      assert.equal(noDemand.scoreModifier, -3);

      // RVOL >= 1.5 and CLV <= -0.2 => CLIMAX_REJECT (-10)
      const climaxReject = classifyBreakoutVpa(2.0, -0.4);
      assert.equal(climaxReject.status, 'CLIMAX_REJECT');
      assert.equal(climaxReject.scoreModifier, -10);

      // Neutral
      const neutral = classifyBreakoutVpa(1.0, 0.0);
      assert.equal(neutral.status, 'NEUTRAL');
      assert.equal(neutral.scoreModifier, 0);
    });
  });

  describe('Liquidity Base Gate (20-Day Trailing Average Turnover)', () => {
    it('locks in MIN_LIQUIDITY_TURNOVER_CR at 10.0 (₹10 Cr)', () => {
      assert.equal(MomentumLeadersService.MIN_LIQUIDITY_TURNOVER_CR, 10.0);
    });

    it('computes accurate 20-day trailing average daily turnover in ₹ Cr', () => {
      // 21 candles (20 prior days + 1 current day)
      // Prior 20 days: each has volume 1,000,000 at close 100 => 10 Cr turnover/day
      const candles: OhlcvCandleWithPrevClose[] = [];
      for (let i = 1; i <= 21; i++) {
        candles.push({
          date: `2026-08-${i < 10 ? '0' + i : i}`,
          open: 99,
          high: 101,
          low: 98,
          close: 100,
          prevClose: 100,
          volume: 1000000, // 1M * 100 = 10 Cr
          value: 100000000, // 10 Cr in INR
        });
      }

      const avgTurnover = MomentumLeadersService.computeTrailingAvgTurnoverCr(candles, 20);
      assert.equal(avgTurnover, 10.0);
      assert.ok(avgTurnover >= MomentumLeadersService.MIN_LIQUIDITY_TURNOVER_CR);
    });

    it('identifies stocks failing the ₹10 Cr liquidity floor (< 10 Cr)', () => {
      // Illiquid stock: 20 prior days with 5.37 Cr average turnover
      const candles: OhlcvCandleWithPrevClose[] = [];
      for (let i = 1; i <= 21; i++) {
        candles.push({
          date: `2026-08-${i < 10 ? '0' + i : i}`,
          open: 99,
          high: 101,
          low: 98,
          close: 100,
          prevClose: 100,
          volume: 537000,
          value: 53700000, // 5.37 Cr
        });
      }

      const avgTurnover = MomentumLeadersService.computeTrailingAvgTurnoverCr(candles, 20);
      assert.equal(avgTurnover, 5.37);
      assert.ok(avgTurnover < MomentumLeadersService.MIN_LIQUIDITY_TURNOVER_CR, 'Must fail liquidity floor');
    });

    it('confirms high-turnover stocks with low relative volume (NAVINFLUOR scenario) pass the liquidity floor', () => {
      // Stock trades ₹8,600 with 74,062 shares today (₹64 Cr)
      // Prior 20 days: avg volume 353,000 shares * ₹8,600 = ~₹305 Cr/day
      // Today RVOL = 74,062 / 353,000 = 0.21x (Low Volume VPA badge)
      // Absolute liquidity is massive (305 Cr avg, 64 Cr today) => passes ₹10 Cr floor
      const candles: OhlcvCandleWithPrevClose[] = [];
      for (let i = 1; i <= 20; i++) {
        candles.push({
          date: `2026-08-${i < 10 ? '0' + i : i}`,
          open: 8500,
          high: 8700,
          low: 8400,
          close: 8600,
          prevClose: 8600,
          volume: 353000,
          value: 353000 * 8600, // ~303.58 Cr
        });
      }
      // Current day
      candles.push({
        date: '2026-09-01',
        open: 8650,
        high: 8700,
        low: 8550,
        close: 8636,
        prevClose: 8675.5,
        volume: 74062,
        value: 74062 * 8636, // ~63.96 Cr
      });

      const avgTurnover = MomentumLeadersService.computeTrailingAvgTurnoverCr(candles, 20);
      assert.ok(avgTurnover > 300, `Average turnover must be ~303 Cr, got ${avgTurnover}`);
      assert.ok(avgTurnover >= MomentumLeadersService.MIN_LIQUIDITY_TURNOVER_CR, 'Must easily pass ₹10 Cr liquidity floor');
    });
  });

  describe('Multi-Universe Computation (ALL_NSE vs NSE_FNO)', () => {
    it('computes percentile ranks independently within each universe pool', () => {
      // Create 5 non-F&O stocks with high 21D returns: 50%, 40%, 30%, 20%, 10%
      const nonFnoStocks = [
        createMockRawStock('NON_FNO_1', 50.0),
        createMockRawStock('NON_FNO_2', 40.0),
        createMockRawStock('NON_FNO_3', 30.0),
        createMockRawStock('NON_FNO_4', 20.0),
        createMockRawStock('NON_FNO_5', 10.0),
      ];

      // Create 5 F&O stocks with lower 21D returns: 9%, 8%, 7%, 6%, 5%
      const fnoStocks = [
        createMockRawStock('FNO_TOP', 9.0),
        createMockRawStock('FNO_2', 8.0),
        createMockRawStock('FNO_3', 7.0),
        createMockRawStock('FNO_4', 6.0),
        createMockRawStock('FNO_5', 5.0),
      ];

      const allNsePool = [...nonFnoStocks, ...fnoStocks]; // N = 10
      const fnoPool = [...fnoStocks]; // N = 5

      const reportAllNse = MomentumLeadersService.buildUniverseReport(allNsePool, 'ALL_NSE', 10, '2026-09-01');
      const reportFno = MomentumLeadersService.buildUniverseReport(fnoPool, 'NSE_FNO', 5, '2026-09-01');

      assert.equal(reportAllNse.universe, 'ALL_NSE');
      assert.equal(reportAllNse.qualifiedCount, 10);
      assert.equal(reportFno.universe, 'NSE_FNO');
      assert.equal(reportFno.qualifiedCount, 5);

      // In F&O universe: FNO_TOP has the highest return (9%) => Rank #1 out of 5 => Percentile = 100.0
      const fnoTopInFno = reportFno.allStocks.find(s => s.symbol === 'FNO_TOP')!;
      assert.equal(fnoTopInFno.windows.w21d.rank, 1);
      assert.equal(fnoTopInFno.windows.w21d.percentile, 100.0);
      assert.equal(fnoTopInFno.windows.w21d.isLeader, true);

      // In ALL_NSE universe: FNO_TOP is behind all 5 non-F&O stocks (50..10%) => Rank #6 out of 10
      // Percentile = ((10 - 6) / (10 - 1)) * 100 = (4 / 9) * 100 = 44.44%
      const fnoTopInAllNse = reportAllNse.allStocks.find(s => s.symbol === 'FNO_TOP')!;
      assert.equal(fnoTopInAllNse.windows.w21d.rank, 6);
      assert.equal(fnoTopInAllNse.windows.w21d.percentile, 44.44);
      assert.equal(fnoTopInAllNse.windows.w21d.isLeader, false);

      // Confirm F&O composite score and rank are NOT identical to ALL_NSE
      assert.notEqual(fnoTopInFno.compositeScore, fnoTopInAllNse.compositeScore);
      assert.ok(fnoTopInFno.compositeScore > fnoTopInAllNse.compositeScore, 'FNO_TOP must have higher score in F&O view');
    });

    it('handles empty universe pool gracefully', () => {
      const emptyReport = MomentumLeadersService.buildUniverseReport([], 'ALL_NSE', 100, '2026-09-01');
      assert.equal(emptyReport.universe, 'ALL_NSE');
      assert.equal(emptyReport.qualifiedCount, 0);
      assert.equal(emptyReport.allStocks.length, 0);
      assert.equal(emptyReport.status, 'ready');
    });
  });

  describe('Circuit Lock Detection (detectCircuitLock)', () => {
    it('detects 20% upper circuit lock for TBZ (+19.99%), DYCL (+19.95%), and GHCLTEXTIL (+19.89%)', () => {
      const tbz = MomentumLeadersService.detectCircuitLock(19.99);
      assert.equal(tbz.isCircuitLocked, true);
      assert.equal(tbz.circuitLimitPct, 20.0);

      const dycl = MomentumLeadersService.detectCircuitLock(19.95);
      assert.equal(dycl.isCircuitLocked, true);
      assert.equal(dycl.circuitLimitPct, 20.0);

      const ghcl = MomentumLeadersService.detectCircuitLock(19.89);
      assert.equal(ghcl.isCircuitLocked, true);
      assert.equal(ghcl.circuitLimitPct, 20.0);

      const exact20 = MomentumLeadersService.detectCircuitLock(20.00);
      assert.equal(exact20.isCircuitLocked, true);
      assert.equal(exact20.circuitLimitPct, 20.0);
    });

    it('detects 10% and 5% circuit locks accurately', () => {
      const lock10 = MomentumLeadersService.detectCircuitLock(9.98);
      assert.equal(lock10.isCircuitLocked, true);
      assert.equal(lock10.circuitLimitPct, 10.0);

      const lock5 = MomentumLeadersService.detectCircuitLock(4.99);
      assert.equal(lock5.isCircuitLocked, true);
      assert.equal(lock5.circuitLimitPct, 5.0);
    });

    it('detects lower circuit limits on large negative 1D drops', () => {
      const lower20 = MomentumLeadersService.detectCircuitLock(-19.95);
      assert.equal(lower20.isCircuitLocked, true);
      assert.equal(lower20.circuitLimitPct, 20.0);

      const lower10 = MomentumLeadersService.detectCircuitLock(-10.00);
      assert.equal(lower10.isCircuitLocked, true);
      assert.equal(lower10.circuitLimitPct, 10.0);

      const lower5 = MomentumLeadersService.detectCircuitLock(-4.95);
      assert.equal(lower5.isCircuitLocked, true);
      assert.equal(lower5.circuitLimitPct, 5.0);
    });

    it('does not flag normal liquid non-circuit returns', () => {
      const normalReturns = [0.0, 1.5, 3.2, 7.5, 12.0, 14.8, 16.5, 23.0, -2.5, -8.0, -14.0];
      for (const ret of normalReturns) {
        const res = MomentumLeadersService.detectCircuitLock(ret);
        assert.equal(res.isCircuitLocked, false, `Return ${ret}% should NOT be flagged as circuit lock`);
        assert.equal(res.circuitLimitPct, null);
      }
    });

    it('strictly enforces the ±0.20% tolerance boundary around 20%, 10%, 5%', () => {
      // 20% boundary [19.80, 20.20]
      assert.equal(MomentumLeadersService.detectCircuitLock(19.80).isCircuitLocked, true);
      assert.equal(MomentumLeadersService.detectCircuitLock(20.20).isCircuitLocked, true);
      assert.equal(MomentumLeadersService.detectCircuitLock(19.79).isCircuitLocked, false);
      assert.equal(MomentumLeadersService.detectCircuitLock(20.21).isCircuitLocked, false);

      // 10% boundary [9.80, 10.20]
      assert.equal(MomentumLeadersService.detectCircuitLock(9.80).isCircuitLocked, true);
      assert.equal(MomentumLeadersService.detectCircuitLock(10.20).isCircuitLocked, true);
      assert.equal(MomentumLeadersService.detectCircuitLock(9.79).isCircuitLocked, false);
      assert.equal(MomentumLeadersService.detectCircuitLock(10.21).isCircuitLocked, false);

      // 5% boundary [4.80, 5.20]
      assert.equal(MomentumLeadersService.detectCircuitLock(4.80).isCircuitLocked, true);
      assert.equal(MomentumLeadersService.detectCircuitLock(5.20).isCircuitLocked, true);
      assert.equal(MomentumLeadersService.detectCircuitLock(4.79).isCircuitLocked, false);
      assert.equal(MomentumLeadersService.detectCircuitLock(5.21).isCircuitLocked, false);
    });

    it('attaches isCircuitLocked and circuitLimitPct to MomentumStock in buildUniverseReport', () => {
      const rawLocked = createMockRawStock('LOCKED_STOCK', 30.0, 19.95);
      const rawNormal = createMockRawStock('NORMAL_STOCK', 30.0, 3.50);

      const report = MomentumLeadersService.buildUniverseReport([rawLocked, rawNormal], 'ALL_NSE', 2, '2026-09-01');
      const lockedStock = report.allStocks.find(s => s.symbol === 'LOCKED_STOCK')!;
      const normalStock = report.allStocks.find(s => s.symbol === 'NORMAL_STOCK')!;

      assert.equal(lockedStock.isCircuitLocked, true);
      assert.equal(lockedStock.circuitLimitPct, 20.0);

      assert.equal(normalStock.isCircuitLocked, false);
      assert.equal(normalStock.circuitLimitPct, null);
    });
  });
});
