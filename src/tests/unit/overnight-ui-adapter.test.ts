import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import type { OvernightSignal } from '@prisma/client';
import {
  overnightSignalToBtstUi,
  buildInsightsFromOvernight,
  selectTradableOvernightPicks,
} from '../../services/overnight/overnight-ui-adapter';

function makeSignal(partial: Partial<OvernightSignal>): OvernightSignal {
  return {
    id: '1',
    symbol: 'RELIANCE',
    signalDate: '2026-07-08',
    signalTime: '15:20',
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
});
