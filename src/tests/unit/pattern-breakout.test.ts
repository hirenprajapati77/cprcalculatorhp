import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PatternBreakoutService,
  OhlcvCandle,
} from '@/services/market-tools/pattern-breakout.service';

describe('PatternBreakoutService - Pattern Detection & Scoring Unit Tests', () => {

  // Helper to generate synthetic candles
  function generateCandles(count: number, basePrice: number, dailyVol = 100000): OhlcvCandle[] {
    const candles: OhlcvCandle[] = [];
    const current = basePrice;
    for (let i = 0; i < count; i++) {
      const dateStr = `2026-01-${String(i + 1).padStart(2, '0')}`;
      const open = current;
      const high = current * 1.01;
      const low = current * 0.99;
      const close = current;
      candles.push({
        date: dateStr,
        open,
        high,
        low,
        close,
        volume: dailyVol,
      });
    }
    return candles;
  }

  describe('Cup & Handle Heuristic Detection', () => {
    it('should detect a valid U-shaped Cup with Handle pullback', () => {
      // 70 candles:
      // Left lip at 100 (candles 0-15)
      // Basin down to 75 (candles 25-35, depth 25%)
      // Right lip recovery back to 98 (candles 45-55, lipDiff ~2%)
      // Handle drifting down to 92 (candles 58-69, pullback ~6%, stays above midpoint 87.5)
      const candles: OhlcvCandle[] = [];
      const total = 70;
      for (let i = 0; i < total; i++) {
        let price = 100;
        let vol = 100000;
        if (i < 15) {
          price = 100;
          vol = 120000;
        } else if (i < 35) {
          // downward cup slope
          const progress = (i - 15) / 20;
          price = 100 - progress * 25; // bottom at 75
          vol = 80000;
        } else if (i < 55) {
          // upward cup recovery
          const progress = (i - 35) / 20;
          price = 75 + progress * 23; // recovery to 98
          vol = 110000;
        } else {
          // handle
          const progress = (i - 55) / 15;
          price = 98 - progress * 5; // drifts to 93
          vol = 45000; // volume dry-up in handle
        }

        candles.push({
          date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
          open: price,
          high: price * 1.005,
          low: price * 0.995,
          close: price,
          volume: vol,
        });
      }

      const result = PatternBreakoutService.detectCupAndHandle(candles, 100);
      assert.ok(result !== null, 'Should detect Cup & Handle pattern');
      assert.equal(result.type, 'CUP_AND_HANDLE');
      assert.ok(result.baseDepthPct >= 15 && result.baseDepthPct <= 30, 'Cup depth should be ~25%');
      assert.ok(result.confidence > 60, 'Confidence should be strong');
    });

    it('should reject a cup that drops too deep (> 35%)', () => {
      const candles = generateCandles(70, 100);
      // Force basin to drop 50%
      for (let i = 25; i < 35; i++) {
        candles[i].low = 45;
        candles[i].close = 48;
      }
      const result = PatternBreakoutService.detectCupAndHandle(candles, 100);
      assert.equal(result, null, 'Deep >35% drop should be rejected');
    });
  });

  describe('Flat Base Heuristic Detection', () => {
    it('should detect a tight horizontal consolidation channel <= 15%', () => {
      // 30 candles within 95 to 100 (range 5%, baseHigh near 52W high of 100)
      const candles: OhlcvCandle[] = [];
      for (let i = 0; i < 30; i++) {
        const price = 96 + (i % 4);
        candles.push({
          date: `2026-03-${String(i + 1).padStart(2, '0')}`,
          open: price,
          high: price + 1,
          low: price - 1,
          close: price,
          volume: 50000,
        });
      }

      const result = PatternBreakoutService.detectFlatBase(candles, 100);
      assert.ok(result !== null, 'Should detect Flat Base');
      assert.equal(result.type, 'FLAT_BASE');
      assert.ok(result.baseDepthPct <= 15, 'Base depth must be <= 15%');
      assert.ok(result.baseDays >= 20, 'Base days must be >= 20');
    });

    it('should reject a volatile consolidation > 15%', () => {
      const candles: OhlcvCandle[] = [];
      for (let i = 0; i < 30; i++) {
        const price = i % 2 === 0 ? 80 : 100; // 20% range
        candles.push({
          date: `2026-03-${String(i + 1).padStart(2, '0')}`,
          open: price,
          high: price + 2,
          low: price - 2,
          close: price,
          volume: 50000,
        });
      }

      const result = PatternBreakoutService.detectFlatBase(candles, 100);
      assert.equal(result, null, 'Volatile channel > 15% must be rejected');
    });
  });

  describe('Double Bottom Heuristic Detection', () => {
    it('should detect W-pattern with two comparable troughs and intermediate peak', () => {
      const candles: OhlcvCandle[] = [];
      const total = 55;
      for (let i = 0; i < total; i++) {
        let price = 90;
        if (i < 15) {
          price = 100 - (i / 15) * 20; // L1 trough at ~80 (idx 14)
        } else if (i < 28) {
          price = 80 + ((i - 15) / 13) * 15; // M_peak at ~95 (idx 27, 18.7% rise)
        } else if (i < 42) {
          price = 95 - ((i - 28) / 14) * 15; // L2 trough at ~80 (idx 41)
        } else {
          price = 80 + ((i - 42) / 13) * 16; // Current recovery to 96 (breaking pivot)
        }

        candles.push({
          date: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
          open: price,
          high: price + 1,
          low: price - 1,
          close: price,
          volume: 60000,
        });
      }

      const result = PatternBreakoutService.detectDoubleBottom(candles, 100);
      assert.ok(result !== null, 'Should detect Double Bottom');
      assert.equal(result.type, 'DOUBLE_BOTTOM');
      assert.ok(result.baseDepthPct >= 7, 'Peak rise must be >= 7%');
    });
  });

  describe('VCP (Volatility Contraction Pattern) Detection', () => {
    it('should detect progressive 2-stage contraction', () => {
      const candles: OhlcvCandle[] = [];
      const total = 70;
      // Wave 1: 0 to 38, price swings from 100 down to 78 (22% depth)
      // Wave 2: 39 to 69, price swings from 96 down to 88 (8.3% depth, contracted from 22%)
      for (let i = 0; i < total; i++) {
        let high = 100, low = 95, close = 98;
        if (i < 38) {
          if (i === 15) low = 78;
          high = 100;
          close = 90;
        } else {
          if (i === 55) low = 88;
          high = 96;
          close = 95;
        }

        candles.push({
          date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
          open: close,
          high,
          low,
          close,
          volume: i < 38 ? 100000 : 50000,
        });
      }

      const result = PatternBreakoutService.detectVcp(candles, 100);
      assert.ok(result !== null, 'Should detect VCP');
      assert.equal(result.type, 'VCP');
      assert.ok(result.baseDepthPct <= 18, 'Wave 2 contraction depth must be tight');
    });
  });

  describe('Composite Scoring Engine', () => {
    it('should compute A+ Tier score (>= 85) for Breakout + VCP + Heavy RVOL', () => {
      const candles = generateCandles(60, 100);
      // upward momentum
      candles[59].close = 120;
      candles[39].close = 100;

      const score = PatternBreakoutService.computeScore({
        status: 'BREAKOUT',
        distanceToHighPct: 2.5,
        rvol20d: 3.2, // Heavy RVOL -> 25 pts
        primaryPattern: 'VCP', // 20 pts (+5 tightness bonus)
        patternDetails: {
          type: 'VCP',
          label: 'VCP',
          baseDepthPct: 8.5,
          baseDays: 45,
          confidence: 90,
          description: 'test',
        },
        candles,
      });

      assert.ok(score.totalScore >= 85, `Total score ${score.totalScore} should be >= 85`);
      assert.equal(score.qualityTier, 'A+');
      assert.equal(score.proximityScore, 30);
      assert.equal(score.volumeScore, 25);
      assert.equal(score.patternScore, 25);
    });

    it('should compute developing score for Near High with modest volume and raw 52W baseline', () => {
      const candles = generateCandles(60, 100);
      const score = PatternBreakoutService.computeScore({
        status: 'NEAR_HIGH',
        distanceToHighPct: -3.0,
        rvol20d: 1.1,
        primaryPattern: 'NONE',
        patternDetails: null,
        candles,
      });

      assert.ok(score.totalScore >= 20 && score.totalScore <= 60, `Score ${score.totalScore} should be in reasonable range`);
      assert.ok(score.proximityScore < 30 && score.proximityScore >= 15);
      assert.equal(score.patternScore, 5); // Base points for raw 52W high
    });

    it('should maintain strict deterministic pattern hierarchy tie-breaker', () => {
      const detected = [
        { type: 'FLAT_BASE' as const, label: 'Flat Base', baseDepthPct: 10, baseDays: 25, confidence: 80, description: '' },
        { type: 'VCP' as const, label: 'VCP', baseDepthPct: 8, baseDays: 50, confidence: 90, description: '' },
        { type: 'CUP_AND_HANDLE' as const, label: 'Cup & Handle', baseDepthPct: 20, baseDays: 60, confidence: 85, description: '' },
      ];

      const primary = PatternBreakoutService.selectPrimaryPattern(detected);
      assert.equal(primary, 'VCP', 'VCP must take top priority in deterministic tiebreak');
    });
  });
});
