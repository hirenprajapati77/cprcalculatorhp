/**
 * Focused regression for premium TRADEABLE journal pipeline.
 * Mirrors btst-journal/route.ts selection gates without hitting the DB.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

type FakeSignal = {
  symbol: string;
  signalDate: string;
  direction: 'LONG' | 'SHORT';
  overnightScore: number | null;
  classification: string;
  qualityBucket: string | null;
};

const LONG_READY = new Set(['STRONG_BTST', 'BTST_READY']);
const SHORT_READY = new Set(['STRONG_STBT', 'STBT_READY']);
const MIN_SCORE = 85;

function pickTradableTops(
  rows: FakeSignal[],
  signalDate: string,
  regimeTrend: 'BULL' | 'BEAR' | 'CHOPPY'
) {
  const base = rows.filter(
    (r) =>
      r.signalDate === signalDate &&
      r.qualityBucket === 'TRADEABLE' &&
      (r.overnightScore ?? 0) >= MIN_SCORE
  );

  const topLongs = base
    .filter((r) => r.direction === 'LONG' && LONG_READY.has(r.classification))
    .sort((a, b) => (b.overnightScore ?? 0) - (a.overnightScore ?? 0))
    .slice(0, 2);

  const topShortsRaw = base
    .filter((r) => r.direction === 'SHORT' && SHORT_READY.has(r.classification))
    .sort((a, b) => (b.overnightScore ?? 0) - (a.overnightScore ?? 0))
    .slice(0, 2);

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
});
