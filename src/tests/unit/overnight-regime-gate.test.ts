import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OvernightService, MockOvernightStock } from '../../services/overnight/overnight.service';
import { RegimeService, MarketRegime } from '../../services/overnight/regime.service';
import { prisma } from '../../lib/db';

function createMockStock(targetDateStr = '2026-09-02'): MockOvernightStock {
  const history = [];
  const base = new Date(`${targetDateStr}T10:00:00.000Z`);
  for (let i = 25; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    history.push({
      date: d.toISOString().slice(0, 10),
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 200_000,
    });
  }

  return {
    symbol: 'MOCK_RELIABLE',
    market: 'NSE',
    sector: 'Test',
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    ltp: 102,
    volume: 300_000,
    avgVolume: 150_000,
    marketCap: 10_000,
    history,
    longScoreOverride: 90,
  };
}

describe('OvernightService fail-closed regime reliability gate', () => {
  it('suppresses all signals when market regime is unreliable (reliable === false)', async () => {
    const originalGetRegime = RegimeService.getMarketRegime;
    const unreliableRegime: MarketRegime = {
      trend: 'CHOPPY',
      volatility: 'LOW',
      score: 50,
      reliable: false,
    };
    RegimeService.getMarketRegime = (async () => unreliableRegime) as typeof RegimeService.getMarketRegime;

    try {
      const stock = createMockStock('2026-09-02');
      // Date: a non-Friday weekday (Wednesday)
      const date = new Date('2026-09-02T15:15:00.000Z');
      const results = await OvernightService.discover('BOTH', date, [stock]);
      assert.equal(results.length, 0, 'Must not emit any signals when market regime is unreliable');
    } finally {
      RegimeService.getMarketRegime = originalGetRegime;
    }
  });

  it('allows signals when market regime is reliable (reliable === true)', async () => {
    const originalGetRegime = RegimeService.getMarketRegime;
    const globalObj = globalThis as any;
    const originalPrisma = globalObj.prisma;
    globalObj.prisma = {
      $transaction: async (ops: any[]) => {
        return ops.map((op, idx) => ({
          id: `mock-id-${idx}`,
          symbol: 'MOCK_RELIABLE',
          signalDate: '2026-09-02',
          signalTime: '15:15',
          direction: 'LONG',
          entry: 102,
          stopLoss: 95,
          target: 110,
          overnightScore: 90,
          expectedGap: 1.0,
          expectedMove: 2.0,
          classification: 'TRADEABLE',
          state: 'ACTIVE',
          qualityBucket: 'HIGH_QUALITY',
          eventRiskReason: null,
          relativeStrength: 1.0,
          regimeSnapshot: '{}',
          scoreBreakdown: null,
          vpaBreakdown: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      },
      overnightSignal: {
        upsert: async () => ({}),
      },
    };

    const reliableRegime: MarketRegime = {
      trend: 'CHOPPY',
      volatility: 'LOW',
      score: 50,
      reliable: true,
    };
    RegimeService.getMarketRegime = (async () => reliableRegime) as typeof RegimeService.getMarketRegime;

    try {
      const stock = createMockStock('2026-09-02');
      const date = new Date('2026-09-02T15:15:00.000Z');
      const results = await OvernightService.discover('BOTH', date, [stock]);
      assert.equal(results.length, 1, 'Must emit signals when market regime is reliable');
      assert.equal(results[0].symbol, 'MOCK_RELIABLE');
    } finally {
      RegimeService.getMarketRegime = originalGetRegime;
      globalObj.prisma = originalPrisma;
    }
  });
});
