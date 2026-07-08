import { NextRequest, NextResponse } from 'next/server';
import { BtstService } from '@/services/backtest/btst.service';
import { MarketService } from '@/services/market.service';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { getISTTime } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const bypassWindow = process.env.NODE_ENV !== 'production' && 
                       searchParams.get('bypassWindow') === 'true';

  const { hour, minute, isTradingDay } = getISTTime();

  if (!isTradingDay && !bypassWindow) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  // Only run during 15:25–15:35 IST window (cron fires at 15:25)
  const timeValue = hour * 100 + minute;
  if ((timeValue < 1525 || timeValue > 1535) && !bypassWindow) {
    return NextResponse.json({
      message: `BTST journal cron outside window at IST ${hour}:${String(minute).padStart(2, '0')}`
    });
  }

  try {
    // Discover BTST/STBT signals from NSE_FNO universe
    const { results } = await BtstService.discover('NSE_FNO');

    // Top 2 LONG signals by longScore → BTST (CE)
    const topLongs = results
      .filter(r => r.tag === 'LONG')
      .sort((a, b) => b.longScore - a.longScore)
      .slice(0, 2);

    // Top 2 SHORT signals by shortScore → STBT (PE)
    const topShorts = results
      .filter(r => r.tag === 'SHORT')
      .sort((a, b) => b.shortScore - a.shortScore)
      .slice(0, 2);

    const logged: string[] = [];
    const skipped: string[] = [];

    // Log BTST (LONG → CE)
    for (const signal of topLongs) {
      const suggestion = await OptionSuggestionService.suggestOption(
        signal.symbol,
        signal.ltp,
        'BULLISH',
        signal.entry,
        signal.sl,
        signal.target
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
        const stockData = await MarketService.getStockData(signal.symbol);
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

      await TradeJournalService.logSignal({
        signalType:     'BTST',
        symbol:         signal.symbol,
        optionContract: optionName,
        optionStrike:   suggestion.strike,
        optionType:     'CE',
        score:          signal.longScore,
        confidence:     signal.gapConfidence || 0,
        signalSummary:  signal.signals.join(','),
        ...v2Fields,
      });

      logged.push(`${signal.symbol}:BTST`);
    }

    // Log STBT (SHORT → PE)
    for (const signal of topShorts) {
      const suggestion = await OptionSuggestionService.suggestOption(
        signal.symbol,
        signal.ltp,
        'BEARISH',
        signal.entry,
        signal.sl,
        signal.target
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
        const stockData = await MarketService.getStockData(signal.symbol);
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

      await TradeJournalService.logSignal({
        signalType:     'STBT',
        symbol:         signal.symbol,
        optionContract: optionName,
        optionStrike:   suggestion.strike,
        optionType:     'PE',
        score:          signal.shortScore,
        confidence:     signal.gapConfidence || 0,
        signalSummary:  signal.signals.join(','),
        ...v2Fields,
      });

      logged.push(`${signal.symbol}:STBT`);
    }

    return NextResponse.json({ success: true, logged, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
