import { describe, test } from 'node:test';
import assert from 'node:assert';
import { BtstRankingService } from '../services/overnight/btst-ranking.service';
import { StbtRankingService } from '../services/overnight/stbt-ranking.service';

describe('Overnight Engine Tests', () => {
  test('LONG setup (BTST Scoring Logic)', () => {
    const mockStock = {
      volume: 1200000,
      avgVolume: 800000,
      tomorrowCprWidth: 0.2,
      tomorrowBc: 101,
      todayTc: 100,
      close: 102,
      high: 103,
      low: 99,
      vwap: 100.5,
      intradayVolume: 50000,
      last15mHigh: 102.5,
      hasConfirmationCandles: true
    };

    const score = BtstRankingService.calculateScore(mockStock);
    assert.ok(score !== null);
    assert.ok(score >= 80, `Expected score >= 80, got ${score}`);
  });

  test('SHORT setup (STBT Scoring Logic)', () => {
    const mockStock = {
      volume: 1200000,
      avgVolume: 800000,
      tomorrowCprWidth: 0.2,
      tomorrowTc: 99,
      todayBc: 100,
      close: 98,
      high: 101,
      low: 97,
      vwap: 99.5,
      intradayVolume: 50000,
      last15mLow: 97.5,
      hasConfirmationCandles: true
    };

    const score = StbtRankingService.calculateScore(mockStock);
    assert.ok(score !== null);
    assert.ok(score >= 80, `Expected score >= 80, got ${score}`);
  });
});
