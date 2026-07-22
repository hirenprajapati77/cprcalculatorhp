import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IndexDiscoverService, INDEX_INSTRUMENTS } from '../../services/overnight/index-discover.service';
import { INDEX_INTRA_SCORE } from '../../services/overnight/index-intra-ranking.service';

/**
 * These tests run against HistoricalProvider's deterministic mock mode
 * (HISTORICAL_MODE unset/!= 'live' in the test environment), which needs no
 * network access. VWAP / last15m / VIX have no live source in mock mode by
 * design, so every BTST result is expected to have a null score here — that's
 * the score-safety contract working correctly, not a bug. This suite verifies
 * structure/shape and that discovery never throws or silently fabricates a
 * score, not the live scoring path.
 */
describe('IndexDiscoverService.discover', () => {
  it('scans exactly the fixed instrument list (NIFTY, BANKNIFTY) — no F&O universe loop', async () => {
    const results = await IndexDiscoverService.discover(new Date('2026-07-21T10:00:00+05:30'));
    const symbols = results.map((r) => r.symbol).sort();
    assert.deepEqual(symbols, INDEX_INSTRUMENTS.map((i) => i.symbol).sort());
  });

  it('returns LONG direction and IGNORE classification with null score in mock mode (no live VWAP/VIX)', async () => {
    const results = await IndexDiscoverService.discover(new Date('2026-07-21T10:00:00+05:30'));
    for (const r of results) {
      assert.equal(r.direction, 'LONG');
      assert.equal(r.score, null);
      assert.equal(r.confidence, null);
      assert.equal(r.classification, 'IGNORE');
      assert.equal(r.signalType, 'NO_TRADE');
      assert.equal(r.entry, null);
      assert.equal(r.stopLoss, null);
      assert.equal(r.target, null);
      assert.ok(Array.isArray(r.reasons));
      assert.ok(r.reasons.length > 0);
      assert.equal(r.riskReward, null);
    }
  });

  it('never throws on a weekend date — returns empty or safely skips non-trading days', async () => {
    // 2026-07-25 is a Saturday.
    await assert.doesNotReject(() => IndexDiscoverService.discover(new Date('2026-07-25T10:00:00+05:30')));
  });

  it('produces valid IST signalDate (YYYY-MM-DD) and stable discoveryStart signalTime', async () => {
    const results = await IndexDiscoverService.discover(new Date('2026-07-21T10:00:00+05:30'));
    for (const r of results) {
      assert.match(r.signalDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(r.signalTime, /^\d{2}:\d{2}$/);
      // Stable per-day time — not wall-clock minute — so upserts do not flood.
      assert.equal(r.signalTime, '15:10');
    }
  });
});

describe('IndexDiscoverService.getIndiaVixState', () => {
  it('returns vixCalm null in mock mode (score-safety INVALID path)', async () => {
    const state = await IndexDiscoverService.getIndiaVixState(new Date('2026-07-21T10:00:00+05:30'));
    assert.equal(state.elevated, false);
    assert.equal(state.vixCalm, null);
  });
});

describe('IndexDiscoverService.mapIntraClassification', () => {
  it('maps scores onto INDEX_* using INTRA floors (75 / 60 / 40)', () => {
    assert.equal(IndexDiscoverService.mapIntraClassification(75), 'INDEX_STRONG');
    assert.equal(IndexDiscoverService.mapIntraClassification(INDEX_INTRA_SCORE.STRONG), 'INDEX_STRONG');
    assert.equal(IndexDiscoverService.mapIntraClassification(65), 'INDEX_READY');
    assert.equal(IndexDiscoverService.mapIntraClassification(INDEX_INTRA_SCORE.READY), 'INDEX_READY');
    assert.equal(IndexDiscoverService.mapIntraClassification(45), 'INDEX_WATCH');
    assert.equal(IndexDiscoverService.mapIntraClassification(INDEX_INTRA_SCORE.WATCH), 'INDEX_WATCH');
    assert.equal(IndexDiscoverService.mapIntraClassification(39), 'IGNORE');
    assert.equal(IndexDiscoverService.mapIntraClassification(10), 'IGNORE');
  });
});

describe('IndexDiscoverService.discoverIntraday', () => {
  it('returns empty on weekend — does not fabricate INTRA rows', async () => {
    // 2026-07-25 is a Saturday.
    const results = await IndexDiscoverService.discoverIntraday(new Date('2026-07-25T10:00:00+05:30'));
    assert.deepEqual(results, []);
  });

  it('never throws on a weekday and only emits INDEX_* classifications', async () => {
    const results = await IndexDiscoverService.discoverIntraday(new Date('2026-07-21T10:00:00+05:30'));
    for (const r of results) {
      assert.match(r.classification, /^(INDEX_STRONG|INDEX_READY|INDEX_WATCH|IGNORE)$/);
      assert.match(r.signalType, /^(CALL_BUY|PUT_BUY|NO_TRADE)$/);
      assert.ok(Array.isArray(r.reasons));
      // IGNORE must never advertise trade levels (even if BULLISH/BEARISH fired).
      if (r.classification === 'IGNORE') {
        assert.equal(r.entry, null);
        assert.equal(r.stopLoss, null);
        assert.equal(r.target, null);
        assert.equal(r.signalType, 'NO_TRADE');
      }
    }
  });
});
