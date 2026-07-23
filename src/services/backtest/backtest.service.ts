import { env } from '@/config/env';
import { MarketService, MarketStockData } from '../market.service';
import { Queue } from 'bullmq';
import { TradeEngineService } from './trade-engine.service';
import { HistoricalProvider } from './historical.provider';
import { MetricsService } from './metrics.service';
import { calculateCPR } from '@/lib/cpr-engine';
import { ScannerService } from '@/services/scanner.service';
import { RegimeService } from '../overnight/regime.service';
import { EventCalendarService } from '../overnight/event.service';
import { prisma } from '@/lib/db';
import { INDEX_INSTRUMENTS } from '../overnight/index-discover.service';
import { INDEX_SCORE } from '../overnight/index-ranking.service';
import { ADVANCED_SCORE } from '@/config/trading-constants';
import {
  evaluateIndexBtstDay,
  INDEX_BACKTEST_AVG_VOLUME,
} from './index-btst-backtest.helper';
import {
  evaluateStockBtstDay,
  stockBtstDiscoveryAsOfUtc,
  classifyVduBand,
} from './stock-btst-backtest.helper';
import { classifyVixBand } from './index-btst-slice-metrics';
import { toYahooNseSymbol } from '../overnight/stock-intraday.util';
import {
  indexBtstDiscoveryAsOfUtc,
  type YahooFinanceChartResponse,
} from '../overnight/index-intraday.util';

const connection = {
  host: env.REDIS_HOST || 'localhost',
  port: parseInt(env.REDIS_PORT || '6379'),
};

export class BacktestService {
  private static queueInstance: Queue | null = null;

  static getQueue() {
    if (env.BACKTEST_EXECUTION_MODE !== 'queue') return null;
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
    strategyMode?: string;
  }) {
    const mode = env.BACKTEST_EXECUTION_MODE || 'queue';
    
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
        strategyMode: config.strategyMode || 'LEGACY_NARROW_CPR',
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

    // Track tag distribution pre-filtering
    const tagDistribution = { LONG: 0, SHORT: 0, NEUTRAL_CONFLICT: 0, WEAK: 0 };

    // Fetch actual universe symbols using MarketService or INDEX_INSTRUMENTS
    const isIndexBtstDriven = run.strategyMode === 'INDEX_BTST_DRIVEN';
    const symbols = isIndexBtstDriven
      ? INDEX_INSTRUMENTS.map(i => i.symbol)
      : MarketService.getUniverse(
          run.universe as 'NIFTY50' | 'NIFTY200' | 'NSE_FNO'
        ).map(s => s.symbol);

    const vixMap = new Map<string, number>();
    if (isIndexBtstDriven) {
      const histMode = HistoricalProvider.getMode();
      if (histMode === 'mock') {
        console.warn(
          '[BacktestService] INDEX_BTST_DRIVEN requires HISTORICAL_MODE=live (or cached) for 5m VWAP/liquidity — mock mode will produce no trades.'
        );
      }
      try {
        const vixHistory = await HistoricalProvider.getHistory('^INDIAVIX', run.startDate, run.endDate);
        for (const v of vixHistory) {
          vixMap.set(v.date, v.close);
        }
        console.log(`[BacktestService] Loaded ${vixHistory.length} ^INDIAVIX historical daily candles.`);
      } catch (vixErr) {
        console.error('[BacktestService] Failed to fetch ^INDIAVIX historical data:', vixErr);
        throw new Error('Historical ^INDIAVIX data fetch failed for INDEX_BTST_DRIVEN backtest.');
      }
    }

    const BATCH_SIZE = 50;
    const batches = Math.ceil(symbols.length / BATCH_SIZE);
    let successCount = 0;

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
          const fetchSymbol = isIndexBtstDriven
            ? (INDEX_INSTRUMENTS.find(inst => inst.symbol === symbol)?.yahooSymbol || symbol)
            : symbol;
          const ohlc = await HistoricalProvider.getHistory(fetchSymbol, run.startDate, run.endDate);
          
          // Rate limit protection: 300ms between Yahoo Finance 
          // requests to prevent IP-level 429 on large universes
          await new Promise(r => setTimeout(r, 300));
          
          successCount++; // Track successfully fetched symbols

          if (ohlc.length < 2) continue;

          let blockedUntilIndex = -1; // per-symbol cooldown tracker
          let vixMatchCount = 0;
          let vixTotalEvaluated = 0;
          let indexSetupEvaluated = 0;
          let indexSetupTradable = 0;
          const macroEventCache = new Map<string, Awaited<ReturnType<typeof EventCalendarService.getMacroEventRisk>>>();
          const stockEventCache = new Map<string, Awaited<ReturnType<typeof EventCalendarService.getEventRisk>>>();
          const isScannerDriven = run.strategyMode === 'SCANNER_DRIVEN';
          const isBtstDriven = run.strategyMode === 'BTST_STBT_DRIVEN';

          for (let i = 1; i < ohlc.length; i++) {
            // Skip if a previous trade/setup is still active or seeking a trigger
            if (i <= blockedUntilIndex) continue;

            const yesterday = ohlc[i - 1];
            const today = ohlc[i];

            if (isScannerDriven) {
              // Stop candidate evaluation 5 trading days before data ends to avoid end-of-dataset bias
              if (i + 5 > ohlc.length - 1) continue;

              // 1. Build MarketStockData snapshot for "end of day i"
              const historySlice = ohlc.slice(0, i + 1);
              const validHistory = ohlc.slice(0, i); // history excluding setup day (today) to match live market service
              const rollingWindow = validHistory.slice(Math.max(0, validHistory.length - 20));
              const avgVolume = rollingWindow.length > 0
                ? rollingWindow.reduce((sum, d) => sum + d.volume, 0) / rollingWindow.length
                : today.volume;

              const stock: MarketStockData = {
                symbol,
                market: 'NSE',
                sector: 'Unknown',
                open: today.open,
                high: today.high,
                low: today.low,
                close: today.close,
                volume: today.volume,
                avgVolume,
                marketCap: 0,
                ltp: today.close,
                history: historySlice
              };

              // 2. Call scanStock
              const scanResult = await ScannerService.scanStock(stock, today.date);
              const { entry, sl, target, score, confidence, signals } = scanResult;
              const bias = signals.includes('BULLISH') ? 'BULLISH'
                         : signals.includes('BEARISH') ? 'BEARISH'
                         : 'RANGE';

              // 3. Skip RANGE days
              if (bias === 'RANGE') continue;

              // Only run directions matching executionMode
              const direction = bias === 'BULLISH' ? 'LONG' : 'SHORT';
              if (run.executionMode === 'LONG_ONLY' && direction === 'SHORT') continue;
              if (run.executionMode === 'SHORT_ONLY' && direction === 'LONG') continue;

              // 4. Look ahead day by day starting at i+1 up to i+5 for trigger
              const triggerResult = BacktestService.evaluateTrigger(
                direction === 'LONG' ? 'BULLISH' : 'BEARISH',
                entry,
                ohlc,
                i,
                5
              );
              const triggeredIndex = triggerResult ? triggerResult.triggeredIndex : -1;
              const triggeredPrice = triggerResult ? triggerResult.triggeredPrice : 0;

              // 5. Simulate or Record NEVER_TRIGGERED
              if (triggeredIndex !== -1) {
                const regime = await RegimeService.getMarketRegime(today.date);
                const volatility = regime.volatility;

                const entrySlipped = bias === 'BULLISH'
                  ? triggeredPrice * (1 + TradeEngineService.calculateSlippage(avgVolume, volatility, false))
                  : triggeredPrice * (1 - TradeEngineService.calculateSlippage(avgVolume, volatility, false));

                const SAFETY_VALVE_DAYS = 20; // Computational safety valve to prevent out-of-dataset overflow, not a trading rule.
                const tradeOhlc = ohlc.slice(triggeredIndex, Math.min(triggeredIndex + SAFETY_VALVE_DAYS, ohlc.length));

                const tradeResult = TradeEngineService.simulateTrade(
                  direction,
                  entrySlipped,
                  sl,
                  target,
                  tradeOhlc,
                  {
                    capital: run.capital,
                    riskModel: run.riskModel,
                    riskValue: run.riskValue ?? 1,
                    executionMode: 'conservative',
                    avgVolume,
                    volatility
                  }
                );

                const exitPriceForFees = tradeResult.exitPrice ?? entrySlipped;
                const fees = (entrySlipped + exitPriceForFees) * tradeResult.positionSize * 0.0003;
                const netPnl = tradeResult.pnl - fees;

                const trade = await prisma.trade.create({
                  data: {
                    backtestRunId: runId,
                    symbol,
                    type: direction,
                    signal: bias === 'BULLISH' ? 'SCANNER_BULLISH' : 'SCANNER_BEARISH',
                    status: tradeResult.status,
                    strategyMode: 'SCANNER_DRIVEN',
                    entryDate: new Date(ohlc[triggeredIndex].date),
                    entryPrice: entrySlipped,
                    entryReason: `Scanner Triggered (${triggeredIndex - i} days delay)`,
                    exitDate: tradeResult.exitDate ? new Date(tradeResult.exitDate) : null,
                    exitPrice: tradeResult.exitPrice,
                    exitReason: tradeResult.exitReason,
                    stopLoss: sl,
                    target: target,
                    riskAmount: tradeResult.riskAmount,
                    fees,
                    slippage: TradeEngineService.calculateSlippage(avgVolume, volatility, false) * 2 * 100,
                    executionDelayMs: 0,
                    rr: tradeResult.rr,
                    durationDays: tradeResult.durationDays,
                    positionSize: tradeResult.positionSize,
                    pnl: netPnl,
                    pnlPercent: netPnl / run.capital * 100,
                    cprWidth: scanResult.width,
                    score,
                    confidence,
                    signalsJson: JSON.stringify(signals),
                    triggerDelayDays: triggeredIndex - i
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
                blockedUntilIndex = triggeredIndex + (tradeOhlc.length - 1);
              } else {
                // NEVER_TRIGGERED
                await prisma.trade.create({
                  data: {
                    backtestRunId: runId,
                    symbol,
                    type: direction,
                    signal: bias === 'BULLISH' ? 'SCANNER_BULLISH' : 'SCANNER_BEARISH',
                    status: 'NEVER_TRIGGERED',
                    strategyMode: 'SCANNER_DRIVEN',
                    entryDate: new Date(today.date),
                    entryPrice: entry,
                    entryReason: 'Scanner Trigger (Never Filled)',
                    exitDate: null,
                    exitPrice: null,
                    exitReason: 'Trigger window expired',
                    stopLoss: sl,
                    target: target,
                    riskAmount: 0,
                    fees: 0,
                    slippage: 0,
                    executionDelayMs: 0,
                    rr: null,
                    durationDays: null,
                    positionSize: 0,
                    pnl: null,
                    pnlPercent: null,
                    cprWidth: scanResult.width,
                    score,
                    confidence,
                    signalsJson: JSON.stringify(signals),
                    triggerDelayDays: null
                  }
                });

                processedTrades++;
                blockedUntilIndex = i + 5;
              }
            } else if (isBtstDriven) {
              const regime = await RegimeService.getMarketRegime(today.date);
              const volatility = regime.volatility;
              // ── BTST_STBT_DRIVEN (production-aligned Advanced 130pt) ─────────────
              // Mirrors OvernightService.discover + selectTradableOvernightPicks (READY+ TRADEABLE).

              if (i + 1 >= ohlc.length) continue;

              const validHistory = ohlc.slice(0, i);
              const rollingWindow = validHistory.slice(Math.max(0, validHistory.length - 20));
              const avgVol = rollingWindow.length > 0
                ? rollingWindow.reduce((sum, d) => sum + d.volume, 0) / rollingWindow.length
                : today.volume;

              const directionFilter =
                run.executionMode === 'LONG_ONLY'
                  ? 'LONG'
                  : run.executionMode === 'SHORT_ONLY'
                    ? 'SHORT'
                    : 'BOTH';

              const yahooSymbol = toYahooNseSymbol(symbol);
              const chartJson = (await HistoricalProvider.getIntraday5mChartForDate(
                yahooSymbol,
                today.date
              )) as YahooFinanceChartResponse | null;
              await new Promise((r) => setTimeout(r, 200));

              let macroEvent = macroEventCache.get(today.date);
              if (!macroEvent) {
                macroEvent = await EventCalendarService.getMacroEventRisk(today.date);
                macroEventCache.set(today.date, macroEvent);
              }
              const stockEventKey = `${symbol}_${today.date}`;
              let stockEvent = stockEventCache.get(stockEventKey);
              if (!stockEvent) {
                stockEvent = await EventCalendarService.getEventRisk(symbol, today.date);
                stockEventCache.set(stockEventKey, stockEvent);
              }

              const evaluation = evaluateStockBtstDay({
                symbol,
                yesterday,
                today,
                historyForAtr: validHistory,
                chartJson,
                asOfTime: stockBtstDiscoveryAsOfUtc(today.date),
                regime,
                directionFilter,
                stockEvent,
                macroEvent,
              });

              if (
                !evaluation.tradable ||
                !evaluation.direction ||
                evaluation.entry == null ||
                evaluation.stopLoss == null ||
                evaluation.target == null
              ) {
                continue;
              }

              tagDistribution[evaluation.direction]++;

              const btstDirection = evaluation.direction;
              const slippage = TradeEngineService.calculateSlippage(avgVol, volatility, false);
              const btstEntry =
                btstDirection === 'LONG'
                  ? evaluation.entry * (1 + slippage)
                  : evaluation.entry * (1 - slippage);
              const btstSl = evaluation.stopLoss;
              const btstTarget = evaluation.target;

              if (btstSl <= 0) continue;
              if (btstDirection === 'LONG' && btstTarget <= btstEntry) continue;
              if (btstDirection === 'SHORT' && btstTarget >= btstEntry) continue;

              const btstTradeOhlc = ohlc.slice(i + 1, i + 2);
              const btstTradeResult = TradeEngineService.simulateTrade(
                btstDirection,
                btstEntry,
                btstSl,
                btstTarget,
                btstTradeOhlc,
                {
                  capital: run.capital,
                  riskModel: run.riskModel,
                  riskValue: run.riskValue ?? 1,
                  executionMode: 'conservative',
                  avgVolume: avgVol,
                  volatility,
                  entryDate: today.date,
                }
              );

              const btstExitPriceForFees = btstTradeResult.exitPrice ?? btstEntry;
              const btstFees =
                (btstEntry + btstExitPriceForFees) * btstTradeResult.positionSize * 0.0003;
              const btstNetPnl = btstTradeResult.pnl - btstFees;
              const btstScore = evaluation.score ?? 0;

              const btstSignalsPayload = JSON.stringify({
                signals: [evaluation.classification, evaluation.qualityBucket, btstDirection],
                scoreBreakdown: evaluation.breakdown,
                classification: evaluation.classification,
                longScore: evaluation.longScore,
                shortScore: evaluation.shortScore,
                tag: btstDirection,
                context: {
                  regimeTrend: regime.trend,
                  regimeVolatility: regime.volatility,
                  classification: evaluation.classification,
                  qualityBucket: evaluation.qualityBucket,
                  volumeRatio: evaluation.volumeRatio,
                  vduBand: classifyVduBand(evaluation.volumeRatio),
                  direction: btstDirection,
                },
                _backtestNote:
                  'Production-aligned BtstRankingService/StbtRankingService (130pt) with historical 5m VWAP/VDU 1.5× at 15:25 IST. P&L is stock spot proxy — not option premium.',
              });

              const btstTrade = await prisma.trade.create({
                data: {
                  backtestRunId: runId,
                  symbol,
                  type: btstDirection,
                  signal: `BTST_${evaluation.classification}`,
                  status: btstTradeResult.status,
                  strategyMode: 'BTST_STBT_DRIVEN',
                  entryDate: new Date(today.date),
                  entryPrice: btstEntry,
                  entryReason: `Stock BTST EOD (${evaluation.classification}, score ${btstScore}/${ADVANCED_SCORE.MAX})`,
                  exitDate: btstTradeResult.exitDate ? new Date(btstTradeResult.exitDate) : null,
                  exitPrice: btstTradeResult.exitPrice,
                  exitReason: btstTradeResult.exitReason,
                  stopLoss: btstSl,
                  target: btstTarget,
                  riskAmount: btstTradeResult.riskAmount,
                  fees: btstFees,
                  slippage: slippage * 2 * 100,
                  executionDelayMs: 0,
                  rr: btstTradeResult.rr,
                  durationDays: btstTradeResult.durationDays,
                  positionSize: btstTradeResult.positionSize,
                  pnl: btstNetPnl,
                  pnlPercent: (btstNetPnl / run.capital) * 100,
                  score: btstScore,
                  signalsJson: btstSignalsPayload,
                  triggerDelayDays: 0,
                },
              });

              if (btstTradeResult.journalEvents.length > 0) {
                const limitedEvents = btstTradeResult.journalEvents.slice(0, 100);
                await prisma.journal.createMany({
                  data: limitedEvents.map((e) => ({
                    tradeId: btstTrade.id,
                    timestamp: e.timestamp,
                    event: e.event,
                    details: e.details,
                  })),
                });
              }

              processedTrades++;
              blockedUntilIndex = i + 1;

            } else if (isIndexBtstDriven) {
              const regime = await RegimeService.getMarketRegime(today.date);
              const volatility = regime.volatility;

              if (i + 1 >= ohlc.length) continue;

              vixTotalEvaluated++;
              const vixClose = vixMap.get(today.date);
              if (vixClose !== undefined && vixClose !== null) {
                vixMatchCount++;
              }

              const chartJson = (await HistoricalProvider.getIntraday5mChartForDate(
                fetchSymbol,
                today.date
              )) as YahooFinanceChartResponse | null;
              await new Promise((r) => setTimeout(r, 200));

              indexSetupEvaluated++;
              const evaluation = evaluateIndexBtstDay({
                yesterday,
                today,
                historyForAtr: ohlc.slice(0, i),
                vixClose: vixClose ?? null,
                suppressLongBear: regime.trend === 'BEAR',
                chartJson,
                asOfTime: indexBtstDiscoveryAsOfUtc(today.date),
              });

              if (!evaluation.tradable || evaluation.entry == null || evaluation.stopLoss == null || evaluation.target == null) {
                continue;
              }

              indexSetupTradable++;
              tagDistribution['LONG']++;

              const slippage = TradeEngineService.calculateSlippage(
                INDEX_BACKTEST_AVG_VOLUME,
                volatility,
                false
              );
              const btstEntry = evaluation.entry * (1 + slippage);
              const btstSl = evaluation.stopLoss;
              const risk = btstEntry - btstSl;
              if (risk <= 0) continue;
              const btstTarget = btstEntry + risk * 2.0;

              const btstTradeOhlc = ohlc.slice(i + 1, i + 2);
              const btstTradeResult = TradeEngineService.simulateTrade(
                'LONG',
                btstEntry,
                btstSl,
                btstTarget,
                btstTradeOhlc,
                {
                  capital: run.capital,
                  riskModel: run.riskModel,
                  riskValue: run.riskValue ?? 1,
                  executionMode: 'conservative',
                  avgVolume: INDEX_BACKTEST_AVG_VOLUME,
                  volatility,
                  entryDate: today.date,
                }
              );

              const btstExitPriceForFees = btstTradeResult.exitPrice ?? btstEntry;
              const btstFees = (btstEntry + btstExitPriceForFees) * btstTradeResult.positionSize * 0.0003;
              const btstNetPnl = btstTradeResult.pnl - btstFees;

              const btstSignalsPayload = JSON.stringify({
                signals: ['INDEX_BTST_CALL'],
                scoreBreakdown: evaluation.breakdown,
                classification: evaluation.classification,
                longScore: evaluation.score,
                shortScore: 0,
                tag: 'LONG',
                context: {
                  vixClose: vixClose ?? null,
                  vixBand: classifyVixBand(vixClose),
                  regimeTrend: regime.trend,
                  regimeVolatility: regime.volatility,
                  classification: evaluation.classification,
                },
                _backtestNote:
                  'Production-aligned IndexRankingService (130pt) with historical 5m VWAP/liquidity at 15:25 IST. P&L is index spot proxy — not option premium.',
              });

              const btstTrade = await prisma.trade.create({
                data: {
                  backtestRunId: runId,
                  symbol,
                  type: 'LONG',
                  signal: 'INDEX_BTST_CALL',
                  status: btstTradeResult.status,
                  strategyMode: 'INDEX_BTST_DRIVEN',
                  entryDate: new Date(today.date),
                  entryPrice: btstEntry,
                  entryReason: `Index BTST (${evaluation.classification}, score ${evaluation.score}/${INDEX_SCORE.MAX})`,
                  exitDate: btstTradeResult.exitDate ? new Date(btstTradeResult.exitDate) : null,
                  exitPrice: btstTradeResult.exitPrice,
                  exitReason: btstTradeResult.exitReason,
                  stopLoss: btstSl,
                  target: btstTarget,
                  riskAmount: btstTradeResult.riskAmount,
                  fees: btstFees,
                  slippage: slippage * 2 * 100,
                  executionDelayMs: 0,
                  rr: btstTradeResult.rr,
                  durationDays: btstTradeResult.durationDays,
                  positionSize: btstTradeResult.positionSize,
                  pnl: btstNetPnl,
                  pnlPercent: (btstNetPnl / run.capital) * 100,
                  score: evaluation.score ?? 0,
                  signalsJson: btstSignalsPayload,
                  triggerDelayDays: 0,
                },
              });

              if (btstTradeResult.journalEvents.length > 0) {
                const limitedEvents = btstTradeResult.journalEvents.slice(0, 100);
                await prisma.journal.createMany({
                  data: limitedEvents.map((e) => ({
                    tradeId: btstTrade.id,
                    timestamp: e.timestamp,
                    event: e.event,
                    details: e.details,
                  })),
                });
              }

              processedTrades++;
              blockedUntilIndex = i + 1;

            } else {
              const validHistory = ohlc.slice(0, i);
              const avgVolume = validHistory.length > 0
                ? validHistory.reduce((sum, d) => sum + d.volume, 0) / validHistory.length
                : today.volume;
              const volatility = (await RegimeService.getMarketRegime(today.date)).volatility;

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
              let _targetType: 'R2' | 'R1' | 'fallback' = 'fallback';
              let isCloseEntry = false;

              if (bias === 'BULLISH') {
                direction = 'LONG';
                entryPrice = cpr.tc;

                if (today.open > cpr.tc) {
                  // Gap-up open: breakout confirmed, fill at open
                  entryPrice = today.open;
                  entryPrice *= (1 + TradeEngineService.calculateSlippage(avgVolume, volatility, false));
                  isCloseEntry = false;
                } else if (today.high < cpr.tc) {
                  continue; // TC never reached today — skip
                } else {
                  // Non-gap intraday touch of TC — require EOD close confirmation:
                  // close > TC (day held above TC) AND close > open (bullish body, not wick rejection)
                  // Strategy: Daily confirmed breakout. Entry: Market-on-close after confirmation.
                  if (today.close <= cpr.tc || today.close <= today.open) continue;
                  entryPrice = today.close;
                  entryPrice *= (1 + TradeEngineService.calculateSlippage(avgVolume, volatility, false));
                  isCloseEntry = true;
                }

                // CPR-based SL: use BC as natural support (known pre-market).
                // Floor: enforce at least 1% below entry — 0.3% was inside NSE intraday noise range.
                sl = cpr.bc < entryPrice * 0.99 ? cpr.bc : entryPrice * 0.99;
                const risk = entryPrice - sl;

                if (risk <= 0) continue; // skip degenerate setup

                // Prefer R2 target (higher RR); fall back to R1; then 2R synthetic.
                // With 25% win rate, breakeven requires RR ≥ 3 — R1 alone (~1.5R) is insufficient.
                const r2RrL = (cpr.r2 - entryPrice) / risk;
                const r1RrL = (cpr.r1 - entryPrice) / risk;
                let targetTypeL: 'R2' | 'R1' | 'fallback';
                if (r2RrL >= 1.5)      { target = cpr.r2; targetTypeL = 'R2'; }
                else if (r1RrL >= 1.5) { target = cpr.r1; targetTypeL = 'R1'; }
                else                   { target = entryPrice + risk * 2.0; targetTypeL = 'fallback'; }
                _targetType = targetTypeL;
              } else {
                direction = 'SHORT';
                entryPrice = cpr.bc;

                if (today.open < cpr.bc) {
                  // Gap-down open: breakdown confirmed, fill at open
                  entryPrice = today.open;
                  entryPrice *= (1 - TradeEngineService.calculateSlippage(avgVolume, volatility, false));
                  isCloseEntry = false;
                } else if (today.low > cpr.bc) {
                  continue; // BC never reached — skip
                } else {
                  // Non-gap intraday touch of BC — require EOD close confirmation:
                  // close < BC (day held below BC) AND close < open (bearish body, not wick rejection)
                  // Strategy: Daily confirmed breakdown. Entry: Market-on-close after confirmation.
                  if (today.close >= cpr.bc || today.close >= today.open) continue;
                  entryPrice = today.close;
                  entryPrice *= (1 - TradeEngineService.calculateSlippage(avgVolume, volatility, false));
                  isCloseEntry = true;
                }

                // CPR-based SL: use TC as natural resistance (known pre-market).
                // Cap: enforce at most 1% above entry — 0.3% was inside NSE intraday noise range.
                sl = cpr.tc > entryPrice * 1.01 ? cpr.tc : entryPrice * 1.01;
                const risk = sl - entryPrice;

                if (risk <= 0) continue; // skip degenerate setup

                // Prefer S2 target (higher RR); fall back to S1; then 2R synthetic.
                const r2RrS = (entryPrice - cpr.s2) / risk;
                const r1RrS = (entryPrice - cpr.s1) / risk;
                let targetTypeS: 'R2' | 'R1' | 'fallback';
                if (r2RrS >= 1.5)      { target = cpr.s2; targetTypeS = 'R2'; }
                else if (r1RrS >= 1.5) { target = cpr.s1; targetTypeS = 'R1'; }
                else                   { target = entryPrice - risk * 2.0; targetTypeS = 'fallback'; }
                _targetType = targetTypeS;
              }

              // Only run directions matching executionMode
              if (run.executionMode === 'LONG_ONLY' && direction === 'SHORT') continue;
              if (run.executionMode === 'SHORT_ONLY' && direction === 'LONG') continue;

              // Bound the holding window: 1-2 day CPR/BTST hold + 1 day buffer
              const MAX_HOLDING_DAYS = 2;
              const startIndex = isCloseEntry ? i + 1 : i;
              const tradeOhlc = ohlc.slice(startIndex, startIndex + MAX_HOLDING_DAYS);
              const tradeResult = TradeEngineService.simulateTrade(
                direction,
                entryPrice,
                sl,
                target,
                tradeOhlc,
                {
                  capital: run.capital,
                  riskModel: run.riskModel,
                  riskValue: run.riskValue ?? 1,
                  executionMode: 'conservative',
                  avgVolume,
                  volatility
                }
              );

              const exitPriceForFees = tradeResult.exitPrice ?? entryPrice;
              const fees = (entryPrice + exitPriceForFees) * tradeResult.positionSize * 0.0003;
              const netPnl = tradeResult.pnl - fees;

              const trade = await prisma.trade.create({
                data: {
                  backtestRunId: runId,
                  symbol,
                  type: direction,
                  signal: bias === 'BULLISH' ? 'NARROW_CPR_BULLISH' : 'NARROW_CPR_BEARISH',
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
                  fees,
                  slippage: TradeEngineService.calculateSlippage(avgVolume, volatility, false) * 2 * 100,
                  executionDelayMs: 0,
                  rr: tradeResult.rr,
                  durationDays: tradeResult.durationDays,
                  positionSize: tradeResult.positionSize,
                  pnl: netPnl,
                  pnlPercent: netPnl / run.capital * 100,
                  cprWidth: widthPct
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
              blockedUntilIndex = i + (tradeOhlc.length - 1);
            }
          }

          if (isIndexBtstDriven && vixTotalEvaluated > 0) {
            const matchPct = ((vixMatchCount / vixTotalEvaluated) * 100).toFixed(1);
            const tradablePct =
              indexSetupEvaluated > 0
                ? ((indexSetupTradable / indexSetupEvaluated) * 100).toFixed(1)
                : '0.0';
            console.log(
              `[BacktestService] INDEX_BTST_DRIVEN ${symbol}: VIX match ${vixMatchCount}/${vixTotalEvaluated} (${matchPct}%), tradable ${indexSetupTradable}/${indexSetupEvaluated} (${tradablePct}%)`
            );
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

    const totalSymbols = symbols.length;
    console.log(
      `[Backtest] Data coverage: ${successCount}/${totalSymbols} ` +
      `stocks fetched (${Math.round(successCount/totalSymbols*100)}%)`
    );

    console.log(`\n--- ${run.name} PRE-FILTER TAG DISTRIBUTION ---`);
    console.log(`LONG: ${tagDistribution.LONG}`);
    console.log(`SHORT: ${tagDistribution.SHORT}`);
    console.log(`NEUTRAL_CONFLICT: ${tagDistribution.NEUTRAL_CONFLICT}`);
    console.log(`WEAK: ${tagDistribution.WEAK}`);
    console.log(`-----------------------------------------------`);

    if (successCount / totalSymbols < 0.8) {
      console.warn(
        '[Backtest] WARNING: Low data coverage (<80%). ' +
        'Results may not be statistically reliable.'
      );
    }

    // Post processing metrics
    await MetricsService.calculateAndStoreMetrics(runId);

    await prisma.backtestRun.update({ where: { id: runId }, data: { status: 'COMPLETED' } });
  }

  /**
   * Helper to check if entry levels are breached within trigger window (Task B).
   */
  static evaluateTrigger(
    bias: 'BULLISH' | 'BEARISH',
    entry: number,
    ohlc: { open: number; high: number; low: number; close: number; date: string }[],
    startIndex: number,
    triggerWindowDays = 5
  ): { triggeredIndex: number; triggeredPrice: number } | null {
    const triggerLimit = Math.min(startIndex + triggerWindowDays, ohlc.length - 1);
    for (let j = startIndex + 1; j <= triggerLimit; j++) {
      const forwardDay = ohlc[j];
      if (bias === 'BULLISH') {
        if (forwardDay.high >= entry) {
          const triggeredPrice = Math.max(entry, forwardDay.open);
          return { triggeredIndex: j, triggeredPrice };
        }
      } else if (bias === 'BEARISH') {
        if (forwardDay.low <= entry) {
          const triggeredPrice = Math.min(entry, forwardDay.open);
          return { triggeredIndex: j, triggeredPrice };
        }
      }
    }
    return null;
  }
}
