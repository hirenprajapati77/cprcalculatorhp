import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import type { OvernightSignal } from '@prisma/client';
import {
  overnightSignalToBtstUi,
  buildInsightsFromOvernight,
  selectTradableOvernightPicks,
  compareOvernightPickRows,
  compareLatestScanBySymbol,
} from '../../services/overnight/overnight-ui-adapter';
import { BTST_CLOCK } from '../../lib/market-hours';

function makeSignal(partial: Partial<OvernightSignal>): OvernightSignal {
  return {
    id: '1',
    symbol: 'RELIANCE',
    signalDate: '2026-07-08',
    signalTime: BTST_CLOCK.confirmStart,
    direction: 'LONG',
    instrumentType: null,
    entry: 1000,
    stopLoss: 980,
    target: 1040,
    overnightScore: 90,
    expectedGap: 1.2,
    expectedMove: 2.4,
    confidence: 70,
    exitStrategy: 'EOD',
    actualExit: null,
    actualReturn: null,
    executed: false,
    classification: 'BTST_READY',
    freezeTime: null,
    rejectionReason: null,
    historyQuality: 100,
    liquidityQuality: 100,
    eventRisk: 0,
    regimeFit: 100,
    conflictConfidence: 100,
    qualityModelVersion: 1,
    qualityBucket: 'TRADEABLE',
    eventRiskReason: null,
    relativeStrength: 1,
    slippageModelVersion: null,
    regimeSnapshot: null,
    createdAt: new Date('2026-07-08T09:50:00.000Z'),
    ...partial,
  };
}

describe('overnight-ui-adapter (Phase H)', () => {
  it('maps OvernightSignal into BTST UI DTO with advanced metadata', () => {
    const ui = overnightSignalToBtstUi(makeSignal({}));
    assert.strictEqual(ui.tag, 'LONG');
    assert.strictEqual(ui.longScore, 90);
    assert.strictEqual(ui.shortScore, 0);
    assert.strictEqual(ui.engine, 'advanced');
    assert.strictEqual(ui.classification, 'BTST_READY');
    assert.strictEqual(ui.rr, '2.00');
  });

  it('selects TRADEABLE READY+ picks and respects STBT suppression', () => {
    const signals = [
      makeSignal({ symbol: 'A', overnightScore: 100, classification: 'STRONG_BTST' }),
      makeSignal({
        symbol: 'B',
        direction: 'SHORT',
        overnightScore: 95,
        classification: 'STBT_READY',
      }),
      makeSignal({
        symbol: 'C',
        overnightScore: 70,
        classification: 'WATCH',
        qualityBucket: 'WATCHLIST',
      }),
    ];

    const open = selectTradableOvernightPicks(signals, { take: 5, suppressShort: false });
    assert.strictEqual(open.longs.length, 1);
    assert.strictEqual(open.shorts.length, 1);

    const suppressed = selectTradableOvernightPicks(signals, { take: 5, suppressShort: true });
    assert.strictEqual(suppressed.longs.length, 1);
    assert.strictEqual(suppressed.shorts.length, 0);

    const insights = buildInsightsFromOvernight(signals);
    assert.ok(insights.strongSignal >= 1);
    assert.strictEqual(insights.totalLong, 2);
    assert.strictEqual(insights.totalShort, 1);
  });

  it('compareOvernightPickRows prefers higher score then newer signalTime', () => {
    const highScore = makeSignal({ signalTime: '15:10', overnightScore: 110 });
    const freshLower = makeSignal({ signalTime: '15:25', overnightScore: 95 });
    assert.ok(compareOvernightPickRows(highScore, freshLower) < 0, '110 beats 95 regardless of time');
    assert.ok(compareOvernightPickRows(freshLower, highScore) > 0);
    const tieScoreA = makeSignal({ symbol: 'A', signalTime: '15:10', overnightScore: 90 });
    const tieScoreB = makeSignal({ symbol: 'B', signalTime: '15:25', overnightScore: 90 });
    assert.ok(compareOvernightPickRows(tieScoreB, tieScoreA) < 0, 'same score → fresher time wins');
  });

  it('compareLatestScanBySymbol prefers newer signalTime for same-symbol dedup', () => {
    const older = makeSignal({ signalTime: '15:10', overnightScore: 110 });
    const newer = makeSignal({ signalTime: '15:25', overnightScore: 95 });
    assert.ok(compareLatestScanBySymbol(newer, older) < 0, '15:25 rescan wins over 15:10');
  });

  it('ranks by score across symbols; fresher scan only breaks ties', () => {
    const signals = [
      makeSignal({
        id: '1',
        symbol: 'STALE_HIGH',
        signalTime: '15:10',
        overnightScore: 95,
        classification: 'STRONG_BTST',
      }),
      makeSignal({
        id: '2',
        symbol: 'FRESH_LOWER',
        signalTime: '15:25',
        overnightScore: 88,
        classification: 'BTST_READY',
      }),
    ];
    const { longs } = selectTradableOvernightPicks(signals, { take: 2, suppressShort: true });
    assert.deepEqual(
      longs.map((s) => s.symbol),
      ['STALE_HIGH', 'FRESH_LOWER'],
      'score-95 @ 15:10 outranks score-88 @ 15:25'
    );
  });

  it('dedupes by symbol so rescans cannot fill both top-N slots', () => {
    const signals = [
      makeSignal({
        id: '1',
        symbol: 'JIOFIN',
        signalTime: '15:10',
        overnightScore: 110,
        classification: 'STRONG_BTST',
      }),
      makeSignal({
        id: '2',
        symbol: 'JIOFIN',
        signalTime: '15:15',
        overnightScore: 105,
        classification: 'BTST_READY',
      }),
      makeSignal({
        id: '3',
        symbol: 'DIXON',
        signalTime: '15:10',
        overnightScore: 100,
        classification: 'BTST_READY',
      }),
      makeSignal({
        id: '4',
        symbol: 'RELIANCE',
        signalTime: '15:10',
        overnightScore: 92,
        classification: 'BTST_READY',
      }),
    ];

    const { longs } = selectTradableOvernightPicks(signals, { take: 2, suppressShort: true });
    assert.deepEqual(
      longs.map((s) => s.symbol),
      ['JIOFIN', 'DIXON'],
      'second slot must be the next distinct symbol, not a rescan of #1'
    );
    assert.strictEqual(longs[0].overnightScore, 105, 'keeps latest scan row for duplicate symbol');
    assert.strictEqual(longs[0].signalTime, '15:15');
  });
});
