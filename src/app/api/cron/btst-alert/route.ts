import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/services/alert/telegram.service';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { OvernightService } from '@/services/overnight/overnight.service';
import { RegimeService } from '@/services/overnight/regime.service';
import { MarketService } from '@/services/market.service';
import { EntryManagerService } from '@/services/overnight/entry-manager.service';
import {
  overnightSignalToBtstUi,
  selectTradableOvernightPicks,
} from '@/services/overnight/overnight-ui-adapter';
import { isBtstDiscoveryOpen, getISTTime, getISTDateString, BTST_CLOCK } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { prisma } from '@/lib/db';

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  );
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { isTradingDay } = getISTTime();

  if (!isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  // Align with canonical discovery window [DISCOVERY_START, DISCOVERY_END_EXCLUSIVE)
  if (!isBtstDiscoveryOpen()) {
    const { hour, minute } = getISTTime();
    return NextResponse.json({
      message: `Time ${hour}:${String(minute).padStart(2, '0')} is outside alert window (${BTST_CLOCK.discoveryStart}–${BTST_CLOCK.discoveryEnd} IST)`,
    });
  }

  try {
    const signalDate = getISTDateString();
    const regime = await RegimeService.getMarketRegime(signalDate);
    const suppressStbt = regime.trend === 'BULL';
    const suppressBtst = regime.trend === 'BEAR';

    // Same Advanced Engine pipeline as journal / UI
    const overnightSignals = await OvernightService.discover('BOTH');
    const { longs, shorts } = selectTradableOvernightPicks(overnightSignals, {
      minScore: 85,
      take: 5,
      suppressShort: suppressStbt,
      suppressLong: suppressBtst,
    });

    /** Re-check extension gate at alert time (stock may have extended since discover). */
    const filterExtended = async (signals: typeof longs, direction: 'LONG' | 'SHORT') => {
      const out: typeof longs = [];
      for (const sig of signals) {
        const stockData = await MarketService.getStockData(sig.symbol);
        if (!stockData) {
          out.push(sig);
          continue;
        }
        const ext = EntryManagerService.evaluateExtension(stockData, direction);
        if (ext.eligible) out.push(sig);
        else console.warn(`[BtstAlert] ${sig.symbol} ${direction} skipped: ${ext.reason}`);
      }
      return out;
    };

    const filteredLongs = await filterExtended(longs, 'LONG');
    const filteredShorts = await filterExtended(shorts, 'SHORT');

    const enrichedLongs = await Promise.all(
      filteredLongs.map(async (sig) => {
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
      filteredShorts.map(async (sig) => {
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

    let claimedDate = false;
    try {
      await prisma.btstAlertState.create({
        data: { date: signalDate, sentAt: new Date() },
      });
      claimedDate = true;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return NextResponse.json({
          sent: false,
          reason: 'already sent today',
          count: alertPayload.length,
          longs: enrichedLongs.length,
          shorts: enrichedShorts.length,
          engine: 'advanced',
          regime,
          suppressStbt,
          suppressBtst,
        });
      }
      throw err;
    }

    try {
      const result = await TelegramService.sendBtstAlert(alertPayload);

      if (!result.sent) {
        await prisma.btstAlertState.delete({ where: { date: signalDate } });
        return NextResponse.json({
          sent: false,
          reason: result.reason,
          count: alertPayload.length,
          longs: enrichedLongs.length,
          shorts: enrichedShorts.length,
          engine: 'advanced',
          regime,
          suppressStbt,
          suppressBtst,
        });
      }

      return NextResponse.json({
        sent: result.sent,
        reason: result.reason,
        count: alertPayload.length,
        longs: enrichedLongs.length,
        shorts: enrichedShorts.length,
        engine: 'advanced',
        regime,
        suppressStbt,
        suppressBtst,
      });
    } catch (sendError) {
      if (claimedDate) {
        await prisma.btstAlertState.delete({ where: { date: signalDate } }).catch(() => {});
      }
      throw sendError;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
