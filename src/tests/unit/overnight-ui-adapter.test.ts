import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import type { OvernightSignal } from '@prisma/client';
import {
  overnightSignalToBtstUi,
  buildInsightsFromOvernight,
  selectTradableOvernightPicks,
  compareLatestScanRows,
} from '../../services/overnight/overnight-ui-adapter';
import { BTST_CLOCK } from '../../lib/market-hours';

function makeSignal(partial: Partial<OvernightSignal>): OvernightSignal {
  return {
    id: '1',
    symbol: 'RELIANCE',
    signalDate: '2026-07-08',
    signalTime: BTST_CLOCK.confirmStart,
    direction: 'LONG',
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

  it('compareLatestScanRows prefers newer signalTime then score', () => {
    const a = makeSignal({ signalTime: '15:10', overnightScore: 110 });
    const b = makeSignal({ signalTime: '15:25', overnightScore: 95 });
    assert.ok(compareLatestScanRows(b, a) < 0, '15:25 row sorts before 15:10');
    assert.ok(compareLatestScanRows(a, b) > 0);
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
