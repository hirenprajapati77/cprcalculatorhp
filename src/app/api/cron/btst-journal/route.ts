import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { BtstService } from '@/services/backtest/btst.service';
import { MarketService } from '@/services/market.service';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { getISTTime } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { prisma } from '@/lib/db';

/**
 * BTST/STBT Trade Journal cron.
 *
 * Single source of truth: OvernightSignal rows (DB table "BtstSignal") written by
 * overnight.service.ts via /api/overnight/refresh. We intentionally do NOT call
 * BtstService.discover() here — that was a disconnected ranking pipeline that left
 * qualityBucketAtSignal / regimeSnapshotAtSignal null for ~60% of journal trades.
 *
 * SEQUENCING DEPENDENCY: OvernightSignal must already be populated for today's IST
 * signalDate before this cron fires (15:20–15:30 IST). There is currently no crontab
 * entry for /api/overnight/refresh in scratch/deploy_final.sh — if that job has not
 * run, this route returns success:false with reason overnight_signals_missing and
 * does NOT fall back to BtstService.discover() (that would re-introduce the split).
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

    // Same source that logSignal() joins for quality/regime snapshots.
    // Exclude IGNORE / NEUTRAL_CONFLICT — those are not actionable journal picks.
    const excludeClassifications = ['IGNORE', 'NEUTRAL_CONFLICT'];

    const [topLongs, topShorts] = await Promise.all([
      prisma.overnightSignal.findMany({
        where: {
          signalDate,
          direction: 'LONG',
          classification: { notIn: excludeClassifications },
        },
        orderBy: { overnightScore: 'desc' },
        take: 2,
      }),
      prisma.overnightSignal.findMany({
        where: {
          signalDate,
          direction: 'SHORT',
          classification: { notIn: excludeClassifications },
        },
        orderBy: { overnightScore: 'desc' },
        take: 2,
      }),
    ]);

    if (topLongs.length === 0 && topShorts.length === 0) {
      // Do not silently reintroduce BtstService.discover() — that disconnects quality tags.
      console.warn(
        `[BtstJournal] No OvernightSignal rows for ${signalDate}. ` +
        `Ensure /api/overnight/refresh ran before this cron (sequencing dependency).`
      );
      return NextResponse.json({
        success: false,
        reason: 'overnight_signals_missing',
        signalDate,
        message:
          `No OvernightSignal (BtstSignal) rows for ${signalDate}. ` +
          `Schedule /api/overnight/refresh before btst-journal; refusing disconnected discover() fallback.`,
        logged: [],
        skipped: [],
      }, { status: 503 });
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
          // Approximate sector return as 0 when no live index feed available
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

    // Log STBT (SHORT → PE)
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

      const optionName = suggestion.formattedName?.replace(new RegExp(`^${signal.symbol}\\s+`), '') || `${suggestion.strike} PE`;
      const signalSummary = [
        signal.classification,
        signal.qualityBucket,
        signal.direction,
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
