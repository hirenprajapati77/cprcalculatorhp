import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RankingService } from '@/services/ranking.service';

function base(signals: string[]) {
  return {
    symbol: 'TEST',
    ltp: 100,
    open: 99,
    high: 101,
    low: 98,
    close: 100,
    volume: 200_000,
    avgVolume: 100_000,
    width: 0.2,
    tc: 101,
    bc: 99,
    pivot: 100,
    r1: 103,
    r2: 105,
    r3: 107,
    r4: 109,
    s1: 97,
    s2: 95,
    s3: 93,
    s4: 91,
    classification: 'NARROW' as const,
    signals,
    sector: 'Test',
    marketCap: 1e10,
    market: 'NSE' as const,
    entry: 100,
    sl: 98,
    target: 110,
    rr: '1:2.0',
    confidence: 70,
  };
}

describe('RankingService bidirectional parity', () => {
  it('awards LOWER_VALUE the same as HIGHER_VALUE', () => {
    const higher = RankingService.calculateScore(base(['HIGHER_VALUE']));
    const lower = RankingService.calculateScore(base(['LOWER_VALUE']));
    assert.equal(lower, higher);
    assert.ok(lower >= 10);
  });

  it('awards BREAKDOWN the same as BREAKOUT', () => {
    const up = RankingService.calculateScore(base(['BREAKOUT']));
    const down = RankingService.calculateScore(base(['BREAKDOWN']));
    assert.equal(down, up);
    assert.ok(down >= 10);
  });

  it('awards EMA_BEAR_ALIGN + RSI_BEARISH continuation like bull twin', () => {
    const baseline = RankingService.calculateScore(base([]));
    const bull = RankingService.calculateScore(base(['EMA_BULL_ALIGN', 'RSI_STRONG']));
    const bear = RankingService.calculateScore(base(['EMA_BEAR_ALIGN', 'RSI_BEARISH']));
    assert.equal(bear, bull);
    assert.equal(bull - baseline, 5);
  });
});
