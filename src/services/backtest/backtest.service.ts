import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { TradeEngineService, BacktestTradeConfig } from './trade-engine.service';
import { HistoricalProvider } from './historical.provider';
import { JournalService } from './journal.service';
import { MetricsService } from './metrics.service';

const prisma = new PrismaClient();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const backtestQueue = new Queue('backtest.queue', { connection });

export class BacktestService {
  /**
   * Queues a backtest run.
   */
  static async submitRun(config: {
    name: string;
    universe: string;
    startDate: string;
    endDate: string;
    capital: number;
    riskModel: string;
    executionMode: string;
    metricsVersion?: number;
  }) {
    const run = await prisma.backtestRun.create({
      data: {
        name: config.name,
        universe: config.universe,
        startDate: new Date(config.startDate),
        endDate: new Date(config.endDate),
        capital: config.capital,
        riskModel: config.riskModel,
        executionMode: config.executionMode,
        status: 'QUEUED',
        metricsVersion: config.metricsVersion || 1,
      }
    });

    await backtestQueue.add('process-run', { runId: run.id });

    return {
      jobId: run.id,
      status: 'QUEUED',
      progress: 0,
      estimatedDuration: 'Unknown',
      resumeSupported: true
    };
  }

  /**
   * Core worker logic to process chunks of 50.
   */
  static async processRun(runId: string) {
    const run = await prisma.backtestRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error('Run not found');

    await prisma.backtestRun.update({ where: { id: runId }, data: { status: 'RUNNING' } });

    // Mock fetching universe
    let symbols: string[] = [];
    if (run.universe === 'NIFTY50') {
      symbols = Array.from({length: 50}, (_, i) => `SYM${i+1}`); // Mock 50 symbols
    }

    const BATCH_SIZE = 50;
    const batches = Math.ceil(symbols.length / BATCH_SIZE);

    for (let batchNum = 1; batchNum <= batches; batchNum++) {
      // Check idempotency: If checkpoint exists, skip this batch
      const existingCheckpoint = await prisma.backtestCheckpoint.findUnique({
        where: { runId_batchNumber: { runId, batchNumber: batchNum } }
      });
      if (existingCheckpoint) continue;

      const batchSymbols = symbols.slice((batchNum - 1) * BATCH_SIZE, batchNum * BATCH_SIZE);
      const startTime = Date.now();
      let processedTrades = 0;

      // Atomic transaction logic for the batch
      await prisma.$transaction(async (tx) => {
        for (const symbol of batchSymbols) {
          try {
            // Mock signals and historical data
            const ohlc = await HistoricalProvider.getHistory(symbol, run.startDate, run.endDate);
            if (ohlc.length < 2) continue;

            // Mock: find a Bullish signal on day 0
            const entryPrice = ohlc[0].close;
            const sl = entryPrice * 0.95;
            const target = entryPrice * 1.10;

            const tradeResult = TradeEngineService.simulateTrade(
              'LONG',
              entryPrice,
              sl,
              target,
              ohlc,
              {
                capital: run.capital,
                riskModel: run.riskModel,
                riskValue: 1, // 1% risk
                executionMode: run.executionMode
              }
            );

            const trade = await tx.trade.create({
              data: {
                backtestRunId: runId,
                symbol,
                type: 'LONG',
                signal: 'Breakout',
                status: tradeResult.status,
                entryDate: new Date(ohlc[0].date),
                entryPrice,
                entryReason: 'Scanner Trigger',
                exitDate: tradeResult.exitDate ? new Date(tradeResult.exitDate) : null,
                exitPrice: tradeResult.exitPrice,
                exitReason: tradeResult.exitReason,
                stopLoss: sl,
                target: target,
                riskAmount: tradeResult.riskAmount,
                fees: 0,
                slippage: 0,
                executionDelayMs: 0,
                rr: tradeResult.rr,
                durationDays: tradeResult.durationDays,
                positionSize: tradeResult.positionSize,
                pnl: tradeResult.pnl,
                pnlPercent: tradeResult.pnlPercent
              }
            });

            // Journals
            if (tradeResult.journalEvents.length > 0) {
              const limitedEvents = tradeResult.journalEvents.slice(0, 100);
              await tx.journal.createMany({
                data: limitedEvents.map(e => ({
                  tradeId: trade.id,
                  timestamp: e.timestamp,
                  event: e.event,
                  details: e.details
                }))
              });
            }

            processedTrades++;
          } catch (e) {
            // Failure Rule: If one symbol fails, record failure and continue
            console.error(`Symbol ${symbol} failed backtest:`, e);
          }
        }

        // Create Checkpoint inside the SAME transaction to guarantee idempotency
        await tx.backtestCheckpoint.create({
          data: {
            runId,
            batchNumber: batchNum,
            processedSymbols: batchSymbols.length,
            processedTrades,
            elapsedMs: Date.now() - startTime
          }
        });
      });
    }

    // Post processing metrics
    await MetricsService.calculateAndStoreMetrics(runId, run.metricsVersion);

    await prisma.backtestRun.update({ where: { id: runId }, data: { status: 'COMPLETED' } });
  }
}
