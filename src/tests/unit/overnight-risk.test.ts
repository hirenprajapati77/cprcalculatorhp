import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { OvernightRiskService } from '../../services/overnight/overnight-risk.service';
import { NiftyHistoryService } from '../../services/overnight/nifty-history.service';
import { OHLC } from '../../services/backtest/historical.provider';

describe('OvernightRiskService - Index Correlation (Beta Proxy)', () => {
  const originalGetNiftyHistory = NiftyHistoryService.getNiftyHistory;

  test('synthesizes beta_proxy correctly for known-correlated series', async () => {
    // We generate 70 days of mock trading closes.
    // Stock returns are 1.5x NIFTY returns.
    const niftyHistory: OHLC[] = [];
    const stockHistory: any[] = [];
    
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

  test('zero-variance Nifty window returns null for beta_proxy without throwing', async () => {
    const niftyHistory: OHLC[] = [];
    const stockHistory: any[] = [];
    
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
    const stockHistory: any[] = [];
    
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
});
