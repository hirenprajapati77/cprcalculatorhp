import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { OvernightRiskService } from '../../services/overnight/overnight-risk.service';
import { NiftyHistoryService } from '../../services/overnight/nifty-history.service';
import { HistoricalProvider, OHLC } from '../../services/backtest/historical.provider';

describe('OvernightRiskService - Index Correlation (Beta Proxy)', () => {
  const originalGetNiftyHistory = NiftyHistoryService.getNiftyHistory;
  const originalGetHistory = HistoricalProvider.getHistory;

  test('synthesizes beta_proxy correctly for known-correlated series', async () => {
    // We generate 70 days of mock trading closes.
    // Stock returns are 1.5x NIFTY returns.
    const niftyHistory: OHLC[] = [];
    const stockHistory: OHLC[] = [];
    
    let niftyClose = 100;
    let stockClose = 100;
    
    const baseDate = new Date('2026-07-01');
    for (let i = 0; i < 70; i++) {
      const currentDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Let nifty return vary using a sine wave to ensure non-zero variance
      const niftyRet = Math.sin(i) * 2; // e.g. -2% to +2%
      const stockRet = 1.5 * niftyRet;
      
      const nextNiftyClose = niftyClose * (1 + niftyRet / 100);
      const nextStockClose = stockClose * (1 + stockRet / 100);

      niftyHistory.push({
        date: dateStr,
        open: niftyClose,
        high: Math.max(niftyClose, nextNiftyClose),
        low: Math.min(niftyClose, nextNiftyClose),
        close: nextNiftyClose,
        volume: 10000
      });
      stockHistory.push({
        date: dateStr,
        open: stockClose,
        high: Math.max(stockClose, nextStockClose),
        low: Math.min(stockClose, nextStockClose),
        close: nextStockClose,
        volume: 10000
      });
      
      niftyClose = nextNiftyClose;
      stockClose = nextStockClose;
    }

    // Mock NiftyHistoryService
    NiftyHistoryService.getNiftyHistory = async () => niftyHistory;

    const stockData = {
      symbol: 'TESTSTOCK',
      market: 'NSE' as const,
      sector: 'IT',
      open: stockClose,
      high: stockClose * 1.01,
      low: stockClose * 0.99,
      close: stockClose,
      volume: 10000,
      avgVolume: 10000,
      marketCap: 5000,
      ltp: stockClose,
      history: stockHistory
    };

    const metrics = await OvernightRiskService.calculateOvernightRisk(stockData);
    
    // Restore mock
    NiftyHistoryService.getNiftyHistory = originalGetNiftyHistory;

    assert.ok(metrics.indexCorrelationEstimate !== null);
    const beta = metrics.indexCorrelationEstimate!;
    assert.ok(Math.abs(beta - 1.5) < 0.1, `Expected beta near 1.5, got ${beta}`);
  });

  test('uses extended stock-history fetch for beta when MarketService history is truncated to 22 days', async () => {
    const niftyHistory: OHLC[] = [];
    const fullStockHistory: OHLC[] = [];

    let niftyClose = 100;
    let stockClose = 100;
    const baseDate = new Date('2026-04-01');
    for (let i = 0; i < 80; i++) {
      const currentDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = currentDate.toISOString().split('T')[0];
      const niftyRet = Math.sin(i) * 2;
      const stockRet = 1.5 * niftyRet;
      const nextNiftyClose = niftyClose * (1 + niftyRet / 100);
      const nextStockClose = stockClose * (1 + stockRet / 100);

      niftyHistory.push({
        date: dateStr,
        open: niftyClose,
        high: Math.max(niftyClose, nextNiftyClose),
        low: Math.min(niftyClose, nextNiftyClose),
        close: nextNiftyClose,
        volume: 10000,
      });
      fullStockHistory.push({
        date: dateStr,
        open: stockClose,
        high: Math.max(stockClose, nextStockClose),
        low: Math.min(stockClose, nextStockClose),
        close: nextStockClose,
        volume: 10000,
      });

      niftyClose = nextNiftyClose;
      stockClose = nextStockClose;
    }

    const truncated22 = fullStockHistory.slice(-22);
    NiftyHistoryService.getNiftyHistory = async () => niftyHistory;
    HistoricalProvider.getHistory = async () => fullStockHistory;
    OvernightRiskService.clearCache();

    try {
      const metrics = await OvernightRiskService.calculateOvernightRisk({
        symbol: 'TRUNC22',
        market: 'NSE' as const,
        sector: 'IT',
        open: stockClose,
        high: stockClose * 1.01,
        low: stockClose * 0.99,
        close: stockClose,
        volume: 10000,
        avgVolume: 10000,
        marketCap: 5000,
        ltp: stockClose,
        history: truncated22,
      });

      assert.ok(metrics.indexCorrelationEstimate !== null, 'beta should be computed from extended fetched history');
      assert.ok(Math.abs(metrics.indexCorrelationEstimate! - 1.5) < 0.15);
    } finally {
      NiftyHistoryService.getNiftyHistory = originalGetNiftyHistory;
      HistoricalProvider.getHistory = originalGetHistory;
      OvernightRiskService.clearCache();
    }
  });

  test('zero-variance Nifty window returns null for beta_proxy without throwing', async () => {
    const niftyHistory: OHLC[] = [];
    const stockHistory: OHLC[] = [];
    
    const baseDate = new Date('2026-07-01');
    for (let i = 0; i < 70; i++) {
      const currentDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = currentDate.toISOString().split('T')[0];
      niftyHistory.push({
        date: dateStr,
        open: 100,
        high: 100,
        low: 100,
        close: 100, // zero variance
        volume: 10000
      });
      stockHistory.push({
        date: dateStr,
        open: 100,
        high: 105,
        low: 95,
        close: 100 + i, // positive returns
        volume: 10000
      });
    }

    NiftyHistoryService.getNiftyHistory = async () => niftyHistory;

    const stockData = {
      symbol: 'TESTSTOCK',
      market: 'NSE' as const,
      sector: 'IT',
      open: 200,
      high: 205,
      low: 195,
      close: 200,
      volume: 10000,
      avgVolume: 10000,
      marketCap: 5000,
      ltp: 200,
      history: stockHistory
    };

    const metrics = await OvernightRiskService.calculateOvernightRisk(stockData);
    NiftyHistoryService.getNiftyHistory = originalGetNiftyHistory;

    assert.strictEqual(metrics.indexCorrelationEstimate, null, 'Expected null beta for zero variance Nifty');
  });

  test('handles misaligned date gaps correctly by dropping them', async () => {
    const niftyHistory: OHLC[] = [];
    const stockHistory: OHLC[] = [];
    
    let niftyClose = 100;
    let stockClose = 100;
    
    const baseDate = new Date('2026-07-01');
    for (let i = 0; i < 80; i++) {
      const currentDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const includeNifty = i !== 10;
      const includeStock = i !== 20;

      const niftyRet = Math.sin(i) * 2;
      const stockRet = 1.5 * niftyRet;

      const nextNiftyClose = niftyClose * (1 + niftyRet / 100);
      const nextStockClose = stockClose * (1 + stockRet / 100);

      if (includeNifty) {
        niftyHistory.push({
          date: dateStr,
          open: niftyClose,
          high: Math.max(niftyClose, nextNiftyClose),
          low: Math.min(niftyClose, nextNiftyClose),
          close: nextNiftyClose,
          volume: 10000
        });
        niftyClose = nextNiftyClose;
      }
      
      if (includeStock) {
        stockHistory.push({
          date: dateStr,
          open: stockClose,
          high: Math.max(stockClose, nextStockClose),
          low: Math.min(stockClose, nextStockClose),
          close: nextStockClose,
          volume: 10000
        });
        stockClose = nextStockClose;
      }
    }

    NiftyHistoryService.getNiftyHistory = async () => niftyHistory;

    const stockData = {
      symbol: 'TESTSTOCK',
      market: 'NSE' as const,
      sector: 'IT',
      open: stockClose,
      high: stockClose * 1.01,
      low: stockClose * 0.99,
      close: stockClose,
      volume: 10000,
      avgVolume: 10000,
      marketCap: 5000,
      ltp: stockClose,
      history: stockHistory
    };

    const metrics = await OvernightRiskService.calculateOvernightRisk(stockData);
    NiftyHistoryService.getNiftyHistory = originalGetNiftyHistory;

    assert.ok(metrics.indexCorrelationEstimate !== null);
    const beta = metrics.indexCorrelationEstimate!;
    assert.ok(Math.abs(beta - 1.5) < 0.1, `Expected beta near 1.5, got ${beta}`);
  });

  test('skips zero-price bases instead of poisoning beta with fake 0% returns', async () => {
    const niftyHistory: OHLC[] = [];
    const stockHistory: OHLC[] = [];

    let niftyClose = 100;
    let stockClose = 100;
    const baseDate = new Date('2026-07-01');
    for (let i = 0; i < 70; i++) {
      const currentDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = currentDate.toISOString().split('T')[0];
      const niftyRet = Math.sin(i) * 2;
      const stockRet = 1.5 * niftyRet;
      const nextNiftyClose = niftyClose * (1 + niftyRet / 100);
      // Zero close at i=35: next day's return must skip (prev<=0), not insert a fake 0% sample.
      const nextStockClose = i === 35 ? 0 : stockClose * (1 + stockRet / 100);

      niftyHistory.push({
        date: dateStr,
        open: niftyClose,
        high: Math.max(niftyClose, nextNiftyClose),
        low: Math.min(niftyClose, nextNiftyClose),
        close: nextNiftyClose,
        volume: 10000,
      });
      stockHistory.push({
        date: dateStr,
        open: Math.max(stockClose, 0.01),
        high: Math.max(stockClose, nextStockClose, 0.01),
        low: 0.01,
        close: nextStockClose,
        volume: 10000,
      });

      niftyClose = nextNiftyClose;
      stockClose = nextStockClose > 0 ? nextStockClose : stockClose * (1 + stockRet / 100);
    }

    NiftyHistoryService.getNiftyHistory = async () => niftyHistory;

    const metrics = await OvernightRiskService.calculateOvernightRisk({
      symbol: 'ZEROBASE',
      market: 'NSE' as const,
      sector: 'IT',
      open: stockClose,
      high: stockClose * 1.01,
      low: stockClose * 0.99,
      close: stockClose,
      volume: 10000,
      avgVolume: 10000,
      marketCap: 5000,
      ltp: stockClose,
      history: stockHistory,
    });
    NiftyHistoryService.getNiftyHistory = originalGetNiftyHistory;

    // Collapse-to-zero day breaks exact 1.5 beta for that sample; skip must still yield a finite beta
    // (not throw / not NaN from dividing by zero prev).
    assert.ok(metrics.indexCorrelationEstimate !== null);
    assert.ok(Number.isFinite(metrics.indexCorrelationEstimate!));
  });

  describe('Phase 2B Index Correlation Risk Weighting & Regression Checks', () => {
    /*
     * PRE-PHASE-2B FORMULA (Phase 2A baseline, before indexCorrelationEstimate integration):
     * baseRiskFactor = (gapRisk * 0.4) + (volatility * 0.4) + (sectorRisk * 0.2) + (shortSqueezeProb * 0.01)
     * Thresholds: riskFactor < 1.0 -> 'LOW', riskFactor > 2.5 -> 'HIGH', else -> 'MEDIUM'
     *
     * PHASE 2B INTEGRATED FORMULA:
     * correlationRisk = ((indexCorrelationEstimate ?? 1.0) - 1.0) * 0.2
     * riskFactor = baseRiskFactor + correlationRisk
     *
     * When indexCorrelationEstimate is null (short history <60d) or equal to 1.0 (neutral market beta),
     * correlationRisk = 0.0, so riskFactor === baseRiskFactor.
     */

    test('correlation null (short history <60d) defaults to neutral beta=1.0 and preserves exact LOW/MEDIUM/HIGH riskLevel math', async () => {
      // 1. Non-trivial LOW risk fixture (<60d history -> null beta)
      //    History generates: gapRisk ~0.5%, volatility ~0.5%, sector='pharma' (0.8), squeeze=10
      //    Pre-Phase-2B baseRiskFactor = (0.5 * 0.4) + (0.5 * 0.4) + (0.8 * 0.2) + (10 * 0.01) = 0.20 + 0.20 + 0.16 + 0.10 = 0.66 -> 'LOW'
      const lowHist: OHLC[] = [];
      const baseDate = new Date('2026-07-01');
      let lowClose = 100;
      for (let i = 0; i < 10; i++) {
        const dateStr = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const prevClose = lowClose;
        lowClose = prevClose * (i % 2 === 0 ? 1.005 : 0.995); // 0.5% daily return variation
        const openPrice = prevClose * (i % 2 === 0 ? 1.005 : 0.995); // 0.5% gap
        lowHist.push({ date: dateStr, open: openPrice, high: Math.max(openPrice, lowClose), low: Math.min(openPrice, lowClose), close: lowClose, volume: 5000 });
      }

      const lowMetrics = await OvernightRiskService.calculateOvernightRisk({
        symbol: 'SHORT_LOW', market: 'NSE' as const, sector: 'pharma',
        open: lowClose, high: lowClose * 1.005, low: lowClose * 0.995, close: lowClose,
        volume: 5000, avgVolume: 5000, marketCap: 1000, ltp: lowClose, history: lowHist,
      });

      assert.strictEqual(lowMetrics.indexCorrelationEstimate, null);
      assert.strictEqual(lowMetrics.riskLevel, 'LOW');

      // 2. Non-trivial MEDIUM risk fixture (<60d history -> null beta)
      //    History generates: gapRisk ~1.5%, volatility ~1.5%, sector='IT' (1.3), squeeze=10
      //    Pre-Phase-2B baseRiskFactor = (1.5 * 0.4) + (1.5 * 0.4) + (1.3 * 0.2) + (10 * 0.01) = 0.60 + 0.60 + 0.26 + 0.10 = 1.56 -> 'MEDIUM'
      const medHist: OHLC[] = [];
      let medClose = 100;
      for (let i = 0; i < 10; i++) {
        const dateStr = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const prevClose = medClose;
        medClose = prevClose * (i % 2 === 0 ? 1.015 : 0.985); // 1.5% daily return variation
        const openPrice = prevClose * (i % 2 === 0 ? 1.015 : 0.985); // 1.5% gap
        medHist.push({ date: dateStr, open: openPrice, high: Math.max(openPrice, medClose), low: Math.min(openPrice, medClose), close: medClose, volume: 5000 });
      }

      const medMetrics = await OvernightRiskService.calculateOvernightRisk({
        symbol: 'SHORT_MED', market: 'NSE' as const, sector: 'IT',
        open: medClose, high: medClose * 1.015, low: medClose * 0.985, close: medClose,
        volume: 5000, avgVolume: 5000, marketCap: 1000, ltp: medClose, history: medHist,
      });

      assert.strictEqual(medMetrics.indexCorrelationEstimate, null);
      assert.strictEqual(medMetrics.riskLevel, 'MEDIUM');

      // 3. Non-trivial HIGH risk fixture (<60d history -> null beta)
      //    History generates: gapRisk ~3.0%, volatility ~3.0%, sector='IT' (1.3), squeeze=10
      //    Pre-Phase-2B baseRiskFactor = (3.0 * 0.4) + (3.0 * 0.4) + (1.3 * 0.2) + (10 * 0.01) = 1.20 + 1.20 + 0.26 + 0.10 = 2.76 -> 'HIGH'
      const highHist: OHLC[] = [];
      let highClose = 100;
      for (let i = 0; i < 10; i++) {
        const dateStr = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const prevClose = highClose;
        highClose = prevClose * (i % 2 === 0 ? 1.03 : 0.97); // 3.0% daily return variation
        const openPrice = prevClose * (i % 2 === 0 ? 1.03 : 0.97); // 3.0% gap
        highHist.push({ date: dateStr, open: openPrice, high: Math.max(openPrice, highClose), low: Math.min(openPrice, highClose), close: highClose, volume: 5000 });
      }

      const highMetrics = await OvernightRiskService.calculateOvernightRisk({
        symbol: 'SHORT_HIGH', market: 'NSE' as const, sector: 'IT',
        open: highClose, high: highClose * 1.03, low: highClose * 0.97, close: highClose,
        volume: 5000, avgVolume: 5000, marketCap: 1000, ltp: highClose, history: highHist,
      });

      assert.strictEqual(highMetrics.indexCorrelationEstimate, null);
      assert.strictEqual(highMetrics.riskLevel, 'HIGH');
    });

    test('high beta (>1.0) shifts riskFactor upward across threshold (MEDIUM -> HIGH)', async () => {
      // Base fixture setup:
      // gapRisk ~2.55%, volatility ~2.55%, sector='IT' (1.3), squeeze=10
      // baseRiskFactor = (2.55 * 0.4) + (2.55 * 0.4) + (1.3 * 0.2) + (10 * 0.01) = 1.02 + 1.02 + 0.26 + 0.10 = 2.40 <= 2.50 ('MEDIUM')
      //
      // With High Beta (2.0x NIFTY):
      // correlationRisk = (2.0 - 1.0) * 0.2 = +0.20
      // total riskFactor = 2.40 + 0.20 = 2.60 > 2.50 -> riskLevel shifts from 'MEDIUM' to 'HIGH'!
      const baseDate = new Date('2026-07-01');
      const niftyHistory: OHLC[] = [];
      const stockHistory: OHLC[] = [];
      let niftyClose = 100;
      let stockClose = 100;

      for (let i = 0; i < 70; i++) {
        const dateStr = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const niftyRet = Math.sin(i) * 2; // -2% to +2%
        const stockRet = 2.0 * niftyRet; // 2.0x High Beta
        const nextNiftyClose = niftyClose * (1 + niftyRet / 100);
        const nextStockClose = stockClose * (1 + stockRet / 100);

        niftyHistory.push({ date: dateStr, open: niftyClose, high: Math.max(niftyClose, nextNiftyClose), low: Math.min(niftyClose, nextNiftyClose), close: nextNiftyClose, volume: 10000 });

        // Add 2.5% gapRisk component on open
        const openPrice = stockClose * (i % 2 === 0 ? 1.025 : 0.975);
        stockHistory.push({ date: dateStr, open: openPrice, high: Math.max(openPrice, stockClose, nextStockClose), low: Math.min(openPrice, stockClose, nextStockClose), close: nextStockClose, volume: 10000 });

        niftyClose = nextNiftyClose;
        stockClose = nextStockClose;
      }

      NiftyHistoryService.getNiftyHistory = async () => niftyHistory;

      const metrics = await OvernightRiskService.calculateOvernightRisk({
        symbol: 'HIGHBETA_SHIFT', market: 'NSE' as const, sector: 'IT',
        open: stockClose, high: stockClose * 1.02, low: stockClose * 0.98, close: stockClose,
        volume: 10000, avgVolume: 10000, marketCap: 5000, ltp: stockClose, history: stockHistory,
      });

      NiftyHistoryService.getNiftyHistory = originalGetNiftyHistory;

      assert.ok(metrics.indexCorrelationEstimate !== null);
      assert.ok(metrics.indexCorrelationEstimate! > 1.5, `Expected beta > 1.5, got ${metrics.indexCorrelationEstimate}`);
      // High beta correlation (+0.20 delta) pushes riskFactor past 2.50 threshold into 'HIGH'
      assert.strictEqual(metrics.riskLevel, 'HIGH');
    });

    test('low beta (<1.0) dampens riskFactor downward across threshold (MEDIUM -> LOW)', async () => {
      // Base fixture setup:
      // gapRisk ~1.0%, volatility ~1.0%, sector='pharma' (0.8), squeeze=14
      // baseRiskFactor = (1.0 * 0.4) + (1.0 * 0.4) + (0.8 * 0.2) + (14 * 0.01) = 0.40 + 0.40 + 0.16 + 0.14 = 1.10
      // Without beta correlation (or with beta=1.0), riskFactor = 1.10 >= 1.00 -> riskLevel = 'MEDIUM'.
      //
      // With Low Beta (0.0x NIFTY - stock is flat / decoupled from index market swings):
      // correlationRisk = (0.0 - 1.0) * 0.2 = -0.20
      // total riskFactor = 1.10 - 0.20 = 0.90 < 1.00 -> riskLevel dampens from 'MEDIUM' to 'LOW'!
      const baseDate = new Date('2026-07-01');
      const niftyHistory: OHLC[] = [];
      const stockHistory: OHLC[] = [];
      let niftyClose = 100;
      let stockClose = 100;

      for (let i = 0; i < 70; i++) {
        const dateStr = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const niftyRet = Math.sin(i) * 2;
        const nextNiftyClose = niftyClose * (1 + niftyRet / 100);
        // Stock has 0.0 beta relative to NIFTY (independent 1.0% alternating returns)
        const stockRet = i % 2 === 0 ? 1.0 : -1.0;
        const nextStockClose = stockClose * (1 + stockRet / 100);

        niftyHistory.push({ date: dateStr, open: niftyClose, high: Math.max(niftyClose, nextNiftyClose), low: Math.min(niftyClose, nextNiftyClose), close: nextNiftyClose, volume: 10000 });

        const openPrice = stockClose * (i % 2 === 0 ? 1.01 : 0.99); // 1.0% gapRisk
        stockHistory.push({ date: dateStr, open: openPrice, high: Math.max(openPrice, stockClose, nextStockClose), low: Math.min(openPrice, stockClose, nextStockClose), close: nextStockClose, volume: 10000 });

        niftyClose = nextNiftyClose;
        stockClose = nextStockClose;
      }

      NiftyHistoryService.getNiftyHistory = async () => niftyHistory;

      const metrics = await OvernightRiskService.calculateOvernightRisk({
        symbol: 'LOWBETA_SHIFT', market: 'NSE' as const, sector: 'pharma',
        open: stockClose, high: stockClose * 1.01, low: stockClose * 0.99, close: stockClose,
        volume: 10000, avgVolume: 10000, marketCap: 5000, ltp: stockClose, history: stockHistory,
      });

      NiftyHistoryService.getNiftyHistory = originalGetNiftyHistory;

      assert.ok(metrics.indexCorrelationEstimate !== null);
      assert.ok(metrics.indexCorrelationEstimate! < 0.3, `Expected low/decoupled beta < 0.3, got ${metrics.indexCorrelationEstimate}`);
      // Low beta correlation (-0.20 delta) dampens riskFactor below 1.00 threshold into 'LOW'
      assert.strictEqual(metrics.riskLevel, 'LOW');
    });
  });
});


