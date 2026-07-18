import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/services/alert/telegram.service';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { OvernightService } from '@/services/overnight/overnight.service';
import { RegimeService } from '@/services/overnight/regime.service';
import {
  overnightSignalToBtstUi,
  selectTradableOvernightPicks,
} from '@/services/overnight/overnight-ui-adapter';
import { isBtstDiscoveryOpen, getISTTime, getISTDateString } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { isTradingDay } = getISTTime();

  if (!isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  // Align with canonical discovery window (15:10–15:25 exclusive)
  if (!isBtstDiscoveryOpen()) {
    const { hour, minute } = getISTTime();
    return NextResponse.json({
      message: `Time ${hour}:${String(minute).padStart(2, '0')} is outside alert window (15:10–15:25 IST)`,
    });
  }

  try {
    const signalDate = getISTDateString();
    const regime = await RegimeService.getMarketRegime(signalDate);
    const suppressStbt = regime.trend === 'BULL';

    // Same Advanced Engine pipeline as journal / UI
    const overnightSignals = await OvernightService.discover('BOTH');
    const { longs, shorts } = selectTradableOvernightPicks(overnightSignals, {
      minScore: 85,
      take: 5,
      suppressShort: suppressStbt,
    });

    const enrichedLongs = await Promise.all(
      longs.map(async (sig) => {
        const r = overnightSignalToBtstUi(sig);
        const suggestion = await OptionSuggestionService.suggestOptionForBtst(
          r.symbol,
          r.ltp,
          'LONG',
          r.entry,
          r.sl,
          r.target
        );
        return { ...r, optionSuggestion: suggestion.error ? undefined : suggestion };
      })
    );

    const enrichedShorts = await Promise.all(
      shorts.map(async (sig) => {
        const r = overnightSignalToBtstUi(sig);
        const suggestion = await OptionSuggestionService.suggestOptionForBtst(
          r.symbol,
          r.ltp,
          'SHORT',
          r.entry,
          r.sl,
          r.target
        );
        return { ...r, optionSuggestion: suggestion.error ? undefined : suggestion };
      })
    );

    const alertPayload = [...enrichedLongs, ...enrichedShorts];
    const result = await TelegramService.sendBtstAlert(alertPayload);

    return NextResponse.json({
      sent: result.sent,
      reason: result.reason,
      count: alertPayload.length,
      longs: enrichedLongs.length,
      shorts: enrichedShorts.length,
      engine: 'advanced',
      regime,
      suppressStbt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
