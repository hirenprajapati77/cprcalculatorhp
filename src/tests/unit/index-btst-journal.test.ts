import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { OvernightSignal } from '@prisma/client';
import {
  indexClassificationToQualityBucket,
  selectTradableIndexBtstPicks,
} from '../../services/overnight/index-overnight-persist';
import { INDEX_SCORE } from '../../services/overnight/index-ranking.service';

function indexSignal(partial: Partial<OvernightSignal>): OvernightSignal {
  return {
    id: partial.id ?? 'idx-1',
    symbol: partial.symbol ?? 'NIFTY',
    signalDate: partial.signalDate ?? '2026-07-21',
    signalTime: partial.signalTime ?? '15:10',
    direction: partial.direction ?? 'LONG',
    instrumentType: partial.instrumentType ?? 'INDEX',
    entry: partial.entry ?? 24000,
    stopLoss: partial.stopLoss ?? 23900,
    target: partial.target ?? 24200,
    overnightScore: partial.overnightScore ?? 90,
    expectedGap: null,
    expectedMove: null,
    confidence: partial.confidence ?? 90,
    exitStrategy: 'EOD',
    actualExit: null,
    actualReturn: null,
    executed: false,
    classification: partial.classification ?? 'INDEX_READY',
    freezeTime: null,
    rejectionReason: null,
    historyQuality: null,
    liquidityQuality: null,
    eventRisk: null,
    regimeFit: null,
    conflictConfidence: null,
    qualityModelVersion: null,
    qualityBucket: partial.qualityBucket ?? 'TRADEABLE',
    eventRiskReason: null,
    relativeStrength: null,
    slippageModelVersion: null,
    regimeSnapshot: null,
    createdAt: new Date(),
  };
}

describe('indexClassificationToQualityBucket', () => {
  it('maps INDEX_STRONG and INDEX_READY to TRADEABLE', () => {
    assert.equal(indexClassificationToQualityBucket('INDEX_STRONG'), 'TRADEABLE');
    assert.equal(indexClassificationToQualityBucket('INDEX_READY'), 'TRADEABLE');
  });

  it('maps INDEX_WATCH and IGNORE to non-tradable buckets', () => {
    assert.equal(indexClassificationToQualityBucket('INDEX_WATCH'), 'WATCHLIST');
    assert.equal(indexClassificationToQualityBucket('IGNORE'), 'LOW_QUALITY');
  });
});

describe('selectTradableIndexBtstPicks', () => {
  it('selects INDEX READY+ long picks and ignores stock classifications', () => {
    const picks = selectTradableIndexBtstPicks([
      indexSignal({
        symbol: 'NIFTY',
        overnightScore: 100,
        classification: 'INDEX_STRONG',
      }),
      indexSignal({
        id: 'idx-2',
        symbol: 'BANKNIFTY',
        overnightScore: 88,
        classification: 'INDEX_READY',
      }),
      indexSignal({
        id: 'idx-3',
        symbol: 'RELIANCE',
        instrumentType: 'STOCK',
        classification: 'STRONG_BTST',
        overnightScore: 110,
      }),
      indexSignal({
        id: 'idx-4',
        symbol: 'NIFTY',
        signalTime: '15:20',
        overnightScore: 70,
        classification: 'INDEX_WATCH',
      }),
    ], { take: 2 });

    assert.equal(picks.length, 2);
    assert.deepEqual(
      picks.map((p) => p.symbol),
      ['NIFTY', 'BANKNIFTY']
    );
  });

  it('respects minScore floor and suppressLong regime gate', () => {
    const belowReady = selectTradableIndexBtstPicks([
      indexSignal({ overnightScore: INDEX_SCORE.WATCH, classification: 'INDEX_WATCH' }),
    ]);
    assert.equal(belowReady.length, 0);

    const suppressed = selectTradableIndexBtstPicks(
      [indexSignal({ overnightScore: 100, classification: 'INDEX_STRONG' })],
      { suppressLong: true }
    );
    assert.equal(suppressed.length, 0);
  });

  it('dedupes by symbol keeping latest signalTime', () => {
    const picks = selectTradableIndexBtstPicks([
      indexSignal({ id: 'a', symbol: 'NIFTY', signalTime: '15:10', overnightScore: 86 }),
      indexSignal({ id: 'b', symbol: 'NIFTY', signalTime: '15:25', overnightScore: 95 }),
    ], { take: 1 });

    assert.equal(picks.length, 1);
    assert.equal(picks[0]?.id, 'b');
    assert.equal(picks[0]?.overnightScore, 95);
  });
});
