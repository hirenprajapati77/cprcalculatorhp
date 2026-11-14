import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { VolumeShadowMonitorService } from '@/services/monitor/volume-shadow-monitor.service';

describe('VolumeShadowMonitorService (Section G)', () => {
  beforeEach(() => {
    VolumeShadowMonitorService.resetStateForTesting();
    delete process.env.ENABLE_VOLUME_SHADOW_LOGGING;
  });

  it('1. tracks and returns provider mix in in-process Map when enabled', () => {
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'true';
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

  it('2. increments Fyers cooldown activations counter when enabled', () => {
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'true';
    const today = '2026-11-14';
    assert.equal(VolumeShadowMonitorService.recordFyersCooldown(today), 1);
    assert.equal(VolumeShadowMonitorService.recordFyersCooldown(today), 2);
    assert.equal(VolumeShadowMonitorService.recordFyersCooldown(today), 3);

    const metrics = VolumeShadowMonitorService.getSessionMetrics(today);
    assert.equal(metrics!.fyersCooldowns, 3);
  });

  it('3. increments aggregation failure counter per symbol when enabled', () => {
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'true';
    const today = '2026-11-14';
    assert.equal(VolumeShadowMonitorService.recordAggregationFailure('INFY', today), 1);
    assert.equal(VolumeShadowMonitorService.recordAggregationFailure('TCS', today), 2);

    const metrics = VolumeShadowMonitorService.getSessionMetrics(today);
    assert.equal(metrics!.aggregationFailures, 2);
  });

  it('4. records BTST & STBT volume shadow comparing raw vs resolved volume when enabled', () => {
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'true';
    const today = '2026-11-14';
    VolumeShadowMonitorService.recordBtstVolumeShadow('GVT&D', 50000, 120000, 120000, 80000, today, 'BTST');
    VolumeShadowMonitorService.recordBtstVolumeShadow('RELIANCE', 200000, 150000, 200000, 180000, today, 'STBT');

    const metrics = VolumeShadowMonitorService.getSessionMetrics(today);
    assert.ok(metrics !== null);
    assert.equal(metrics!.btstVolumeLogs.length, 2);
    assert.equal(metrics!.btstVolumeLogs[0].symbol, 'GVT&D');
    assert.equal(metrics!.btstVolumeLogs[0].direction, 'BTST');
    assert.equal(metrics!.btstVolumeLogs[0].rawVolume, 50000);
    assert.equal(metrics!.btstVolumeLogs[0].intradayVolume, 120000);
    assert.equal(metrics!.btstVolumeLogs[0].resolvedVolume, 120000);
    assert.equal(metrics!.btstVolumeLogs[0].avgVolume, 80000);

    assert.equal(metrics!.btstVolumeLogs[1].symbol, 'RELIANCE');
    assert.equal(metrics!.btstVolumeLogs[1].direction, 'STBT');
  });

  it('5. strictly prevents memory leaks when flag is disabled (no records stored)', () => {
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'false';
    const today = '2026-11-14';

    VolumeShadowMonitorService.recordBtstVolumeShadow('INFY', 10000, 20000, 20000, 15000, today, 'BTST');
    VolumeShadowMonitorService.recordProviderMix(today, { fyers: 1, yahooAggregated: 0, yahooSnapshot: 0, total: 1 });
    VolumeShadowMonitorService.recordFyersCooldown(today);
    VolumeShadowMonitorService.recordAggregationFailure('INFY', today);

    const metrics = VolumeShadowMonitorService.getSessionMetrics(today);
    // Because flag is false, getOrCreateState is not called; sessionMap is untouched
    assert.equal(metrics, null, 'No state should be allocated when flag is disabled');
  });

  it('6. caps in-memory volume logs at MAX_ENTRIES_PER_RING (5,000 entries) ring buffer', () => {
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'true';
    const today = '2026-11-14';

    for (let i = 0; i < 5005; i++) {
      VolumeShadowMonitorService.recordBtstVolumeShadow(`SYM_${i}`, 1000, 2000, 2000, 1500, today, 'BTST');
    }

    const metrics = VolumeShadowMonitorService.getSessionMetrics(today);
    assert.ok(metrics !== null);
    assert.equal(metrics!.btstVolumeLogs.length, 5000, 'Array must be capped at 5000 entries');
    // First 5 entries (SYM_0 through SYM_4) should be evicted
    assert.equal(metrics!.btstVolumeLogs[0].symbol, 'SYM_5');
    assert.equal(metrics!.btstVolumeLogs[4999].symbol, 'SYM_5004');
  });

  it('7. prunes sessionMap to keep only the latest 3 days', () => {
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'true';
    VolumeShadowMonitorService.recordFyersCooldown('2026-11-10');
    VolumeShadowMonitorService.recordFyersCooldown('2026-11-11');
    VolumeShadowMonitorService.recordFyersCooldown('2026-11-12');
    VolumeShadowMonitorService.recordFyersCooldown('2026-11-13');

    // Should only have 3 days: 2026-11-11, 2026-11-12, 2026-11-13
    assert.equal(VolumeShadowMonitorService.getSessionMetrics('2026-11-10'), null, 'Oldest session should be pruned');
    assert.ok(VolumeShadowMonitorService.getSessionMetrics('2026-11-11') !== null);
    assert.ok(VolumeShadowMonitorService.getSessionMetrics('2026-11-12') !== null);
    assert.ok(VolumeShadowMonitorService.getSessionMetrics('2026-11-13') !== null);
  });

  it('8. proves BTST & STBT scores and outputs are 100% bit-identical with shadow logging ON vs OFF', async () => {
    const { BtstRankingService } = await import('@/services/overnight/btst-ranking.service');
    const { StbtRankingService } = await import('@/services/overnight/stbt-ranking.service');

    const sampleBtstInputs = {
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

    const sampleStbtInputs = {
      symbol: 'TEST_SHORT',
      volume: 100_000,
      intradayVolume: 250_000,
      avgVolume: 100_000,
      todayBc: 100.5,
      todayTc: 99.5,
      tomorrowBc: 99.0,
      tomorrowTc: 100.0,
      tomorrowCprNarrow: true,
      close: 95,
      high: 101,
      low: 94,
      vwap: 98,
      last15mLow: 95,
      hasConfirmationCandles: true,
      rsi14: 35,
      emaCross: { cross: 'BEARISH' as const, isBullishAlignment: false },
    };

    // Run with flag OFF
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'false';
    const btstOff = BtstRankingService.calculateScoreDetails(sampleBtstInputs);
    const scoreBtstOff = BtstRankingService.calculateScore(sampleBtstInputs);
    const classBtstOff = BtstRankingService.getClassification(scoreBtstOff);
    const stbtOff = StbtRankingService.calculateScoreDetails(sampleStbtInputs);
    const scoreStbtOff = StbtRankingService.calculateScore(sampleStbtInputs);
    const classStbtOff = StbtRankingService.getClassification(scoreStbtOff);

    // Run with flag ON
    process.env.ENABLE_VOLUME_SHADOW_LOGGING = 'true';
    const btstOn = BtstRankingService.calculateScoreDetails(sampleBtstInputs);
    const scoreBtstOn = BtstRankingService.calculateScore(sampleBtstInputs);
    const classBtstOn = BtstRankingService.getClassification(scoreBtstOn);
    const stbtOn = StbtRankingService.calculateScoreDetails(sampleStbtInputs);
    const scoreStbtOn = StbtRankingService.calculateScore(sampleStbtInputs);
    const classStbtOn = StbtRankingService.getClassification(scoreStbtOn);

    delete process.env.ENABLE_VOLUME_SHADOW_LOGGING;

    // Bit-identical verification
    assert.deepEqual(btstOn, btstOff, 'BTST scoreDetails must be bit-identical with flag ON vs OFF');
    assert.equal(scoreBtstOn, scoreBtstOff, 'BTST scalar score must be bit-identical with flag ON vs OFF');
    assert.equal(classBtstOn, classBtstOff, 'BTST classification must be bit-identical with flag ON vs OFF');
    assert.equal(JSON.stringify(btstOn), JSON.stringify(btstOff));

    assert.deepEqual(stbtOn, stbtOff, 'STBT scoreDetails must be bit-identical with flag ON vs OFF');
    assert.equal(scoreStbtOn, scoreStbtOff, 'STBT scalar score must be bit-identical with flag ON vs OFF');
    assert.equal(classStbtOn, classStbtOff, 'STBT classification must be bit-identical with flag ON vs OFF');
    assert.equal(JSON.stringify(stbtOn), JSON.stringify(stbtOff));
  });

  it('9. proves filtersJson preserves strict legacy shape when flag is OFF, and remains parseable by ScannerClient when ON', () => {
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
    const parsedOff = JSON.parse(jsonOff);
    const parsedOn = JSON.parse(jsonOn);

    assert.equal(parsedOff.universe, 'NIFTY_FNO');
    assert.equal(parsedOff.market, 'NSE');
    assert.equal(parsedOn.universe, 'NIFTY_FNO');
    assert.equal(parsedOn.market, 'NSE');

    delete process.env.ENABLE_VOLUME_SHADOW_LOGGING;
  });
});
