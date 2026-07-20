import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import type { OvernightSignal } from '@prisma/client';
import { BtstService } from '@/services/backtest/btst.service';
import { MarketService } from '@/services/market.service';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { OvernightService } from '@/services/overnight/overnight.service';
import { RegimeService } from '@/services/overnight/regime.service';
import { EntryManagerService } from '@/services/overnight/entry-manager.service';
import { selectTradableOvernightPicks } from '@/services/overnight/overnight-ui-adapter';
import {
  getISTTime,
  isBtstJournalWindowOpen,
  BTST_CLOCK,
} from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { prisma } from '@/lib/db';

/** Aligns with BtstRankingService BTST_READY floor. */
const MIN_OVERNIGHT_SCORE = 85;

/**
 * Premium / tradable BTST–STBT Trade Journal cron.
 *
 * Robust pipeline:
 * 1. Single source of truth = OvernightSignal (BtstSignal table) from overnight.service
 * 2. If today's rows are missing, run OvernightService.discover() once (same pipeline —
 *    never BtstService.discover(), which caused the 60% UNKNOWN quality gap)
 * 3. Journal only qualityBucket=TRADEABLE + READY+ score (>=85)
 * 4. Suppress STBT when NIFTY regime is BULL (month of evidence: STBT 32% vs BTST 54%)
 * 5. Keep Simple V2 shadow scoring (scoreV2) for research — Advanced overnightScore is authoritative
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const bypassWindow = env.NODE_ENV !== 'production' && 
                       searchParams.get('bypassWindow') === 'true';

  const { hour, minute, isTradingDay } = getISTTime();

  if (!isTradingDay && !bypassWindow) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  // Only run during [JOURNAL_START, JOURNAL_END] from BTST_WINDOWS via market-hours
  if (!isBtstJournalWindowOpen() && !bypassWindow) {
    return NextResponse.json({
      message: `BTST journal cron outside window at IST ${hour}:${String(minute).padStart(2, '0')} (expected ${BTST_CLOCK.journalStart}–${BTST_CLOCK.journalEnd})`
    });
  }

  try {
    const signalDate = TradeJournalService.todayISTString();
    const regime = await RegimeService.getMarketRegime(signalDate);
    const suppressStbt = regime.trend === 'BULL';

    let overnightEnsured = false;
    // Always refresh at journal time so picks reflect the latest 15:25+ scan (not a stale 15:10 row).
    console.log(`[BtstJournal] Refreshing OvernightSignal for ${signalDate} before journal selection.`);
    await OvernightService.discover('BOTH');
    overnightEnsured = true;

    // Prefer latest signalTime per symbol, then highest score.
    const todaySignals = await prisma.overnightSignal.findMany({
      where: { signalDate },
      orderBy: [{ signalTime: 'desc' }, { overnightScore: 'desc' }],
    });
    const { longs: topLongs, shorts: topShorts } = selectTradableOvernightPicks(
      todaySignals,
      { minScore: MIN_OVERNIGHT_SCORE, take: 2, suppressShort: suppressStbt }
    );

    if (topLongs.length === 0 && topShorts.length === 0) {
      const reason = suppressStbt
        ? 'no_tradable_setups_stbt_suppressed_bull_regime'
        : 'no_tradable_setups';
      console.warn(
        `[BtstJournal] ${reason} for ${signalDate} (regime=${regime.trend}/${regime.volatility}, ensuredScan=${overnightEnsured})`
      );
      return NextResponse.json({
        success: false,
        reason,
        signalDate,
        regime,
        overnightEnsured,
        message:
          `No TRADEABLE READY+ OvernightSignal picks for ${signalDate}. ` +
          (suppressStbt ? 'STBT suppressed (BULL regime). ' : '') +
          `Refusing weak/WATCH/UNKNOWN fills.`,
        logged: [],
        skipped: [],
      }, { status: 200 });
    }

    const logged: string[] = [];
    const skipped: string[] = [];

    // Log BTST (LONG → CE)
    for (const signal of topLongs) {
      const stockData = await MarketService.getStockData(signal.symbol);
      const ltp = stockData?.ltp ?? signal.entry ?? 0;
      const entry = signal.entry ?? ltp;
      const sl = signal.stopLoss ?? ltp * 0.98;
      const target = signal.target ?? ltp * 1.04;

      if (!ltp || ltp <= 0) {
        console.warn(`[BtstJournal] No LTP for ${signal.symbol}; skipping BTST log`);
        skipped.push(`${signal.symbol}:BTST`);
        continue;
      }

      if (stockData) {
        const ext = EntryManagerService.evaluateExtension(stockData, 'LONG');
        if (!ext.eligible) {
          console.warn(`[BtstJournal] ${signal.symbol} BTST skipped: ${ext.reason}`);
          skipped.push(`${signal.symbol}:BTST:EXTENDED`);
          continue;
        }
      }

      const suggestion = await OptionSuggestionService.suggestOption(
        signal.symbol,
        ltp,
        'BULLISH',
        entry,
        sl,
        target
      );

      if (suggestion.error || !suggestion.strike || !suggestion.ltp) {
        console.warn(
          `[BtstJournal] No CE suggestion for ${signal.symbol}: ` +
          (suggestion.error ?? 'missing strike or ltp')
        );
        skipped.push(`${signal.symbol}:BTST`);
        continue;
      }

      // Research-only: Simple V2 shadow in parallel (does not select or rank trades)
      let v2Fields: { scoreV2: number; v2Breakdown: Record<string, unknown> } | Record<string, never> = {};
      try {
        if (stockData) {
          const v2Result = BtstService.evaluateOvernightV2(stockData);
          v2Fields = {
            scoreV2: v2Result.finalScore,
            v2Breakdown: {
              hardGates:      v2Result.hardGates,
              scoreBreakdown: v2Result.scoreBreakdown,
              rawMetrics:     v2Result.rawMetrics,
              classification: v2Result.classification,
              direction:      v2Result.direction,
            },
          };
        }
      } catch (v2Err) {
        console.warn(`[BtstJournal] Simple V2 shadow scoring failed for ${signal.symbol}:`, v2Err);
      }

      const optionName = suggestion.formattedName?.replace(new RegExp(`^${signal.symbol}\\s+`), '') || `${suggestion.strike} CE`;
      const signalSummary = [
        signal.classification,
        signal.qualityBucket,
        signal.direction,
        `REGIME_${regime.trend}`,
      ].filter(Boolean).join(',');

      const didLog = await TradeJournalService.logSignal({
        signalType:     'BTST',
        symbol:         signal.symbol,
        optionContract: optionName,
        optionStrike:   suggestion.strike,
        optionType:     'CE',
        // Authoritative Advanced Engine score (0–130)
        score:          signal.overnightScore ?? 0,
        confidence:     signal.confidence ?? 0,
        signalSummary,
        overnightSignalId: signal.id,
        ...v2Fields,
      });

      if (didLog) logged.push(`${signal.symbol}:BTST`);
      else skipped.push(`${signal.symbol}:BTST`);
    }

    // Log STBT (SHORT → PE) — already empty when BULL regime
    for (const signal of topShorts) {
      const stockData = await MarketService.getStockData(signal.symbol);
      const ltp = stockData?.ltp ?? signal.entry ?? 0;
      const entry = signal.entry ?? ltp;
      const sl = signal.stopLoss ?? ltp * 1.02;
      const target = signal.target ?? ltp * 0.96;

      if (!ltp || ltp <= 0) {
        console.warn(`[BtstJournal] No LTP for ${signal.symbol}; skipping STBT log`);
        skipped.push(`${signal.symbol}:STBT`);
        continue;
      }

      if (stockData) {
        const ext = EntryManagerService.evaluateExtension(stockData, 'SHORT');
        if (!ext.eligible) {
          console.warn(`[BtstJournal] ${signal.symbol} STBT skipped: ${ext.reason}`);
          skipped.push(`${signal.symbol}:STBT:EXTENDED`);
          continue;
        }
      }

      const suggestion = await OptionSuggestionService.suggestOption(
        signal.symbol,
        ltp,
        'BEARISH',
        entry,
        sl,
        target
      );

      if (suggestion.error || !suggestion.strike || !suggestion.ltp) {
        console.warn(
          `[BtstJournal] No PE suggestion for ${signal.symbol}: ` +
          (suggestion.error ?? 'missing strike or ltp')
        );
        skipped.push(`${signal.symbol}:STBT`);
        continue;
      }

      // Research-only Simple V2 shadow (same as BTST path)
      let v2Fields: { scoreV2: number; v2Breakdown: Record<string, unknown> } | Record<string, never> = {};
      try {
        if (stockData) {
          const v2Result = BtstService.evaluateOvernightV2(stockData);
          v2Fields = {
            scoreV2: v2Result.finalScore,
            v2Breakdown: {
              hardGates:      v2Result.hardGates,
              scoreBreakdown: v2Result.scoreBreakdown,
              rawMetrics:     v2Result.rawMetrics,
              classification: v2Result.classification,
              direction:      v2Result.direction,
            },
          };
        }
      } catch (v2Err) {
        console.warn(`[BtstJournal] Simple V2 shadow scoring failed for ${signal.symbol}:`, v2Err);
      }

      const optionName = suggestion.formattedName?.replace(new RegExp(`^${signal.symbol}\\s+`), '') || `${suggestion.strike} PE`;
      const signalSummary = [
        signal.classification,
        signal.qualityBucket,
        signal.direction,
        `REGIME_${regime.trend}`,
      ].filter(Boolean).join(',');

      const didLog = await TradeJournalService.logSignal({
        signalType:     'STBT',
        symbol:         signal.symbol,
        optionContract: optionName,
        optionStrike:   suggestion.strike,
        optionType:     'PE',
        // Authoritative Advanced Engine score (0–130)
        score:          signal.overnightScore ?? 0,
        confidence:     signal.confidence ?? 0,
        signalSummary,
        overnightSignalId: signal.id,
        ...v2Fields,
      });

      if (didLog) logged.push(`${signal.symbol}:STBT`);
      else skipped.push(`${signal.symbol}:STBT`);
    }

    return NextResponse.json({
      success: true,
      signalDate,
      source: 'OvernightSignal',
      mode: 'TRADEABLE_READY_PLUS',
      regime,
      suppressStbt,
      overnightEnsured,
      picked: {
        longs: topLongs.map((s) => ({
          symbol: s.symbol,
          overnightScore: s.overnightScore,
          qualityBucket: s.qualityBucket,
          classification: s.classification,
        })),
        shorts: topShorts.map((s) => ({
          symbol: s.symbol,
          overnightScore: s.overnightScore,
          qualityBucket: s.qualityBucket,
          classification: s.classification,
        })),
      },
      logged,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
