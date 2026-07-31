import { Prisma, type OvernightSignal } from '@prisma/client';
import { TelegramService } from '@/services/alert/telegram.service';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
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
  /** Symbols journaled at alert time (only present on the success path). */
  logged?: string[];
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
    r.target,
    sig.signalDate
  );
  // sourceSignal carries id/direction/classification for alert-time journaling.
  return { ...r, optionSuggestion: suggestion.error ? undefined : suggestion, sourceSignal: sig };
}

type EnrichedAlertPick = Awaited<ReturnType<typeof enrichBtstPick>>;

/**
 * Journal every alerted pick immediately after the Telegram send succeeds.
 *
 * Guarantees alert ↔ journal parity: the 15:25 btst-journal job re-runs
 * discovery and re-applies the READY gate at its own moment, so a signal that
 * qualified at alert time (15:10–15:25) but faded by 15:25 would otherwise be
 * alerted to the user yet silently missing from the TradeJournal (this is
 * exactly what happened with index BTST). logSignal upserts on
 * symbol+date+signalType, so the later journal job never duplicates these
 * rows and still fills in v2 shadow fields for stocks.
 *
 * Never throws: the alert has already been sent, so journal failures must not
 * roll back claims or fail the job.
 */
async function journalClaimedAlerts(
  claimedPayload: EnrichedAlertPick[],
  regimeTrend: string
): Promise<string[]> {
  const journaled: string[] = [];

  for (const pick of claimedPayload) {
    try {
      const sig = pick.sourceSignal;
      const suggestion = pick.optionSuggestion;

      if (!suggestion?.strike || !suggestion?.ltp) {
        // Alert went out without option data — leave it to the 15:25 journal
        // job, which fetches its own suggestion.
        console.warn(
          `[BtstAlert] ${pick.symbol} alerted without option suggestion; deferring journal to btst-journal job`
        );
        continue;
      }

      const signalType = sig.direction === 'SHORT' ? 'STBT' : 'BTST';
      const optionType = sig.direction === 'SHORT' ? 'PE' : 'CE';
      const isIndex = sig.instrumentType === 'INDEX';

      const cleanSym = pick.symbol.split(':')[0].trim();
      const optionName =
        suggestion.formattedName?.replace(new RegExp(`^${cleanSym}\\s+`), '') ||
        `${suggestion.strike} ${optionType}`;

      // Same summary format as btst-journal.job.ts / index-overnight-persist.ts
      // so analytics and compare joins treat these rows identically.
      const signalSummary = [
        sig.classification,
        sig.qualityBucket,
        sig.direction,
        isIndex ? 'INDEX' : null,
        `REGIME_${regimeTrend}`,
      ]
        .filter(Boolean)
        .join(',');

      const didLog = await TradeJournalService.logSignal({
        signalType,
        symbol: pick.symbol,
        optionContract: optionName,
        optionStrike: suggestion.strike,
        optionType,
        entryCmp: suggestion.ltp,
        score: sig.overnightScore ?? 0,
        confidence: sig.confidence ?? sig.overnightScore ?? 0,
        signalSummary,
        overnightSignalId: sig.id,
      });

      if (didLog) journaled.push(pick.symbol);
    } catch (journalErr) {
      console.error(`[BtstAlert] Alert-time journal failed for ${pick.symbol}:`, journalErr);
    }
  }

  return journaled;
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

  if (alertPayload.length === 0) {
    return {
      sent: false,
      reason: 'no setups',
      count: 0,
      longs: 0,
      shorts: 0,
      indexLongs: 0,
      indexShorts: 0,
      engine: 'advanced' as const,
      regime,
      suppressStbt,
      suppressBtst,
    };
  }

  // ── Per-symbol dedup ──────────────────────────────────────────────────────
  // Filter out any symbol already alerted today. This allows the 15:15 / 15:20
  // buckets to send a follow-up Telegram for genuinely NEW breakout stocks that
  // were not qualifying at the time of the earlier alert.
  const alreadySentToday = await prisma.btstAlertState.findMany({
    where: { date: signalDate },
    select: { symbol: true },
  });
  const alreadySentSet = new Set(alreadySentToday.map((r) => r.symbol));

  // Pre-migration day-level rows were backfilled as symbol='_legacy'. Treat that
  // as a full-day lock so we do not re-blast every ticker on deploy day.
  if (alreadySentSet.has('_legacy')) {
    return {
      sent: false,
      reason: 'already sent today',
      count: 0,
      longs: 0,
      shorts: 0,
      indexLongs: 0,
      indexShorts: 0,
      engine: 'advanced' as const,
      regime,
      suppressStbt,
      suppressBtst,
    };
  }

  // Prefer first occurrence (discover order already score-sorted); drop dups
  // so LONG+SHORT for the same ticker cannot double-claim / double-list.
  const seenSymbols = new Set<string>();
  const dedupedPayload = alertPayload.filter((s) => {
    if (seenSymbols.has(s.symbol)) return false;
    seenSymbols.add(s.symbol);
    return true;
  });

  const newPayload = dedupedPayload.filter((s) => !alreadySentSet.has(s.symbol));

  if (newPayload.length === 0) {
    return {
      sent: false,
      reason: 'already sent today',
      count: 0,
      longs: 0,
      shorts: 0,
      indexLongs: 0,
      indexShorts: 0,
      engine: 'advanced' as const,
      regime,
      suppressStbt,
      suppressBtst,
    };
  }

  const claimedSymbols: string[] = [];

  const rollbackClaims = async (reason: string) => {
    if (claimedSymbols.length === 0) return;
    try {
      await prisma.btstAlertState.deleteMany({
        where: { date: signalDate, symbol: { in: claimedSymbols } },
      });
    } catch (rollbackErr) {
      console.error(
        `[BtstAlert] Failed to roll back claims (${reason}) for ${claimedSymbols.join(',')}:`,
        rollbackErr
      );
    }
  };

  try {
    // Claim all new symbols before sending (skip any that race-insert first)
    for (const stock of newPayload) {
      try {
        await prisma.btstAlertState.create({
          data: { date: signalDate, symbol: stock.symbol, sentAt: new Date() },
        });
        claimedSymbols.push(stock.symbol);
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          console.log(`[BtstAlert] ${stock.symbol} already claimed by concurrent run; skipping`);
        } else {
          throw err;
        }
      }
    }

    const claimedPayload = newPayload.filter((s) => claimedSymbols.includes(s.symbol));

    if (claimedPayload.length === 0) {
      return {
        sent: false,
        reason: 'already sent today',
        count: 0,
        longs: 0,
        shorts: 0,
        indexLongs: 0,
        indexShorts: 0,
        engine: 'advanced' as const,
        regime,
        suppressStbt,
        suppressBtst,
      };
    }

    const claimedSet = new Set(claimedSymbols);
    const resultStats = {
      count: claimedPayload.length,
      longs: enrichedLongs.filter((s) => claimedSet.has(s.symbol)).length,
      shorts: enrichedShorts.filter((s) => claimedSet.has(s.symbol)).length,
      indexLongs: enrichedIndexLongs.filter((s) => claimedSet.has(s.symbol)).length,
      indexShorts: enrichedIndexShorts.filter((s) => claimedSet.has(s.symbol)).length,
      engine: 'advanced' as const,
      regime,
      suppressStbt,
      suppressBtst,
    };

    const result = await TelegramService.sendBtstAlert(claimedPayload);

    if (!result.sent) {
      await rollbackClaims(result.reason ?? 'telegram_not_sent');
      return { sent: false, reason: result.reason, ...resultStats };
    }

    // Alert delivered — journal exactly what the user was told, right now.
    const journaled = await journalClaimedAlerts(claimedPayload, regime.trend);

    return { sent: result.sent, reason: result.reason, ...resultStats, logged: journaled };
  } catch (sendError) {
    await rollbackClaims(sendError instanceof Error ? sendError.message : 'send_exception');
    throw sendError;
  }
}

