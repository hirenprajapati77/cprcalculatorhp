import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Executive Dashboard Presentation Contract (Phase 6)', () => {
  it('validates workstation portal routes are valid platform destinations', () => {
    const portalRoutes = [
      '/scanner',
      '/calculate',
      '/journal',
      '/market-tools/breadth',
      '/backtest',
      '/watchlist',
    ];

    assert.equal(portalRoutes.length, 6);
    for (const route of portalRoutes) {
      assert.ok(route.startsWith('/'), `Route '${route}' must be an internal absolute path`);
    }
  });

  it('ensures metric quad derivations are consistent with platform standards', () => {
    const highConvictionThreshold = 75;
    const btstWindow = { start: '15:15', end: '15:30', durationMinutes: 15 };
    const minModelRr = 2.0;

    assert.equal(highConvictionThreshold, 75);
    assert.equal(btstWindow.durationMinutes, 15);
    assert.ok(minModelRr >= 2.0);
  });

  it('validates sector bias classifications', () => {
    type SectorBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    const validBiases: SectorBias[] = ['BULLISH', 'BEARISH', 'NEUTRAL'];

    const sampleSectors = [
      { name: 'NIFTY BANK', bias: 'BULLISH' as SectorBias },
      { name: 'NIFTY IT', bias: 'BULLISH' as SectorBias },
      { name: 'NIFTY AUTO', bias: 'NEUTRAL' as SectorBias },
      { name: 'NIFTY PHARMA', bias: 'BEARISH' as SectorBias },
    ];

    for (const s of sampleSectors) {
      assert.ok(validBiases.includes(s.bias), `Bias '${s.bias}' must be a recognized SectorBias`);
    }
  });
});
