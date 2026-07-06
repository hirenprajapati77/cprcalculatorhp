import { MarketService, MarketStockData } from '../market.service';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { TradeEngineService, SLIPPAGE_PCT } from './trade-engine.service';
import { HistoricalProvider } from './historical.provider';
import { MetricsService } from './metrics.service';
import { calculateCPR } from '@/lib/cpr-engine';
import { ScannerService } from '@/services/scanner.service';
import { BtstService } from './btst.service';
import { prisma } from '@/lib/db';

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
    strategyMode?: string;
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

    // Fetch actual universe symbols using MarketService
    const universeStocks = MarketService.getUniverse(
      run.universe as 'NIFTY50' | 'NIFTY200' | 'NSE_FNO'
    );
    const symbols = universeStocks.map(s => s.symbol);

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
          const ohlc = await HistoricalProvider.getHistory(symbol, run.startDate, run.endDate);
          
          // Rate limit protection: 300ms between Yahoo Finance 
          // requests to prevent IP-level 429 on large universes
          await new Promise(r => setTimeout(r, 300));
          
          successCount++; // Track successfully fetched symbols

          if (ohlc.length < 2) continue;

          let blockedUntilIndex = -1; // per-symbol cooldown tracker
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
              const avgVolume = validHistory.length > 0
                ? validHistory.reduce((sum, d) => sum + d.volume, 0) / validHistory.length
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
              const scanResult = ScannerService.scanStock(stock, today.date);
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
                const entrySlipped = bias === 'BULLISH'
                  ? triggeredPrice * (1 + SLIPPAGE_PCT)
                  : triggeredPrice * (1 - SLIPPAGE_PCT);

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
                    executionMode: 'conservative'
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
                    slippage: SLIPPAGE_PCT * 2 * 100,
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
              // ── BTST_STBT_DRIVEN ────────────────────────────────────────────────────
              // Entry: today's close (day i). Exit: next day only (EOD forced).
              // VWAP(20pt) + closeStrength(15pt) are absent from snapshot → score out of 65.

              // Need day i+1 to exist for exit simulation
              if (i + 1 >= ohlc.length) continue;

              // Build MarketStockData snapshot — no vwap/candle15m (zeros those components)
              const historySlice = ohlc.slice(0, i + 1);
              const validHistory = ohlc.slice(0, i);
              const avgVol = validHistory.length > 0
                ? validHistory.reduce((sum, d) => sum + d.volume, 0) / validHistory.length
                : today.volume;

              const btstStock: MarketStockData = {
                symbol,
                market: 'NSE',
                sector: 'Unknown',
                open: today.open,
                high: today.high,
                low: today.low,
                close: today.close,
                volume: today.volume,
                avgVolume: avgVol,
                marketCap: 0,
                ltp: today.close,
                history: historySlice,
                // vwap and candle15m intentionally omitted:
                // scoreBreakdown.vwap(20pt) and closeStrength(15pt) self-zero
                // when these fields are absent. Max backtest score = 65/100.
              };

              const avgVolume = btstStock.avgVolume || 0;
              const volume = btstStock.volume || 0;
              const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

              if (avgVolume < 100000 || volume < 100000 || volumeRatio < 1.2) {
                continue; // skip illiquid stock entirely — aligns backtest with live discover() gate
              }

              const variant = run.name.includes('CLV_HYBRID') ? 'clv_hybrid' : run.name.includes('CLV_CONTINUOUS') ? 'clv_continuous' : run.name.includes('NO_VDU_WEIGHTED') ? 'no_vdu_weighted' : 
                             (run.name.includes('CPR_AWARE') ? 'cpr_aware' : 'baseline');
              const btstResult = BtstService.evaluateOvernight(btstStock, today.date, variant);

              tagDistribution[btstResult.tag]++;

              if (Math.random() < 0.005) {
                console.log(`[DEBUG BTST] ${symbol} ${today.date} -> tag: ${btstResult.tag}, L: ${btstResult.longScore}, S: ${btstResult.shortScore}, SL: ${btstResult.sl}, TGT: ${btstResult.target}, Entry: ${btstStock.close}`);
              }

              // Skip WEAK/NEUTRAL_CONFLICT — mirrors live Telegram alert filter
              if (btstResult.tag === 'WEAK' || btstResult.tag === 'NEUTRAL_CONFLICT') continue;

              const btstDirection = btstResult.tag === 'LONG' ? 'LONG' : 'SHORT';
              if (run.executionMode === 'LONG_ONLY' && btstDirection === 'SHORT') continue;
              if (run.executionMode === 'SHORT_ONLY' && btstDirection === 'LONG') continue;

              // Entry = today's close with slippage (confirmed BTST mechanic — no trigger search)
              const btstEntry = btstDirection === 'LONG'
                ? today.close * (1 + SLIPPAGE_PCT)
                : today.close * (1 - SLIPPAGE_PCT);

              const btstSl = btstResult.sl;
              const btstTarget = btstResult.target;

              // Skip degenerate setups
              if (btstSl <= 0) continue;
              if (btstDirection === 'LONG' && btstTarget <= btstEntry) continue;
              if (btstDirection === 'SHORT' && btstTarget >= btstEntry) continue;

              // EOD exit: single-day window → CLOSED_TIME_EXIT at day[i+1].close if
              // neither SL nor target is hit intraday. No new simulateTrade overload needed.
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
                }
              );

              const btstExitPriceForFees = btstTradeResult.exitPrice ?? btstEntry;
              const btstFees = (btstEntry + btstExitPriceForFees) * btstTradeResult.positionSize * 0.0003;
              const btstNetPnl = btstTradeResult.pnl - btstFees;
              const btstScore = btstResult.tag === 'LONG' ? btstResult.longScore : btstResult.shortScore;

              // Store scoreBreakdown alongside signals so future analysis can check
              // whether vwap/closeStrength correlate with outcomes once intraday data arrives.
              const btstSignalsPayload = JSON.stringify({
                signals: btstResult.signals,
                scoreBreakdown: btstResult.scoreBreakdown,
                longScore: btstResult.longScore,
                shortScore: btstResult.shortScore,
                tag: btstResult.tag,
                _backtestNote: 'vwap(20pt)+closeStrength(15pt) excluded — no intraday data; max score=65'
              });

              const btstTrade = await prisma.trade.create({
                data: {
                  backtestRunId: runId,
                  symbol,
                  type: btstDirection,
                  signal: `BTST_${btstResult.tag}`,
                  status: btstTradeResult.status,
                  strategyMode: 'BTST_STBT_DRIVEN',
                  entryDate: new Date(today.date),
                  entryPrice: btstEntry,
                  entryReason: `BTST EOD entry (${btstResult.tag}, score ${btstScore}/65)`,
                  exitDate: btstTradeResult.exitDate ? new Date(btstTradeResult.exitDate) : null,
                  exitPrice: btstTradeResult.exitPrice,
                  exitReason: btstTradeResult.exitReason,
                  stopLoss: btstSl,
                  target: btstTarget,
                  riskAmount: btstTradeResult.riskAmount,
                  fees: btstFees,
                  slippage: SLIPPAGE_PCT * 2 * 100,
                  executionDelayMs: 0,
                  rr: btstTradeResult.rr,
                  durationDays: btstTradeResult.durationDays,
                  positionSize: btstTradeResult.positionSize,
                  pnl: btstNetPnl,
                  pnlPercent: btstNetPnl / run.capital * 100,
                  score: btstScore,
                  signalsJson: btstSignalsPayload,
                  triggerDelayDays: 0, // BTST always enters at same-day close
                }
              });

              if (btstTradeResult.journalEvents.length > 0) {
                const limitedEvents = btstTradeResult.journalEvents.slice(0, 100);
                await prisma.journal.createMany({
                  data: limitedEvents.map(e => ({
                    tradeId: btstTrade.id,
                    timestamp: e.timestamp,
                    event: e.event,
                    details: e.details
                  }))
                });
              }

              processedTrades++;
              blockedUntilIndex = i + 1; // Hold for 1 day — block next day from new setup

            } else {
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
              let targetType: 'R2' | 'R1' | 'fallback' = 'fallback';

              if (bias === 'BULLISH') {
                direction = 'LONG';
                entryPrice = cpr.tc;

                if (today.open > cpr.tc) {
                  // Gap-up open: breakout confirmed, fill at open
                  entryPrice = today.open;
                  entryPrice *= (1 + SLIPPAGE_PCT);
                } else if (today.high < cpr.tc) {
                  continue; // TC never reached today — skip
                } else {
                  // Non-gap intraday touch of TC — require EOD close confirmation:
                  // close > TC (day held above TC) AND close > open (bullish body, not wick rejection)
                  // Models BTST-style confirmed breakout on daily data; entry at TC price.
                  if (today.close <= cpr.tc || today.close <= today.open) continue;
                  entryPrice *= (1 + SLIPPAGE_PCT);
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
                targetType = targetTypeL;
              } else {
                direction = 'SHORT';
                entryPrice = cpr.bc;

                if (today.open < cpr.bc) {
                  // Gap-down open: breakdown confirmed, fill at open
                  entryPrice = today.open;
                  entryPrice *= (1 - SLIPPAGE_PCT);
                } else if (today.low > cpr.bc) {
                  continue; // BC never reached — skip
                } else {
                  // Non-gap intraday touch of BC — require EOD close confirmation:
                  // close < BC (day held below BC) AND close < open (bearish body, not wick rejection)
                  if (today.close >= cpr.bc || today.close >= today.open) continue;
                  entryPrice *= (1 - SLIPPAGE_PCT);
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
                targetType = targetTypeS;
              }

              // Only run directions matching executionMode
              if (run.executionMode === 'LONG_ONLY' && direction === 'SHORT') continue;
              if (run.executionMode === 'SHORT_ONLY' && direction === 'LONG') continue;

              // Bound the holding window: 1-2 day CPR/BTST hold + 1 day buffer
              const MAX_HOLDING_DAYS = 2;
              const tradeOhlc = ohlc.slice(i, i + MAX_HOLDING_DAYS);
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
                  executionMode: 'conservative'
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
                  slippage: SLIPPAGE_PCT * 2 * 100,
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
