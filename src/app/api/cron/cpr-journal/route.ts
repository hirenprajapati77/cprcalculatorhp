import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { getISTTime } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hour, minute, isTradingDay } = getISTTime();

  if (!isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  // CPR journal EOD window (HHMM) — distinct from BTST_WINDOWS discovery/journal gates
  const timeValue = hour * 100 + minute;
  if (timeValue < 1515 || timeValue > 1529) {
    return NextResponse.json({
      message: `CPR journal cron outside window at IST ${hour}:${String(minute).padStart(2, '0')}`
    });
  }

  try {
    // Today's date string in YYYY-MM-DD — ScannerResult.date is a String field
    const todayStr = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    });

    // Top 2 CPR signals: score >= 75, today only, ordered by score desc
    const topSignals = await prisma.scannerResult.findMany({
      where: {
        date:  todayStr,
        score: { gte: 75 },
      },
      orderBy: { score: 'desc' },
      take: 2,
    });

    if (topSignals.length === 0) {
      return NextResponse.json({ message: 'No CPR signals with score >= 75 today' });
    }

    const logged: string[] = [];
    const skipped: string[] = [];

    for (const signal of topSignals) {
      // Fetch option suggestion — same enrichment path as scanner
      const suggestion = await OptionSuggestionService.suggestOptionForBtst(
        signal.symbol,
        signal.ltp,
        'LONG',        // CPR breakout = bullish = CE
        signal.entry,
        signal.sl,
        signal.target
      );

      if (suggestion.error || !suggestion.strike || !suggestion.ltp) {
        console.warn(
          `[CPRJournal] No option suggestion for ${signal.symbol}: ` +
          (suggestion.error ?? 'missing strike or ltp')
        );
        skipped.push(signal.symbol);
        continue;
      }

      const optionName = suggestion.formattedName?.replace(new RegExp(`^${signal.symbol}\\s+`), '') || `${suggestion.strike} CE`;

      const didLog = await TradeJournalService.logSignal({
        signalType:     'CPR',
        symbol:         signal.symbol,
        optionContract: optionName,
        optionStrike:   suggestion.strike,
        optionType:     'CE',
        score:          signal.score,
        confidence:     signal.confidence,
        signalSummary:  signal.signalSummary,
      });

      if (didLog) logged.push(signal.symbol);
      else skipped.push(signal.symbol);
    }

    return NextResponse.json({ success: true, logged, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
