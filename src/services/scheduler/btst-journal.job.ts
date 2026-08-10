import { BtstService } from '@/services/backtest/btst.service';
import { MarketService } from '@/services/market.service';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { OvernightService } from '@/services/overnight/overnight.service';
import { logIndexBtstJournalEntries, logIndexStbtJournalEntries } from '@/services/overnight/index-overnight-persist';
import { RegimeService } from '@/services/overnight/regime.service';
import { EntryManagerService } from '@/services/overnight/entry-manager.service';
import { selectTradableOvernightPicks } from '@/services/overnight/overnight-ui-adapter';
import { VpaConfirmationService } from '@/services/vpa';
import { calculateCPR } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';
import { getCompletedHistory } from '@/lib/market-hours';
import { prisma } from '@/lib/db';
import { STOCK_OVERNIGHT_INSTRUMENT_WHERE } from '@/lib/overnight-instrument-filter';

const MIN_OVERNIGHT_SCORE = 85;

function computeVpaShadowForJournal(
  stockData: NonNullable<Awaited<ReturnType<typeof MarketService.getStockData>>>,
  direction: 'LONG' | 'SHORT'
) {
  const completed = getCompletedHistory(stockData.history || []);
  if (completed.length < 2) return null;
  const atrPct = getAtrPct(completed, stockData.close);
  const yesterday = completed[completed.length - 2];
  const todayCpr = calculateCPR(
    { high: yesterday.high, low: yesterday.low, close: yesterday.close },
    atrPct
  );
  return VpaConfirmationService.analyzeFromStock(stockData, direction, {
    bc: todayCpr.bc,
    tc: todayCpr.tc,
  });
}

export type BtstJournalJobResult = {
  success: boolean;
  signalDate: string;
  source: 'OvernightSignal';
  mode: 'TRADEABLE_READY_PLUS';
  regime: Awaited<ReturnType<typeof RegimeService.getMarketRegime>>;
  suppressStbt: boolean;
  suppressBtst: boolean;
  overnightEnsured: boolean;
  picked: {
    longs: Array<{
      symbol: string;
      overnightScore: number | null;
      qualityBucket: string | null;
      classification: string;
    }>;
    shorts: Array<{
      symbol: string;
      overnightScore: number | null;
      qualityBucket: string | null;
      classification: string;
    }>;
  };
  logged: string[];
  skipped: string[];
  index: {
    picked: Array<{
      symbol: string;
      overnightScore: number | null;
      qualityBucket: string | null;
      classification: string;
    }>;
    logged: string[];
    skipped: string[];
  };
  indexShort: {
    picked: Array<{
      symbol: string;
      overnightScore: number | null;
      qualityBucket: string | null;
      classification: string;
    }>;
    logged: string[];
    skipped: string[];
  };
};

/** Shared BTST/STBT + index BTST journal pipeline for cron route and in-process scheduler. */
export async function runBtstJournalJob(): Promise<BtstJournalJobResult> {
  const signalDate = TradeJournalService.todayISTString();
  const regime = await RegimeService.getMarketRegime(signalDate);
  const suppressStbt = regime.trend === 'BULL';
  const suppressBtst = regime.trend === 'BEAR';

  console.log(`[BtstJournal] Refreshing OvernightSignal for ${signalDate} before journal selection.`);
  await OvernightService.discover('BOTH');
  const overnightEnsured = true;

  const todaySignals = await prisma.overnightSignal.findMany({
    where: { signalDate, ...STOCK_OVERNIGHT_INSTRUMENT_WHERE },
    orderBy: [{ signalTime: 'desc' }, { overnightScore: 'desc' }],
  });
  const { longs: topLongs, shorts: topShorts } = selectTradableOvernightPicks(
    todaySignals,
    {
      minScore: MIN_OVERNIGHT_SCORE,
      take: 2,
      suppressShort: suppressStbt,
      suppressLong: suppressBtst,
    }
  );

  const logged: string[] = [];
  const skipped: string[] = [];

  if (topLongs.length === 0 && topShorts.length === 0) {
    const reason =
      suppressStbt && suppressBtst
        ? 'no_tradable_stock_setups_regime_suppressed_both'
        : suppressStbt
          ? 'no_tradable_stock_setups_stbt_suppressed_bull_regime'
          : suppressBtst
            ? 'no_tradable_stock_setups_btst_suppressed_bear_regime'
            : 'no_tradable_stock_setups';
    console.warn(
      `[BtstJournal] ${reason} for ${signalDate} (regime=${regime.trend}/${regime.volatility}, ensuredScan=${overnightEnsured})`
    );
  }

  // ── Parallel stock processing ────────────────────────────────────────────
  // All picks (longs + shorts) now run concurrently. Previously 3-4 sequential
  // awaits per stock caused ~12s+ total for a 4-pick set; now ~3-4s.
  type SignalWithDir = (typeof topLongs)[number] & { _dir: 'LONG' | 'SHORT' };
  const allPicks: SignalWithDir[] = [
    ...topLongs.map((s) => ({ ...s, _dir: 'LONG' as const })),
    ...topShorts.map((s) => ({ ...s, _dir: 'SHORT' as const })),
  ];

  const processResults = await Promise.allSettled(
    allPicks.map(async (signal) => {
      const dir = signal._dir;
      const signalType = dir === 'LONG' ? 'BTST' : 'STBT';
      const optionSide = dir === 'LONG' ? ('BULLISH' as const) : ('BEARISH' as const);
      const optionType = dir === 'LONG' ? 'CE' : 'PE';
      const defaultSlMul = dir === 'LONG' ? 0.98 : 1.02;
      const defaultTargetMul = dir === 'LONG' ? 1.04 : 0.96;
      const logTag = `${signal.symbol}:${signalType}`;

      const stockData = await MarketService.getStockData(signal.symbol);
      if (!stockData) {
        console.warn(`[BtstJournal] No market data for ${signal.symbol}; skipping ${signalType} log`);
        return { tag: `${signal.symbol}:NO_MARKET_DATA`, didLog: false };
      }

      const ltp = stockData.ltp ?? signal.entry ?? 0;
      const entry = signal.entry ?? ltp;
      const sl = signal.stopLoss ?? ltp * defaultSlMul;
      const target = signal.target ?? ltp * defaultTargetMul;

      if (!ltp || ltp <= 0) {
        console.warn(`[BtstJournal] No LTP for ${signal.symbol}; skipping ${signalType} log`);
        return { tag: logTag, didLog: false };
      }

      const ext = EntryManagerService.evaluateExtension(stockData, dir);
      if (!ext.eligible) {
        console.warn(`[BtstJournal] ${signal.symbol} ${signalType} skipped: ${ext.reason}`);
        return { tag: `${logTag}:EXTENDED`, didLog: false };
      }

      // Option suggestion required — do not journal a fake STOCK/strike-0 row.
      // Morning snapshots call fetchOptionCmp(strike); strike 0 poisons PnL.
      // Alert-time journaling already records picks that had a live option quote;
      // if both paths miss the option, skip rather than invent a stock leg.
      let optionName: string | null = null;
      let optionStrike: number | null = null;
      let optionLtp: number | null = null;

      try {
        const suggestion = await OptionSuggestionService.suggestOption(
          signal.symbol, ltp, optionSide, entry, sl, target, signal.signalDate
        );
        if (!suggestion.error && suggestion.strike && suggestion.ltp) {
          const cleanSym = signal.symbol.split(':')[0].trim();
          optionName =
            suggestion.formattedName?.replace(new RegExp(`^${cleanSym}\\s+`), '') ||
            `${suggestion.strike} ${optionType}`;
          optionStrike = suggestion.strike;
          optionLtp = suggestion.ltp;
        } else {
          console.warn(
            `[BtstJournal] No ${optionType} for ${signal.symbol}: ` +
            (suggestion.error ?? 'missing strike or ltp') +
            ' — skipping journal (no STOCK/0 fallback).'
          );
          return { tag: `${logTag}:NO_OPTION`, didLog: false };
        }
      } catch (optErr) {
        console.warn(
          `[BtstJournal] Option lookup threw for ${signal.symbol}:`,
          optErr,
          '— skipping journal (no STOCK/0 fallback).'
        );
        return { tag: `${logTag}:OPTION_ERROR`, didLog: false };
      }

      let v2Fields: { scoreV2: number; v2Breakdown: Record<string, unknown> } | Record<string, never> = {};
      try {
        if (stockData) {
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
        console.warn(`[BtstJournal] V2 shadow scoring failed for ${signal.symbol}:`, v2Err);
      }

      const signalSummary = [
        signal.classification,
        signal.qualityBucket,
        signal.direction,
        `REGIME_${regime.trend}`,
      ]
        .filter(Boolean)
        .join(',');

      const didLog = await TradeJournalService.logSignal({
        signalType,
        symbol: signal.symbol,
        optionContract: optionName!,
        optionStrike: optionStrike!,
        optionType,
        entryCmp: optionLtp!,
        score: signal.overnightScore ?? 0,
        confidence: signal.confidence ?? 0,
        signalSummary,
        overnightSignalId: signal.id,
        ...v2Fields,
      });

      return { tag: logTag, didLog };
    })
  );

  for (const res of processResults) {
    if (res.status === 'fulfilled') {
      if (res.value.didLog) logged.push(res.value.tag);
      else skipped.push(res.value.tag);
    } else {
      console.error('[BtstJournal] Unexpected processing error for pick:', res.reason);
      skipped.push('UNKNOWN:ERROR');
    }
  }

  const indexJournal = await logIndexBtstJournalEntries({
    signalDate,
    suppressLong: suppressBtst,
    regimeTrend: regime.trend,
  });

  const indexStbtJournal = await logIndexStbtJournalEntries({
    signalDate,
    suppressShort: suppressStbt,
    regimeTrend: regime.trend,
  });

  const anyLogged = logged.length > 0 || indexJournal.logged.length > 0 || indexStbtJournal.logged.length > 0;

  return {
    success: anyLogged,
    signalDate,
    source: 'OvernightSignal',
    mode: 'TRADEABLE_READY_PLUS',
    regime,
    suppressStbt,
    suppressBtst,
    overnightEnsured,
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
    index: {
      picked: indexJournal.picks.map((s) => ({
        symbol: s.symbol,
        overnightScore: s.overnightScore,
        qualityBucket: s.qualityBucket,
        classification: s.classification,
      })),
      logged: indexJournal.logged,
      skipped: indexJournal.skipped,
    },
    indexShort: {
      picked: indexStbtJournal.picks.map((s) => ({
        symbol: s.symbol,
        overnightScore: s.overnightScore,
        qualityBucket: s.qualityBucket,
        classification: s.classification,
      })),
      logged: indexStbtJournal.logged,
      skipped: indexStbtJournal.skipped,
    },
  };
}
