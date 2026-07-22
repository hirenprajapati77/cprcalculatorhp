import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IndexIntraRankingService,
  INDEX_INTRA_SCORE,
} from '../../services/overnight/index-intra-ranking.service';

describe('IndexIntraRankingService', () => {
  it('awards LOWER_VALUE points (symmetric with HIGHER_VALUE)', () => {
    const withLower = IndexIntraRankingService.calculateScore(
      ['BEARISH', 'LOWER_VALUE', 'NARROW'],
      'SHORT',
      -0.008
    );
    const withoutLower = IndexIntraRankingService.calculateScore(
      ['BEARISH', 'NARROW'],
      'SHORT',
      -0.008
    );
    assert.equal(withLower - withoutLower, 10);
  });

  it('awards session-move points for aligned bearish move', () => {
    const base = IndexIntraRankingService.calculateScore(['BEARISH'], 'SHORT', -0.003);
    const moderate = IndexIntraRankingService.calculateScore(['BEARISH'], 'SHORT', -0.006);
    const strong = IndexIntraRankingService.calculateScore(['BEARISH'], 'SHORT', -0.012);
    assert.ok(moderate > base);
    assert.ok(strong > moderate);
    assert.equal(strong - moderate, 5); // 15 vs 10 session pts
  });

  it('scores BREAKDOWN without volume dependency', () => {
    const score = IndexIntraRankingService.calculateScore(
      ['BEARISH', 'NARROW', 'LOWER_VALUE', 'BREAKDOWN', 'SHORT_BUILD', 'MOMENTUM'],
      'SHORT',
      -0.015
    );
    assert.ok(score >= INDEX_INTRA_SCORE.WATCH);
  });

  it('maps classification using INTRA floors (75 / 60 / 40)', () => {
    assert.equal(IndexIntraRankingService.getClassification(75), 'INDEX_STRONG');
    assert.equal(IndexIntraRankingService.getClassification(74), 'INDEX_READY');
    assert.equal(IndexIntraRankingService.getClassification(60), 'INDEX_READY');
    assert.equal(IndexIntraRankingService.getClassification(59), 'INDEX_WATCH');
    assert.equal(IndexIntraRankingService.getClassification(40), 'INDEX_WATCH');
    assert.equal(IndexIntraRankingService.getClassification(39), 'IGNORE');
  });

  it('caps score at 100', () => {
    const allTags = [
      'NARROW',
      'HIGHER_VALUE',
      'BREAKOUT',
      'LONG_BUILD',
      'KGS_INSIDE_CPR',
      'VIRGIN',
      'KGS_ASC_CPR',
      'BULLISH',
      'MOMENTUM',
      'NORMAL',
      'HOT_ZONE',
      'KGS_RTP',
    ];
    const score = IndexIntraRankingService.calculateScore(allTags, 'LONG', 0.02);
    assert.ok(score <= INDEX_INTRA_SCORE.MAX);
    assert.ok(score >= 85);
  });
});
