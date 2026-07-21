import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IndexRankingService, IndexScoringInputs, INDEX_SCORE } from '../../services/overnight/index-ranking.service';

function baseInputs(partial: Partial<IndexScoringInputs> = {}): IndexScoringInputs {
  return {
    tomorrowCprNarrow: false,
    tomorrowBc: 100,
    tomorrowTc: 102,
    todayBc: 100,
    todayTc: 102,
    close: 101,
    vwap: 100,
    hasConfirmationCandles: true,
    ...partial,
  };
}

describe('IndexRankingService.calculateScoreDetails', () => {
  it('returns null score when vwap is missing (score safety)', () => {
    const result = IndexRankingService.calculateScoreDetails(baseInputs({ vwap: null }));
    assert.equal(result.score, null);
    assert.equal(result.breakdown, null);
  });

  it('returns null score when confirmation candles are unavailable (score safety)', () => {
    const result = IndexRankingService.calculateScoreDetails(baseInputs({ hasConfirmationCandles: false }));
    assert.equal(result.score, null);
    assert.equal(result.breakdown, null);
  });

  it('awards cprNarrow (40) only when tomorrowCprNarrow is true', () => {
    const narrow = IndexRankingService.calculateScoreDetails(baseInputs({ tomorrowCprNarrow: true }));
    const notNarrow = IndexRankingService.calculateScoreDetails(baseInputs({ tomorrowCprNarrow: false }));
    assert.equal(narrow.breakdown?.cprNarrow, 40);
    assert.equal(notNarrow.breakdown?.cprNarrow, 0);
  });

  it('awards higherValue (30) only when both tomorrow BC and TC exceed today BC and TC', () => {
    const higher = IndexRankingService.calculateScoreDetails(
      baseInputs({ tomorrowBc: 105, tomorrowTc: 108, todayBc: 100, todayTc: 102 })
    );
    const notHigher = IndexRankingService.calculateScoreDetails(
      baseInputs({ tomorrowBc: 99, tomorrowTc: 108, todayBc: 100, todayTc: 102 })
    );
    assert.equal(higher.breakdown?.higherValue, 30);
    assert.equal(notHigher.breakdown?.higherValue, 0);
  });

  it('awards vwap confirmation (30) only when close beats both TC and VWAP', () => {
    const confirmed = IndexRankingService.calculateScoreDetails(
      baseInputs({ todayTc: 100, close: 105, vwap: 103 })
    );
    const notConfirmed = IndexRankingService.calculateScoreDetails(
      baseInputs({ todayTc: 100, close: 105, vwap: 106 })
    );
    assert.equal(confirmed.breakdown?.vwap, 30);
    assert.equal(notConfirmed.breakdown?.vwap, 0);
  });

  it('sums all three rules to a max score of 100', () => {
    const result = IndexRankingService.calculateScoreDetails(
      baseInputs({
        tomorrowCprNarrow: true,
        tomorrowBc: 105, tomorrowTc: 108, todayBc: 100, todayTc: 102,
        close: 110, vwap: 106,
      })
    );
    assert.equal(result.score, 100);
  });
});

describe('IndexRankingService.getClassification', () => {
  it('maps null score to IGNORE', () => {
    assert.equal(IndexRankingService.getClassification(null), 'IGNORE');
  });

  it('maps discrete 40+30+30 buckets to INDEX_STRONG / INDEX_READY / INDEX_WATCH / IGNORE', () => {
    // Achievable totals: 0, 30, 40, 60, 70, 100 — READY=85 is unreachable.
    assert.equal(IndexRankingService.getClassification(100), 'INDEX_STRONG');
    assert.equal(IndexRankingService.getClassification(70), 'INDEX_READY');
    assert.equal(IndexRankingService.getClassification(60), 'INDEX_WATCH');
    assert.equal(IndexRankingService.getClassification(40), 'INDEX_WATCH');
    assert.equal(IndexRankingService.getClassification(30), 'IGNORE');
    assert.equal(IndexRankingService.getClassification(0), 'IGNORE');
  });

  it('uses index-specific classification strings that cannot collide with stock filters', () => {
    const cls = IndexRankingService.getClassification(100);
    assert.notEqual(cls, 'STRONG_BTST');
    assert.notEqual(cls, 'BTST_READY');
  });

  it('exposes INDEX_SCORE.READY=70 as the option-suggestion floor (not WATCH=40)', () => {
    assert.equal(INDEX_SCORE.WATCH, 40);
    assert.equal(INDEX_SCORE.READY, 70);
    assert.ok(INDEX_SCORE.READY > INDEX_SCORE.WATCH);
  });
});
