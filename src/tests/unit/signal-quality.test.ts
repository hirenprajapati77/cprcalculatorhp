import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SignalQualityService } from '../../services/overnight/signal-quality.service';
import { MarketStockData } from '../../services/market.service';
import { MarketRegime } from '../../services/overnight/regime.service';
import { EventRiskResult } from '../../services/overnight/event.service';

describe('SignalQualityService (Tier 2 coverage)', () => {
  const baseStock: MarketStockData = {
    symbol: 'RELIANCE',
    market: 'NSE',
    sector: 'Energy',
    marketCap: 100000,
    open: 2500,
    high: 2550,
    low: 2490,
    close: 2540,
    ltp: 2540,
    volume: 600000,
    avgVolume: 600000,
  };

  const bullRegime: MarketRegime = {
    trend: 'BULL',
    volatility: 'LOW',
    score: 80,
  };

  const bearRegime: MarketRegime = {
    trend: 'BEAR',
    volatility: 'HIGH',
    score: 80,
  };

  const lowEventRisk: EventRiskResult = {
    severity: 0,
    confidence: 'HIGH',
    source: 'LOCAL_DB',
    reason: null,
  };

  const highEventRisk: EventRiskResult = {
    severity: 85,
    confidence: 'HIGH',
    source: 'LOCAL_DB',
    reason: 'Earnings Announcement',
  };

  it('classifies high quality setup as TRADEABLE', () => {
    const res = SignalQualityService.evaluateSignal(
      baseStock,
      'LONG',
      85,
      40,
      bullRegime,
      200,
      lowEventRisk,
      lowEventRisk,
      5.2
    );

    assert.equal(res.qualityBucket, 'TRADEABLE');
    assert.equal(res.historyQuality, 100);
    assert.equal(res.liquidityQuality, 100);
    assert.equal(res.regimeFit, 100);
    assert.equal(res.conflictConfidence, 45);
    assert.equal(res.relativeStrength, 5.2);
  });

  it('classifies SHORT setup in BEAR regime with high liquidity as TRADEABLE', () => {
    const res = SignalQualityService.evaluateSignal(
      baseStock,
      'SHORT',
      30,
      80,
      bearRegime,
      100,
      lowEventRisk,
      lowEventRisk
    );

    assert.equal(res.qualityBucket, 'TRADEABLE');
    assert.equal(res.regimeFit, 100);
    assert.equal(res.conflictConfidence, 50);
  });

  it('classifies as LOW_QUALITY when history length is insufficient (< 15)', () => {
    const res = SignalQualityService.evaluateSignal(
      baseStock,
      'LONG',
      80,
      40,
      bullRegime,
      10,
      lowEventRisk,
      lowEventRisk
    );

    assert.equal(res.qualityBucket, 'LOW_QUALITY');
    assert.equal(res.historyQuality, 0);
  });

  it('classifies as LOW_QUALITY when liquidity is too low (< 50)', () => {
    const illiquidStock: MarketStockData = {
      ...baseStock,
      avgVolume: 50000,
      volume: 40000,
      ltp: 100,
    };

    const res = SignalQualityService.evaluateSignal(
      illiquidStock,
      'LONG',
      80,
      40,
      bullRegime,
      100,
      lowEventRisk,
      lowEventRisk
    );

    assert.equal(res.qualityBucket, 'LOW_QUALITY');
    assert.equal(res.liquidityQuality, 0);
  });

  it('classifies as LOW_QUALITY when event risk is critical (>= 80)', () => {
    const res = SignalQualityService.evaluateSignal(
      baseStock,
      'LONG',
      80,
      40,
      bullRegime,
      100,
      highEventRisk,
      lowEventRisk
    );

    assert.equal(res.qualityBucket, 'LOW_QUALITY');
    assert.equal(res.eventRisk, 85);
    assert.equal(res.eventRiskReason, 'Earnings Announcement');
  });

  it('classifies as LOW_QUALITY when conflict confidence is too low (< 15)', () => {
    const res = SignalQualityService.evaluateSignal(
      baseStock,
      'LONG',
      70,
      60, // abs diff = 10 < 15
      bullRegime,
      100,
      lowEventRisk,
      lowEventRisk
    );

    assert.equal(res.qualityBucket, 'LOW_QUALITY');
    assert.equal(res.conflictConfidence, 10);
  });

  it('classifies as WATCHLIST when regime fit is low (< 50)', () => {
    // LONG in BEAR regime
    const res = SignalQualityService.evaluateSignal(
      baseStock,
      'LONG',
      80,
      30,
      bearRegime,
      100,
      lowEventRisk,
      lowEventRisk
    );

    assert.equal(res.regimeFit, 0);
    assert.equal(res.qualityBucket, 'WATCHLIST');
  });

  it('classifies as WATCHLIST when SHORT in BULL regime', () => {
    const res = SignalQualityService.evaluateSignal(
      baseStock,
      'SHORT',
      30,
      80,
      bullRegime,
      100,
      lowEventRisk,
      lowEventRisk
    );

    assert.equal(res.regimeFit, 0);
    assert.equal(res.qualityBucket, 'WATCHLIST');
  });

  it('classifies as WATCHLIST when liquidity is Tier 2 (70)', () => {
    const midLiquidStock: MarketStockData = {
      ...baseStock,
      avgVolume: 300000,
      ltp: 200, // turnover = 60,000,000 >= 50,000,000 -> liquidityQuality = 70 (< 80)
    };

    const res = SignalQualityService.evaluateSignal(
      midLiquidStock,
      'LONG',
      80,
      30,
      bullRegime,
      100,
      lowEventRisk,
      lowEventRisk
    );

    assert.equal(res.liquidityQuality, 70);
    assert.equal(res.qualityBucket, 'WATCHLIST');
  });

  it('classifies as WATCHLIST when event confidence is UNKNOWN', () => {
    const unknownEventRisk: EventRiskResult = {
      severity: 10,
      confidence: 'UNKNOWN',
      source: 'LOCAL_DB',
      reason: 'Network timeout',
    };

    const res = SignalQualityService.evaluateSignal(
      baseStock,
      'LONG',
      80,
      30,
      bullRegime,
      100,
      unknownEventRisk,
      lowEventRisk
    );

    assert.equal(res.qualityBucket, 'WATCHLIST');
  });

  it('computes Tier 3 liquidity (40)', () => {
    const tier3Stock: MarketStockData = {
      ...baseStock,
      avgVolume: 120000,
      ltp: 100, // turnover = 12,000,000 (< 50,000,000, but avgVolume >= 100000)
    };

    const res = SignalQualityService.evaluateSignal(
      tier3Stock,
      'LONG',
      80,
      30,
      bullRegime,
      100,
      lowEventRisk,
      lowEventRisk
    );

    assert.equal(res.liquidityQuality, 40);
    assert.equal(res.qualityBucket, 'LOW_QUALITY'); // < 50
  });
});
