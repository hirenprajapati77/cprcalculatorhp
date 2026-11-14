import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { VolumeShadowMonitorService } from '@/services/monitor/volume-shadow-monitor.service';

describe('VolumeShadowMonitorService (Section G)', () => {
  beforeEach(() => {
    VolumeShadowMonitorService.resetStateForTesting();
  });

  it('1. tracks and returns provider mix in in-process Map', () => {
    const today = '2026-11-14';
    VolumeShadowMonitorService.recordProviderMix(today, {
      fyers: 180,
      yahooAggregated: 20,
      yahooSnapshot: 12,
      total: 212,
    });

    const metrics = VolumeShadowMonitorService.getSessionMetrics(today);
    assert.ok(metrics !== null);
    assert.equal(metrics!.providerMixes.length, 1);
    assert.equal(metrics!.providerMixes[0].fyers, 180);
    assert.equal(metrics!.providerMixes[0].yahooAggregated, 20);
    assert.equal(metrics!.providerMixes[0].yahooSnapshot, 12);
    assert.equal(metrics!.providerMixes[0].total, 212);
  });

  it('2. increments Fyers cooldown activations counter', () => {
    const today = '2026-11-14';
    assert.equal(VolumeShadowMonitorService.recordFyersCooldown(today), 1);
    assert.equal(VolumeShadowMonitorService.recordFyersCooldown(today), 2);
    assert.equal(VolumeShadowMonitorService.recordFyersCooldown(today), 3);

    const metrics = VolumeShadowMonitorService.getSessionMetrics(today);
    assert.equal(metrics!.fyersCooldowns, 3);
  });

  it('3. increments aggregation failure counter per symbol', () => {
    const today = '2026-11-14';
    assert.equal(VolumeShadowMonitorService.recordAggregationFailure('INFY', today), 1);
    assert.equal(VolumeShadowMonitorService.recordAggregationFailure('TCS', today), 2);

    const metrics = VolumeShadowMonitorService.getSessionMetrics(today);
    assert.equal(metrics!.aggregationFailures, 2);
  });

  it('4. records BTST volume shadow comparing raw vs resolved volume', () => {
    const today = '2026-11-14';
    VolumeShadowMonitorService.recordBtstVolumeShadow('GVT&D', 50000, 120000, 120000, 80000, today);

    const metrics = VolumeShadowMonitorService.getSessionMetrics(today);
    assert.equal(metrics!.btstVolumeLogs.length, 1);
    assert.equal(metrics!.btstVolumeLogs[0].symbol, 'GVT&D');
    assert.equal(metrics!.btstVolumeLogs[0].rawVolume, 50000);
    assert.equal(metrics!.btstVolumeLogs[0].intradayVolume, 120000);
    assert.equal(metrics!.btstVolumeLogs[0].resolvedVolume, 120000);
    assert.equal(metrics!.btstVolumeLogs[0].avgVolume, 80000);
  });
});
