import { describe, it } from 'node:test';
import assert from 'node:assert';
import { IndexRankingService, IndexShortScoringInputs } from '@/services/overnight/index-ranking.service';

describe('IndexRankingService (STBT SHORT)', () => {
  const baseInputs: IndexShortScoringInputs = {
    tomorrowCprNarrow: false,
    tomorrowBc: 100,
    tomorrowTc: 105,
    todayBc: 90,
    todayTc: 95,
    close: 100,
    high: 110,
    low: 95,
    vwap: 105,
    last15mLow: 95,
    vixElevated: false,
    hasConfirmationCandles: true,
  };

  describe('calculateShortScoreDetails', () => {
    it('returns null if any safety gate fails (vwap, last15mLow, vixElevated, hasConfirmationCandles)', () => {
      assert.strictEqual(IndexRankingService.calculateShortScoreDetails({ ...baseInputs, vwap: null }).score, null);
      assert.strictEqual(IndexRankingService.calculateShortScoreDetails({ ...baseInputs, last15mLow: null }).score, null);
      assert.strictEqual(IndexRankingService.calculateShortScoreDetails({ ...baseInputs, vixElevated: null }).score, null);
      assert.strictEqual(IndexRankingService.calculateShortScoreDetails({ ...baseInputs, hasConfirmationCandles: false }).score, null);
    });

    it('Rule 1: VIX Elevated (25 pts)', () => {
      const result = IndexRankingService.calculateShortScoreDetails({ ...baseInputs, vixElevated: true });
      assert.strictEqual(result.breakdown?.vixElevated, 25);
      assert.strictEqual(result.score, 25);
    });

    it('Rule 2: Lower Value (20 pts) - tomorrow BC and TC both below today BC and TC', () => {
      const inputs = {
        ...baseInputs,
        tomorrowBc: 80,
        tomorrowTc: 85,
        todayBc: 90,
        todayTc: 95,
      };
      const result = IndexRankingService.calculateShortScoreDetails(inputs);
      assert.strictEqual(result.breakdown?.higherValue, 20); // The property is higherValue, but for SHORT it represents "Lower Value"
      assert.strictEqual(result.score, 20);
    });

    it('Rule 3: CPR Narrow (30 pts)', () => {
      const result = IndexRankingService.calculateShortScoreDetails({ ...baseInputs, tomorrowCprNarrow: true });
      assert.strictEqual(result.breakdown?.cprNarrow, 30);
      assert.strictEqual(result.score, 30);
    });

    it('Rule 4: Bearish Confirmation (20 pts) - close < todayBc AND close < vwap', () => {
      const inputs = {
        ...baseInputs,
        close: 85,
        todayBc: 90,
        vwap: 95,
        low: 50, // prevent closeStrength
        last15mLow: 85, // prevent EOD weakness
      };
      const result = IndexRankingService.calculateShortScoreDetails(inputs);
      assert.strictEqual(result.breakdown?.vwap, 20);
      assert.strictEqual(result.score, 20);
    });

    it('Rule 5: EOD Weakness (20 pts) - close < last15mLow', () => {
      const inputs = {
        ...baseInputs,
        close: 95,
        last15mLow: 100,
        low: 50, // prevent closeStrength
      };
      const result = IndexRankingService.calculateShortScoreDetails(inputs);
      assert.strictEqual(result.breakdown?.liquidity, 20);
      assert.strictEqual(result.score, 20);
    });

    it('Rule 6: Closing Weakness (15 pts) - close in bottom 30% of day range', () => {
      const inputs = {
        ...baseInputs,
        low: 100,
        high: 200,
        close: 120, // (120-100)/(200-100) = 0.20 < 0.30
      };
      const result = IndexRankingService.calculateShortScoreDetails(inputs);
      assert.strictEqual(result.breakdown?.closeStrength, 15);
      assert.strictEqual(result.score, 15);
    });

    it('accumulates all points perfectly (Max 130)', () => {
      const inputs: IndexShortScoringInputs = {
        tomorrowCprNarrow: true, // +30
        tomorrowBc: 80, // +20 (Lower value)
        tomorrowTc: 85,
        todayBc: 90,
        todayTc: 95,
        close: 85, // +20 (Bearish confirmation) + 15 (Closing weakness)
        low: 80,
        high: 100,
        vwap: 100,
        last15mLow: 90, // +20 (EOD weakness)
        vixElevated: true, // +25
        hasConfirmationCandles: true,
      };
      
      const result = IndexRankingService.calculateShortScoreDetails(inputs);
      assert.strictEqual(result.score, 130);
      assert.deepStrictEqual(result.breakdown, {
        vixElevated: 25,
        cprNarrow: 30,
        higherValue: 20,
        vwap: 20,
        liquidity: 20,
        closeStrength: 15,
      });
    });
  });

  describe('getShortClassification', () => {
    it('classifies thresholds correctly (100/85/70)', () => {
      assert.strictEqual(IndexRankingService.getShortClassification(null), 'IGNORE');
      assert.strictEqual(IndexRankingService.getShortClassification(69), 'IGNORE');
      assert.strictEqual(IndexRankingService.getShortClassification(70), 'INDEX_WATCH');
      assert.strictEqual(IndexRankingService.getShortClassification(84), 'INDEX_WATCH');
      assert.strictEqual(IndexRankingService.getShortClassification(85), 'INDEX_READY');
      assert.strictEqual(IndexRankingService.getShortClassification(99), 'INDEX_READY');
      assert.strictEqual(IndexRankingService.getShortClassification(100), 'INDEX_STRONG');
      assert.strictEqual(IndexRankingService.getShortClassification(130), 'INDEX_STRONG');
    });
  });
});
