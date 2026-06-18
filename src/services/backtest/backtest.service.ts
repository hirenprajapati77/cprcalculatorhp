import { MarketService } from '../market.service';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { TradeEngineService } from './trade-engine.service';
import { HistoricalProvider } from './historical.provider';
import { MetricsService } from './metrics.service';
import { calculateCPR } from '@/lib/cpr-engine';

const prisma = new PrismaClient();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export class BacktestService {
  private static queueInstance: Queue | null = null;

  static getQueue() {
    if (process.env.BACKTEST_EXECUTION_MODE !== 'queue') return null;
    if (!this.queueInstance) {
      try {
        this.queueInstance = new Queue('backtest.queue', { connection });
      } catch (error) {
        console.error('Failed to initialize Redis queue:', error);
        return null;
      }
    }
    return this.queueInstance;
  }

  /**
   * Queues a backtest run.
   */
  static async submitRun(config: {
    name: string;
    universe: string;
    startDate: string;
    endDate: string;
    capital: number;
    riskModel?: string;
    executionMode: string;
    metricsVersion?: number;
    riskValue?: number;
  }) {
    const mode = process.env.BACKTEST_EXECUTION_MODE || 'queue';
    
    if (mode === 'disabled') {
      return {
        jobId: null,
        status: 'UNAVAILABLE',
        progress: 0,
        estimatedDuration: 'Unknown',
        resumeSupported: false
      };
    }

    const run = await prisma.backtestRun.create({
      data: {
        name: config.name,
        universe: config.universe,
        startDate: new Date(config.startDate),
        endDate: new Date(config.endDate),
        capital: config.capital,
        riskModel: config.riskModel || 'Risk%',
        executionMode: config.executionMode,
        riskValue: config.riskValue !== undefined ? config.riskValue : 1.0,
        status: 'QUEUED',
        metricsVersion: config.metricsVersion || 1,
      }
    });

    if (mode === 'sync') {
      // Execute directly in background without waiting
      this.processRun(run.id).catch(console.error);
    } else {
      const q = this.getQueue();
      if (q) {
        await q.add('process-run', { runId: run.id });
      } else {
        // Fallback to sync if queue initialization fails
        this.processRun(run.id).catch(console.error);
      }
    }

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

    // Fetch actual universe symbols using MarketService
    const universeStocks = MarketService.getUniverse(
      run.universe as 'NIFTY50' | 'NIFTY200' | 'NSE_FNO'
    );
    const symbols = universeStocks.map(s => s.symbol);

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

      // Process symbols individually without a transaction to prevent timeouts from network fetches
      for (const symbol of batchSymbols) {
        try {
          // Mock signals and historical data
          const ohlc = await HistoricalProvider.getHistory(symbol, run.startDate, run.endDate);
          if (ohlc.length < 2) continue;

          for (let i = 1; i < ohlc.length; i++) {
            const yesterday = ohlc[i - 1];
            const today = ohlc[i];

            // Compute today's CPR from yesterday's OHLC
            const cpr = calculateCPR({
              high: yesterday.high,
              low: yesterday.low,
              close: yesterday.close,
            });

            // Determine bias: is today's open above TC?
            const bias = today.open > cpr.tc ? 'BULLISH'
                       : today.open < cpr.bc ? 'BEARISH'
                       : 'RANGE';

            if (bias === 'RANGE') continue; // skip range days

            // CPR Width filter: only trade NARROW CPR
            const widthPct = Math.abs(cpr.tc - cpr.bc) / cpr.pivot * 100;
            if (widthPct > 0.5) continue; // skip NORMAL/WIDE

            // Entry, SL, Target (mirrors live scanner logic)
            let entryPrice: number, sl: number, target: number;
            let direction: 'LONG' | 'SHORT';

            if (bias === 'BULLISH') {
              direction = 'LONG';
              entryPrice = cpr.tc;

              // If today opened above TC (gap up), fill at open instead
              if (today.open > cpr.tc) {
                entryPrice = today.open;
              } else if (today.high < cpr.tc) {
                continue; // TC never reached today — skip trade
              }

              const dayLowSL = today.low;
              const minSL = entryPrice * 0.995;
              sl = Math.min(dayLowSL, minSL);
              const risk = entryPrice - sl;

              if (risk <= 0) continue; // skip degenerate setup

              // Use R1 as target if RR >= 1.5, else R2
              target = (cpr.r1 - entryPrice) / risk >= 1.5
                ? cpr.r1 : cpr.r2;

              if (target <= entryPrice) {
                target = entryPrice + risk * 1.5; // fallback
              }
            } else {
              direction = 'SHORT';
              entryPrice = cpr.bc;

              // If today opened below BC (gap down), fill at open
              if (today.open < cpr.bc) {
                entryPrice = today.open;
              } else if (today.low > cpr.bc) {
                continue; // BC never reached — skip trade
              }

              const dayHighSL = today.high;
              const maxSL = entryPrice * 1.005;
              sl = Math.max(dayHighSL, maxSL);
              const risk = sl - entryPrice;

              if (risk <= 0) continue; // skip degenerate setup

              target = (entryPrice - cpr.s1) / risk >= 1.5
                ? cpr.s1 : cpr.s2;

              if (target >= entryPrice) {
                target = entryPrice - risk * 1.5; // fallback
              }
            }

            // Only run directions matching executionMode
            if (run.executionMode === 'LONG_ONLY' && direction === 'SHORT') continue;
            if (run.executionMode === 'SHORT_ONLY' && direction === 'LONG') continue;

            // Run trade simulation from day i onwards
            const tradeOhlc = ohlc.slice(i);
            const tradeResult = TradeEngineService.simulateTrade(
              direction,
              entryPrice,
              sl,
              target,
              tradeOhlc,
              {
                capital: run.capital,
                riskModel: run.riskModel,
                riskValue: run.riskValue ?? 1, // use config value
                executionMode: 'conservative'  // always conservative
              }
            );

            // Signal reflects actual CPR conditions
            const signal = bias === 'BULLISH'
              ? `NARROW_CPR BULLISH w=${widthPct.toFixed(3)}%`
              : `NARROW_CPR BEARISH w=${widthPct.toFixed(3)}%`;

            const trade = await prisma.trade.create({
              data: {
                backtestRunId: runId,
                symbol,
                type: direction,
                signal,
                status: tradeResult.status,
                entryDate: new Date(today.date),
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

            if (tradeResult.journalEvents.length > 0) {
              const limitedEvents = tradeResult.journalEvents.slice(0, 100);
              await prisma.journal.createMany({
                data: limitedEvents.map(e => ({
                  tradeId: trade.id,
                  timestamp: e.timestamp,
                  event: e.event,
                  details: e.details
                }))
              });
            }

            processedTrades++;
          }
        } catch (e) {
          // Failure Rule: If one symbol fails, record failure and continue
          console.error(`Symbol ${symbol} failed backtest:`, e);
        }
      }

      // Create Checkpoint individually to guarantee progress persistence
      await prisma.backtestCheckpoint.create({
        data: {
          runId,
          batchNumber: batchNum,
          processedSymbols: batchSymbols.length,
          processedTrades,
          elapsedMs: Date.now() - startTime
        }
      });
    }

    // Post processing metrics
    await MetricsService.calculateAndStoreMetrics(runId);

    await prisma.backtestRun.update({ where: { id: runId }, data: { status: 'COMPLETED' } });
  }
}
