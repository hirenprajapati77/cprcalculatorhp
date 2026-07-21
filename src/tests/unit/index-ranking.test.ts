import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IndexRankingService,
  IndexScoringInputs,
  INDEX_SCORE,
  INDIA_VIX_CALM_MAX,
  INDIA_VIX_ELEVATED_MIN,
} from '../../services/overnight/index-ranking.service';
import { ADVANCED_SCORE } from '../../config/trading-constants';

function baseInputs(partial: Partial<IndexScoringInputs> = {}): IndexScoringInputs {
  return {
    tomorrowCprNarrow: false,
    tomorrowBc: 100,
    tomorrowTc: 102,
    todayBc: 100,
    todayTc: 102,
    close: 101,
    high: 110,
    low: 90,
    vwap: 100,
    last15mHigh: 100,
    vixCalm: false,
    hasConfirmationCandles: true,
    ...partial,
  };
}

/** All six rules true → max 130. */
function allRulesInputs(partial: Partial<IndexScoringInputs> = {}): IndexScoringInputs {
  return baseInputs({
    vixCalm: true,
    tomorrowCprNarrow: true,
    tomorrowBc: 105,
    tomorrowTc: 108,
    todayBc: 100,
    todayTc: 102,
    close: 110,
    high: 112,
    low: 90,
    vwap: 106,
    last15mHigh: 105,
    ...partial,
  });
}

describe('IndexRankingService.calculateScoreDetails — score safety', () => {
  it('returns null score when vwap is missing', () => {
    const result = IndexRankingService.calculateScoreDetails(baseInputs({ vwap: null }));
    assert.equal(result.score, null);
    assert.equal(result.breakdown, null);
  });

  it('returns null score when last15mHigh is missing', () => {
    const result = IndexRankingService.calculateScoreDetails(baseInputs({ last15mHigh: null }));
    assert.equal(result.score, null);
    assert.equal(result.breakdown, null);
  });

  it('returns null score when vixCalm is null/undefined', () => {
    assert.equal(IndexRankingService.calculateScoreDetails(baseInputs({ vixCalm: null })).score, null);
    assert.equal(
      IndexRankingService.calculateScoreDetails(baseInputs({ vixCalm: undefined })).score,
      null
    );
  });

  it('returns null score when confirmation candles are unavailable', () => {
    const result = IndexRankingService.calculateScoreDetails(
      baseInputs({ hasConfirmationCandles: false })
    );
    assert.equal(result.score, null);
    assert.equal(result.breakdown, null);
  });
});

describe('IndexRankingService.calculateScoreDetails — rules', () => {
  it('Rule 1: awards vixCalm (25) only when vixCalm is true', () => {
    const calm = IndexRankingService.calculateScoreDetails(baseInputs({ vixCalm: true }));
    const notCalm = IndexRankingService.calculateScoreDetails(baseInputs({ vixCalm: false }));
    assert.equal(calm.breakdown?.vixCalm, 25);
    assert.equal(notCalm.breakdown?.vixCalm, 0);
  });

  it('Rule 2: awards cprNarrow (30) only when tomorrowCprNarrow is true', () => {
    const narrow = IndexRankingService.calculateScoreDetails(baseInputs({ tomorrowCprNarrow: true }));
    const notNarrow = IndexRankingService.calculateScoreDetails(baseInputs({ tomorrowCprNarrow: false }));
    assert.equal(narrow.breakdown?.cprNarrow, 30);
    assert.equal(notNarrow.breakdown?.cprNarrow, 0);
  });

  it('Rule 3: awards higherValue (20) only when both tomorrow BC and TC exceed today', () => {
    const higher = IndexRankingService.calculateScoreDetails(
      baseInputs({ tomorrowBc: 105, tomorrowTc: 108, todayBc: 100, todayTc: 102 })
    );
    const notHigher = IndexRankingService.calculateScoreDetails(
      baseInputs({ tomorrowBc: 99, tomorrowTc: 108, todayBc: 100, todayTc: 102 })
    );
    assert.equal(higher.breakdown?.higherValue, 20);
    assert.equal(notHigher.breakdown?.higherValue, 0);
  });

  it('Rule 4: awards vwap confirmation (20) only when close beats both TC and VWAP', () => {
    const confirmed = IndexRankingService.calculateScoreDetails(
      baseInputs({ todayTc: 100, close: 105, vwap: 103 })
    );
    const notConfirmed = IndexRankingService.calculateScoreDetails(
      baseInputs({ todayTc: 100, close: 105, vwap: 106 })
    );
    assert.equal(confirmed.breakdown?.vwap, 20);
    assert.equal(notConfirmed.breakdown?.vwap, 0);
  });

  it('Rule 5: awards liquidity (20) only when close > last15mHigh', () => {
    const ok = IndexRankingService.calculateScoreDetails(
      baseInputs({ close: 105, last15mHigh: 104 })
    );
    const no = IndexRankingService.calculateScoreDetails(
      baseInputs({ close: 105, last15mHigh: 105 })
    );
    assert.equal(ok.breakdown?.liquidity, 20);
    assert.equal(no.breakdown?.liquidity, 0);
  });

  it('Rule 6: awards closeStrength (15) only when CLV > 0.70', () => {
    // CLV = (110-90)/(112-90) = 20/22 ≈ 0.909 > 0.70
    const strong = IndexRankingService.calculateScoreDetails(
      baseInputs({ close: 110, high: 112, low: 90 })
    );
    // CLV = (100-90)/(112-90) = 10/22 ≈ 0.455
    const weak = IndexRankingService.calculateScoreDetails(
      baseInputs({ close: 100, high: 112, low: 90 })
    );
    assert.equal(strong.breakdown?.closeStrength, 15);
    assert.equal(weak.breakdown?.closeStrength, 0);
  });

  it('sums all six rules to a max score of 130', () => {
    const result = IndexRankingService.calculateScoreDetails(allRulesInputs());
    assert.equal(result.score, 130);
    assert.equal(result.breakdown?.vixCalm, 25);
    assert.equal(result.breakdown?.cprNarrow, 30);
    assert.equal(result.breakdown?.higherValue, 20);
    assert.equal(result.breakdown?.vwap, 20);
    assert.equal(result.breakdown?.liquidity, 20);
    assert.equal(result.breakdown?.closeStrength, 15);
  });
});

describe('IndexRankingService.getClassification', () => {
  it('maps null score to IGNORE', () => {
    assert.equal(IndexRankingService.getClassification(null), 'IGNORE');
  });

  it('maps floors 100 / 85 / 70 to INDEX_STRONG / INDEX_READY / INDEX_WATCH', () => {
    assert.equal(IndexRankingService.getClassification(130), 'INDEX_STRONG');
    assert.equal(IndexRankingService.getClassification(100), 'INDEX_STRONG');
    assert.equal(IndexRankingService.getClassification(99), 'INDEX_READY');
    assert.equal(IndexRankingService.getClassification(85), 'INDEX_READY');
    assert.equal(IndexRankingService.getClassification(84), 'INDEX_WATCH');
    assert.equal(IndexRankingService.getClassification(70), 'INDEX_WATCH');
    assert.equal(IndexRankingService.getClassification(69), 'IGNORE');
    assert.equal(IndexRankingService.getClassification(0), 'IGNORE');
  });

  it('uses index-specific classification strings that cannot collide with stock filters', () => {
    const cls = IndexRankingService.getClassification(100);
    assert.notEqual(cls, 'STRONG_BTST');
    assert.notEqual(cls, 'BTST_READY');
  });
});

describe('INDEX_SCORE / India VIX constants', () => {
  it('INDEX_SCORE mirrors ADVANCED_SCORE floors (STRONG/READY/WATCH/MAX)', () => {
    assert.equal(INDEX_SCORE.STRONG, ADVANCED_SCORE.STRONG);
    assert.equal(INDEX_SCORE.READY, ADVANCED_SCORE.READY);
    assert.equal(INDEX_SCORE.WATCH, ADVANCED_SCORE.WATCH);
    assert.equal(INDEX_SCORE.MAX, ADVANCED_SCORE.MAX);
    assert.equal(INDEX_SCORE.STRONG, 100);
    assert.equal(INDEX_SCORE.READY, 85);
    assert.equal(INDEX_SCORE.WATCH, 70);
    assert.equal(INDEX_SCORE.MAX, 130);
  });

  it('exposes India VIX calm/elevated thresholds', () => {
    assert.equal(INDIA_VIX_CALM_MAX, 20);
    assert.equal(INDIA_VIX_ELEVATED_MIN, 25);
  });
});
