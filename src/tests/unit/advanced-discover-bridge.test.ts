import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { discoverViaAdvancedEngine } from '@/services/overnight/advanced-discover-bridge';
import { OvernightService } from '@/services/overnight/overnight.service';
import type { OvernightSignal } from '@prisma/client';

describe('advanced-discover-bridge (Tier 2)', () => {
  it('delegates to OvernightService.discover, filters by universe, and maps UI shape', async () => {
    const origDiscover = OvernightService.discover;
    const mockSignals: OvernightSignal[] = [
      {
        id: '1',
        symbol: 'RELIANCE',
        signalDate: '2026-09-09',
        signalTime: '15:20',
        direction: 'LONG',
        instrumentType: null,
        entry: 2500,
        stopLoss: 2470,
        target: 2560,
        overnightScore: 92,
        expectedGap: 1.5,
        expectedMove: 2.5,
        confidence: 75,
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
        createdAt: new Date(),
      },
    ];

    (OvernightService as any).discover = async () => mockSignals;

    try {
      const bridgeRes = await discoverViaAdvancedEngine('ALL');
      assert.equal(bridgeRes.coverage.engine, 'advanced');
      assert.equal(bridgeRes.coverage.degraded, false);
      assert.equal(bridgeRes.coverage.universe, 'ALL');
      assert.equal(bridgeRes.coverage.signalCount, 1);
      assert.equal(bridgeRes.coverage.overnightUniverseCount, 1);
      assert.equal(bridgeRes.results.length, 1);
      assert.equal(bridgeRes.results[0].symbol, 'RELIANCE');
      assert.equal(bridgeRes.results[0].tag, 'LONG');
      assert.ok(bridgeRes.insights.breakoutReady >= 1);
    } finally {
      OvernightService.discover = origDiscover;
    }
  });
});
