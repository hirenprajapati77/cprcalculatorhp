import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveSessionVolume } from '@/lib/session-volume';
import { BtstRankingService, BtstScoringInputs } from '@/services/overnight/btst-ranking.service';
import { StbtRankingService, StbtScoringInputs } from '@/services/overnight/stbt-ranking.service';

describe('Session Volume Resolution & VDU Scoring Alignment (Task A2)', () => {
  describe('resolveSessionVolume', () => {
    it('prefers intradayVolume when hasIntraday is true and intradayVolume > stockVolume', () => {
      const vol = resolveSessionVolume(50000, 300000, true);
      assert.strictEqual(vol, 300000);
    });

    it('falls back to stockVolume when intradayVolume <= stockVolume even if hasIntraday is true', () => {
      const vol = resolveSessionVolume(500000, 300000, true);
      assert.strictEqual(vol, 500000);
    });

    it('falls back to stockVolume when hasIntraday is false even if intradayVolume > stockVolume', () => {
      const vol = resolveSessionVolume(50000, 300000, false);
      assert.strictEqual(vol, 50000);
    });

    it('handles null, undefined, NaN, and negative values cleanly', () => {
      assert.strictEqual(resolveSessionVolume(null, null, false), 0);
      assert.strictEqual(resolveSessionVolume(undefined, undefined, true), 0);
      assert.strictEqual(resolveSessionVolume(NaN, 10000, true), 10000);
      assert.strictEqual(resolveSessionVolume(-100, 5000, true), 5000);
      assert.strictEqual(resolveSessionVolume(1000, NaN, true), 1000);
      assert.strictEqual(resolveSessionVolume(1000, -500, true), 1000);
    });
  });

  describe('BtstRankingService VDU Rule Alignment', () => {
    const baseInputs: BtstScoringInputs = {
      volume: 50000, // Frozen/stale morning volume (< 2.0x avgVolume)
      avgVolume: 100000,
      tomorrowCprNarrow: true,
      tomorrowBc: 105,
      tomorrowTc: 107,
      todayBc: 100,
      todayTc: 102,
      close: 108,
      high: 110,
      low: 100,
      vwap: 103,
      intradayVolume: 250000, // Live session volume (2.5x avgVolume >= 2.0x SPIKE_RATIO)
      last15mHigh: 107,
      hasConfirmationCandles: true,
      rsi14: 60,
      emaCross: { cross: 'BULLISH', isBullishAlignment: true },
    };

    it('awards 25 VDU points when stock.volume is frozen low but intradayVolume is high', () => {
      const result = BtstRankingService.calculateScoreDetails(baseInputs);
      assert.ok(result.score !== null);
      assert.ok(result.breakdown !== null);
      assert.strictEqual(result.breakdown?.vdu, 25);
    });

    it('awards 0 VDU points when both stock.volume and intradayVolume fail 2.0x SPIKE_RATIO', () => {
      const lowInputs: BtstScoringInputs = {
        ...baseInputs,
        intradayVolume: 150000, // 1.5x avgVolume (< 2.0x)
      };
      const result = BtstRankingService.calculateScoreDetails(lowInputs);
      assert.ok(result.score !== null);
      assert.strictEqual(result.breakdown?.vdu, 0);
    });
  });

  describe('StbtRankingService VDU Rule Alignment', () => {
    const baseInputs: StbtScoringInputs = {
      volume: 50000, // Frozen/stale morning volume (< 2.0x avgVolume)
      avgVolume: 100000,
      tomorrowCprNarrow: true,
      tomorrowBc: 95,
      tomorrowTc: 97,
      todayBc: 100,
      todayTc: 102,
      close: 92,
      high: 102,
      low: 90,
      vwap: 98,
      intradayVolume: 250000, // Live session volume (2.5x avgVolume >= 2.0x SPIKE_RATIO)
      last15mLow: 93,
      hasConfirmationCandles: true,
      rsi14: 40,
      emaCross: { cross: 'BEARISH', isBullishAlignment: false },
    };

    it('awards 25 VDU points when stock.volume is frozen low but intradayVolume is high', () => {
      const result = StbtRankingService.calculateScoreDetails(baseInputs);
      assert.ok(result.score !== null);
      assert.ok(result.breakdown !== null);
      assert.strictEqual(result.breakdown?.vdu, 25);
    });

    it('awards 0 VDU points when both stock.volume and intradayVolume fail 2.0x SPIKE_RATIO', () => {
      const lowInputs: StbtScoringInputs = {
        ...baseInputs,
        intradayVolume: 150000, // 1.5x avgVolume (< 2.0x)
      };
      const result = StbtRankingService.calculateScoreDetails(lowInputs);
      assert.ok(result.score !== null);
      assert.strictEqual(result.breakdown?.vdu, 0);
    });
  });
});
