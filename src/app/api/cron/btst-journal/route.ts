import { NextRequest, NextResponse } from 'next/server';
import { BtstService } from '@/services/backtest/btst.service';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { getISTTime } from '@/lib/market-hours';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('x-cron-secret');
  if (!cronSecret || authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hour, minute, isTradingDay } = getISTTime();

  if (!isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  // Only run during 15:25–15:35 IST window (cron fires at 15:25)
  const timeValue = hour * 100 + minute;
  if (timeValue < 1525 || timeValue > 1535) {
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

      await TradeJournalService.logSignal({
        signalType:     'BTST',
        symbol:         signal.symbol,
        optionContract: `${suggestion.strike} CE`,
        optionStrike:   suggestion.strike,
        optionType:     'CE',
        score:          signal.longScore,
        confidence:     signal.gapConfidence || 0,
        signalSummary:  signal.signals.join(','),
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

      await TradeJournalService.logSignal({
        signalType:     'STBT',
        symbol:         signal.symbol,
        optionContract: `${suggestion.strike} PE`,
        optionStrike:   suggestion.strike,
        optionType:     'PE',
        score:          signal.shortScore,
        confidence:     signal.gapConfidence || 0,
        signalSummary:  signal.signals.join(','),
      });

      logged.push(`${signal.symbol}:STBT`);
    }

    return NextResponse.json({ success: true, logged, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
