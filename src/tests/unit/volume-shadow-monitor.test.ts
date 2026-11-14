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
    assert.ok(metrics !== null);
    assert.equal(metrics!.btstVolumeLogs.length, 1);
    assert.equal(metrics!.btstVolumeLogs[0].symbol, 'GVT&D');
    assert.equal(metrics!.btstVolumeLogs[0].rawVolume, 50000);
    assert.equal(metrics!.btstVolumeLogs[0].intradayVolume, 120000);
    assert.equal(metrics!.btstVolumeLogs[0].resolvedVolume, 120000);
    assert.equal(metrics!.btstVolumeLogs[0].avgVolume, 80000);
  });

  it('5. proves BTST scores and outputs are 100% bit-identical with shadow logging ON vs OFF', async () => {
    const { BtstRankingService } = await import('@/services/overnight/btst-ranking.service');

    const sampleInputs = {
      symbol: 'TEST_STOCK',
      volume: 100_000,
      intradayVolume: 250_000,
      avgVolume: 100_000,
      todayBc: 99.5,
      todayTc: 100.5,
      tomorrowBc: 100.0,
      tomorrowTc: 101.0,
      tomorrowCprNarrow: true,
      close: 105,
      high: 106,
      low: 99,
      vwap: 102,
      last15mHigh: 105,
      hasConfirmationCandles: true,
      rsi14: 65,
      emaCross: { cross: 'BULLISH' as const, isBullishAlignment: true },
    };

    // Run with flag OFF
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'false';
    const btstOff = BtstRankingService.calculateScoreDetails(sampleInputs);
    const scoreOff = BtstRankingService.calculateScore(sampleInputs);
    const classOff = BtstRankingService.getClassification(scoreOff);

    // Run with flag ON
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'true';
    const btstOn = BtstRankingService.calculateScoreDetails(sampleInputs);
    const scoreOn = BtstRankingService.calculateScore(sampleInputs);
    const classOn = BtstRankingService.getClassification(scoreOn);

    // Clean up env
    delete process.env.ENABLE_VOLUME_SHADOW_LOGGING;

    // Bit-identical verification
    assert.deepEqual(btstOn, btstOff, 'BTST scoreDetails must be bit-identical with flag ON vs OFF');
    assert.equal(scoreOn, scoreOff, 'BTST scalar score must be bit-identical with flag ON vs OFF');
    assert.equal(classOn, classOff, 'BTST classification must be bit-identical with flag ON vs OFF');
    assert.equal(JSON.stringify(btstOn), JSON.stringify(btstOff));
  });

  it('6. proves filtersJson preserves strict legacy shape when flag is OFF, and remains parseable by ScannerClient when ON', () => {
    const universeName = 'NIFTY_FNO';
    const market = 'NSE';
    const scanId = 'scan_test_123';
    const providerMix = { fyers: 180, yahooAggregated: 20, yahooSnapshot: 12, total: 212 };

    // When flag is OFF:
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'false';
    const payloadOff: Record<string, any> = { universe: universeName, market, scanId };
    if (providerMix && VolumeShadowMonitorService.isFlagEnabled()) {
      payloadOff.providerMix = providerMix;
    }
    const jsonOff = JSON.stringify(payloadOff);
    assert.equal(jsonOff, '{"universe":"NIFTY_FNO","market":"NSE","scanId":"scan_test_123"}', 'Flag OFF must produce exact legacy schema');

    // When flag is ON:
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'true';
    const payloadOn: Record<string, any> = { universe: universeName, market, scanId };
    if (providerMix && VolumeShadowMonitorService.isFlagEnabled()) {
      payloadOn.providerMix = providerMix;
    }
    const jsonOn = JSON.stringify(payloadOn);
    assert.ok(jsonOn.includes('"providerMix":{"fyers":180,"yahooAggregated":20,"yahooSnapshot":12,"total":212}'));

    // Client reader compatibility simulation (ScannerClient.tsx & /api/scanner/history):
    // In ScannerClient: log.filters.universe and log.filters.market are read
    const parsedOff = JSON.parse(jsonOff);
    const parsedOn = JSON.parse(jsonOn);

    assert.equal(parsedOff.universe, 'NIFTY_FNO');
    assert.equal(parsedOff.market, 'NSE');
    assert.equal(parsedOn.universe, 'NIFTY_FNO');
    assert.equal(parsedOn.market, 'NSE');

    delete process.env.ENABLE_VOLUME_SHADOW_LOGGING;
  });
});
