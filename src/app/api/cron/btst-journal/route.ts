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
import { getISTTime } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { prisma } from '@/lib/db';

/** Premium journal: only READY+ classifications (not WATCH / IGNORE). */
const LONG_READY = ['STRONG_BTST', 'BTST_READY'];
const SHORT_READY = ['STRONG_STBT', 'STBT_READY'];
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
 * 5. Keep v2 shadow scoring unchanged
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

  // Only run during 15:20–15:30 IST (executable window; market closes 15:30)
  const timeValue = hour * 100 + minute;
  if ((timeValue < 1520 || timeValue > 1530) && !bypassWindow) {
    return NextResponse.json({
      message: `BTST journal cron outside window at IST ${hour}:${String(minute).padStart(2, '0')}`
    });
  }

  try {
    const signalDate = TradeJournalService.todayISTString();
    const regime = await RegimeService.getMarketRegime(signalDate);
    const suppressStbt = regime.trend === 'BULL';

    let overnightEnsured = false;
    const anyToday = await prisma.overnightSignal.count({ where: { signalDate } });
    if (anyToday === 0) {
      // Same OvernightSignal pipeline — not the disconnected simple engine.
      console.warn(
        `[BtstJournal] No OvernightSignal for ${signalDate}; running OvernightService.discover() to populate.`
      );
      await OvernightService.discover('BOTH');
      overnightEnsured = true;
    }

    const [topLongs, topShortsRaw] = await Promise.all([
      prisma.overnightSignal.findMany({
        where: {
          signalDate,
          direction: 'LONG',
          qualityBucket: 'TRADEABLE',
          classification: { in: LONG_READY },
          overnightScore: { gte: MIN_OVERNIGHT_SCORE },
        },
        orderBy: { overnightScore: 'desc' },
        take: 2,
      }),
      prisma.overnightSignal.findMany({
        where: {
          signalDate,
          direction: 'SHORT',
          qualityBucket: 'TRADEABLE',
          classification: { in: SHORT_READY },
          overnightScore: { gte: MIN_OVERNIGHT_SCORE },
        },
        orderBy: { overnightScore: 'desc' },
        take: 2,
      }),
    ]);

    const topShorts: OvernightSignal[] = suppressStbt ? [] : topShortsRaw;

    if (topLongs.length === 0 && topShorts.length === 0) {
      const reason = suppressStbt && topShortsRaw.length > 0 && topLongs.length === 0
        ? 'no_tradable_longs_stbt_suppressed_bull_regime'
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
        candidatesSkipped: {
          shortsSuppressedByRegime: suppressStbt ? topShortsRaw.map((s) => s.symbol) : [],
        },
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

      // Shadow: compute v2 score in parallel (does not affect production)
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
        console.warn(`[BtstJournal] v2 scoring failed for ${signal.symbol}:`, v2Err);
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
        score:          signal.overnightScore ?? 0,
        confidence:     signal.confidence ?? 0,
        signalSummary,
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
        console.warn(`[BtstJournal] v2 scoring failed for ${signal.symbol}:`, v2Err);
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
        score:          signal.overnightScore ?? 0,
        confidence:     signal.confidence ?? 0,
        signalSummary,
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
        shortsSuppressedByRegime: suppressStbt
          ? topShortsRaw.map((s) => ({
              symbol: s.symbol,
              overnightScore: s.overnightScore,
              qualityBucket: s.qualityBucket,
            }))
          : [],
      },
      logged,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
