/**
 * Focused regression for premium TRADEABLE journal pipeline.
 * Mirrors btst-journal/route.ts selection via selectTradableOvernightPicks.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { OvernightSignal } from '@prisma/client';
import { selectTradableOvernightPicks } from '../../services/overnight/overnight-ui-adapter';
import { BTST_CLOCK } from '../../lib/market-hours';

type FakeSignal = {
  symbol: string;
  signalDate: string;
  direction: 'LONG' | 'SHORT';
  overnightScore: number | null;
  classification: string;
  qualityBucket: string | null;
  signalTime?: string;
};

const MIN_SCORE = 85;

function asOvernight(rows: FakeSignal[]): OvernightSignal[] {
  return rows.map((r, i) => ({
    id: String(i),
    symbol: r.symbol,
    signalDate: r.signalDate,
    signalTime: r.signalTime ?? BTST_CLOCK.confirmStart,
    direction: r.direction,
    entry: 100,
    stopLoss: 98,
    target: 104,
    overnightScore: r.overnightScore,
    expectedGap: null,
    expectedMove: null,
    confidence: 70,
    exitStrategy: 'EOD',
    actualExit: null,
    actualReturn: null,
    executed: false,
    classification: r.classification,
    freezeTime: null,
    rejectionReason: null,
    historyQuality: 100,
    liquidityQuality: 100,
    eventRisk: 0,
    regimeFit: 100,
    conflictConfidence: 100,
    qualityModelVersion: 1,
    qualityBucket: r.qualityBucket,
    eventRiskReason: null,
    relativeStrength: 1,
    slippageModelVersion: null,
    regimeSnapshot: null,
    createdAt: new Date(),
  }));
}

function pickTradableTops(
  rows: FakeSignal[],
  signalDate: string,
  regimeTrend: 'BULL' | 'BEAR' | 'CHOPPY'
) {
  const today = rows.filter((r) => r.signalDate === signalDate);
  const { longs: topLongs, shorts: topShortsRaw } = selectTradableOvernightPicks(
    asOvernight(today),
    { minScore: MIN_SCORE, take: 2, suppressShort: false }
  );
  const topShorts = regimeTrend === 'BULL' ? [] : topShortsRaw;
  return { topLongs, topShorts, topShortsRaw };
}

describe('btst-journal premium TRADEABLE pipeline', () => {
  const today = '2026-07-17';

  const rows: FakeSignal[] = [
    { symbol: 'A', signalDate: today, direction: 'LONG', overnightScore: 100, classification: 'STRONG_BTST', qualityBucket: 'TRADEABLE' },
    { symbol: 'B', signalDate: today, direction: 'LONG', overnightScore: 90, classification: 'BTST_READY', qualityBucket: 'TRADEABLE' },
    { symbol: 'C', signalDate: today, direction: 'LONG', overnightScore: 88, classification: 'WATCH', qualityBucket: 'TRADEABLE' },
    { symbol: 'D', signalDate: today, direction: 'LONG', overnightScore: 95, classification: 'BTST_READY', qualityBucket: 'WATCHLIST' },
    { symbol: 'E', signalDate: today, direction: 'SHORT', overnightScore: 95, classification: 'STRONG_STBT', qualityBucket: 'TRADEABLE' },
    { symbol: 'F', signalDate: today, direction: 'SHORT', overnightScore: 88, classification: 'STBT_READY', qualityBucket: 'TRADEABLE' },
    { symbol: 'G', signalDate: today, direction: 'SHORT', overnightScore: 80, classification: 'STBT_READY', qualityBucket: 'TRADEABLE' },
    { symbol: 'H', signalDate: today, direction: 'LONG', overnightScore: 99, classification: 'IGNORE', qualityBucket: 'TRADEABLE' },
  ];

  it('picks only TRADEABLE + READY+ (>=85), excluding WATCH/WATCHLIST/IGNORE', () => {
    const { topLongs, topShorts } = pickTradableTops(rows, today, 'CHOPPY');
    assert.deepEqual(topLongs.map((r) => r.symbol), ['A', 'B']);
    assert.deepEqual(topShorts.map((r) => r.symbol), ['E', 'F']);
    for (const r of [...topLongs, ...topShorts]) {
      assert.equal(r.qualityBucket, 'TRADEABLE');
      assert.ok((r.overnightScore ?? 0) >= 85);
    }
  });

  it('suppresses STBT entirely in BULL regime', () => {
    const { topLongs, topShorts, topShortsRaw } = pickTradableTops(rows, today, 'BULL');
    assert.deepEqual(topLongs.map((r) => r.symbol), ['A', 'B']);
    assert.equal(topShorts.length, 0);
    assert.ok(topShortsRaw.length >= 1, 'would have had shorts without regime gate');
  });

  it('allows STBT in BEAR regime', () => {
    const { topShorts } = pickTradableTops(rows, today, 'BEAR');
    assert.deepEqual(topShorts.map((r) => r.symbol), ['E', 'F']);
  });

  it('returns empty when only weak/non-tradable rows exist', () => {
    const weak: FakeSignal[] = [
      { symbol: 'X', signalDate: today, direction: 'LONG', overnightScore: 70, classification: 'WATCH', qualityBucket: 'WATCHLIST' },
    ];
    const { topLongs, topShorts } = pickTradableTops(weak, today, 'CHOPPY');
    assert.equal(topLongs.length, 0);
    assert.equal(topShorts.length, 0);
  });

  it('does not let duplicate signalTime rows for one symbol fill both top-2 slots', () => {
    const dupes: FakeSignal[] = [
      { symbol: 'JIOFIN', signalDate: today, direction: 'LONG', overnightScore: 110, classification: 'STRONG_BTST', qualityBucket: 'TRADEABLE', signalTime: '15:10' },
      { symbol: 'JIOFIN', signalDate: today, direction: 'LONG', overnightScore: 108, classification: 'BTST_READY', qualityBucket: 'TRADEABLE', signalTime: '15:20' },
      { symbol: 'HDFCBANK', signalDate: today, direction: 'LONG', overnightScore: 95, classification: 'BTST_READY', qualityBucket: 'TRADEABLE', signalTime: '15:10' },
    ];
    const { topLongs } = pickTradableTops(dupes, today, 'CHOPPY');
    assert.deepEqual(topLongs.map((r) => r.symbol), ['JIOFIN', 'HDFCBANK']);
  });
});
