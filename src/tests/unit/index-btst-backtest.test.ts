import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIndexIntradayMetricsFromChart,
  indexBtstDiscoveryAsOfUtc,
} from '../../services/overnight/index-intraday.util';
import {
  evaluateIndexBtstDay,
  resolveIndexVixCalm,
} from '../../services/backtest/index-btst-backtest.helper';
import { INDEX_SCORE } from '../../services/overnight/index-ranking.service';

describe('index-intraday.util', () => {
  it('indexBtstDiscoveryAsOfUtc maps 15:25 IST to 09:55 UTC', () => {
    const d = indexBtstDiscoveryAsOfUtc('2026-04-01');
    assert.equal(d.toISOString(), '2026-04-01T09:55:00.000Z');
  });

  it('parseIndexIntradayMetricsFromChart computes VWAP and last15mHigh', () => {
    // 09:15 IST = 03:45 UTC; 15:20 IST = 09:50 UTC
    const t915 = Math.floor(new Date('2026-04-01T03:45:00.000Z').getTime() / 1000);
    const t1520 = Math.floor(new Date('2026-04-01T09:50:00.000Z').getTime() / 1000);
    const chart = {
      chart: {
        result: [
          {
            timestamp: [t915, t1520],
            indicators: {
              quote: [
                {
                  high: [100, 110],
                  low: [99, 105],
                  close: [100, 108],
                  volume: [1000, 2000],
                },
              ],
            },
          },
        ],
      },
    };
    const asOf = indexBtstDiscoveryAsOfUtc('2026-04-01');
    const m = parseIndexIntradayMetricsFromChart(chart, asOf);
    assert.equal(m.hasIntraday, true);
    assert.ok(m.vwap != null && m.vwap > 0);
    assert.equal(m.last15mHigh, 110);
  });
});

describe('index-btst-backtest.helper', () => {
  const yesterday = {
    date: '2026-03-31',
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 1_000_000,
  };
  const today = {
    date: '2026-04-01',
    open: 101,
    high: 106,
    low: 100.5,
    close: 105,
    volume: 1_200_000,
  };

  it('resolveIndexVixCalm matches production VIX bands', () => {
    assert.deepEqual(resolveIndexVixCalm(18), { elevated: false, vixCalm: true });
    assert.deepEqual(resolveIndexVixCalm(22), { elevated: false, vixCalm: false });
    assert.deepEqual(resolveIndexVixCalm(26), { elevated: true, vixCalm: false });
    assert.deepEqual(resolveIndexVixCalm(null), { elevated: false, vixCalm: null });
  });

  it('returns not tradable when intraday chart missing (score invalid)', () => {
    const r = evaluateIndexBtstDay({
      yesterday,
      today,
      historyForAtr: [yesterday],
      vixClose: 15,
      suppressLongBear: false,
      chartJson: null,
      asOfTime: indexBtstDiscoveryAsOfUtc(today.date),
    });
    assert.equal(r.tradable, false);
    assert.equal(r.score, null);
  });

  it('requires READY+ score floor (85/130) with full intraday data', () => {
    const t915 = Math.floor(new Date('2026-04-01T03:45:00.000Z').getTime() / 1000);
    const t1520 = Math.floor(new Date('2026-04-01T09:50:00.000Z').getTime() / 1000);
    const chart = {
      chart: {
        result: [
          {
            timestamp: [t915, t1520],
            indicators: {
              quote: [
                {
                  high: [101, 106],
                  low: [100, 104],
                  close: [101, 105],
                  volume: [5000, 8000],
                },
              ],
            },
          },
        ],
      },
    };

    const r = evaluateIndexBtstDay({
      yesterday,
      today,
      historyForAtr: [yesterday],
      vixClose: 15,
      suppressLongBear: false,
      chartJson: chart,
      asOfTime: indexBtstDiscoveryAsOfUtc(today.date),
    });

    if (r.tradable) {
      assert.ok((r.score ?? 0) >= INDEX_SCORE.READY);
      assert.ok(r.entry != null && r.stopLoss != null && r.target != null);
    } else {
      // Weak CPR day — still must not tradable below READY
      assert.ok((r.score ?? 0) < INDEX_SCORE.READY || r.classification === 'IGNORE');
    }
  });

  it('suppresses LONG in BEAR regime (live alert/journal path)', () => {
    const r = evaluateIndexBtstDay({
      yesterday,
      today,
      historyForAtr: [yesterday],
      vixClose: 15,
      suppressLongBear: true,
      chartJson: null,
      asOfTime: indexBtstDiscoveryAsOfUtc(today.date),
    });
    assert.equal(r.tradable, false);
    assert.match(r.skipReason ?? '', /BEAR/);
  });
});
