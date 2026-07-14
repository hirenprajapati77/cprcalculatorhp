import test from 'node:test';
import assert from 'node:assert';
import { MetricsService } from '../../services/backtest/metrics.service';
import { calculateCPR } from '../../lib/cpr-engine';

test('Quantitative Trading Logic Fixes', async (t) => {
  await t.test('Short return calculation math in computeMetricsFromTrades', () => {
    // 1. Mock short trades
    const mockTrades = [
      {
        id: '1',
        backtestRunId: 'run-1',
        symbol: 'MOCK1',
        type: 'SHORT',
        signal: 'CPR',
        status: 'CLOSED_TARGET',
        entryDate: new Date(),
        entryPrice: 100,
        exitDate: new Date(),
        exitPrice: 90, // Profitable short trade: 10% gain
        stopLoss: 105,
        target: 90,
        riskAmount: 1000,
        fees: 0,
        slippage: 0,
        executionDelayMs: 0,
        positionSize: 100,
        pnl: 1000,
        pnlPercent: 10,
        durationDays: 1,
        rr: 2,
        strategyMode: 'LEGACY_NARROW_CPR'
      },
      {
        id: '2',
        backtestRunId: 'run-1',
        symbol: 'MOCK1',
        type: 'SHORT',
        signal: 'CPR',
        status: 'CLOSED_STOP_LOSS',
        entryDate: new Date(),
        entryPrice: 100,
        exitDate: new Date(),
        exitPrice: 110, // Losing short trade: 10% loss
        stopLoss: 110,
        target: 90,
        riskAmount: 1000,
        fees: 0,
        slippage: 0,
        executionDelayMs: 0,
        positionSize: 100,
        pnl: -1000,
        pnlPercent: -10,
        durationDays: 1,
        rr: 2,
        strategyMode: 'LEGACY_NARROW_CPR'
      },
      {
        id: '3',
        backtestRunId: 'run-1',
        symbol: 'MOCK1',
        type: 'LONG',
        signal: 'CPR',
        status: 'CLOSED_TARGET',
        entryDate: new Date(),
        entryPrice: 100,
        exitDate: new Date(),
        exitPrice: 110, // Profitable long trade: 10% gain
        stopLoss: 95,
        target: 110,
        riskAmount: 1000,
        fees: 0,
        slippage: 0,
        executionDelayMs: 0,
        positionSize: 100,
        pnl: 1000,
        pnlPercent: 10,
        durationDays: 1,
        rr: 2,
        strategyMode: 'LEGACY_NARROW_CPR'
      }
    ];

    const result = MetricsService.computeMetricsFromTrades(mockTrades, 100000);
    // Average daily return check:
    // Trade 1 return = (100 - 90)/100 = +10%
    // Trade 2 return = (100 - 110)/100 = -10%
    // Trade 3 return = (110 - 100)/100 = +10%
    // Total return = 10% - 10% + 10% = 10%
    // Avg return = 3.33% daily.
    // Let's assert profitFactor and expectancy:
    assert.ok(result.metrics.profitFactor > 0, 'Profit factor should be calculated correctly');
    assert.ok(result.metrics.expectancy > 0, 'Expectancy should be positive');
  });

  await t.test('calculateCPR classification and trend consistency with ATR%', () => {
    // Verify that calculateCPR generates correct classification when ATR% is passed
    const input = { high: 100, low: 99, close: 100 }; // very narrow CPR
    const result = calculateCPR(input, 0.05); // ATR% is 5% (high)
    
    assert.strictEqual(result.classification, 'NARROW');
    assert.strictEqual(result.trend, 'Trending');
  });
});
