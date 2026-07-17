/**
 * Focused regression for journal pipeline unification.
 * Verifies top-2 LONG/SHORT selection from OvernightSignal-shaped rows
 * (mirrors btst-journal/route.ts query semantics without hitting the DB).
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

function pickJournalTops(rows: FakeSignal[], signalDate: string) {
  const exclude = new Set(['IGNORE', 'NEUTRAL_CONFLICT']);
  const actionable = rows.filter(
    (r) => r.signalDate === signalDate && !exclude.has(r.classification)
  );
  const topLongs = actionable
    .filter((r) => r.direction === 'LONG')
    .sort((a, b) => (b.overnightScore ?? 0) - (a.overnightScore ?? 0))
    .slice(0, 2);
  const topShorts = actionable
    .filter((r) => r.direction === 'SHORT')
    .sort((a, b) => (b.overnightScore ?? 0) - (a.overnightScore ?? 0))
    .slice(0, 2);
  return { topLongs, topShorts };
}

describe('btst-journal OvernightSignal sourcing', () => {
  const today = '2026-07-17';

  it('picks top-2 LONG and SHORT by overnightScore, excluding IGNORE/NEUTRAL_CONFLICT', () => {
    const rows: FakeSignal[] = [
      { symbol: 'A', signalDate: today, direction: 'LONG', overnightScore: 100, classification: 'STRONG_BTST', qualityBucket: 'TRADEABLE' },
      { symbol: 'B', signalDate: today, direction: 'LONG', overnightScore: 90, classification: 'BTST_READY', qualityBucket: 'TRADEABLE' },
      { symbol: 'C', signalDate: today, direction: 'LONG', overnightScore: 85, classification: 'WATCH', qualityBucket: 'WATCHLIST' },
      { symbol: 'D', signalDate: today, direction: 'LONG', overnightScore: 99, classification: 'IGNORE', qualityBucket: 'LOW_QUALITY' },
      { symbol: 'E', signalDate: today, direction: 'SHORT', overnightScore: 95, classification: 'STRONG_STBT', qualityBucket: 'TRADEABLE' },
      { symbol: 'F', signalDate: today, direction: 'SHORT', overnightScore: 88, classification: 'STBT_READY', qualityBucket: 'TRADEABLE' },
      { symbol: 'G', signalDate: today, direction: 'SHORT', overnightScore: 120, classification: 'NEUTRAL_CONFLICT', qualityBucket: 'WATCHLIST' },
      { symbol: 'H', signalDate: '2026-07-16', direction: 'LONG', overnightScore: 200, classification: 'STRONG_BTST', qualityBucket: 'TRADEABLE' },
    ];

    const { topLongs, topShorts } = pickJournalTops(rows, today);
    assert.deepEqual(topLongs.map((r) => r.symbol), ['A', 'B']);
    assert.deepEqual(topShorts.map((r) => r.symbol), ['E', 'F']);
    // Quality present on every picked row — this is what logSignal will snapshot
    for (const r of [...topLongs, ...topShorts]) {
      assert.ok(r.qualityBucket, `${r.symbol} missing qualityBucket`);
    }
  });

  it('returns empty picks when OvernightSignal has no actionable rows for today (sequencing miss)', () => {
    const rows: FakeSignal[] = [
      { symbol: 'X', signalDate: today, direction: 'LONG', overnightScore: 50, classification: 'IGNORE', qualityBucket: null },
    ];
    const { topLongs, topShorts } = pickJournalTops(rows, today);
    assert.equal(topLongs.length, 0);
    assert.equal(topShorts.length, 0);
  });

  it('does not use a disconnected discover()-style tag field — only OvernightSignal direction', () => {
    // Guards the regression: journal must key off direction LONG/SHORT from OvernightSignal,
    // not invent LONG from a separate simple-engine tag.
    const rows: FakeSignal[] = [
      { symbol: 'ONLY_SHORT', signalDate: today, direction: 'SHORT', overnightScore: 100, classification: 'STRONG_STBT', qualityBucket: 'TRADEABLE' },
    ];
    const { topLongs, topShorts } = pickJournalTops(rows, today);
    assert.equal(topLongs.length, 0);
    assert.deepEqual(topShorts.map((r) => r.symbol), ['ONLY_SHORT']);
  });
});
