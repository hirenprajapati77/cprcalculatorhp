import { Prisma } from '@prisma/client';
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
import { getISTDateString } from '@/lib/market-hours';
import { prisma } from '@/lib/db';

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  );
}

export type BtstAlertJobResult = {
  sent: boolean;
  reason?: string | undefined;
  count: number;
  longs: number;
  shorts: number;
  engine: 'advanced';
  regime: Awaited<ReturnType<typeof RegimeService.getMarketRegime>>;
  suppressStbt: boolean;
  suppressBtst: boolean;
};

/** Shared BTST Telegram alert pipeline for cron route and in-process scheduler. */
export async function runBtstAlertJob(): Promise<BtstAlertJobResult> {
  const signalDate = getISTDateString();
  const regime = await RegimeService.getMarketRegime(signalDate);
  const suppressStbt = regime.trend === 'BULL';
  const suppressBtst = regime.trend === 'BEAR';

  const overnightSignals = await OvernightService.discover('BOTH');
  const { longs, shorts } = selectTradableOvernightPicks(overnightSignals, {
    minScore: 85,
    take: 5,
    suppressShort: suppressStbt,
    suppressLong: suppressBtst,
  });

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

  const baseResult = {
    count: alertPayload.length,
    longs: enrichedLongs.length,
    shorts: enrichedShorts.length,
    engine: 'advanced' as const,
    regime,
    suppressStbt,
    suppressBtst,
  };

  let claimedDate = false;
  try {
    await prisma.btstAlertState.create({
      data: { date: signalDate, sentAt: new Date() },
    });
    claimedDate = true;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { sent: false, reason: 'already sent today', ...baseResult };
    }
    throw err;
  }

  try {
    const result = await TelegramService.sendBtstAlert(alertPayload);

    if (!result.sent) {
      await prisma.btstAlertState.delete({ where: { date: signalDate } });
      return { sent: false, reason: result.reason, ...baseResult };
    }

    return { sent: result.sent, reason: result.reason, ...baseResult };
  } catch (sendError) {
    if (claimedDate) {
      await prisma.btstAlertState.delete({ where: { date: signalDate } }).catch(() => {});
    }
    throw sendError;
  }
}
