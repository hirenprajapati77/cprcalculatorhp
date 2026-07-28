import { Prisma, type OvernightSignal } from '@prisma/client';
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
import { IndexDiscoverService } from '@/services/overnight/index-discover.service';
import {
  persistIndexBtstOvernightSignals,
  selectTradableIndexBtstPicks,
  selectTradableIndexStbtPicks,
} from '@/services/overnight/index-overnight-persist';
import { INDEX_SCORE } from '@/services/overnight/index-ranking.service';
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
  indexLongs: number;
  indexShorts: number;
  engine: 'advanced';
  regime: Awaited<ReturnType<typeof RegimeService.getMarketRegime>>;
  suppressStbt: boolean;
  suppressBtst: boolean;
};

async function buildEnrichedIndexLongs(picks: OvernightSignal[]) {
  return buildEnrichedPicks(picks, 'LONG');
}

async function buildEnrichedIndexShorts(picks: OvernightSignal[]) {
  return buildEnrichedPicks(picks, 'SHORT');
}

async function enrichBtstPick(sig: OvernightSignal, direction: 'LONG' | 'SHORT') {
  const r = overnightSignalToBtstUi(sig);
  const suggestion = await OptionSuggestionService.suggestOptionForBtst(
    r.symbol,
    r.ltp,
    direction,
    r.entry,
    r.sl,
    r.target
  );
  return { ...r, optionSuggestion: suggestion.error ? undefined : suggestion };
}

async function buildEnrichedPicks(picks: OvernightSignal[], direction: 'LONG' | 'SHORT') {
  const settled = await Promise.allSettled(
    picks.map((sig) => enrichBtstPick(sig, direction))
  );
  const enriched: Awaited<ReturnType<typeof enrichBtstPick>>[] = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      enriched.push(result.value);
      return;
    }

    const symbol = picks[index]?.symbol ?? 'UNKNOWN';
    console.warn(`[BtstAlert] ${symbol} ${direction} option enrichment failed; skipping symbol:`, result.reason);
  });

  return enriched;
}

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
        console.warn(`[BtstAlert] ${sig.symbol} market data unavailable; bypassing extension filter`);
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

  // IndexDiscoverService.discover() now returns both LONG and SHORT signals.
  // We explicitly fetch and filter both for the actual BTST/STBT alerts.
  // No EntryManagerService extension filter here either: that gate exists for stock
  // avgVolume/volumeRatio concerns that don't apply to an index (same rationale as
  // logIndexBtstJournalEntries in index-overnight-persist.ts, which this mirrors).
  let enrichedIndexLongs: Awaited<ReturnType<typeof buildEnrichedIndexLongs>> = [];
  let enrichedIndexShorts: Awaited<ReturnType<typeof buildEnrichedIndexShorts>> = [];
  try {
    console.log(`[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for ${signalDate}.`);
    const indexDiscoverResults = await IndexDiscoverService.discover();
    await persistIndexBtstOvernightSignals(indexDiscoverResults);

    const indexSignalsRaw = await prisma.overnightSignal.findMany({
      where: { signalDate, instrumentType: 'INDEX' },
      orderBy: [{ signalTime: 'desc' }, { overnightScore: 'desc' }],
    });

    const indexPicksLong = selectTradableIndexBtstPicks(indexSignalsRaw, {
      minScore: INDEX_SCORE.READY,
      take: 2,
      suppressLong: suppressBtst,
    });

    const indexPicksShort = selectTradableIndexStbtPicks(indexSignalsRaw, {
      minScore: INDEX_SCORE.READY,
      take: 2,
      suppressShort: suppressStbt,
    });

    enrichedIndexLongs = await buildEnrichedIndexLongs(indexPicksLong);
    enrichedIndexShorts = await buildEnrichedIndexShorts(indexPicksShort);
  } catch (indexErr) {
    // Index BTST is additive — never let a Yahoo/DB hiccup on the index leg
    // block the stock BTST/STBT alert, which already worked before this existed.
    console.warn('[BtstAlert] Index BTST discovery failed; sending stock-only alert:', indexErr);
  }

  const enrichedLongs = await buildEnrichedPicks(filteredLongs, 'LONG');
  const enrichedShorts = await buildEnrichedPicks(filteredShorts, 'SHORT');

  const alertPayload = [...enrichedLongs, ...enrichedShorts, ...enrichedIndexLongs, ...enrichedIndexShorts];

  const baseResult = {
    count: alertPayload.length,
    longs: enrichedLongs.length,
    shorts: enrichedShorts.length,
    indexLongs: enrichedIndexLongs.length,
    indexShorts: enrichedIndexShorts.length,
    engine: 'advanced' as const,
    regime,
    suppressStbt,
    suppressBtst,
  };

  if (alertPayload.length === 0) {
    return { sent: false, reason: 'no setups', ...baseResult };
  }

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
