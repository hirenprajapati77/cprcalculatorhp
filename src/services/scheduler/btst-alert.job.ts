import { Prisma, type OvernightSignal } from '@prisma/client';
import { TelegramService } from '@/services/alert/telegram.service';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { OvernightService } from '@/services/overnight/overnight.service';
import { RegimeService } from '@/services/overnight/regime.service';
import { MarketService } from '@/services/market.service';
import { SignalService } from '@/services/signal.service';
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
import { getISTDateString, getCompletedHistory } from '@/lib/market-hours';
import { prisma } from '@/lib/db';
import { BtstService } from '@/services/backtest/btst.service';
import { VpaConfirmationService } from '@/services/vpa';
import { calculateCPR } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  );
}

const SEND_ATTEMPTS_LIMIT = 2;
/** Survives cron re-entry in the same process. Lost on PM2 restart (one extra retry at most). */
const sendAttemptCounts = new Map<string, number>();

export function resetBtstAlertSendAttemptsForTests(): void {
  sendAttemptCounts.clear();
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
function computeVpaShadowForJournal(
  stockData: NonNullable<Awaited<ReturnType<typeof MarketService.getStockData>>>,
  direction: 'LONG' | 'SHORT'
) {
  const completed = getCompletedHistory(stockData.history || []);
  // After stripping today's open candle, last bar is yesterday — today's CPR
  // is calculated from that bar (not length-2 = day-before-yesterday).
  if (completed.length < 1) return null;
  const atrPct = getAtrPct(completed, stockData.close);
  const yesterday = completed[completed.length - 1];
  const todayCpr = calculateCPR(
    { high: yesterday.high, low: yesterday.low, close: yesterday.close },
    atrPct
  );
  return VpaConfirmationService.analyzeFromStock(stockData, direction, {
    bc: todayCpr.bc,
    tc: todayCpr.tc,
  });
}

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
        // Alert went out without option data — still journal underlying so alert↔journal
        // parity holds; morning snapshots use stock/index LTP for UNDERLYING legs.
        console.warn(
          `[BtstAlert] ${pick.symbol} alerted without option suggestion; journaling UNDERLYING`
        );
        const signalType = sig.direction === 'SHORT' ? 'STBT' : 'BTST';
        const optionType = sig.direction === 'SHORT' ? 'PE' : 'CE';
        const isIndex = sig.instrumentType === 'INDEX';
        const signalSummary = [
          sig.classification,
          sig.qualityBucket,
          sig.direction,
          isIndex ? 'INDEX' : null,
          'NO_OPTION',
          `REGIME_${regimeTrend}`,
        ]
          .filter(Boolean)
          .join(',');
        const entryCmp = pick.ltp > 0 ? pick.ltp : (sig.entry ?? 0);
        if (entryCmp > 0) {
          const didLog = await TradeJournalService.logSignal({
            signalType,
            symbol: pick.symbol,
            optionContract: TradeJournalService.underlyingOptionContract(optionType),
            optionStrike: 0,
            optionType,
            entryCmp,
            score: sig.overnightScore ?? 0,
            confidence: sig.confidence ?? sig.overnightScore ?? 0,
            signalSummary,
            overnightSignalId: sig.id,
          });
          if (didLog) journaled.push(pick.symbol);
        }
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

      let v2Fields: { scoreV2: number; v2Breakdown: Record<string, unknown> } | Record<string, never> = {};
      if (!isIndex) {
        try {
          const stockData = await MarketService.getStockData(pick.symbol);
          if (stockData) {
            const dir = sig.direction as 'LONG' | 'SHORT';
            const v2Result = BtstService.evaluateOvernightV2(stockData);
            v2Fields = {
              scoreV2: v2Result.finalScore,
              v2Breakdown: {
                hardGates: v2Result.hardGates,
                scoreBreakdown: v2Result.scoreBreakdown,
                rawMetrics: v2Result.rawMetrics,
                classification: v2Result.classification,
                direction: v2Result.direction,
                vpa: computeVpaShadowForJournal(stockData, dir),
              },
            };
          }
        } catch (v2Err) {
          console.warn(`[BtstAlert] V2 shadow scoring failed for ${pick.symbol}:`, v2Err);
        }
      }

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
        ...v2Fields,
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
  const regimeUnknown = regime.reliable === false;
  if (regimeUnknown) {
    console.warn(
      `[BtstAlert] Regime unreliable for ${signalDate} — suppressing BOTH BTST and STBT alerts (fail-closed)`
    );
  }
  const suppressStbt = regime.trend === 'BULL' || regimeUnknown;
  const suppressBtst = regime.trend === 'BEAR' || regimeUnknown;

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
        console.warn(`[BtstAlert] ${sig.symbol} market data unavailable; failing closed (skipping alert)`);
        continue;
      }
      const ext = EntryManagerService.evaluateExtension(stockData, direction);
      if (!ext.eligible) {
        console.warn(`[BtstAlert] ${sig.symbol} ${direction} skipped: ${ext.reason}`);
        continue;
      }

      // Cross-engine conflict gate: block BTST LONG on intraday BREAKDOWN, STBT SHORT on intraday BREAKOUT
      try {
        const signalRes = SignalService.getSignals(stockData);
        const conflict = EntryManagerService.evaluateBreakoutConflict(stockData, direction, signalRes.signals);
        if (!conflict.eligible) {
          console.warn(`[BtstAlert] ${sig.symbol} ${direction} skipped (cross-engine conflict): ${conflict.reason}`);
          continue;
        }
      } catch (scanErr) {
        console.warn(`[BtstAlert] Signal check failed for ${sig.symbol} (proceeding):`, scanErr);
      }


      out.push(sig);
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

  // Prefer first occurrence (discover order already score-sorted). Dedup by
  // symbol+direction so LONG and SHORT for the same ticker can both alert/claim.
  const alertDirection = (s: EnrichedAlertPick): 'LONG' | 'SHORT' =>
    s.sourceSignal.direction === 'SHORT' ? 'SHORT' : 'LONG';
  const alertClaimKey = (s: EnrichedAlertPick): string =>
    `${s.symbol}:${alertDirection(s)}`;

  const seenKeys = new Set<string>();
  const dedupedPayload = alertPayload.filter((s) => {
    const key = alertClaimKey(s);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const newPayload = dedupedPayload.filter((s) => !alreadySentSet.has(alertClaimKey(s)));

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

    // L5: Track attempts per date+claim across cron ticks (module Map, not per-invocation).
    // After SEND_ATTEMPTS_LIMIT failures, keep the claim so 15:10–15:25 does not re-spam.
    const keysToRollback: string[] = [];
    for (const key of claimedSymbols) {
      const attemptKey = `${signalDate}:${key}`;
      const attempts = (sendAttemptCounts.get(attemptKey) ?? 0) + 1;
      sendAttemptCounts.set(attemptKey, attempts);
      if (attempts >= SEND_ATTEMPTS_LIMIT) {
        console.warn(
          `[BtstAlert] ${key} reached max retry attempts (${attempts}/${SEND_ATTEMPTS_LIMIT}) — ` +
          `preserving claim state to prevent 3:20 PM Telegram retry storm (${reason}).`
        );
      } else {
        keysToRollback.push(key);
      }
    }

    if (keysToRollback.length === 0) return;

    try {
      await prisma.btstAlertState.deleteMany({
        where: { date: signalDate, symbol: { in: keysToRollback } },
      });
    } catch (rollbackErr) {
      console.error(
        `[BtstAlert] Failed to roll back claims (${reason}) for ${keysToRollback.join(',')}:`,
        rollbackErr
      );
    }
  };

  try {
    // Claim all new symbol:direction keys before sending (skip any that race-insert first)
    for (const stock of newPayload) {
      const claimKey = alertClaimKey(stock);
      try {
        await prisma.btstAlertState.create({
          data: { date: signalDate, symbol: claimKey, sentAt: new Date() },
        });
        claimedSymbols.push(claimKey);
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          console.log(`[BtstAlert] ${claimKey} already claimed by concurrent run; skipping`);
        } else {
          throw err;
        }
      }
    }

    const claimedPayload = newPayload.filter((s) => claimedSymbols.includes(alertClaimKey(s)));

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
      longs: enrichedLongs.filter((s) => claimedSet.has(alertClaimKey(s))).length,
      shorts: enrichedShorts.filter((s) => claimedSet.has(alertClaimKey(s))).length,
      indexLongs: enrichedIndexLongs.filter((s) => claimedSet.has(alertClaimKey(s))).length,
      indexShorts: enrichedIndexShorts.filter((s) => claimedSet.has(alertClaimKey(s))).length,
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

